#!/bin/sh
set -eu

cd /app/apps/frontend
exec pnpm exec vite dev --host 0.0.0.0 --port 3000
