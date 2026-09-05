/** Actual Budget connection settings. Secrets never leave this module unredacted. */

/** Actual Budget release this connector targets. Keep in sync with apps/server deps. */
export const EXPECTED_ACTUAL_VERSION = '26.9.0';

export interface ActualConfig {
  serverURL: string;
  /** Budget sync ID (Actual "budget ID"). */
  budgetId: string;
  password: string | undefined;
  /** Session token alternative; forwarded to init as `sessionToken`. */
  token: string | undefined;
  dataDir: string | undefined;
  /** Fallback ISO currency code when the budget has none set. */
  currency: string | undefined;
}

export interface ActualEnv {
  ACTUAL_SERVER_URL?: string | undefined;
  ACTUAL_BUDGET_ID?: string | undefined;
  ACTUAL_PASSWORD?: string | undefined;
  ACTUAL_TOKEN?: string | undefined;
  ACTUAL_DATA_DIR?: string | undefined;
  ACTUAL_CURRENCY?: string | undefined;
}

function required(value: string | undefined, name: string): string {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') throw new Error(`Missing required env var ${name}`);
  return trimmed;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
}

export function loadActualConfig(env: ActualEnv = process.env): ActualConfig {
  const rawURL = required(env.ACTUAL_SERVER_URL, 'ACTUAL_SERVER_URL');
  let serverURL: string;
  try {
    const url = new URL(rawURL);
    if (url.protocol === 'http:') {
      const host = url.hostname.toLowerCase();
      const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      if (!loopback) throw new Error('https required except for localhost');
    } else if (url.protocol !== 'https:') {
      throw new Error('expected http(s) URL');
    }
    serverURL = rawURL.replace(/\/+$/, '');
  } catch (err) {
    if (err instanceof Error && err.message === 'https required except for localhost') throw err;
    throw new Error(`Invalid ACTUAL_SERVER_URL ${JSON.stringify(rawURL)}: expected http(s) URL`);
  }
  const budgetId = required(env.ACTUAL_BUDGET_ID, 'ACTUAL_BUDGET_ID');
  const password = optional(env.ACTUAL_PASSWORD);
  const token = optional(env.ACTUAL_TOKEN);
  if (password === undefined && token === undefined) {
    throw new Error('Missing Actual credential: set ACTUAL_PASSWORD and/or ACTUAL_TOKEN');
  }
  return {
    serverURL,
    budgetId,
    password,
    token,
    dataDir: optional(env.ACTUAL_DATA_DIR),
    currency: optional(env.ACTUAL_CURRENCY),
  };
}

/** Log-safe copy: secrets replaced, hosts preserved for debugging. */
export function redactConfig(config: ActualConfig): Record<string, string> {
  return {
    serverURL: config.serverURL,
    budgetId: config.budgetId,
    password: config.password === undefined ? '(unset)' : '(set)',
    token: config.token === undefined ? '(unset)' : '(set)',
    dataDir: config.dataDir ?? '(default)',
    currency: config.currency ?? '(budget default)',
  };
}
