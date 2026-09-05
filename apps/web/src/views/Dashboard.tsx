import { useEffect, useState } from "react";
import type { Goal, Health, Impact, Snapshot, Stats, Wish } from "../types";
import { getHealth, getImpact, getSnapshots, getStats, listGoals, listWishes } from "../api";
import { formatMoney } from "../lib";
import { LineChart } from "../components/LineChart";
import { GoalsPanel } from "../components/GoalsPanel";
import { CoolingQueue } from "../components/CoolingQueue";

export interface DashboardData {
  stats: Stats;
  snapshots: Snapshot[];
  goals: Goal[];
  wishes: Wish[];
  impacts: Record<string, Impact>;
  health: Health | null;
}

interface Props {
  initial?: DashboardData;
}

const panel: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 16,
};

export function Dashboard({ initial }: Props) {
  const [data, setData] = useState<DashboardData | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    (async () => {
      try {
        const [stats, snapshots, goals, wishes, health] = await Promise.all([
          getStats(),
          getSnapshots(90),
          listGoals(),
          listWishes(),
          getHealth().catch((): Health | null => null),
        ]);
        const cooling = wishes.filter((w) => w.status === "cooling");
        const impacts: Record<string, Impact> = {};
        await Promise.all(
          cooling.map(async (w) => {
            try {
              impacts[w.id] = await getImpact(w.id);
            } catch {
              /* leave missing; panel shows n/a */
            }
          }),
        );
        if (live) setData({ stats, snapshots, goals, wishes, impacts, health });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "failed to load");
      }
    })();
    return () => {
      live = false;
    };
  }, [initial]);

  if (error) return <p role="alert">Dashboard failed to load: {error}</p>;
  if (!data) return <p>Loading…</p>;

  const { stats, snapshots, goals, wishes, impacts, health } = data;
  const labels = snapshots.map((s) => s.date);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 16 }}>
        <span>
          Spot <strong>{formatMoney(stats.spot, stats.currency)}</strong>
        </span>
        <span>
          30d avg <strong>{formatMoney(stats.avg30, stats.currency)}</strong>
        </span>
        <span>
          Rate <strong>{formatMoney(stats.ratePerDay, stats.currency)}/day</strong>
        </span>
        {health && (
          <span style={{ marginLeft: "auto", fontSize: 12 }}>
            Actual {health.actual.version} · {health.actual.reachable ? "reachable" : "unreachable"}
          </span>
        )}
      </div>
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}
      >
        <section style={panel} data-testid="spot-panel">
          <h2>Net worth: spot vs 30d avg</h2>
          <LineChart
            labels={labels}
            series={[
              { label: "spot", color: "#1f6feb", values: snapshots.map((s) => s.spot) },
              { label: "avg", color: "#d29922", values: snapshots.map((s) => s.avg) },
            ]}
          />
        </section>
        <section style={panel} data-testid="rate-panel">
          <h2>Save rate trend</h2>
          <LineChart
            labels={labels}
            series={[{ label: "rate/day", color: "#2f7d4f", values: snapshots.map((s) => s.rate) }]}
          />
        </section>
        <section style={panel} data-testid="goals-panel">
          <h2>Goals</h2>
          <GoalsPanel goals={goals} avg={stats.avg30} rate={stats.ratePerDay} currency={stats.currency} />
        </section>
        <section style={panel} data-testid="cooling-panel">
          <h2>Cooling queue</h2>
          <CoolingQueue wishes={wishes} impacts={impacts} currency={stats.currency} />
        </section>
      </div>
    </div>
  );
}
