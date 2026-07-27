import type {
  ImplementationProgressEvent,
  ReviewFeedbackScope,
  ReviewGroup,
  ReviewProgressEvent,
  ReviewSnapshot,
  WorktreeRecord,
} from "../../shared/contracts";
import { CodexHandoff } from "./CodexHandoff";
import { LoadingWorkspace } from "./LoadingWorkspace";
import { NoReviewState } from "./NoReviewState";
import { ReviewProgress } from "./ReviewProgress";
import { ReviewReport } from "./ReviewReport";

export function ReviewWorkspace({
  project,
  snapshot,
  isReviewing,
  snapshotLoading,
  selectedProgress,
  approvalPending,
  canReview,
  taskProgress,
  onCancel,
  onRun,
  onApprove,
  onSaveFindingNote,
  onAddFeedback,
  onRemoveFeedback,
  onProjectUpdated,
  onError,
}: {
  project: WorktreeRecord;
  snapshot: ReviewSnapshot | null;
  isReviewing: boolean;
  snapshotLoading: boolean;
  selectedProgress: ReviewProgressEvent | undefined;
  approvalPending: ReadonlySet<string>;
  canReview: boolean;
  taskProgress?: ImplementationProgressEvent;
  onCancel: () => void;
  onRun: () => void;
  onApprove: (group: ReviewGroup) => void;
  onSaveFindingNote: (findingId: string, note: string) => Promise<void>;
  onAddFeedback: (
    groupId: string,
    scope: ReviewFeedbackScope,
    body: string,
  ) => Promise<void>;
  onRemoveFeedback: (groupId: string, feedbackId: string) => Promise<void>;
  onProjectUpdated: (project: WorktreeRecord) => void;
  onError: (title: string, error: unknown) => void;
}) {
  return (
    <>
      {isReviewing ? (
        <ReviewProgress progress={selectedProgress} onCancel={onCancel} />
      ) : snapshotLoading ? (
        <LoadingWorkspace />
      ) : snapshot ? (
        <ReviewReport
          approvalPending={approvalPending}
          onAddFeedback={onAddFeedback}
          onApprove={onApprove}
          onRemoveFeedback={onRemoveFeedback}
          onSaveFindingNote={onSaveFindingNote}
          project={project}
          snapshot={snapshot}
          stale={project.reviewStatus === "stale"}
        />
      ) : (
        <NoReviewState canReview={canReview} onRun={onRun} project={project} />
      )}
      {snapshot && !isReviewing && !snapshotLoading ? (
        <CodexHandoff
          onError={onError}
          onProjectUpdated={onProjectUpdated}
          project={project}
          snapshot={snapshot}
          stale={project.reviewStatus === "stale"}
          taskProgress={taskProgress}
        />
      ) : null}
    </>
  );
}
