import { describe, expect, it, vi } from "vitest";
import {
  FILE_HEADER_STICKY_OFFSET_PROPERTY,
  syncFileHeaderStickyOffset,
} from "../src/renderer/lib/sticky-header";

describe("syncFileHeaderStickyOffset", () => {
  it("publishes the rounded-up group header height for nested sticky file headers", () => {
    const setProperty = vi.fn();
    const container = {
      style: { setProperty },
    };
    const header = {
      getBoundingClientRect: () => ({ height: 103.25 }),
    };

    syncFileHeaderStickyOffset(container, header);

    expect(setProperty).toHaveBeenCalledWith(FILE_HEADER_STICKY_OFFSET_PROPERTY, "104px");
  });

  it("clamps invalid or negative measurements to zero", () => {
    const setProperty = vi.fn();
    const container = {
      style: { setProperty },
    };

    syncFileHeaderStickyOffset(container, {
      getBoundingClientRect: () => ({ height: Number.NaN }),
    });
    syncFileHeaderStickyOffset(container, {
      getBoundingClientRect: () => ({ height: -12 }),
    });

    expect(setProperty).toHaveBeenNthCalledWith(
      1,
      FILE_HEADER_STICKY_OFFSET_PROPERTY,
      "0px",
    );
    expect(setProperty).toHaveBeenNthCalledWith(
      2,
      FILE_HEADER_STICKY_OFFSET_PROPERTY,
      "0px",
    );
  });
});
