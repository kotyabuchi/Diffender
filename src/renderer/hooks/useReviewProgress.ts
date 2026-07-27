import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type {
  ImplementationProgressEvent,
  RepositoryRecord,
  ReviewProgressEvent,
} from "../../shared/contracts";
import { updateWorktree } from "../lib/repositories";
import { progressToReviewStatus, replaceSetValue } from "../lib/review";

export function useReviewProgress(
  setProjects: Dispatch<SetStateAction<RepositoryRecord[]>>,
) {
  const [busyProjectIds, setBusyProjectIds] = useState<Set<string>>(() => new Set());
  const [progressByProject, setProgressByProject] = useState<
    Record<string, ReviewProgressEvent>
  >({});
  const [taskProgressByProject, setTaskProgressByProject] = useState<
    Record<string, ImplementationProgressEvent>
  >({});

  useEffect(() => {
    return window.diffender.reviews.onProgress((event) => {
      setProgressByProject((previous) => ({
        ...previous,
        [event.projectId]: event,
      }));
      setProjects((previous) =>
        updateWorktree(previous, event.projectId, (worktree) => ({
          ...worktree,
          reviewStatus: progressToReviewStatus(event.stage),
        })),
      );
      setBusyProjectIds((previous) =>
        replaceSetValue(
          previous,
          event.projectId,
          event.stage !== "complete" && event.stage !== "failed",
        ),
      );
    });
  }, [setProjects]);

  useEffect(() => {
    return window.diffender.implementations.onProgress((event) => {
      setTaskProgressByProject((previous) => ({
        ...previous,
        [event.projectId]: event,
      }));
    });
  }, []);

  return {
    busyProjectIds,
    setBusyProjectIds,
    progressByProject,
    setProgressByProject,
    taskProgressByProject,
  };
}
