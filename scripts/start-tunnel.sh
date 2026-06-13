#!/usr/bin/env bash
# scripts/start-tunnel.sh
#
# Starts the Cloudflare quick-tunnel and automatically updates config.json on
# the gh-pages branch whenever the URL changes. The SPA re-fetches config.json
# on each network failure, so the app self-heals within one failed request after
# a restart — no manual steps, no rebuild needed.
#
# Usage:
#   ./scripts/start-tunnel.sh               # run once in a terminal
#   ./scripts/start-tunnel.sh --install     # install as macOS LaunchAgent (auto-start on login)
#   ./scripts/start-tunnel.sh --uninstall   # remove the LaunchAgent
#
# Requirements:
#   - cloudflared   (brew install cloudflared)
#   - gh            (brew install gh) — must be logged in: gh auth login
#   - DEPLOY_REPO env var or hakon1233/vm-tipping-2026-web (the default)

set -euo pipefail

PLIST_LABEL="com.vm-tipping.tunnel"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
LOG_FILE="/tmp/cloudflared-vm-tipping.log"
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

# --- Install / uninstall ---
if [ "${1:-}" = "--install" ]; then
  echo "Installing LaunchAgent → $PLIST_PATH"
  cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SCRIPT_PATH}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST
  launchctl load "$PLIST_PATH"
  echo "Done. Tunnel will start now and on every login."
  echo "Logs: $LOG_FILE"
  echo "Stop:   launchctl unload $PLIST_PATH"
  echo "Remove: $SCRIPT_PATH --uninstall"
  exit 0
fi

if [ "${1:-}" = "--uninstall" ]; then
  if [ -f "$PLIST_PATH" ]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm "$PLIST_PATH"
    echo "LaunchAgent removed."
  else
    echo "No LaunchAgent found at $PLIST_PATH"
  fi
  exit 0
fi

# --- Start tunnel and watch for URL ---
echo "[$(date)] Starting Cloudflare quick-tunnel..."

# Start cloudflared, tee output to log file
cloudflared tunnel --url http://localhost:3000 2>&1 | tee "$LOG_FILE" | while IFS= read -r line; do
  echo "$line"
  # Detect the assigned tunnel URL
  if [[ "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
    TUNNEL_URL="${BASH_REMATCH[1]}"
    echo "[$(date)] Tunnel URL detected: $TUNNEL_URL"
    echo "[$(date)] Updating config.json on gh-pages..."
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    if "$SCRIPT_DIR/../update-tunnel.sh" "$TUNNEL_URL"; then
      echo "[$(date)] config.json updated — app will self-heal within one request."
    else
      echo "[$(date)] WARNING: update-tunnel.sh failed. Run it manually:"
      echo "  ./update-tunnel.sh $TUNNEL_URL"
    fi
  fi
done
