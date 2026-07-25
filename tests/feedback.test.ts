import { describe, expect, it } from "vitest";
import type { ProjectRecord, ReviewSnapshot } from "../src/shared/contracts";
import { buildImplementationFeedback } from "../src/main/review-service";

const project: ProjectRecord = {
  id: "project-1",
  name: "Sample",
  rootPath: String.raw`C:\Development\Sample`,
  codexThreadId: null,
  branch: "main",
  headSha: "abc",
  isWorktree: true,
  hasChanges: true,
  reviewStatus: "complete",
  lastReviewedAt: "2026-07-25T00:00:00.000Z",
};

const snapshot: ReviewSnapshot = {
  id: "review-1",
  projectId: project.id,
  createdAt: "2026-07-25T00:00:00.000Z",
  diffHash: "diff-1",
  summary: "入力検証の改善",
  files: [],
  additions: 4,
  deletions: 1,
  source: "codex",
  groups: [
    {
      id: "group-1",
      title: "入力検証",
      intent: "空入力を安全に処理する",
      category: "正確性",
      risk: "high",
      filePaths: ["src/input.ts"],
      approved: false,
      fingerprint: "fingerprint",
      findings: [
        {
          id: "finding-1",
          severity: "high",
          file: "src/input.ts",
          line: 12,
          title: "空入力で例外",
          reason: "先頭要素へ無条件にアクセスしています。",
          suggestion: "空配列を先に返してください。",
          reviewerNote: "既存のエラー形式に合わせる",
        },
      ],
      feedback: [
        {
          id: "feedback-group",
          createdAt: "2026-07-25T01:00:00.000Z",
          body: "既存APIとの互換性を維持する",
          scope: { type: "group" },
        },
        {
          id: "feedback-lines",
          createdAt: "2026-07-25T01:01:00.000Z",
          body: "この範囲を早期returnへまとめる",
          scope: {
            type: "lines",
            file: "src/input.ts",
            side: "new",
            startLine: 10,
            endLine: 12,
          },
        },
      ],
    },
    {
      id: "group-without-feedback",
      title: "フィードバックなしの変更",
      intent: "出力対象外であることを確認する",
      category: "保守性",
      risk: "low",
      filePaths: ["src/unused.ts"],
      approved: false,
      fingerprint: "unused-fingerprint",
      findings: [
        {
          id: "unused-finding",
          severity: "low",
          file: "src/unused.ts",
          line: 3,
          title: "送信しないAI指摘",
          reason: "ユーザーからのフィードバックがありません。",
          suggestion: "この提案は送信しません。",
        },
      ],
      feedback: [],
    },
  ],
};

describe("buildImplementationFeedback", () => {
  it("includes only user feedback and its target without embedding AI review details", () => {
    const feedback = buildImplementationFeedback(project, snapshot);

    expect(feedback).toContain("### 1. 入力検証");
    expect(feedback).toContain("対象: 目的全体");
    expect(feedback).toContain("内容: 既存APIとの互換性を維持する");
    expect(feedback).toContain(
      "対象: src/input.ts:10-12（変更後）",
    );
    expect(feedback).toContain("内容: この範囲を早期returnへまとめる");
    expect(feedback).not.toContain("重要度:");
    expect(feedback).not.toContain("理由:");
    expect(feedback).not.toContain("提案:");
    expect(feedback).not.toContain("自分のメモ:");
    expect(feedback).not.toContain("空入力で例外");
    expect(feedback).not.toContain("フィードバックなしの変更");
    expect(feedback).not.toContain("送信しないAI指摘");
    expect(feedback).not.toContain("diff --git");
  });
});
