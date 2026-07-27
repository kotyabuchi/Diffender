import type {
  ReviewEffort,
  ReviewModel,
  ReviewSnapshot,
  WorktreeRecord,
} from "../../shared/contracts";
import { formatDate, shortPath } from "../lib/format";
import { EFFORT_LABELS } from "../lib/labels";
import { Icon } from "./Icon";

export function ProjectToolbar({
  project,
  snapshot,
  isReviewing,
  canReview,
  models,
  selectedModelId,
  setSelectedModelId,
  selectedEffort,
  setSelectedEffort,
  effortOptions,
  onCancel,
  onRun,
}: {
  project: WorktreeRecord;
  snapshot: ReviewSnapshot | null;
  isReviewing: boolean;
  canReview: boolean;
  models: ReviewModel[];
  selectedModelId: string | null;
  setSelectedModelId: (value: string | null) => void;
  selectedEffort: ReviewEffort | null;
  setSelectedEffort: (value: ReviewEffort | null) => void;
  effortOptions: ReviewEffort[];
  onCancel: () => void;
  onRun: () => void;
}) {
  return (
    <header className="project-toolbar">
      <div className="project-toolbar__identity">
        <h1>{project.name}</h1>
        <div className="project-toolbar__meta">
          <span title={project.rootPath}>
            <Icon name="folder" size={15} />
            {shortPath(project.rootPath)}
          </span>
          <span>
            <Icon name="branch" size={15} />
            {project.branch ?? "ブランチ不明"}
          </span>
          <span>{project.isMain ? "メイン" : "ワークツリー"}</span>
        </div>
      </div>
      <div className="project-toolbar__review">
        <span>
          最終レビュー
          <b>{formatDate(project.lastReviewedAt)}</b>
        </span>
        {!isReviewing && canReview && models.length > 0 ? (
          <div
            className="review-settings"
            title="モデルや推論強度を変えると、キャッシュを使わず新しくレビューします（利用枠を多めに消費します）。トークン削減には効かず、下げると品質が落ちることがあります。"
          >
            <label className="review-settings__field">
              <span>モデル</span>
              <select
                value={selectedModelId ?? ""}
                onChange={(event) => {
                  const id = event.target.value || null;
                  setSelectedModelId(id);
                  if (id) {
                    const model = models.find((item) => item.id === id);
                    if (
                      model &&
                      selectedEffort &&
                      !model.efforts.includes(selectedEffort)
                    ) {
                      setSelectedEffort(null);
                    }
                  }
                }}
              >
                <option value="">既定</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="review-settings__field">
              <span>推論強度</span>
              <select
                value={selectedEffort ?? ""}
                onChange={(event) =>
                  setSelectedEffort((event.target.value || null) as ReviewEffort | null)
                }
              >
                <option value="">既定</option>
                {effortOptions.map((effort) => (
                  <option key={effort} value={effort}>
                    {EFFORT_LABELS[effort]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {isReviewing ? (
          <button className="secondary-button" onClick={onCancel} type="button">
            中止
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={!canReview || !project.hasChanges}
            onClick={onRun}
            type="button"
          >
            <Icon name="spark" />
            {snapshot ? "再レビュー" : "AIレビュー"}
          </button>
        )}
      </div>
    </header>
  );
}
