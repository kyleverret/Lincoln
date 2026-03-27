#!/bin/bash
# Watch a DigitalOcean App Platform deployment and return logs when done.
# Run this after pushing to main. Claude will read the output and fix issues.
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

# ── main ─────────────────────────────────────────────────────────────────────

echo "⏳  Waiting 60s for DigitalOcean to pick up the push..."
sleep 60

DEPLOYMENT=$(latest_deployment)
DEP_ID=$(echo "$DEPLOYMENT" | jq -r '.id')
DEP_CAUSE=$(echo "$DEPLOYMENT" | jq -r '.cause // "push"')
DEP_SHA=$(echo "$DEPLOYMENT" | jq -r '.git.commit_sha // "unknown"' | cut -c1-7)

echo "🔍  Tracking deployment $DEP_ID  (cause: $DEP_CAUSE, sha: $DEP_SHA)"
echo ""

PHASE=""
PREV_PHASE=""
SECONDS_WAITED=0
MAX_WAIT=900  # 15 min

while true; do
  PHASE=$(deployment_phase "$DEP_ID")

  if [[ "$PHASE" != "$PREV_PHASE" ]]; then
    echo "   Phase → $PHASE"
    PREV_PHASE="$PHASE"
  fi

  case "$PHASE" in
    ACTIVE|SUPERSEDED)
      echo ""
      echo "✅  Deployment SUCCEEDED (phase: $PHASE)"
      exit 0
      ;;
    ERROR|CANCELED|UNKNOWN)
      break
      ;;
  esac

  if (( SECONDS_WAITED >= MAX_WAIT )); then
    echo ""
    echo "⚠️  Timed out after ${MAX_WAIT}s. Last phase: $PHASE"
    break
  fi

  sleep 15
  (( SECONDS_WAITED += 15 ))
done

# ── failure path: dump logs ───────────────────────────────────────────────────

echo ""
echo "❌  Deployment FAILED (phase: $PHASE)"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  BUILD LOGS"
echo "════════════════════════════════════════════════════════════"
fetch_logs "$DEP_ID" "BUILD"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  DEPLOY / RUN LOGS"
echo "════════════════════════════════════════════════════════════"
fetch_logs "$DEP_ID" "DEPLOY"
fetch_logs "$DEP_ID" "RUN"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  END OF LOGS — review above and fix"
echo "════════════════════════════════════════════════════════════"
exit 1
