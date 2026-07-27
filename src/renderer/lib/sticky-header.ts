export const FILE_HEADER_STICKY_OFFSET_PROPERTY = "--review-group-header-height";

interface StickyOffsetContainer {
  style: {
    setProperty: (property: string, value: string) => void;
  };
}

interface MeasuredHeader {
  getBoundingClientRect: () => {
    height: number;
  };
}

export function syncFileHeaderStickyOffset(
  container: StickyOffsetContainer,
  header: MeasuredHeader,
) {
  const measuredHeight = header.getBoundingClientRect().height;
  const height = Number.isFinite(measuredHeight)
    ? Math.max(0, Math.ceil(measuredHeight))
    : 0;
  container.style.setProperty(FILE_HEADER_STICKY_OFFSET_PROPERTY, `${height}px`);
}
