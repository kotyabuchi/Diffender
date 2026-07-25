import { describe, expect, it } from "vitest";
import {
  computeDiffHash,
  createUntrackedDiff,
  groupFingerprint,
  parseGitDiff,
} from "../src/main/diff";
import { reviewCacheKey } from "../src/main/review-service";

describe("parseGitDiff", () => {
  it("parses file status and line counts", () => {
    const files = parseGitDiff(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 1234567..7654321 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,2 +1,2 @@",
        "-old",
        "+new",
        " same",
        "",
      ].join("\n"),
    );

    expect(files).toMatchObject([
      {
        path: "src/a.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        binary: false,
      },
    ]);
  });

  it("decodes quoted Git paths", () => {
    const files = parseGitDiff(
      [
        'diff --git "a/src/file name.ts" "b/src/file name.ts"',
        "--- a/src/file name.ts",
        "+++ b/src/file name.ts",
        "@@ -0,0 +1 @@",
        "+export {};",
        "",
      ].join("\n"),
    );

    expect(files[0]?.path).toBe("src/file name.ts");
  });
});

describe("diff hashing", () => {
  it("is deterministic across file and newline ordering differences", () => {
    const first = createUntrackedDiff("b.txt", "hello\r\n");
    const second = createUntrackedDiff("a.txt", "world\n");
    expect(computeDiffHash([first, second])).toBe(
      computeDiffHash([second, first]),
    );
  });

  it("ties group fingerprints to the diff", () => {
    const group = {
      title: "Change",
      intent: "Update behavior",
      category: "correctness",
      risk: "medium",
      filePaths: ["a.ts"],
      findings: [],
    };
    expect(groupFingerprint("a", group)).not.toBe(groupFingerprint("b", group));
  });

  it("does not invalidate approval fingerprints when a reviewer note changes", () => {
    const finding = {
      severity: "high",
      file: "src/a.ts",
      line: 4,
      title: "境界値の確認",
      reason: "空配列で失敗します。",
      suggestion: "空配列を先に処理します。",
    };
    const group = {
      title: "入力処理",
      intent: "入力を検証する",
      category: "正確性",
      risk: "high",
      filePaths: ["src/a.ts"],
      findings: [finding],
    };
    const withNote = {
      ...group,
      findings: [{ ...finding, reviewerNote: "修正後に再確認する" }],
    };

    expect(groupFingerprint("diff", group)).toBe(
      groupFingerprint("diff", withNote),
    );
  });

  it("separates cached reviews by review contract version", () => {
    expect(reviewCacheKey("abc")).toMatch(/ja-review-v2:abc$/);
  });
});
