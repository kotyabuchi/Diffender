import { useEffect, useState } from "react";
import type { ReviewEffort, ReviewModel } from "../../shared/contracts";

export function useReviewModels(canReview: boolean) {
  const [models, setModels] = useState<ReviewModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffort] = useState<ReviewEffort | null>(null);

  const effortOptions = (["low", "medium", "high", "xhigh"] as ReviewEffort[]).filter(
    (effort) =>
      !selectedModelId ||
      Boolean(
        models.find((model) => model.id === selectedModelId)?.efforts.includes(effort),
      ),
  );

  useEffect(() => {
    if (!canReview || models.length > 0) return;
    let active = true;
    // モデル一覧は任意機能。取得できなくてもレビューは既定モデルで実行できる。
    window.diffender.reviews
      .models()
      .then((list) => {
        if (active) setModels(list);
      })
      .catch(() => {
        /* セレクタを出さないだけ。既定モデルでのレビューは可能。 */
      });
    return () => {
      active = false;
    };
  }, [canReview, models.length]);

  return {
    models,
    selectedModelId,
    setSelectedModelId,
    selectedEffort,
    setSelectedEffort,
    effortOptions,
  };
}
