import { useCallback, useMemo } from "react";
import type {
  ReviewFeedbackScope,
  ReviewGroup,
  ReviewSnapshot,
} from "../../shared/contracts";
import { composeSuggestionFeedbackBody, feedbackScopesMatch } from "../lib/review";
import { FindingNote } from "./FindingNote";
import { Icon } from "./Icon";
import { FeedbackCard, FeedbackComposer, PatchView } from "./PatchView";
import { RiskBadge } from "./RiskBadge";
import { SuggestionFeedbackButton } from "./SuggestionFeedbackButton";

export function ReviewGroupSection({
  group,
  index,
  snapshot,
  approvalPending,
  readOnly,
  sectionId,
  onApprove,
  onSaveFindingNote,
  onAddFeedback,
  onRemoveFeedback,
}: {
  group: ReviewGroup;
  index: number;
  snapshot: ReviewSnapshot;
  approvalPending: boolean;
  readOnly: boolean;
  sectionId: string;
  onApprove: (group: ReviewGroup) => void;
  onSaveFindingNote: (findingId: string, note: string) => Promise<void>;
  onAddFeedback: (
    groupId: string,
    scope: ReviewFeedbackScope,
    body: string,
  ) => Promise<void>;
  onRemoveFeedback: (groupId: string, feedbackId: string) => Promise<void>;
}) {
  const filesByPath = useMemo(
    () => new Map(snapshot.files.map((file) => [file.path, file])),
    [snapshot.files],
  );
  const groupFiles = useMemo(
    () =>
      group.filePaths.flatMap((path) => {
        const file = filesByPath.get(path);
        return file ? [file] : [];
      }),
    [filesByPath, group.filePaths],
  );
  const { groupFeedback, lineFeedbackByFile } = useMemo(() => {
    const wholeGroup = [] as NonNullable<ReviewGroup["feedback"]>;
    const byFile = new Map<string, NonNullable<ReviewGroup["feedback"]>>();
    for (const item of group.feedback ?? []) {
      if (item.scope.type === "group") {
        wholeGroup.push(item);
        continue;
      }
      const fileFeedback = byFile.get(item.scope.file) ?? [];
      fileFeedback.push(item);
      byFile.set(item.scope.file, fileFeedback);
    }
    return { groupFeedback: wholeGroup, lineFeedbackByFile: byFile };
  }, [group.feedback]);
  const addGroupFeedback = useCallback(
    (scope: ReviewFeedbackScope, body: string) => onAddFeedback(group.id, scope, body),
    [group.id, onAddFeedback],
  );
  const addWholeGroupFeedback = useCallback(
    (body: string) => addGroupFeedback({ type: "group" }, body),
    [addGroupFeedback],
  );

  return (
    <article className={`review-group review-group--${group.risk}`} id={sectionId}>
      <header className="review-group__header">
        <div className="review-group__ordinal" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="review-group__title">
          <div className="review-group__badges">
            <span className="category-label">{group.category}</span>
            <RiskBadge risk={group.risk} />
          </div>
          <h2>{group.title}</h2>
          <p>{group.intent}</p>
        </div>
        <button
          aria-pressed={group.approved}
          className={`approval-button ${group.approved ? "approval-button--approved" : ""}`}
          disabled={approvalPending || readOnly}
          onClick={() => onApprove(group)}
          type="button"
        >
          <span className="approval-button__box">
            {group.approved ? <Icon name="check" size={14} /> : null}
          </span>
          {approvalPending ? "保存中…" : group.approved ? "承認済み" : "この変更を承認"}
        </button>
      </header>

      <div className="review-group__facts">
        <span>{group.filePaths.length} ファイル</span>
        <span>{group.findings.length} 件のAI指摘</span>
        <span>{(group.feedback ?? []).length} 件のフィードバック</span>
      </div>

      {group.findings.length > 0 ? (
        <section className="findings" aria-label={`${group.title} のAI指摘`}>
          <div className="section-rule">
            <span>AIレビューコメント</span>
            <span>{String(group.findings.length).padStart(2, "0")}</span>
          </div>
          {group.findings.map((finding) => {
            const feedbackScope: ReviewFeedbackScope =
              finding.line && group.filePaths.includes(finding.file)
                ? {
                    type: "lines",
                    file: finding.file,
                    side: "new",
                    startLine: finding.line,
                    endLine: finding.line,
                  }
                : { type: "group" };
            const suggestionBody = composeSuggestionFeedbackBody(finding);
            const suggestionFeedback = (group.feedback ?? []).find(
              (feedback) =>
                feedback.body === suggestionBody &&
                feedbackScopesMatch(feedback.scope, feedbackScope),
            );

            return (
              <article
                className={`finding finding--${finding.severity}`}
                key={finding.id}
              >
                <div className="finding__location">
                  <RiskBadge risk={finding.severity} />
                  <span title={finding.file}>
                    {finding.file}
                    {finding.line ? `:${finding.line}` : ""}
                  </span>
                </div>
                <h3>{finding.title}</h3>
                <p>{finding.reason}</p>
                <div className="finding__suggestion">
                  <div className="finding__suggestion-header">
                    <span>提案</span>
                    <SuggestionFeedbackButton
                      disabled={readOnly}
                      feedbackId={suggestionFeedback?.id}
                      onAdd={() => addGroupFeedback(feedbackScope, suggestionBody)}
                      onRemove={(feedbackId) => onRemoveFeedback(group.id, feedbackId)}
                    />
                  </div>
                  <p>{finding.suggestion}</p>
                </div>
                <FindingNote
                  initialValue={finding.reviewerNote ?? ""}
                  onSave={(note) => onSaveFindingNote(finding.id, note)}
                  readOnly={readOnly}
                />
              </article>
            );
          })}
        </section>
      ) : (
        <div className="no-findings">
          <Icon name="check" size={16} />
          このまとまりにAIからの指摘はありません
        </div>
      )}

      <section
        className="group-feedback"
        aria-label={`${group.title} 全体へのフィードバック`}
      >
        <div className="section-rule">
          <span>この目的全体へのフィードバック</span>
          <span>{String(groupFeedback.length).padStart(2, "0")}</span>
        </div>
        {groupFeedback.map((item) => (
          <FeedbackCard feedback={item} key={item.id} targetLabel="目的全体" />
        ))}
        {readOnly ? (
          groupFeedback.length === 0 ? (
            <p className="muted-message">
              新しい変更があるため、フィードバックの追加は一時停止中です。再レビューしてください。
            </p>
          ) : null
        ) : (
          <FeedbackComposer onSubmit={addWholeGroupFeedback} targetLabel="この目的全体" />
        )}
      </section>

      <section className="file-changes" aria-label={`${group.title} のファイル差分`}>
        <div className="section-rule">
          <span>変更内容</span>
          <span>{String(groupFiles.length).padStart(2, "0")}</span>
        </div>
        {groupFiles.map((file, fileIndex) => {
          const fileFeedback = lineFeedbackByFile.get(file.path) ?? [];
          return (
            <PatchView
              defaultOpen={
                fileFeedback.length > 0 ||
                (fileIndex === 0 && (group.risk === "critical" || group.risk === "high"))
              }
              feedback={fileFeedback}
              file={file}
              key={file.path}
              onAddFeedback={addGroupFeedback}
              readOnly={readOnly}
            />
          );
        })}
        {groupFiles.length === 0 ? (
          <p className="muted-message">この変更に対応する差分を取得できませんでした。</p>
        ) : null}
      </section>
    </article>
  );
}
