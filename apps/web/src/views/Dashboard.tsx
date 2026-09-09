import { useEffect, useState } from "react";
import type { Goal, Health, Impact, Snapshot, Stats, Wish } from "../types";
import { getHealth, getImpact, getSnapshots, getStats, listGoals, listWishes, postSync } from "../api";
import { TIMEFRAMES, bucketSnapshots, formatMoney, formatXLabel, UNDECIDED_STATUSES } from "../lib";
import { LineChart } from "../components/LineChart";
import { GoalsPanel } from "../components/GoalsPanel";
import { CoolingQueue } from "../components/CoolingQueue";
import { TotalDelay } from "../components/TotalDelay";

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

async function loadAll(days: number): Promise<DashboardData> {
  const [stats, snapshots, goals, wishes, health] = await Promise.all([
    getStats(),
    getSnapshots(days),
    listGoals(),
    listWishes(),
    getHealth().catch((): Health | null => null),
  ]);
  const undecided = wishes.filter((w) => UNDECIDED_STATUSES.includes(w.status));
  const impacts: Record<string, Impact> = {};
  await Promise.all(
    undecided.map(async (w) => {
      try {
        impacts[w.id] = await getImpact(w.id);
      } catch {
        /* leave missing; panel shows n/a */
      }
    }),
  );
  return { stats, snapshots, goals, wishes, impacts, health };
}

export function Dashboard({ initial }: Props) {
  const [data, setData] = useState<DashboardData | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(90);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    (async () => {
      try {
        const fresh = await loadAll(days);
        if (live) setData(fresh);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "failed to load");
      }
    })();
    return () => {
      live = false;
    };
  }, [initial, days]);

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const result = await postSync(days);
      const fresh = await loadAll(days);
      // Prefer the just-synced window when the follow-up read agrees.
      if (result.snapshots.length > 0) fresh.snapshots = result.snapshots;
      setData(fresh);
      setSyncedAt(result.syncedAt);
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : "refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  if (error) return <p role="alert" className="alert">Dashboard failed to load: {error}</p>;
  if (!data) return <p className="loading-line">Opening the ledger…</p>;
  const { stats, snapshots, goals, wishes, impacts, health } = data;
  const bucketed = bucketSnapshots(snapshots, days);
  const labels = bucketed.map((s) => s.date);
  const formatX = (iso: string) => formatXLabel(iso, days);
  const bucketNote =
    days <= 62 ? "daily" : days <= 200 ? "weekly buckets" : "monthly buckets";
  const rangeNote = labels.length > 0 ? `${labels[0]} → ${labels[labels.length - 1]}` : "";
  const ratePositive = stats.ratePerDay > 0;
  const windowNote =
    stats.windowDays !== undefined
      ? `${stats.windowDays}d window`
      : "30d window";

  return (
    <div>
      <div className="dash-controls" data-testid="dash-controls">
        <div role="group" aria-label="Chart timeframe" className="timeframe-group">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.days}
              type="button"
              className={t.days === days ? "btn small active" : "btn small ghost"}
              aria-pressed={t.days === days}
              onClick={() => setDays(t.days)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn small"
          onClick={refresh}
          disabled={refreshing}
          data-testid="refresh-button"
        >
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
        <span className="row-meta" data-testid="refresh-note">
          {refreshError ??
            (syncedAt
              ? `synced ${syncedAt.slice(0, 16).replace("T", " ")} · ${bucketed.length} points`
              : labels.length > 0
                ? `data through ${labels[labels.length - 1]} · ${bucketed.length} points`
                : "no history yet")}
        </span>
      </div>
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
            
            <h2>Position — spot vs trailing avg</h2>
            <span className="sub">{rangeNote} · {bucketNote}</span>
          </div>
          <LineChart
            labels={labels}
            formatTick={(v) => formatMoney(v, stats.currency)}
            formatX={formatX}
            series={[
              { label: "spot", color: "#1c1611", values: bucketed.map((s) => s.spot) },
              { label: "avg", color: "#b23a1d", values: bucketed.map((s) => s.avg) },
            ]}
          />
        </section>

        <section className="entry span-5 rise accent-top" style={{ ["--d" as string]: "140ms" }} data-testid="rate-panel">
          <div className="entry-head">
            
            <h2>Save-rate trend</h2>
            <span className="sub">{bucketed.length} readings · {bucketNote}</span>
          </div>
          <LineChart
            labels={labels}
            formatTick={(v) => `${formatMoney(v, stats.currency)}/d`}
            formatX={formatX}
            series={[{ label: "rate/day", color: "#2e6b4f", values: bucketed.map((s) => s.rate) }]}
          />
          <p className="row-meta" style={{ marginTop: 10 }}>
            Averaged over the {windowNote}: every wish below is priced against this rate, so a
            short-window spike can’t quietly promise what the ledger can’t pay.
          </p>
        </section>
        <section className="entry span-7 rise" style={{ ["--d" as string]: "210ms" }} data-testid="goals-panel">
          <div className="entry-head">
            
            <h2>Goals &amp; arrival dates</h2>
            <span className="sub">{goals.length} open</span>
          </div>
          <GoalsPanel goals={goals} avg={stats.avg30} rate={stats.ratePerDay} currency={stats.currency} />
        </section>

        <section className="entry span-5 rise" style={{ ["--d" as string]: "280ms" }} data-testid="cooling-panel">
          <div className="entry-head">
            
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

        <section className="entry span-12 rise" style={{ ["--d" as string]: "350ms" }} data-testid="total-delay-panel">
          <div className="entry-head">
            
            <h2>Total delay</h2>
            <span className="sub">what the whole queue costs each goal</span>
          </div>
          <TotalDelay goals={goals} wishes={wishes} impacts={impacts} snapshots={snapshots} avg={stats.avg30} rate={stats.ratePerDay} />
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
