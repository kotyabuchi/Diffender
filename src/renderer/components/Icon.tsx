import type { ReactNode } from "react";

export type IconName =
  | "add"
  | "branch"
  | "check"
  | "chevron"
  | "close"
  | "folder"
  | "link"
  | "message"
  | "minimize"
  | "open"
  | "refresh"
  | "review"
  | "spark";

const ICON_PATHS: Record<IconName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  branch: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="19" r="2" />
      <path d="M6 7v10M8 9c5 0 8-1 8-3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
  folder: <path d="M3 7.5h7l2-2h9v13H3z" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
    </>
  ),
  message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
  minimize: (
    <>
      <path d="m14 10 7-7" />
      <path d="M20 10h-6V4" />
      <path d="m3 21 7-7" />
      <path d="M4 14h6v6" />
    </>
  ),
  open: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13v7H4V6h7" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M6.1 8A7.5 7.5 0 0 1 19.4 9.5M17.9 16A7.5 7.5 0 0 1 4.6 14.5" />
    </>
  ),
  review: (
    <>
      <path d="M4 4h16v13H8l-4 3z" />
      <path d="M8 8h8M8 12h5" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
      <path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon icon--${name}`}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
