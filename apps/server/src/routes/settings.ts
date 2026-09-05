import type Database from 'better-sqlite3';
import { Router } from 'express';
import { getSettings, updateSettings } from '../settings.js';
import { sendError } from './validate.js';

/** GET /api/settings → full shape; PUT /api/settings (partial) → full shape. */
export function settingsRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(getSettings(db));
  });
  router.put('/', (req, res) => {
    const patch = (req.body ?? {}) as Record<string, unknown>;
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      sendError(res, 400, 'settings body must be an object');
      return;
    }
    try {
      res.json(updateSettings(db, patch));
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : 'invalid settings');
    }
  });
  return router;
}
