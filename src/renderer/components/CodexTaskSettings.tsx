import type { CodexThreadSummary, WorktreeRecord } from "../../shared/contracts";
import type { CodexHandoffBusy } from "../hooks/useCodexHandoff";
import { formatDate } from "../lib/format";
import { Icon } from "./Icon";

export function CodexTaskSettings({
  project,
  tasks,
  linked,
  loadingTasks,
  busy,
  includeAll,
  manualThreadId,
  implementationRunning,
  loadTasks,
  linkTask,
  createTask,
  unlinkTask,
  setIncludeAll,
  setManualThreadId,
}: {
  project: WorktreeRecord;
  tasks: CodexThreadSummary[];
  linked: CodexThreadSummary | undefined;
  loadingTasks: boolean;
  busy: CodexHandoffBusy;
  includeAll: boolean;
  manualThreadId: string;
  implementationRunning: boolean;
  loadTasks: (all: boolean) => Promise<void>;
  linkTask: (threadId: string) => Promise<void>;
  createTask: () => Promise<void>;
  unlinkTask: () => Promise<void>;
  setIncludeAll: (value: boolean) => void;
  setManualThreadId: (value: string) => void;
}) {
  return (
    <details className="codex-handoff__settings" open={!project.codexThreadId}>
      <summary>Codexタスク設定</summary>
      <div className="codex-handoff__settings-content">
        <div className="codex-handoff__picker">
          <button
            aria-label={loadingTasks ? "タスク一覧を更新中" : "タスク一覧を更新"}
            className="secondary-button codex-handoff__refresh-button"
            disabled={busy !== null || loadingTasks}
            onClick={() => void loadTasks(includeAll)}
            title={loadingTasks ? "更新中…" : "タスク一覧を更新"}
            type="button"
          >
            <Icon name="refresh" size={16} />
          </button>
          <select
            aria-label="Codexタスクを選択"
            disabled={busy !== null || loadingTasks}
            onChange={(event) => void linkTask(event.target.value)}
            value={project.codexThreadId ?? ""}
          >
            <option value="">{loadingTasks ? "読み込み中…" : "タスクを選択"}</option>
            {project.codexThreadId && !linked ? (
              <option value={project.codexThreadId}>
                紐付け済み: {project.codexThreadId.slice(0, 13)}…
              </option>
            ) : null}
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title} — {formatDate(task.updatedAt)}
              </option>
            ))}
          </select>
          <button
            className="secondary-button codex-handoff__new-task-button"
            disabled={busy !== null}
            onClick={() => void createTask()}
            type="button"
          >
            <Icon name="add" size={16} />
            {busy === "create" ? "作成中…" : "新規タスク"}
          </button>
        </div>

        <label className="codex-handoff__scope">
          <input
            checked={includeAll}
            onChange={(event) => {
              const checked = event.target.checked;
              setIncludeAll(checked);
              void loadTasks(checked);
            }}
            type="checkbox"
          />
          別のフォルダで始めた最近のCodexタスクも表示
        </label>

        <details className="codex-handoff__manual">
          <summary>タスクIDを直接入力</summary>
          <div>
            <input
              aria-label="CodexタスクID"
              onChange={(event) => setManualThreadId(event.target.value)}
              placeholder="例: 019f9370-…"
              value={manualThreadId}
            />
            <button
              className="secondary-button"
              disabled={!manualThreadId.trim() || busy !== null}
              onClick={() => void linkTask(manualThreadId)}
              type="button"
            >
              紐付ける
            </button>
          </div>
        </details>

        {project.codexThreadId ? (
          <div className="codex-handoff__linked">
            <div>
              <strong>{linked?.title ?? "紐付け済みのCodexタスク"}</strong>
              <span>{project.codexThreadId}</span>
            </div>
            <button
              className="text-button"
              onClick={() => void window.diffender.codex.openTask(project.codexThreadId!)}
              type="button"
            >
              <Icon name="open" size={15} />
              Codex Appで開く
            </button>
            <button
              className="text-button text-button--danger"
              disabled={busy !== null || implementationRunning}
              onClick={() => void unlinkTask()}
              type="button"
            >
              解除
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}
