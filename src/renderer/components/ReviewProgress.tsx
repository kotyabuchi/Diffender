import type { ReviewProgressEvent } from "../../shared/contracts";
import { PROGRESS_LABELS } from "../lib/labels";

export function ReviewProgress({
  progress,
  onCancel,
}: {
  progress: ReviewProgressEvent | undefined;
  onCancel: () => void;
}) {
  const stage = progress?.stage ?? "queued";
  const step = stage === "queued" ? 1 : stage === "reading" ? 2 : 3;

  return (
    <section className="progress-panel" aria-live="polite">
      <div className="progress-panel__heading">
        <span className="progress-panel__spinner" aria-hidden="true" />
        <div>
          <span className="eyebrow">AIレビュー実行中</span>
          <h2>{PROGRESS_LABELS[stage]}</h2>
          <p>{progress?.message ?? "まもなく処理を開始します。"}</p>
        </div>
        <button className="secondary-button" onClick={onCancel} type="button">
          中止
        </button>
      </div>
      <ol className="progress-steps">
        {["準備", "差分の読取", "目的とリスクの分析"].map((label, index) => (
          <li className={index + 1 <= step ? "is-active" : ""} key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {label}
          </li>
        ))}
      </ol>
    </section>
  );
}
