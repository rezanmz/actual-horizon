# Actual Horizon sidecar. Workspaces under apps/ ride along so `npm ci`
# installs workspace deps before the build stage typechecks.
FROM node:24-slim AS base
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
RUN npm ci --ignore-scripts

FROM base AS build
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["npm", "run", "dev", "--workspace", "apps/server"]
