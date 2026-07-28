import { useState } from "react";
import type { DetectedWorktree, RepositoryRecord } from "../../shared/contracts";
import { getErrorMessage } from "../lib/error";
import { Icon } from "./Icon";

export function WorktreeDetector({
  repository,
  disabled,
  onRegistered,
}: {
  repository: RepositoryRecord;
  disabled: boolean;
  onRegistered: (repositories: RepositoryRecord[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detected, setDetected] = useState<DetectedWorktree[] | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelId = `worktree-detector-${repository.id}`;

  async function toggleDetector() {
    if (disabled) return;

    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    setDetected(null);
    setSelectedPaths(new Set());
    setError(null);
    setLoading(true);
    try {
      setDetected(await window.diffender.projects.detectWorktrees(repository.id));
    } catch (caught) {
      setError(`ワークツリーを検出できませんでした。${getErrorMessage(caught)}`);
    } finally {
      setLoading(false);
    }
  }

  function togglePath(rootPath: string) {
    if (disabled) return;

    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(rootPath)) {
        next.delete(rootPath);
      } else {
        next.add(rootPath);
      }
      return next;
    });
  }

  async function registerSelected() {
    if (disabled || selectedPaths.size === 0) return;

    setError(null);
    setRegistering(true);
    try {
      const repositories = await window.diffender.projects.addWorktrees(repository.id, [
        ...selectedPaths,
      ]);
      onRegistered(repositories);
      setExpanded(false);
      setDetected(null);
      setSelectedPaths(new Set());
    } catch (caught) {
      setError(`ワークツリーを登録できませんでした。${getErrorMessage(caught)}`);
    } finally {
      setRegistering(false);
    }
  }

  return (
    <>
      <div className="repository-tree__heading">
        <Icon name="folder" size={14} />
        <strong title={repository.name}>{repository.name}</strong>
        <span className="repository-tree__count">
          {String(repository.worktrees.length).padStart(2, "0")}
        </span>
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          aria-label={`「${repository.name}」のワークツリーを検出`}
          className="icon-button repository-tree__detect-button"
          disabled={disabled || loading || registering}
          onClick={() => void toggleDetector()}
          title="ワークツリーを検出"
          type="button"
        >
          <Icon name={expanded ? "close" : "refresh"} size={13} />
        </button>
      </div>

      {expanded ? (
        <div
          aria-busy={loading || registering}
          aria-live="polite"
          className="worktree-detector"
          id={panelId}
        >
          {loading ? (
            <div className="worktree-detector__status">
              <span aria-hidden="true" className="worktree-detector__spinner" />
              ワークツリーを検出しています
            </div>
          ) : null}

          {error ? (
            <p className="worktree-detector__error" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && detected?.length === 0 ? (
            <p className="worktree-detector__status">
              ワークツリーが見つかりませんでした。
            </p>
          ) : null}

          {!loading && detected && detected.length > 0 ? (
            <>
              <ul className="worktree-detector__list">
                {detected.map((worktree) => (
                  <li
                    className={
                      worktree.alreadyRegistered
                        ? "worktree-detector__item worktree-detector__item--registered"
                        : "worktree-detector__item"
                    }
                    key={worktree.rootPath}
                  >
                    <label>
                      <input
                        checked={
                          worktree.alreadyRegistered ||
                          selectedPaths.has(worktree.rootPath)
                        }
                        disabled={disabled || worktree.alreadyRegistered || registering}
                        onChange={() => togglePath(worktree.rootPath)}
                        type="checkbox"
                      />
                      <span className="worktree-detector__details">
                        <span className="worktree-detector__name">
                          <Icon name="branch" size={11} />
                          {worktreeName(worktree.rootPath)}
                        </span>
                        <span
                          className="worktree-detector__path"
                          title={worktree.rootPath}
                        >
                          {worktree.rootPath}
                        </span>
                        <span className="worktree-detector__meta">
                          <span>{worktree.branch ?? "detached"}</span>
                          {worktree.isMain ? <span>メイン</span> : null}
                          {worktree.locked ? <span>ロック中</span> : null}
                          {worktree.alreadyRegistered ? <span>登録済み</span> : null}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                className="primary-button worktree-detector__register"
                disabled={disabled || selectedPaths.size === 0 || registering}
                onClick={() => void registerSelected()}
                type="button"
              >
                {registering
                  ? "登録しています"
                  : `選択したワークツリーを登録（${selectedPaths.size}）`}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function worktreeName(rootPath: string): string {
  return rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rootPath;
}
