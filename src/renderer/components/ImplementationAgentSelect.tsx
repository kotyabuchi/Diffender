import type {
  ImplementationAgent,
  ImplementationAgentDetection,
  ProjectRecord,
} from "../../shared/contracts";
import { implementationAgentLabel } from "../lib/review";

export function ImplementationAgentSelect({
  project,
  detection,
  disabled,
  onSelectAgent,
}: {
  project: ProjectRecord;
  detection: ImplementationAgentDetection | null;
  disabled: boolean;
  onSelectAgent: (agent: ImplementationAgent | null) => void;
}) {
  return (
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
        disabled={disabled}
        onChange={(event) =>
          onSelectAgent(
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
  );
}
