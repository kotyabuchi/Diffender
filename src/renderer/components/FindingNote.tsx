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

  return (
    <div className="finding-note">
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
        onBlur={() => void save()}
        onChange={(event) => {
          setValue(event.target.value);
          setSaveState("idle");
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        placeholder="この確認ポイントについて、判断や対応方針を記録できます"
        rows={2}
        value={value}
      />
      <button
        className="finding-note__save"
        disabled={readOnly || value === savedValue || saveState === "saving"}
        onClick={() => void save()}
        type="button"
      >
        メモを保存
      </button>
    </div>
  );
}
