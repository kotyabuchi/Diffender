import type { RepositoryRecord, WorktreeRecord } from "../../shared/contracts";

export function findWorktree(
  repositories: RepositoryRecord[],
  worktreeId: string | null,
): WorktreeRecord | null {
  if (!worktreeId) return null;
  for (const repository of repositories) {
    const worktree = repository.worktrees.find(
      (candidate) => candidate.id === worktreeId,
    );
    if (worktree) return worktree;
  }
  return null;
}

export function defaultWorktreeId(repositories: RepositoryRecord[]): string | null {
  const firstRepository = repositories[0];
  if (!firstRepository) return null;
  return (
    firstRepository.worktrees.find((worktree) => worktree.isMain)?.id ??
    firstRepository.worktrees[0]?.id ??
    null
  );
}

export function updateWorktree(
  repositories: RepositoryRecord[],
  worktreeId: string,
  update: (worktree: WorktreeRecord) => WorktreeRecord,
): RepositoryRecord[] {
  return repositories.map((repository) => ({
    ...repository,
    worktrees: repository.worktrees.map((worktree) =>
      worktree.id === worktreeId ? update(worktree) : worktree,
    ),
  }));
}
