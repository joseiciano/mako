#!/usr/bin/env bash

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

read -r -p "Which ENV should we set? [production | staging]: " ENVIRONMENT
if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  echo "Invalid environment. Choose either 'production' or 'staging'."
  exit 1
fi

while true; do
  echo
  echo "Which secret should we set?"
  echo "1) CLOUDFLARE_API_TOKEN"
  echo "2) CLOUDFLARE_ACCOUNT_ID"
  echo "3) DATABASE_URL"
  echo "4) HYPERDRIVE_ID"
  echo "5) BETTER_AUTH_SECRET"
  echo "6) STRIPE_SECRET_KEY"
  echo "7) BETTER_AUTH_URL"
  echo "8) BETTER_AUTH_TRUSTED_ORIGINS"
  echo "9) VITE_AUTH_BASE_URL"
  echo "10) CLOUDFLARE_REALTIMEKIT_APP_ID"
  echo "11) STRIPE_WEBHOOK_SECRET"
  echo "12) VITE_STRIPE_PUBLISHABLE_KEY"
  echo "13) Done"

  read -r -p "Enter number: " choice

  case "$choice" in
    1) secret_name="CLOUDFLARE_API_TOKEN" ;;
    2) secret_name="CLOUDFLARE_ACCOUNT_ID" ;;
    3) secret_name="DATABASE_URL" ;;
    4) secret_name="HYPERDRIVE_ID" ;;
    5) secret_name="BETTER_AUTH_SECRET" ;;
    6) secret_name="STRIPE_SECRET_KEY" ;;
    7) secret_name="BETTER_AUTH_URL" ;;
    8) secret_name="BETTER_AUTH_TRUSTED_ORIGINS" ;;
    9) secret_name="VITE_AUTH_BASE_URL" ;;
    10) secret_name="CLOUDFLARE_REALTIMEKIT_APP_ID" ;;
    11) secret_name="STRIPE_WEBHOOK_SECRET" ;;
    12) secret_name="VITE_STRIPE_PUBLISHABLE_KEY" ;;
    13) break ;;
    *)
      echo "Invalid option."
      continue
      ;;
  esac

  read -r -s -p "Insert secret: " secret_value
  echo

  if [[ -z "$secret_value" ]]; then
    echo "Secret cannot be empty."
    continue
  fi

  gh secret set "$secret_name" --repo "$REPO" --env "$ENVIRONMENT" --body "$secret_value"
  echo "Set $secret_name for environment '$ENVIRONMENT'."
done

echo
echo "Current secrets in '$ENVIRONMENT' for $REPO:"
gh secret list --repo "$REPO" --env "$ENVIRONMENT"
