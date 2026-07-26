import { describe, expect, it } from "vitest";
import {
  buildTurnStartParams,
  mapReviewModels,
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

  it("offers only exec-safe reasoning efforts and hides hidden models", () => {
    expect(
      mapReviewModels([
        {
          id: "gpt-5.6-terra",
          displayName: "GPT-5.6-Terra",
          description: "現行",
          hidden: false,
          supportedReasoningEfforts: [
            { reasoningEffort: "low" },
            { reasoningEffort: "medium" },
            { reasoningEffort: "high" },
            { reasoningEffort: "xhigh" },
            { reasoningEffort: "max" },
            { reasoningEffort: "ultra" },
          ],
        },
        {
          id: "gpt-secret",
          displayName: "Hidden",
          description: "",
          hidden: true,
          supportedReasoningEfforts: [{ reasoningEffort: "low" }],
        },
        {
          id: "gpt-no-effort",
          displayName: "None",
          description: "",
          hidden: false,
          supportedReasoningEfforts: [{ reasoningEffort: "max" }],
        },
      ]),
    ).toEqual([
      {
        id: "gpt-5.6-terra",
        displayName: "GPT-5.6-Terra",
        description: "現行",
        efforts: ["low", "medium", "high", "xhigh"],
      },
    ]);
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
