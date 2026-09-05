# Auth env snippet (for Foundations: merge into root `.env.example`)

```sh
# Authentication mode: oidc | local | disabled (default when unset: local)
AUTH_MODE=oidc

# Generic OIDC provider (tested against Authentik). Issuer must be https
# except for localhost. Discovery via <issuer>/.well-known/openid-configuration.
OIDC_ISSUER=https://auth.example.com/application/o/actual-horizon/
OIDC_CLIENT_ID=actual-horizon
OIDC_CLIENT_SECRET=change-me

# Either set the callback explicitly or derive it from APP_BASE_URL.
OIDC_REDIRECT_URI=https://app.example.com/api/auth/callback
# APP_BASE_URL=https://app.example.com
# OIDC_CALLBACK_PATH=/api/auth/callback
# OIDC_SCOPES=openid profile email

# HMAC secret for the httpOnly session cookie (min 32 chars).
# Required for AUTH_MODE=oidc; optional stub signing for local.
SESSION_SECRET=generate-a-long-random-string-min-32-chars
# SESSION_MAX_AGE_SEC=604800
```

Notes:

- Session cookie `ah_session` is `HttpOnly; SameSite=Lax; Path=/` (+`Secure`
  when served over https). Subject-scoped: every request carries `req.identity.sub`.
- `local` mode attaches `{ sub: 'local' }` (single-user stub).
  `disabled` attaches `{ sub: 'disabled' }` and skips all checks.
- No fallback secrets: oidc mode refuses to start without `SESSION_SECRET`
  and the full OIDC set.
