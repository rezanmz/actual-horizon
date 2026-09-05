import type Database from 'better-sqlite3';
import { Router } from 'express';
import type { ActualAdapter } from '../actualAdapter.js';
import { getSetting } from '../db.js';
import { addDaysIso, applyExclusions, avg30, flowStats, todayIsoUtc } from '../math.js';
import { getSettings } from '../settings.js';

export interface Stats {
  spot: number;
  avg30: number;
  ratePerDay: number;
  inflowPerDay: number;
  outflowPerDay: number;
  windowDays: number;
  txCount: number;
  currency: string;
}

/**
 * Shared stats computation. Spot + avg30 always come from stored snapshots.
 * Rate + breakdown are computed live from trailing-window transactions when
 * the adapter is reachable (so exclusion and lookback edits move the numbers
 * immediately); otherwise the latest stored rate with a zeroed breakdown.
 */
export async function getStats(db: Database.Database, adapter?: ActualAdapter): Promise<Stats> {
  const settings = getSettings(db);
  const rows = db
    .prepare('SELECT spot, ratePerDay FROM snapshots ORDER BY date DESC LIMIT 30')
    .all() as { spot: number; ratePerDay: number | null }[];
  const spots = rows.map((r) => r.spot).reverse();
  const latest = rows[0];
  const stored: Stats = {
    spot: latest?.spot ?? 0,
    avg30: avg30(spots),
    ratePerDay: latest?.ratePerDay ?? 0,
    inflowPerDay: 0,
    outflowPerDay: 0,
    windowDays: settings.lookbackDays,
    txCount: 0,
    currency: getSetting(db, 'currency') ?? 'USD',
  };
  if (adapter == null) return stored;
  try {
    const [balances, txs, currency] = await Promise.all([
      adapter.getDailyBalances(1, { excludedAccounts: settings.excludedAccounts }),
      adapter.getTransactions(addDaysIso(todayIsoUtc(), -(settings.lookbackDays - 1)), {
        excludedAccounts: settings.excludedAccounts,
      }),
      adapter.getCurrency(),
    ]);
    const closing = balances.at(-1);
    const breakdown = flowStats(
      applyExclusions(txs, { excludedCategories: settings.excludedCategories }),
      settings.lookbackDays,
    );
    return {
      spot: closing?.spot ?? stored.spot,
      avg30: stored.avg30,
      ratePerDay: breakdown.ratePerDay,
      inflowPerDay: breakdown.inflowPerDay,
      outflowPerDay: breakdown.outflowPerDay,
      windowDays: settings.lookbackDays,
      txCount: breakdown.txCount,
      currency,
    };
  } catch {
    return stored;
  }
}

/** GET /api/stats → { spot, avg30, ratePerDay, inflowPerDay, outflowPerDay, windowDays, txCount, currency }. */
export function statsRouter(db: Database.Database, adapter?: ActualAdapter): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json(await getStats(db, adapter));
  });
  return router;
}
