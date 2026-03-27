#!/bin/sh
set -e

echo "[entrypoint] Starting Lincoln..."

# PostgreSQL 15+ revokes CREATE on public schema from PUBLIC by default.
# Grant it to the current user so Prisma can create tables.
echo "[entrypoint] Granting schema permissions..."
psql "$DATABASE_URL" -c "GRANT ALL ON SCHEMA public TO CURRENT_USER;" || true

# Sync database schema (creates tables if they don't exist).
echo "[entrypoint] Syncing database schema..."
node ./node_modules/prisma/build/index.js db push --accept-data-loss

echo "[entrypoint] Schema sync complete. Starting Next.js server..."
exec "$@"
