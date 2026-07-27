import type { ProjectRecord, ReviewProgressEvent } from "../../shared/contracts";
import { REVIEW_STATUS_LABELS } from "../lib/labels";
import { progressToReviewStatus } from "../lib/review";
import { Icon } from "./Icon";

export function ProjectItem({
  project,
  selected,
  progress,
  onSelect,
  onRemove,
}: {
  project: ProjectRecord;
  selected: boolean;
  progress?: ReviewProgressEvent;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const status = progress
    ? progressToReviewStatus(progress.stage)
    : project.reviewStatus;

  return (
    <div className={`project-item-shell ${selected ? "project-item-shell--selected" : ""}`}>
      <button
        aria-current={selected ? "page" : undefined}
        className="project-item"
        onClick={onSelect}
        type="button"
      >
        <span className="project-item__rail" aria-hidden="true" />
        <span className="project-item__topline">
          <strong>{project.name}</strong>
          {project.hasChanges ? (
            <span className="change-badge" title="未コミットの変更あり">
              変更
            </span>
          ) : null}
        </span>
        <span className="project-item__meta">
          <span>
            <Icon name="branch" size={13} />
            {project.branch ?? "ブランチ不明"}
          </span>
          <span className={`review-status review-status--${status}`}>
            {REVIEW_STATUS_LABELS[status]}
          </span>
        </span>
      </button>
      <button
        aria-label={`${project.name} を受信箱から削除`}
        className="project-item__remove"
        onClick={onRemove}
        title="受信箱から削除"
        type="button"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
