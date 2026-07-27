import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexStatus, ProjectRecord } from "../shared/contracts";
import { EmptyInbox } from "./components/EmptyInbox";
import { ErrorNotice } from "./components/ErrorNotice";
import { LoadingWorkspace } from "./components/LoadingWorkspace";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { ProjectToolbar } from "./components/ProjectToolbar";
import { ReviewOverviewHeader } from "./components/ReviewOverviewHeader";
import { ReviewWorkspace } from "./components/ReviewWorkspace";
import { Topbar } from "./components/Topbar";
import { useReviewActions } from "./hooks/useReviewActions";
import { useReviewModels } from "./hooks/useReviewModels";
import { useReviewProgress } from "./hooks/useReviewProgress";
import { type ErrorState, getErrorMessage } from "./lib/error";

export function App() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const selectedProjectIdRef = useRef<string | null>(null);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
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
  } = useReviewProgress(setProjects);

  const selectedProgress = selectedProjectId
    ? progressByProject[selectedProjectId]
    : undefined;
  const isReviewing = selectedProjectId ? busyProjectIds.has(selectedProjectId) : false;

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
        setProjects(projectList);
        setCodexStatus(status);
        setSelectedProjectId((current) => {
          if (current && projectList.some((project) => project.id === current)) {
            return current;
          }
          return projectList[0]?.id ?? null;
        });
      } catch (caught) {
        if (active) {
          showError("受信箱を開けませんでした", caught, () => {
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
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  const refreshProjects = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [projectList, status] = await Promise.all([
        window.diffender.projects.refresh(),
        window.diffender.codex.status(),
      ]);
      setProjects(projectList);
      setCodexStatus(status);
      const current = selectedProjectIdRef.current;
      if (current && projectList.some((project) => project.id === current)) {
        await loadSnapshot(current);
      } else {
        setSelectedProjectId(projectList[0]?.id ?? null);
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
      const project = await window.diffender.projects.add();
      if (!project) return;
      setProjects((previous) => [
        project,
        ...previous.filter((item) => item.id !== project.id),
      ]);
      setSelectedProjectId(project.id);
    } catch (caught) {
      showError("プロジェクトを追加できませんでした", caught, () => {
        void addProject();
      });
    }
  }, [showError]);

  const removeProject = useCallback(
    async (project: ProjectRecord) => {
      const confirmed = window.confirm(
        `「${project.name}」を受信箱から削除しますか？\nプロジェクトのファイル自体は削除されません。`,
      );
      if (!confirmed) return;

      setError(null);
      try {
        await window.diffender.projects.remove(project.id);
        const remaining = projects.filter((item) => item.id !== project.id);
        setProjects(remaining);
        if (selectedProjectIdRef.current === project.id) {
          setSelectedProjectId(remaining[0]?.id ?? null);
        }
      } catch (caught) {
        showError("プロジェクトを受信箱から削除できませんでした", caught, () => {
          void removeProject(project);
        });
      }
    },
    [projects, showError],
  );

  const updateProject = useCallback((updated: ProjectRecord) => {
    setProjects((previous) =>
      previous.map((project) => (project.id === updated.id ? updated : project)),
    );
  }, []);

  return (
    <div className="app-shell">
      <Topbar
        codexStatus={codexStatus}
        initializing={initializing}
        onAddProject={() => void addProject()}
        onRefresh={() => void refreshProjects()}
        refreshing={refreshing}
      />

      {initializing ? (
        <div className="loading-screen">
          <span className="progress-panel__spinner" />
          受信箱を準備しています
        </div>
      ) : projects.length === 0 ? (
        <>
          {error ? (
            <div className="global-error">
              <ErrorNotice error={error} onDismiss={() => setError(null)} />
            </div>
          ) : null}
          <EmptyInbox onAdd={() => void addProject()} />
        </>
      ) : (
        <div className="desk-layout">
          <ProjectSidebar
            onRemove={(project) => void removeProject(project)}
            onSelect={(projectId) => setSelectedProjectId(projectId)}
            progressByProject={progressByProject}
            projects={projects}
            selectedProjectId={selectedProjectId}
          />

          <main className="main-pane">
            {error ? (
              <ErrorNotice error={error} onDismiss={() => setError(null)} />
            ) : null}

            {selectedProject ? (
              <>
                {snapshot ? (
                  <ReviewOverviewHeader
                    snapshot={snapshot}
                    stale={selectedProject.reviewStatus === "stale"}
                  />
                ) : null}

                <ProjectToolbar
                  canReview={canReview}
                  effortOptions={effortOptions}
                  isReviewing={isReviewing}
                  models={models}
                  onCancel={() => void cancelReview()}
                  onRun={() => void runReview()}
                  project={selectedProject}
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
                  project={selectedProject}
                  selectedProgress={selectedProgress}
                  snapshot={snapshot}
                  snapshotLoading={snapshotLoading}
                  taskProgress={taskProgressByProject[selectedProject.id]}
                />
              </>
            ) : (
              <LoadingWorkspace />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
