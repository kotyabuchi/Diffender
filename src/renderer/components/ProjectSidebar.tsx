import type {
  RepositoryRecord,
  ReviewProgressEvent,
  WorktreeRecord,
} from "../../shared/contracts";
import { ProjectItem } from "./ProjectItem";
import { WorktreeDetector } from "./WorktreeDetector";

export function ProjectSidebar({
  repositories,
  selectedWorktreeId,
  progressByProject,
  onSelect,
  onRemove,
  onWorktreesRegistered,
}: {
  repositories: RepositoryRecord[];
  selectedWorktreeId: string | null;
  progressByProject: Record<string, ReviewProgressEvent>;
  onSelect: (worktreeId: string) => void;
  onRemove: (worktree: WorktreeRecord) => void;
  onWorktreesRegistered: (repositories: RepositoryRecord[]) => void;
}) {
  const worktreeCount = repositories.reduce(
    (count, repository) => count + repository.worktrees.length,
    0,
  );

  return (
    <aside className="sidebar" aria-label="リポジトリ">
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
                onRegistered={onWorktreesRegistered}
                repository={repository}
              />
              <div className="repository-tree__worktrees">
                {worktrees.map((worktree) => (
                  <ProjectItem
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
    </aside>
  );
}
