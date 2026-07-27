import { describe, expect, it } from "vitest";
import { pickCurrentSnapshot, reviewCacheKey } from "../src/main/review-service";
import type { ReviewSnapshot } from "../src/shared/contracts";

function snapshot(id: string, diffHash: string, createdAt: string): ReviewSnapshot {
  return {
    id,
    projectId: "project-1",
    createdAt,
    diffHash,
    summary: "",
    files: [],
    groups: [],
    additions: 0,
    deletions: 0,
    source: "codex",
  };
}

describe("pickCurrentSnapshot", () => {
  const older = snapshot("old", "hash-a", "2026-07-24T00:00:00.000Z");
  const newer = snapshot("new", "hash-b", "2026-07-25T00:00:00.000Z");
  const store: Record<string, ReviewSnapshot> = {
    [reviewCacheKey("hash-a")]: older,
    [reviewCacheKey("hash-b")]: newer,
  };

  it("returns the review that exactly matches the current diff", () => {
    expect(pickCurrentSnapshot(store, "hash-a", true)?.id).toBe("old");
  });

  it("falls back to the most recent review when there is no exact match but changes remain", () => {
    expect(pickCurrentSnapshot(store, "hash-changed", true)?.id).toBe("new");
  });

  it("returns null when there are no changes and no exact match", () => {
    expect(pickCurrentSnapshot(store, "hash-changed", false)).toBeNull();
  });

  it("returns null when the project has no stored reviews", () => {
    expect(pickCurrentSnapshot(undefined, "hash-a", true)).toBeNull();
  });

  it("prefers the newest entry that matches the current diff across settings", () => {
    const base = snapshot("base", "hash-a", "2026-07-24T00:00:00.000Z");
    const xhigh = snapshot("xhigh", "hash-a", "2026-07-26T00:00:00.000Z");
    const multi: Record<string, ReviewSnapshot> = {
      [reviewCacheKey("hash-a")]: base,
      [reviewCacheKey("hash-a", { model: "gpt-5.6-sol", effort: "xhigh" })]: xhigh,
    };
    expect(pickCurrentSnapshot(multi, "hash-a", true)?.id).toBe("xhigh");
  });
});

describe("reviewCacheKey", () => {
  it("keeps the default key stable so existing caches survive", () => {
    expect(reviewCacheKey("hash-a")).toBe(reviewCacheKey("hash-a", {}));
    expect(reviewCacheKey("hash-a", { model: undefined, effort: undefined })).toBe(
      reviewCacheKey("hash-a"),
    );
  });

  it("separates entries by model and effort", () => {
    const base = reviewCacheKey("hash-a");
    const tuned = reviewCacheKey("hash-a", { model: "gpt-5.6-sol", effort: "xhigh" });
    expect(tuned).not.toBe(base);
    expect(reviewCacheKey("hash-a", { effort: "high" })).not.toBe(base);
    expect(reviewCacheKey("hash-a", { effort: "high" })).not.toBe(tuned);
  });
});
