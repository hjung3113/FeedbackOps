# syntax=docker/dockerfile:1.7
FROM node:22.11.0-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches ./patches
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN pnpm install --filter @fops/backend... --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN pnpm --filter @fops/backend... build \
  && pnpm --filter @fops/shared exec tsc -p tsconfig.json --noEmit false

# pnpm deploy creates an isolated production dependency tree. Shared is
# TypeScript-only in the workspace, so stage its emitted JS and point only the
# deployed copy at it; the committed workspace package remains unchanged.
# pnpm deploy hardlinks workspace files, so overwrite with --remove-destination
# and unlink package.json before rewriting it (never edit the shared inode).
RUN pnpm --filter @fops/backend deploy --prod /deploy \
  && mkdir -p /deploy/dist /deploy/node_modules/@fops/shared/dist \
  && cp -a --remove-destination apps/backend/dist/. /deploy/dist/ \
  && cp -a --remove-destination packages/shared/dist/. /deploy/node_modules/@fops/shared/dist/ \
  && node --input-type=module -e 'import { readFileSync, rmSync, writeFileSync } from "node:fs"; const path = "/deploy/node_modules/@fops/shared/package.json"; const pkg = JSON.parse(readFileSync(path, "utf8")); rmSync(path); pkg.main = "./dist/index.js"; pkg.exports = { ".": "./dist/index.js", "./enums": "./dist/enums/index.js" }; writeFileSync(path, JSON.stringify(pkg, null, 2));'

FROM build AS migrate
WORKDIR /workspace/apps/backend
COPY --chmod=755 apps/backend/docker-migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint
USER node
ENTRYPOINT ["/usr/local/bin/migrate-entrypoint"]
# Call the binaries directly: corepack would try to download pnpm at runtime as the node user.
CMD ["node_modules/.bin/drizzle-kit", "migrate"]

FROM node:22.11.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /deploy/ ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]
