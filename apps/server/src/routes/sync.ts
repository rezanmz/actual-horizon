import type Database from 'better-sqlite3';
import { Router } from 'express';
import type { ActualAdapter } from '../actualAdapter.js';
import { appendDailySnapshot, backfillSnapshots } from '../snapshots.js';

export type SyncJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface SyncJobState {
  status: SyncJobStatus;
  /** Requested window while running; synced window once done. */
  days?: number;
  startedAt?: string;
  finishedAt?: string;
  syncedAt?: string;
  /** Snapshots backfilled by the last run. */
  count?: number;
  error?: string;
}

/** Single-flight sync handle: `start` begins (or joins) a run, `state` polls it. */
export interface SyncJob {
  state(): SyncJobState;
  start(days: number): SyncJobState;
}

/**
 * Single-flight background sync (#46). Long backfills must never run inside
 * a request handler: under a container CPU quota the synchronous work
 * starves /api/health past probe timeouts and kubelet kills the pod.
 * POST starts (or joins) the job and answers 202 immediately; GET polls.
 */
export function createSyncJob(db: Database.Database, adapter?: ActualAdapter): SyncJob {
  let state: SyncJobState = { status: 'idle' };

  async function run(days: number): Promise<void> {
    const startedAt = new Date().toISOString();
    state = { status: 'running', days, startedAt };
    try {
      if (adapter == null) throw new Error('actual unreachable');
      const points = await backfillSnapshots(db, adapter, days);
      await appendDailySnapshot(db, adapter);
      const syncedAt = new Date().toISOString();
      state = { status: 'done', days, startedAt, finishedAt: syncedAt, syncedAt, count: points.length };
    } catch (err) {
      state = {
        status: 'error',
        days,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'actual sync failed',
      };
    }
  }

  return {
    state: (): SyncJobState => ({ ...state }),
    start(days: number): SyncJobState {
      if (state.status !== 'running') void run(days);
      return { ...state };
    },
  };
}

/**
 * POST /api/sync?days=N → 202 + job state (never blocks on the backfill).
 * GET /api/sync → current job state. 503 when Actual is unreachable so the
 * UI renders a graceful degraded state instead of a hung refresh.
 */
export function syncRouter(
  db: Database.Database,
  adapter?: ActualAdapter,
  job: SyncJob = createSyncJob(db, adapter),
): Router {
  const router = Router();
  router.post('/', (req, res) => {
    if (adapter == null) {
      res.status(503).json({ error: 'actual unreachable' });
      return;
    }
    const raw = req.query.days;
    const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 365) : 180;
    res.status(202).json(job.start(days));
  });
  router.get('/', (_req, res) => {
    res.json(job.state());
  });
  return router;
}
