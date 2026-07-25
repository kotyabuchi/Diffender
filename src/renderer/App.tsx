import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CodexStatus,
  CodexThreadSummary,
  ImplementationAgent,
  ImplementationAgentDetection,
  ImplementationProgressEvent,
  ProjectRecord,
  ReviewFeedbackScope,
  ReviewGroup,
  ReviewProgressEvent,
  ReviewSnapshot,
  RiskLevel,
} from "../shared/contracts";
import {
  FeedbackCard,
  FeedbackComposer,
  PatchView,
} from "./components/PatchView";

type IconName =
  | "add"
  | "branch"
  | "check"
  | "chevron"
  | "close"
  | "folder"
  | "link"
  | "message"
  | "minimize"
  | "open"
  | "refresh"
  | "review"
  | "spark";

interface ErrorState {
  title: string;
  detail: string;
  retry?: () => void;
}

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "重大",
};

const REVIEW_STATUS_LABELS: Record<ProjectRecord["reviewStatus"], string> = {
  idle: "未レビュー",
  stale: "要更新",
  queued: "待機中",
  running: "レビュー中",
  complete: "確認済み",
  failed: "失敗",
};

const PROGRESS_LABELS: Record<ReviewProgressEvent["stage"], string> = {
  queued: "レビューを準備しています",
  reading: "変更内容を読み取っています",
  analyzing: "意図とリスクを分析しています",
  complete: "レビューが完了しました",
  failed: "レビューに失敗しました",
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    add: <path d="M12 5v14M5 12h14" />,
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10M8 9c5 0 8-1 8-3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    folder: <path d="M3 7.5h7l2-2h9v13H3z" />,
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
      </>
    ),
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
    minimize: (
      <>
        <path d="m14 10 7-7" />
        <path d="M20 10h-6V4" />
        <path d="m3 21 7-7" />
        <path d="M4 14h6v6" />
      </>
    ),
    open: (
      <>
        <path d="M14 4h6v6M20 4l-9 9" />
        <path d="M18 13v7H4V6h7" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 8A7.5 7.5 0 0 1 19.4 9.5M17.9 16A7.5 7.5 0 0 1 4.6 14.5" />
      </>
    ),
    review: (
      <>
        <path d="M4 4h16v13H8l-4 3z" />
        <path d="M8 8h8M8 12h5" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
        <path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={`icon icon--${name}`}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "予期しない問題が発生しました。";
}

function formatDate(value: string | null): string {
  if (!value) return "まだありません";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return path;
  return `…${path.includes("\\") ? "\\" : "/"}${parts.slice(-3).join(path.includes("\\") ? "\\" : "/")}`;
}

function replaceSetValue(
  previous: Set<string>,
  value: string,
  present: boolean,
): Set<string> {
  const next = new Set(previous);
  if (present) next.add(value);
  else next.delete(value);
  return next;
}

function progressToReviewStatus(
  stage: ReviewProgressEvent["stage"],
): ProjectRecord["reviewStatus"] {
  if (stage === "queued") return "queued";
  if (stage === "reading" || stage === "analyzing") return "running";
  if (stage === "complete") return "complete";
  return "failed";
}

function CodexIndicator({ status }: { status: CodexStatus | null }) {
  if (!status) {
    return (
      <div className="codex-status codex-status--loading" aria-label="Codex の状態を確認中">
        <span className="status-dot" />
        <span>Codex を確認中</span>
      </div>
    );
  }

  const ready =
    status.installed && status.authenticated && status.authMethod === "chatgpt";
  const label = !status.installed
    ? "Codex 未検出"
    : status.authenticated && status.authMethod === "chatgpt"
      ? "ChatGPT で接続"
      : status.authMethod === "api-key"
        ? "APIキーはレビュー非対応"
      : "Codex 要ログイン";

  return (
    <div
      className={`codex-status ${ready ? "codex-status--ready" : "codex-status--attention"}`}
      title={status.detail}
    >
      <span className="status-dot" />
      <span>{label}</span>
    </div>
  );
}

function ProjectItem({
  project,
  selected,
  progress,
  onSelect,
  onRemove,
}: {
  project: ProjectRecord;
  selected: boolean;
  progress?: ReviewProgressEvent;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const status = progress
    ? progressToReviewStatus(progress.stage)
    : project.reviewStatus;

  return (
    <div className={`project-item-shell ${selected ? "project-item-shell--selected" : ""}`}>
      <button
        aria-current={selected ? "page" : undefined}
        className="project-item"
        onClick={onSelect}
        type="button"
      >
        <span className="project-item__rail" aria-hidden="true" />
        <span className="project-item__topline">
          <strong>{project.name}</strong>
          {project.hasChanges ? (
            <span className="change-badge" title="未コミットの変更あり">
              変更
            </span>
          ) : null}
        </span>
        <span className="project-item__meta">
          <span>
            <Icon name="branch" size={13} />
            {project.branch ?? "ブランチ不明"}
          </span>
          <span className={`review-status review-status--${status}`}>
            {REVIEW_STATUS_LABELS[status]}
          </span>
        </span>
      </button>
      <button
        aria-label={`${project.name} を受信箱から削除`}
        className="project-item__remove"
        onClick={onRemove}
        title="受信箱から削除"
        type="button"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

function ErrorNotice({
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

function EmptyInbox({ onAdd }: { onAdd: () => void }) {
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

function LoadingWorkspace() {
  return (
    <div className="workspace workspace--loading" aria-label="レビューを読み込み中">
      <div className="skeleton skeleton--kicker" />
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--path" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--stat" />
        <div className="skeleton skeleton--stat" />
        <div className="skeleton skeleton--stat" />
      </div>
      <div className="skeleton skeleton--body" />
    </div>
  );
}

function NoReviewState({
  project,
  canReview,
  onRun,
}: {
  project: ProjectRecord;
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
          <p>新しい変更が入ったら、上部の「更新」で受信箱に反映できます。</p>
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
            レビューを実行するには、Codex CLIをインストールしてChatGPTでログインしてください。
            APIキー認証はこのアプリのレビューでは利用できません。
          </small>
        ) : null}
      </div>
    </section>
  );
}

function ReviewProgress({
  progress,
  onCancel,
}: {
  progress: ReviewProgressEvent | undefined;
  onCancel: () => void;
}) {
  const stage = progress?.stage ?? "queued";
  const step = stage === "queued" ? 1 : stage === "reading" ? 2 : 3;

  return (
    <section className="progress-panel" aria-live="polite">
      <div className="progress-panel__heading">
        <span className="progress-panel__spinner" aria-hidden="true" />
        <div>
          <span className="eyebrow">AIレビュー実行中</span>
          <h2>{PROGRESS_LABELS[stage]}</h2>
          <p>{progress?.message ?? "まもなく処理を開始します。"}</p>
        </div>
        <button className="secondary-button" onClick={onCancel} type="button">
          中止
        </button>
      </div>
      <ol className="progress-steps">
        {["準備", "差分の読取", "目的とリスクの分析"].map((label, index) => (
          <li className={index + 1 <= step ? "is-active" : ""} key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {label}
          </li>
        ))}
      </ol>
    </section>
  );
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={`risk-badge risk-badge--${risk}`}>
      <span className="risk-badge__dot" />
      リスク {RISK_LABELS[risk]}
    </span>
  );
}

function getReviewHeadline(summary: string): string {
  const normalized = summary.replace(/\s+/g, " ").trim();
  const punctuationIndex = normalized.search(/[。！？]/u);
  const firstSentence =
    punctuationIndex >= 0 ? normalized.slice(0, punctuationIndex + 1) : normalized;
  const headline = firstSentence
    .replace(/(?:でした|です)[。！？]?$/u, "")
    .replace(/[。！？]$/u, "");
  const characters = Array.from(headline);
  return characters.length > 64
    ? `${characters.slice(0, 64).join("")}…`
    : headline;
}

function countReviewHunks(snapshot: ReviewSnapshot): number {
  return snapshot.files.reduce(
    (total, file) => total + (file.patch.match(/^@@/gm)?.length ?? 0),
    0,
  );
}

function ReviewOverviewHeader({
  snapshot,
  stale,
}: {
  snapshot: ReviewSnapshot;
  stale: boolean;
}) {
  const metrics = useMemo(() => {
    const approved = snapshot.groups.filter((group) => group.approved).length;
    return {
      approved,
      hunks: countReviewHunks(snapshot),
      approvalPercentage:
        snapshot.groups.length === 0
          ? 0
          : Math.round((approved / snapshot.groups.length) * 100),
    };
  }, [snapshot]);

  return (
    <header className="review-overview-header">
      <div className="review-overview-header__title">
        <span>
          レビュー概要
          {stale ? <b>要更新</b> : null}
        </span>
        <strong title={snapshot.summary}>{getReviewHeadline(snapshot.summary)}</strong>
      </div>
      <div className="review-overview-header__status">
        <div
          aria-label={`${snapshot.files.length}ファイル、${metrics.hunks}チャンク、追加${snapshot.additions}行、削除${snapshot.deletions}行`}
          className="diff-volume"
        >
          <span>
            <b>{snapshot.files.length}</b> files
          </span>
          <i aria-hidden="true">/</i>
          <span>
            <b>{metrics.hunks}</b> hunks
          </span>
          <strong className="diff-volume__additions">+{snapshot.additions}</strong>
          <strong className="diff-volume__deletions">−{snapshot.deletions}</strong>
        </div>
        <div className="approval-progress">
          <span
            aria-label={`承認済み ${metrics.approved} / ${snapshot.groups.length}`}
            aria-valuemax={snapshot.groups.length}
            aria-valuemin={0}
            aria-valuenow={metrics.approved}
            className="approval-progress__track"
            role="progressbar"
          >
            <span style={{ width: `${metrics.approvalPercentage}%` }} />
          </span>
          <strong>
            承認 <span>{metrics.approved}/{snapshot.groups.length}</span>
          </strong>
        </div>
      </div>
    </header>
  );
}

function ReviewToc({ groups }: { groups: ReviewGroup[] }) {
  const entries = useMemo(
    () => [
      { id: "review-summary", label: "レビュー要約", number: "00" },
      ...groups.map((group, index) => ({
        id: `review-group-${index + 1}`,
        label: group.title,
        number: String(index + 1).padStart(2, "0"),
      })),
    ],
    [groups],
  );
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "review-summary");

  useEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>(".main-pane");
    const sections = entries.flatMap((entry) => {
      const element = document.getElementById(entry.id);
      return element ? [element] : [];
    });
    if (!scrollRoot || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (observedEntries) => {
        const visibleEntry = observedEntries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top) -
              Math.abs(right.boundingClientRect.top),
          )[0];
        if (visibleEntry?.target.id) setActiveId(visibleEntry.target.id);
      },
      {
        root: scrollRoot,
        rootMargin: "-104px 0px -68% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <aside className="review-toc" aria-label="レビューの目次">
      <div className="review-toc__heading">
        <span>目次</span>
        <span>{String(entries.length).padStart(2, "0")}</span>
      </div>
      <nav>
        {entries.map((entry) => {
          const active = activeId === entry.id;
          return (
            <button
              aria-current={active ? "location" : undefined}
              className={active ? "is-active" : ""}
              key={entry.id}
              onClick={() => {
                setActiveId(entry.id);
                document.getElementById(entry.id)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              type="button"
            >
              <span>{entry.number}</span>
              <strong>{entry.label}</strong>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function FindingNote({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (note: string) => Promise<void>;
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
        disabled={value === savedValue || saveState === "saving"}
        onClick={() => void save()}
        type="button"
      >
        メモを保存
      </button>
    </div>
  );
}

function feedbackScopesMatch(
  left: ReviewFeedbackScope,
  right: ReviewFeedbackScope,
) {
  if (left.type !== right.type) return false;
  if (left.type === "group" || right.type === "group") return true;
  return (
    left.file === right.file &&
    left.side === right.side &&
    left.startLine === right.startLine &&
    left.endLine === right.endLine
  );
}

function SuggestionFeedbackButton({
  feedbackId,
  onAdd,
  onRemove,
}: {
  feedbackId?: string;
  onAdd: () => Promise<void>;
  onRemove: (feedbackId: string) => Promise<void>;
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
        disabled={state === "saving"}
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

function ReviewGroupSection({
  group,
  index,
  snapshot,
  approvalPending,
  sectionId,
  onApprove,
  onSaveFindingNote,
  onAddFeedback,
  onRemoveFeedback,
}: {
  group: ReviewGroup;
  index: number;
  snapshot: ReviewSnapshot;
  approvalPending: boolean;
  sectionId: string;
  onApprove: (group: ReviewGroup) => void;
  onSaveFindingNote: (findingId: string, note: string) => Promise<void>;
  onAddFeedback: (
    groupId: string,
    scope: ReviewFeedbackScope,
    body: string,
  ) => Promise<void>;
  onRemoveFeedback: (groupId: string, feedbackId: string) => Promise<void>;
}) {
  const filesByPath = useMemo(
    () => new Map(snapshot.files.map((file) => [file.path, file])),
    [snapshot.files],
  );
  const groupFiles = useMemo(
    () =>
      group.filePaths.flatMap((path) => {
        const file = filesByPath.get(path);
        return file ? [file] : [];
      }),
    [filesByPath, group.filePaths],
  );
  const { groupFeedback, lineFeedbackByFile } = useMemo(() => {
    const wholeGroup = [] as NonNullable<ReviewGroup["feedback"]>;
    const byFile = new Map<string, NonNullable<ReviewGroup["feedback"]>>();
    for (const item of group.feedback ?? []) {
      if (item.scope.type === "group") {
        wholeGroup.push(item);
        continue;
      }
      const fileFeedback = byFile.get(item.scope.file) ?? [];
      fileFeedback.push(item);
      byFile.set(item.scope.file, fileFeedback);
    }
    return { groupFeedback: wholeGroup, lineFeedbackByFile: byFile };
  }, [group.feedback]);
  const addGroupFeedback = useCallback(
    (scope: ReviewFeedbackScope, body: string) => onAddFeedback(group.id, scope, body),
    [group.id, onAddFeedback],
  );
  const addWholeGroupFeedback = useCallback(
    (body: string) => addGroupFeedback({ type: "group" }, body),
    [addGroupFeedback],
  );

  return (
    <article
      className={`review-group review-group--${group.risk}`}
      id={sectionId}
    >
      <header className="review-group__header">
        <div className="review-group__ordinal" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="review-group__title">
          <div className="review-group__badges">
            <span className="category-label">{group.category}</span>
            <RiskBadge risk={group.risk} />
          </div>
          <h2>{group.title}</h2>
          <p>{group.intent}</p>
        </div>
        <button
          aria-pressed={group.approved}
          className={`approval-button ${group.approved ? "approval-button--approved" : ""}`}
          disabled={approvalPending}
          onClick={() => onApprove(group)}
          type="button"
        >
          <span className="approval-button__box">
            {group.approved ? <Icon name="check" size={14} /> : null}
          </span>
          {approvalPending ? "保存中…" : group.approved ? "承認済み" : "この変更を承認"}
        </button>
      </header>

      <div className="review-group__facts">
        <span>{group.filePaths.length} ファイル</span>
        <span>{group.findings.length} 件のAI指摘</span>
        <span>{(group.feedback ?? []).length} 件のフィードバック</span>
      </div>

      {group.findings.length > 0 ? (
        <section className="findings" aria-label={`${group.title} のAI指摘`}>
          <div className="section-rule">
            <span>AIレビューコメント</span>
            <span>{String(group.findings.length).padStart(2, "0")}</span>
          </div>
          {group.findings.map((finding) => {
            const feedbackScope: ReviewFeedbackScope =
              finding.line && group.filePaths.includes(finding.file)
                ? {
                    type: "lines",
                    file: finding.file,
                    side: "new",
                    startLine: finding.line,
                    endLine: finding.line,
                  }
                : { type: "group" };
            const suggestionFeedback = (group.feedback ?? []).find(
              (feedback) =>
                feedback.body === finding.suggestion &&
                feedbackScopesMatch(feedback.scope, feedbackScope),
            );

            return (
              <article className={`finding finding--${finding.severity}`} key={finding.id}>
                <div className="finding__location">
                  <RiskBadge risk={finding.severity} />
                  <span title={finding.file}>
                    {finding.file}
                    {finding.line ? `:${finding.line}` : ""}
                  </span>
                </div>
                <h3>{finding.title}</h3>
                <p>{finding.reason}</p>
                <div className="finding__suggestion">
                  <div className="finding__suggestion-header">
                    <span>提案</span>
                    <SuggestionFeedbackButton
                      feedbackId={suggestionFeedback?.id}
                      onAdd={() =>
                        addGroupFeedback(feedbackScope, finding.suggestion)
                      }
                      onRemove={(feedbackId) =>
                        onRemoveFeedback(group.id, feedbackId)
                      }
                    />
                  </div>
                  <p>{finding.suggestion}</p>
                </div>
                <FindingNote
                  initialValue={finding.reviewerNote ?? ""}
                  onSave={(note) => onSaveFindingNote(finding.id, note)}
                />
              </article>
            );
          })}
        </section>
      ) : (
        <div className="no-findings">
          <Icon name="check" size={16} />
          このまとまりにAIからの指摘はありません
        </div>
      )}

      <section className="group-feedback" aria-label={`${group.title} 全体へのフィードバック`}>
        <div className="section-rule">
          <span>この目的全体へのフィードバック</span>
          <span>{String(groupFeedback.length).padStart(2, "0")}</span>
        </div>
        {groupFeedback.map((item) => (
          <FeedbackCard feedback={item} key={item.id} targetLabel="目的全体" />
        ))}
        <FeedbackComposer
          onSubmit={addWholeGroupFeedback}
          targetLabel="この目的全体"
        />
      </section>

      <section className="file-changes" aria-label={`${group.title} のファイル差分`}>
        <div className="section-rule">
          <span>変更内容</span>
          <span>{String(groupFiles.length).padStart(2, "0")}</span>
        </div>
        {groupFiles.map((file, fileIndex) => {
          const fileFeedback = lineFeedbackByFile.get(file.path) ?? [];
          return (
            <PatchView
              defaultOpen={
                fileFeedback.length > 0 ||
                (fileIndex === 0 && (group.risk === "critical" || group.risk === "high"))
              }
              feedback={fileFeedback}
              file={file}
              key={file.path}
              onAddFeedback={addGroupFeedback}
            />
          );
        })}
        {groupFiles.length === 0 ? (
          <p className="muted-message">この変更に対応する差分を取得できませんでした。</p>
        ) : null}
      </section>
    </article>
  );
}

function CodexHandoff({
  project,
  snapshot,
  taskProgress,
  onProjectUpdated,
  onError,
}: {
  project: ProjectRecord;
  snapshot: ReviewSnapshot;
  taskProgress?: ImplementationProgressEvent;
  onProjectUpdated: (project: ProjectRecord) => void;
  onError: (title: string, error: unknown) => void;
}) {
  const [tasks, setTasks] = useState<CodexThreadSummary[]>([]);
  const [includeAll, setIncludeAll] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [busy, setBusy] = useState<
    "detect" | "create" | "link" | "copy" | "send" | "unlink" | null
  >("detect");
  const [manualThreadId, setManualThreadId] = useState("");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [detection, setDetection] =
    useState<ImplementationAgentDetection | null>(null);

  const loadTasks = useCallback(
    async (all: boolean) => {
      setLoadingTasks(true);
      setMessage("");
      try {
        setTasks(await window.diffender.codex.tasks(project.id, all));
      } catch (caught) {
        onError("Codexタスクを読み込めませんでした", caught);
      } finally {
        setLoadingTasks(false);
      }
    },
    [onError, project.id],
  );

  useEffect(() => {
    let active = true;
    setTasks([]);
    setIncludeAll(false);
    setManualThreadId("");
    setMessage("");
    setExpanded(false);
    setDetection(null);
    setBusy("detect");
    void window.diffender.implementations
      .detect(project.id)
      .then((result) => {
        if (!active) return;
        setDetection(result);
        if (result.selected === "codex") void loadTasks(false);
      })
      .catch((caught) => {
        if (active) onError("実装エージェントを判別できませんでした", caught);
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [loadTasks, onError, project.id]);

  const selectAgent = useCallback(
    async (agent: ImplementationAgent | null) => {
      setBusy("detect");
      setMessage("");
      try {
        const updated = await window.diffender.implementations.select(
          project.id,
          agent,
        );
        onProjectUpdated(updated);
        const result = await window.diffender.implementations.detect(project.id);
        setDetection(result);
        if (result.selected === "codex") await loadTasks(includeAll);
        setMessage(
          agent
            ? `実装先を${implementationAgentLabel(agent)}に設定しました。`
            : "実装先を自動判定に戻しました。",
        );
      } catch (caught) {
        onError("実装エージェントを変更できませんでした", caught);
      } finally {
        setBusy(null);
      }
    },
    [includeAll, loadTasks, onError, onProjectUpdated, project.id],
  );

  const linkTask = useCallback(
    async (threadId: string) => {
      if (!threadId) return;
      setBusy("link");
      setMessage("");
      try {
        const result = await window.diffender.codex.linkTask(
          project.id,
          threadId.trim(),
        );
        const updated = await window.diffender.implementations.select(
          project.id,
          "codex",
        );
        onProjectUpdated(updated);
        setDetection(await window.diffender.implementations.detect(project.id));
        setTasks((previous) => [
          result.thread,
          ...previous.filter((thread) => thread.id !== result.thread.id),
        ]);
        setManualThreadId("");
        setMessage("Codexタスクを紐付けました。");
      } catch (caught) {
        onError("Codexタスクを紐付けできませんでした", caught);
      } finally {
        setBusy(null);
      }
    },
    [onError, onProjectUpdated, project.id],
  );

  const createTask = useCallback(async () => {
    setBusy("create");
    setMessage("");
    try {
      const result = await window.diffender.codex.createTask(project.id);
      const updated = await window.diffender.implementations.select(
        project.id,
        "codex",
      );
      onProjectUpdated(updated);
      setDetection(await window.diffender.implementations.detect(project.id));
      setTasks((previous) => [
        result.thread,
        ...previous.filter((thread) => thread.id !== result.thread.id),
      ]);
      setMessage("このプロジェクト用のCodexタスクを作成しました。");
    } catch (caught) {
      onError("Codexタスクを作成できませんでした", caught);
    } finally {
      setBusy(null);
    }
  }, [onError, onProjectUpdated, project.id]);

  const unlinkTask = useCallback(async () => {
    setBusy("unlink");
    try {
      onProjectUpdated(await window.diffender.codex.unlinkTask(project.id));
      setMessage("Codexタスクの紐付けを解除しました。");
    } catch (caught) {
      onError("紐付けを解除できませんでした", caught);
    } finally {
      setBusy(null);
    }
  }, [onError, onProjectUpdated, project.id]);

  const copyFeedback = useCallback(async () => {
    setBusy("copy");
    try {
      await window.diffender.codex.copyFeedback(project.id, snapshot.id);
      setMessage("フィードバックをクリップボードにコピーしました。");
    } catch (caught) {
      onError("フィードバックをコピーできませんでした", caught);
    } finally {
      setBusy(null);
    }
  }, [onError, project.id, snapshot.id]);

  const sendFeedback = useCallback(async () => {
    const agent = detection?.selected;
    if (!agent) return;
    const destination =
      agent === "codex"
        ? "紐付けたCodexタスク"
        : "このプロジェクトのClaude Code直近セッション";
    const confirmed = window.confirm(
      `保存したフィードバックを${destination}へ送り、修正を開始しますか？\n対象プロジェクト内のファイルが変更される可能性があります。`,
    );
    if (!confirmed) return;
    setBusy("send");
    setMessage("");
    try {
      await window.diffender.implementations.sendFeedback(
        project.id,
        snapshot.id,
      );
      setMessage(
        `${implementationAgentLabel(agent)}へフィードバックを送信しました。`,
      );
    } catch (caught) {
      onError(`${implementationAgentLabel(agent)}へ送信できませんでした`, caught);
    } finally {
      setBusy(null);
    }
  }, [detection?.selected, onError, project.id, snapshot.id]);

  const linked = project.codexThreadId
    ? tasks.find((task) => task.id === project.codexThreadId)
    : undefined;
  const implementationRunning =
    taskProgress?.status === "started";
  const selectedAgent = detection?.selected ?? null;
  const agentAvailable =
    selectedAgent === "codex"
      ? Boolean(detection?.codexInstalled && project.codexThreadId)
      : selectedAgent === "claude"
        ? Boolean(detection?.claudeInstalled)
        : false;

  if (!expanded) {
    return (
      <button
        aria-label="フィードバックを開く"
        className="feedback-launcher"
        onClick={() => setExpanded(true)}
        title="フィードバックを開く"
        type="button"
      >
        <Icon name="message" size={22} />
      </button>
    );
  }

  return (
    <section className="codex-handoff" aria-label="フィードバック">
      <div className="codex-handoff__heading">
        <h2>フィードバック</h2>
        <div className="codex-handoff__heading-actions">
          <label className="implementation-agent-select">
            <span>
              {detection?.source === "manual"
                ? "手動指定"
                : detection?.source === "auto"
                  ? "自動判定"
                  : detection
                    ? "未判定"
                    : "判別中"}
            </span>
            <select
              aria-label="実装エージェント"
              disabled={busy !== null || implementationRunning}
              onChange={(event) =>
                void selectAgent(
                  event.target.value === "auto"
                    ? null
                    : (event.target.value as ImplementationAgent),
                )
              }
              value={project.implementationAgent ?? "auto"}
            >
              <option value="auto">
                自動
                {detection?.recommended
                  ? `: ${implementationAgentLabel(detection.recommended)}`
                  : ""}
              </option>
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option>
            </select>
          </label>
          <button
            aria-label="フィードバックを閉じる"
            className="icon-button codex-handoff__minimize"
            onClick={() => setExpanded(false)}
            title="フィードバックを閉じる"
            type="button"
          >
            <Icon name="minimize" size={17} />
          </button>
        </div>
      </div>

      <div
        className={`implementation-agent implementation-agent--${
          selectedAgent ?? "unknown"
        }`}
        title={detection?.reasons.join("\n")}
      >
        <span className="implementation-agent__mark" aria-hidden="true">
          {selectedAgent === "codex"
            ? "CX"
            : selectedAgent === "claude"
              ? "CL"
              : "?"}
        </span>
        <div>
          <strong>
            {selectedAgent
              ? implementationAgentLabel(selectedAgent)
              : "実装先を選択"}
          </strong>
          <span>
            {selectedAgent === "codex"
              ? project.codexThreadId
                ? linked?.title ?? "Codexタスク紐付け済み"
                : "送信前にCodexタスクを設定"
              : selectedAgent === "claude"
                ? detection?.claudeInstalled
                  ? "このプロジェクトの直近セッションへ送信"
                  : "Claude Code CLIが見つかりません"
                : "候補を判別できませんでした"}
          </span>
        </div>
      </div>

      {selectedAgent === "codex" ? (
        <details className="codex-handoff__settings" open={!project.codexThreadId}>
          <summary>Codexタスク設定</summary>
          <div className="codex-handoff__settings-content">
      <div className="codex-handoff__picker">
        <button
          aria-label={loadingTasks ? "タスク一覧を更新中" : "タスク一覧を更新"}
          className="secondary-button codex-handoff__refresh-button"
          disabled={busy !== null || loadingTasks}
          onClick={() => void loadTasks(includeAll)}
          title={loadingTasks ? "更新中…" : "タスク一覧を更新"}
          type="button"
        >
          <Icon name="refresh" size={16} />
        </button>
        <select
          aria-label="Codexタスクを選択"
          disabled={busy !== null || loadingTasks}
          onChange={(event) => void linkTask(event.target.value)}
          value={project.codexThreadId ?? ""}
        >
          <option value="">
            {loadingTasks ? "読み込み中…" : "タスクを選択"}
          </option>
          {project.codexThreadId && !linked ? (
            <option value={project.codexThreadId}>
              紐付け済み: {project.codexThreadId.slice(0, 13)}…
            </option>
          ) : null}
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title} — {formatDate(task.updatedAt)}
            </option>
          ))}
        </select>
        <button
          className="secondary-button codex-handoff__new-task-button"
          disabled={busy !== null}
          onClick={() => void createTask()}
          type="button"
        >
          <Icon name="add" size={16} />
          {busy === "create" ? "作成中…" : "新規タスク"}
        </button>
      </div>

      <label className="codex-handoff__scope">
        <input
          checked={includeAll}
          onChange={(event) => {
            const checked = event.target.checked;
            setIncludeAll(checked);
            void loadTasks(checked);
          }}
          type="checkbox"
        />
        別のフォルダで始めた最近のCodexタスクも表示
      </label>

      <details className="codex-handoff__manual">
        <summary>タスクIDを直接入力</summary>
        <div>
          <input
            aria-label="CodexタスクID"
            onChange={(event) => setManualThreadId(event.target.value)}
            placeholder="例: 019f9370-…"
            value={manualThreadId}
          />
          <button
            className="secondary-button"
            disabled={!manualThreadId.trim() || busy !== null}
            onClick={() => void linkTask(manualThreadId)}
            type="button"
          >
            紐付ける
          </button>
        </div>
      </details>

      {project.codexThreadId ? (
        <div className="codex-handoff__linked">
          <div>
            <strong>{linked?.title ?? "紐付け済みのCodexタスク"}</strong>
            <span>{project.codexThreadId}</span>
          </div>
          <button
            className="text-button"
            onClick={() =>
              void window.diffender.codex.openTask(project.codexThreadId!)
            }
            type="button"
          >
            <Icon name="open" size={15} />
            Codex Appで開く
          </button>
          <button
            className="text-button text-button--danger"
            disabled={busy !== null || implementationRunning}
            onClick={() => void unlinkTask()}
            type="button"
          >
            解除
          </button>
        </div>
      ) : null}
          </div>
        </details>
      ) : selectedAgent === "claude" ? (
        <p className="codex-handoff__description">
          Claude Code CLIの直近セッションを、このプロジェクトの作業フォルダで継続します。
          APIキー環境変数は引き継がず、危険な権限スキップも使用しません。
        </p>
      ) : (
        <p className="codex-handoff__description">
          CodexまたはClaude Codeを選ぶと、保存したフィードバックを直接送信できます。
        </p>
      )}

      <div className="codex-handoff__actions">
        <button
          className="secondary-button"
          disabled={busy !== null}
          onClick={() => void copyFeedback()}
          type="button"
        >
          {busy === "copy" ? "生成中…" : "クリップボードにコピー"}
        </button>
        <button
          className="primary-button"
          disabled={!agentAvailable || busy !== null || implementationRunning}
          onClick={() => void sendFeedback()}
          type="button"
        >
          <Icon name="spark" size={16} />
          {implementationRunning
            ? `${selectedAgent ? implementationAgentLabel(selectedAgent) : "AI"}が修正中`
            : busy === "send"
              ? "送信中…"
              : "フィードバックを送る"}
        </button>
      </div>

      <p
        className={`codex-handoff__message ${
          taskProgress?.status === "failed" ? "is-error" : ""
        }`}
        aria-live="polite"
      >
        {taskProgress?.message ?? message}
      </p>
    </section>
  );
}

function implementationAgentLabel(agent: ImplementationAgent): string {
  return agent === "codex" ? "Codex" : "Claude Code";
}

function ReviewReport({
  project,
  snapshot,
  stale,
  approvalPending,
  onApprove,
  onSaveFindingNote,
  onAddFeedback,
  onRemoveFeedback,
}: {
  project: ProjectRecord;
  snapshot: ReviewSnapshot;
  stale: boolean;
  approvalPending: string | null;
  onApprove: (group: ReviewGroup) => void;
  onSaveFindingNote: (findingId: string, note: string) => Promise<void>;
  onAddFeedback: (
    groupId: string,
    scope: ReviewFeedbackScope,
    body: string,
  ) => Promise<void>;
  onRemoveFeedback: (groupId: string, feedbackId: string) => Promise<void>;
}) {
  const statistics = useMemo(() => {
    let findings = 0;
    let highRisk = 0;
    let approved = 0;

    for (const group of snapshot.groups) {
      findings += group.findings.length;
      if (group.risk === "high" || group.risk === "critical") highRisk += 1;
      if (group.approved) approved += 1;
    }

    return { findings, highRisk, approved };
  }, [snapshot.groups]);

  return (
    <div className="review-layout">
      <ReviewToc groups={snapshot.groups} />
      <div className="review-document">
      {stale ? (
        <div className="stale-banner">
          <span>変更あり</span>
          このレビューの後に差分が更新されています。再レビューで最新状態を確認してください。
        </div>
      ) : null}

      <section className="review-summary" id="review-summary">
        <div className="review-summary__label">
          <span className="eyebrow">AIレビュー要約</span>
          <span className="review-summary__source">
            {snapshot.source === "cache" ? "キャッシュから表示" : "Codexによる分析"}
          </span>
        </div>
        <p className="review-summary__text">{snapshot.summary}</p>
        <dl className="summary-stats">
          <div>
            <dt>変更のまとまり</dt>
            <dd>{snapshot.groups.length}</dd>
          </div>
          <div>
            <dt>確認ポイント</dt>
            <dd>{statistics.findings}</dd>
          </div>
          <div>
            <dt>高リスク以上</dt>
            <dd>{statistics.highRisk}</dd>
          </div>
          <div>
            <dt>承認済み</dt>
            <dd>
              {statistics.approved}
              <small> / {snapshot.groups.length}</small>
            </dd>
          </div>
          <div className="summary-stats__delta">
            <dt>{snapshot.files.length} ファイル</dt>
            <dd>
              <span>+{snapshot.additions}</span>
              <span>−{snapshot.deletions}</span>
            </dd>
          </div>
        </dl>
        <footer className="review-summary__footer">
          <span>レビュー日時 {formatDate(snapshot.createdAt)}</span>
          <span>{project.branch ?? "ブランチ不明"}</span>
        </footer>
      </section>

      <div className="groups-heading">
        <div>
          <span className="eyebrow">変更グループ</span>
          <h2>目的ごとの変更</h2>
        </div>
        <p>ファイル単位ではなく、ひとつの目的を持つ変更として整理しています。</p>
      </div>

      <div className="review-groups">
        {snapshot.groups.map((group, index) => (
          <ReviewGroupSection
            approvalPending={approvalPending === group.id}
            group={group}
            index={index}
            key={group.id}
            onAddFeedback={onAddFeedback}
            onApprove={onApprove}
            onRemoveFeedback={onRemoveFeedback}
            onSaveFindingNote={onSaveFindingNote}
            sectionId={`review-group-${index + 1}`}
            snapshot={snapshot}
          />
        ))}
        {snapshot.groups.length === 0 ? (
          <section className="quiet-state">
            <span className="quiet-state__seal">
              <Icon name="check" size={26} />
            </span>
            <div>
              <h2>目的としてまとめられる変更はありませんでした</h2>
              <p>差分はありますが、レビュー対象となる変更グループはありません。</p>
            </div>
          </section>
        ) : null}
      </div>
      </div>
    </div>
  );
}

export function App() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyProjectIds, setBusyProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [progressByProject, setProgressByProject] = useState<
    Record<string, ReviewProgressEvent>
  >({});
  const [taskProgressByProject, setTaskProgressByProject] = useState<
    Record<string, ImplementationProgressEvent>
  >({});
  const [approvalPending, setApprovalPending] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const snapshotRequest = useRef(0);
  const selectedProjectIdRef = useRef<string | null>(null);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProgress = selectedProjectId
    ? progressByProject[selectedProjectId]
    : undefined;
  const isReviewing = selectedProjectId
    ? busyProjectIds.has(selectedProjectId)
    : false;
  const canReview = Boolean(
    codexStatus?.installed &&
      codexStatus.authenticated &&
      codexStatus.authMethod === "chatgpt",
  );

  const showError = useCallback(
    (title: string, caught: unknown, retry?: () => void) => {
      setError({ title, detail: getErrorMessage(caught), retry });
    },
    [],
  );

  const loadSnapshot = useCallback(
    async (projectId: string) => {
      const requestId = snapshotRequest.current + 1;
      snapshotRequest.current = requestId;
      setSnapshotLoading(true);
      setSnapshot(null);

      try {
        const current = await window.diffender.reviews.current(projectId);
        if (snapshotRequest.current === requestId) setSnapshot(current);
      } catch (caught) {
        if (snapshotRequest.current === requestId) {
          showError("レビューを読み込めませんでした", caught, () => {
            void loadSnapshot(projectId);
          });
        }
      } finally {
        if (snapshotRequest.current === requestId) setSnapshotLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const [projectList, status] = await Promise.all([
          window.diffender.projects.refresh(),
          window.diffender.codex.status(),
        ]);
        if (!active) return;
        setProjects(projectList);
        setCodexStatus(status);
        setSelectedProjectId((current) => {
          if (current && projectList.some((project) => project.id === current)) {
            return current;
          }
          return projectList[0]?.id ?? null;
        });
      } catch (caught) {
        if (active) {
          showError("受信箱を開けませんでした", caught, () => {
            window.location.reload();
          });
        }
      } finally {
        if (active) setInitializing(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [showError]);

  useEffect(() => {
    return window.diffender.reviews.onProgress((event) => {
      setProgressByProject((previous) => ({
        ...previous,
        [event.projectId]: event,
      }));
      setProjects((previous) =>
        previous.map((project) =>
          project.id === event.projectId
            ? { ...project, reviewStatus: progressToReviewStatus(event.stage) }
            : project,
        ),
      );
      setBusyProjectIds((previous) =>
        replaceSetValue(
          previous,
          event.projectId,
          event.stage !== "complete" && event.stage !== "failed",
        ),
      );
    });
  }, []);

  useEffect(() => {
    return window.diffender.implementations.onProgress((event) => {
      setTaskProgressByProject((previous) => ({
        ...previous,
        [event.projectId]: event,
      }));
    });
  }, []);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      snapshotRequest.current += 1;
      setSnapshot(null);
      setSnapshotLoading(false);
      return;
    }
    void loadSnapshot(selectedProjectId);
  }, [loadSnapshot, selectedProjectId]);

  const refreshProjects = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [projectList, status] = await Promise.all([
        window.diffender.projects.refresh(),
        window.diffender.codex.status(),
      ]);
      setProjects(projectList);
      setCodexStatus(status);
      const current = selectedProjectIdRef.current;
      if (current && projectList.some((project) => project.id === current)) {
        await loadSnapshot(current);
      } else {
        setSelectedProjectId(projectList[0]?.id ?? null);
      }
    } catch (caught) {
      showError("プロジェクトを更新できませんでした", caught, () => {
        void refreshProjects();
      });
    } finally {
      setRefreshing(false);
    }
  }, [loadSnapshot, showError]);

  const addProject = useCallback(async () => {
    setError(null);
    try {
      const project = await window.diffender.projects.add();
      if (!project) return;
      setProjects((previous) => [
        project,
        ...previous.filter((item) => item.id !== project.id),
      ]);
      setSelectedProjectId(project.id);
    } catch (caught) {
      showError("プロジェクトを追加できませんでした", caught, () => {
        void addProject();
      });
    }
  }, [showError]);

  const removeProject = useCallback(
    async (project: ProjectRecord) => {
      const confirmed = window.confirm(
        `「${project.name}」を受信箱から削除しますか？\nプロジェクトのファイル自体は削除されません。`,
      );
      if (!confirmed) return;

      setError(null);
      try {
        await window.diffender.projects.remove(project.id);
        const remaining = projects.filter((item) => item.id !== project.id);
        setProjects(remaining);
        if (selectedProjectIdRef.current === project.id) {
          setSelectedProjectId(remaining[0]?.id ?? null);
        }
      } catch (caught) {
        showError("プロジェクトを受信箱から削除できませんでした", caught, () => {
          void removeProject(project);
        });
      }
    },
    [projects, showError],
  );

  const runReview = useCallback(async () => {
    if (!selectedProject) return;
    const projectId = selectedProject.id;

    setError(null);
    setBusyProjectIds((previous) => replaceSetValue(previous, projectId, true));
    setProgressByProject((previous) => ({
      ...previous,
      [projectId]: {
        projectId,
        stage: "queued",
        message: "レビューをキューに追加しました。",
      },
    }));
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId ? { ...project, reviewStatus: "queued" } : project,
      ),
    );

    try {
      const review = await window.diffender.reviews.run(projectId);
      if (selectedProjectIdRef.current === projectId) setSnapshot(review);
      setProjects((previous) =>
        previous.map((project) =>
          project.id === projectId
            ? {
                ...project,
                reviewStatus: "complete",
                lastReviewedAt: review.createdAt,
              }
            : project,
        ),
      );
      try {
        const refreshed = await window.diffender.projects.refresh(projectId);
        setProjects(refreshed);
      } catch {
        // The completed review is already usable; a later toolbar refresh can resync metadata.
      }
    } catch (caught) {
      setProjects((previous) =>
        previous.map((project) =>
          project.id === projectId ? { ...project, reviewStatus: "failed" } : project,
        ),
      );
      showError("AIレビューを完了できませんでした", caught, () => {
        void runReview();
      });
    } finally {
      setBusyProjectIds((previous) => replaceSetValue(previous, projectId, false));
    }
  }, [selectedProject, showError]);

  const cancelReview = useCallback(async () => {
    if (!selectedProject) return;
    const projectId = selectedProject.id;

    try {
      await window.diffender.reviews.cancel(projectId);
      setBusyProjectIds((previous) => replaceSetValue(previous, projectId, false));
      setProgressByProject((previous) => {
        const next = { ...previous };
        delete next[projectId];
        return next;
      });
      const refreshed = await window.diffender.projects.refresh(projectId);
      setProjects(refreshed);
    } catch (caught) {
      showError("レビューを中止できませんでした", caught, () => {
        void cancelReview();
      });
    }
  }, [selectedProject, showError]);

  const approveGroup = useCallback(
    async (group: ReviewGroup) => {
      if (!selectedProject || !snapshot) return;
      setApprovalPending(group.id);
      setError(null);
      try {
        const updated = await window.diffender.reviews.approve(
          selectedProject.id,
          snapshot.id,
          group.id,
          !group.approved,
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("承認状態を保存できませんでした", caught, () => {
          void approveGroup(group);
        });
      } finally {
        setApprovalPending(null);
      }
    },
    [selectedProject, showError, snapshot],
  );

  const saveFindingNote = useCallback(
    async (findingId: string, note: string) => {
      if (!selectedProject || !snapshot) return;
      try {
        const updated = await window.diffender.reviews.saveFindingNote(
          selectedProject.id,
          snapshot.id,
          findingId,
          note,
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("メモを保存できませんでした", caught);
        throw caught;
      }
    },
    [selectedProject, showError, snapshot],
  );


  const addFeedback = useCallback(
    async (groupId: string, scope: ReviewFeedbackScope, body: string) => {
      if (!selectedProject || !snapshot) return;
      try {
        const updated = await window.diffender.reviews.addFeedback(
          selectedProject.id,
          snapshot.id,
          groupId,
          { scope, body },
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("フィードバックを保存できませんでした", caught);
        throw caught;
      }
    },
    [selectedProject, showError, snapshot],
  );

  const removeFeedback = useCallback(
    async (groupId: string, feedbackId: string) => {
      if (!selectedProject || !snapshot) return;
      try {
        const updated = await window.diffender.reviews.removeFeedback(
          selectedProject.id,
          snapshot.id,
          groupId,
          feedbackId,
        );
        if (selectedProjectIdRef.current === selectedProject.id) {
          setSnapshot(updated);
        }
      } catch (caught) {
        showError("フィードバックを解除できませんでした", caught);
        throw caught;
      }
    },
    [selectedProject, showError, snapshot],
  );

  const updateProject = useCallback((updated: ProjectRecord) => {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === updated.id ? updated : project,
      ),
    );
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            R
          </span>
          <div>
            <strong>Diffender</strong>
            <span>ローカル変更レビュー</span>
          </div>
        </div>
        <div className="topbar__actions">
          <CodexIndicator status={codexStatus} />
          <button
            className="toolbar-button"
            disabled={refreshing || initializing}
            onClick={() => void refreshProjects()}
            type="button"
          >
            <span className={refreshing ? "is-spinning" : ""}>
              <Icon name="refresh" />
            </span>
            {refreshing ? "更新中" : "更新"}
          </button>
          <button className="primary-button" onClick={() => void addProject()} type="button">
            <Icon name="add" />
            プロジェクト追加
          </button>
        </div>
      </header>

      {initializing ? (
        <div className="loading-screen">
          <span className="progress-panel__spinner" />
          受信箱を準備しています
        </div>
      ) : projects.length === 0 ? (
        <>
          {error ? (
            <div className="global-error">
              <ErrorNotice error={error} onDismiss={() => setError(null)} />
            </div>
          ) : null}
          <EmptyInbox onAdd={() => void addProject()} />
        </>
      ) : (
        <div className="desk-layout">
          <aside className="sidebar" aria-label="プロジェクト">
            <div className="sidebar__heading">
              <span>プロジェクト</span>
              <span>{String(projects.length).padStart(2, "0")}</span>
            </div>
            <nav className="project-list">
              {projects.map((project) => (
                <ProjectItem
                  key={project.id}
                  onRemove={() => void removeProject(project)}
                  onSelect={() => setSelectedProjectId(project.id)}
                  progress={progressByProject[project.id]}
                  project={project}
                  selected={project.id === selectedProjectId}
                />
              ))}
            </nav>
          </aside>

          <main className="main-pane">
            {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}

            {selectedProject ? (
              <>
                {snapshot ? (
                  <ReviewOverviewHeader
                    snapshot={snapshot}
                    stale={selectedProject.reviewStatus === "stale"}
                  />
                ) : null}

                <header className="project-toolbar">
                  <div className="project-toolbar__identity">
                    <h1>{selectedProject.name}</h1>
                    <div className="project-toolbar__meta">
                      <span title={selectedProject.rootPath}>
                        <Icon name="folder" size={15} />
                        {shortPath(selectedProject.rootPath)}
                      </span>
                      <span>
                        <Icon name="branch" size={15} />
                        {selectedProject.branch ?? "ブランチ不明"}
                      </span>
                      {selectedProject.isWorktree ? <span>ワークツリー</span> : null}
                    </div>
                  </div>
                  <div className="project-toolbar__review">
                    <span>
                      最終レビュー
                      <b>{formatDate(selectedProject.lastReviewedAt)}</b>
                    </span>
                    {isReviewing ? (
                      <button
                        className="secondary-button"
                        onClick={() => void cancelReview()}
                        type="button"
                      >
                        中止
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={!canReview || !selectedProject.hasChanges}
                        onClick={() => void runReview()}
                        type="button"
                      >
                        <Icon name="spark" />
                        {snapshot ? "再レビュー" : "AIレビュー"}
                      </button>
                    )}
                  </div>
                </header>

                {isReviewing ? (
                  <ReviewProgress progress={selectedProgress} onCancel={cancelReview} />
                ) : snapshotLoading ? (
                  <LoadingWorkspace />
                ) : snapshot ? (
                  <ReviewReport
                    approvalPending={approvalPending}
                    onAddFeedback={addFeedback}
                    onApprove={approveGroup}
                    onRemoveFeedback={removeFeedback}
                    onSaveFindingNote={saveFindingNote}
                    project={selectedProject}
                    snapshot={snapshot}
                    stale={selectedProject.reviewStatus === "stale"}
                  />
                ) : (
                  <NoReviewState
                    canReview={canReview}
                    onRun={() => void runReview()}
                    project={selectedProject}
                  />
                )}
                {snapshot && !isReviewing && !snapshotLoading ? (
                  <CodexHandoff
                    onError={(title, caught) => showError(title, caught)}
                    onProjectUpdated={updateProject}
                    project={selectedProject}
                    snapshot={snapshot}
                    taskProgress={taskProgressByProject[selectedProject.id]}
                  />
                ) : null}
              </>
            ) : (
              <LoadingWorkspace />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
