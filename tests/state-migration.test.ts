import { describe, expect, it, vi } from "vitest";
import {
  type AppState,
  markMissingWorktrees,
  migrateStateToV2,
  reconcileWorktrees,
  reviewCacheKey,
} from "../src/main/review-service";
import type { ReviewSnapshot, WorktreeRecord } from "../src/shared/contracts";

function legacyProject(
  id: string,
  rootPath: string,
  name: string,
): Record<string, unknown> {
  return {
    id,
    name,
    rootPath,
    codexThreadId: null,
    implementationAgent: null,
    branch: "main",
    headSha: "abc",
    isWorktree: false,
    hasChanges: true,
    reviewStatus: "complete",
    lastReviewedAt: "2026-07-25T00:00:00.000Z",
  };
}

function worktree(
  id: string,
  rootPath: string,
  repositoryId: string,
  extra: Partial<WorktreeRecord> = {},
): WorktreeRecord {
  return {
    id,
    repositoryId,
    name: id,
    rootPath,
    codexThreadId: null,
    implementationAgent: null,
    branch: "main",
    headSha: "abc",
    isMain: false,
    hasChanges: false,
    reviewStatus: "idle",
    lastReviewedAt: null,
    ...extra,
  };
}

function snapshot(projectId: string): ReviewSnapshot {
  return {
    id: `review-${projectId}`,
    projectId,
    createdAt: "2026-07-25T00:00:00.000Z",
    diffHash: `diff-${projectId}`,
    summary: "レビュー",
    files: [],
    groups: [],
    additions: 0,
    deletions: 0,
    source: "codex",
  };
}

describe("migrateStateToV2", () => {
  it("groups worktrees by repository key, keeps ids and puts the main worktree first", async () => {
    const main = legacyProject(
      "main-worktree",
      String.raw`C:\Development\Sample`,
      "Sample",
    );
    const linked = legacyProject(
      "linked-worktree",
      String.raw`C:\Development\Sample-feature`,
      "Sample-feature",
    );
    const mainSnapshot = snapshot("main-worktree");
    const raw = {
      version: 1,
      projects: [linked, main],
      snapshots: {
        "main-worktree": {
          [reviewCacheKey(mainSnapshot.diffHash)]: mainSnapshot,
        },
      },
      approvals: { fingerprint: true },
    };
    const repositoryKey = String.raw`c:\development\sample\.git`;

    const migrated = await migrateStateToV2(raw, async (rootPath) => ({
      status: "resolved",
      repositoryKey,
      isMain: rootPath === main.rootPath,
    }));

    expect(migrated.repositories).toHaveLength(1);
    expect(migrated.repositories[0]).toMatchObject({
      name: "Sample",
      repositoryKey,
    });
    expect(
      migrated.repositories[0]?.worktrees.map((entry) => ({
        id: entry.id,
        isMain: entry.isMain,
        tentative: entry.tentative,
      })),
    ).toEqual([
      { id: "main-worktree", isMain: true, tentative: undefined },
      { id: "linked-worktree", isMain: false, tentative: undefined },
    ]);
    expect(migrated.snapshots).toBe(raw.snapshots);
    expect(migrated.approvals).toBe(raw.approvals);
    expect(migrated.snapshots["main-worktree"]).toHaveProperty(
      reviewCacheKey(mainSnapshot.diffHash),
    );
  });

  it("settles a missing path as a standalone repository without tentative or data loss", async () => {
    const missing = legacyProject(
      "missing-worktree",
      String.raw`C:\Missing\Sample`,
      "Sample",
    );
    const missingSnapshot = snapshot("missing-worktree");
    const raw = {
      version: 1,
      projects: [missing],
      snapshots: {
        "missing-worktree": {
          [reviewCacheKey(missingSnapshot.diffHash)]: missingSnapshot,
        },
      },
      approvals: { preserved: false },
    };

    const migrated = await migrateStateToV2(raw, async () => ({ status: "missing" }));

    expect(migrated.repositories).toHaveLength(1);
    expect(migrated.repositories[0]?.worktrees).toMatchObject([
      { id: "missing-worktree", isMain: true },
    ]);
    expect(migrated.repositories[0]?.worktrees[0]?.tentative).toBeUndefined();
    expect(migrated.repositories[0]?.repositoryKey).toBe(String.raw`c:\missing\sample`);
    expect(migrated.snapshots).toBe(raw.snapshots);
    expect(migrated.approvals).toBe(raw.approvals);
  });

  it("marks an unexpected resolution error as a tentative standalone repository", async () => {
    const raw = {
      version: 1,
      projects: [
        legacyProject("flaky-worktree", String.raw`C:\Development\Sample`, "Sample"),
      ],
      snapshots: {},
      approvals: {},
    };

    const migrated = await migrateStateToV2(raw, async () => ({ status: "error" }));

    expect(migrated.repositories).toHaveLength(1);
    expect(migrated.repositories[0]?.worktrees[0]?.tentative).toBe(true);
    expect(migrated.repositories[0]?.repositoryKey).toBe(
      String.raw`c:\development\sample`,
    );
  });

  it("returns an already valid v2 state unchanged", async () => {
    const state: AppState = {
      version: 2,
      repositories: [
        {
          id: "repository-1",
          name: "Sample",
          repositoryKey: String.raw`c:\development\sample\.git`,
          worktrees: [
            worktree("main-worktree", String.raw`C:\Development\Sample`, "repository-1", {
              isMain: true,
            }),
          ],
        },
      ],
      snapshots: {},
      approvals: {},
    };
    const resolver = vi.fn();

    expect(await migrateStateToV2(state, resolver)).toBe(state);
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("reconcileWorktrees", () => {
  const realKey = String.raw`c:\development\sample\.git`;

  function stateWithTentative(overrides: Partial<WorktreeRecord> = {}): AppState {
    return {
      version: 2,
      repositories: [
        {
          id: "repo-real",
          name: "Sample",
          repositoryKey: realKey,
          worktrees: [
            worktree("main-worktree", String.raw`C:\Development\Sample`, "repo-real", {
              isMain: true,
            }),
          ],
        },
        {
          id: "repo-tentative",
          name: "Sample-feature",
          repositoryKey: String.raw`c:\development\sample-feature`,
          worktrees: [
            worktree(
              "linked-worktree",
              String.raw`C:\Development\Sample-feature`,
              "repo-tentative",
              { tentative: true, ...overrides },
            ),
          ],
        },
      ],
      snapshots: {
        "linked-worktree": {
          [reviewCacheKey("diff-linked")]: snapshot("linked-worktree"),
        },
      },
      approvals: { fingerprint: true },
    };
  }

  it("re-integrates a tentative worktree once its repository resolves", async () => {
    const state = stateWithTentative();

    const reconciled = await reconcileWorktrees(state, async () => ({
      status: "resolved",
      repositoryKey: realKey,
      isMain: false,
    }));

    expect(reconciled.repositories).toHaveLength(1);
    const repository = reconciled.repositories[0];
    expect(repository?.repositoryKey).toBe(realKey);
    expect(repository?.worktrees.map((entry) => entry.id)).toEqual([
      "main-worktree",
      "linked-worktree",
    ]);
    const linked = repository?.worktrees.find((entry) => entry.id === "linked-worktree");
    expect(linked?.tentative).toBeUndefined();
    expect(linked?.repositoryId).toBe(repository?.id);
    expect(reconciled.snapshots).toBe(state.snapshots);
    expect(reconciled.approvals).toBe(state.approvals);
  });

  it("keeps a worktree tentative while resolution still errors", async () => {
    const state = stateWithTentative();

    const reconciled = await reconcileWorktrees(state, async () => ({ status: "error" }));

    const linked = reconciled.repositories
      .flatMap((repository) => repository.worktrees)
      .find((entry) => entry.id === "linked-worktree");
    expect(linked?.tentative).toBe(true);
    expect(reconciled.repositories).toHaveLength(2);
  });

  it("settles a missing tentative worktree as standalone and clears tentative", async () => {
    const state = stateWithTentative();

    const reconciled = await reconcileWorktrees(state, async () => ({
      status: "missing",
    }));

    const linked = reconciled.repositories
      .flatMap((repository) => repository.worktrees)
      .find((entry) => entry.id === "linked-worktree");
    expect(linked?.tentative).toBeUndefined();
    expect(reconciled.repositories).toHaveLength(2);
  });

  it("returns the same state and skips resolution when nothing is tentative", async () => {
    const state = stateWithTentative({ tentative: undefined });
    const resolver = vi.fn();

    expect(await reconcileWorktrees(state, resolver)).toBe(state);
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("markMissingWorktrees", () => {
  function stateWith(...worktrees: WorktreeRecord[]): AppState {
    return {
      version: 2,
      repositories: [
        {
          id: "repo-1",
          name: "Sample",
          repositoryKey: String.raw`c:\development\sample\.git`,
          worktrees,
        },
      ],
      snapshots: {},
      approvals: {},
    };
  }

  it("marks worktrees whose folder is absent as missing", async () => {
    const present = worktree("present", String.raw`C:\Development\Sample`, "repo-1", {
      isMain: true,
    });
    const gone = worktree("gone", String.raw`C:\Development\Sample-gone`, "repo-1");
    const state = stateWith(present, gone);

    const marked = await markMissingWorktrees(state, async (rootPath) =>
      rootPath === present.rootPath ? "exists" : "absent",
    );

    const byId = new Map(
      marked.repositories[0]?.worktrees.map((entry) => [entry.id, entry]),
    );
    expect(byId.get("present")?.missing ?? false).toBe(false);
    expect(byId.get("gone")?.missing).toBe(true);
  });

  it("clears missing when the folder exists again", async () => {
    const restored = worktree("restored", String.raw`C:\Development\Sample`, "repo-1", {
      missing: true,
    });
    const state = stateWith(restored);

    const marked = await markMissingWorktrees(state, async () => "exists");

    expect(marked.repositories[0]?.worktrees[0]?.missing).toBe(false);
  });

  it("leaves missing unchanged on a recoverable error", async () => {
    const flaky = worktree("flaky", String.raw`C:\Development\Sample`, "repo-1", {
      isMain: true,
      missing: true,
    });
    const state = stateWith(flaky);

    const marked = await markMissingWorktrees(state, async () => "error");

    expect(marked).toBe(state);
    expect(marked.repositories[0]?.worktrees[0]?.missing).toBe(true);
  });

  it("returns the same state when nothing changes", async () => {
    const present = worktree("present", String.raw`C:\Development\Sample`, "repo-1", {
      isMain: true,
    });
    const state = stateWith(present);

    expect(await markMissingWorktrees(state, async () => "exists")).toBe(state);
  });
});
