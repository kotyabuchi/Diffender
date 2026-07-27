import type { WorktreeRecord } from "../../shared/contracts";
import { Icon } from "./Icon";

export function NoReviewState({
  project,
  canReview,
  onRun,
}: {
  project: WorktreeRecord;
  canReview: boolean;
  onRun: () => void;
}) {
  if (!project.hasChanges) {
    return (
      <section className="quiet-state">
        <span className="quiet-state__seal">
          <Icon name="check" size={26} />
        </span>
        <div>
          <span className="eyebrow">変更なし</span>
          <h2>いま確認する変更はありません</h2>
          <p>新しい変更が入ったら、上部の「更新」でワークスペースに反映できます。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="quiet-state quiet-state--review">
      <span className="quiet-state__seal">
        <Icon name="review" size={27} />
      </span>
      <div>
        <span className="eyebrow">未レビューの変更</span>
        <h2>変更のレビューはまだありません</h2>
        <p>
          AIが差分を目的ごとのまとまりに分け、意図とリスク、確認すべき点を整理します。
        </p>
        <button
          className="primary-button"
          disabled={!canReview}
          onClick={onRun}
          type="button"
        >
          <Icon name="spark" />
          AIレビューを開始
        </button>
        {!canReview ? (
          <small>
            レビューを実行するには、Codex
            CLIをインストールしてChatGPTでログインしてください。
            APIキー認証はこのアプリのレビューでは利用できません。
          </small>
        ) : null}
      </div>
    </section>
  );
}
