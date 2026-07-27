import { useMemo } from "react";
import type {
  ProjectRecord,
  ReviewFeedbackScope,
  ReviewGroup,
  ReviewSnapshot,
} from "../../shared/contracts";
import { formatDate } from "../lib/format";
import { Icon } from "./Icon";
import { ReviewGroupSection } from "./ReviewGroupSection";
import { ReviewToc } from "./ReviewToc";

export function ReviewReport({
  project,
  snapshot,
  stale,
  approvalPending,
  onApprove,
  onSaveFindingNote,
  onAddFeedback,
  onRemoveFeedback,
}: {
  project: ProjectRecord;
  snapshot: ReviewSnapshot;
  stale: boolean;
  approvalPending: string | null;
  onApprove: (group: ReviewGroup) => void;
  onSaveFindingNote: (findingId: string, note: string) => Promise<void>;
  onAddFeedback: (
    groupId: string,
    scope: ReviewFeedbackScope,
    body: string,
  ) => Promise<void>;
  onRemoveFeedback: (groupId: string, feedbackId: string) => Promise<void>;
}) {
  const statistics = useMemo(() => {
    let findings = 0;
    let highRisk = 0;
    let approved = 0;

    for (const group of snapshot.groups) {
      findings += group.findings.length;
      if (group.risk === "high" || group.risk === "critical") highRisk += 1;
      if (group.approved) approved += 1;
    }

    return { findings, highRisk, approved };
  }, [snapshot.groups]);

  return (
    <div className="review-layout">
      <ReviewToc groups={snapshot.groups} />
      <div className="review-document">
      {stale ? (
        <div className="stale-banner">
          このレビューの後に差分が更新されています。再レビューで最新状態を確認してください。
        </div>
      ) : null}

      <section className="review-summary" id="review-summary">
        <div className="review-summary__label">
          <span className="eyebrow">AIレビュー要約</span>
          <span className="review-summary__source">
            {snapshot.source === "cache" ? "キャッシュから表示" : "Codexによる分析"}
          </span>
        </div>
        <p className="review-summary__text">{snapshot.summary}</p>
        <dl className="summary-stats">
          <div>
            <dt>変更のまとまり</dt>
            <dd>{snapshot.groups.length}</dd>
          </div>
          <div>
            <dt>確認ポイント</dt>
            <dd>{statistics.findings}</dd>
          </div>
          <div>
            <dt>高リスク以上</dt>
            <dd>{statistics.highRisk}</dd>
          </div>
          <div>
            <dt>承認済み</dt>
            <dd>
              {statistics.approved}
              <small> / {snapshot.groups.length}</small>
            </dd>
          </div>
          <div className="summary-stats__delta">
            <dt>{snapshot.files.length} ファイル</dt>
            <dd>
              <span>+{snapshot.additions}</span>
              <span>−{snapshot.deletions}</span>
            </dd>
          </div>
        </dl>
        <footer className="review-summary__footer">
          <span>レビュー日時 {formatDate(snapshot.createdAt)}</span>
          <span>{project.branch ?? "ブランチ不明"}</span>
        </footer>
      </section>

      <div className="groups-heading">
        <div>
          <span className="eyebrow">変更グループ</span>
          <h2>目的ごとの変更</h2>
        </div>
        <p>ファイル単位ではなく、ひとつの目的を持つ変更として整理しています。</p>
      </div>

      <div className="review-groups">
        {snapshot.groups.map((group, index) => (
          <ReviewGroupSection
            approvalPending={approvalPending === group.id}
            group={group}
            index={index}
            key={group.id}
            onAddFeedback={onAddFeedback}
            onApprove={onApprove}
            onRemoveFeedback={onRemoveFeedback}
            onSaveFindingNote={onSaveFindingNote}
            readOnly={stale}
            sectionId={`review-group-${index + 1}`}
            snapshot={snapshot}
          />
        ))}
        {snapshot.groups.length === 0 ? (
          <section className="quiet-state">
            <span className="quiet-state__seal">
              <Icon name="check" size={26} />
            </span>
            <div>
              <h2>目的としてまとめられる変更はありませんでした</h2>
              <p>差分はありますが、レビュー対象となる変更グループはありません。</p>
            </div>
          </section>
        ) : null}
      </div>
      </div>
    </div>
  );
}
