FROM node:22.11.0-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches ./patches
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN pnpm install --filter @fops/frontend... --frozen-lockfile

COPY apps/frontend ./apps/frontend
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
RUN pnpm --filter @fops/frontend build

# Unprivileged variant: nginx runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27.5-alpine AS runtime
ENV BACKEND_URL=http://backend:3001 NGINX_ENVSUBST_FILTER=^BACKEND_URL$
COPY --from=build /workspace/apps/frontend/dist/ /usr/share/nginx/html/
COPY apps/frontend/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "--header", "Accept: text/html", "http://127.0.0.1:8080/index.html"]
