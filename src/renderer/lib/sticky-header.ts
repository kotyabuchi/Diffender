export const FILE_HEADER_STICKY_OFFSET_PROPERTY = "--file-header-sticky-top";

interface StickyOffsetContainer {
  style: {
    setProperty: (property: string, value: string) => void;
  };
}

export function syncFileHeaderStickyOffset(
  container: StickyOffsetContainer,
  stickyTop: number,
  headerHeight: number,
) {
  const top = Number.isFinite(stickyTop) ? Math.max(0, stickyTop) : 0;
  const height = Number.isFinite(headerHeight) ? Math.max(0, headerHeight) : 0;
  container.style.setProperty(
    FILE_HEADER_STICKY_OFFSET_PROPERTY,
    `${Math.ceil(top + height)}px`,
  );
}
