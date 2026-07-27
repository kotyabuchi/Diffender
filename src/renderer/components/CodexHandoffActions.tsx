import type { ImplementationAgent } from "../../shared/contracts";
import type { CodexHandoffBusy } from "../hooks/useCodexHandoff";
import { implementationAgentLabel } from "../lib/review";
import { Icon } from "./Icon";

export function CodexHandoffActions({
  stale,
  busy,
  agentAvailable,
  implementationRunning,
  selectedAgent,
  onCopy,
  onSend,
}: {
  stale: boolean;
  busy: CodexHandoffBusy;
  agentAvailable: boolean;
  implementationRunning: boolean;
  selectedAgent: ImplementationAgent | null;
  onCopy: () => void;
  onSend: () => void;
}) {
  return (
    <div className="codex-handoff__actions">
      <button
        className="secondary-button"
        disabled={stale || busy !== null}
        onClick={onCopy}
        type="button"
      >
        {busy === "copy" ? "生成中…" : "クリップボードにコピー"}
      </button>
      <button
        className="primary-button"
        disabled={stale || !agentAvailable || busy !== null || implementationRunning}
        onClick={onSend}
        type="button"
      >
        <Icon name="spark" size={16} />
        {implementationRunning
          ? `${selectedAgent ? implementationAgentLabel(selectedAgent) : "AI"}が修正中`
          : busy === "send"
            ? "送信中…"
            : "フィードバックを送る"}
      </button>
    </div>
  );
}
