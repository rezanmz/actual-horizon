# Actual Horizon sidecar skeleton. apps/server + apps/web land via their own slices.
FROM node:24-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
# Workspaces land via their own slices; install must succeed with or without them.
RUN npm ci --ignore-scripts

FROM base AS build
COPY . .
# Skip the workspace build while no workspace package.jsons exist yet;
# once slices land, the real build runs and failures propagate.
RUN has_ws=0; for f in apps/*/package.json packages/*/package.json; do [ -e "$f" ] && has_ws=1; done; if [ "$has_ws" -eq 1 ]; then npm run build; else echo "no workspaces yet — skipping build"; fi

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["npm", "run", "dev", "--workspace", "apps/server"]
