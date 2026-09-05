import type Database from 'better-sqlite3';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActualAdapter } from './actualAdapter.js';
import { openDb, resolveDbPath } from './db.js';
import { goalsRouter } from './routes/goals.js';
import { healthRouter } from './routes/health.js';
import { impactRouter } from './routes/impact.js';
import { snapshotsRouter } from './routes/snapshots.js';
import { statsRouter } from './routes/stats.js';
import { wishesRouter } from './routes/wishes.js';

export interface AppOptions {
  db?: Database.Database;
  /** Actual sidecar adapter (Auth-owned impl). Absent → reachable:false. */
  adapter?: ActualAdapter;
  /** Skip the apps/web/dist static hook (tests). */
  skipStatic?: boolean;
}

/** Build the Express app serving GET /api/* per Contract. */
export function createApp(options: AppOptions = {}): express.Express {
  const db = options.db ?? openDb();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.use('/api/health', healthRouter(options.adapter));
  app.use('/api/stats', statsRouter(db));
  app.use('/api/snapshots', snapshotsRouter(db));
  app.use('/api/goals', goalsRouter(db));
  app.use('/api/wishes', wishesRouter(db));
  app.use('/api/impact', impactRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'unknown api route' });
  });

  if (!options.skipStatic) mountWebDist(app);

  return app;
}

/** Serve the built web UI when apps/web/dist exists; API routes take precedence. */
function mountWebDist(app: express.Express): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = resolve(here, '..', '..', 'web', 'dist');
  if (!existsSync(resolve(webDist, 'index.html'))) return;
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(resolve(webDist, 'index.html'));
  });
}

const invokedAsMain =
  process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsMain) {
  const port = Number.parseInt(process.env.PORT ?? '3001', 10) || 3001;
  const dbPath = resolveDbPath();
  const app = createApp({ db: openDb(dbPath) });
  app.listen(port, () => {
    console.log(`actual-horizon server listening on :${port} (db ${dbPath})`);
  });
}
