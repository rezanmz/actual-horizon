/** Auth mode parsing + OIDC settings. No secrets are logged here. */

export type AuthMode = 'oidc' | 'local' | 'disabled';

const MODES: readonly AuthMode[] = ['oidc', 'local', 'disabled'];

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface AuthConfig {
  mode: AuthMode;
  /** Present only when mode === 'oidc'. */
  oidc: OidcSettings | undefined;
  /** HMAC secret for the httpOnly session cookie. Required in oidc/local modes. */
  sessionSecret: string | undefined;
  /** Seconds a session cookie stays valid. Default 7 days. */
  sessionMaxAgeSec: number;
}

const DEFAULT_SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

/** Parse AUTH_MODE. Unset/blank defaults to 'local' (single-subject stub identity). */
export function parseAuthMode(value: string | undefined): AuthMode {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === '') return 'local';
  const found = MODES.find((m) => m === normalized);
  if (found === undefined) {
    throw new Error(
      `Invalid AUTH_MODE ${JSON.stringify(value)}: expected one of ${MODES.join('|')}`,
    );
  }
  return found;
}

function required(value: string | undefined, name: string): string {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') throw new Error(`Missing required env var ${name}`);
  return trimmed;
}

function normalizeIssuer(raw: string): string {
  const issuer = raw.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error(`Invalid OIDC_ISSUER ${JSON.stringify(raw)}: not a URL`);
  }
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (url.protocol === 'http:' && !loopback) {
    throw new Error('Invalid OIDC_ISSUER: https required except for localhost');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid OIDC_ISSUER: expected http(s) URL');
  }
  return issuer;
}

/**
 * Join an app base URL and a callback path into the OIDC redirect URI.
 * e.g. joinCallbackUrl('https://app.example.com/', '/api/auth/callback')
 *   -> 'https://app.example.com/api/auth/callback'
 */
export function joinCallbackUrl(baseUrl: string, callbackPath: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const path = callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`;
  return `${base}${path}`;
}

export interface AuthEnv {
  AUTH_MODE?: string | undefined;
  OIDC_ISSUER?: string | undefined;
  OIDC_CLIENT_ID?: string | undefined;
  OIDC_CLIENT_SECRET?: string | undefined;
  OIDC_REDIRECT_URI?: string | undefined;
  APP_BASE_URL?: string | undefined;
  OIDC_CALLBACK_PATH?: string | undefined;
  OIDC_SCOPES?: string | undefined;
  SESSION_SECRET?: string | undefined;
  SESSION_MAX_AGE_SEC?: string | undefined;
}

export function loadAuthConfig(env: AuthEnv = process.env): AuthConfig {
  const mode = parseAuthMode(env.AUTH_MODE);
  if (mode === 'disabled') {
    return { mode, oidc: undefined, sessionSecret: undefined, sessionMaxAgeSec: 0 };
  }

  const sessionSecretRaw = (env.SESSION_SECRET ?? '').trim();
  const sessionSecret = sessionSecretRaw === '' ? undefined : sessionSecretRaw;
  if (sessionSecret !== undefined && sessionSecret.length < 32) {
    throw new Error('Invalid SESSION_SECRET: must be at least 32 characters');
  }

  if (mode === 'local') {
    return { mode, oidc: undefined, sessionSecret, sessionMaxAgeSec: readMaxAge(env) };
  }

  // mode === 'oidc'
  if (sessionSecret === undefined) {
    throw new Error('Missing required env var SESSION_SECRET (required for AUTH_MODE=oidc)');
  }
  const issuer = normalizeIssuer(required(env.OIDC_ISSUER, 'OIDC_ISSUER'));
  const redirectUri = resolveRedirectUri(env);
  const scopesRaw = (env.OIDC_SCOPES ?? 'openid profile email').trim();
  return {
    mode,
    oidc: {
      issuer,
      clientId: required(env.OIDC_CLIENT_ID, 'OIDC_CLIENT_ID'),
      clientSecret: required(env.OIDC_CLIENT_SECRET, 'OIDC_CLIENT_SECRET'),
      redirectUri,
      scopes: scopesRaw.split(/\s+/).filter((s) => s.length > 0),
    },
    sessionSecret,
    sessionMaxAgeSec: readMaxAge(env),
  };
}

function resolveRedirectUri(env: AuthEnv): string {
  const direct = (env.OIDC_REDIRECT_URI ?? '').trim();
  if (direct !== '') return direct;
  const base = (env.APP_BASE_URL ?? '').trim();
  if (base === '') {
    throw new Error('Missing OIDC_REDIRECT_URI (or APP_BASE_URL + OIDC_CALLBACK_PATH)');
  }
  return joinCallbackUrl(base, (env.OIDC_CALLBACK_PATH ?? '/api/auth/callback').trim());
}

function readMaxAge(env: AuthEnv): number {
  const raw = (env.SESSION_MAX_AGE_SEC ?? '').trim();
  if (raw === '') return DEFAULT_SESSION_MAX_AGE_SEC;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid SESSION_MAX_AGE_SEC ${JSON.stringify(raw)}: positive integer seconds`);
  }
  return parsed;
}
