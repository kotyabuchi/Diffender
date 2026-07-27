import {
  type CodexHandoffProps,
  useCodexHandoff,
} from "../hooks/useCodexHandoff";
import { CodexHandoffActions } from "./CodexHandoffActions";
import { CodexTaskSettings } from "./CodexTaskSettings";
import { Icon } from "./Icon";
import { ImplementationAgentCard } from "./ImplementationAgentCard";
import { ImplementationAgentSelect } from "./ImplementationAgentSelect";

export function CodexHandoff(props: CodexHandoffProps) {
  const {
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
  } = useCodexHandoff(props);
  const { project, stale, taskProgress } = props;

  if (!expanded) {
    return (
      <button
        aria-label="フィードバックを開く"
        className="feedback-launcher"
        onClick={() => setExpanded(true)}
        title="フィードバックを開く"
        type="button"
      >
        <Icon name="message" size={22} />
      </button>
    );
  }

  return (
    <section className="codex-handoff" aria-label="フィードバック">
      <div className="codex-handoff__heading">
        <h2>フィードバック</h2>
        <div className="codex-handoff__heading-actions">
          <ImplementationAgentSelect
            detection={detection}
            disabled={busy !== null || implementationRunning}
            onSelectAgent={(agent) => void selectAgent(agent)}
            project={project}
          />
          <button
            aria-label="フィードバックを閉じる"
            className="icon-button codex-handoff__minimize"
            onClick={() => setExpanded(false)}
            title="フィードバックを閉じる"
            type="button"
          >
            <Icon name="minimize" size={17} />
          </button>
        </div>
      </div>

      <ImplementationAgentCard
        detection={detection}
        linked={linked}
        project={project}
        selectedAgent={selectedAgent}
      />

      {selectedAgent === "codex" ? (
        <CodexTaskSettings
          busy={busy}
          createTask={createTask}
          implementationRunning={implementationRunning}
          includeAll={includeAll}
          linkTask={linkTask}
          linked={linked}
          loadTasks={loadTasks}
          loadingTasks={loadingTasks}
          manualThreadId={manualThreadId}
          project={project}
          setIncludeAll={setIncludeAll}
          setManualThreadId={setManualThreadId}
          tasks={tasks}
          unlinkTask={unlinkTask}
        />
      ) : selectedAgent === "claude" ? (
        <p className="codex-handoff__description">
          Claude Code CLIの直近セッションを、このプロジェクトの作業フォルダで継続します。
          APIキー環境変数は引き継がず、危険な権限スキップも使用しません。
        </p>
      ) : (
        <p className="codex-handoff__description">
          CodexまたはClaude Codeを選ぶと、保存したフィードバックを直接送信できます。
        </p>
      )}

      {stale ? (
        <div className="codex-handoff__stale" role="status">
          <strong>新しい変更があります。</strong>
          このレビューの後に差分が更新されています。再レビューしてから、コピー・送信してください。
        </div>
      ) : null}

      <CodexHandoffActions
        agentAvailable={agentAvailable}
        busy={busy}
        implementationRunning={implementationRunning}
        onCopy={() => void copyFeedback()}
        onSend={() => void sendFeedback()}
        selectedAgent={selectedAgent}
        stale={stale}
      />

      <p
        className={`codex-handoff__message ${
          taskProgress?.status === "failed" ? "is-error" : ""
        }`}
        aria-live="polite"
      >
        {taskProgress?.message ?? message}
      </p>
    </section>
  );
}
