import type {
  CodexStatus,
  RepositoryRecord,
  ReviewProgressEvent,
  WorktreeRecord,
} from "../../shared/contracts";
import { CodexIndicator } from "./CodexIndicator";
import { Icon } from "./Icon";
import { ProjectItem } from "./ProjectItem";
import { WorktreeDetector } from "./WorktreeDetector";

export function ProjectSidebar({
  codexStatus,
  repositories,
  selectedWorktreeId,
  progressByProject,
  refreshing,
  initializing,
  onSelect,
  onRemove,
  onWorktreesRegistered,
  onRefresh,
  onAddProject,
}: {
  codexStatus: CodexStatus | null;
  repositories: RepositoryRecord[];
  selectedWorktreeId: string | null;
  progressByProject: Record<string, ReviewProgressEvent>;
  refreshing: boolean;
  initializing: boolean;
  onSelect: (worktreeId: string) => void;
  onRemove: (worktree: WorktreeRecord) => void;
  onWorktreesRegistered: (repositories: RepositoryRecord[]) => void;
  onRefresh: () => void;
  onAddProject: () => void;
}) {
  const worktreeCount = repositories.reduce(
    (count, repository) => count + repository.worktrees.length,
    0,
  );

  return (
    <aside className="sidebar" aria-label="プロジェクト">
      <div className="sidebar__brand">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            D
          </span>
          <div>
            <strong>Diffender</strong>
            <span>ローカル変更レビュー</span>
          </div>
        </div>
        <CodexIndicator status={codexStatus} />
      </div>
      <div className="sidebar__heading">
        <span>リポジトリ</span>
        <span title={`${worktreeCount}ワークツリー`}>
          {String(repositories.length).padStart(2, "0")}
        </span>
      </div>
      <nav className="project-list" aria-label="登録済みリポジトリとワークツリー">
        {repositories.map((repository) => {
          const worktrees = [...repository.worktrees].sort(
            (left, right) => Number(right.isMain) - Number(left.isMain),
          );
          return (
            <section
              aria-label={`${repository.name}、${worktrees.length}ワークツリー`}
              className="repository-tree"
              key={repository.id}
            >
              <WorktreeDetector
                disabled={initializing}
                onRegistered={onWorktreesRegistered}
                repository={repository}
              />
              <div className="repository-tree__worktrees">
                {worktrees.map((worktree) => (
                  <ProjectItem
                    disabled={initializing}
                    key={worktree.id}
                    onRemove={() => onRemove(worktree)}
                    onSelect={() => onSelect(worktree.id)}
                    progress={progressByProject[worktree.id]}
                    project={worktree}
                    selected={worktree.id === selectedWorktreeId}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        <button
          className="toolbar-button"
          disabled={refreshing || initializing}
          onClick={onRefresh}
          type="button"
        >
          <span className={refreshing ? "is-spinning" : ""}>
            <Icon name="refresh" />
          </span>
          {refreshing ? "更新中" : "更新"}
        </button>
        <button
          className="primary-button"
          disabled={initializing}
          onClick={onAddProject}
          type="button"
        >
          <Icon name="add" />
          プロジェクト追加
        </button>
      </div>
    </aside>
  );
}
