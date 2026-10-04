#!/usr/bin/env bash
# update-tunnel.sh — point the deployed site at a new API URL without a rebuild.
# Usage: ops/update-tunnel.sh [https://new-url.trycloudflare.com]
#
# Writes {"apiBaseUrl": URL} to config.json on the gh-pages branch of DEPLOY_REPO
# and pushes it. Without an argument it takes the latest URL from run-tunnel.sh's log.

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
  echo "ERROR: Could not detect tunnel URL. Pass it as argument: ops/update-tunnel.sh https://xyz.trycloudflare.com"
  exit 1
fi

echo "Updating API URL to: $TUNNEL_URL"

# --- Clone gh-pages, update config.json, push ---
# Authenticate through gh's credential helper when gh is logged in, so the token
# never appears in a URL or the process list; otherwise fall back to SSH.
if gh auth status >/dev/null 2>&1; then
  CLONE_URL="https://github.com/${DEPLOY_REPO}.git"
  GIT_AUTH=(-c credential.helper= -c "credential.helper=!gh auth git-credential")
else
  CLONE_URL="git@github.com:${DEPLOY_REPO}.git"
  GIT_AUTH=()
fi

git ${GIT_AUTH[@]+"${GIT_AUTH[@]}"} clone --depth 1 --branch gh-pages "$CLONE_URL" "$WORK_DIR/repo" 2>/dev/null
echo "{\"apiBaseUrl\":\"${TUNNEL_URL}\"}" > "$WORK_DIR/repo/config.json"

cd "$WORK_DIR/repo"
git config user.email "tunnel@vm-tipping.local"
git config user.name "vm-tipping tunnel"
git add config.json
git diff --cached --quiet && { echo "No change needed (URL unchanged)."; exit 0; }
git commit -m "chore: update tunnel URL to ${TUNNEL_URL}"
git ${GIT_AUTH[@]+"${GIT_AUTH[@]}"} push origin gh-pages

echo "Done — Pages will serve the new API URL within ~30 seconds."
