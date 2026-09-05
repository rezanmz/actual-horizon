/** httpOnly cookie session: HMAC-signed, sub-scoped, no server store. */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'ah_session';

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface CookieOptions {
  maxAgeSec: number;
  /** Set Secure when the app is served over https. */
  secure: boolean;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data, 'utf8').digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Mint a Set-Cookie header value for a subject. httpOnly always. */
export function createSessionCookie(
  sub: string,
  secret: string,
  options: CookieOptions,
): string {
  if (sub === '') throw new Error('createSessionCookie: sub must not be empty');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub, iat: nowSec, exp: nowSec + options.maxAgeSec };
  const data = base64UrlEncode(JSON.stringify(payload));
  const sig = sign(data, secret);
  const parts = [
    `${SESSION_COOKIE_NAME}=${data}.${sig}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSec}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Verify a Cookie header and return the session, or null when missing/invalid/expired. */
export function parseSessionCookie(
  cookieHeader: string | undefined,
  secret: string,
): SessionPayload | null {
  if (cookieHeader === undefined || cookieHeader === '') return null;
  const raw = findCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (raw === undefined) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const data = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!safeEqual(sign(data, secret), sig)) return null;
  let payload: SessionPayload;
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(data));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['sub'] !== 'string' || typeof record['iat'] !== 'number' || typeof record['exp'] !== 'number') {
      return null;
    }
    payload = { sub: record['sub'] as string, iat: record['iat'] as number, exp: record['exp'] as number };
  } catch {
    return null;
  }
  if (payload.sub === '') return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
  return payload;
}

/** Expire the session cookie (logout). */
export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function findCookie(header: string, name: string): string | undefined {
  const pairs = header.split(';');
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return undefined;
}
