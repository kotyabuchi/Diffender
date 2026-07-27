import { describe, expect, it, vi } from "vitest";
import {
  FILE_HEADER_STICKY_OFFSET_PROPERTY,
  syncFileHeaderStickyOffset,
} from "../src/renderer/lib/sticky-header";

describe("syncFileHeaderStickyOffset", () => {
  it("publishes the group header bottom edge for nested sticky file headers", () => {
    const setProperty = vi.fn();
    const container = {
      style: { setProperty },
    };

    syncFileHeaderStickyOffset(container, 78, 103.25);

    expect(setProperty).toHaveBeenCalledWith(FILE_HEADER_STICKY_OFFSET_PROPERTY, "182px");
  });

  it("clamps invalid or negative measurements to zero", () => {
    const setProperty = vi.fn();
    const container = {
      style: { setProperty },
    };

    syncFileHeaderStickyOffset(container, Number.NaN, Number.NaN);
    syncFileHeaderStickyOffset(container, -78, -12);

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
