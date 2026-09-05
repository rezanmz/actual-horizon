# Security Policy

## Supported versions

Actual Horizon is pre-1.0 and moving fast. Security fixes land on the latest
`main`; only the most recent release is supported.

| Version   | Supported          |
|-----------|--------------------|
| latest    | :white_check_mark: |
| older     | :x:                |

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting
(Security tab → Report a vulnerability) or contact the maintainers through the
repository's listed channels.

Include: affected version/commit, steps to reproduce, and impact. We aim to
acknowledge within 72 hours and will coordinate disclosure with you.

## Ground rules

- No personal data, real credentials, or real budget exports in issues, PRs,
  discussions, or commits — use placeholders from `.env.example`.
- `AUTH_MODE=disabled` is for local development only. Production deployments
  must use OIDC.
- Actual Budget credentials (`ACTUAL_PASSWORD`, budget IDs) are server-side
  only and must never reach the browser bundle.
- Session cookies are `httpOnly`, `Secure`, `SameSite=Lax`.
