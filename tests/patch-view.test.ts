import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PatchView } from "../src/renderer/components/PatchView";

describe("PatchView", () => {
  it("renders an add icon affordance inside selectable line-number buttons", () => {
    const markup = renderToStaticMarkup(
      createElement(PatchView, {
        defaultOpen: true,
        feedback: [],
        file: {
          additions: 1,
          binary: false,
          deletions: 1,
          patch: [
            "diff --git a/src/example.ts b/src/example.ts",
            "index 1111111..2222222 100644",
            "--- a/src/example.ts",
            "+++ b/src/example.ts",
            "@@ -1 +1 @@",
            "-const before = true;",
            "+const after = true;",
          ].join("\n"),
          path: "src/example.ts",
          status: "modified",
        },
        onAddFeedback: async () => {},
      }),
    );

    expect(markup).toContain('class="patch__feedback-icon"');
    expect(markup).toContain('class="icon icon--add"');
    expect(markup).toContain('aria-label="変更前 1 行をフィードバック対象にする"');
    expect(markup).toContain('aria-label="変更後 1 行をフィードバック対象にする"');
  });
});
