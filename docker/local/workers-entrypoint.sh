#!/bin/sh
set -eu

cd /app
node scripts/local-stack/write-workers-config.mjs

(
  while true; do
    WORKERS_BASE_URL="http://127.0.0.1:8787" node scripts/local-stack/cron-timer.mjs || true
    echo "[cron-timer] exited, restarting in 5s"
    sleep 5
  done
) &

FAKE_AI_CONFIG=""
if [ "${LOCAL_FAKES_ENABLED:-}" = "1" ]; then
  FAKE_AI_CONFIG="-c ../fakes/wrangler.dev.generated.jsonc"
fi

cd /app/apps/backend-rest
# FAKE_AI_CONFIG is intentionally unquoted: it expands to zero or two words.
# shellcheck disable=SC2086
exec pnpm exec wrangler dev \
  --ip 0.0.0.0 \
  --port 8787 \
  -c wrangler.dev.generated.jsonc \
  -c ../notification-orchestrator/wrangler.dev.generated.jsonc \
  -c ../greedy-matcher/wrangler.jsonc \
  $FAKE_AI_CONFIG \
  --persist-to /state
