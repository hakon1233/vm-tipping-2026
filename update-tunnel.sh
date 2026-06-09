#!/usr/bin/env bash
# update-tunnel.sh
# Update the live tunnel URL without a full rebuild.
# Usage: ./update-tunnel.sh https://new-url.trycloudflare.com
#
# What it does:
#   1. Reads the current tunnel URL from the running cloudflared process (or accepts arg)
#   2. Writes config.json to the gh-pages branch of the deploy repo
#   3. Pushes it — the Pages site picks it up immediately (no rebuild needed)

set -euo pipefail

DEPLOY_REPO="${DEPLOY_REPO:-hakon1233/vm-tipping-2026-web}"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# --- Resolve tunnel URL ---
if [ -n "${1:-}" ]; then
  TUNNEL_URL="$1"
else
  # Try to read from cloudflared log
  LOG_FILE="/tmp/cloudflared-vm-tipping.log"
  if [ -f "$LOG_FILE" ]; then
    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_FILE" | tail -1)
  fi
fi

if [ -z "${TUNNEL_URL:-}" ]; then
  echo "ERROR: Could not detect tunnel URL. Pass it as argument: ./update-tunnel.sh https://xyz.trycloudflare.com"
  exit 1
fi

echo "Updating API URL to: $TUNNEL_URL"

# --- Clone gh-pages, update config.json, push ---
GH_TOKEN=$(gh auth token 2>/dev/null || echo "")
if [ -n "$GH_TOKEN" ]; then
  CLONE_URL="https://x-access-token:${GH_TOKEN}@github.com/${DEPLOY_REPO}.git"
else
  CLONE_URL="git@github.com:${DEPLOY_REPO}.git"
fi

git clone --depth 1 --branch gh-pages "$CLONE_URL" "$WORK_DIR/repo" 2>/dev/null
echo "{\"apiBaseUrl\":\"${TUNNEL_URL}\"}" > "$WORK_DIR/repo/config.json"

cd "$WORK_DIR/repo"
git config user.email "ceo@vm-tipping.local"
git config user.name "VM-tipping CEO"
git add config.json
git diff --cached --quiet && { echo "No change needed (URL unchanged)."; exit 0; }
git commit -m "chore: update tunnel URL to ${TUNNEL_URL}"
git push origin gh-pages

echo "Done — Pages will serve the new API URL within ~30 seconds."
