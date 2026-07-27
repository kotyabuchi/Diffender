import type { ErrorState } from "../lib/error";
import { Icon } from "./Icon";

export function ErrorNotice({
  error,
  onDismiss,
}: {
  error: ErrorState;
  onDismiss: () => void;
}) {
  return (
    <section className="error-notice" role="alert">
      <span className="error-notice__mark">!</span>
      <div>
        <strong>{error.title}</strong>
        <p>{error.detail}</p>
      </div>
      <div className="error-notice__actions">
        {error.retry ? (
          <button className="text-button" onClick={error.retry} type="button">
            再試行
          </button>
        ) : null}
        <button
          aria-label="エラーを閉じる"
          className="icon-button"
          onClick={onDismiss}
          type="button"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </section>
  );
}
