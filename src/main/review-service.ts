import { randomUUID } from "node:crypto";
import type {
  ProjectRecord,
  ImplementationAgent,
  ReviewFeedbackDraft,
  ReviewGroup,
  ReviewProgressEvent,
  ReviewSnapshot,
} from "../shared/contracts";
import { CodexRunner } from "./codex";
import { groupFingerprint } from "./diff";
import { collectRepositoryDiff, refreshProject } from "./git";
import { AtomicJsonStore } from "./store";

const REVIEW_CACHE_VERSION = "ja-review-v2";

export interface AppState {
  version: 1;
  projects: ProjectRecord[];
  snapshots: Record<string, Record<string, ReviewSnapshot>>;
  approvals: Record<string, boolean>;
}

export function createDefaultState(): AppState {
  return { version: 1, projects: [], snapshots: {}, approvals: {} };
}

export class ReviewService {
  constructor(
    private readonly store: AtomicJsonStore<AppState>,
    private readonly codex: CodexRunner,
    private readonly schemaPath: string,
    private readonly progress: (event: ReviewProgressEvent) => void,
  ) {}

  async listProjects(): Promise<ProjectRecord[]> {
    return (await this.store.read()).projects;
  }

  async getProject(projectId: string): Promise<ProjectRecord> {
    return requireProject(await this.store.read(), projectId);
  }

  async addProject(rootPath: string): Promise<ProjectRecord> {
    const initial: ProjectRecord = {
      id: randomUUID(),
      name: rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rootPath,
      rootPath,
      codexThreadId: null,
      implementationAgent: null,
      branch: null,
      headSha: null,
      isWorktree: true,
      hasChanges: false,
      reviewStatus: "idle",
      lastReviewedAt: null,
    };
    const refreshed = await refreshProject(initial);
    await this.store.update((state) => {
      const existing = state.projects.find(
        (project) => project.rootPath.toLowerCase() === refreshed.rootPath.toLowerCase(),
      );
      if (existing) throw new Error("このプロジェクトは既に登録されています。");
      return { ...state, projects: [...state.projects, refreshed] };
    });
    return refreshed;
  }

  async removeProject(projectId: string): Promise<void> {
    await this.store.update((state) => {
      const { [projectId]: _removed, ...snapshots } = state.snapshots;
      return {
        ...state,
        projects: state.projects.filter((project) => project.id !== projectId),
        snapshots,
      };
    });
  }

  async refreshProjects(projectId?: string): Promise<ProjectRecord[]> {
    const state = await this.store.read();
    if (projectId && !state.projects.some((project) => project.id === projectId)) {
      throw new Error("プロジェクトが見つかりません。");
    }
    const refreshed = await Promise.all(
      state.projects.map(async (project) => {
        if (projectId && project.id !== projectId) return project;
        try {
          const refreshed = await refreshProject(project);
          if (!refreshed.hasChanges) return refreshed;
          const diff = await collectRepositoryDiff(refreshed.rootPath);
          const cached = state.snapshots[refreshed.id]?.[reviewCacheKey(diff.diffHash)];
          return cached
            ? {
                ...refreshed,
                reviewStatus: "complete" as const,
                lastReviewedAt: cached.createdAt,
              }
            : refreshed;
        } catch {
          return { ...project, isWorktree: false, reviewStatus: "failed" as const };
        }
      }),
    );
    await this.store.update((latest) => ({ ...latest, projects: refreshed }));
    return refreshed;
  }

  async currentReview(projectId: string): Promise<ReviewSnapshot | null> {
    const state = await this.store.read();
    const project = requireProject(state, projectId);
    const diff = await collectRepositoryDiff(project.rootPath);
    const snapshot = state.snapshots[projectId]?.[reviewCacheKey(diff.diffHash)];
    return snapshot ? { ...snapshot, source: "cache" } : null;
  }

  async runReview(projectId: string): Promise<ReviewSnapshot> {
    let state = await this.store.read();
    const project = requireProject(state, projectId);
    this.progress({ projectId, stage: "queued", message: "レビューを準備しています。" });
    await this.setReviewStatus(projectId, "running");

    try {
      this.progress({ projectId, stage: "reading", message: "ローカルの変更を読み取っています。" });
      const diff = await collectRepositoryDiff(project.rootPath);
      const cached = state.snapshots[projectId]?.[reviewCacheKey(diff.diffHash)];
      if (cached) {
        await this.setReviewStatus(projectId, "complete", cached.createdAt);
        this.progress({ projectId, stage: "complete", message: "保存済みレビューを表示します。" });
        return { ...cached, source: "cache" };
      }

      if (diff.files.length === 0) {
        const empty = createSnapshot(projectId, diff, "レビュー対象の変更はありません。", []);
        await this.saveSnapshot(empty);
        this.progress({ projectId, stage: "complete", message: empty.summary });
        return empty;
      }

      const status = await this.codex.status();
      if (
        !status.installed ||
        !status.authenticated ||
        status.authMethod !== "chatgpt"
      ) {
        throw new Error(
          status.authenticated
            ? "AIレビューには、Codex CLIのChatGPTログインが必要です。APIキー認証は利用しません。"
            : status.detail,
        );
      }
      this.progress({
        projectId,
        stage: "analyzing",
        message: "Codexが変更内容を日本語で整理しています。",
      });
      const result = await this.codex.review(
        projectId,
        project.rootPath,
        this.schemaPath,
        buildPrompt(diff.files),
      );
      const currentDiff = await collectRepositoryDiff(project.rootPath);
      if (currentDiff.diffHash !== diff.diffHash) {
        throw new Error(
          "レビュー中にローカルの変更が更新されました。もう一度レビューしてください。",
        );
      }
      state = await this.store.read();
      const groups = result.groups.map((group) => {
        const fingerprint = groupFingerprint(diff.diffHash, group);
        return {
          ...group,
          approved: state.approvals[fingerprint] === true,
          fingerprint,
        };
      });
      const snapshot = createSnapshot(projectId, diff, result.summary, groups);
      await this.saveSnapshot(snapshot);
      this.progress({ projectId, stage: "complete", message: "レビューが完了しました。" });
      return snapshot;
    } catch (error) {
      await this.setReviewStatus(projectId, "failed");
      this.progress({
        projectId,
        stage: "failed",
        message: errorMessage(error),
      });
      throw error;
    }
  }

  cancelReview(projectId: string): void {
    this.codex.cancel(projectId);
  }

  async approveGroup(
    projectId: string,
    reviewId: string,
    groupId: string,
    approved: boolean,
  ): Promise<ReviewSnapshot> {
    const state = await this.store.read();
    const project = requireProject(state, projectId);
    const diff = await collectRepositoryDiff(project.rootPath);
    const cacheKey = reviewCacheKey(diff.diffHash);
    const snapshot = state.snapshots[projectId]?.[cacheKey];
    if (!snapshot || snapshot.id !== reviewId) {
      throw new Error("レビューが古くなっています。再レビューしてから承認してください。");
    }
    const group = snapshot.groups.find((candidate) => candidate.id === groupId);
    if (!group) throw new Error("対象の変更グループが見つかりません。");
    const expectedFingerprint = groupFingerprint(diff.diffHash, group);
    if (group.fingerprint !== expectedFingerprint) {
      throw new Error("変更グループの整合性を確認できませんでした。");
    }
    const updated = {
      ...snapshot,
      groups: snapshot.groups.map((candidate) =>
        candidate.id === groupId ? { ...candidate, approved } : candidate,
      ),
    };
    await this.store.update((latest) => ({
      ...latest,
      approvals: { ...latest.approvals, [expectedFingerprint]: approved },
      snapshots: {
        ...latest.snapshots,
        [projectId]: {
          ...latest.snapshots[projectId],
          [cacheKey]: updated,
        },
      },
    }));
    return updated;
  }

  async saveFindingNote(
    projectId: string,
    reviewId: string,
    findingId: string,
    note: string,
  ): Promise<ReviewSnapshot> {
    const state = await this.store.read();
    const project = requireProject(state, projectId);
    const diff = await collectRepositoryDiff(project.rootPath);
    const cacheKey = reviewCacheKey(diff.diffHash);
    let updatedSnapshot: ReviewSnapshot | null = null;

    await this.store.update((latest) => {
      const snapshot = latest.snapshots[projectId]?.[cacheKey];
      if (!snapshot || snapshot.id !== reviewId) {
        throw new Error("レビューが古くなっています。再レビューしてからメモを保存してください。");
      }
      let found = false;
      const groups = snapshot.groups.map((group) => ({
        ...group,
        findings: group.findings.map((finding) => {
          if (finding.id !== findingId) return finding;
          found = true;
          return { ...finding, reviewerNote: note };
        }),
      }));
      if (!found) throw new Error("対象の確認ポイントが見つかりません。");
      updatedSnapshot = { ...snapshot, groups };
      return {
        ...latest,
        snapshots: {
          ...latest.snapshots,
          [projectId]: {
            ...latest.snapshots[projectId],
            [cacheKey]: updatedSnapshot,
          },
        },
      };
    });

    if (!updatedSnapshot) throw new Error("メモを保存できませんでした。");
    return updatedSnapshot;
  }


  async addFeedback(
    projectId: string,
    reviewId: string,
    groupId: string,
    draft: ReviewFeedbackDraft,
  ): Promise<ReviewSnapshot> {
    const body = draft.body.trim();
    if (!body || body.length > 4_000) {
      throw new Error("フィードバックは1文字以上4,000文字以内で入力してください。");
    }

    const state = await this.store.read();
    const project = requireProject(state, projectId);
    const diff = await collectRepositoryDiff(project.rootPath);
    const cacheKey = reviewCacheKey(diff.diffHash);
    let updatedSnapshot: ReviewSnapshot | null = null;

    await this.store.update((latest) => {
      const snapshot = latest.snapshots[projectId]?.[cacheKey];
      if (!snapshot || snapshot.id !== reviewId) {
        throw new Error(
          "レビューが古くなっています。再レビューしてからフィードバックを保存してください。",
        );
      }
      const target = snapshot.groups.find((group) => group.id === groupId);
      if (!target) throw new Error("対象の変更グループが見つかりません。");

      const scope = draft.scope;
      if (scope.type === "lines") {
        if (
          !target.filePaths.includes(scope.file) ||
          !snapshot.files.some((file) => file.path === scope.file) ||
          (scope.side !== "old" && scope.side !== "new") ||
          !Number.isInteger(scope.startLine) ||
          !Number.isInteger(scope.endLine) ||
          scope.startLine < 1 ||
          scope.endLine < scope.startLine
        ) {
          throw new Error("フィードバックの行範囲が正しくありません。");
        }
      } else if (scope.type !== "group") {
        throw new Error("フィードバックの対象が正しくありません。");
      }

      const feedback = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        body,
        scope: draft.scope,
      };
      const groups = snapshot.groups.map((group) =>
        group.id === groupId
          ? { ...group, feedback: [...(group.feedback ?? []), feedback] }
          : group,
      );
      updatedSnapshot = { ...snapshot, groups };
      return {
        ...latest,
        snapshots: {
          ...latest.snapshots,
          [projectId]: {
            ...latest.snapshots[projectId],
            [cacheKey]: updatedSnapshot,
          },
        },
      };
    });

    if (!updatedSnapshot) throw new Error("フィードバックを保存できませんでした。");
    return updatedSnapshot;
  }

  async removeFeedback(
    projectId: string,
    reviewId: string,
    groupId: string,
    feedbackId: string,
  ): Promise<ReviewSnapshot> {
    const state = await this.store.read();
    const project = requireProject(state, projectId);
    const diff = await collectRepositoryDiff(project.rootPath);
    const cacheKey = reviewCacheKey(diff.diffHash);
    let updatedSnapshot: ReviewSnapshot | null = null;

    await this.store.update((latest) => {
      const snapshot = latest.snapshots[projectId]?.[cacheKey];
      if (!snapshot || snapshot.id !== reviewId) {
        throw new Error(
          "レビューが古くなっています。再レビューしてからフィードバックを解除してください。",
        );
      }
      const target = snapshot.groups.find((group) => group.id === groupId);
      if (!target) throw new Error("対象の変更グループが見つかりません。");
      if (!(target.feedback ?? []).some((item) => item.id === feedbackId)) {
        throw new Error("解除するフィードバックが見つかりません。");
      }

      const groups = snapshot.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              feedback: (group.feedback ?? []).filter(
                (item) => item.id !== feedbackId,
              ),
            }
          : group,
      );
      updatedSnapshot = { ...snapshot, groups };
      return {
        ...latest,
        snapshots: {
          ...latest.snapshots,
          [projectId]: {
            ...latest.snapshots[projectId],
            [cacheKey]: updatedSnapshot,
          },
        },
      };
    });

    if (!updatedSnapshot) throw new Error("フィードバックを解除できませんでした。");
    return updatedSnapshot;
  }

  async linkCodexTask(
    projectId: string,
    threadId: string | null,
  ): Promise<ProjectRecord> {
    let updatedProject: ProjectRecord | null = null;
    await this.store.update((state) => {
      requireProject(state, projectId);
      const projects = state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updatedProject = { ...project, codexThreadId: threadId };
        return updatedProject;
      });
      return { ...state, projects };
    });
    if (!updatedProject) throw new Error("プロジェクトが見つかりません。");
    return updatedProject;
  }

  async selectImplementationAgent(
    projectId: string,
    implementationAgent: ImplementationAgent | null,
  ): Promise<ProjectRecord> {
    let updatedProject: ProjectRecord | null = null;
    await this.store.update((state) => {
      requireProject(state, projectId);
      const projects = state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updatedProject = { ...project, implementationAgent };
        return updatedProject;
      });
      return { ...state, projects };
    });
    if (!updatedProject) throw new Error("プロジェクトが見つかりません。");
    return updatedProject;
  }

  async implementationFeedback(
    projectId: string,
    reviewId: string,
  ): Promise<string> {
    const { project, snapshot } = await this.currentSnapshot(projectId, reviewId);
    const actionable = snapshot.groups.some((group) =>
      (group.feedback ?? []).some((item) => item.body.trim()),
    );
    if (!actionable) {
      throw new Error(
        "送信できるフィードバックがありません。対象行または目的全体へフィードバックを追加してください。",
      );
    }
    return buildImplementationFeedback(project, snapshot);
  }

  private async saveSnapshot(snapshot: ReviewSnapshot): Promise<void> {
    await this.store.update((state) => ({
      ...state,
      projects: state.projects.map((project) =>
        project.id === snapshot.projectId
          ? {
              ...project,
              reviewStatus: "complete",
              lastReviewedAt: snapshot.createdAt,
            }
          : project,
      ),
      snapshots: {
        ...state.snapshots,
        [snapshot.projectId]: {
          ...state.snapshots[snapshot.projectId],
          [reviewCacheKey(snapshot.diffHash)]: snapshot,
        },
      },
    }));
  }

  private async setReviewStatus(
    projectId: string,
    reviewStatus: ProjectRecord["reviewStatus"],
    lastReviewedAt?: string,
  ): Promise<void> {
    await this.store.update((state) => ({
      ...state,
      projects: state.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              reviewStatus,
              lastReviewedAt: lastReviewedAt ?? project.lastReviewedAt,
            }
          : project,
      ),
    }));
  }

  private async currentSnapshot(
    projectId: string,
    reviewId: string,
  ): Promise<{ project: ProjectRecord; snapshot: ReviewSnapshot }> {
    const state = await this.store.read();
    const project = requireProject(state, projectId);
    const diff = await collectRepositoryDiff(project.rootPath);
    const snapshot =
      state.snapshots[projectId]?.[reviewCacheKey(diff.diffHash)];
    if (!snapshot || snapshot.id !== reviewId) {
      throw new Error(
        "レビューが古くなっています。再レビューしてからフィードバックを送ってください。",
      );
    }
    return { project, snapshot };
  }
}

function requireProject(state: AppState, projectId: string): ProjectRecord {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw new Error("プロジェクトが見つかりません。");
  return project;
}

function createSnapshot(
  projectId: string,
  diff: Awaited<ReturnType<typeof collectRepositoryDiff>>,
  summary: string,
  groups: ReviewGroup[],
): ReviewSnapshot {
  return {
    id: randomUUID(),
    projectId,
    createdAt: new Date().toISOString(),
    diffHash: diff.diffHash,
    summary,
    files: diff.files,
    groups,
    additions: diff.additions,
    deletions: diff.deletions,
    source: "codex",
  };
}

function buildPrompt(files: ReviewSnapshot["files"]): string {
  const diff = files.map((file) => file.patch).join("\n");
  return [
    "以下のローカルGit差分をレビューしてください。ファイルを変更せず、コマンドも実行しないでください。",
    "関連する変更を意図ごとにまとめ、正確性、セキュリティ、信頼性、保守性のリスクを確認してください。",
    "summary、groupのtitle・intent・category、findingのtitle・reason・suggestionは、すべて自然で具体的な日本語で記述してください。",
    "summaryの最初の一文はレビュー全体を表す簡潔な見出しにし、「です・ます」を使わず、体言止めまたは言い切りで記述してください。二文目以降は読みやすい説明文にしてください。",
    "JSONのプロパティ名、id、riskとseverityのenum値はスキーマどおりに保ち、説明文だけを日本語にしてください。",
    "出力スキーマに一致するJSONだけを返し、ファイルパスはリポジトリ相対パスにしてください。",
    "",
    diff,
  ].join("\n");
}

export function reviewCacheKey(diffHash: string): string {
  return `${REVIEW_CACHE_VERSION}:${diffHash}`;
}

export function buildImplementationFeedback(
  project: ProjectRecord,
  snapshot: ReviewSnapshot,
): string {
  const groupsWithFeedback = snapshot.groups.flatMap((group) => {
    const feedback = (group.feedback ?? []).filter((item) => item.body.trim());
    return feedback.length > 0 ? [{ group, feedback }] : [];
  });
  const lines = [
    "# Diffenderからの修正依頼",
    "",
    `- プロジェクト: ${project.name}`,
    `- 作業フォルダ: ${project.rootPath}`,
    "",
    "## 対応方針",
    "",
    "- 下記はAIレビューを元にユーザーが確定したフィードバックです。記載項目と、その対応に必要な関連変更だけを修正対象とする",
    "- 現在のワークツリーを確認し、既存の変更と整合するように実装する",
    "- 実装後に関連テストを実行し、変更内容と検証結果を日本語で報告する",
    "",
    "## フィードバック",
    "",
  ];

  for (const [index, { group, feedback }] of groupsWithFeedback.entries()) {
    lines.push(`### ${index + 1}. ${group.title}`, "");
    for (const item of feedback) {
      const location =
        item.scope.type === "group"
          ? "目的全体"
          : `${item.scope.file}:${item.scope.startLine}${
              item.scope.endLine === item.scope.startLine
                ? ""
                : `-${item.scope.endLine}`
            }（${item.scope.side === "new" ? "変更後" : "変更前"}）`;
      lines.push(
        `- 対象: ${location}`,
        `  内容: ${item.body.trim().replace(/\n/g, "\n    ")}`,
        "",
      );
    }
  }

  return lines.join("\n").trimEnd();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
