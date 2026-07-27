import type {
  CodexThreadSummary,
  ImplementationAgent,
  ImplementationAgentDetection,
  ProjectRecord,
} from "../../shared/contracts";
import { implementationAgentLabel } from "../lib/review";

export function ImplementationAgentCard({
  selectedAgent,
  detection,
  project,
  linked,
}: {
  selectedAgent: ImplementationAgent | null;
  detection: ImplementationAgentDetection | null;
  project: ProjectRecord;
  linked: CodexThreadSummary | undefined;
}) {
  return (
    <div
      className={`implementation-agent implementation-agent--${
        selectedAgent ?? "unknown"
      }`}
      title={detection?.reasons.join("\n")}
    >
      <span className="implementation-agent__mark" aria-hidden="true">
        {selectedAgent === "codex" ? "CX" : selectedAgent === "claude" ? "CL" : "?"}
      </span>
      <div>
        <strong>
          {selectedAgent ? implementationAgentLabel(selectedAgent) : "実装先を選択"}
        </strong>
        <span>
          {selectedAgent === "codex"
            ? project.codexThreadId
              ? (linked?.title ?? "Codexタスク紐付け済み")
              : "送信前にCodexタスクを設定"
            : selectedAgent === "claude"
              ? detection?.claudeInstalled
                ? "このプロジェクトの直近セッションへ送信"
                : "Claude Code CLIが見つかりません"
              : "候補を判別できませんでした"}
        </span>
      </div>
    </div>
  );
}
