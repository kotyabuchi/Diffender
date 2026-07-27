export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ReviewEffort = "low" | "medium" | "high" | "xhigh";

export interface ReviewModel {
  id: string;
  displayName: string;
  description: string;
  efforts: ReviewEffort[];
}

export interface ReviewRunOptions {
  model?: string;
  effort?: ReviewEffort;
}
export type ReviewStatus =
  | "idle"
  | "stale"
  | "queued"
  | "running"
  | "complete"
  | "failed";
export type ImplementationAgent = "codex" | "claude";

export interface ProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  codexThreadId?: string | null;
  implementationAgent?: ImplementationAgent | null;
  branch: string | null;
  headSha: string | null;
  isWorktree: boolean;
  hasChanges: boolean;
  reviewStatus: ReviewStatus;
  lastReviewedAt: string | null;
}

export interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  binary: boolean;
}

export interface ReviewFinding {
  id: string;
  severity: RiskLevel;
  file: string;
  line: number | null;
  title: string;
  reason: string;
  suggestion: string;
  reviewerNote?: string;
}

export type DiffSide = "old" | "new";

export type ReviewFeedbackScope =
  | { type: "group" }
  | {
      type: "lines";
      file: string;
      side: DiffSide;
      startLine: number;
      endLine: number;
    };

export interface ReviewFeedbackDraft {
  body: string;
  scope: ReviewFeedbackScope;
}

export interface ReviewFeedback extends ReviewFeedbackDraft {
  id: string;
  createdAt: string;
}

export interface ReviewGroup {
  id: string;
  title: string;
  intent: string;
  category: string;
  risk: RiskLevel;
  filePaths: string[];
  findings: ReviewFinding[];
  feedback?: ReviewFeedback[];
  approved: boolean;
  fingerprint: string;
}

export interface ReviewSnapshot {
  id: string;
  projectId: string;
  createdAt: string;
  diffHash: string;
  summary: string;
  files: DiffFile[];
  groups: ReviewGroup[];
  additions: number;
  deletions: number;
  source: "cache" | "codex";
  model?: string | null;
  effort?: ReviewEffort | null;
}

export interface CodexStatus {
  installed: boolean;
  authenticated: boolean;
  authMethod: "chatgpt" | "api-key" | "unknown" | null;
  detail: string;
}

export interface ReviewProgressEvent {
  projectId: string;
  stage: "queued" | "reading" | "analyzing" | "complete" | "failed";
  message: string;
}

export type CodexThreadStatus = "notLoaded" | "idle" | "active" | "systemError";

export interface CodexThreadSummary {
  id: string;
  title: string;
  preview: string;
  cwd: string;
  status: CodexThreadStatus;
  source: string;
  updatedAt: string;
}

export interface CodexTaskLinkResult {
  project: ProjectRecord;
  thread: CodexThreadSummary;
}

export interface CodexTaskSendResult {
  threadId: string;
  turnId: string;
}

export interface CodexTaskProgressEvent {
  projectId: string;
  threadId: string;
  turnId: string;
  status: "started" | "completed" | "failed";
  message: string;
}

export interface ImplementationAgentDetection {
  selected: ImplementationAgent | null;
  recommended: ImplementationAgent | null;
  source: "manual" | "auto" | "unknown";
  confidence: "high" | "medium" | "low" | null;
  reasons: string[];
  codexInstalled: boolean;
  claudeInstalled: boolean;
  codexLinked: boolean;
}

export interface ImplementationProgressEvent {
  projectId: string;
  agent: ImplementationAgent;
  operationId: string;
  status: "started" | "completed" | "failed";
  message: string;
}

export interface ImplementationSendResult {
  agent: ImplementationAgent;
  operationId: string;
}

export interface DiffenderApi {
  projects: {
    list(): Promise<ProjectRecord[]>;
    add(): Promise<ProjectRecord | null>;
    remove(projectId: string): Promise<void>;
    refresh(projectId?: string): Promise<ProjectRecord[]>;
  };
  reviews: {
    current(projectId: string): Promise<ReviewSnapshot | null>;
    run(projectId: string, options?: ReviewRunOptions): Promise<ReviewSnapshot>;
    models(): Promise<ReviewModel[]>;
    cancel(projectId: string): Promise<void>;
    approve(
      projectId: string,
      reviewId: string,
      groupId: string,
      approved: boolean,
    ): Promise<ReviewSnapshot>;
    saveFindingNote(
      projectId: string,
      reviewId: string,
      findingId: string,
      note: string,
    ): Promise<ReviewSnapshot>;
    addFeedback(
      projectId: string,
      reviewId: string,
      groupId: string,
      draft: ReviewFeedbackDraft,
    ): Promise<ReviewSnapshot>;
    removeFeedback(
      projectId: string,
      reviewId: string,
      groupId: string,
      feedbackId: string,
    ): Promise<ReviewSnapshot>;
    onProgress(listener: (event: ReviewProgressEvent) => void): () => void;
  };
  codex: {
    status(): Promise<CodexStatus>;
    tasks(projectId: string, includeAll?: boolean): Promise<CodexThreadSummary[]>;
    createTask(projectId: string): Promise<CodexTaskLinkResult>;
    linkTask(projectId: string, threadId: string): Promise<CodexTaskLinkResult>;
    unlinkTask(projectId: string): Promise<ProjectRecord>;
    copyFeedback(projectId: string, reviewId: string): Promise<void>;
    sendFeedback(projectId: string, reviewId: string): Promise<CodexTaskSendResult>;
    openTask(threadId: string): Promise<void>;
    onTaskProgress(listener: (event: CodexTaskProgressEvent) => void): () => void;
  };
  implementations: {
    detect(projectId: string): Promise<ImplementationAgentDetection>;
    select(projectId: string, agent: ImplementationAgent | null): Promise<ProjectRecord>;
    sendFeedback(projectId: string, reviewId: string): Promise<ImplementationSendResult>;
    onProgress(listener: (event: ImplementationProgressEvent) => void): () => void;
  };
}

export const IPC_CHANNELS = {
  projectsList: "projects:list",
  projectsAdd: "projects:add",
  projectsRemove: "projects:remove",
  projectsRefresh: "projects:refresh",
  reviewsCurrent: "reviews:current",
  reviewsRun: "reviews:run",
  reviewsModels: "reviews:models",
  reviewsCancel: "reviews:cancel",
  reviewsApprove: "reviews:approve",
  reviewsFindingNote: "reviews:finding-note",
  reviewsFeedbackAdd: "reviews:feedback-add",
  reviewsFeedbackRemove: "reviews:feedback-remove",
  reviewsProgress: "reviews:progress",
  codexStatus: "codex:status",
  codexTasks: "codex:tasks",
  codexTaskCreate: "codex:task-create",
  codexTaskLink: "codex:task-link",
  codexTaskUnlink: "codex:task-unlink",
  codexFeedbackCopy: "codex:feedback-copy",
  codexFeedbackSend: "codex:feedback-send",
  codexTaskOpen: "codex:task-open",
  codexTaskProgress: "codex:task-progress",
  implementationsDetect: "implementations:detect",
  implementationsSelect: "implementations:select",
  implementationsSend: "implementations:send",
  implementationsProgress: "implementations:progress",
} as const;
