import { Router } from 'express';
import { ACTUAL_VERSION } from '../math.js';
import type { ActualAdapter } from '../actualAdapter.js';

/** GET /api/health → { ok, actual: { version, reachable } }. */
export function healthRouter(adapter?: ActualAdapter): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    let version = ACTUAL_VERSION;
    let reachable = false;
    if (adapter) {
      try {
        reachable = await adapter.isReachable();
        if (reachable) version = await adapter.getVersion();
      } catch {
        reachable = false;
      }
    }
    res.json({ ok: true, actual: { version, reachable } });
  });
  return router;
}
