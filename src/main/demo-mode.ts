import { type BrowserWindow, ipcMain } from "electron";
import {
  type CodexStatus,
  type CodexThreadSummary,
  type ImplementationAgentDetection,
  IPC_CHANNELS,
  type RepositoryRecord,
  type ReviewModel,
  type ReviewSnapshot,
  type WorktreeRecord,
} from "../shared/contracts";

/**
 * README スクリーンショット専用のデモモード。
 *
 * `DIFFENDER_DEMO_MODE=1` のときだけ有効になり、Git / Codex / Claude Code へは
 * 一切アクセスせず、renderer に固定のモックデータを返す。通常起動の挙動には
 * 影響しない（main.ts が demo モード時のみこのモジュールを使う）。
 */
export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DIFFENDER_DEMO_MODE === "1";
}

const NOW = "2026-07-30T09:24:00.000Z";
const EARLIER = "2026-07-30T08:57:00.000Z";

function makeReview(): ReviewSnapshot {
  return {
    id: "demo-review-storefront",
    projectId: "demo-storefront-main",
    createdAt: NOW,
    diffHash: "demo-diff-hash",
    summary:
      "決済フォームにカード検証を追加し、APIクライアントのリトライ処理を共通化、ログ出力の整形も見直しました。入力検証の追加は高リスクとして重点的に確認が必要です。",
    additions: 128,
    deletions: 34,
    source: "cache",
    model: "gpt-5-codex",
    effort: "high",
    files: [
      {
        path: "src/checkout/PaymentForm.tsx",
        status: "modified",
        additions: 42,
        deletions: 11,
        binary: false,
        patch: [
          "@@ -18,9 +18,18 @@ export function PaymentForm({ onSubmit }: PaymentFormProps) {",
          '   const [cardNumber, setCardNumber] = useState("");',
          '   const [expiry, setExpiry] = useState("");',
          '   const [cvc, setCvc] = useState("");',
          "+  const { errors, validate } = useCardValidation();",
          "",
          "   const handleSubmit = (event: FormEvent) => {",
          "     event.preventDefault();",
          "-    onSubmit({ cardNumber, expiry, cvc });",
          "+    if (!validate({ cardNumber, expiry, cvc })) {",
          "+      return;",
          "+    }",
          "+    onSubmit({ cardNumber, expiry, cvc });",
          "   };",
          "",
          "   return (",
          "@@ -34,6 +43,9 @@ export function PaymentForm({ onSubmit }: PaymentFormProps) {",
          "         onChange={(event) => setCardNumber(event.target.value)}",
          '         placeholder="カード番号"',
          "       />",
          "+      {errors.cardNumber ? (",
          '+        <span className="field-error">{errors.cardNumber}</span>',
          "+      ) : null}",
          '       <button type="submit">支払う</button>',
          "     </form>",
          "   );",
        ].join("\n"),
      },
      {
        path: "src/checkout/useCardValidation.ts",
        status: "added",
        additions: 39,
        deletions: 0,
        binary: false,
        patch: [
          "@@ -0,0 +1,24 @@",
          '+import { useState } from "react";',
          "+",
          "+interface CardInput {",
          "+  cardNumber: string;",
          "+  expiry: string;",
          "+  cvc: string;",
          "+}",
          "+",
          "+export function useCardValidation() {",
          "+  const [errors, setErrors] = useState<Record<string, string>>({});",
          "+",
          "+  const validate = (input: CardInput) => {",
          "+    const next: Record<string, string> = {};",
          '+    if (!/^\\d{13,19}$/.test(input.cardNumber.replaceAll(" ", ""))) {',
          '+      next.cardNumber = "カード番号が正しくありません";',
          "+    }",
          "+    if (!/^\\d{2}\\/\\d{2}$/.test(input.expiry)) {",
          '+      next.expiry = "有効期限は MM/YY 形式で入力してください";',
          "+    }",
          "+    setErrors(next);",
          "+    return Object.keys(next).length === 0;",
          "+  };",
          "+",
          "+  return { errors, validate };",
          "+}",
        ].join("\n"),
      },
      {
        path: "src/api/httpClient.ts",
        status: "modified",
        additions: 21,
        deletions: 12,
        binary: false,
        patch: [
          "@@ -1,15 +1,20 @@",
          '-import { fetch } from "./fetch";',
          '+import { fetch } from "./fetch";',
          '+import { withRetry } from "./retry";',
          "",
          " export async function request<T>(url: string, init?: RequestInit): Promise<T> {",
          "-  const response = await fetch(url, init);",
          "-  if (!response.ok) {",
          "-    throw new Error(`Request failed: ${response.status}`);",
          "-  }",
          "-  return (await response.json()) as T;",
          "+  return withRetry(async () => {",
          "+    const response = await fetch(url, init);",
          "+    if (!response.ok) {",
          "+      throw new Error(`Request failed: ${response.status}`);",
          "+    }",
          "+    return (await response.json()) as T;",
          "+  });",
          " }",
        ].join("\n"),
      },
      {
        path: "src/api/retry.ts",
        status: "added",
        additions: 18,
        deletions: 0,
        binary: false,
        patch: [
          "@@ -0,0 +1,14 @@",
          "+const MAX_ATTEMPTS = 3;",
          "+",
          "+export async function withRetry<T>(run: () => Promise<T>): Promise<T> {",
          "+  let lastError: unknown;",
          "+  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {",
          "+    try {",
          "+      return await run();",
          "+    } catch (error) {",
          "+      lastError = error;",
          "+      await new Promise((resolve) => setTimeout(resolve, attempt * 200));",
          "+    }",
          "+  }",
          "+  throw lastError;",
          "+}",
        ].join("\n"),
      },
      {
        path: "src/lib/logger.ts",
        status: "modified",
        additions: 6,
        deletions: 8,
        binary: false,
        patch: [
          '@@ -3,11 +3,9 @@ type Level = "info" | "warn" | "error";',
          " export function log(level: Level, message: string, meta?: unknown) {",
          "-  const line = `[${new Date().toISOString()}] ${level}: ${message}`;",
          "-  if (meta) {",
          "-    console.log(line, JSON.stringify(meta));",
          "-  } else {",
          "-    console.log(line);",
          "-  }",
          "+  const payload = { ts: new Date().toISOString(), level, message, meta };",
          "+  console.log(JSON.stringify(payload));",
          " }",
        ].join("\n"),
      },
      {
        path: "src/utils/formatDate.ts",
        status: "modified",
        additions: 2,
        deletions: 3,
        binary: false,
        patch: [
          "@@ -1,6 +1,5 @@",
          " export function formatDate(value: Date): string {",
          "-  const year = value.getFullYear();",
          "-  const month = value.getMonth() + 1;",
          "-  return `${year}/${month}`;",
          '+  return new Intl.DateTimeFormat("ja-JP").format(value);',
          " }",
        ].join("\n"),
      },
    ],
    groups: [
      {
        id: "demo-group-payment",
        title: "決済フォームにカード入力検証を追加",
        intent: "送信前にカード番号と有効期限を検証し、不正な入力での決済実行を防ぐ。",
        category: "機能追加",
        risk: "high",
        approved: false,
        fingerprint: "demo-fp-payment",
        filePaths: ["src/checkout/PaymentForm.tsx", "src/checkout/useCardValidation.ts"],
        findings: [
          {
            id: "demo-finding-cvc",
            severity: "high",
            file: "src/checkout/useCardValidation.ts",
            line: 20,
            title: "CVC が検証されていない",
            reason:
              "validate() はカード番号と有効期限のみ検証し、CVC を確認していません。空や桁数不正の CVC でも決済が実行されます。",
            suggestion:
              "CVC を 3〜4 桁の数字として検証し、errors.cvc を設定してください。",
            reviewerNote: "決済代行側の必須項目。マージ前に必ず対応する。",
          },
          {
            id: "demo-finding-luhn",
            severity: "medium",
            file: "src/checkout/useCardValidation.ts",
            line: 14,
            title: "桁数のみでチェックサム検証がない",
            reason:
              "カード番号は桁数だけを確認しており、Luhn チェックを行っていません。明らかに無効な番号を早期に弾けません。",
            suggestion:
              "Luhn アルゴリズムでチェックディジットを検証する処理を追加してください。",
          },
        ],
        feedback: [
          {
            id: "demo-feedback-payment-1",
            createdAt: NOW,
            body: "CVC の検証を追加してから送信してほしい。テストケースも add で。",
            scope: { type: "group" },
          },
        ],
      },
      {
        id: "demo-group-retry",
        title: "APIクライアントのリトライ処理を共通化",
        intent:
          "一時的な失敗を吸収するリトライを withRetry に集約し、request から再利用する。",
        category: "リファクタリング",
        risk: "medium",
        approved: true,
        fingerprint: "demo-fp-retry",
        filePaths: ["src/api/httpClient.ts", "src/api/retry.ts"],
        findings: [
          {
            id: "demo-finding-retry-4xx",
            severity: "medium",
            file: "src/api/retry.ts",
            line: 7,
            title: "4xx でもリトライしてしまう",
            reason:
              "withRetry はすべての例外でリトライします。400 系のクライアントエラーまで再試行され、無駄な負荷になります。",
            suggestion: "リトライ対象をネットワークエラーと 5xx に限定してください。",
          },
        ],
        feedback: [
          {
            id: "demo-feedback-retry-1",
            createdAt: EARLIER,
            body: "指数バックオフの上限だけ決めておきたい。",
            scope: {
              type: "lines",
              file: "src/api/retry.ts",
              side: "new",
              startLine: 10,
              endLine: 10,
            },
          },
        ],
      },
      {
        id: "demo-group-logger",
        title: "ログ出力を構造化 JSON に整理",
        intent: "ログを 1 行の JSON に統一し、収集基盤でパースしやすくする。",
        category: "改善",
        risk: "low",
        approved: true,
        fingerprint: "demo-fp-logger",
        filePaths: ["src/lib/logger.ts", "src/utils/formatDate.ts"],
        findings: [
          {
            id: "demo-finding-logger-undef",
            severity: "low",
            file: "src/lib/logger.ts",
            line: 6,
            title: "meta が undefined でもキーが残る",
            reason:
              "meta を渡さない場合でも payload に meta: undefined が含まれ、JSON では欠落しますが意図が読み取りづらくなります。",
            suggestion: "meta が存在するときだけ payload に含めるようにしてください。",
          },
        ],
      },
    ],
  };
}

function makeRepositories(): RepositoryRecord[] {
  const storefrontMain: WorktreeRecord = {
    id: "demo-storefront-main",
    repositoryId: "demo-repo-storefront",
    name: "web-storefront",
    rootPath: "/Users/dev/projects/web-storefront",
    branch: "feature/payment-hardening",
    headSha: "a1b2c3d",
    isMain: true,
    hasChanges: true,
    reviewStatus: "complete",
    lastReviewedAt: NOW,
    codexThreadId: null,
    implementationAgent: "claude",
  };
  const storefrontWorktree: WorktreeRecord = {
    id: "demo-storefront-promo",
    repositoryId: "demo-repo-storefront",
    name: "web-storefront",
    rootPath: "/Users/dev/projects/web-storefront-promo",
    branch: "feature/promo-banner",
    headSha: "e4f5a6b",
    isMain: false,
    hasChanges: true,
    reviewStatus: "stale",
    lastReviewedAt: EARLIER,
    codexThreadId: null,
    implementationAgent: null,
  };
  const apiMain: WorktreeRecord = {
    id: "demo-api-main",
    repositoryId: "demo-repo-api",
    name: "internal-api",
    rootPath: "/Users/dev/projects/internal-api",
    branch: "develop",
    headSha: "b7c8d9e",
    isMain: true,
    hasChanges: true,
    reviewStatus: "idle",
    lastReviewedAt: null,
    codexThreadId: null,
    implementationAgent: null,
  };
  const tokensMain: WorktreeRecord = {
    id: "demo-tokens-main",
    repositoryId: "demo-repo-tokens",
    name: "design-tokens",
    rootPath: "/Users/dev/projects/design-tokens",
    branch: "main",
    headSha: "c9d0e1f",
    isMain: true,
    hasChanges: false,
    reviewStatus: "idle",
    lastReviewedAt: null,
    codexThreadId: null,
    implementationAgent: null,
  };

  return [
    {
      id: "demo-repo-storefront",
      name: "web-storefront",
      repositoryKey: "web-storefront",
      worktrees: [storefrontMain, storefrontWorktree],
    },
    {
      id: "demo-repo-api",
      name: "internal-api",
      repositoryKey: "internal-api",
      worktrees: [apiMain],
    },
    {
      id: "demo-repo-tokens",
      name: "design-tokens",
      repositoryKey: "design-tokens",
      worktrees: [tokensMain],
    },
  ];
}

const CODEX_STATUS: CodexStatus = {
  installed: true,
  authenticated: true,
  authMethod: "chatgpt",
  detail: "ChatGPT アカウントで接続済み（デモ）",
};

const REVIEW_MODELS: ReviewModel[] = [
  {
    id: "gpt-5-codex",
    displayName: "GPT-5 Codex",
    description: "既定のレビューモデル",
    efforts: ["low", "medium", "high", "xhigh"],
  },
  {
    id: "gpt-5",
    displayName: "GPT-5",
    description: "汎用モデル",
    efforts: ["low", "medium", "high"],
  },
];

function makeDetection(
  project: Pick<WorktreeRecord, "implementationAgent" | "codexThreadId">,
): ImplementationAgentDetection {
  return {
    selected: project.implementationAgent ?? null,
    recommended: "claude",
    source: project.implementationAgent ? "manual" : "auto",
    confidence: "high",
    reasons: ["デモモードのため固定の判定を返します。"],
    codexInstalled: true,
    claudeInstalled: true,
    codexLinked: Boolean(project.codexThreadId),
  };
}

/**
 * デモモード用のインメモリバックエンド。承認やメモの切り替えを反映して
 * 対話的にも触れるようにしつつ、外部プロセスには一切アクセスしない。
 */
export function createDemoBackend() {
  let repositories = makeRepositories();
  const reviews = new Map<string, ReviewSnapshot>([
    ["demo-storefront-main", makeReview()],
  ]);

  const findWorktree = (id: string): WorktreeRecord | undefined => {
    for (const repository of repositories) {
      const worktree = repository.worktrees.find((candidate) => candidate.id === id);
      if (worktree) return worktree;
    }
    return undefined;
  };

  return {
    listRepositories: () => repositories,
    currentReview: (projectId: string) => reviews.get(projectId) ?? null,
    codexStatus: () => CODEX_STATUS,
    models: () => REVIEW_MODELS,
    tasks: (): CodexThreadSummary[] => [],
    detect: (projectId: string) => {
      const project = findWorktree(projectId);
      if (!project) {
        return makeDetection({ implementationAgent: null, codexThreadId: null });
      }
      return makeDetection(project);
    },
    approveGroup: (
      projectId: string,
      _reviewId: string,
      groupId: string,
      approved: boolean,
    ) => {
      const review = reviews.get(projectId);
      if (!review) throw new Error("レビューが見つかりません。");
      const updated: ReviewSnapshot = {
        ...review,
        groups: review.groups.map((group) =>
          group.id === groupId ? { ...group, approved } : group,
        ),
      };
      reviews.set(projectId, updated);
      return updated;
    },
    saveFindingNote: (
      projectId: string,
      _reviewId: string,
      findingId: string,
      note: string,
    ) => {
      const review = reviews.get(projectId);
      if (!review) throw new Error("レビューが見つかりません。");
      const updated: ReviewSnapshot = {
        ...review,
        groups: review.groups.map((group) => ({
          ...group,
          findings: group.findings.map((finding) =>
            finding.id === findingId
              ? { ...finding, reviewerNote: note || undefined }
              : finding,
          ),
        })),
      };
      reviews.set(projectId, updated);
      return updated;
    },
    setRepositories: (next: RepositoryRecord[]) => {
      repositories = next;
    },
  };
}

type DemoBackend = ReturnType<typeof createDemoBackend>;

/**
 * デモモード用の IPC ハンドラーを登録する。ipc.ts の本番ハンドラーとは
 * 別物で、Git / Codex / Claude Code のサービスには一切依存しない。
 */
export function registerDemoIpcHandlers(backend: DemoBackend): void {
  const handle = (channel: string, listener: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => listener(...args));
  };
  const notSupported = () => {
    throw new Error("この操作はデモモードでは利用できません。");
  };

  handle(IPC_CHANNELS.projectsList, () => backend.listRepositories());
  handle(IPC_CHANNELS.projectsRefresh, () => backend.listRepositories());
  handle(IPC_CHANNELS.projectsAdd, () => null);
  handle(IPC_CHANNELS.projectsDetectWorktrees, () => []);
  handle(IPC_CHANNELS.projectsAddWorktrees, () => backend.listRepositories());
  handle(IPC_CHANNELS.projectsRemove, () => backend.listRepositories());

  handle(IPC_CHANNELS.reviewsCurrent, (projectId) =>
    backend.currentReview(projectId as string),
  );
  handle(IPC_CHANNELS.reviewsModels, () => backend.models());
  handle(IPC_CHANNELS.reviewsRun, (projectId) =>
    backend.currentReview(projectId as string),
  );
  handle(IPC_CHANNELS.reviewsCancel, () => undefined);
  handle(IPC_CHANNELS.reviewsApprove, (projectId, reviewId, groupId, approved) =>
    backend.approveGroup(
      projectId as string,
      reviewId as string,
      groupId as string,
      approved as boolean,
    ),
  );
  handle(IPC_CHANNELS.reviewsFindingNote, (projectId, reviewId, findingId, note) =>
    backend.saveFindingNote(
      projectId as string,
      reviewId as string,
      findingId as string,
      note as string,
    ),
  );
  handle(IPC_CHANNELS.reviewsFeedbackAdd, (projectId) =>
    backend.currentReview(projectId as string),
  );
  handle(IPC_CHANNELS.reviewsFeedbackRemove, (projectId) =>
    backend.currentReview(projectId as string),
  );

  handle(IPC_CHANNELS.codexStatus, () => backend.codexStatus());
  handle(IPC_CHANNELS.codexTasks, () => backend.tasks());
  handle(IPC_CHANNELS.codexTaskCreate, notSupported);
  handle(IPC_CHANNELS.codexTaskLink, notSupported);
  handle(IPC_CHANNELS.codexTaskUnlink, notSupported);
  handle(IPC_CHANNELS.codexFeedbackCopy, () => undefined);
  handle(IPC_CHANNELS.codexFeedbackSend, notSupported);
  handle(IPC_CHANNELS.codexTaskOpen, () => undefined);

  handle(IPC_CHANNELS.implementationsDetect, (projectId) =>
    backend.detect(projectId as string),
  );
  handle(IPC_CHANNELS.implementationsSelect, notSupported);
  handle(IPC_CHANNELS.implementationsSend, notSupported);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * コンポジターが非空のフレームを提示するまで待つ。beginFrameSubscription は
 * 実際に描画されたフレームだけを届けるため、仮想フレームバッファ上の
 * capturePage() の未描画問題を避けられる。得られたフレームを返す（保険用）。
 */
function waitForPresentedFrame(
  window: BrowserWindow,
  timeoutMs: number,
): Promise<Electron.NativeImage | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (image: Electron.NativeImage | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!window.isDestroyed()) {
        try {
          window.webContents.endFrameSubscription();
        } catch {
          // 既に解除済みでも問題ない。
        }
      }
      resolve(image);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (window.isDestroyed()) {
      finish(null);
      return;
    }
    window.webContents.beginFrameSubscription(false, (image) => {
      if (!isBlankBitmap(image.toBitmap())) finish(image);
    });
  });
}

/**
 * 撮影結果がほぼ真っ白（未描画）かどうかを判定する。仮想フレームバッファ上では
 * capturePage() がまだ描画前のフレームを返すことがあるため、リトライ判定に使う。
 */
function isBlankBitmap(bitmap: Buffer): boolean {
  let nonWhite = 0;
  // BGRA 4byte/pixel。全ピクセルを見ると重いので一定間隔でサンプリングする。
  const stride = 4 * 97;
  let samples = 0;
  for (let offset = 0; offset + 3 < bitmap.length; offset += stride) {
    samples += 1;
    const b = bitmap[offset] ?? 255;
    const g = bitmap[offset + 1] ?? 255;
    const r = bitmap[offset + 2] ?? 255;
    if (r < 250 || g < 250 || b < 250) nonWhite += 1;
  }
  if (samples === 0) return true;
  return nonWhite / samples < 0.01;
}

/**
 * デモウィンドウの描画完了を待ってから capturePage() で PNG を書き出す。
 * `outputPath` が指定されたときだけ撮影し、撮影後にアプリを終了する。
 *
 * 仮想フレームバッファ上では固定 wait だけだと未描画のフレームを掴むことがある
 * ため、レビュー画面の要素が現れるまで待ち、さらに撮影結果が真っ白でなくなるまで
 * リトライする。
 */
export async function captureDemoScreenshot(
  window: BrowserWindow,
  outputPath: string,
  writeFile: (path: string, data: Buffer) => Promise<void>,
  delayMs: number,
): Promise<void> {
  // レビュー画面の主要要素が描画されるまで待つ（最大 15 秒）。
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (window.isDestroyed()) return;
    const ready = await window.webContents
      .executeJavaScript(
        "Boolean(document.querySelector('.review-summary') && document.querySelector('.project-item'))",
      )
      .catch(() => false);
    if (ready) break;
    await delay(250);
  }

  // フォントやレイアウトが落ち着くまで少し待つ。
  await delay(delayMs);

  // 仮想フレームバッファ上では capturePage() が未描画（真っ白）のフレームを返す
  // ことがある。非空フレームを提示するまで待ってから撮り直す。
  const presentedFrame = await waitForPresentedFrame(window, 8_000);
  if (window.isDestroyed()) return;

  let image = await window.webContents.capturePage();
  for (let attempt = 0; attempt < 8 && isBlankBitmap(image.toBitmap()); attempt += 1) {
    if (window.isDestroyed()) return;
    await delay(500);
    image = await window.webContents.capturePage();
  }
  // capturePage() が真っ白のままなら、購読で得た非空フレームにフォールバックする。
  if (isBlankBitmap(image.toBitmap()) && presentedFrame) image = presentedFrame;
  await writeFile(outputPath, image.toPNG());
}
