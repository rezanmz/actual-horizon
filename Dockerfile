# Actual Horizon sidecar skeleton. apps/server + apps/web land via their own slices.
FROM node:24-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
# Workspaces materialize in later slices; wildcard keeps this skeleton valid.
COPY apps/server/package.json ./apps/server/ 2>/dev/null || true
COPY apps/web/package.json ./apps/web/ 2>/dev/null || true
RUN npm install --ignore-scripts || true

FROM base AS build
COPY . .
RUN npm run build --if-present || true

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["npm", "run", "dev", "--workspace", "apps/server"]
