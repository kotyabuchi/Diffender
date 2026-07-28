import type { ReviewProgressEvent, WorktreeRecord } from "../../shared/contracts";
import { REVIEW_STATUS_LABELS } from "../lib/labels";
import { progressToReviewStatus } from "../lib/review";
import { Icon } from "./Icon";

export function ProjectItem({
  project,
  selected,
  progress,
  disabled,
  onSelect,
  onRemove,
}: {
  project: WorktreeRecord;
  selected: boolean;
  progress?: ReviewProgressEvent;
  disabled: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const status = progress ? progressToReviewStatus(progress.stage) : project.reviewStatus;
  const missing = project.missing === true;

  return (
    <div
      className={`project-item-shell ${selected ? "project-item-shell--selected" : ""} ${
        missing ? "project-item-shell--missing" : ""
      }`}
    >
      <button
        aria-current={selected ? "page" : undefined}
        className="project-item"
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        <span className="project-item__rail" aria-hidden="true" />
        <span className="project-item__topline">
          <span className="project-item__kind">
            {project.isMain ? "メイン" : "worktree"}
          </span>
          <span className="project-item__badges">
            {missing ? (
              <span className="missing-badge" title="作業フォルダーが見つかりません">
                削除済み
              </span>
            ) : (
              <>
                {project.hasChanges ? (
                  <span className="change-badge" title="未コミットの変更あり">
                    変更
                  </span>
                ) : null}
                <span className={`review-status review-status--${status}`}>
                  {REVIEW_STATUS_LABELS[status]}
                </span>
              </>
            )}
          </span>
        </span>
        <span className="project-item__meta">
          <span>
            <Icon name="branch" size={13} />
            {project.branch ?? "ブランチ不明"}
          </span>
        </span>
      </button>
      <button
        aria-label={`${project.isMain ? "メイン" : "worktree"}（${project.branch ?? "ブランチ不明"}）をワークスペースから削除`}
        className="project-item__remove"
        disabled={disabled}
        onClick={onRemove}
        title="ワークスペースから削除"
        type="button"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
