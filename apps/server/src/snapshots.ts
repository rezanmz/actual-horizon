import type Database from 'better-sqlite3';
import { addDaysIso, avg30, rateFromTransactions, todayIsoUtc } from './math.js';
import type { ActualAdapter } from './actualAdapter.js';

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

const UPSERT_SNAPSHOT =
  'INSERT INTO snapshots (date, spot, ratePerDay) VALUES (?, ?, ?) ' +
  'ON CONFLICT(date) DO UPDATE SET spot = excluded.spot, ratePerDay = excluded.ratePerDay';

/**
 * Append (or refresh) today's snapshot from the Actual adapter.
 * Returns null when the sidecar is unreachable — the daily job should skip,
 * not crash. Never throws on adapter failure.
 */
export async function appendDailySnapshot(
  db: Database.Database,
  adapter: ActualAdapter,
  todayIso: string = todayIsoUtc(),
): Promise<SnapshotPoint | null> {
  let balances;
  try {
    balances = await adapter.getDailyBalances(1);
  } catch {
    return null;
  }
  const latest = balances.at(-1);
  if (latest == null) return null;

  let rate: number | null = null;
  try {
    const txs = await adapter.getTransactions(addDaysIso(todayIso, -30));
    rate = rateFromTransactions(
      txs.map((t) => ({ amount: t.amount, isTransfer: t.isTransfer })),
      30,
    );
  } catch {
    rate = null;
  }
  db.prepare(UPSERT_SNAPSHOT).run(latest.date, latest.spot, rate);
  return readSnapshots(db, 365).find((p) => p.date === latest.date) ?? null;
}

/**
 * Backfill stub: pull up to `days` of daily balances through the adapter and
 * insert dates we don't already have (per-row rates stay null until the daily
 * job records them). Throws on adapter failure so callers can surface it.
 */
export async function backfillSnapshots(
  db: Database.Database,
  adapter: ActualAdapter,
  days = 90,
): Promise<SnapshotPoint[]> {
  const balances = await adapter.getDailyBalances(days);
  const insert = db.prepare('INSERT INTO snapshots (date, spot) VALUES (?, ?) ON CONFLICT(date) DO NOTHING');
  const fill = db.transaction((rows: typeof balances) => {
    for (const b of rows) insert.run(b.date, b.spot);
  });
  fill(balances);
  return readSnapshots(db, days);
}
