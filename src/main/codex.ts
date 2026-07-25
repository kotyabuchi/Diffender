import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import type {
  CodexStatus,
  ReviewFinding,
  ReviewGroup,
  RiskLevel,
} from "../shared/contracts";

const STATUS_TIMEOUT_MS = 15_000;
const REVIEW_TIMEOUT_MS = 10 * 60_000;
const MAX_CODEX_OUTPUT_BYTES = 8 * 1024 * 1024;
const RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high", "critical"]);

export interface CodexReviewResult {
  summary: string;
  groups: Array<Omit<ReviewGroup, "approved" | "fingerprint">>;
}

export interface CodexInvocation {
  command: string;
  prefixArgs: string[];
}

interface ResolveCodexInvocationOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execPath?: string;
  electron?: boolean;
  nodeExecutable?: string;
  fileExists?: (path: string) => boolean;
}

export class CodexRunner {
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>();

  async status(): Promise<CodexStatus> {
    try {
      const invocation = resolveCodexInvocation();
      const result = await spawnCapture(
        invocation,
        ["login", "status"],
        process.cwd(),
        STATUS_TIMEOUT_MS,
      );
      const detail = `${result.stdout}\n${result.stderr}`.trim();
      if (result.code !== 0) {
        return {
          installed: true,
          authenticated: false,
          authMethod: null,
          detail: "Codex CLIにログインしていません。",
        };
      }
      const normalized = detail.toLowerCase();
      const authMethod = normalized.includes("chatgpt")
        ? "chatgpt"
        : normalized.includes("api key") || normalized.includes("api-key")
          ? "api-key"
          : "unknown";
      return {
        installed: true,
        authenticated: true,
        authMethod,
        detail:
          authMethod === "chatgpt"
            ? "ChatGPTでログイン済みです。"
            : authMethod === "api-key"
              ? "APIキーでログインしています。"
              : "ログイン済みですが、認証方式を判定できませんでした。",
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return {
        installed: code !== "ENOENT",
        authenticated: false,
        authMethod: null,
        detail:
          code === "ENOENT"
            ? "Codex CLIが見つかりませんでした。"
            : `Codexの状態を確認できませんでした: ${errorMessage(error)}`,
      };
    }
  }

  async review(
    projectId: string,
    cwd: string,
    schemaPath: string,
    prompt: string,
  ): Promise<CodexReviewResult> {
    if (this.running.has(projectId)) {
      throw new Error("このプロジェクトでは既にレビューを実行しています。");
    }
    const invocation = resolveCodexInvocation();
    const child = spawn(
      invocation.command,
      [
        ...invocation.prefixArgs,
        ...buildCodexExecArgs(schemaPath),
      ],
      {
        cwd,
        env: sanitizedEnvironment(),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    this.running.set(projectId, child);

    try {
      const output = await captureChild(child, prompt, REVIEW_TIMEOUT_MS);
      if (output.code !== 0) {
        throw new Error(
          output.stderr.trim()
            ? `Codexの実行に失敗しました: ${output.stderr.trim()}`
            : `Codexが終了コード ${output.code} で停止しました。`,
        );
      }
      return parseCodexReview(output.stdout);
    } finally {
      this.running.delete(projectId);
    }
  }

  cancel(projectId: string): void {
    const child = this.running.get(projectId);
    if (child && !child.killed) child.kill();
  }
}

export function buildCodexExecArgs(schemaPath: string): string[] {
  return [
    "exec",
    "--model",
    "gpt-5.6-terra",
    "--ephemeral",
    "--ignore-user-config",
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "-",
  ];
}

export function resolveCodexInvocation(
  options: ResolveCodexInvocationOptions = {},
): CodexInvocation {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const electron = options.electron ?? Boolean(process.versions.electron);
  const fileExists = options.fileExists ?? existsSync;
  const nodeExecutable =
    options.nodeExecutable ??
    (electron ? windowsNodeCandidates(env).find(fileExists) ?? "node.exe" : execPath);
  const override = env.DIFFENDER_CODEX_PATH?.trim();

  if (override) {
    if (override.toLowerCase().endsWith(".js")) {
      return nodeScriptInvocation(override, nodeExecutable);
    }
    return { command: override, prefixArgs: [] };
  }

  if (platform !== "win32") {
    return { command: "codex", prefixArgs: [] };
  }

  const codexJs = windowsCodexJsCandidates(env).find(fileExists);
  if (codexJs) {
    return nodeScriptInvocation(codexJs, nodeExecutable);
  }

  // A native installation may expose codex.exe directly. Avoid the extensionless
  // npm shim here: Node cannot execute that shell script on Windows with shell:false.
  return { command: "codex.exe", prefixArgs: [] };
}

export function parseCodexReview(raw: string): CodexReviewResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error("Codexの応答をJSONとして読み取れませんでした。");
  }
  if (!isRecord(parsed) || typeof parsed.summary !== "string" || !Array.isArray(parsed.groups)) {
    throw new Error("Codexのレビュー結果が必要な形式を満たしていません。");
  }
  const groups = parsed.groups.map((value, index) => parseGroup(value, index));
  return { summary: parsed.summary, groups };
}

function parseGroup(
  value: unknown,
  index: number,
): Omit<ReviewGroup, "approved" | "fingerprint"> {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.intent !== "string" ||
    typeof value.category !== "string" ||
    !RISK_LEVELS.has(value.risk as RiskLevel) ||
    !Array.isArray(value.filePaths) ||
    !value.filePaths.every((path) => typeof path === "string") ||
    !Array.isArray(value.findings)
  ) {
    throw new Error(`Codexの変更グループ ${index + 1} が必要な形式を満たしていません。`);
  }
  return {
    id: value.id,
    title: value.title,
    intent: value.intent,
    category: value.category,
    risk: value.risk as RiskLevel,
    filePaths: value.filePaths,
    findings: value.findings.map((finding, findingIndex) =>
      parseFinding(finding, index, findingIndex),
    ),
  };
}

function parseFinding(
  value: unknown,
  groupIndex: number,
  findingIndex: number,
): ReviewFinding {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !RISK_LEVELS.has(value.severity as RiskLevel) ||
    typeof value.file !== "string" ||
    !(value.line === null || (Number.isInteger(value.line) && Number(value.line) > 0)) ||
    typeof value.title !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.suggestion !== "string"
  ) {
    throw new Error(
      `変更グループ ${groupIndex + 1} の確認ポイント ${findingIndex + 1} が必要な形式を満たしていません。`,
    );
  }
  return {
    id: value.id,
    severity: value.severity as RiskLevel,
    file: value.file,
    line: value.line as number | null,
    title: value.title,
    reason: value.reason,
    suggestion: value.suggestion,
  };
}

function windowsCodexJsCandidates(env: NodeJS.ProcessEnv): string[] {
  return commandDirectories(env).map((entry) =>
    win32.join(entry, "node_modules", "@openai", "codex", "bin", "codex.js"),
  );
}

function windowsNodeCandidates(env: NodeJS.ProcessEnv): string[] {
  return [
    ...commandDirectories(env).map((entry) => win32.join(entry, "node.exe")),
    ...(env.ProgramFiles ? [win32.join(env.ProgramFiles, "nodejs", "node.exe")] : []),
    ...(env.LOCALAPPDATA
      ? [win32.join(env.LOCALAPPDATA, "Programs", "nodejs", "node.exe")]
      : []),
  ];
}

function commandDirectories(env: NodeJS.ProcessEnv): string[] {
  const directories = [
    env.APPDATA ? win32.join(env.APPDATA, "npm") : null,
    ...(env.PATH ?? "")
      .split(";")
      .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean),
  ];
  return [
    ...new Set(
      directories.filter((entry): entry is string => Boolean(entry)),
    ),
  ];
}

function nodeScriptInvocation(
  scriptPath: string,
  nodeExecutable: string,
): CodexInvocation {
  return {
    command: nodeExecutable,
    prefixArgs: [scriptPath],
  };
}

export function sanitizedEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...source };
  delete env.CODEX_API_KEY;
  delete env.OPENAI_API_KEY;
  return env;
}

async function spawnCapture(
  invocation: CodexInvocation,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(invocation.command, [...invocation.prefixArgs, ...args], {
    cwd,
    env: sanitizedEnvironment(),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  return captureChild(child, undefined, timeoutMs);
}

function captureChild(
  child: ChildProcessWithoutNullStreams,
  input: string | undefined,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("Codexの処理が制限時間を超えました。")));
    }, timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const append = (target: "stdout" | "stderr", chunk: Buffer) => {
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > MAX_CODEX_OUTPUT_BYTES) {
        child.kill();
        finish(() => reject(new Error("Codexの出力が上限を超えました。")));
      }
    };

    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => resolve({ code, stdout, stderr })));
    if (input === undefined) {
      child.stdin.end();
    } else {
      child.stdin.end(input, "utf8");
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
