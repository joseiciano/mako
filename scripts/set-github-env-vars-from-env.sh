#!/usr/bin/env bash
# Upload non-secret deployment variables from a gitignored environment file.
#
# Usage:
#   scripts/set-github-env-vars-from-env.sh <staging|production> [path/to/.env]
#
# This is deliberately separate from the secret uploader so GitHub Variables
# never get silently converted into Secrets (or vice versa).

set -euo pipefail

ENVIRONMENT="${1:-}"
ENV_FILE="${2:-.env.$ENVIRONMENT}"
REPO="joseiciano/mako"

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Usage: $0 <staging|production> [path/to/.env]" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is not installed." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "GitHub CLI is not authenticated. Run: gh auth login" >&2; exit 1; }

set -a
# The env file is operator-owned, gitignored shell syntax. Quote values that
# contain whitespace or shell metacharacters.
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

VARIABLES=(
  "EMAIL_SENDING_ZONE_ID"
  "EMAIL_SENDING_DOMAIN"
)

# Validate the full file before mutating GitHub so a missing later value cannot
# leave the environment partially updated.
for key in "${VARIABLES[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required GitHub variable: $key" >&2
    exit 1
  fi
done

for key in "${VARIABLES[@]}"; do
  gh variable set "$key" --repo "$REPO" --env "$ENVIRONMENT" --body "${!key}" >/dev/null
  echo "$key: set as GitHub Environment variable"
done
