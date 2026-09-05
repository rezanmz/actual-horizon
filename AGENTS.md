# AGENTS.md — Actual Horizon agent guide

> Agent-first repo. Humans merge; agents do the work via issue → branch → PR.
> Public OSS (MIT). No personal data, secrets, names, or emails in code, issues, or PRs.

## How to work

1. Pick an open issue, note its number `N` and scope.
2. `git fetch origin && git checkout -b feat/<slug>-N origin/main` (or `fix/`, `chore/`).
3. Implement **only** that issue. No drive-by refactors, no scope creep.
4. Validate slice-locally (see below). SKIP project-wide suites mid-flight —
   siblings edit concurrently; the parent runs full validation after all PRs land.
5. Open a PR with `Closes #N` in the body. Do NOT merge — the parent merges in order.
6. One-line imperative commits with area prefix: `feat(ui): …`, `fix(api): …`,
   `chore(ci): …`, `docs: …`. Conventional commits feed release-please; keep
   linear history (rebase, no merge commits, no direct pushes to `main`).

## File ownership (exclusive — same-file edits do NOT merge)

| Owner        | Paths                                              |
|--------------|----------------------------------------------------|
| Foundations  | repo root only (`*.md`, `*.json`, `Dockerfile`, `compose*`, `.github/`, `.env.example`) |
| ApiBackend   | `apps/server/**` except `src/auth/**` + `src/actual/**` |
| AuthActual   | `apps/server/src/auth/**` + `apps/server/src/actual/**` |
| DashboardUI  | `apps/web/**` only                                 |

Need a root change but you are not Foundations? Message the Foundations agent —
do NOT edit root files directly.

## Stack (frozen unless an issue says otherwise)

- Node 24, npm workspaces (`apps/server`, `apps/web`, `packages/*`).
- TypeScript strict everywhere; `tsconfig.base.json` at root.
- SQLite sidecar for app data. Reference upstream: **Actual Budget 26.9.0**
  (`@actual-app/api` pinned to `26.9.0`).
- release-please for versioning; `main` is protected (no direct push,
  `enforce_admins`, required `CI` check).

## Frozen API contract (change = broadcast to all agents BEFORE editing)

- `GET /api/health` → `{ ok: true, actual: { version: "26.9.0", reachable: bool } }`
- `GET /api/stats` → `{ spot, avg30, ratePerDay, currency }`
- `GET /api/snapshots?days=N` → `[{ date, spot, avg, rate }]`
- CRUD `/api/goals` → `Goal{ id, name, target, priority, deadline? }`
- CRUD `/api/wishes` → `Wish{ id, name, price, cadence: one-off|daily|weekly|monthly, status: inbox|cooling|ready|bought|rejected, addedAt, cooldownUntil, linkedGoalId?, url?, notes? }`
- `GET /api/impact?wishId=` → `{ perGoal: [{ goalId, oldDate, newDate, delayDays }], neverGoals: [goalId] }`

## Math (frozen)

- `avg30 = mean(daily spot over trailing 30d)`.
- `rate = (inflows − outflows) / days` over the window; transfers excluded by
  default (excludable via flag).
- `days_to_goal = (target − avg) / rate`, evaluated as a priority waterfall.
- `delay = price / rate` (one-off purchase pushes each goal back by `delay` days).
- Recurring wish: `rate' = rate − daily_cost` where
  `daily_cost = price / {1, 7, 30}` for daily/weekly/monthly; `rate' <= 0` → `never`.
- `rate <= 0` → goal status `drifting` (no date).

## Auth summary

- `AUTH_MODE=disabled|oidc`: `disabled` = local dev only, never in production.
- OIDC via generic provider (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
  `OIDC_REDIRECT_URI`); session cookie `httpOnly`, `Secure`, `SameSite=Lax`.
- Actual Budget credentials (`ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, `ACTUAL_BUDGET_ID`
  or `ACTUAL_BUDGET_SYNC_ID`) live server-side only — never exposed to `apps/web`.
- See `.env.example` for the full placeholder list (no real values, no secrets).

## Validation (slice-local only)

- Backend slice: `npm run -w apps/server typecheck && npx vitest run <owned-path>`.
- UI slice: `npm run -w apps/web typecheck` (+ targeted vitest for owned path).
- Root slice: YAML parse check on workflows (actionlint if installed, else a
  `node --check`-style sanity parse) — never project-wide build/lint/test.
- Never claim done without fresh evidence from the current session.
