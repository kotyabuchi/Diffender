import type { CodexStatus } from "../../shared/contracts";
import { CodexIndicator } from "./CodexIndicator";
import { Icon } from "./Icon";

export function Topbar({
  codexStatus,
  refreshing,
  initializing,
  onRefresh,
  onAddProject,
}: {
  codexStatus: CodexStatus | null;
  refreshing: boolean;
  initializing: boolean;
  onRefresh: () => void;
  onAddProject: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          R
        </span>
        <div>
          <strong>Diffender</strong>
          <span>ローカル変更レビュー</span>
        </div>
      </div>
      <div className="topbar__actions">
        <CodexIndicator status={codexStatus} />
        <button
          className="toolbar-button"
          disabled={refreshing || initializing}
          onClick={onRefresh}
          type="button"
        >
          <span className={refreshing ? "is-spinning" : ""}>
            <Icon name="refresh" />
          </span>
          {refreshing ? "更新中" : "更新"}
        </button>
        <button className="primary-button" onClick={onAddProject} type="button">
          <Icon name="add" />
          プロジェクト追加
        </button>
      </div>
    </header>
  );
}
