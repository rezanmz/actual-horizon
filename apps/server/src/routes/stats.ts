import type Database from 'better-sqlite3';
import { Router } from 'express';
import { getSetting } from '../db.js';
import { avg30 } from '../math.js';

export interface Stats {
  spot: number;
  avg30: number;
  ratePerDay: number;
  currency: string;
}

/** Shared stats computation: latest snapshot + trailing means, db only. */
export function getStats(db: Database.Database): Stats {
  const rows = db
    .prepare('SELECT spot, ratePerDay FROM snapshots ORDER BY date DESC LIMIT 30')
    .all() as { spot: number; ratePerDay: number | null }[];
  const spots = rows.map((r) => r.spot).reverse();
  const latest = rows[0];
  return {
    spot: latest?.spot ?? 0,
    avg30: avg30(spots),
    ratePerDay: latest?.ratePerDay ?? 0,
    currency: getSetting(db, 'currency') ?? 'USD',
  };
}

/** GET /api/stats → { spot, avg30, ratePerDay, currency }. */
export function statsRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(getStats(db));
  });
  return router;
}
