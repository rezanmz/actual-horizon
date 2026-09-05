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

  if (error) return <p role="alert" className="alert">Dashboard failed to load: {error}</p>;
  if (!data) return <p className="loading-line">Opening the ledger…</p>;

  const { stats, snapshots, goals, wishes, impacts, health } = data;
  const labels = snapshots.map((s) => s.date);
  const ratePositive = stats.ratePerDay > 0;
  const windowNote =
    stats.windowDays !== undefined
      ? `${stats.windowDays}d window`
      : "30d window";

  return (
    <div>
      <section className="figures rise" style={{ ["--d" as string]: "0ms" }} aria-label="Position summary">
        <div className="figure">
          <div className="k">Net worth · spot</div>
          <div className="v">{formatMoney(stats.spot, stats.currency)}</div>
          <div className="note">as of today</div>
        </div>
        <div className="figure">
          <div className="k">Trailing average</div>
          <div className="v">{formatMoney(stats.avg30, stats.currency)}</div>
          <div className="note">30-day mean</div>
        </div>
        <div className="figure">
          <div className="k">Save rate · {windowNote}</div>
          <div className={`v${ratePositive ? " positive" : " negative"}`}>
            {formatMoney(stats.ratePerDay, stats.currency)}
            <small>/day</small>
          </div>
          <div className="note">
            {stats.inflowPerDay !== undefined && stats.outflowPerDay !== undefined ? (
              <>
                <span className="mono">+{formatMoney(stats.inflowPerDay, stats.currency)}</span>
                {" in · "}
                <span className="mono">−{formatMoney(stats.outflowPerDay, stats.currency)}</span>
                {" out"}
                {stats.txCount !== undefined ? ` · ${stats.txCount} txns` : ""}
              </>
            ) : ratePositive ? (
              "growing — wishes are affordable on schedule"
            ) : (
              "drifting — arrival dates suspended"
            )}
          </div>
        </div>
      </section>

      <div className="ledger-grid">
        <section className="entry span-7 rise" style={{ ["--d" as string]: "70ms" }} data-testid="spot-panel">
          <div className="entry-head">
            <span className="entry-no">01</span>
            <h2>Position — spot vs trailing avg</h2>
            <span className="sub">{labels.length > 0 ? `${labels[0]} → ${labels[labels.length - 1]}` : ""}</span>
          </div>
          <LineChart
            labels={labels}
            formatTick={(v) => formatMoney(v, stats.currency)}
            series={[
              { label: "spot", color: "#1c1611", values: snapshots.map((s) => s.spot) },
              { label: "avg", color: "#b23a1d", values: snapshots.map((s) => s.avg) },
            ]}
          />
        </section>

        <section className="entry span-5 rise accent-top" style={{ ["--d" as string]: "140ms" }} data-testid="rate-panel">
          <div className="entry-head">
            <span className="entry-no">02</span>
            <h2>Save-rate trend</h2>
            <span className="sub">{snapshots.length} readings</span>
          </div>
          <LineChart
            labels={labels}
            formatTick={(v) => `${formatMoney(v, stats.currency)}/d`}
            series={[{ label: "rate/day", color: "#2e6b4f", values: snapshots.map((s) => s.rate) }]}
          />
          <p className="row-meta" style={{ marginTop: 10 }}>
            Averaged over the {windowNote}: every wish below is priced against this rate, so a
            short-window spike can’t quietly promise what the ledger can’t pay.
          </p>
        </section>

        <section className="entry span-7 rise" style={{ ["--d" as string]: "210ms" }} data-testid="goals-panel">
          <div className="entry-head">
            <span className="entry-no">03</span>
            <h2>Goals &amp; arrival dates</h2>
            <span className="sub">{goals.length} open</span>
          </div>
          <GoalsPanel goals={goals} avg={stats.avg30} rate={stats.ratePerDay} currency={stats.currency} />
        </section>

        <section className="entry span-5 rise" style={{ ["--d" as string]: "280ms" }} data-testid="cooling-panel">
          <div className="entry-head">
            <span className="entry-no">04</span>
            <h2>Cooling queue</h2>
            <span className="sub">wishes waiting out delay</span>
          </div>
          <CoolingQueue
            wishes={wishes}
            impacts={impacts}
            currency={stats.currency}
            ratePerDay={stats.ratePerDay}
          />
        </section>
      </div>

      {health && (
        <p className="row-meta" style={{ marginTop: 18 }}>
          <span className={`health-dot${health.actual.reachable ? "" : " down"}`} aria-hidden="true" />{" "}
          <span className="mono">
            Actual {health.actual.version} · {health.actual.reachable ? "reachable" : "unreachable"}
          </span>
        </p>
      )}
    </div>
  );
}
