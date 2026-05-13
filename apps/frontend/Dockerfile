FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY apps/frontend apps/frontend
COPY packages/shared packages/shared
COPY packages/ui packages/ui

EXPOSE 5180
CMD ["pnpm", "--filter", "@feedbackops/frontend", "dev"]
