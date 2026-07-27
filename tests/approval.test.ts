import { describe, expect, it } from "vitest";
import type { ReviewSnapshot } from "../src/shared/contracts";
import { updateGroupApproval } from "../src/shared/review";

function snapshot(): ReviewSnapshot {
  return {
    id: "review-1",
    projectId: "project-1",
    createdAt: "2026-07-27T00:00:00.000Z",
    diffHash: "diff-1",
    summary: "承認テスト",
    files: [],
    additions: 0,
    deletions: 0,
    source: "codex",
    groups: [
      {
        id: "group-1",
        title: "最初の変更",
        intent: "最初の承認を保持する",
        category: "正確性",
        risk: "low",
        filePaths: [],
        approved: false,
        fingerprint: "fingerprint-1",
        findings: [],
      },
      {
        id: "group-2",
        title: "次の変更",
        intent: "連続して承認する",
        category: "保守性",
        risk: "medium",
        filePaths: [],
        approved: false,
        fingerprint: "fingerprint-2",
        findings: [],
      },
    ],
  };
}

describe("updateGroupApproval", () => {
  it("updates the target group without mutating the previous snapshot", () => {
    const previous = snapshot();
    const updated = updateGroupApproval(previous, "group-1", true);

    expect(updated).not.toBe(previous);
    expect(updated.groups[0]?.approved).toBe(true);
    expect(updated.groups[1]).toBe(previous.groups[1]);
    expect(previous.groups[0]?.approved).toBe(false);
  });

  it("preserves earlier approvals when groups are updated consecutively", () => {
    const first = updateGroupApproval(snapshot(), "group-1", true);
    const second = updateGroupApproval(first, "group-2", true);

    expect(second.groups.map((group) => group.approved)).toEqual([true, true]);
  });

  it("rolls back only the failed group", () => {
    const first = updateGroupApproval(snapshot(), "group-1", true);
    const second = updateGroupApproval(first, "group-2", true);
    const rolledBack = updateGroupApproval(second, "group-1", false);

    expect(rolledBack.groups.map((group) => group.approved)).toEqual([false, true]);
  });

  it("returns the same snapshot when the group or value does not change", () => {
    const previous = snapshot();

    expect(updateGroupApproval(previous, "missing", true)).toBe(previous);
    expect(updateGroupApproval(previous, "group-1", false)).toBe(previous);
  });
});
