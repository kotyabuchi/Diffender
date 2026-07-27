import { execFile } from "node:child_process";
import { lstat, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { DiffFile, WorktreeRecord } from "../shared/contracts";
import { computeDiffHash, createUntrackedDiff, parseGitDiff } from "./diff";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_UNTRACKED_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_UNTRACKED_BYTES = 2 * 1024 * 1024;

export interface CollectedDiff {
  files: DiffFile[];
  diffHash: string;
  additions: number;
  deletions: number;
}

export interface WorktreeListEntry {
  rootPath: string;
  branch: string | null;
  headSha: string | null;
  isMain: boolean;
  isBare: boolean;
  locked: boolean;
  detached: boolean;
}

export function parseWorktreeList(porcelain: string): WorktreeListEntry[] {
  const records = porcelain
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((record) => record.trim().length > 0);

  const entries: WorktreeListEntry[] = [];
  records.forEach((record, recordIndex) => {
    let rootPath: string | null = null;
    let branch: string | null = null;
    let headSha: string | null = null;
    let isBare = false;
    let locked = false;
    let detached = false;

    for (const line of record.split("\n")) {
      if (line.startsWith("worktree ")) {
        rootPath = resolve(line.slice("worktree ".length));
      } else if (line.startsWith("HEAD ")) {
        headSha = line.slice("HEAD ".length) || null;
      } else if (line.startsWith("branch refs/heads/")) {
        branch = line.slice("branch refs/heads/".length) || null;
      } else if (line === "bare") {
        isBare = true;
      } else if (line === "locked" || line.startsWith("locked ")) {
        locked = true;
      } else if (line === "detached") {
        detached = true;
        branch = null;
      }
    }

    if (!rootPath) return;
    entries.push({
      rootPath,
      branch,
      headSha,
      isMain: recordIndex === 0,
      isBare,
      locked,
      detached,
    });
  });

  return entries;
}

export async function validateRepository(selectedPath: string): Promise<string> {
  const root = (await runGit(selectedPath, ["rev-parse", "--show-toplevel"])).trim();
  if (!isAbsolute(root))
    throw new Error("Gitから有効なプロジェクトパスを取得できませんでした。");
  const inside = (await runGit(root, ["rev-parse", "--is-inside-work-tree"])).trim();
  if (inside !== "true")
    throw new Error("選択したフォルダーはGitワークツリーではありません。");
  return resolve(root);
}

export async function describeRepository(
  rootPath: string,
): Promise<{ repositoryKey: string; isMain: boolean }> {
  const [gitDir, commonGitDir] = await Promise.all([
    runGit(rootPath, ["rev-parse", "--git-dir"]),
    runGit(rootPath, ["rev-parse", "--git-common-dir"]),
  ]);
  const resolvedGitDir = resolve(rootPath, gitDir.trim()).toLowerCase();
  const repositoryKey = resolve(rootPath, commonGitDir.trim()).toLowerCase();
  return {
    repositoryKey,
    isMain: resolvedGitDir === repositoryKey,
  };
}

export async function listWorktrees(rootPath: string): Promise<WorktreeListEntry[]> {
  return parseWorktreeList(await runGit(rootPath, ["worktree", "list", "--porcelain"]));
}

/**
 * リポジトリ情報の解決結果。移行・再統合が「一時的な失敗」で恒久的に誤ったグループ化を
 * 確定させないよう、`missing`（パスが存在しない＝恒久的）と `error`（Git の予期しない
 * 失敗＝一時的な可能性があり再試行に値する）を区別する。
 */
export type RepositoryResolution =
  | { status: "resolved"; repositoryKey: string; isMain: boolean }
  | { status: "missing" }
  | { status: "error" };

/**
 * パスの状態。`stat` の全例外を「不在」に丸めると、権限不足やネットワークドライブの
 * 一時障害・I/O エラーまで削除済みと誤判定してしまう。不在を明確に示す `ENOENT`/`ENOTDIR`
 * のみ `absent` とし、それ以外の例外は `error`（復旧可能な可能性があり状態を変えず再試行）
 * として扱う。
 */
export type PathState = "exists" | "absent" | "error";

export async function checkPath(target: string): Promise<PathState> {
  try {
    await stat(target);
    return "exists";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? "absent" : "error";
  }
}

export async function resolveRepositoryInfo(
  rootPath: string,
): Promise<RepositoryResolution> {
  const pathState = await checkPath(rootPath);
  if (pathState === "absent") return { status: "missing" };
  if (pathState === "error") return { status: "error" };
  try {
    const info = await describeRepository(rootPath);
    if (!info.repositoryKey) return { status: "error" };
    return { status: "resolved", repositoryKey: info.repositoryKey, isMain: info.isMain };
  } catch {
    return { status: "error" };
  }
}

export async function refreshProject(worktree: WorktreeRecord): Promise<WorktreeRecord> {
  const rootPath = await validateRepository(worktree.rootPath);
  const [branchResult, headResult, changesResult, repository] = await Promise.all([
    runGit(rootPath, ["symbolic-ref", "--quiet", "--short", "HEAD"], true),
    runGit(rootPath, ["rev-parse", "--verify", "HEAD"], true),
    runGit(rootPath, ["status", "--porcelain=v1", "-z"]),
    describeRepository(rootPath),
  ]);
  return {
    ...worktree,
    rootPath,
    branch: branchResult.ok ? branchResult.stdout.trim() || null : null,
    headSha: headResult.ok ? headResult.stdout.trim() || null : null,
    isMain: repository.isMain,
    hasChanges: changesResult.length > 0,
    reviewStatus:
      changesResult.length === 0
        ? "idle"
        : worktree.reviewStatus === "running"
          ? "running"
          : "stale",
  };
}

export async function collectRepositoryDiff(rootPath: string): Promise<CollectedDiff> {
  const head = await runGit(rootPath, ["rev-parse", "--verify", "HEAD"], true);
  let rawDiff: string;
  if (head.ok) {
    rawDiff = await runGit(rootPath, [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--find-renames",
      "HEAD",
      "--",
    ]);
  } else {
    const [staged, unstaged] = await Promise.all([
      runGit(rootPath, [
        "diff",
        "--cached",
        "--no-ext-diff",
        "--no-color",
        "--find-renames",
        "--",
      ]),
      runGit(rootPath, ["diff", "--no-ext-diff", "--no-color", "--find-renames", "--"]),
    ]);
    rawDiff = `${staged}\n${unstaged}`;
  }

  const files = parseGitDiff(rawDiff);
  const untracked = await listUntrackedFiles(rootPath);
  let totalUntrackedBytes = 0;
  for (const path of untracked) {
    if (totalUntrackedBytes >= MAX_TOTAL_UNTRACKED_BYTES) break;
    const absolutePath = resolveContainedPath(rootPath, path);
    const stats = await lstat(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) continue;
    if (
      stats.size > MAX_UNTRACKED_FILE_BYTES ||
      totalUntrackedBytes + stats.size > MAX_TOTAL_UNTRACKED_BYTES
    ) {
      continue;
    }
    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) continue;
    files.push(createUntrackedDiff(path.replaceAll("\\", "/"), buffer.toString("utf8")));
    totalUntrackedBytes += buffer.byteLength;
  }
  files.sort((left, right) => left.path.localeCompare(right.path));

  return {
    files,
    diffHash: computeDiffHash(files),
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

async function listUntrackedFiles(rootPath: string): Promise<string[]> {
  const output = await runGit(rootPath, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  return output.split("\0").filter(Boolean);
}

function resolveContainedPath(rootPath: string, path: string): string {
  const candidate = resolve(rootPath, path);
  const relativePath = relative(resolve(rootPath), candidate);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..\\`) ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Gitがプロジェクト外の未追跡ファイルを返しました。");
  }
  return candidate;
}

async function runGit(cwd: string, args: string[]): Promise<string>;
async function runGit(
  cwd: string,
  args: string[],
  allowFailure: true,
): Promise<{ ok: boolean; stdout: string }>;
async function runGit(
  cwd: string,
  args: string[],
  allowFailure = false,
): Promise<string | { ok: boolean; stdout: string }> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    return allowFailure ? { ok: true, stdout } : stdout;
  } catch (error) {
    if (allowFailure) {
      return {
        ok: false,
        stdout:
          typeof (error as { stdout?: unknown }).stdout === "string"
            ? (error as { stdout: string }).stdout
            : "",
      };
    }
    const stderr = (error as { stderr?: unknown }).stderr;
    throw new Error(
      `Gitの処理に失敗しました: ${typeof stderr === "string" && stderr.trim() ? stderr.trim() : errorMessage(error)}`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
