# Contributing to Actual Horizon

Thanks for stopping by — this is a public OSS project (MIT). Generic onboarding:
no personal data, secrets, or real budget exports in issues, PRs, or commits.

## Workflow: issue → branch → PR

1. Find or file an issue describing **one** slice of work.
2. Branch from latest `main`: `git fetch origin && git checkout -b feat/<slug>-<N> origin/main`
   (`fix/` and `chore/` prefixes are fine too).
3. Keep the change scoped to the issue. One concern per PR; no drive-by refactors.
4. Commit in one-line imperative style with an area prefix, e.g.
   `feat(web): add wish cooling banner`, `fix(api): handle zero rate`.
   Commits on `main` are linear (rebase, no merge commits) and drive
   release-please, so conventional-commit shape matters.
5. Open a PR that says `Closes #<N>`. A maintainer merges — **never push to
   `main` directly** (it is protected, admins included).

## What CI runs on your PR

- `CI` workflow: typecheck, lint, test, build (Node 24 matrix), plus a Docker build.
- `docker` workflow: builds (and on `main`/tags, pushes) the sidecar image.
- `release-please` workflow: drafts releases from conventional commits.

The PR template lists the required checks — make sure they are green.

## Maintainer setup: versioned image automation

`release-please` runs with `RELEASE_PLEASE_TOKEN` (a classic PAT with the
`repo` scope) so its tags/releases cascade into the Docker workflow and
versioned images publish automatically. Without it the workflow falls back
to `github.token`, which still cuts releases but needs a manual `vX.Y.Z`
tag push per release to build the image. To enable:

1. Create a PAT (classic, `repo` scope) at <https://github.com/settings/tokens>.
2. Add it as the `RELEASE_PLEASE_TOKEN` repo secret
   (`gh secret set RELEASE_PLEASE_TOKEN`).

The PR template lists the required checks — make sure they are green.

## Local setup

```sh
cp .env.example .env   # placeholders only; never commit real values
npm install
npm run typecheck
npm test
```

See `AGENTS.md` for the agent-oriented guide (ownership map, frozen API
contract, math notes) and `README.md` for product context.
