import type { WorktreeRecord } from "../../shared/contracts";
import { Icon } from "./Icon";

export function MissingWorktreeNotice({
  worktree,
  onRemove,
}: {
  worktree: WorktreeRecord;
  onRemove: () => void;
}) {
  return (
    <section className="quiet-state">
      <span className="quiet-state__seal quiet-state__seal--danger">
        <Icon name="close" size={26} />
      </span>
      <div>
        <span className="eyebrow">削除済み</span>
        <h2>このワークツリーは見つかりません</h2>
        <p>
          作業フォルダーがディスク上から削除または移動されています。レビューは読み込め
          ません。不要であれば、このワークツリーをワークスペースから削除できます。
        </p>
        <p className="quiet-state__path" title={worktree.rootPath}>
          {worktree.rootPath}
        </p>
        <button
          className="primary-button primary-button--danger"
          onClick={onRemove}
          type="button"
        >
          <Icon name="trash" />
          ワークスペースから削除
        </button>
      </div>
    </section>
  );
}
