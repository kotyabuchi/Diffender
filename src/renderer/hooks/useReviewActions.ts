import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  RepositoryRecord,
  ReviewEffort,
  ReviewFeedbackScope,
  ReviewGroup,
  ReviewProgressEvent,
  ReviewRunOptions,
  ReviewSnapshot,
  WorktreeRecord,
} from "../../shared/contracts";
import { updateWorktree } from "../lib/repositories";
import { replaceSetValue } from "../lib/review";

export function useReviewActions({
  selectedProject,
  selectedProjectId,
  selectedProjectIdRef,
  selectedModelId,
  selectedEffort,
  showError,
  clearError,
  setProjects,
  setBusyProjectIds,
  setProgressByProject,
}: {
  selectedProject: WorktreeRecord | null;
  selectedProjectId: string | null;
  selectedProjectIdRef: { current: string | null };
  selectedModelId: string | null;
  selectedEffort: ReviewEffort | null;
  showError: (title: string, caught: unknown, retry?: () => void) => void;
  clearError: () => void;
  setProjects: Dispatch<SetStateAction<RepositoryRecord[]>>;
  setBusyProjectIds: Dispatch<SetStateAction<Set<string>>>;
  setProgressByProject: Dispatch<SetStateAction<Record<string, ReviewProgressEvent>>>;
}) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [approvalPending, setApprovalPending] = useState<string | null>(null);
  const snapshotRequest = useRef(0);

  const loadSnapshot = useCallback(
    async (projectId: string) => {
      const requestId = snapshotRequest.current + 1;
      snapshotRequest.current = requestId;
      setSnapshotLoading(true);
      setSnapshot(null);

      try {
        const current = await window.diffender.reviews.current(projectId);
        if (snapshotRequest.current === requestId) setSnapshot(current);
      } catch (caught) {
        if (snapshotRequest.current === requestId) {
          showError("レビューを読み込めませんでした", caught, () => {
            void loadSnapshot(projectId);
          });
        }
      } finally {
        if (snapshotRequest.current === requestId) setSnapshotLoading(false);
      }
    },
    [showError],
  );

  const selectedMissing = selectedProject?.missing === true;
  useEffect(() => {
    // 削除済み worktree はレビューを読み込まない（呼ぶとパス不在でエラーになる）。
    if (!selectedProjectId || selectedMissing) {
      snapshotRequest.current += 1;
      setSnapshot(null);
      setSnapshotLoading(false);
      return;
    }
    void loadSnapshot(selectedProjectId);
  }, [loadSnapshot, selectedProjectId, selectedMissing]);

  const runReview = useCallback(async () => {
    if (!selectedProject) return;
    const projectId = selectedProject.id;

    clearError();
    setBusyProjectIds((previous) => replaceSetValue(previous, projectId, true));
    setProgressByProject((previous) => ({
      ...previous,
      [projectId]: {
        projectId,
        stage: "queued",
        message: "レビューをキューに追加しました。",
      },
    }));
    setProjects((previous) =>
      updateWorktree(previous, projectId, (worktree) => ({
        ...worktree,
        reviewStatus: "queued",
      })),
    );

    try {
      const options: ReviewRunOptions | undefined =
        selectedModelId || selectedEffort
          ? {
              model: selectedModelId ?? undefined,
              effort: selectedEffort ?? undefined,
            }
          : undefined;
      const review = await window.diffender.reviews.run(projectId, options);
      if (selectedProjectIdRef.current === projectId) setSnapshot(review);
      setProjects((previous) =>
        updateWorktree(previous, projectId, (worktree) => ({
          ...worktree,
          reviewStatus: "complete",
          lastReviewedAt: review.createdAt,
        })),
      );
      try {
        const refreshed = await window.diffender.projects.refresh(projectId);
        setProjects(refreshed);
      } catch {
        // The completed review is already usable; a later toolbar refresh can resync metadata.
      }
    } catch (caught) {
      setProjects((previous) =>
        updateWorktree(previous, projectId, (worktree) => ({
          ...worktree,
          reviewStatus: "failed",
        })),
      );
      showError("AIレビューを完了できませんでした", caught, () => {
        void runReview();
      });
    } finally {
      setBusyProjectIds((previous) => replaceSetValue(previous, projectId, false));
    }
  }, [
    clearError,
    selectedEffort,
    selectedModelId,
    selectedProject,
    selectedProjectIdRef,
    setBusyProjectIds,
    setProgressByProject,
    setProjects,
    showError,
  ]);

  const cancelReview = useCallback(async () => {
    if (!selectedProject) return;
    const projectId = selectedProject.id;

    try {
      await window.diffender.reviews.cancel(projectId);
      setBusyProjectIds((previous) => replaceSetValue(previous, projectId, false));
      setProgressByProject((previous) => {
        const next = { ...previous };
        delete next[projectId];
        return next;
      });
      const refreshed = await window.diffender.projects.refresh(projectId);
      setProjects(refreshed);
    } catch (caught) {
      showError("レビューを中止できませんでした", caught, () => {
        void cancelReview();
      });
    }
  }, [selectedProject, setBusyProjectIds, setProgressByProject, setProjects, showError]);

  const approveGroup = useCallback(
    async (group: ReviewGroup) => {
      if (!selectedProject || !snapshot) return;
      setApprovalPending(group.id);
      clearError();
      try {
        const updated = await window.diffender.reviews.approve(
          selectedProject.id,
          snapshot.id,
          group.id,
          !group.approved,
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("承認状態を保存できませんでした", caught, () => {
          void approveGroup(group);
        });
      } finally {
        setApprovalPending(null);
      }
    },
    [clearError, selectedProject, selectedProjectIdRef, showError, snapshot],
  );

  const saveFindingNote = useCallback(
    async (findingId: string, note: string) => {
      if (!selectedProject || !snapshot) return;
      try {
        const updated = await window.diffender.reviews.saveFindingNote(
          selectedProject.id,
          snapshot.id,
          findingId,
          note,
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("メモを保存できませんでした", caught);
        throw caught;
      }
    },
    [selectedProject, selectedProjectIdRef, showError, snapshot],
  );

  const addFeedback = useCallback(
    async (groupId: string, scope: ReviewFeedbackScope, body: string) => {
      if (!selectedProject || !snapshot) return;
      try {
        const updated = await window.diffender.reviews.addFeedback(
          selectedProject.id,
          snapshot.id,
          groupId,
          { scope, body },
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("フィードバックを保存できませんでした", caught);
        throw caught;
      }
    },
    [selectedProject, selectedProjectIdRef, showError, snapshot],
  );

  const removeFeedback = useCallback(
    async (groupId: string, feedbackId: string) => {
      if (!selectedProject || !snapshot) return;
      try {
        const updated = await window.diffender.reviews.removeFeedback(
          selectedProject.id,
          snapshot.id,
          groupId,
          feedbackId,
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("フィードバックを解除できませんでした", caught);
        throw caught;
      }
    },
    [selectedProject, selectedProjectIdRef, showError, snapshot],
  );

  return {
    snapshot,
    setSnapshot,
    snapshotLoading,
    approvalPending,
    loadSnapshot,
    runReview,
    cancelReview,
    approveGroup,
    saveFindingNote,
    addFeedback,
    removeFeedback,
  };
}
