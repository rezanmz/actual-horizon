# Actual env snippet (for Foundations: merge into root `.env.example`)

```sh
# Actual Budget sidecar (connector targets Actual 26.9.0; Backend pins
# exact @actual-app/api@26.9.0 in apps/server/package.json).
ACTUAL_SERVER_URL=https://budget.example.com
# Budget sync ID (the budget's ID in Actual).
ACTUAL_BUDGET_ID=change-me
# Credential: password and/or session token (token is forwarded to
# @actual-app/api as `sessionToken`).
ACTUAL_PASSWORD=change-me
# ACTUAL_TOKEN=change-me
# Local cache dir for downloaded budget files (optional).
# ACTUAL_DATA_DIR=./data/actual
# Fallback ISO currency when the budget has none set (optional, default USD).
# ACTUAL_CURRENCY=USD
```

Notes:

- Encrypted at rest: `ACTUAL_PASSWORD`/`ACTUAL_TOKEN` are runtime secrets.
  Store them in the platform secret store (or an encrypted env file), never
  in git, and never emit them in logs — `redactConfig()` renders `(set)`.
- No hardcoded hosts: the connector refuses to start without
  `ACTUAL_SERVER_URL` + `ACTUAL_BUDGET_ID` + a credential. Plain http is
  accepted for localhost only.
