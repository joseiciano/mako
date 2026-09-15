#!/usr/bin/env bash

# Bulk-set environment-scoped GitHub secrets for the selected environment
# (staging or production) from a .env file.
#
# Usage:
#   scripts/set-github-env-secrets-from-env.sh <staging|production> [path/to/.env]
#
# The .env file uses KEY=VALUE lines. Lines starting with '#' and blank lines
# are ignored. Inline 'export ' prefixes are tolerated. Values may be quoted
# with single or double quotes.
#
# Only keys that belong to the documented secret inventory
# (docs/system/system-design/ci-cd.md, "Secrets Management Strategy") are
# uploaded. Unknown keys are reported and skipped so a stray .env variable
# cannot silently become a GitHub secret.

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "You are not authenticated with GitHub CLI. Run: gh auth login"
  exit 1
fi

REPO="joseiciano/mako"

ENVIRONMENT="${1:-}"
if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  echo "Usage: $0 <production|staging> [path/to/.env]"
  exit 1
fi

ENV_FILE="${2:-.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env file not found: $ENV_FILE"
  exit 1
fi

# Canonical secret inventory. Keep in sync with scripts/set-github-env-secrets.sh
# and docs/system/system-design/ci-cd.md.
KNOWN_SECRETS=(
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_TERRAFORM_API_TOKEN
  CLOUDFLARE_DEPLOY_API_TOKEN
  CLOUDFLARE_RUNTIME_API_TOKEN
  NEON_API_KEY
  NEON_ORG_ID
  TF_STATE_R2_ACCESS_KEY_ID
  TF_STATE_R2_SECRET_ACCESS_KEY
  DATABASE_URL
  HYPERDRIVE_ID
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  BETTER_AUTH_TRUSTED_ORIGINS
  VITE_AUTH_BASE_URL
  CLOUDFLARE_REALTIMEKIT_APP_ID
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  VITE_STRIPE_PUBLISHABLE_KEY
)

is_known_secret() {
  local key="$1"
  local candidate
  for candidate in "${KNOWN_SECRETS[@]}"; do
    if [[ "$candidate" == "$key" ]]; then
      return 0
    fi
  done
  return 1
}

# strip_value_quotes removes one layer of matching single or double quotes.
strip_value_quotes() {
  local value="$1"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  elif [[ "$value" == \'*\' ]]; then
    printf '%s' "${value:1:${#value}-2}"
  else
    printf '%s' "$value"
  fi
}

declare -A SEEN=()
SET_COUNT=0
SKIP_UNKNOWN_COUNT=0
SKIP_EMPTY_COUNT=0

line_number=0
while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line_number=$((line_number + 1))
  line="$raw_line"

  # Trim leading/trailing whitespace.
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"

  # Skip blank lines and comments.
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Tolerate an 'export ' prefix.
  line="${line#export }"

  # Require KEY=VALUE.
  if [[ "$line" != *=* ]]; then
    echo "WARNING: line $line_number of $ENV_FILE is not KEY=VALUE; skipping: $raw_line"
    continue
  fi

  key="${line%%=*}"
  value="${line#*=}"

  # Trim whitespace around the key.
  key="${key%"${key##*[![:space:]]}"}"
  key="${key#"${key%%[![:space:]]*}"}"

  # Keys must be valid secret names (uppercase with underscores/digits).
  if [[ ! "$key" =~ ^[A-Z0-9_]+$ ]]; then
    echo "WARNING: line $line_number has invalid key '$key'; skipping"
    continue
  fi

  if ! is_known_secret "$key"; then
    echo "SKIPPED (not in secret inventory): $key"
    SKIP_UNKNOWN_COUNT=$((SKIP_UNKNOWN_COUNT + 1))
    continue
  fi

  if [[ -n "${SEEN[$key]:-}" ]]; then
    echo "WARNING: duplicate key '$key' at line $line_number; last value wins"
  fi
  SEEN[$key]=1

  # Trim whitespace around the value.
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  value="$(strip_value_quotes "$value")"

  if [[ -z "$value" ]]; then
    echo "SKIPPED (empty value): $key"
    SKIP_EMPTY_COUNT=$((SKIP_EMPTY_COUNT + 1))
    continue
  fi

  printf '%s' "$value" | gh secret set "$key" --repo "$REPO" --env "$ENVIRONMENT"
  echo "Set $key for environment '$ENVIRONMENT'."
  SET_COUNT=$((SET_COUNT + 1))
done < "$ENV_FILE"

echo
echo "Done. Set $SET_COUNT secret(s), skipped $SKIP_UNKNOWN_COUNT unknown and $SKIP_EMPTY_COUNT empty key(s) in '$ENVIRONMENT' for $REPO."
echo
echo "Current secrets in '$ENVIRONMENT':"
gh secret list --repo "$REPO" --env "$ENVIRONMENT"
