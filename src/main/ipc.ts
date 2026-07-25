import {
  clipboard,
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
} from "electron";
import {
  IPC_CHANNELS,
  type CodexTaskProgressEvent,
  type ImplementationAgent,
  type ImplementationProgressEvent,
  type ReviewFeedbackDraft,
  type ReviewProgressEvent,
} from "../shared/contracts";
import { validateRepository } from "./git";
import type { ReviewService } from "./review-service";
import type { CodexRunner } from "./codex";
import type { CodexAppServer } from "./codex-app-server";
import type { ClaudeRunner } from "./claude";
import {
  detectImplementationAgent,
  inspectProjectAgentSignals,
} from "./implementation-agent";

export function registerIpcHandlers(
  window: BrowserWindow,
  reviewService: ReviewService,
  codex: CodexRunner,
  appServer: CodexAppServer,
  claude: ClaudeRunner,
): void {
  ipcMain.handle(IPC_CHANNELS.projectsList, () => reviewService.listProjects());
  ipcMain.handle(IPC_CHANNELS.projectsAdd, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Gitプロジェクトを追加",
      properties: ["openDirectory"],
    });
    const selected = result.filePaths[0];
    if (result.canceled || !selected) return null;
    return reviewService.addProject(await validateRepository(selected));
  });
  ipcMain.handle(IPC_CHANNELS.projectsRemove, (_event, projectId: unknown) =>
    reviewService.removeProject(requiredString(projectId, "projectId")),
  );
  ipcMain.handle(IPC_CHANNELS.projectsRefresh, (_event, projectId: unknown) =>
    reviewService.refreshProjects(optionalString(projectId, "projectId")),
  );
  ipcMain.handle(IPC_CHANNELS.reviewsCurrent, (_event, projectId: unknown) =>
    reviewService.currentReview(requiredString(projectId, "projectId")),
  );
  ipcMain.handle(IPC_CHANNELS.reviewsRun, (_event, projectId: unknown) =>
    reviewService.runReview(requiredString(projectId, "projectId")),
  );
  ipcMain.handle(IPC_CHANNELS.reviewsCancel, (_event, projectId: unknown) => {
    reviewService.cancelReview(requiredString(projectId, "projectId"));
  });
  ipcMain.handle(
    IPC_CHANNELS.reviewsApprove,
    (
      _event,
      projectId: unknown,
      reviewId: unknown,
      groupId: unknown,
      approved: unknown,
    ) =>
      reviewService.approveGroup(
        requiredString(projectId, "projectId"),
        requiredString(reviewId, "reviewId"),
        requiredString(groupId, "groupId"),
        requiredBoolean(approved, "approved"),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.reviewsFindingNote,
    (
      _event,
      projectId: unknown,
      reviewId: unknown,
      findingId: unknown,
      note: unknown,
    ) =>
      reviewService.saveFindingNote(
        requiredString(projectId, "projectId"),
        requiredString(reviewId, "reviewId"),
        requiredString(findingId, "findingId"),
        requiredNote(note),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.reviewsFeedbackAdd,
    (
      _event,
      projectId: unknown,
      reviewId: unknown,
      groupId: unknown,
      draft: unknown,
    ) =>
      reviewService.addFeedback(
        requiredString(projectId, "projectId"),
        requiredString(reviewId, "reviewId"),
        requiredString(groupId, "groupId"),
        requiredFeedbackDraft(draft),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.reviewsFeedbackRemove,
    (
      _event,
      projectId: unknown,
      reviewId: unknown,
      groupId: unknown,
      feedbackId: unknown,
    ) =>
      reviewService.removeFeedback(
        requiredString(projectId, "projectId"),
        requiredString(reviewId, "reviewId"),
        requiredString(groupId, "groupId"),
        requiredString(feedbackId, "feedbackId"),
      ),
  );
  ipcMain.handle(IPC_CHANNELS.codexStatus, () => codex.status());
  ipcMain.handle(
    IPC_CHANNELS.codexTasks,
    (_event, projectId: unknown, includeAll: unknown) =>
      reviewService
        .getProject(requiredString(projectId, "projectId"))
        .then((project) =>
          appServer.listThreads(
            project.rootPath,
            optionalBoolean(includeAll, "includeAll") ?? false,
          ),
        ),
  );
  ipcMain.handle(
    IPC_CHANNELS.codexTaskCreate,
    async (_event, projectId: unknown) => {
      const id = requiredString(projectId, "projectId");
      const project = await reviewService.getProject(id);
      const thread = await appServer.createThread(project);
      const updated = await reviewService.linkCodexTask(id, thread.id);
      return { project: updated, thread };
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.codexTaskLink,
    async (_event, projectId: unknown, threadId: unknown) => {
      const id = requiredString(projectId, "projectId");
      const codexThreadId = requiredThreadId(threadId);
      const thread = await appServer.readThread(codexThreadId);
      const project = await reviewService.linkCodexTask(id, thread.id);
      return { project, thread };
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.codexTaskUnlink,
    (_event, projectId: unknown) =>
      reviewService.linkCodexTask(
        requiredString(projectId, "projectId"),
        null,
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.codexFeedbackCopy,
    async (_event, projectId: unknown, reviewId: unknown) => {
      const feedback = await reviewService.implementationFeedback(
        requiredString(projectId, "projectId"),
        requiredString(reviewId, "reviewId"),
      );
      clipboard.writeText(feedback);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.codexFeedbackSend,
    async (_event, projectId: unknown, reviewId: unknown) => {
      const status = await codex.status();
      if (
        !status.installed ||
        !status.authenticated ||
        status.authMethod !== "chatgpt"
      ) {
        throw new Error(
          status.authenticated
            ? "直接送信にはCodex CLIのChatGPTログインが必要です。APIキー認証は利用しません。"
            : status.detail,
        );
      }
      const id = requiredString(projectId, "projectId");
      const feedback = await reviewService.implementationFeedback(
        id,
        requiredString(reviewId, "reviewId"),
      );
      return appServer.sendFeedback(
        await reviewService.getProject(id),
        feedback,
      );
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.codexTaskOpen,
    async (_event, threadId: unknown) => {
      const id = requiredThreadId(threadId);
      await shell.openExternal(`codex://threads/${encodeURIComponent(id)}`);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.implementationsDetect,
    async (_event, projectId: unknown) => {
      const project = await reviewService.getProject(
        requiredString(projectId, "projectId"),
      );
      const [codexState, claudeState] = await Promise.all([
        codex.status(),
        claude.status(),
      ]);
      return detectImplementationAgent(
        project,
        codexState,
        claudeState,
        inspectProjectAgentSignals(project.rootPath),
      );
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.implementationsSelect,
    (_event, projectId: unknown, agent: unknown) =>
      reviewService.selectImplementationAgent(
        requiredString(projectId, "projectId"),
        optionalImplementationAgent(agent),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.implementationsSend,
    async (_event, projectId: unknown, reviewId: unknown) => {
      const id = requiredString(projectId, "projectId");
      const project = await reviewService.getProject(id);
      const [codexState, claudeState, feedback] = await Promise.all([
        codex.status(),
        claude.status(),
        reviewService.implementationFeedback(
          id,
          requiredString(reviewId, "reviewId"),
        ),
      ]);
      const detection = detectImplementationAgent(
        project,
        codexState,
        claudeState,
        inspectProjectAgentSignals(project.rootPath),
      );
      if (detection.selected === "codex") {
        if (
          !codexState.installed ||
          !codexState.authenticated ||
          codexState.authMethod !== "chatgpt"
        ) {
          throw new Error(
            codexState.authenticated
              ? "Codexへの送信にはChatGPTログインが必要です。APIキー認証は利用しません。"
              : codexState.detail,
          );
        }
        const result = await appServer.sendFeedback(project, feedback);
        return {
          agent: "codex" as const,
          operationId: result.turnId,
        };
      }
      if (detection.selected === "claude") {
        if (!claudeState.installed) throw new Error(claudeState.detail);
        const result = await claude.sendFeedback(
          id,
          project.rootPath,
          feedback,
        );
        return {
          agent: "claude" as const,
          operationId: result.operationId,
        };
      }
      throw new Error(
        "実装エージェントを判別できません。CodexまたはClaude Codeを選んでください。",
      );
    },
  );
}

export function sendReviewProgress(
  window: BrowserWindow,
  event: ReviewProgressEvent,
): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.reviewsProgress, event);
  }
}

export function sendCodexTaskProgress(
  window: BrowserWindow,
  event: CodexTaskProgressEvent,
): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.codexTaskProgress, event);
  }
}

export function sendImplementationProgress(
  window: BrowserWindow,
  event: ImplementationProgressEvent,
): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.implementationsProgress, event);
  }
}

export function removeIpcHandlers(): void {
  for (const channel of Object.values(IPC_CHANNELS)) {
    if (
      channel !== IPC_CHANNELS.reviewsProgress &&
      channel !== IPC_CHANNELS.codexTaskProgress &&
      channel !== IPC_CHANNELS.implementationsProgress
    ) {
      ipcMain.removeHandler(channel);
    }
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  return value === undefined || value === null ? undefined : requiredString(value, name);
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean.`);
  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  return value === undefined || value === null
    ? undefined
    : requiredBoolean(value, name);
}

function requiredThreadId(value: unknown): string {
  const threadId = requiredString(value, "threadId");
  if (!/^[0-9a-f-]{20,64}$/iu.test(threadId)) {
    throw new TypeError("CodexタスクIDの形式が正しくありません。");
  }
  return threadId;
}

function optionalImplementationAgent(
  value: unknown,
): ImplementationAgent | null {
  if (value === null || value === undefined) return null;
  if (value !== "codex" && value !== "claude") {
    throw new TypeError("実装エージェントの指定が正しくありません。");
  }
  return value;
}

function requiredNote(value: unknown): string {
  if (typeof value !== "string" || value.length > 4_000) {
    throw new TypeError("メモは4,000文字以内で入力してください。");
  }
  return value;
}


function requiredFeedbackDraft(value: unknown): ReviewFeedbackDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("フィードバックの形式が正しくありません。");
  }
  const record = value as Record<string, unknown>;
  const body = requiredNote(record.body).trim();
  if (!body) throw new TypeError("フィードバックを入力してください。");
  const scope = record.scope;
  if (typeof scope !== "object" || scope === null || Array.isArray(scope)) {
    throw new TypeError("フィードバックの対象が正しくありません。");
  }
  const target = scope as Record<string, unknown>;
  if (target.type === "group") return { body, scope: { type: "group" } };
  if (
    target.type !== "lines" ||
    (target.side !== "old" && target.side !== "new") ||
    !Number.isInteger(target.startLine) ||
    !Number.isInteger(target.endLine) ||
    Number(target.startLine) < 1 ||
    Number(target.endLine) < Number(target.startLine)
  ) {
    throw new TypeError("フィードバックの行範囲が正しくありません。");
  }
  return {
    body,
    scope: {
      type: "lines",
      file: requiredString(target.file, "file"),
      side: target.side,
      startLine: Number(target.startLine),
      endLine: Number(target.endLine),
    },
  };
}
