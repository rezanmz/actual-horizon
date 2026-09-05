# Actual Horizon sidecar. Workspaces under apps/ ride along so `npm ci`
# installs workspace deps before the build stage typechecks.
# Scripts stay enabled: better-sqlite3 needs its native bindings compiled
# (prebuilds) — `--ignore-scripts` leaves the server unbootable.
FROM node:24-slim AS base
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
RUN npm ci

FROM base AS build
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["npm", "start", "--workspace", "apps/server"]
