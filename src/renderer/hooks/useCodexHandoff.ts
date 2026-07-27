import { useCallback, useEffect, useState } from "react";
import type {
  CodexThreadSummary,
  ImplementationAgent,
  ImplementationAgentDetection,
  ImplementationProgressEvent,
  ReviewSnapshot,
  WorktreeRecord,
} from "../../shared/contracts";
import { implementationAgentLabel } from "../lib/review";

export type CodexHandoffBusy =
  | "detect"
  | "create"
  | "link"
  | "copy"
  | "send"
  | "unlink"
  | null;

export interface CodexHandoffProps {
  project: WorktreeRecord;
  snapshot: ReviewSnapshot;
  stale: boolean;
  taskProgress?: ImplementationProgressEvent;
  onProjectUpdated: (project: WorktreeRecord) => void;
  onError: (title: string, error: unknown) => void;
}

export function useCodexHandoff({
  project,
  snapshot,
  stale,
  taskProgress,
  onProjectUpdated,
  onError,
}: CodexHandoffProps) {
  const [tasks, setTasks] = useState<CodexThreadSummary[]>([]);
  const [includeAll, setIncludeAll] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [busy, setBusy] = useState<
    "detect" | "create" | "link" | "copy" | "send" | "unlink" | null
  >("detect");
  const [manualThreadId, setManualThreadId] = useState("");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [detection, setDetection] = useState<ImplementationAgentDetection | null>(null);

  const loadTasks = useCallback(
    async (all: boolean) => {
      setLoadingTasks(true);
      setMessage("");
      try {
        setTasks(await window.diffender.codex.tasks(project.id, all));
      } catch (caught) {
        onError("Codexタスクを読み込めませんでした", caught);
      } finally {
        setLoadingTasks(false);
      }
    },
    [onError, project.id],
  );

  useEffect(() => {
    let active = true;
    setTasks([]);
    setIncludeAll(false);
    setManualThreadId("");
    setMessage("");
    setExpanded(false);
    setDetection(null);
    setBusy("detect");
    void window.diffender.implementations
      .detect(project.id)
      .then((result) => {
        if (!active) return;
        setDetection(result);
        if (result.selected === "codex") void loadTasks(false);
      })
      .catch((caught) => {
        if (active) onError("実装エージェントを判別できませんでした", caught);
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [loadTasks, onError, project.id]);

  const selectAgent = useCallback(
    async (agent: ImplementationAgent | null) => {
      setBusy("detect");
      setMessage("");
      try {
        const updated = await window.diffender.implementations.select(project.id, agent);
        onProjectUpdated(updated);
        const result = await window.diffender.implementations.detect(project.id);
        setDetection(result);
        if (result.selected === "codex") await loadTasks(includeAll);
        setMessage(
          agent
            ? `実装先を${implementationAgentLabel(agent)}に設定しました。`
            : "実装先を自動判定に戻しました。",
        );
      } catch (caught) {
        onError("実装エージェントを変更できませんでした", caught);
      } finally {
        setBusy(null);
      }
    },
    [includeAll, loadTasks, onError, onProjectUpdated, project.id],
  );

  const linkTask = useCallback(
    async (threadId: string) => {
      if (!threadId) return;
      setBusy("link");
      setMessage("");
      try {
        const result = await window.diffender.codex.linkTask(project.id, threadId.trim());
        const updated = await window.diffender.implementations.select(
          project.id,
          "codex",
        );
        onProjectUpdated(updated);
        setDetection(await window.diffender.implementations.detect(project.id));
        setTasks((previous) => [
          result.thread,
          ...previous.filter((thread) => thread.id !== result.thread.id),
        ]);
        setManualThreadId("");
        setMessage("Codexタスクを紐付けました。");
      } catch (caught) {
        onError("Codexタスクを紐付けできませんでした", caught);
      } finally {
        setBusy(null);
      }
    },
    [onError, onProjectUpdated, project.id],
  );

  const createTask = useCallback(async () => {
    setBusy("create");
    setMessage("");
    try {
      const result = await window.diffender.codex.createTask(project.id);
      const updated = await window.diffender.implementations.select(project.id, "codex");
      onProjectUpdated(updated);
      setDetection(await window.diffender.implementations.detect(project.id));
      setTasks((previous) => [
        result.thread,
        ...previous.filter((thread) => thread.id !== result.thread.id),
      ]);
      setMessage("このプロジェクト用のCodexタスクを作成しました。");
    } catch (caught) {
      onError("Codexタスクを作成できませんでした", caught);
    } finally {
      setBusy(null);
    }
  }, [onError, onProjectUpdated, project.id]);

  const unlinkTask = useCallback(async () => {
    setBusy("unlink");
    try {
      onProjectUpdated(await window.diffender.codex.unlinkTask(project.id));
      setMessage("Codexタスクの紐付けを解除しました。");
    } catch (caught) {
      onError("紐付けを解除できませんでした", caught);
    } finally {
      setBusy(null);
    }
  }, [onError, onProjectUpdated, project.id]);

  const copyFeedback = useCallback(async () => {
    if (stale) return;
    setBusy("copy");
    try {
      await window.diffender.codex.copyFeedback(project.id, snapshot.id);
      setMessage("フィードバックをクリップボードにコピーしました。");
    } catch (caught) {
      onError("フィードバックをコピーできませんでした", caught);
    } finally {
      setBusy(null);
    }
  }, [onError, project.id, snapshot.id, stale]);

  const sendFeedback = useCallback(async () => {
    if (stale) return;
    const agent = detection?.selected;
    if (!agent) return;
    const destination =
      agent === "codex"
        ? "紐付けたCodexタスク"
        : "このプロジェクトのClaude Code直近セッション";
    const confirmed = window.confirm(
      `保存したフィードバックを${destination}へ送り、修正を開始しますか？\n対象プロジェクト内のファイルが変更される可能性があります。`,
    );
    if (!confirmed) return;
    setBusy("send");
    setMessage("");
    try {
      await window.diffender.implementations.sendFeedback(project.id, snapshot.id);
      setMessage(`${implementationAgentLabel(agent)}へフィードバックを送信しました。`);
    } catch (caught) {
      onError(`${implementationAgentLabel(agent)}へ送信できませんでした`, caught);
    } finally {
      setBusy(null);
    }
  }, [detection?.selected, onError, project.id, snapshot.id, stale]);

  const linked = project.codexThreadId
    ? tasks.find((task) => task.id === project.codexThreadId)
    : undefined;
  const implementationRunning = taskProgress?.status === "started";
  const selectedAgent = detection?.selected ?? null;
  const agentAvailable =
    selectedAgent === "codex"
      ? Boolean(detection?.codexInstalled && project.codexThreadId)
      : selectedAgent === "claude"
        ? Boolean(detection?.claudeInstalled)
        : false;

  return {
    tasks,
    includeAll,
    loadingTasks,
    busy,
    manualThreadId,
    message,
    expanded,
    detection,
    setExpanded,
    setIncludeAll,
    setManualThreadId,
    loadTasks,
    selectAgent,
    linkTask,
    createTask,
    unlinkTask,
    copyFeedback,
    sendFeedback,
    linked,
    implementationRunning,
    selectedAgent,
    agentAvailable,
  };
}
