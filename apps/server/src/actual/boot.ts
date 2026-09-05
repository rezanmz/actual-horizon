import { mkdirSync } from 'node:fs';
import type { ActualAdapter } from '../actualAdapter.js';
import { loadActualConfig } from './config.js';
import { ActualConnector } from './connector.js';

/**
 * Production boot factory (Auth-owned side of the actualAdapter boundary).
 * Connects with process env; returns null (with a redacted warning) when
 * unconfigured or unreachable so the server boots degraded instead of
 * crashing. Never throws, never logs secrets.
 */
export async function connectAdapterFromEnv(): Promise<ActualAdapter | null> {
  try {
    // @actual-app/api scours the cache dir on init — ensure it exists first.
    // Missing dir otherwise surfaces as a bare ENOENT scandir failure.
    const { dataDir } = loadActualConfig();
    if (dataDir != null) mkdirSync(dataDir, { recursive: true });
    return await ActualConnector.connect();
  } catch (err) {
    console.warn(`actual sync disabled: ${err instanceof Error ? err.message : 'unknown error'}`);
    return null;
  }
}
