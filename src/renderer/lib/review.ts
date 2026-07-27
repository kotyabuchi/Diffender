import type {
  ImplementationAgent,
  ProjectRecord,
  ReviewFeedbackScope,
  ReviewProgressEvent,
  ReviewSnapshot,
} from "../../shared/contracts";

export function replaceSetValue(
  previous: Set<string>,
  value: string,
  present: boolean,
): Set<string> {
  const next = new Set(previous);
  if (present) next.add(value);
  else next.delete(value);
  return next;
}

export function progressToReviewStatus(
  stage: ReviewProgressEvent["stage"],
): ProjectRecord["reviewStatus"] {
  if (stage === "queued") return "queued";
  if (stage === "reading" || stage === "analyzing") return "running";
  if (stage === "complete") return "complete";
  return "failed";
}

export function countReviewHunks(snapshot: ReviewSnapshot): number {
  return snapshot.files.reduce(
    (total, file) => total + (file.patch.match(/^@@/gm)?.length ?? 0),
    0,
  );
}

export function composeSuggestionFeedbackBody(finding: {
  reason: string;
  suggestion: string;
}): string {
  const reason = finding.reason.trim();
  const suggestion = finding.suggestion.trim();
  if (!reason) return suggestion;
  if (!suggestion) return reason;
  return `${reason}\n提案: ${suggestion}`;
}

export function feedbackScopesMatch(
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

export function implementationAgentLabel(agent: ImplementationAgent): string {
  return agent === "codex" ? "Codex" : "Claude Code";
}
