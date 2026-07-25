import { describe, expect, it } from "vitest";
import {
  buildClaudeImplementationArgs,
  resolveClaudeInvocation,
  sanitizedClaudeEnvironment,
} from "../src/main/claude";

describe("Claude Code invocation", () => {
  it("continues the current project session without bypassing permissions", () => {
    const args = buildClaudeImplementationArgs();
    expect(args).toEqual([
      "--continue",
      "--print",
      "--permission-mode",
      "acceptEdits",
      "--output-format",
      "json",
      "--max-turns",
      "20",
    ]);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("detects the native Windows installation", () => {
    const executable = String.raw`C:\Users\reviewer\.local\bin\claude.exe`;
    expect(
      resolveClaudeInvocation({
        env: {
          USERPROFILE: String.raw`C:\Users\reviewer`,
          PATH: String.raw`C:\Windows\System32`,
        },
        platform: "win32",
        fileExists: (path) => path === executable,
      }),
    ).toEqual({ command: executable, prefixArgs: [] });
  });

  it("does not inherit direct Anthropic API credentials", () => {
    expect(
      sanitizedClaudeEnvironment({
        ANTHROPIC_API_KEY: "secret",
        ANTHROPIC_AUTH_TOKEN: "secret",
        SAFE_VALUE: "kept",
      }),
    ).toEqual({ SAFE_VALUE: "kept" });
  });
});
