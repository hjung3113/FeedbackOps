#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$repo_root/docker-compose.release.yml"
env_file="$repo_root/.env.release"
project_name=feedbackops-release-1060
frontend_url=http://localhost:4173
status=failed
reason=unexpected-command-failure

emit_verdict() {
  printf '{"status":"%s","reason":"%s"}\n' "$status" "$reason"
}
trap emit_verdict EXIT

compose=(
  docker compose
  --project-name "$project_name"
  --env-file "$env_file"
  -f "$compose_file"
)

fail() {
  reason="$1"
  exit 1
}

if [[ ! -f "$env_file" ]]; then
  fail "missing-.env.release-copy-.env.release.example-first"
fi

if [[ "${1:-}" == "--down" ]]; then
  [[ "$#" -eq 1 ]] || fail "usage: image-smoke.sh [--down]"
  "${compose[@]}" down -v >&2
  status=passed
  reason=release-project-and-volumes-removed
  exit 0
fi
[[ "$#" -eq 0 ]] || fail "usage: image-smoke.sh [--down]"

"${compose[@]}" build backend frontend migrate >&2
"${compose[@]}" up -d postgres oidc minio >&2
"${compose[@]}" up -d migrate >&2

migration_id="$("${compose[@]}" ps --all --quiet migrate)"
[[ -n "$migration_id" ]] || fail "migration-container-not-created"
migration_deadline=$((SECONDS + 180))
migration_state=running
migration_exit_code=
while ((SECONDS < migration_deadline)); do
  migration_state="$(docker inspect --format '{{.State.Status}}' "$migration_id")"
  if [[ "$migration_state" == exited || "$migration_state" == dead ]]; then
    migration_exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$migration_id")"
    break
  fi
  sleep 2
done
[[ "$migration_state" == exited && "$migration_exit_code" == 0 ]] \
  || fail "migration-failed-or-timed-out"

"${compose[@]}" up -d minio-bootstrap backend frontend >&2

request() {
  local path="$1"
  local accept="$2"
  local response
  response="$(curl --silent --show-error --max-time 10 \
    -H "Accept: $accept" \
    --write-out $'\n%{http_code}' \
    "$frontend_url$path")" || return 1
  response_status="${response##*$'\n'}"
  response_body="${response%$'\n'*}"
}

# Bounded wait: backend readiness (database, pg_boss, storage) through nginx.
ready_deadline=$((SECONDS + 120))
ready=
while ((SECONDS < ready_deadline)); do
  if request /health/ready application/json && [[ "$response_status" == 200 ]]; then
    ready=1
    break
  fi
  sleep 2
done
[[ -n "$ready" ]] || fail "backend-readiness-through-nginx-timed-out"

if ! request / text/html; then
  fail "frontend-root-request-failed"
fi
[[ "$response_status" == 200 && "$response_body" == *"<!doctype html"* ]] \
  || fail "frontend-root-was-not-html"

if ! request '/vocs?release_smoke=1' text/html; then
  fail "spa-deep-link-request-failed"
fi
[[ "$response_status" == 200 && "$response_body" == *"<!doctype html"* ]] \
  || fail "spa-deep-link-did-not-fall-back-to-index"

if ! request /vocs application/json; then
  fail "json-api-request-failed"
fi
case "$response_status" in
  401|302|303|307|308) ;;
  *) fail "json-api-did-not-return-an-unauthenticated-response" ;;
esac
[[ "$response_body" != *"<!doctype html"* && "$response_body" != *"<html"* ]] \
  || fail "json-api-returned-spa-html"

auth_login_deadline=$((SECONDS + 120))
auth_login_ok=0
while ((SECONDS < auth_login_deadline)); do
  if request /auth/login text/html && [[ "$response_status" == 302 ]]; then
    auth_login_ok=1
    break
  fi
  sleep 2
done
[[ "$auth_login_ok" -eq 1 ]] || fail "oidc-login-did-not-redirect"

if ! request /attachments/00000000-0000-4000-8000-000000000001/download text/html; then
  fail "attachment-proxy-request-failed"
fi
[[ "$response_status" == 401 ]] \
  || fail "attachment-proxy-did-not-return-an-unauthenticated-response"
[[ "$response_body" != *"<!doctype html"* && "$response_body" != *"<html"* ]] \
  || fail "attachment-proxy-returned-spa-html"

if ! request /health text/html; then
  fail "legacy-health-proxy-request-failed"
fi
[[ "$response_status" == 200 && "$response_body" == *'"status":"ok"'* ]] \
  || fail "legacy-health-was-not-json"

readiness_deadline=$((SECONDS + 120))
readiness_ok=0
while ((SECONDS < readiness_deadline)); do
  if request /health/ready text/html; then
    if [[ "$response_status" == 200 \
      && "$response_body" == *'"database":"ok"'* \
      && "$response_body" == *'"pg_boss":"ok"'* \
      && "$response_body" == *'"storage":"ok"'* ]]; then
      readiness_ok=1
      break
    fi
  fi
  sleep 2
done
[[ "$readiness_ok" -eq 1 ]] || fail "readiness-failed-or-timed-out"

status=passed
reason=images-migrated-and-readiness-ok
