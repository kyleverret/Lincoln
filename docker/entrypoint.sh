#!/bin/sh
set -e

echo "[entrypoint] Starting Lincoln..."

echo "[entrypoint] Syncing database schema..."
node ./node_modules/prisma/build/index.js db push --accept-data-loss

echo "[entrypoint] Schema sync complete. Starting Next.js server..."
exec "$@"
