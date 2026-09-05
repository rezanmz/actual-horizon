import type { Goal, Impact, Snapshot, Wish } from "../types";
import { daysToGoal, projectDate, UNDECIDED_STATUSES } from "../lib";

interface Props {
  goals: Goal[];
  wishes: Wish[];
  impacts: Record<string, Impact>;
  snapshots: Snapshot[];
  avg: number;
  rate: number;
}

/** Aggregate push per goal across undecided wishes: what the whole queue costs. */
export function totalPushDays(goalId: string, wishes: Wish[], impacts: Record<string, Impact>): number {
  let sum = 0;
  let any = false;
  for (const w of wishes) {
    if (!UNDECIDED_STATUSES.includes(w.status)) continue;
    const hit = impacts[w.id]?.perGoal.find((p) => p.goalId === goalId);
    if (hit) {
      sum += hit.delayDays;
      any = true;
    }
  }
  return any ? Math.ceil(sum) : 0;
}

export interface GoalSlip {
  kind: "slipped" | "gained" | "flat" | "funded" | "unknown";
  days: number;
  spanDays: number;
}

/**
 * Retrospective: how a goal's arrival moved between the oldest usable snapshot
 * (>= 30d back) and the latest. Positive = slipped later, negative = pulled in.
 */
export function goalSlip(target: number, snapshots: Snapshot[]): GoalSlip | null {
  const usable = snapshots.filter((s) => s.avg != null && s.rate != null);
  if (usable.length === 0) return null;
  const latest = usable[usable.length - 1];
  const old = usable[0];
  const spanDays = Math.round(
    (Date.parse(latest.date) - Date.parse(old.date)) / 86_400_000,
  );
  if (spanDays < 30) return null;
  const oldDays = daysToGoal(target, old.avg, old.rate as number);
  const newDays = daysToGoal(target, latest.avg, latest.rate as number);
  if (oldDays === null || newDays === null) return { kind: "unknown", days: 0, spanDays };
  if (oldDays === 0 && newDays === 0) return { kind: "funded", days: 0, spanDays };
  const slip = newDays - oldDays + spanDays;
  if (slip > 0) return { kind: "slipped", days: slip, spanDays };
  if (slip < 0) return { kind: "gained", days: -slip, spanDays };
  return { kind: "flat", days: 0, spanDays };
}

export function TotalDelay({ goals, wishes, impacts, snapshots, avg, rate }: Props) {
  if (goals.length === 0) return <p className="empty-note">Add a goal to price the queue against.</p>;
  const ordered = [...goals].sort((a, b) => a.priority - b.priority);
  const undecidedCount = wishes.filter((w) => UNDECIDED_STATUSES.includes(w.status)).length;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {ordered.map((g) => {
        const pushed = totalPushDays(g.id, wishes, impacts);
        const days = daysToGoal(g.target, avg, rate);
        const slip = goalSlip(g.target, snapshots);
        return (
          <li key={g.id} className="ledger-row" style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <span className="row-name">{g.name}</span>
              {days === null ? (
                <span className="mono">arrival n/a</span>
              ) : pushed > 0 ? (
                <span className="mono">
                  {projectDate(days)} → <strong>+{pushed}d = {projectDate(days + pushed)}</strong>
                </span>
              ) : (
                <span className="mono">no push · {projectDate(days)}</span>
              )}
            </div>
            <div className="row-meta" style={{ marginTop: 3 }}>
              {undecidedCount === 0
                ? "queue empty — nothing pushing this goal"
                : pushed > 0
                  ? `${undecidedCount} undecided wish${undecidedCount === 1 ? "" : "es"} push this goal ${pushed}d in total`
                  : "open wishes cost this goal nothing"}
              {slip === null ? (
                <> · building history</>
              ) : slip.kind === "slipped" ? (
                <> · last {slip.spanDays}d: slipped {slip.days}d later</>
              ) : slip.kind === "gained" ? (
                <> · last {slip.spanDays}d: pulled {slip.days}d closer</>
              ) : slip.kind === "funded" ? (
                <> · funded throughout the last {slip.spanDays}d</>
              ) : slip.kind === "flat" ? (
                <> · arrival held flat over the last {slip.spanDays}d</>
              ) : (
                <> · past pace unknown</>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
