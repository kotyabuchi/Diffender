import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  CodexStatus,
  ImplementationAgent,
  ImplementationAgentDetection,
  ProjectRecord,
} from "../shared/contracts";
import type { ClaudeStatus } from "./claude";

export interface ProjectAgentSignals {
  claudeConfigured: boolean;
  codexConfigured: boolean;
}

export function inspectProjectAgentSignals(
  rootPath: string,
  fileExists: (path: string) => boolean = existsSync,
): ProjectAgentSignals {
  return {
    claudeConfigured: [
      join(rootPath, "CLAUDE.md"),
      join(rootPath, "CLAUDE.local.md"),
      join(rootPath, ".claude"),
    ].some(fileExists),
    codexConfigured: [join(rootPath, "AGENTS.md"), join(rootPath, ".codex")].some(
      fileExists,
    ),
  };
}

export function detectImplementationAgent(
  project: ProjectRecord,
  codexStatus: CodexStatus,
  claudeStatus: ClaudeStatus,
  signals: ProjectAgentSignals = inspectProjectAgentSignals(project.rootPath),
): ImplementationAgentDetection {
  const reasons: string[] = [];
  const codexInstalled = codexStatus.installed;
  const claudeInstalled = claudeStatus.installed;
  const codexLinked = Boolean(project.codexThreadId);

  if (codexLinked) reasons.push("Codexタスクが紐付いています。");
  if (signals.claudeConfigured) {
    reasons.push("CLAUDE.mdまたは.claude設定を検出しました。");
  }
  if (signals.codexConfigured) {
    reasons.push("AGENTS.mdまたは.codex設定を検出しました。");
  }
  if (claudeInstalled) reasons.push("Claude Code CLIを利用できます。");
  if (codexInstalled) reasons.push("Codex CLIを利用できます。");

  let recommended: ImplementationAgent | null = null;
  let confidence: ImplementationAgentDetection["confidence"] = null;
  if (codexLinked) {
    recommended = "codex";
    confidence = "high";
  } else if (signals.claudeConfigured && !signals.codexConfigured && claudeInstalled) {
    recommended = "claude";
    confidence = "medium";
  } else if (signals.codexConfigured && !signals.claudeConfigured && codexInstalled) {
    recommended = "codex";
    confidence = "medium";
  } else if (claudeInstalled && !codexInstalled) {
    recommended = "claude";
    confidence = "low";
  } else if (codexInstalled && !claudeInstalled) {
    recommended = "codex";
    confidence = "low";
  }

  const manual = project.implementationAgent ?? null;
  return {
    selected: manual ?? recommended,
    recommended,
    source: manual ? "manual" : recommended ? "auto" : "unknown",
    confidence: manual ? "high" : confidence,
    reasons:
      reasons.length > 0 ? reasons : ["実装エージェントを判断できる設定がありません。"],
    codexInstalled,
    claudeInstalled,
    codexLinked,
  };
}
