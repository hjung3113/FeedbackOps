#!/usr/bin/env bash
# verify-db.sh — provision isolated throwaway databases for wave integration checks.
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_ROOT=$(cd -- "$SCRIPT_DIR/../../../.." && pwd)
ROOT=${VERIFY_DB_ROOT:-$SCRIPT_ROOT}
CONTAINER=fops-verify
DB_HOST=localhost
DB_PORT=5439
# Memory cap for the throwaway Postgres (global rule: cap every container). An uncapped one helped stall the
# Docker VM during 100k-row previews (2026-10-10).
DB_MEMORY=${VERIFY_DB_MEMORY:-2g}
ADMIN_URL=postgres://postgres:postgres@localhost:5439/postgres
MODE=unknown

usage() {
  cat <<'EOF'
Usage:
  verify-db.sh up
  verify-db.sh create <name> [--migrate-from <checkout>]
  verify-db.sh drop <name>
  verify-db.sh down
  verify-db.sh reset-rate-limits <name>

up provisions fops-verify on localhost:5439 and runs db:migrate on the feedbackops template.
create clones feedbackops, writes $WAVE_STATE/env.verify.<name>, and runs db:migrate
from <checkout> (default: this script's checkout). drop removes the env file after the DB drops.
drop/reset-rate-limits use feedbackops_<name>.
The development database on port 5434 is never used.
EOF
}

finish() {
  local ok=$1 code=$2
  printf '{"ok":%s,"command":"%s"}\n' "$ok" "$MODE"
  exit "$code"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  finish false "${2:-1}"
}

require_state() {
  [[ -n "${WAVE_STATE:-}" ]] || fail 'set WAVE_STATE to the wave scratch directory' 2
  mkdir -p "$WAVE_STATE" || fail "cannot create WAVE_STATE: $WAVE_STATE" 2
  WAVE_STATE=$(cd -- "$WAVE_STATE" 2>/dev/null && pwd) || fail "cannot resolve WAVE_STATE: $WAVE_STATE" 2
}

check_port() {
  [[ "$DB_PORT" != 5434 ]] || fail 'refusing development Postgres port 5434' 2
}

database_for() {
  local suffix=$1
  [[ "$suffix" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || fail 'database name suffix must use letters, digits, underscore, or hyphen' 2
  DB_NAME=feedbackops_$suffix
  [[ "$DB_NAME" == feedbackops* ]] || fail 'refusing database name outside the feedbackops prefix' 2
}

db_owner() {
  PGPASSWORD=postgres psql -X -h "$DB_HOST" -p "$DB_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -tA \
    -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$1'" 2>/dev/null
}

assert_container_port() {
  local bindings
  bindings=$(docker inspect --format '{{range .HostConfig.PortBindings}}{{range .}}{{.HostPort}} {{end}}{{end}}' "$CONTAINER" 2>/dev/null) || fail "could not inspect port mapping for $CONTAINER" 1
  [[ " $bindings " != *" 5434 "* ]] || fail "refusing existing $CONTAINER mapped to development port 5434" 2
  [[ " $bindings " == *" $DB_PORT "* ]] || fail "existing $CONTAINER is not mapped to required port $DB_PORT" 2
}

write_env_file() {
  local suffix=$1 db=$2 destination
  destination=$WAVE_STATE/env.verify.$suffix
  [[ -f "$ROOT/.env" ]] || fail "root .env is required to generate $destination" 2
  python3 - "$ROOT/.env" "$destination" "$db" "$DB_HOST" "$DB_PORT" <<'PY'
import pathlib
import re
import sys

source, destination, database, host, port = sys.argv[1:]
lines = pathlib.Path(source).read_text(encoding="utf-8").splitlines()
key_line = re.compile(r"^\s*(?:export\s+)?DATABASE_URL(?:_MIGRATE)?\s*=")
kept = [line for line in lines if not key_line.match(line)]
kept.extend([
    f"DATABASE_URL=postgres://fops_app:fops_app@{host}:{port}/{database}",
    f"DATABASE_URL_MIGRATE=postgres://fops_migrate:fops_migrate@{host}:{port}/{database}",
])
target = pathlib.Path(destination)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text("\n".join(kept) + "\n", encoding="utf-8")
target.chmod(0o600)
PY
  local code=$?
  [[ "$code" == 0 ]] || fail "could not write environment file: $destination" "$code"
  printf 'Environment: %s\n' "$destination"
}

run_migration() {
  local migration_root=$1 env_file=$2 description=$3 cleanup_hint=${4:-} log failure_message
  log=$(mktemp) || fail 'could not create migration log' 2
  (
    cd "$migration_root" || exit 2
    set -a
    . "$env_file"
    set +a
    pnpm --filter @fops/backend db:migrate
  ) >"$log" 2>&1
  local code=$?
  cat "$log"
  rm -f "$log"
  if [[ "$code" != 0 ]]; then
    failure_message="$description failed (exit $code)"
    [[ -z "$cleanup_hint" ]] || failure_message+="; clean up with: $cleanup_hint"
    fail "$failure_message" "$code"
  fi
}

migration_journal_hashes() {
  python3 - "$1" <<'PY'
import hashlib
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
journal_path = root / "apps/backend/migrations/meta/_journal.json"
try:
    journal = json.loads(journal_path.read_text(encoding="utf-8"))
    entries = journal["entries"]
except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
    print(f"cannot read migration journal {journal_path}: {error}", file=sys.stderr)
    raise SystemExit(1)

migrations = root / "apps/backend/migrations"
for entry in entries:
    tag = entry.get("tag") if isinstance(entry, dict) else None
    if not isinstance(tag, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", tag):
        print(f"invalid migration tag in {journal_path}: {tag!r}", file=sys.stderr)
        raise SystemExit(1)
    path = migrations / f"{tag}.sql"
    try:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as error:
        print(f"cannot hash migration {path}: {error}", file=sys.stderr)
        raise SystemExit(1)
    print(digest)
PY
}

verify_migration_ledger() {
  local migration_root=$1 env_file=$2 suffix=$3 expected actual code cleanup_hint
  cleanup_hint="\"$SCRIPT_DIR/verify-db.sh\" drop \"$suffix\""
  expected=$(migration_journal_hashes "$migration_root")
  code=$?
  [[ "$code" == 0 ]] || fail "could not hash migration journal from $migration_root; clean up with: $cleanup_hint" "$code"
  actual=$(
    (
      set -a
      . "$env_file"
      set +a
      psql -X "$DATABASE_URL_MIGRATE" -v ON_ERROR_STOP=1 -tA \
        -c 'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id'
    )
  )
  code=$?
  [[ "$code" == 0 ]] || fail "could not read migration ledger from $DB_NAME; clean up with: $cleanup_hint" "$code"
  if ! python3 - "$expected" "$actual" <<'PY'
import collections
import sys

expected = sys.argv[1].splitlines()
actual = sys.argv[2].splitlines()
missing = collections.Counter(expected) - collections.Counter(actual)
extra = collections.Counter(actual) - collections.Counter(expected)
if expected == actual:
    raise SystemExit(0)
if not missing and not extra:
    print("migration hashes are present but ordered differently", file=sys.stderr)
else:
    print(
        "missing hashes: " + ", ".join(sorted(missing))
        + "; extra hashes: " + ", ".join(sorted(extra)),
        file=sys.stderr,
    )
raise SystemExit(1)
PY
  then
    fail "template ahead of this checkout; run verify-db.sh down && up from a checkout at or behind this one; clean up with: $cleanup_hint" 1
  fi
}

up() {
  check_port
  require_state
  local running owner env_file
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    assert_container_port
    running=$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null) || fail "could not inspect $CONTAINER" 1
    if [[ "$running" != true ]]; then
      docker start "$CONTAINER" >/dev/null || fail "could not start existing container $CONTAINER" 1
    fi
  else
    docker run -d --name "$CONTAINER" --memory "$DB_MEMORY" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
      -p "$DB_PORT:5432" -v "$ROOT/scripts/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
      pgvector/pgvector:pg16 || fail "could not start $CONTAINER" 1
  fi

  local ready=0 attempt
  for ((attempt = 1; attempt <= 90; attempt++)); do
    if PGPASSWORD=postgres pg_isready -h "$DB_HOST" -p "$DB_PORT" -U postgres -d postgres >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || fail "Postgres did not become ready on $DB_HOST:$DB_PORT" 1

  owner=$(db_owner feedbackops) || fail 'could not inspect template database owner' 1
  if [[ -z "$owner" ]]; then
    PGPASSWORD=postgres psql -X "$ADMIN_URL" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE feedbackops OWNER fops_migrate' || fail 'could not create template database feedbackops' 1
    PGPASSWORD=postgres psql -X -h "$DB_HOST" -p "$DB_PORT" -U postgres -d feedbackops -v ON_ERROR_STOP=1 \
      -c 'CREATE EXTENSION IF NOT EXISTS vector' -c 'GRANT CONNECT ON DATABASE feedbackops TO fops_app, fops_migrate' || fail 'could not initialize template database extensions and grants' 1
    owner=fops_migrate
  fi
  [[ "$owner" == fops_migrate ]] || fail "template feedbackops is owned by $owner, expected fops_migrate" 1

  env_file=$WAVE_STATE/env.verify.template
  write_env_file template feedbackops
  run_migration "$ROOT" "$env_file" 'template migration'
  printf 'Ran migrations for template database feedbackops.\n'
  finish true 0
}

create_db() {
  local suffix=${1:-} migration_root=$ROOT
  shift || true
  while (( $# )); do
    case "$1" in
      --migrate-from)
        (( $# >= 2 )) || fail 'create --migrate-from needs a checkout path' 2
        migration_root=$(cd -- "$2" 2>/dev/null && pwd) || fail "migration checkout does not exist: $2" 2
        shift 2
        ;;
      *) fail 'usage: verify-db.sh create <name> [--migrate-from <checkout>]' 2 ;;
    esac
  done
  check_port
  require_state
  database_for "$suffix"
  local owner
  owner=$(db_owner "$DB_NAME") || fail "could not inspect database $DB_NAME" 1
  [[ -z "$owner" ]] || fail "database already exists: $DB_NAME" 1
  PGPASSWORD=postgres psql -X "$ADMIN_URL" -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"$DB_NAME\" TEMPLATE feedbackops OWNER fops_migrate" || fail "could not create $DB_NAME from template" 1
  write_env_file "$suffix" "$DB_NAME"
  local env_file=$WAVE_STATE/env.verify.$suffix
  run_migration "$migration_root" "$env_file" "migration for $DB_NAME" "\"$SCRIPT_DIR/verify-db.sh\" drop \"$suffix\""
  verify_migration_ledger "$migration_root" "$env_file" "$suffix"
  printf 'Created %s on port %s.\n' "$DB_NAME" "$DB_PORT"
  finish true 0
}

drop_db() {
  local suffix=$1 env_file
  check_port
  require_state
  database_for "$suffix"
  PGPASSWORD=postgres psql -X "$ADMIN_URL" -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid()" \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\"" || fail "could not drop $DB_NAME" 1
  env_file=$WAVE_STATE/env.verify.$suffix
  if [[ -f "$env_file" ]]; then
    if command -v trash >/dev/null 2>&1; then
      trash "$env_file" || fail "could not move verification env file to Trash: $env_file" 1
    else
      rm -f "$env_file" || fail "could not remove verification env file: $env_file" 1
    fi
  fi
  printf 'Dropped %s if it existed.\n' "$DB_NAME"
  finish true 0
}

reset_rate_limits() {
  check_port
  require_state
  database_for "$1"
  local env_file=$WAVE_STATE/env.verify.$1
  [[ -f "$env_file" ]] || fail "environment file not found: $env_file" 2
  (
    set -a
    . "$env_file"
    set +a
    case "${DATABASE_URL_MIGRATE:-}" in
      "postgres://fops_migrate:fops_migrate@$DB_HOST:$DB_PORT/$DB_NAME") ;;
      *) printf 'refusing migrate URL that does not target %s on port %s\n' "$DB_NAME" "$DB_PORT" >&2; exit 2 ;;
    esac
    psql -X "$DATABASE_URL_MIGRATE" -v ON_ERROR_STOP=1 -c 'DELETE FROM core.rate_limits'
  ) || fail "could not reset rate limits for $DB_NAME" "$?"
  printf 'Reset rate limits in %s through DATABASE_URL_MIGRATE.\n' "$DB_NAME"
  finish true 0
}

main() {
  if (( $# == 0 )) || [[ "$1" == --help || "$1" == -h ]]; then
    MODE=help
    usage
    finish true 0
  fi
  MODE=$1
  shift
  [[ -d "$ROOT" ]] || fail "repository root does not exist: $ROOT" 2
  case "$MODE" in
    up)
      (( $# == 0 )) || fail 'usage: verify-db.sh up' 2
      up
      ;;
    create)
      (( $# >= 1 )) || fail 'usage: verify-db.sh create <name> [--migrate-from <checkout>]' 2
      create_db "$@"
      ;;
    drop|reset-rate-limits)
      (( $# == 1 )) || fail "usage: verify-db.sh $MODE <name>" 2
      case "$MODE" in
        drop) drop_db "$1" ;;
        reset-rate-limits) reset_rate_limits "$1" ;;
      esac
      ;;
    down)
      (( $# == 0 )) || fail 'usage: verify-db.sh down' 2
      check_port
      if docker inspect "$CONTAINER" >/dev/null 2>&1; then assert_container_port; fi
      docker rm -f "$CONTAINER" || fail "could not remove $CONTAINER" 1
      printf 'Stopped and removed %s.\n' "$CONTAINER"
      finish true 0
      ;;
    *)
      usage >&2
      fail "unknown command: $MODE" 2
      ;;
  esac
}

main "$@"
