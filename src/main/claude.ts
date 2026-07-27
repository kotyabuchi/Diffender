import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import type { ImplementationProgressEvent } from "../shared/contracts";

const STATUS_TIMEOUT_MS = 15_000;
const IMPLEMENTATION_TIMEOUT_MS = 15 * 60_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export interface ClaudeInvocation {
  command: string;
  prefixArgs: string[];
}

export interface ClaudeStatus {
  installed: boolean;
  version: string | null;
  detail: string;
}

interface ResolveClaudeInvocationOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execPath?: string;
  electron?: boolean;
  nodeExecutable?: string;
  fileExists?: (path: string) => boolean;
}

export class ClaudeRunner {
  private readonly running = new Map<
    string,
    { child: ChildProcessWithoutNullStreams; operationId: string }
  >();

  constructor(private readonly progress: (event: ImplementationProgressEvent) => void) {}

  async status(): Promise<ClaudeStatus> {
    try {
      const output = await spawnCapture(
        resolveClaudeInvocation(),
        ["--version"],
        process.cwd(),
        STATUS_TIMEOUT_MS,
      );
      if (output.code !== 0) {
        return {
          installed: true,
          version: null,
          detail: "Claude Codeのバージョンを確認できませんでした。",
        };
      }
      const version = `${output.stdout}\n${output.stderr}`.trim();
      return {
        installed: true,
        version: version || null,
        detail: version ? `Claude Code ${version}` : "Claude Codeを検出しました。",
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return {
        installed: code !== "ENOENT",
        version: null,
        detail:
          code === "ENOENT"
            ? "Claude Codeが見つかりませんでした。"
            : `Claude Codeを確認できませんでした: ${errorMessage(error)}`,
      };
    }
  }

  async sendFeedback(
    projectId: string,
    cwd: string,
    feedback: string,
  ): Promise<{ operationId: string }> {
    if (this.running.has(projectId)) {
      throw new Error("このプロジェクトではClaude Codeが既に修正中です。");
    }
    const invocation = resolveClaudeInvocation();
    const operationId = randomUUID();
    const child = spawn(
      invocation.command,
      [...invocation.prefixArgs, ...buildClaudeImplementationArgs()],
      {
        cwd,
        env: sanitizedClaudeEnvironment(),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    this.running.set(projectId, { child, operationId });
    this.progress({
      projectId,
      agent: "claude",
      operationId,
      status: "started",
      message: "Claude Codeの直近セッションへ修正指示を送りました。",
    });

    void captureChild(child, feedback, IMPLEMENTATION_TIMEOUT_MS)
      .then((output) => {
        if (output.code !== 0) {
          throw new Error(
            briefError(output.stderr) || "Claude Codeが修正を完了できませんでした。",
          );
        }
        this.progress({
          projectId,
          agent: "claude",
          operationId,
          status: "completed",
          message: "Claude Codeの修正が完了しました。更新して差分を確認してください。",
        });
      })
      .catch((error) => {
        this.progress({
          projectId,
          agent: "claude",
          operationId,
          status: "failed",
          message: `Claude Codeの修正が完了しませんでした: ${briefError(
            errorMessage(error),
          )}`,
        });
      })
      .finally(() => {
        const current = this.running.get(projectId);
        if (current?.operationId === operationId) {
          this.running.delete(projectId);
        }
      });

    return { operationId };
  }

  dispose(): void {
    for (const { child } of this.running.values()) {
      if (!child.killed) child.kill();
    }
    this.running.clear();
  }
}

export function buildClaudeImplementationArgs(): string[] {
  return [
    "--continue",
    "--print",
    "--permission-mode",
    "acceptEdits",
    "--output-format",
    "json",
    "--max-turns",
    "20",
  ];
}

export function resolveClaudeInvocation(
  options: ResolveClaudeInvocationOptions = {},
): ClaudeInvocation {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const electron = options.electron ?? Boolean(process.versions.electron);
  const fileExists = options.fileExists ?? existsSync;
  const nodeExecutable =
    options.nodeExecutable ??
    (electron ? (nodeCandidates(env).find(fileExists) ?? "node.exe") : execPath);
  const override = env.DIFFENDER_CLAUDE_PATH?.trim();
  if (override) {
    return override.toLowerCase().endsWith(".js")
      ? { command: nodeExecutable, prefixArgs: [override] }
      : { command: override, prefixArgs: [] };
  }
  if (platform !== "win32") return { command: "claude", prefixArgs: [] };

  const executable = windowsExecutableCandidates(env).find(fileExists);
  if (executable) return { command: executable, prefixArgs: [] };
  const script = windowsScriptCandidates(env).find(fileExists);
  if (script) return { command: nodeExecutable, prefixArgs: [script] };
  return { command: "claude.exe", prefixArgs: [] };
}

export function sanitizedClaudeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...source };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

function windowsExecutableCandidates(env: NodeJS.ProcessEnv): string[] {
  return [
    ...(env.USERPROFILE
      ? [win32.join(env.USERPROFILE, ".local", "bin", "claude.exe")]
      : []),
    ...commandDirectories(env).map((directory) => win32.join(directory, "claude.exe")),
  ];
}

function windowsScriptCandidates(env: NodeJS.ProcessEnv): string[] {
  return commandDirectories(env).map((directory) =>
    win32.join(directory, "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
  );
}

function nodeCandidates(env: NodeJS.ProcessEnv): string[] {
  return [
    ...commandDirectories(env).map((directory) => win32.join(directory, "node.exe")),
    ...(env.ProgramFiles ? [win32.join(env.ProgramFiles, "nodejs", "node.exe")] : []),
  ];
}

function commandDirectories(env: NodeJS.ProcessEnv): string[] {
  return [
    ...new Set(
      [
        env.APPDATA ? win32.join(env.APPDATA, "npm") : null,
        ...(env.PATH ?? "").split(";").map((entry) => entry.trim()),
      ].filter((entry): entry is string => Boolean(entry)),
    ),
  ];
}

async function spawnCapture(
  invocation: ClaudeInvocation,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(invocation.command, [...invocation.prefixArgs, ...args], {
    cwd,
    env: sanitizedClaudeEnvironment(),
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
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("Claude Codeの処理が制限時間を超えました。")));
    }, timeoutMs);
    const append = (target: "stdout" | "stderr", chunk: Buffer) => {
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(() => reject(new Error("Claude Codeの出力が上限を超えました。")));
      }
    };
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => resolve({ code, stdout, stderr })));
    if (input === undefined) child.stdin.end();
    else child.stdin.end(input, "utf8");
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function briefError(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return Array.from(normalized).slice(0, 500).join("");
}
