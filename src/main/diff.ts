import { createHash } from "node:crypto";
import type { DiffFile } from "../shared/contracts";

interface MutableDiffFile extends DiffFile {
  patchLines: string[];
}

export function parseGitDiff(rawDiff: string): DiffFile[] {
  const normalized = normalizeNewlines(rawDiff);
  const files = new Map<string, MutableDiffFile>();
  let current: MutableDiffFile | undefined;

  for (const line of normalized.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const path = parseDiffHeaderPath(line);
      current = files.get(path) ?? {
        path,
        status: "modified",
        additions: 0,
        deletions: 0,
        patch: "",
        patchLines: [],
        binary: false,
      };
      files.set(path, current);
    }
    if (!current) continue;

    current.patchLines.push(line);
    if (line.startsWith("new file mode ")) current.status = "added";
    if (line.startsWith("deleted file mode ")) current.status = "deleted";
    if (line.startsWith("rename from ")) current.status = "renamed";
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      current.binary = true;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
  }

  return [...files.values()]
    .map(({ patchLines, ...file }) => ({
      ...file,
      patch: `${patchLines.join("\n").trimEnd()}\n`,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function createUntrackedDiff(path: string, content: string): DiffFile {
  const normalized = normalizeNewlines(content);
  const lines = normalized === "" ? [] : normalized.replace(/\n$/, "").split("\n");
  const quoted = gitPath(path);
  const patch = [
    `diff --git a/${quoted} b/${quoted}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${quoted}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
  return {
    path,
    status: "untracked",
    additions: lines.length,
    deletions: 0,
    patch,
    binary: false,
  };
}

export function computeDiffHash(files: DiffFile[]): string {
  const canonical = files
    .map((file) => ({
      additions: file.additions,
      binary: file.binary,
      deletions: file.deletions,
      patch: normalizeNewlines(file.patch).trimEnd(),
      path: file.path.replaceAll("\\", "/"),
      status: file.status,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function groupFingerprint(
  diffHash: string,
  group: {
    title: string;
    intent: string;
    category: string;
    risk: string;
    filePaths: string[];
    findings: Array<{
      severity: string;
      file: string;
      line: number | null;
      title: string;
      reason: string;
      suggestion: string;
    }>;
  },
): string {
  const canonical = {
    diffHash,
    title: group.title,
    intent: group.intent,
    category: group.category,
    risk: group.risk,
    filePaths: [...group.filePaths].sort(),
    findings: group.findings
      .map((finding) => ({
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        title: finding.title,
        reason: finding.reason,
        suggestion: finding.suggestion,
      }))
      .sort((left, right) =>
        `${left.file}:${left.line ?? 0}:${left.title}`.localeCompare(
          `${right.file}:${right.line ?? 0}:${right.title}`,
        ),
      ),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function parseDiffHeaderPath(line: string): string {
  const match =
    /^diff --git (?:"a\/(?:\\.|[^"])*"|a\/\S+) ("b\/(?:\\.|[^"])*"|b\/\S+)$/.exec(
      line,
    );
  if (!match?.[1]) return "unknown";
  const token = match[1];
  if (!token.startsWith('"')) return token.slice(2);
  try {
    return (JSON.parse(token) as string).slice(2);
  } catch {
    return token.slice(3, -1);
  }
}

function gitPath(path: string): string {
  return path.replaceAll("\\", "/").replaceAll("\n", "");
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}
