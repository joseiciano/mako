#!/bin/sh
# scripts/bootstrap.sh — one-time per-environment resource creation runbook.
#
# Creates every Cloudflare and Neon resource that the wrangler configs or
# GitHub Environment values pin by ID (CON-002: no auto-provisioning in CI),
# and prints the IDs to paste into GitHub secrets. Idempotent: existing
# resources are detected and skipped (REQ-002). Ongoing deploys need nothing
# from this script — CI runs migrate-db plus plain `wrangler deploy` jobs.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... NEON_API_KEY=... \
#   scripts/bootstrap.sh staging|production
#
# Required env:
#   CLOUDFLARE_API_TOKEN     least-privilege deploy token for THIS account,
#                            with Workers/Queues/R2/Hyperdrive/Email Sending
#                            (zone) edit permissions (SEC-001)
#   CLOUDFLARE_ACCOUNT_ID    the Cloudflare account to provision
#   NEON_API_KEY             Neon API key for project/role/database creation
#   NEON_ORG_ID              Neon organization the project belongs to
#   EMAIL_SENDING_ZONE_ID    Cloudflare zone containing the sending domain
#   EMAIL_SENDING_DOMAIN     sending domain to provision in that zone
# Optional env:
#   DATABASE_URL  direct Neon URI for the mako_app role; required only when
#                 the Hyperdrive config does not exist yet (also the value
#                 CI uses for migrations).
#
# Never prints or stores secret values (SEC-004/REQ-006) — only resource IDs
# and operator next-step instructions. This script never writes into apps/.

set -eu

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  staging|production) ;;
  *)
    echo "usage: scripts/bootstrap.sh staging|production" >&2
    exit 1
    ;;
esac

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN must be set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"
: "${NEON_API_KEY:?NEON_API_KEY must be set}"
: "${NEON_ORG_ID:?NEON_ORG_ID must be set}"
: "${EMAIL_SENDING_ZONE_ID:?EMAIL_SENDING_ZONE_ID must be set}"
: "${EMAIL_SENDING_DOMAIN:?EMAIL_SENDING_DOMAIN must be set}"

command -v wrangler >/dev/null 2>&1 || {
  echo "error: wrangler not found (run: pnpm --filter @mako/notification-orchestrator exec wrangler --version)" >&2
  exit 1
}
command -v neonctl >/dev/null 2>&1 || {
  echo "error: neonctl not found (brew install neonctl; pinned 2.x)" >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo "error: jq not found" >&2
  exit 1
}

CF_API="https://api.cloudflare.com/client/v4"
NEON_API="https://console.neon.tech/api/v2"
HYPERDRIVE_NAME="mako-${ENVIRONMENT}-hyperdrive"
NEON_PROJECT_NAME="mako-${ENVIRONMENT}"
NEON_ROLE="mako_app"
NEON_DATABASE="mako"

echo "==> Bootstrapping resources for: $ENVIRONMENT"
echo "    Cloudflare account: $CLOUDFLARE_ACCOUNT_ID"
echo "    Neon project: $NEON_PROJECT_NAME"
echo

# ---------------------------------------------------------------------------
# Neon: project mako-$ENVIRONMENT (pg 17, 6h history retention), role mako_app,
# database mako. neonctl 2.x cannot pin pg_version or history retention, so
# project creation goes through the Neon REST API directly (same host neonctl
# uses). Existing projects are detected by name and skipped.
# ---------------------------------------------------------------------------
NEON_PROJECT_ID=""
NEON_DEFAULT_BRANCH_ID=""
NEON_CREATED="no"
NEON_PROJECT_COUNT="$(neonctl projects list --org-id "$NEON_ORG_ID" --output json 2>/dev/null \
  | jq -r --arg name "$NEON_PROJECT_NAME" '[.[] | select(.name == $name)] | length')"

if [ "$NEON_PROJECT_COUNT" -gt 0 ]; then
  NEON_PROJECT_ID="$(neonctl projects list --org-id "$NEON_ORG_ID" --output json 2>/dev/null \
    | jq -r --arg name "$NEON_PROJECT_NAME" '.[] | select(.name == $name) | .id' | head -n 1)"
  echo "neon        : project $NEON_PROJECT_NAME (exists, id $NEON_PROJECT_ID)"
else
  NEON_CREATED="yes"
  CREATE_RESPONSE="$(curl -fsS -X POST "$NEON_API/projects" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg name "$NEON_PROJECT_NAME" \
      --arg org "$NEON_ORG_ID" \
      --arg role "$NEON_ROLE" \
      --arg db "$NEON_DATABASE" \
      '{project: {name: $name, org_id: $org, pg_version: 17,
                  history_retention_seconds: 21600, store_passwords: true,
                  region_id: "aws-us-east-1",
                  branch: {role_name: $role, database_name: $db},
                  default_endpoint_settings: {autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 3}}}')")"
  NEON_PROJECT_ID="$(printf '%s' "$CREATE_RESPONSE" | jq -r '.project.id')"
  NEON_DEFAULT_BRANCH_ID="$(printf '%s' "$CREATE_RESPONSE" | jq -r '.branch.id')"
  echo "neon        : project $NEON_PROJECT_NAME (created, id $NEON_PROJECT_ID)"
fi

# Resolve the default branch for existing projects (needed for role/db checks).
if [ -z "$NEON_DEFAULT_BRANCH_ID" ]; then
  NEON_DEFAULT_BRANCH_ID="$(curl -fsS "$NEON_API/projects/$NEON_PROJECT_ID/branches" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    | jq -r '.branches[]? | select(.default) | .id' | head -n 1)"
fi
NEON_ROLE_COUNT="$(curl -fsS "$NEON_API/projects/$NEON_PROJECT_ID/branches/$NEON_DEFAULT_BRANCH_ID/roles" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  | jq -r --arg role "$NEON_ROLE" '[.roles[]? | select(.name == $role)] | length')"
if [ "$NEON_ROLE_COUNT" -gt 0 ]; then
  echo "neon        : role $NEON_ROLE (exists, skipped)"
  ROLE_IS_NEW="no"
else
  ROLE_IS_NEW="yes"
  curl -fsS -X POST "$NEON_API/projects/$NEON_PROJECT_ID/branches/$NEON_DEFAULT_BRANCH_ID/roles" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"role\": {\"name\": \"$NEON_ROLE\"}}" >/dev/null
  echo "neon        : role $NEON_ROLE (created)"
fi
NEON_DATABASE_COUNT="$(curl -fsS "$NEON_API/projects/$NEON_PROJECT_ID/branches/$NEON_DEFAULT_BRANCH_ID/databases" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  | jq -r --arg db "$NEON_DATABASE" '[.databases[]? | select(.name == $db)] | length')"
if [ "$NEON_DATABASE_COUNT" -gt 0 ]; then
  echo "neon        : database $NEON_DATABASE (exists, skipped)"
else
  curl -fsS -X POST "$NEON_API/projects/$NEON_PROJECT_ID/branches/$NEON_DEFAULT_BRANCH_ID/databases" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"database\": {\"name\": \"$NEON_DATABASE\", \"owner_name\": \"$NEON_ROLE\"}}" >/dev/null
  echo "neon        : database $NEON_DATABASE (created)"
fi

# Role password: reset ONLY when the role (or its project) is freshly created
# — the role-create response does not expose a usable password, so
# reset_password is how the bootstrap obtains the credential for building
# the direct connection string (DATABASE_URL). On already-provisioned
# environments resetting would invalidate the live DATABASE_URL (RISK-006),
# so it is skipped.
if [ "$NEON_CREATED" = "yes" ] || [ "$ROLE_IS_NEW" = "yes" ]; then
  echo
  echo "    Fresh $NEON_ROLE role — resetting its password and printing the"
  echo "    DATABASE_URL to paste into GitHub secrets (REQ-002/RISK-006):"
  RESET_RESPONSE="$(curl -fsS -X POST \
    "$NEON_API/projects/$NEON_PROJECT_ID/branches/$NEON_DEFAULT_BRANCH_ID/roles/$NEON_ROLE/reset_password" \
    -H "Authorization: Bearer $NEON_API_KEY")"
  ROLE_PASSWORD="$(printf '%s' "$RESET_RESPONSE" | jq -r '.role.password')"
  NEON_HOST="$(printf '%s' "$RESET_RESPONSE" | jq -r '.operations[0].endpoint_id // empty')"
  # Fetch endpoint host for building the connection string.
  NEON_HOST="$(curl -fsS "$NEON_API/projects/$NEON_PROJECT_ID/endpoints" \
    -H "Authorization: Bearer $NEON_API_KEY" \
    | jq -r --arg ep "$NEON_HOST" '.endpoints[] | select(.id == $ep or $ep == "") | .host' | head -n 1)"
  cat <<EOF

    >>> Set this GitHub Environment secret for "$ENVIRONMENT" (value is
    >>> printed once; never commit it):

      DATABASE_URL (direct, for migrations AND the Hyperdrive origin):
        postgresql://$NEON_ROLE:$ROLE_PASSWORD@$NEON_HOST:5432/$NEON_DATABASE?sslmode=require

EOF
else
  echo "neon        : role password untouched (existing project — GitHub secrets carry over)"
fi
echo

# ---------------------------------------------------------------------------
# Hyperdrive: mako-$ENVIRONMENT-hyperdrive wired to the Neon origin.
# Detection-first: DATABASE_URL is required only when creating the config.
# Existing configs are converged below because this shared binding serves
# auth, sessions, permissions, billing, and read-after-write application flows
# that cannot tolerate stale SELECT results. Hyperdrive still provides
# connection pooling with query caching disabled; the origin limit remains 20.
# ---------------------------------------------------------------------------
if wrangler hyperdrive list 2>/dev/null | grep -q "\b$HYPERDRIVE_NAME\b"; then
  echo "hyperdrive  : $HYPERDRIVE_NAME (exists)"
  HYPERDRIVE_ID="$(wrangler hyperdrive list 2>/dev/null | grep -B0 -A0 "$HYPERDRIVE_NAME" | sed -n 's/.*\([0-9a-f]\{32\}\).*/\1/p' | head -n 1 || true)"
  if [ -z "$HYPERDRIVE_ID" ]; then
    HYPERDRIVE_ID="$(wrangler hyperdrive list 2>/dev/null \
      | sed -n 's/^ *\([0-9a-f]\{32\} *\).*'"$HYPERDRIVE_NAME"'.*/\1/p' | tr -d ' ' | head -n 1 || true)"
  fi
else
  : "${DATABASE_URL:?DATABASE_URL must be set to create the $HYPERDRIVE_NAME config}"
  CREATE_OUTPUT="$(wrangler hyperdrive create "$HYPERDRIVE_NAME" \
    --connection-string "$DATABASE_URL" \
    --caching-disabled --origin-connection-limit 20 2>&1 || true)"
  HYPERDRIVE_ID="$(printf '%s' "$CREATE_OUTPUT" | sed -n 's/.*config: \([0-9a-f]*\).*/\1/p' | head -n 1)"
  if [ -z "$HYPERDRIVE_ID" ]; then
    echo "hyperdrive  : CREATE FAILED — check DATABASE_URL" >&2
    printf '%s\n' "$CREATE_OUTPUT" >&2
    exit 1
  fi
  echo "hyperdrive  : $HYPERDRIVE_NAME (created, id $HYPERDRIVE_ID)"
fi

if [ -z "${HYPERDRIVE_ID:-}" ]; then
  echo "hyperdrive  : unable to resolve config ID for $HYPERDRIVE_NAME" >&2
  exit 1
fi

if ! UPDATE_OUTPUT="$(wrangler hyperdrive update "$HYPERDRIVE_ID" \
  --caching-disabled --origin-connection-limit 20 2>&1)"; then
  echo "hyperdrive  : UPDATE FAILED — could not enforce cache-disabled reads" >&2
  printf '%s\n' "$UPDATE_OUTPUT" >&2
  exit 1
fi
echo "hyperdrive  : query caching disabled (origin connection limit 20)"
echo

# ---------------------------------------------------------------------------
# Queues: notification-orchestration (producers + orchestrator consumer) and
# its dead-letter queue.
# ---------------------------------------------------------------------------
for queue in notification-orchestration notification-orchestration-dlq; do
  if wrangler queues list 2>/dev/null | grep -q "\b$queue\b"; then
    echo "queue       : $queue (exists, skipped)"
  else
    wrangler queues create "$queue" >/dev/null 2>&1 \
      && echo "queue       : $queue (created)" \
      || echo "queue       : $queue (CREATE FAILED — check token permissions)" >&2
  fi
done
echo

# ---------------------------------------------------------------------------
# R2: mako-recordings and mako-screenshots, enam location hint on create
# (location is create-only). The 30-day lifecycle rules (REQ-004) are applied
# on every run — the PUT is an idempotent overwrite of the full rule set.
# ---------------------------------------------------------------------------
for bucket in mako-recordings mako-screenshots; do
  if wrangler r2 bucket list 2>/dev/null | grep -q "\b$bucket\b"; then
    echo "r2 bucket   : $bucket (exists, skipped)"
  else
    wrangler r2 bucket create "$bucket" --location enam >/dev/null 2>&1 \
      && echo "r2 bucket   : $bucket (created, location enam)" \
      || echo "r2 bucket   : $bucket (CREATE FAILED — check token permissions)" >&2
  fi
done

LIFECYCLE_FILE="$(mktemp)"
trap 'rm -f "$LIFECYCLE_FILE"' EXIT
cat > "$LIFECYCLE_FILE" <<'EOF'
{
  "rules": [
    {
      "id": "30-day-raw-artifact-retention",
      "enabled": true,
      "conditions": { "prefix": "" },
      "abortMultipartUploadsTransition": {
        "condition": { "maxAge": 86400, "type": "Age" }
      },
      "deleteObjectsTransition": {
        "condition": { "maxAge": 2592000, "type": "Age" }
      }
    }
  ]
}
EOF
for bucket in mako-recordings mako-screenshots; do
  if wrangler r2 bucket lifecycle set "$bucket" --file "$LIFECYCLE_FILE" -y >/dev/null 2>&1; then
    echo "r2 lifecycle: $bucket (30-day retention + 1-day multipart abort ensured)"
  else
    echo "r2 lifecycle: $bucket (APPLY FAILED — check token permissions)" >&2
  fi
done
echo

# ---------------------------------------------------------------------------
# Email Sending: create the sending subdomain in EMAIL_SENDING_ZONE_ID when it
# does not exist (mirrors main.tf:6-11), then poll readiness on every run —
# existing environments still need readiness confirmed (RISK-003).
# ---------------------------------------------------------------------------
SUBDOMAIN_LIST="$(curl -fsS "$CF_API/zones/$EMAIL_SENDING_ZONE_ID/email/sending/subdomains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")"
SUBDOMAIN_TAG="$(printf '%s' "$SUBDOMAIN_LIST" | jq -r --arg name "$EMAIL_SENDING_DOMAIN" \
  '.result[]? | select(.name == $name) | .tag' | head -n 1)"

if [ -n "$SUBDOMAIN_TAG" ]; then
  echo "email domain: $EMAIL_SENDING_DOMAIN (exists, skipped)"
else
  curl -fsS -X POST "$CF_API/zones/$EMAIL_SENDING_ZONE_ID/email/sending/subdomains" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg name "$EMAIL_SENDING_DOMAIN" \
      '{name: $name, preview_enabled: false, drop_suppressed_recipients: false}')" >/dev/null
  echo "email domain: $EMAIL_SENDING_DOMAIN (created)"
fi

EMAIL_ENABLED="false"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  READINESS="$(curl -fsS "$CF_API/zones/$EMAIL_SENDING_ZONE_ID/email/sending/subdomains" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")"
  EMAIL_ENABLED="$(printf '%s' "$READINESS" | jq -r --arg name "$EMAIL_SENDING_DOMAIN" \
    '.result[]? | select(.name == $name) | .enabled' | head -n 1)"
  printf 'email ready : attempt %s/12: enabled=%s domain=%s\n' "$attempt" "$EMAIL_ENABLED" "$EMAIL_SENDING_DOMAIN"
  if [ "$EMAIL_ENABLED" = "true" ]; then
    break
  fi
  if [ "$attempt" -lt 12 ]; then
    sleep 10
  fi
done
if [ "$EMAIL_ENABLED" != "true" ]; then
  echo "email domain: did not become ready after 12 checks — inspect DNS records, do not deploy the backend EMAIL binding yet" >&2
fi
echo

# ---------------------------------------------------------------------------
# Summary + remaining manual steps
# ---------------------------------------------------------------------------
cat <<EOF
==> Bootstrap summary for $ENVIRONMENT

Resource states:
  neon project : $NEON_PROJECT_NAME ($NEON_PROJECT_ID)
  hyperdrive   : $HYPERDRIVE_NAME (id ${HYPERDRIVE_ID:-see "wrangler hyperdrive list"})
  queues       : notification-orchestration, notification-orchestration-dlq
  r2 buckets   : mako-recordings, mako-screenshots (30-day lifecycle rules)
  email domain : $EMAIL_SENDING_DOMAIN (enabled=$EMAIL_ENABLED)

Next steps (manual; secrets never pass through this script — SEC-004):

  1. Set the HYPERDRIVE_ID GitHub Environment secret:
       $(if [ -n "${HYPERDRIVE_ID:-}" ]; then echo "$HYPERDRIVE_ID"; else echo "wrangler hyperdrive list  # copy the id for $HYPERDRIVE_NAME"; fi)

  2. If this is a NEW Neon project, paste the DATABASE_URL printed above into
       .env.$ENVIRONMENT
     Re-run make bootstrap-$ENVIRONMENT .env.$ENVIRONMENT (it creates the
     Hyperdrive config from that URI), then put the printed Hyperdrive ID
     into HYPERDRIVE_ID in the same file.

  3. Upload every GitHub Environment secret and non-secret variable from that
     gitignored file:
       make envs-$ENVIRONMENT .env.$ENVIRONMENT

     This sets the Worker/CI secrets plus EMAIL_SENDING_ZONE_ID,
     EMAIL_SENDING_DOMAIN, and AUTH_EMAIL_VERIFICATION_ENFORCED.

  4. Before the first deploy, run migrations:
       pnpm db:migrate  (with DATABASE_URL set to this environment's value)
EOF
