import { Risk } from "../../explain/types";

export function RiskBadge({ level }: { level: Risk["level"] }) {
  return (
    <div className={`risk-item risk-${level}`}>
      <span className="risk-label">{level}</span>
    </div>
  );
}
