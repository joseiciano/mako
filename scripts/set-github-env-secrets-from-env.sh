#!/usr/bin/env bash

# Batch variant of scripts/set-github-env-secrets.sh.
#
# Parses KEY=VALUE lines from a .env file and uploads every *known* secret to
# the given GitHub deployment environment. Unknown keys are skipped as a
# safety guard so unrelated .env entries never reach GitHub.
#
# Usage: ./scripts/set-github-env-secrets-from-env.sh <staging|production> [path/to/.env]
#
# The canonical secret inventory is the menu in scripts/set-github-env-secrets.sh;
# keep KNOWN_SECRETS below in sync with that list.

set -euo pipefail

KNOWN_SECRETS=(
  "CLOUDFLARE_ACCOUNT_ID"
  # Deploy workflows consume this token name directly for bootstrap-script and
  # Wrangler CI auth; runtime Workers use CLOUDFLARE_RUNTIME_API_TOKEN.
  "CLOUDFLARE_API_TOKEN"
  "NEON_API_KEY"
  "NEON_ORG_ID"
  "CLOUDFLARE_RUNTIME_API_TOKEN"
  "DATABASE_URL"
  "HYPERDRIVE_ID"
  "BETTER_AUTH_SECRET"
  "BETTER_AUTH_URL"
  "BETTER_AUTH_TRUSTED_ORIGINS"
  "VITE_AUTH_BASE_URL"
  "CLOUDFLARE_REALTIMEKIT_APP_ID"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "VITE_STRIPE_PUBLISHABLE_KEY"
)

usage() {
  echo "Usage: $0 <staging|production> [path/to/.env]" >&2
}

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
ENV_FILE="${2:-.env}"

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  usage
  echo "Invalid environment. Choose either 'staging' or 'production'."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  usage
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

is_known_secret() {
  local candidate
  for candidate in "${KNOWN_SECRETS[@]}"; do
    if [[ "$candidate" == "$1" ]]; then
      return 0
    fi
  done
  return 1
}

set_count=0
skipped_count=0
seen=""

while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%$'\r'}"
  # Trim surrounding whitespace.
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"

  # Skip blanks and full-line comments.
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Allow an optional `export ` prefix.
  line="${line#export }"

  [[ "$line" != *=* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  # Trim whitespace around the key and value.
  key="${key%"${key##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  [[ -z "$key" ]] && continue

  if ! is_known_secret "$key"; then
    echo "Skipping unknown key: $key"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  # Strip one pair of matching surrounding quotes.
  if [[ ${#value} -ge 2 ]]; then
    first="${value:0:1}"
    last="${value: -1}"
    if [[ "$first" == "$last" && ( "$first" == '"' || "$first" == "'" ) ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  if [[ -z "$value" ]]; then
    echo "Skipping $key: value is empty."
    continue
  fi

  printf '%s' "$value" | gh secret set "$key" --repo "$REPO" --env "$ENVIRONMENT"
  echo "Set $key for environment '$ENVIRONMENT'."
  set_count=$((set_count + 1))
  seen+=" $key "
done < "$ENV_FILE"

echo
echo "Done: set $set_count secret(s) for '$ENVIRONMENT'; skipped $skipped_count unknown key(s)."

for secret in "${KNOWN_SECRETS[@]}"; do
  if [[ "$seen" != *" $secret "* ]]; then
    echo "Note: known secret '$secret' is not present in '$ENV_FILE'."
  fi
done

echo
echo "Current secrets in '$ENVIRONMENT' for $REPO:"
gh secret list --repo "$REPO" --env "$ENVIRONMENT"
