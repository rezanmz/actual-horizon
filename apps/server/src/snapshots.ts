import type Database from 'better-sqlite3';
import { getSettings } from './settings.js';
import { addDaysIso, applyExclusions, rateFromTransactions, avg30, todayIsoUtc } from './math.js';
import type { ActualAdapter, FlowRecord } from './actualAdapter.js';

export interface SnapshotPoint {
  date: string;
  spot: number;
  /** Rolling 30d mean of spots up to this date; always a number. */
  avg: number;
  /** Stored rate at snapshot time; null when never recorded. */
  rate: number | null;
}

interface SnapshotRow {
  date: string;
  spot: number;
  ratePerDay: number | null;
}
const UPSERT_SNAPSHOT =
  'INSERT INTO snapshots (date, spot, ratePerDay) VALUES (?, ?, ?) ' +
  'ON CONFLICT(date) DO UPDATE SET spot = excluded.spot, ratePerDay = excluded.ratePerDay';

/** Overrides for the snapshot jobs; unset fields fall back to stored settings. */
export interface SnapshotOptions {
  lookbackDays?: number;
  excludedAccounts?: string[];
  excludedCategories?: string[];
  todayIso?: string;
}

function resolveOptions(db: Database.Database, opts: SnapshotOptions): Required<Omit<SnapshotOptions, 'todayIso'>> & { todayIso: string } {
  const settings = getSettings(db);
  return {
    lookbackDays: opts.lookbackDays ?? settings.lookbackDays,
    excludedAccounts: opts.excludedAccounts ?? settings.excludedAccounts,
    excludedCategories: opts.excludedCategories ?? settings.excludedCategories,
    todayIso: opts.todayIso ?? todayIsoUtc(),
  };
}

/**
 * Read the trailing `days` snapshots oldest-first, filling each point's avg
 * as the rolling 30d mean so the Contract shape always holds.
 */
export function readSnapshots(db: Database.Database, days = 30): SnapshotPoint[] {
  const clamped = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
  const rows = db
    .prepare('SELECT date, spot, ratePerDay FROM snapshots ORDER BY date DESC LIMIT ?')
    .all(clamped) as SnapshotRow[];
  const asc = rows.reverse();
  const spots = asc.map((r) => r.spot);
  return asc.map((row, i) => ({
    date: row.date,
    spot: row.spot,
    avg: avg30(spots.slice(0, i + 1)),
    rate: row.ratePerDay,
  }));
}

/** Trailing-window rate ending `endIso` (inclusive) from date-sorted flows. */
export function trailingRate(
  flows: readonly Pick<FlowRecord, 'date' | 'amount' | 'isTransfer'>[],
  endIso: string,
  lookbackDays: number,
): number {
  const startIso = addDaysIso(endIso, -(lookbackDays - 1));
  return rateFromTransactions(
    flows.filter((tx) => tx.date >= startIso && tx.date <= endIso),
    lookbackDays,
  );
}

/**
 * Append (or refresh) today's snapshot from the Actual adapter.
 * The rate is the trailing lookbackDays net (settings default 180d);
 * exclusions filter before math. Returns null when the sidecar is
 * unreachable — the daily job should skip, not crash. Never throws on
 * adapter failure.
 */
export async function appendDailySnapshot(
  db: Database.Database,
  adapter: ActualAdapter,
  todayIso: string = todayIsoUtc(),
  opts: Omit<SnapshotOptions, 'todayIso'> = {},
): Promise<SnapshotPoint | null> {
  const resolved = resolveOptions(db, { ...opts, todayIso });
  let balances;
  try {
    balances = await adapter.getDailyBalances(1, { excludedAccounts: resolved.excludedAccounts });
  } catch {
    return null;
  }
  const latest = balances.at(-1);
  if (latest == null) return null;

  let rate: number | null = null;
  try {
    const txs = await adapter.getTransactions(addDaysIso(resolved.todayIso, -(resolved.lookbackDays - 1)), {
      excludedAccounts: resolved.excludedAccounts,
    });
    const visible = applyExclusions(txs, { excludedCategories: resolved.excludedCategories });
    rate = rateFromTransactions(
      visible.map((t) => ({ amount: t.amount, isTransfer: t.isTransfer })),
      resolved.lookbackDays,
    );
  } catch {
    rate = null;
  }
  db.prepare(UPSERT_SNAPSHOT).run(latest.date, latest.spot, rate);
  return readSnapshots(db, 365).find((p) => p.date === latest.date) ?? null;
}

/**
 * Backfill the trailing `days` snapshots with rolling trailing-window rates.
 * One transaction fetch covers every window (since earliestDate-lookback);
 * flows bucket locally per day, so each stored rate is the true
 * trailing-lookback net ending that day — not a single spike on today.
 * Throws on adapter failure so callers can surface it.
 */
export async function backfillSnapshots(
  db: Database.Database,
  adapter: ActualAdapter,
  days = 90,
  opts: Omit<SnapshotOptions, 'todayIso'> = {},
  todayIso: string = todayIsoUtc(),
): Promise<SnapshotPoint[]> {
  const resolved = resolveOptions(db, { ...opts, todayIso });
  const balances = await adapter.getDailyBalances(days, { excludedAccounts: resolved.excludedAccounts });
  const txs = await adapter.getTransactions(
    addDaysIso(resolved.todayIso, -(resolved.lookbackDays + days)),
    { excludedAccounts: resolved.excludedAccounts },
  );
  const visible = applyExclusions(txs, { excludedCategories: resolved.excludedCategories });
  const sorted = [...visible].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const upsert = db.prepare(UPSERT_SNAPSHOT);
  const fill = db.transaction(() => {
    for (const b of balances) {
      upsert.run(b.date, b.spot, trailingRate(sorted, b.date, resolved.lookbackDays));
    }
  });
  fill();
  return readSnapshots(db, days);
}
