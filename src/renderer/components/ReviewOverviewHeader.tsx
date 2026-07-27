import { useMemo } from "react";
import type { ReviewSnapshot } from "../../shared/contracts";
import { getReviewHeadline } from "../lib/format";
import { countReviewHunks } from "../lib/review";

export function ReviewOverviewHeader({
  snapshot,
  stale,
}: {
  snapshot: ReviewSnapshot;
  stale: boolean;
}) {
  const metrics = useMemo(() => {
    const approved = snapshot.groups.filter((group) => group.approved).length;
    return {
      approved,
      hunks: countReviewHunks(snapshot),
      approvalPercentage:
        snapshot.groups.length === 0
          ? 0
          : Math.round((approved / snapshot.groups.length) * 100),
    };
  }, [snapshot]);

  return (
    <header className="review-overview-header">
      <div className="review-overview-header__title">
        <span>
          レビュー概要
          {stale ? <b>要更新</b> : null}
        </span>
        <strong title={snapshot.summary}>{getReviewHeadline(snapshot.summary)}</strong>
      </div>
      <div className="review-overview-header__status">
        <div
          aria-label={`${snapshot.files.length}ファイル、${metrics.hunks}チャンク、追加${snapshot.additions}行、削除${snapshot.deletions}行`}
          className="diff-volume"
        >
          <span>
            <b>{snapshot.files.length}</b> files
          </span>
          <i aria-hidden="true">/</i>
          <span>
            <b>{metrics.hunks}</b> hunks
          </span>
          <strong className="diff-volume__additions">+{snapshot.additions}</strong>
          <strong className="diff-volume__deletions">−{snapshot.deletions}</strong>
        </div>
        <div className="approval-progress">
          <span
            aria-label={`承認済み ${metrics.approved} / ${snapshot.groups.length}`}
            aria-valuemax={snapshot.groups.length}
            aria-valuemin={0}
            aria-valuenow={metrics.approved}
            className="approval-progress__track"
            role="progressbar"
          >
            <span style={{ width: `${metrics.approvalPercentage}%` }} />
          </span>
          <strong>
            承認 <span>{metrics.approved}/{snapshot.groups.length}</span>
          </strong>
        </div>
      </div>
    </header>
  );
}
