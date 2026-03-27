#!/bin/sh
set -e

echo "[entrypoint] Starting Lincoln..."

# DO dev databases run PostgreSQL 15 which revoked CREATE on the public schema
# from PUBLIC. The app user can't grant it to themselves (no superuser access).
# Fix: create an app-owned schema called "app" and use that instead.
echo "[entrypoint] Setting up database schema..."
psql "$DATABASE_URL" -c "CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION CURRENT_USER;"

# Append ?schema=app to the connection URL so Prisma uses our owned schema.
if echo "$DATABASE_URL" | grep -q "?"; then
  export DATABASE_URL="${DATABASE_URL}&schema=app"
else
  export DATABASE_URL="${DATABASE_URL}?schema=app"
fi

echo "[entrypoint] Syncing database schema..."
node ./node_modules/prisma/build/index.js db push --accept-data-loss

echo "[entrypoint] Schema sync complete. Starting Next.js server..."
exec "$@"
