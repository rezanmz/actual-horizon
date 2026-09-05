import type { Goal } from "../types";
import { daysToGoal, formatMoney, projectDate } from "../lib";

interface Props {
  goals: Goal[];
  avg: number;
  rate: number;
  currency: string;
}

export function GoalsPanel({ goals, avg, rate, currency }: Props) {
  if (goals.length === 0) return <p>No goals yet.</p>;
  const ordered = [...goals].sort((a, b) => a.priority - b.priority);
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {ordered.map((g) => {
        const days = daysToGoal(g.target, avg, rate);
        const progress = Math.min(1, Math.max(0, avg / g.target));
        return (
          <li key={g.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{g.name}</strong>
              <span>
                {formatMoney(avg, currency)} / {formatMoney(g.target, currency)}
              </span>
            </div>
            <div
              style={{ height: 8, background: "#eee", borderRadius: 4, marginTop: 4 }}
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${g.name} progress`}
            >
              <div
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  height: "100%",
                  background: "#2f7d4f",
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
              {days === null ? (
                "drifting (rate ≤ 0)"
              ) : (
                <>
                  {days} days → {projectDate(days)}
                  {g.deadline ? ` · due ${g.deadline}` : ""}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
