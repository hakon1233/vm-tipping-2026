#!/usr/bin/env bash
# scripts/run-named-tunnel.sh — DURABLE Cloudflare *named* tunnel for the live app.
#
# Unlike the quick tunnel (scripts/vm-tipping-cloudflared.sh), a named tunnel has a
# PERMANENT hostname that never changes across server restart, tunnel restart, or a
# gh-pages redeploy. This is the real fix for VMT-11.
#
# PREREQUISITES (one-time, FOUNDER-PROVIDED — these cannot be done autonomously):
#   1. A domain added to your Cloudflare account as a zone (e.g. example.com).
#   2. `cloudflared tunnel login`  — run once on this Mac mini; completes in your
#      browser and writes ~/.cloudflared/cert.pem (the origin cert this script needs).
#
# Once those exist, run:
#   DOMAIN=api-vm.example.com ./scripts/run-named-tunnel.sh --setup    # one-time: create + route + install
#   ./scripts/run-named-tunnel.sh                                      # run in foreground (what launchd calls)
#   ./scripts/run-named-tunnel.sh --uninstall                          # remove the LaunchAgent
#
# After --setup the permanent https://$DOMAIN is pushed to gh-pages config.json ONCE
# and never changes again. The deploy workflow keep_files:true preserves it across
# redeploys, so the live site reaches the backend forever with zero manual steps.

set -uo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-vm-tipping-2026}"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo /opt/homebrew/bin/cloudflared)}"
CF_DIR="$HOME/.cloudflared"
PLIST_LABEL="com.vm-tipping.named-tunnel"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
LOG_FILE="/tmp/cloudflared-named-vm-tipping.log"
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
LOCAL_SERVICE="${LOCAL_SERVICE:-http://localhost:3000}"

die() { echo "ERROR: $*" >&2; exit 1; }

require_cert() {
  [ -f "$CF_DIR/cert.pem" ] || die "No $CF_DIR/cert.pem. Run 'cloudflared tunnel login' first (founder, one-time)."
}

tunnel_uuid() {
  "$CLOUDFLARED" tunnel list --output json 2>/dev/null \
    | grep -o "\"id\":\"[0-9a-f-]*\"[^}]*\"name\":\"${TUNNEL_NAME}\"" \
    | grep -o '^"id":"[0-9a-f-]*"' | head -1 | cut -d'"' -f4
}

# --- one-time setup: create tunnel, route DNS, write config, install LaunchAgent ---
if [ "${1:-}" = "--setup" ]; then
  require_cert
  [ -n "${DOMAIN:-}" ] || die "Set DOMAIN, e.g. DOMAIN=api-vm.example.com ./scripts/run-named-tunnel.sh --setup"

  UUID="$(tunnel_uuid)"
  if [ -z "$UUID" ]; then
    echo "Creating named tunnel '$TUNNEL_NAME'..."
    "$CLOUDFLARED" tunnel create "$TUNNEL_NAME" || die "tunnel create failed"
    UUID="$(tunnel_uuid)"
  else
    echo "Tunnel '$TUNNEL_NAME' already exists ($UUID)."
  fi
  [ -n "$UUID" ] || die "Could not resolve tunnel UUID after create."

  echo "Routing DNS $DOMAIN -> $TUNNEL_NAME ..."
  "$CLOUDFLARED" tunnel route dns "$TUNNEL_NAME" "$DOMAIN" \
    || echo "  (route dns reported an error — usually means the record already exists; continuing)"

  echo "Writing $CF_DIR/config.yml ..."
  cat > "$CF_DIR/config.yml" <<YAML
tunnel: ${UUID}
credentials-file: ${CF_DIR}/${UUID}.json
ingress:
  - hostname: ${DOMAIN}
    service: ${LOCAL_SERVICE}
  - service: http_status:404
YAML

  echo "Installing LaunchAgent -> $PLIST_PATH"
  cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_PATH}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG_FILE}</string>
  <key>StandardErrorPath</key><string>${LOG_FILE}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict>
</plist>
PLIST

  echo "Publishing PERMANENT URL https://${DOMAIN} to gh-pages config.json (once)..."
  "$PROJECT_DIR/update-tunnel.sh" "https://${DOMAIN}" || echo "  (update-tunnel.sh failed; push config.json manually)"

  echo
  echo "IMPORTANT: disable the old quick-tunnel so the two don't fight:"
  echo "  launchctl unload \$HOME/Library/LaunchAgents/com.vm-tipping.cloudflared.plist"
  echo "Also set repo variable VITE_API_BASE_URL=https://${DOMAIN} so the baked fallback matches."
  echo
  echo "Starting named tunnel now..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"
  echo "Done. Permanent backend: https://${DOMAIN}  (logs: $LOG_FILE)"
  exit 0
fi

if [ "${1:-}" = "--uninstall" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH" && echo "Named-tunnel LaunchAgent removed." || echo "No LaunchAgent at $PLIST_PATH"
  exit 0
fi

# --- normal run (what launchd invokes): just run the tunnel by name ---
require_cert
[ -f "$CF_DIR/config.yml" ] || die "No $CF_DIR/config.yml. Run with --setup first."
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec "$CLOUDFLARED" tunnel run "$TUNNEL_NAME"
