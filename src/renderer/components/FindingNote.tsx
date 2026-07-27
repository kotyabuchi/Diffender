import { useCallback, useEffect, useState } from "react";

export function FindingNote({
  initialValue,
  onSave,
  readOnly = false,
}: {
  initialValue: string;
  onSave: (note: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    setValue(initialValue);
    setSavedValue(initialValue);
    setSaveState("idle");
  }, [initialValue]);

  const save = useCallback(async () => {
    if (value === savedValue || saveState === "saving") return;
    setSaveState("saving");
    try {
      await onSave(value);
      setSavedValue(value);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [onSave, saveState, savedValue, value]);

  // フォーカス中・内容あり・保存中のときだけ展開する。未フォーカスかつ空なら
  // 1行に折り畳み、保存ボタンを隠して静かな表示にする（Issue #13）。
  const expanded = focused || value.trim().length > 0 || saveState === "saving";

  return (
    <div className={`finding-note${expanded ? "" : " finding-note--collapsed"}`}>
      <div className="finding-note__heading">
        <strong>自分のメモ</strong>
        <span aria-live="polite">
          {saveState === "saving"
            ? "保存中…"
            : saveState === "saved"
              ? "保存済み"
              : saveState === "error"
                ? "保存できませんでした"
                : ""}
        </span>
      </div>
      <textarea
        aria-label="自分のメモ"
        disabled={readOnly}
        maxLength={4_000}
        onBlur={() => {
          setFocused(false);
          void save();
        }}
        onChange={(event) => {
          setValue(event.target.value);
          setSaveState("idle");
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        placeholder="この確認ポイントについて、判断や対応方針を記録できます"
        rows={expanded ? 2 : 1}
        value={value}
      />
      {expanded ? (
        <div className="finding-note__footer">
          <span className="finding-note__hint">Ctrl / ⌘ + Enterで保存</span>
          <button
            className="finding-note__save"
            disabled={readOnly || value === savedValue || saveState === "saving"}
            onClick={() => void save()}
            type="button"
          >
            メモを保存
          </button>
        </div>
      ) : null}
    </div>
  );
}
