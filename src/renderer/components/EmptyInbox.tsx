import { Icon } from "./Icon";

export function EmptyInbox({ onAdd }: { onAdd: () => void }) {
  return (
    <main className="empty-state">
      <div className="empty-state__folio">00</div>
      <div className="empty-state__content">
        <span className="eyebrow">ローカルレビュー</span>
        <h1>変更を、読むべき順番に。</h1>
        <p>
          ローカルのGitプロジェクトを追加すると、変更の意図、リスク、指摘を
          ひとつの受信箱で整理できます。明示的にAIレビューを実行したときだけ、
          差分がCodexの処理に送られます。
        </p>
        <button className="primary-button primary-button--large" onClick={onAdd} type="button">
          <Icon name="add" />
          最初のプロジェクトを追加
        </button>
        <div className="empty-state__steps" aria-label="使い始めるまでの手順">
          <span>
            <b>01</b> フォルダーを選ぶ
          </span>
          <span>
            <b>02</b> 変更を確認
          </span>
          <span>
            <b>03</b> AIレビューを実行
          </span>
        </div>
      </div>
    </main>
  );
}
