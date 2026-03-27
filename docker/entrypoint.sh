#!/bin/sh
set -e

echo "[entrypoint] Starting Lincoln..."

# Run database migrations before starting the server.
# In ECS, this runs inside the app container on startup.
# For zero-downtime deploys, consider a separate migration task.
echo "[entrypoint] Running database migrations..."
node ./node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] Migrations complete. Starting Next.js server..."
exec "$@"
