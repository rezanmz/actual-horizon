import { Router } from 'express';
import type { ActualAdapter } from '../actualAdapter.js';

/**
 * GET /api/meta/accounts → [{ id, name, offBudget }];
 * GET /api/meta/categories → [{ id, name }].
 * Both degrade to [] when Actual is unreachable — the settings UI renders
 * empty pickers instead of failing.
 */
export function metaRouter(adapter?: ActualAdapter): Router {
  const router = Router();
  router.get('/accounts', async (_req, res) => {
    if (adapter == null) {
      res.json([]);
      return;
    }
    try {
      res.json(await adapter.getAccounts());
    } catch {
      res.json([]);
    }
  });
  router.get('/categories', async (_req, res) => {
    if (adapter == null) {
      res.json([]);
      return;
    }
    try {
      res.json(await adapter.getCategories());
    } catch {
      res.json([]);
    }
  });
  return router;
}
