#!/bin/bash
# Watch a DigitalOcean App Platform deployment.
# On failure, saves logs and invokes Claude Code to diagnose and fix automatically.
#
# Requirements: curl, jq  (brew install jq  /  apt install jq)
#
# Usage:
#   DO_TOKEN=dop_v1_xxx APP_ID=xxx ./scripts/watch-do-deploy.sh
#
# Or set them permanently in your shell profile:
#   export DO_TOKEN=dop_v1_xxx
#   export APP_ID=xxx

set -euo pipefail

: "${DO_TOKEN:?Please set DO_TOKEN to your DigitalOcean personal access token}"
: "${APP_ID:?Please set APP_ID to your App Platform app ID}"

API="https://api.digitalocean.com/v2"
AUTH=(-H "Authorization: Bearer $DO_TOKEN" -H "Content-Type: application/json")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/.do-logs"
LOG_FILE="$LOG_DIR/latest.log"

mkdir -p "$LOG_DIR"

# ── helpers ──────────────────────────────────────────────────────────────────

do_get() { curl -sf "${AUTH[@]}" "$API/$1"; }

latest_deployment() {
  do_get "apps/$APP_ID/deployments?per_page=1" | jq -r '.deployments[0]'
}

deployment_phase() {
  do_get "apps/$APP_ID/deployments/$1" | jq -r '.deployment.phase'
}

fetch_logs() {
  local dep_id="$1" log_type="$2"
  local url
  url=$(do_get "apps/$APP_ID/deployments/$dep_id/logs?type=$log_type" \
        | jq -r '.historic_urls[0] // empty')
  if [[ -n "$url" ]]; then
    curl -sf "$url" 2>/dev/null || true
  fi
}

log() { echo "$*" | tee -a "$LOG_FILE"; }

# ── main ─────────────────────────────────────────────────────────────────────

# Clear previous log
> "$LOG_FILE"

echo "Waiting 60s for DigitalOcean to pick up the push..."
sleep 60

DEPLOYMENT=$(latest_deployment)
DEP_ID=$(echo "$DEPLOYMENT" | jq -r '.id')
DEP_CAUSE=$(echo "$DEPLOYMENT" | jq -r '.cause // "push"')
DEP_SHA=$(echo "$DEPLOYMENT" | jq -r '.git.commit_sha // "unknown"' | cut -c1-7)

echo "Tracking deployment $DEP_ID  (cause: $DEP_CAUSE, sha: $DEP_SHA)"

PHASE=""
PREV_PHASE=""
SECONDS_WAITED=0
MAX_WAIT=900  # 15 min

while true; do
  PHASE=$(deployment_phase "$DEP_ID")

  if [[ "$PHASE" != "$PREV_PHASE" ]]; then
    echo "   Phase -> $PHASE"
    PREV_PHASE="$PHASE"
  fi

  case "$PHASE" in
    ACTIVE|SUPERSEDED)
      echo ""
      echo "Deployment SUCCEEDED (phase: $PHASE)"
      exit 0
      ;;
    ERROR|CANCELED|UNKNOWN)
      break
      ;;
  esac

  if (( SECONDS_WAITED >= MAX_WAIT )); then
    echo ""
    echo "Timed out after ${MAX_WAIT}s. Last phase: $PHASE"
    break
  fi

  sleep 15
  (( SECONDS_WAITED += 15 ))
done

# ── failure: write logs to file, invoke Claude ────────────────────────────────

{
  echo "DEPLOYMENT FAILED (phase: $PHASE)"
  echo "App ID: $APP_ID  |  Deployment: $DEP_ID  |  SHA: $DEP_SHA"
  echo ""
  echo "=== BUILD LOGS ==="
  fetch_logs "$DEP_ID" "BUILD"
  echo ""
  echo "=== DEPLOY LOGS ==="
  fetch_logs "$DEP_ID" "DEPLOY"
  echo ""
  echo "=== RUN LOGS ==="
  fetch_logs "$DEP_ID" "RUN"
} > "$LOG_FILE"

echo ""
echo "Deployment FAILED. Logs saved to $LOG_FILE"
echo "Invoking Claude to diagnose and fix..."
echo ""

claude --print "
The DigitalOcean App Platform deployment for the Lincoln project just failed.
The full logs are at: $LOG_FILE

Please:
1. Read the log file to identify the error
2. Review the relevant source files
3. Fix the issue
4. Commit and push to main (branch: main)

Do not ask for confirmation — work through it and push when done.
"
