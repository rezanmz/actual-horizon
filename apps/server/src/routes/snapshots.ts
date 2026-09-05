import type Database from 'better-sqlite3';
import { Router } from 'express';
import { readSnapshots } from '../snapshots.js';

/** GET /api/snapshots?days=N → [{ date, spot, avg, rate }]. */
export function snapshotsRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (req, res) => {
    const raw = req.query.days;
    const days = typeof raw === 'string' ? Number.parseInt(raw, 10) : 30;
    res.json(readSnapshots(db, Number.isFinite(days) ? days : 30));
  });
  return router;
}
