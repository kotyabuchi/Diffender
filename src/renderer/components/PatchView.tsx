import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DiffFile,
  DiffSide,
  ReviewFeedback,
  ReviewFeedbackScope,
} from "../../shared/contracts";

type PatchRowKind = "addition" | "deletion" | "context" | "hunk";

interface PatchRow {
  id: string;
  kind: PatchRowKind;
  content: string;
  oldLine: number | null;
  newLine: number | null;
  hunkId: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const FILE_STATUS_LABELS: Record<string, string> = {
  added: "追加",
  deleted: "削除",
  modified: "変更",
  renamed: "移動",
  untracked: "未追跡",
};

function parsePatch(patch: string): PatchRow[] {
  let oldLine = 0;
  let newLine = 0;
  let hunkId = 0;
  const rows: PatchRow[] = [];

  patch.split("\n").forEach((content, index, lines) => {
    if (content === "" && index === lines.length - 1) return;
    const hunk = HUNK_HEADER.exec(content);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      hunkId += 1;
      rows.push({
        id: `hunk-${index}`,
        kind: "hunk",
        content: `${newLine}行目付近`,
        oldLine: null,
        newLine: null,
        hunkId,
      });
      return;
    }

    if (
      content.startsWith("diff ") ||
      content.startsWith("index ") ||
      content.startsWith("---") ||
      content.startsWith("+++") ||
      content.startsWith("\\ No newline")
    ) {
      return;
    }

    if (content.startsWith("+")) {
      rows.push({
        id: `add-${index}`,
        kind: "addition",
        content: content.slice(1),
        oldLine: null,
        newLine,
        hunkId,
      });
      newLine += 1;
      return;
    }

    if (content.startsWith("-")) {
      rows.push({
        id: `delete-${index}`,
        kind: "deletion",
        content: content.slice(1),
        oldLine,
        newLine: null,
        hunkId,
      });
      oldLine += 1;
      return;
    }

    rows.push({
      id: `context-${index}`,
      kind: "context",
      content: content.startsWith(" ") ? content.slice(1) : content,
      oldLine,
      newLine,
      hunkId,
    });
    oldLine += 1;
    newLine += 1;
  });

  return rows;
}

interface PatchViewProps {
  file: DiffFile;
  feedback: ReviewFeedback[];
  defaultOpen?: boolean;
  readOnly?: boolean;
  onAddFeedback: (scope: ReviewFeedbackScope, body: string) => Promise<void>;
}

interface DragSelection {
  side: DiffSide;
  hunkId: number;
  startIndex: number;
  endIndex: number;
  ready: boolean;
}

export const FeedbackComposer = memo(function FeedbackComposer({
  targetLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
  disabled = false,
}: {
  targetLabel: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  // autoFocus の入力欄はマウント直後に focus が入るので初期から展開扱いにし、
  // 折り畳み→展開のちらつきを避ける。
  const [focused, setFocused] = useState(autoFocus);

  useEffect(() => {
    setBody("");
    setState("idle");
  }, [targetLabel]);

  const submit = useCallback(async () => {
    const value = body.trim();
    if (disabled || !value || state === "saving") return;
    setState("saving");
    try {
      await onSubmit(value);
      setBody("");
      setState("idle");
    } catch {
      setState("error");
    }
  }, [body, disabled, onSubmit, state]);

  // 未フォーカスかつ空のときは1行に折り畳み、対象ラベルと操作ボタンを隠す（Issue #13）。
  const expanded = focused || body.trim().length > 0 || state === "saving";

  return (
    <div className={`feedback-composer${expanded ? "" : " feedback-composer--collapsed"}`}>
      {expanded ? (
        <div className="feedback-composer__target">
          <span aria-hidden="true">自</span>
          <strong>{targetLabel}</strong>
        </div>
      ) : null}
      <textarea
        aria-label={`${targetLabel} へのフィードバック`}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={4_000}
        onBlur={() => {
          setFocused(false);
          if (!body.trim() && state !== "saving") onCancel?.();
        }}
        onChange={(event) => {
          setBody(event.target.value);
          setState("idle");
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="実装エージェントへ伝えるフィードバックを入力"
        rows={expanded ? 3 : 1}
        value={body}
      />
      {expanded ? (
        <div className="feedback-composer__actions">
          <span aria-live="polite">
            {state === "saving"
              ? "保存中…"
              : state === "error"
                ? "保存できませんでした"
                : "Ctrl / ⌘ + Enterで追加"}
          </span>
          {onCancel ? (
            <button
              className="feedback-composer__cancel"
              onClick={onCancel}
              type="button"
            >
              キャンセル
            </button>
          ) : null}
          <button
            className="feedback-composer__submit"
            disabled={disabled || !body.trim() || state === "saving"}
            onClick={() => void submit()}
            type="button"
          >
            フィードバックを追加
          </button>
        </div>
      ) : null}
    </div>
  );
});

export const FeedbackCard = memo(function FeedbackCard({
  feedback,
  targetLabel,
}: {
  feedback: ReviewFeedback;
  targetLabel: string;
}) {
  return (
    <article className="feedback-card">
      <header>
        <span className="feedback-card__avatar" aria-hidden="true">
          自
        </span>
        <strong>あなた</strong>
        <span>{targetLabel}</span>
      </header>
      <p>{feedback.body}</p>
    </article>
  );
});

// 差分行は選択状態など「その行に関係する」primitive props のみで描画し、
// memo で他行の再レンダーから切り離す。大きな差分でも選択の開始／解除で
// 全行が reconcile されないようにするため（フリーズ対策）。
const PatchRowView = memo(function PatchRowView({
  row,
  rowIndex,
  rowSelected,
  oldSelected,
  newSelected,
  readOnly,
  onBeginDrag,
  onExtendDrag,
}: {
  row: PatchRow;
  rowIndex: number;
  rowSelected: boolean;
  oldSelected: boolean;
  newSelected: boolean;
  readOnly: boolean;
  onBeginDrag: (side: DiffSide, rowIndex: number, hunkId: number) => void;
  onExtendDrag: (side: DiffSide, rowIndex: number, hunkId: number) => void;
}) {
  return (
    <div
      className={`patch__row patch__row--${row.kind}${rowSelected ? " patch__row--selected" : ""}`}
    >
      {row.oldLine === null ? (
        <span className="patch__line-number" aria-hidden="true" />
      ) : (
        <button
          aria-label={`変更前 ${row.oldLine} 行をフィードバック対象にする`}
          className={`patch__line-number${readOnly ? "" : " patch__line-number--selectable"}${oldSelected ? " patch__line-number--selected" : ""}`}
          data-feedback-side="old"
          data-hunk-id={row.hunkId}
          data-row-index={rowIndex}
          disabled={readOnly}
          onMouseDown={(event) => {
            event.preventDefault();
            onBeginDrag("old", rowIndex, row.hunkId);
          }}
          onMouseEnter={() => onExtendDrag("old", rowIndex, row.hunkId)}
          title="ドラッグして行範囲を選択"
          type="button"
        >
          {row.oldLine}
        </button>
      )}
      {row.newLine === null ? (
        <span className="patch__line-number" aria-hidden="true" />
      ) : (
        <button
          aria-label={`変更後 ${row.newLine} 行をフィードバック対象にする`}
          className={`patch__line-number${readOnly ? "" : " patch__line-number--selectable"}${newSelected ? " patch__line-number--selected" : ""}`}
          data-feedback-side="new"
          data-hunk-id={row.hunkId}
          data-row-index={rowIndex}
          disabled={readOnly}
          onMouseDown={(event) => {
            event.preventDefault();
            onBeginDrag("new", rowIndex, row.hunkId);
          }}
          onMouseEnter={() => onExtendDrag("new", rowIndex, row.hunkId)}
          title="ドラッグして行範囲を選択"
          type="button"
        >
          {row.newLine}
        </button>
      )}
      <span className="patch__marker" aria-hidden="true">
        {row.kind === "addition"
          ? "+"
          : row.kind === "deletion"
            ? "−"
            : row.kind === "hunk"
              ? "…"
              : ""}
      </span>
      <code className="patch__code">{row.content || " "}</code>
    </div>
  );
});

function lineForSide(row: PatchRow, side: DiffSide): number | null {
  return side === "new" ? row.newLine : row.oldLine;
}

function feedbackTargetLabel(feedback: ReviewFeedback): string {
  if (feedback.scope.type === "group") return "目的全体";
  const range =
    feedback.scope.startLine === feedback.scope.endLine
      ? `行 ${feedback.scope.startLine}`
      : `行 ${feedback.scope.startLine}–${feedback.scope.endLine}`;
  return `${range} · ${feedback.scope.side === "new" ? "変更後" : "変更前"}`;
}

export const PatchView = memo(function PatchView({
  file,
  feedback,
  defaultOpen = false,
  readOnly = false,
  onAddFeedback,
}: PatchViewProps) {
  const rows = useMemo(() => parsePatch(file.patch), [file.patch]);
  const [selection, setSelection] = useState<DragSelection | null>(null);
  const draggingRef = useRef(false);
  const fileName = file.path.split(/[\\/]/).pop() ?? file.path;
  const directory = file.path.slice(0, Math.max(0, file.path.length - fileName.length));

  // 閲覧専用へ遷移したら、遷移前に作られた選択とインラインの入力欄を破棄する。
  useEffect(() => {
    if (readOnly) {
      draggingRef.current = false;
      setSelection(null);
    }
  }, [readOnly]);

  const finishDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setSelection((current) => (current ? { ...current, ready: true } : null));
  }, []);

  const feedbackPlacement = useMemo(() => {
    const rowsByLocation = new Map<string, string>();
    for (const row of rows) {
      if (row.oldLine !== null) rowsByLocation.set(`old:${row.oldLine}`, row.id);
      if (row.newLine !== null) rowsByLocation.set(`new:${row.newLine}`, row.id);
    }
    const byRow = new Map<string, ReviewFeedback[]>();
    const floating: ReviewFeedback[] = [];
    for (const item of feedback) {
      if (item.scope.type !== "lines" || item.scope.file !== file.path) continue;
      const rowId = rowsByLocation.get(`${item.scope.side}:${item.scope.endLine}`);
      if (!rowId) {
        floating.push(item);
        continue;
      }
      const rowFeedback = byRow.get(rowId) ?? [];
      rowFeedback.push(item);
      byRow.set(rowId, rowFeedback);
    }
    return { byRow, floating };
  }, [feedback, file.path, rows]);

  const selectedRange = useMemo(() => {
    if (!selection) return null;
    const firstIndex = Math.min(selection.startIndex, selection.endIndex);
    const lastIndex = Math.max(selection.startIndex, selection.endIndex);
    let startLine = Number.POSITIVE_INFINITY;
    let endLine = Number.NEGATIVE_INFINITY;
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const row = rows[index];
      if (!row || row.hunkId !== selection.hunkId) continue;
      const line = lineForSide(row, selection.side);
      if (line === null) continue;
      startLine = Math.min(startLine, line);
      endLine = Math.max(endLine, line);
    }
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) return null;
    return {
      anchorIndex: lastIndex,
      label:
        startLine === endLine
          ? `行 ${startLine} · ${selection.side === "new" ? "変更後" : "変更前"}`
          : `行 ${startLine}–${endLine} · ${selection.side === "new" ? "変更後" : "変更前"}`,
      scope: {
        type: "lines" as const,
        file: file.path,
        side: selection.side,
        startLine,
        endLine,
      },
    };
  }, [file.path, rows, selection]);

  const beginDrag = useCallback(
    (side: DiffSide, rowIndex: number, hunkId: number) => {
      if (readOnly) return;
      draggingRef.current = true;
      setSelection({
        side,
        hunkId,
        startIndex: rowIndex,
        endIndex: rowIndex,
        ready: false,
      });
    },
    [readOnly],
  );

  const extendDrag = useCallback(
    (side: DiffSide, rowIndex: number, hunkId: number) => {
      if (readOnly || !draggingRef.current) return;
      setSelection((current) =>
        current && current.side === side && current.hunkId === hunkId
          ? { ...current, endIndex: rowIndex }
          : current,
      );
    },
    [readOnly],
  );

  return (
    <details className="patch" open={defaultOpen || feedback.length > 0}>
      <summary className="patch__summary">
        <span className="patch__disclosure" aria-hidden="true" />
        <span className="patch__path">
          <span className="patch__directory">{directory}</span>
          <strong>{fileName}</strong>
        </span>
        {feedback.length > 0 ? (
          <span
            className="patch__comments"
            aria-label={`${feedback.length} 件のフィードバック`}
          >
            <span aria-hidden="true">▣</span>
            {feedback.length}
          </span>
        ) : null}
        <span className="patch__status">
          {FILE_STATUS_LABELS[file.status] ?? file.status}
        </span>
        <span className="patch__delta" aria-label={`追加 ${file.additions} 行`}>
          +{file.additions}
        </span>
        <span
          className="patch__delta patch__delta--delete"
          aria-label={`削除 ${file.deletions} 行`}
        >
          −{file.deletions}
        </span>
      </summary>

      {file.binary ? (
        <div className="patch__fallback">
          <div className="patch__binary">
            バイナリファイルの変更です。差分は表示できません。
          </div>
          {feedback.map((item) => (
            <FeedbackCard
              feedback={item}
              key={item.id}
              targetLabel={feedbackTargetLabel(item)}
            />
          ))}
        </div>
      ) : rows.length === 0 || file.patch.trim().length === 0 ? (
        <div className="patch__fallback">
          <div className="patch__binary">表示できるテキスト差分はありません。</div>
          {feedback.map((item) => (
            <FeedbackCard
              feedback={item}
              key={item.id}
              targetLabel={feedbackTargetLabel(item)}
            />
          ))}
        </div>
      ) : (
        <div
          className="patch__viewport"
          role="region"
          aria-label={`${file.path} の差分`}
          tabIndex={0}
        >
          <div className="patch__review-guide">
            {readOnly
              ? "新しい変更があるため、このレビューは閲覧のみです。再レビューしてください。"
              : "行番号を押したままドラッグして、単一行または複数行へフィードバック"}
          </div>
          <div
            className="patch__table"
            onMouseLeave={finishDrag}
            onMouseMove={(event) => {
              if (!draggingRef.current) return;
              const target = (event.target as HTMLElement).closest<HTMLElement>(
                "[data-feedback-side]",
              );
              if (!target) return;
              const side = target.dataset.feedbackSide;
              const rowIndex = Number(target.dataset.rowIndex);
              const hunkId = Number(target.dataset.hunkId);
              if ((side === "old" || side === "new") && Number.isInteger(rowIndex)) {
                extendDrag(side, rowIndex, hunkId);
              }
            }}
            onMouseUp={finishDrag}
          >
            {feedbackPlacement.floating.map((item) => (
              <FeedbackCard
                feedback={item}
                key={item.id}
                targetLabel={`${feedbackTargetLabel(item)} · 差分外`}
              />
            ))}
            {rows.map((row, rowIndex) => {
              const rowFeedback = feedbackPlacement.byRow.get(row.id) ?? [];
              const firstIndex = selection
                ? Math.min(selection.startIndex, selection.endIndex)
                : -1;
              const lastIndex = selection
                ? Math.max(selection.startIndex, selection.endIndex)
                : -1;
              const rowSelected = Boolean(
                selection &&
                  row.hunkId === selection.hunkId &&
                  rowIndex >= firstIndex &&
                  rowIndex <= lastIndex &&
                  lineForSide(row, selection.side) !== null,
              );
              return (
                <Fragment key={row.id}>
                  <PatchRowView
                    newSelected={selection?.side === "new" && rowSelected}
                    oldSelected={selection?.side === "old" && rowSelected}
                    onBeginDrag={beginDrag}
                    onExtendDrag={extendDrag}
                    readOnly={readOnly}
                    row={row}
                    rowIndex={rowIndex}
                    rowSelected={rowSelected}
                  />
                  {rowFeedback.map((item) => (
                    <FeedbackCard
                      feedback={item}
                      key={item.id}
                      targetLabel={feedbackTargetLabel(item)}
                    />
                  ))}
                  {!readOnly &&
                  selection?.ready &&
                  selectedRange &&
                  selectedRange.anchorIndex === rowIndex ? (
                    <div className="patch__inline-composer">
                      <FeedbackComposer
                        autoFocus
                        disabled={readOnly}
                        onCancel={() => setSelection(null)}
                        onSubmit={async (body) => {
                          await onAddFeedback(selectedRange.scope, body);
                          setSelection(null);
                        }}
                        targetLabel={selectedRange.label}
                      />
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </details>
  );
});
