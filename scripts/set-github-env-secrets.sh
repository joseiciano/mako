#!/usr/bin/env bash

# Operator helper that sets environment-scoped GitHub secrets for the selected
# environment (staging or production). The canonical description of every
# secret lives in docs/system/system-design/ci-cd.md under
# "Secrets Management Strategy"; this menu mirrors that inventory.

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

print_menu() {
  echo
  echo "Which secret should we set?"
  echo
  echo "Infrastructure and Terraform state:"
  echo "  1)  CLOUDFLARE_ACCOUNT_ID          Cloudflare account ID of this environment's account"
  echo "  2)  CLOUDFLARE_TERRAFORM_API_TOKEN Account API token Terraform uses to manage Workers, Queues, R2, Hyperdrive, and Workflows"
  echo "  3)  NEON_API_KEY                   Neon API key Terraform uses to manage the project, role, and database"
  echo "  4)  NEON_ORG_ID                    Neon organization ID the Terraform project belongs to"
  echo "  5)  TF_STATE_R2_ACCESS_KEY_ID      Access Key ID of the bucket-scoped R2 token for mako-terraform-state (Object Read & Write)"
  echo "  6)  TF_STATE_R2_SECRET_ACCESS_KEY  Secret Access Key of the same R2 token (shown once at token creation)"
  echo
  echo "Applications:"
  echo "  7)  CLOUDFLARE_DEPLOY_API_TOKEN    Account API token for Wrangler deploys in CI only; never exposed to Workers"
  echo "  8)  CLOUDFLARE_RUNTIME_API_TOKEN   Account API token used by Workers at runtime; synced as the Worker secret CLOUDFLARE_API_TOKEN"
  echo "  9)  DATABASE_URL                   Direct SSL Neon migration URI from 'terraform output database_url' (contains credentials)"
  echo "  10) HYPERDRIVE_ID                  Hyperdrive config ID from 'terraform output hyperdrive_id' (replaces __HYPERDRIVE_ID__ placeholders)"
  echo "  11) BETTER_AUTH_SECRET             Better Auth signing secret (long random string)"
  echo "  12) BETTER_AUTH_URL                Backend base URL Better Auth uses (e.g. https://mako-backend-rest.<subdomain>.workers.dev)"
  echo "  13) BETTER_AUTH_TRUSTED_ORIGINS    Comma-separated origins allowed by Better Auth for this environment"
  echo "  14) VITE_AUTH_BASE_URL             Backend origin baked into the frontend at build time (same value as BETTER_AUTH_URL)"
  echo "  15) CLOUDFLARE_REALTIMEKIT_APP_ID  RealtimeKit application ID belonging to this environment's Cloudflare account"
  echo "  16) STRIPE_SECRET_KEY              Stripe secret key (sk_test_... in staging, sk_live_... in production)"
  echo "  17) STRIPE_WEBHOOK_SECRET          Stripe webhook signing secret (whsec_...) for the backend /api/payments/webhook endpoint"
  echo "  18) VITE_STRIPE_PUBLISHABLE_KEY    Stripe publishable key (pk_test_... in staging, pk_live_... in production)"
  echo
  echo "  19) Done"
}

while true; do
  print_menu
  read -r -p "Enter number: " choice

  case "$choice" in
    1)
      secret_name="CLOUDFLARE_ACCOUNT_ID"
      secret_hint="32-character Cloudflare account ID"
      ;;
    2)
      secret_name="CLOUDFLARE_TERRAFORM_API_TOKEN"
      secret_hint="Account API token (cfat_...) with Account Settings Read + Workers Scripts, R2, Queues, Hyperdrive Write"
      ;;
    3)
      secret_name="NEON_API_KEY"
      secret_hint="Neon API key"
      ;;
    4)
      secret_name="NEON_ORG_ID"
      secret_hint="Neon organization ID"
      ;;
    5)
      secret_name="TF_STATE_R2_ACCESS_KEY_ID"
      secret_hint="Access Key ID from the mako-terraform-state R2 token"
      ;;
    6)
      secret_name="TF_STATE_R2_SECRET_ACCESS_KEY"
      secret_hint="Secret Access Key of the same R2 token"
      ;;
    7)
      secret_name="CLOUDFLARE_DEPLOY_API_TOKEN"
      secret_hint="Account API token scoped to Workers deployments for CI"
      ;;
    8)
      secret_name="CLOUDFLARE_RUNTIME_API_TOKEN"
      secret_hint="Account API token with minimal RealtimeKit runtime scopes"
      ;;
    9)
      secret_name="DATABASE_URL"
      secret_hint="postgresql://... direct migration URI from terraform output database_url"
      ;;
    10)
      secret_name="HYPERDRIVE_ID"
      secret_hint="Hyperdrive config ID from terraform output hyperdrive_id"
      ;;
    11)
      secret_name="BETTER_AUTH_SECRET"
      secret_hint="Long random signing secret"
      ;;
    12)
      secret_name="BETTER_AUTH_URL"
      secret_hint="https://<backend-host> for this environment"
      ;;
    13)
      secret_name="BETTER_AUTH_TRUSTED_ORIGINS"
      secret_hint="Comma-separated origins, e.g. https://frontend-host,https://backend-host"
      ;;
    14)
      secret_name="VITE_AUTH_BASE_URL"
      secret_hint="Same URL as BETTER_AUTH_URL"
      ;;
    15)
      secret_name="CLOUDFLARE_REALTIMEKIT_APP_ID"
      secret_hint="RealtimeKit app ID for this Cloudflare account"
      ;;
    16)
      secret_name="STRIPE_SECRET_KEY"
      secret_hint="sk_test_... in staging, sk_live_... in production"
      ;;
    17)
      secret_name="STRIPE_WEBHOOK_SECRET"
      secret_hint="whsec_... registered for /api/payments/webhook"
      ;;
    18)
      secret_name="VITE_STRIPE_PUBLISHABLE_KEY"
      secret_hint="pk_test_... in staging, pk_live_... in production"
      ;;
    19)
      break
      ;;
    *)
      echo "Invalid option."
      continue
      ;;
  esac

  echo
  echo "Setting $secret_name for '$ENVIRONMENT'. Expected: $secret_hint"
  read -r -s -p "Insert secret: " secret_value
  echo

  if [[ -z "$secret_value" ]]; then
    echo "Secret cannot be empty."
    continue
  fi

  printf '%s' "$secret_value" | gh secret set "$secret_name" --repo "$REPO" --env "$ENVIRONMENT"
  echo "Set $secret_name for environment '$ENVIRONMENT'."
done

echo
echo "Current secrets in '$ENVIRONMENT' for $REPO:"
gh secret list --repo "$REPO" --env "$ENVIRONMENT"
