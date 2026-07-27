import type {
  ReviewEffort,
  ReviewProgressEvent,
  RiskLevel,
  WorktreeRecord,
} from "../../shared/contracts";

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "重大",
};

export const EFFORT_LABELS: Record<ReviewEffort, string> = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "最高",
};

export const REVIEW_STATUS_LABELS: Record<WorktreeRecord["reviewStatus"], string> = {
  idle: "未レビュー",
  stale: "要更新",
  queued: "待機中",
  running: "レビュー中",
  complete: "確認済み",
  failed: "失敗",
};

export const PROGRESS_LABELS: Record<ReviewProgressEvent["stage"], string> = {
  queued: "レビューを準備しています",
  reading: "変更内容を読み取っています",
  analyzing: "意図とリスクを分析しています",
  complete: "レビューが完了しました",
  failed: "レビューに失敗しました",
};
