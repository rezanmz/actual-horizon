import { setImmediate as setImmediateYield } from 'node:timers/promises';
import type Database from 'better-sqlite3';
import { getSettings } from './settings.js';
import { addDaysIso, applyExclusions, rateFromTransactions, avg30 } from './math.js';
import { todayInZone } from './timezone.js';
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
    todayIso: opts.todayIso ?? todayInZone(),
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
  todayIso: string = todayInZone(),
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
 *
 * Cost is O(flows + days·log flows): prefix sums over the sorted
 * non-transfer flows answer every window, and upserts land in small
 * transactions with a macrotask yield between chunks so long backfills
 * never starve the event loop (#46).
 */
export async function backfillSnapshots(
  db: Database.Database,
  adapter: ActualAdapter,
  days = 90,
  opts: Omit<SnapshotOptions, 'todayIso'> = {},
  todayIso: string = todayInZone(),
): Promise<SnapshotPoint[]> {
  const resolved = resolveOptions(db, { ...opts, todayIso });
  const balances = await adapter.getDailyBalances(days, { excludedAccounts: resolved.excludedAccounts });
  const txs = await adapter.getTransactions(
    addDaysIso(resolved.todayIso, -(resolved.lookbackDays + days)),
    { excludedAccounts: resolved.excludedAccounts },
  );
  const visible = applyExclusions(txs, { excludedCategories: resolved.excludedCategories });
  const sorted = [...visible].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rates = slidingRates(sorted, balances, resolved.lookbackDays);
  const upsert = db.prepare(UPSERT_SNAPSHOT);
  for (let i = 0; i < balances.length; i += UPSERT_CHUNK) {
    const dates = balances.slice(i, i + UPSERT_CHUNK);
    const values = rates.slice(i, i + UPSERT_CHUNK);
    db.transaction(() => {
      for (let j = 0; j < dates.length; j++) upsert.run(dates[j]!.date, dates[j]!.spot, values[j] ?? 0);
    })();
    await yieldToLoop();
  }
  return readSnapshots(db, days);
}

/** Upserts per synchronous transaction; small enough to keep each tick short. */
const UPSERT_CHUNK = 25;

/** Let pending I/O (health probes, other requests) run between work slices. */
async function yieldToLoop(): Promise<void> {
  await setImmediateYield();
}

/**
 * Trailing-lookback rate per balance date via prefix sums over the
 * date-sorted non-transfer flows. Identical math to calling
 * `trailingRate(flows, date, lookbackDays)` per date, in linear total time.
 * Returns rates aligned with `balances` (no date-keyed lookup needed).
 */
function slidingRates(
  sorted: readonly Pick<FlowRecord, 'date' | 'amount' | 'isTransfer'>[],
  balances: readonly { date: string }[],
  lookbackDays: number,
): number[] {
  const dates: string[] = [];
  const prefix: number[] = [0];
  for (const tx of sorted) {
    if (tx.isTransfer) continue;
    dates.push(tx.date);
    prefix.push((prefix[prefix.length - 1] ?? 0) + tx.amount);
  }
  return balances.map((b) => {
    const startIso = addDaysIso(b.date, -(lookbackDays - 1));
    const lo = lowerBound(dates, startIso);
    const hi = upperBound(dates, b.date);
    return ((prefix[hi] ?? 0) - (prefix[lo] ?? 0)) / lookbackDays;
  });
}

/** First index with `dates[i] >= target` (ISO dates sort lexicographically). */
function lowerBound(dates: readonly string[], target: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index with `dates[i] > target`. */
function upperBound(dates: readonly string[], target: string): number {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid]! <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

