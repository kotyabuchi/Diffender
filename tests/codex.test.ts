import { describe, expect, it } from "vitest";
import {
  buildCodexExecArgs,
  parseCodexReview,
  resolveCodexInvocation,
} from "../src/main/codex";

describe("parseCodexReview", () => {
  it("accepts a schema-conformant response", () => {
    expect(
      parseCodexReview(
        JSON.stringify({
          summary: "One issue.",
          groups: [
            {
              id: "g1",
              title: "Behavior",
              intent: "Change behavior",
              category: "correctness",
              risk: "high",
              filePaths: ["src/a.ts"],
              findings: [
                {
                  id: "f1",
                  severity: "high",
                  file: "src/a.ts",
                  line: 3,
                  title: "Bug",
                  reason: "It fails.",
                  suggestion: "Fix it.",
                },
              ],
            },
          ],
        }),
      ).groups[0]?.risk,
    ).toBe("high");
  });

  it("rejects invalid risk values", () => {
    expect(() =>
      parseCodexReview(
        JSON.stringify({
          summary: "Bad.",
          groups: [
            {
              id: "g1",
              title: "Bad",
              intent: "Bad",
              category: "bad",
              risk: "urgent",
              filePaths: [],
              findings: [],
            },
          ],
        }),
      ),
    ).toThrow(/変更グループ 1/);
  });
});

describe("resolveCodexInvocation", () => {
  it("runs the npm Codex JavaScript entry point through external Node on Windows", () => {
    const appData = String.raw`C:\Users\reviewer\AppData\Roaming`;
    const codexJs = String.raw`C:\Users\reviewer\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`;

    expect(
      resolveCodexInvocation({
        env: { APPDATA: appData, PATH: String.raw`C:\Windows\System32` },
        platform: "win32",
        execPath: String.raw`C:\Apps\Diffender\Diffender.exe`,
        electron: true,
        nodeExecutable: String.raw`C:\Program Files\nodejs\node.exe`,
        fileExists: (path) => path === codexJs,
      }),
    ).toEqual({
      command: String.raw`C:\Program Files\nodejs\node.exe`,
      prefixArgs: [codexJs],
    });
  });

  it("supports an explicit native Codex executable override", () => {
    expect(
      resolveCodexInvocation({
        env: { DIFFENDER_CODEX_PATH: String.raw`D:\Tools\codex.exe` },
        platform: "win32",
      }),
    ).toEqual({
      command: String.raw`D:\Tools\codex.exe`,
      prefixArgs: [],
    });
  });
});

describe("buildCodexExecArgs", () => {
  it("isolates reviews from user-configured MCP servers while preserving CLI auth", () => {
    expect(buildCodexExecArgs(String.raw`C:\schemas\review.json`)).toEqual([
      "exec",
      "--model",
      "gpt-5.6-terra",
      "--ephemeral",
      "--ignore-user-config",
      "--sandbox",
      "read-only",
      "--output-schema",
      String.raw`C:\schemas\review.json`,
      "-",
    ]);
  });
});
