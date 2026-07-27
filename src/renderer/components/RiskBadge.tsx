import type { RiskLevel } from "../../shared/contracts";
import { RISK_LABELS } from "../lib/labels";

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={`risk-badge risk-badge--${risk}`}>
      <span className="risk-badge__dot" />
      リスク {RISK_LABELS[risk]}
    </span>
  );
}
