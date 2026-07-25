import { describe, expect, it } from "vitest";
import {
  buildTurnStartParams,
  toThreadSummary,
} from "../src/main/codex-app-server";

describe("Codex App Server parameters", () => {
  it("scopes implementation turns to the selected project without network access", () => {
    const cwd = String.raw`C:\Development\Sample`;
    expect(buildTurnStartParams("thread-1", cwd, "修正してください")).toEqual({
      threadId: "thread-1",
      input: [
        {
          type: "text",
          text: "修正してください",
          text_elements: [],
        },
      ],
      cwd,
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [cwd],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    });
  });

  it("maps thread metadata into a compact renderer contract", () => {
    expect(
      toThreadSummary({
        id: "thread-1",
        parentThreadId: null,
        preview: "最初の依頼\n続き",
        ephemeral: false,
        updatedAt: 1_753_401_600,
        status: { type: "idle" },
        cwd: String.raw`C:\Development\Sample`,
        source: "appServer",
        name: null,
      }),
    ).toMatchObject({
      id: "thread-1",
      title: "最初の依頼",
      status: "idle",
      source: "appServer",
    });
  });
});
