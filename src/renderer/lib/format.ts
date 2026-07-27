const DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string | null): string {
  if (!value) return "まだありません";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return DATE_FORMATTER.format(date);
}

export function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return path;
  return `…${path.includes("\\") ? "\\" : "/"}${parts.slice(-3).join(path.includes("\\") ? "\\" : "/")}`;
}

export function getReviewHeadline(summary: string): string {
  const normalized = summary.replace(/\s+/g, " ").trim();
  const punctuationIndex = normalized.search(/[。！？]/u);
  const firstSentence =
    punctuationIndex >= 0 ? normalized.slice(0, punctuationIndex + 1) : normalized;
  const headline = firstSentence
    .replace(/(?:でした|です)[。！？]?$/u, "")
    .replace(/[。！？]$/u, "");
  const characters = Array.from(headline);
  return characters.length > 64 ? `${characters.slice(0, 64).join("")}…` : headline;
}
