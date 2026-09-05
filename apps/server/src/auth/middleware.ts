/**
 * Sub-scoped identity middleware stub. Framework-agnostic: works with any
 * node:http-compatible req/res (Express, Fastify via adapter, plain http).
 */

import type { AuthMode } from './config.js';
import { parseSessionCookie } from './session.js';

export interface Identity {
  /** OIDC subject (or the mode stub subject). All data access scopes to this. */
  sub: string;
  mode: AuthMode;
}

export interface IdentityRequest {
  headers: Record<string, string | string[] | undefined>;
  identity?: Identity | undefined;
}

export interface IdentityResponse {
  setHeader(name: string, value: string | string[]): void;
  statusCode?: number | undefined;
  end?: ((body?: string) => void) | undefined;
}

export type NextFunction = () => void;

export interface MiddlewareOptions {
  mode: AuthMode;
  sessionSecret: string | undefined;
}

function readCookieHeader(req: IdentityRequest): string | undefined {
  const raw = req.headers['cookie'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.join('; ');
  return undefined;
}

function unauthorized(res: IdentityResponse): void {
  res.statusCode = 401;
  res.setHeader('content-type', 'application/json');
  res.end?.('{"error":"unauthorized"}');
}

/**
 * Attach req.identity from the session cookie (oidc) or a mode stub
 * (local/disabled). In oidc mode a missing/invalid session ends with 401.
 */
export function createAuthMiddleware(options: MiddlewareOptions) {
  return function authMiddleware(
    req: IdentityRequest,
    res: IdentityResponse,
    next: NextFunction,
  ): void {
    if (options.mode === 'disabled') {
      req.identity = { sub: 'disabled', mode: options.mode };
      next();
      return;
    }
    if (options.mode === 'local') {
      req.identity = { sub: 'local', mode: options.mode };
      next();
      return;
    }
    const session = parseSessionCookie(readCookieHeader(req), options.sessionSecret ?? '');
    if (session === null) {
      unauthorized(res);
      return;
    }
    req.identity = { sub: session.sub, mode: options.mode };
    next();
  };
}
