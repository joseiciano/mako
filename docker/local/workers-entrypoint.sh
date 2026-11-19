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

cd /app/apps/backend-rest
exec pnpm exec wrangler dev \
  --ip 0.0.0.0 \
  --port 8787 \
  -c wrangler.dev.generated.jsonc \
  -c ../notification-orchestrator/wrangler.dev.generated.jsonc \
  -c ../greedy-matcher/wrangler.jsonc \
  --persist-to /state
