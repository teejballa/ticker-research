#!/usr/bin/env bash
# Phase 19-Z-02 schema-push gate: assert migration history matches live DB.
# Used by SUMMARY automation + CI to confirm prisma migrate deploy succeeded.
set -euo pipefail

# Load .env.local if present (for DIRECT_URL); skip silently if absent (CI sets envs directly).
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if ! npx prisma migrate status 2>&1 | grep -q "Database schema is up to date"; then
  echo "FAIL: prisma migrate status reports drift or pending migrations" >&2
  npx prisma migrate status >&2
  exit 1
fi
echo "Schema in sync with migration history"
