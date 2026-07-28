import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexStatus, RepositoryRecord, WorktreeRecord } from "../shared/contracts";
import { EmptyInbox } from "./components/EmptyInbox";
import { ErrorNotice } from "./components/ErrorNotice";
import { LoadingWorkspace } from "./components/LoadingWorkspace";
import { MissingWorktreeNotice } from "./components/MissingWorktreeNotice";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { ProjectToolbar } from "./components/ProjectToolbar";
import { ReviewOverviewHeader } from "./components/ReviewOverviewHeader";
import { ReviewWorkspace } from "./components/ReviewWorkspace";
import { useReviewActions } from "./hooks/useReviewActions";
import { useReviewModels } from "./hooks/useReviewModels";
import { useReviewProgress } from "./hooks/useReviewProgress";
import { type ErrorState, getErrorMessage } from "./lib/error";
import { defaultWorktreeId, findWorktree, updateWorktree } from "./lib/repositories";

export function App() {
  const [repositories, setRepositories] = useState<RepositoryRecord[]>([]);
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const selectedWorktreeIdRef = useRef<string | null>(null);

  const selectedWorktree = findWorktree(repositories, selectedWorktreeId);
  const canReview = Boolean(
    codexStatus?.installed &&
      codexStatus.authenticated &&
      codexStatus.authMethod === "chatgpt",
  );

  const showError = useCallback((title: string, caught: unknown, retry?: () => void) => {
    setError({ title, detail: getErrorMessage(caught), retry });
  }, []);
  const clearError = useCallback(() => setError(null), []);

  const {
    models,
    selectedModelId,
    setSelectedModelId,
    selectedEffort,
    setSelectedEffort,
    effortOptions,
  } = useReviewModels(canReview);

  const {
    busyProjectIds,
    setBusyProjectIds,
    progressByProject,
    setProgressByProject,
    taskProgressByProject,
  } = useReviewProgress(setRepositories);

  const selectedProgress = selectedWorktreeId
    ? progressByProject[selectedWorktreeId]
    : undefined;
  const isReviewing = selectedWorktreeId ? busyProjectIds.has(selectedWorktreeId) : false;

  const {
    snapshot,
    snapshotLoading,
    approvalPending,
    loadSnapshot,
    runReview,
    cancelReview,
    approveGroup,
    saveFindingNote,
    addFeedback,
    removeFeedback,
  } = useReviewActions({
    selectedProject: selectedWorktree,
    selectedProjectId: selectedWorktreeId,
    selectedProjectIdRef: selectedWorktreeIdRef,
    selectedModelId,
    selectedEffort,
    showError,
    clearError,
    setProjects: setRepositories,
    setBusyProjectIds,
    setProgressByProject,
  });

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const [projectList, status] = await Promise.all([
          window.diffender.projects.refresh(),
          window.diffender.codex.status(),
        ]);
        if (!active) return;
        setRepositories(projectList);
        setCodexStatus(status);
        setSelectedWorktreeId((current) => {
          if (findWorktree(projectList, current)) {
            return current;
          }
          return defaultWorktreeId(projectList);
        });
      } catch (caught) {
        if (active) {
          showError("ワークスペースを開けませんでした", caught, () => {
            window.location.reload();
          });
        }
      } finally {
        if (active) setInitializing(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [showError]);

  useEffect(() => {
    selectedWorktreeIdRef.current = selectedWorktreeId;
  }, [selectedWorktreeId]);

  useEffect(
    () =>
      window.diffender.reviews.onOpenRequested((worktreeId) => {
        setSelectedWorktreeId(worktreeId);
      }),
    [],
  );

  const refreshProjects = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [projectList, status] = await Promise.all([
        window.diffender.projects.refresh(),
        window.diffender.codex.status(),
      ]);
      setRepositories(projectList);
      setCodexStatus(status);
      const current = selectedWorktreeIdRef.current;
      const currentWorktree = findWorktree(projectList, current);
      if (current && currentWorktree) {
        // 削除済み worktree はレビューを読み込まない（専用表示にする）。
        if (!currentWorktree.missing) await loadSnapshot(current);
      } else {
        setSelectedWorktreeId(defaultWorktreeId(projectList));
      }
    } catch (caught) {
      showError("プロジェクトを更新できませんでした", caught, () => {
        void refreshProjects();
      });
    } finally {
      setRefreshing(false);
    }
  }, [loadSnapshot, showError]);

  const addProject = useCallback(async () => {
    setError(null);
    try {
      const result = await window.diffender.projects.add();
      if (!result) return;
      setRepositories(result.repositories);
      setSelectedWorktreeId(result.addedWorktreeId);
    } catch (caught) {
      showError("プロジェクトを追加できませんでした", caught, () => {
        void addProject();
      });
    }
  }, [showError]);

  const removeProject = useCallback(
    async (worktree: WorktreeRecord) => {
      const confirmed = window.confirm(
        `「${worktree.name}」をワークスペースから削除しますか？\nワークツリーのファイル自体は削除されません。`,
      );
      if (!confirmed) return;

      setError(null);
      try {
        const remaining = await window.diffender.projects.remove(worktree.id);
        setRepositories(remaining);
        if (!findWorktree(remaining, selectedWorktreeIdRef.current)) {
          setSelectedWorktreeId(defaultWorktreeId(remaining));
        }
      } catch (caught) {
        showError("プロジェクトをワークスペースから削除できませんでした", caught, () => {
          void removeProject(worktree);
        });
      }
    },
    [showError],
  );

  const updateProject = useCallback((updated: WorktreeRecord) => {
    setRepositories((previous) => updateWorktree(previous, updated.id, () => updated));
  }, []);

  return (
    <div className="app-shell">
      <div className="desk-layout">
        <ProjectSidebar
          codexStatus={codexStatus}
          initializing={initializing}
          onAddProject={() => void addProject()}
          onRefresh={() => void refreshProjects()}
          onRemove={(project) => void removeProject(project)}
          onSelect={(worktreeId) => setSelectedWorktreeId(worktreeId)}
          onWorktreesRegistered={setRepositories}
          progressByProject={progressByProject}
          refreshing={refreshing}
          repositories={repositories}
          selectedWorktreeId={selectedWorktreeId}
        />

        <main className="main-pane">
          {initializing ? (
            <div className="loading-screen">
              <span className="progress-panel__spinner" />
              ワークスペースを準備しています
            </div>
          ) : repositories.length === 0 ? (
            <>
              {error ? (
                <div className="global-error">
                  <ErrorNotice error={error} onDismiss={() => setError(null)} />
                </div>
              ) : null}
              <EmptyInbox onAdd={() => void addProject()} />
            </>
          ) : (
            <>
              {error ? (
                <ErrorNotice error={error} onDismiss={() => setError(null)} />
              ) : null}

              {selectedWorktree ? (
                selectedWorktree.missing ? (
                  <MissingWorktreeNotice
                    onRemove={() => void removeProject(selectedWorktree)}
                    worktree={selectedWorktree}
                  />
                ) : (
                  <>
                    {snapshot ? (
                      <ReviewOverviewHeader
                        snapshot={snapshot}
                        stale={selectedWorktree.reviewStatus === "stale"}
                      />
                    ) : null}

                    <ProjectToolbar
                      canReview={canReview}
                      effortOptions={effortOptions}
                      isReviewing={isReviewing}
                      models={models}
                      onCancel={() => void cancelReview()}
                      onRun={() => void runReview()}
                      project={selectedWorktree}
                      selectedEffort={selectedEffort}
                      selectedModelId={selectedModelId}
                      setSelectedEffort={setSelectedEffort}
                      setSelectedModelId={setSelectedModelId}
                      snapshot={snapshot}
                    />

                    <ReviewWorkspace
                      approvalPending={approvalPending}
                      canReview={canReview}
                      isReviewing={isReviewing}
                      onAddFeedback={addFeedback}
                      onApprove={approveGroup}
                      onCancel={cancelReview}
                      onError={(title, caught) => showError(title, caught)}
                      onProjectUpdated={updateProject}
                      onRemoveFeedback={removeFeedback}
                      onRun={() => void runReview()}
                      onSaveFindingNote={saveFindingNote}
                      project={selectedWorktree}
                      selectedProgress={selectedProgress}
                      snapshot={snapshot}
                      snapshotLoading={snapshotLoading}
                      taskProgress={taskProgressByProject[selectedWorktree.id]}
                    />
                  </>
                )
              ) : (
                <LoadingWorkspace />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
