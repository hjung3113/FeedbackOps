#!/usr/bin/env bash
#
# The integration gate (#204). Exports the repo `.env` and runs the backend
# suite, so the 90 `describe.skipIf(!runIntegration)` suites actually execute.
#
# DESTRUCTIVE. The vitest globalSetup truncates every product table in
# DATABASE_URL and re-seeds before the run — that reset is what makes the
# failure count independent of how many runs came before it (#205). Point
# DATABASE_URL / DATABASE_URL_MIGRATE at a throwaway database if the contents
# of the one in `.env` matter to you. A target on port 5434 (the development
# database) is refused unless FEEDBACKOPS_ALLOW_DEV_DB=1 is set.
#
# Usage:
#   pnpm --filter backend test:integration
#   pnpm --filter backend test:integration src/modules/voc      # narrow filter
#   FEEDBACKOPS_ENV_FILE=.env.verify pnpm --filter backend test:integration

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${FEEDBACKOPS_ENV_FILE:-$repo_root/.env}"

if [ ! -f "$env_file" ]; then
  echo "test:integration: no env file at $env_file" >&2
  echo "  copy .env.example and fill DATABASE_URL, DATABASE_URL_MIGRATE, WORKSPACE_ID" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

for var in DATABASE_URL DATABASE_URL_MIGRATE WORKSPACE_ID; do
  if [ -z "${!var:-}" ]; then
    echo "test:integration: $env_file does not set $var" >&2
    echo "  all three are required; without them the suites skip and the run proves nothing" >&2
    exit 1
  fi
done

# 5434 is the development database (docker-compose.dev.yml), and this run truncates it.
# Agents and workers must never reach it; a person who means it sets FEEDBACKOPS_ALLOW_DEV_DB=1.
for var in DATABASE_URL DATABASE_URL_MIGRATE; do
  if ! port="$(
    cd "$repo_root/apps/backend"
    node -e '
      try {
        const ConnectionParameters = require("pg/lib/connection-parameters");
        const { port } = new ConnectionParameters({ connectionString: process.env[process.argv[1]] });
        if (!Number.isInteger(port)) process.exit(1);
        console.log(port);
      } catch {
        process.exit(1);
      }
    ' "$var"
  )"; then
    echo "test:integration: refusing $var: cannot resolve PostgreSQL port from $env_file" >&2
    exit 1
  fi
  if [ "$port" = "5434" ] && [ "${FEEDBACKOPS_ALLOW_DEV_DB:-}" != "1" ]; then
    echo "test:integration: refusing $var on port 5434 (the development database) from $env_file" >&2
    echo "  point FEEDBACKOPS_ENV_FILE at a throwaway database, or set FEEDBACKOPS_ALLOW_DEV_DB=1 to truncate the dev data" >&2
    exit 1
  fi
done

# globalSetup refuses to reset under NODE_ENV=production, but failing here is a
# clearer error than one thrown from inside vitest's setup phase.
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "test:integration: refusing to run with NODE_ENV=production ($env_file)" >&2
  echo "  this command truncates every product table in DATABASE_URL" >&2
  exit 1
fi

# Strip credentials before echoing the target.
echo "test:integration: resetting and running against ${DATABASE_URL##*@}" >&2

cd "$repo_root/apps/backend"
exec pnpm exec vitest run "$@"
