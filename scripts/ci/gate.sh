#!/usr/bin/env bash
#
# The CI gate (#794): root AGENTS.md → Verification, split into three stages any
# CI can call. `.github/workflows/ci.yml` runs them on GitHub Actions; another CI
# runs the same three commands after `pnpm install --frozen-lockfile` on Node 22.
#
#   scripts/ci/gate.sh static [--base <ref>]
#       route tree, root typecheck, boundaries (+ its fixture test), migration
#       drift, FE typecheck, design lint, and — with --base — the FE Biome gate
#       on the files changed since merge-base(HEAD, <ref>). The Biome gate diffs
#       committed history, so the checkout needs full history and <ref>.
#   scripts/ci/gate.sh unit
#       vitest for apps/frontend, packages/ui and packages/shared. The backend
#       suite runs in `integration`, where its DB-backed suites are live.
#   scripts/ci/gate.sh integration
#       bootstraps a throwaway Postgres from scripts/db/init.sql, migrates it, and
#       runs `pnpm --filter backend test:integration`, which truncates and re-seeds.
#       Needs CI_PG_ADMIN_URL: a superuser URL for an EMPTY, disposable Postgres 16
#       server with pgvector, e.g. postgres://postgres:postgres@localhost:5432/postgres.
#
# The visual harness is not part of CI: its baselines are darwin-only.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

step() {
  printf '\n==> %s\n' "$*"
  "$@"
}

stage_static() {
  local base=""
  if [ "${1:-}" = "--base" ]; then
    base="${2:?--base needs a ref}"
  elif [ -n "${1:-}" ]; then
    echo "gate.sh static: unknown argument $1" >&2
    exit 2
  fi
  step pnpm -s gen:routes
  step pnpm -s typecheck
  step node scripts/check-boundaries.mjs
  step node scripts/check-boundaries.test.mjs
  step pnpm -s gate:db-migration-drift
  step pnpm -s gate:fe-typecheck
  step pnpm -s lint:design
  if [ -n "$base" ]; then
    step pnpm -s gate:fe-lint --base "$base"
  fi
}

stage_unit() {
  step pnpm -s gen:routes
  step pnpm --filter @fops/frontend exec vitest run
  step pnpm --filter @fops/ui exec vitest run
  step pnpm --filter @fops/shared exec vitest run
}

stage_integration() {
  local admin_url="${CI_PG_ADMIN_URL:?set CI_PG_ADMIN_URL to a disposable Postgres superuser URL}"
  local host port
  read -r host port < <(node -e 'const u = new URL(process.argv[1]); console.log(u.hostname, u.port || "5432")' "$admin_url")
  # 5434 is the development database (docker-compose.dev.yml); this stage truncates.
  if [ "$port" = "5434" ]; then
    echo "gate.sh integration: refusing port 5434 (the development database)" >&2
    exit 2
  fi

  step psql "$admin_url" -X -q -v ON_ERROR_STOP=1 -f scripts/db/init.sql

  local env_file
  env_file="$(mktemp)"
  # Expanded now: the EXIT trap runs after this function's locals are gone.
  trap "rm -f '$env_file'" EXIT
  grep -Ev '^DATABASE_URL(_MIGRATE)?=' .env.example > "$env_file"
  {
    echo "DATABASE_URL=postgres://fops_app:fops_app@$host:$port/feedbackops"
    echo "DATABASE_URL_MIGRATE=postgres://fops_migrate:fops_migrate@$host:$port/feedbackops"
  } >> "$env_file"

  (
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
    step pnpm --filter @fops/backend db:migrate
  )
  step env FEEDBACKOPS_ENV_FILE="$env_file" pnpm --filter @fops/backend test:integration
}

case "${1:-}" in
  static) shift; stage_static "$@" ;;
  unit) stage_unit ;;
  integration) stage_integration ;;
  *)
    echo "usage: scripts/ci/gate.sh static [--base <ref>] | unit | integration" >&2
    exit 2
    ;;
esac
