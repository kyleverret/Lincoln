#!/bin/sh
set -e

echo "[entrypoint] Starting Lincoln..."

# Sync database schema (creates tables if they don't exist).
# Using db push for initial deployment; switch to migrate deploy
# once a proper migrations baseline exists.
echo "[entrypoint] Syncing database schema..."
node ./node_modules/prisma/build/index.js db push --accept-data-loss

echo "[entrypoint] Schema sync complete. Starting Next.js server..."
exec "$@"
