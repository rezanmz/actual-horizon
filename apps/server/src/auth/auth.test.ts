import { describe, expect, it } from 'vitest';

import { joinCallbackUrl, loadAuthConfig, parseAuthMode, type AuthMode } from './config.js';
import {
  buildAuthorizationUrl,
  createNonce,
  createPkcePair,
  createState,
  randomString,
  sha256Base64Url,
} from './pkce.js';
import { createAuthMiddleware } from './middleware.js';
import {
  createSessionCookie,
  expiredSessionCookie,
  parseSessionCookie,
} from './session.js';


const SECRET = 'a'.repeat(32);

describe('parseAuthMode', () => {
  it('defaults to local when unset or blank', () => {
    expect(parseAuthMode(undefined)).toBe('local');
    expect(parseAuthMode('  ')).toBe('local');
  });

  it('accepts the three modes case-insensitively', () => {
    expect(parseAuthMode('oidc')).toBe('oidc');
    expect(parseAuthMode('LOCAL')).toBe('local');
    expect(parseAuthMode(' Disabled ')).toBe('disabled');
  });

  it('rejects anything else', () => {
    expect(() => parseAuthMode('oauth')).toThrow(/AUTH_MODE/);
    expect(() => parseAuthMode('oidc,local')).toThrow(/AUTH_MODE/);
  });
});

describe('joinCallbackUrl', () => {
  it('joins base and path without doubling slashes', () => {
    expect(joinCallbackUrl('https://app.example.com/', '/api/auth/callback')).toBe(
      'https://app.example.com/api/auth/callback',
    );
    expect(joinCallbackUrl('https://app.example.com', 'api/auth/callback')).toBe(
      'https://app.example.com/api/auth/callback',
    );
  });
});

describe('PKCE', () => {
  it('derives an S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(sha256Base64Url(verifier));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('emits unpadded base64url randomness', () => {
    expect(randomString(32)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createState()).not.toBe(createState());
    expect(createNonce()).not.toBe(createNonce());
  });
});

describe('buildAuthorizationUrl', () => {
  it('builds a code + S256 redirect URL', () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: 'https://auth.example.com/authorize',
        clientId: 'client',
        redirectUri: 'https://app.example.com/api/auth/callback',
        scopes: ['openid', 'profile'],
        state: 'state123',
        codeChallenge: 'challenge123',
        nonce: 'nonce123',
      }),
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid profile');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('nonce')).toBe('nonce123');
  });

  it('omits nonce when not provided', () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: 'https://auth.example.com/authorize',
        clientId: 'client',
        redirectUri: 'https://app.example.com/api/auth/callback',
        scopes: ['openid'],
        state: 's',
        codeChallenge: 'c',
      }),
    );
    expect(url.searchParams.has('nonce')).toBe(false);
  });
});

describe('session cookie', () => {
  it('round-trips a subject', () => {
    const header = createSessionCookie('user-1', SECRET, { maxAgeSec: 3600, secure: true });
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    const session = parseSessionCookie(`other=x; ${header.split(';')[0]}`, SECRET);
    expect(session?.sub).toBe('user-1');
  });

  it('rejects tampered, wrong-secret, and expired cookies', () => {
    const header = createSessionCookie('user-1', SECRET, { maxAgeSec: 3600, secure: false });
    const value = header.split(';')[0]?.split('=')[1] ?? '';
    expect(parseSessionCookie(`ah_session=${value}tampered`, SECRET)).toBeNull();
    expect(parseSessionCookie(`ah_session=${value}`, 'b'.repeat(32))).toBeNull();
    const expired = createSessionCookie('user-1', SECRET, { maxAgeSec: -1, secure: false });
    expect(parseSessionCookie(expired.split(';')[0], SECRET)).toBeNull();
    expect(parseSessionCookie(undefined, SECRET)).toBeNull();
    expect(expiredSessionCookie()).toContain('Max-Age=0');
  });
});

describe('loadAuthConfig', () => {
  it('loads a full oidc config', () => {
    const config = loadAuthConfig({
      AUTH_MODE: 'oidc',
      OIDC_ISSUER: 'https://auth.example.com/app/',
      OIDC_CLIENT_ID: 'id',
      OIDC_CLIENT_SECRET: 'secret',
      OIDC_REDIRECT_URI: 'https://app.example.com/api/auth/callback',
      SESSION_SECRET: SECRET,
    });
    expect(config.oidc?.issuer).toBe('https://auth.example.com/app');
    expect(config.oidc?.scopes).toEqual(['openid', 'profile', 'email']);
  });

  it('derives the redirect URI from base + path', () => {
    const config = loadAuthConfig({
      AUTH_MODE: 'oidc',
      OIDC_ISSUER: 'https://auth.example.com/',
      OIDC_CLIENT_ID: 'id',
      OIDC_CLIENT_SECRET: 'secret',
      APP_BASE_URL: 'https://app.example.com/',
      SESSION_SECRET: SECRET,
    });
    expect(config.oidc?.redirectUri).toBe('https://app.example.com/api/auth/callback');
  });

  it('refuses oidc without secrets and http issuers', () => {
    const base = {
      AUTH_MODE: 'oidc',
      OIDC_ISSUER: 'https://auth.example.com/',
      OIDC_CLIENT_ID: 'id',
      OIDC_CLIENT_SECRET: 'secret',
      OIDC_REDIRECT_URI: 'https://app.example.com/api/auth/callback',
    };
    expect(() => loadAuthConfig({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(() => loadAuthConfig({ ...base, SESSION_SECRET: SECRET, OIDC_ISSUER: 'http://auth.example.com/' })).toThrow(
      /https/,
    );
  });
});

describe('createAuthMiddleware', () => {
  it('passes disabled and local through with stub identities', () => {
    for (const mode of ['disabled', 'local'] as const) {
      const req: { headers: Record<string, string | undefined>; identity?: { sub: string; mode: AuthMode } } = {
        headers: {},
      };
      let next = false;
      createAuthMiddleware({ mode, sessionSecret: undefined })(req, { setHeader: () => {} }, () => {
        next = true;
      });
      expect(next).toBe(true);
      expect(req.identity?.sub).toBe(mode);
    }
  });

  it('rejects oidc requests without a session and accepts valid ones', () => {
    const middleware = createAuthMiddleware({ mode: 'oidc', sessionSecret: SECRET });
    let status = 0;
    let body = '';
    middleware(
      { headers: {} },
      {
        setHeader: () => {},
        end: (b?: string) => {
          body = b ?? '';
        },
        set statusCode(code: number) {
          status = code;
        },
      },
      () => {
        throw new Error('must not call next');
      },
    );
    expect(status).toBe(401);
    expect(body).toContain('unauthorized');
    const cookie = createSessionCookie('sub-9', SECRET, { maxAgeSec: 3600, secure: false });
    const req: { headers: Record<string, string>; identity?: { sub: string; mode: AuthMode } } = {
      headers: { cookie: cookie.split(';')[0] ?? '' },
    };
    let next = false;
    middleware(req, { setHeader: () => {} }, () => {
      next = true;
    });
    expect(next).toBe(true);
    expect(req.identity?.sub).toBe('sub-9');
  });
});
