import type { Goal } from "../types";
import { daysToGoal, formatMoney, projectDate } from "../lib";

interface Props {
  goals: Goal[];
  avg: number;
  rate: number;
  currency: string;
}

export function GoalsPanel({ goals, avg, rate, currency }: Props) {
  if (goals.length === 0)
    return <p className="empty-note">No goals entered in the ledger yet.</p>;
  const ordered = [...goals].sort((a, b) => a.priority - b.priority);
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {ordered.map((g) => {
        const days = daysToGoal(g.target, avg, rate);
        const progress = Math.min(1, Math.max(0, g.target > 0 ? avg / g.target : 0));
        const pct = Math.round(progress * 100);
        const drifting = days === null;
        return (
          <li key={g.id} className="ledger-row" style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <span className="row-name">
                <span className="mono" style={{ color: "var(--ink-faint)", marginRight: 8 }}>
                  {String(g.priority).padStart(2, "0")}
                </span>
                {g.name}
              </span>
              <span className="num" style={{ fontSize: 13 }}>
                {formatMoney(avg, currency)} / {formatMoney(g.target, currency)}
              </span>
            </div>
            <div
              className={`rule-bar${drifting ? " hot" : pct >= 100 ? " grown" : ""}`}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${g.name} progress`}
            >
              <div style={{ width: `${pct}%` }} />
            </div>
            <div className="row-meta" style={{ marginTop: 3 }}>
              {drifting ? (
                <>drifting — the daily rate is ≤ 0, so no arrival date can be set</>
              ) : (
                <>
                  <span className="mono">
                    {(days as number) > 0 ? `${days} days → ${projectDate(days as number)}` : "funded"}
                  </span>
                  {g.deadline ? (
                    <span className={`due-flag${(days as number) <= 0 ? " ok" : ""}`} style={{ marginLeft: 8 }}>
                      due {g.deadline}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
