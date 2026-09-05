import type Database from 'better-sqlite3';
import { Router } from 'express';
import { rowToGoal, rowToWish } from '../db.js';
import { impactOfWish } from '../math.js';
import { getStats } from './stats.js';
import { sendError } from './validate.js';

/** GET /api/impact?wishId= → { perGoal, neverGoals }. */
export function impactRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (req, res) => {
    const wishId = req.query.wishId;
    if (typeof wishId !== 'string' || wishId.length === 0) {
      sendError(res, 400, 'wishId query param is required');
      return;
    }
    const wishRow = db
      .prepare(
        'SELECT id, name, price, cadence, status, addedAt, cooldownUntil, linkedGoalId, url, notes FROM wishes WHERE id = ?',
      )
      .get(wishId) as Parameters<typeof rowToWish>[0] | undefined;
    if (wishRow == null) {
      sendError(res, 404, 'wish not found');
      return;
    }
    const goalRows = db
      .prepare('SELECT id, name, target, priority, deadline FROM goals ORDER BY priority ASC')
      .all() as Parameters<typeof rowToGoal>[0][];
    const stats = getStats(db);
    res.json(
      impactOfWish(rowToWish(wishRow), goalRows.map(rowToGoal), stats.avg30, stats.ratePerDay),
    );
  });
  return router;
}
