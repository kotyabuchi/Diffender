import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorktreeList } from "../src/main/git";

describe("parseWorktreeList", () => {
  it("parses the main and linked worktrees in porcelain order", () => {
    const mainPath = `fixtures${sep}..${sep}main-worktree`;
    const featurePath = `fixtures${sep}feature-worktree`;
    const entries = parseWorktreeList(
      [
        `worktree ${mainPath}`,
        "HEAD 1111111111111111111111111111111111111111",
        "branch refs/heads/main",
        "",
        `worktree ${featurePath}`,
        "HEAD 2222222222222222222222222222222222222222",
        "branch refs/heads/feature",
        "",
      ].join("\n"),
    );

    expect(entries).toEqual([
      {
        rootPath: resolve(mainPath),
        branch: "main",
        headSha: "1111111111111111111111111111111111111111",
        isMain: true,
        isBare: false,
        locked: false,
        detached: false,
      },
      {
        rootPath: resolve(featurePath),
        branch: "feature",
        headSha: "2222222222222222222222222222222222222222",
        isMain: false,
        isBare: false,
        locked: false,
        detached: false,
      },
    ]);
  });

  it("marks detached and locked worktrees without a branch", () => {
    const detachedPath = `fixtures${sep}detached-worktree`;
    const [entry] = parseWorktreeList(
      [
        `worktree ${detachedPath}`,
        "HEAD 3333333333333333333333333333333333333333",
        "detached",
        "locked maintenance",
        "",
      ].join("\r\n"),
    );

    expect(entry).toMatchObject({
      rootPath: resolve(detachedPath),
      branch: null,
      detached: true,
      locked: true,
    });
  });

  it("keeps bare entries marked for callers to filter", () => {
    const barePath = `fixtures${sep}bare-repository`;
    const [entry] = parseWorktreeList([`worktree ${barePath}`, "bare", ""].join("\n"));

    expect(entry).toMatchObject({
      rootPath: resolve(barePath),
      isMain: true,
      isBare: true,
    });
  });
});
