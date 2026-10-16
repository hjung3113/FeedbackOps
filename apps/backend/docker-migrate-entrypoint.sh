#!/bin/sh
set -eu

if [ -z "${DATABASE_URL_MIGRATE:-}" ]; then
  echo "DATABASE_URL_MIGRATE is required for migration tools." >&2
  exit 1
fi

exec "$@"
