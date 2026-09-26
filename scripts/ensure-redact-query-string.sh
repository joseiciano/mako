#!/usr/bin/env bash
# scripts/ensure-redact-query-string.sh — reassert backend Worker-level
# observability redaction after every mako-backend-rest deploy.
#
# Wrangler 4.73.0 does not expose redact_query_string in wrangler.jsonc, so
# `wrangler deploy` can reset the Worker-level setting (RISK-002). This script
# PATCHes the Worker's script-settings via the Workers API and verifies the
# result. CI calls it as a post-deploy step in the backend deploy job; it is
# also safe to run manually.
#
# Required env:
#   CLOUDFLARE_API_TOKEN   token with Workers Scripts Write permission (SEC-001)
#   CLOUDFLARE_ACCOUNT_ID  the account that owns the Worker
# Optional env:
#   WORKER_SCRIPT_NAME     defaults to mako-backend-rest

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN must be set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"

WORKER_SCRIPT_NAME="${WORKER_SCRIPT_NAME:-mako-backend-rest}"
CF_API="https://api.cloudflare.com/client/v4"

command -v jq >/dev/null 2>&1 || { echo "error: jq not found" >&2; exit 1; }

# PATCH is an idempotent overwrite of just the observability block; other
# script-settings keys are left untouched.
RESPONSE="$(curl -fsS -X PATCH \
  "$CF_API/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER_SCRIPT_NAME/script-settings" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"observability": {"enabled": true, "redact_query_string": true}}')"

if [ "$(printf '%s' "$RESPONSE" | jq -r '.success')" != "true" ]; then
  echo "error: failed to set redact_query_string on $WORKER_SCRIPT_NAME" >&2
  printf '%s\n' "$RESPONSE" | jq -r '.errors' >&2
  exit 1
fi

ENABLED="$(printf '%s' "$RESPONSE" | jq -r '.result.observability.redact_query_string')"
if [ "$ENABLED" != "true" ]; then
  echo "error: redact_query_string not reported enabled after PATCH" >&2
  exit 1
fi

echo "redact_query_string: enabled on $WORKER_SCRIPT_NAME (verified via Workers API)"
