import type Database from 'better-sqlite3';
import { Router } from 'express';
import type { ActualAdapter } from '../actualAdapter.js';
import { appendDailySnapshot, backfillSnapshots, readSnapshots } from '../snapshots.js';

/**
 * POST /api/sync?days=N → backfill + append today's snapshot from Actual,
 * then return the fresh trailing window. 503 when unreachable so the UI can
 * render a graceful degraded state instead of stale charts.
 */
export function syncRouter(db: Database.Database, adapter?: ActualAdapter): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    if (adapter == null) {
      res.status(503).json({ error: 'actual unreachable' });
      return;
    }
    const raw = req.query.days;
    const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 365) : 180;
    try {
      await backfillSnapshots(db, adapter, days);
      await appendDailySnapshot(db, adapter);
    } catch {
      res.status(503).json({ error: 'actual sync failed' });
      return;
    }
    res.json({ ok: true, syncedAt: new Date().toISOString(), days, snapshots: readSnapshots(db, days) });
  });
  return router;
}
