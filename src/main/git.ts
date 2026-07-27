import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { DiffFile, ProjectRecord } from "../shared/contracts";
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

export async function validateRepository(selectedPath: string): Promise<string> {
  const root = (await runGit(selectedPath, ["rev-parse", "--show-toplevel"])).trim();
  if (!isAbsolute(root))
    throw new Error("Gitから有効なプロジェクトパスを取得できませんでした。");
  const inside = (await runGit(root, ["rev-parse", "--is-inside-work-tree"])).trim();
  if (inside !== "true")
    throw new Error("選択したフォルダーはGitワークツリーではありません。");
  return resolve(root);
}

export async function refreshProject(project: ProjectRecord): Promise<ProjectRecord> {
  const rootPath = await validateRepository(project.rootPath);
  const [branchResult, headResult, changesResult, gitDir, commonGitDir] =
    await Promise.all([
      runGit(rootPath, ["symbolic-ref", "--quiet", "--short", "HEAD"], true),
      runGit(rootPath, ["rev-parse", "--verify", "HEAD"], true),
      runGit(rootPath, ["status", "--porcelain=v1", "-z"]),
      runGit(rootPath, ["rev-parse", "--git-dir"]),
      runGit(rootPath, ["rev-parse", "--git-common-dir"]),
    ]);
  return {
    ...project,
    rootPath,
    branch: branchResult.ok ? branchResult.stdout.trim() || null : null,
    headSha: headResult.ok ? headResult.stdout.trim() || null : null,
    isWorktree:
      resolve(rootPath, gitDir.trim()).toLowerCase() !==
      resolve(rootPath, commonGitDir.trim()).toLowerCase(),
    hasChanges: changesResult.length > 0,
    reviewStatus:
      changesResult.length === 0
        ? "idle"
        : project.reviewStatus === "running"
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
