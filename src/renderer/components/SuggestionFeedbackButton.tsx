import { useCallback, useState } from "react";
import { Icon } from "./Icon";

export function SuggestionFeedbackButton({
  feedbackId,
  onAdd,
  onRemove,
  disabled = false,
}: {
  feedbackId?: string;
  onAdd: () => Promise<void>;
  onRemove: (feedbackId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [showRemoveIntent, setShowRemoveIntent] = useState(false);
  const added = Boolean(feedbackId);

  const toggleSuggestion = useCallback(async () => {
    if (state === "saving") return;
    setState("saving");
    try {
      if (feedbackId) {
        await onRemove(feedbackId);
      } else {
        await onAdd();
      }
      setState("idle");
    } catch {
      setState("error");
    }
  }, [feedbackId, onAdd, onRemove, state]);

  const label =
    state === "saving"
      ? added
        ? "解除中…"
        : "追加中…"
      : state === "error"
        ? added
          ? "もう一度解除"
          : "もう一度追加"
        : added
          ? showRemoveIntent
            ? "フィードバックを解除"
            : "フィードバック追加済み"
          : "フィードバックに追加";

  return (
    <div className="suggestion-feedback">
      <button
        className={`suggestion-feedback__button ${
          added ? "suggestion-feedback__button--added" : ""
        }`}
        disabled={disabled || state === "saving"}
        onBlur={() => setShowRemoveIntent(false)}
        onClick={() => void toggleSuggestion()}
        onFocus={() => setShowRemoveIntent(true)}
        onMouseEnter={() => setShowRemoveIntent(true)}
        onMouseLeave={() => setShowRemoveIntent(false)}
        title={added ? "クリックしてフィードバックを解除" : undefined}
        type="button"
      >
        {added ? (
          <Icon name={showRemoveIntent ? "close" : "check"} size={12} />
        ) : (
          <Icon name="add" size={12} />
        )}
        {label}
      </button>
      <span aria-live="polite" className="suggestion-feedback__status">
        {state === "error"
          ? added
            ? "解除できませんでした"
            : "追加できませんでした"
          : ""}
      </span>
    </div>
  );
}
