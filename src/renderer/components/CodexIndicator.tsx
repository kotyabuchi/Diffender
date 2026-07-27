import type { CodexStatus } from "../../shared/contracts";

export function CodexIndicator({ status }: { status: CodexStatus | null }) {
  if (!status) {
    return (
      <div
        className="codex-status codex-status--loading"
        aria-label="Codex の状態を確認中"
      >
        <span className="status-dot" />
        <span>Codex を確認中</span>
      </div>
    );
  }

  const ready =
    status.installed && status.authenticated && status.authMethod === "chatgpt";
  const label = !status.installed
    ? "Codex 未検出"
    : status.authenticated && status.authMethod === "chatgpt"
      ? "ChatGPT で接続"
      : status.authMethod === "api-key"
        ? "APIキーはレビュー非対応"
        : "Codex 要ログイン";

  return (
    <div
      className={`codex-status ${ready ? "codex-status--ready" : "codex-status--attention"}`}
      title={status.detail}
    >
      <span className="status-dot" />
      <span>{label}</span>
    </div>
  );
}
