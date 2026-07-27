import { describe, expect, it } from "vitest";
import {
  detectImplementationAgent,
  inspectProjectAgentSignals,
} from "../src/main/implementation-agent";
import type { CodexStatus, WorktreeRecord } from "../src/shared/contracts";

const project: WorktreeRecord = {
  id: "project-1",
  repositoryId: "repository-1",
  name: "Sample",
  rootPath: String.raw`C:\Development\Sample`,
  branch: "main",
  headSha: "abc",
  isMain: false,
  hasChanges: true,
  reviewStatus: "complete",
  lastReviewedAt: null,
};

const codexStatus: CodexStatus = {
  installed: true,
  authenticated: true,
  authMethod: "chatgpt",
  detail: "ready",
};

describe("implementation agent detection", () => {
  it("prioritizes a linked Codex task", () => {
    expect(
      detectImplementationAgent(
        { ...project, codexThreadId: "thread-1" },
        codexStatus,
        { installed: true, version: "2.1", detail: "ready" },
        { claudeConfigured: true, codexConfigured: false },
      ),
    ).toMatchObject({
      selected: "codex",
      recommended: "codex",
      confidence: "high",
      source: "auto",
    });
  });

  it("uses Claude project configuration when no Codex task is linked", () => {
    expect(
      detectImplementationAgent(
        project,
        codexStatus,
        { installed: true, version: "2.1", detail: "ready" },
        { claudeConfigured: true, codexConfigured: false },
      ),
    ).toMatchObject({
      selected: "claude",
      recommended: "claude",
      confidence: "medium",
    });
  });

  it("lets a manual selection override automatic signals", () => {
    expect(
      detectImplementationAgent(
        { ...project, implementationAgent: "claude", codexThreadId: "thread-1" },
        codexStatus,
        { installed: true, version: "2.1", detail: "ready" },
        { claudeConfigured: false, codexConfigured: true },
      ),
    ).toMatchObject({
      selected: "claude",
      recommended: "codex",
      source: "manual",
    });
  });

  it("only checks fixed project marker paths", () => {
    const observed: string[] = [];
    inspectProjectAgentSignals(project.rootPath, (path) => {
      observed.push(path);
      return false;
    });
    expect(observed).toHaveLength(5);
    expect(observed.every((path) => path.startsWith(project.rootPath))).toBe(true);
  });
});
