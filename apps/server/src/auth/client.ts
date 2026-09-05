/**
 * Generic OIDC client (tested against Authentik; works with any RFC-compliant
 * provider). Zero dependencies: discovery + token exchange over fetch.
 */

import type { OidcSettings } from './config.js';
import { buildAuthorizationUrl, createNonce, createPkcePair, createState } from './pkce.js';

export interface OidcDiscovery {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
}

export interface LoginStart {
  /** Redirect the browser here. */
  url: string;
  /** Persist these server-side (e.g. short-lived cookies) to verify the callback. */
  state: string;
  codeVerifier: string;
  nonce: string;
}

export interface CodeExchange {
  accessToken: string;
  idToken: string | undefined;
  tokenType: string;
}

export interface UserSubject {
  sub: string;
}

/** Raw provider payloads: asserted once per boundary, then narrowed by checks. */
interface DiscoveryPayload {
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  userinfo_endpoint?: unknown;
}

interface TokenPayload {
  access_token?: unknown;
  id_token?: unknown;
  token_type?: unknown;
}

interface UserinfoPayload {
  sub?: unknown;
}

function endpoint(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Invalid discovery document: missing ${name}`);
  }
  return value;
}

async function jsonObject(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`OIDC request to ${url} failed: HTTP ${res.status}`);
  }
  const payload: unknown = await res.json();
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error(`Invalid OIDC response from ${url}: expected a JSON object`);
  }
  return payload as Record<string, unknown>;
}

/** Fetch and validate the provider discovery document. */
export async function discover(issuer: string): Promise<OidcDiscovery> {
  const normalized = issuer.replace(/\/+$/, '');
  const doc = (await jsonObject(
    `${normalized}/.well-known/openid-configuration`,
  )) as DiscoveryPayload;
  return {
    authorizationEndpoint: endpoint(doc.authorization_endpoint, 'authorization_endpoint'),
    tokenEndpoint: endpoint(doc.token_endpoint, 'token_endpoint'),
    userinfoEndpoint: endpoint(doc.userinfo_endpoint, 'userinfo_endpoint'),
  };
}

/** Start a login: discover endpoints, mint PKCE/state/nonce, build the redirect URL. */
export async function startLogin(settings: OidcSettings): Promise<LoginStart> {
  const discovery = await discover(settings.issuer);
  const { verifier, challenge } = createPkcePair();
  const state = createState();
  const nonce = createNonce();
  const url = buildAuthorizationUrl({
    authorizationEndpoint: discovery.authorizationEndpoint,
    clientId: settings.clientId,
    redirectUri: settings.redirectUri,
    scopes: settings.scopes,
    state,
    codeChallenge: challenge,
    nonce,
  });
  return { url, state, codeVerifier: verifier, nonce };
}

/** Exchange an authorization code for tokens (PKCE verifier required). */
export async function exchangeCode(
  settings: OidcSettings,
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
): Promise<CodeExchange> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: settings.redirectUri,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    code_verifier: codeVerifier,
  });
  const payload = (await jsonObject(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })) as TokenPayload;
  if (typeof payload.access_token !== 'string' || payload.access_token === '') {
    throw new Error('Invalid token response: missing access_token');
  }
  return {
    accessToken: payload.access_token,
    idToken: typeof payload.id_token === 'string' ? payload.id_token : undefined,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : 'Bearer',
  };
}

/** Fetch the userinfo subject for an access token. */
export async function fetchUserSubject(
  userinfoEndpoint: string,
  accessToken: string,
): Promise<UserSubject> {
  const payload = (await jsonObject(userinfoEndpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  })) as UserinfoPayload;
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new Error('Invalid userinfo response: missing sub');
  }
  return { sub: payload.sub };
}
