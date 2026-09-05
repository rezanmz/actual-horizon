/** PKCE (RFC 7636, S256) + state/nonce helpers and the OIDC authorization URL builder. */

import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** Unpadded base64url of random bytes. */
export function randomString(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16) {
    throw new Error('randomString: bytes must be an integer >= 16');
  }
  return randomBytes(bytes).toString('base64url');
}

/** S256 code challenge for a verifier. */
export function sha256Base64Url(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('base64url');
}

export function createPkcePair(): PkcePair {
  const verifier = randomString(32);
  return { verifier, challenge: sha256Base64Url(verifier) };
}

export function createState(): string {
  return randomString(16);
}

export function createNonce(): string {
  return randomString(16);
}

export interface AuthorizationUrlParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  nonce?: string | undefined;
}

/** Build the OIDC authorization redirect URL (response_type=code, PKCE S256). */
export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (params.nonce !== undefined) url.searchParams.set('nonce', params.nonce);
  return url.toString();
}
