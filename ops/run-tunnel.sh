#!/bin/bash
# run-tunnel.sh — supervised Cloudflare quick tunnel for the API (run by launchd, KeepAlive).
#
# On each start it:
#   1. Runs `cloudflared tunnel --url http://localhost:$API_PORT` and waits for the
#      ephemeral *.trycloudflare.com URL.
#   2. Publishes that URL with update-tunnel.sh, which rewrites config.json on the
#      deploy repo's gh-pages branch. The site reads config.json at runtime, so it
#      picks up the new URL within ~30 s without a rebuild.
#   3. Health-checks the tunnel's /health every WATCH_INTERVAL seconds. A tunnel that
#      is up but not serving counts as down: after FAIL_THRESHOLD failures in a row
#      it kills cloudflared and exits, launchd restarts the script, and a fresh URL
#      is published. (KeepAlive alone only notices a process that exits.)
#
# Requirements: cloudflared, and gh logged in (`gh auth login`) for update-tunnel.sh.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_PORT="${API_PORT:-3000}"
LOG_FILE="/tmp/cloudflared-vm-tipping.log"
CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo /opt/homebrew/bin/cloudflared)}"

# Watchdog tuning
WATCH_INTERVAL="${WATCH_INTERVAL:-30}"   # seconds between health checks
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"    # consecutive failures => declare wedged
URL_WAIT_SECS="${URL_WAIT_SECS:-60}"     # how long to wait for the URL on startup

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG_FILE"; }

cleanup() {
  [ -n "${CF_PID:-}" ] && kill "$CF_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Rotate log on each (re)start
: > "$LOG_FILE"
log "Starting cloudflared quick tunnel (supervised, watchdog every ${WATCH_INTERVAL}s, threshold ${FAIL_THRESHOLD})"

# --- Start cloudflared in the background, stream its output to the log ---
"$CLOUDFLARED" tunnel --url "http://localhost:${API_PORT}" >> "$LOG_FILE" 2>&1 &
CF_PID=$!
log "cloudflared started (pid $CF_PID)"

# --- Wait for the ephemeral URL to appear in the log ---
TUNNEL_URL=""
for _ in $(seq 1 "$URL_WAIT_SECS"); do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" | head -1)
  [ -n "$TUNNEL_URL" ] && break
  # If cloudflared died before giving a URL, exit so launchd restarts us.
  kill -0 "$CF_PID" 2>/dev/null || { log "cloudflared exited before URL was assigned; exiting for restart"; exit 1; }
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  log "No tunnel URL after ${URL_WAIT_SECS}s; killing cloudflared and exiting for restart"
  exit 1
fi
log "Tunnel URL: $TUNNEL_URL"

# --- Publish the URL ---
publish_url() {
  # config.json on gh-pages is the single source of truth for the API URL. The
  # deploy workflow never overwrites it (keep_files, and it strips config.json from
  # the bundle), so a web redeploy can't clobber it.
  if "$SCRIPT_DIR/update-tunnel.sh" "$1" >> "$LOG_FILE" 2>&1; then
    log "config.json pushed to gh-pages"
  else
    log "WARNING: update-tunnel.sh failed; the site keeps the old URL until the next publish"
  fi
}
publish_url "$TUNNEL_URL"

# --- Health watchdog: treat alive-but-not-serving as DOWN ---
fails=0
while true; do
  sleep "$WATCH_INTERVAL"

  # 1) Did the process die? launchd-style crash recovery.
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    log "cloudflared process (pid $CF_PID) is gone; exiting for restart"
    exit 1
  fi

  # 2) Is the tunnel actually serving? (the real wedge detector)
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "${TUNNEL_URL}/health?wd=$$" 2>/dev/null)
  if [ "$code" = "200" ]; then
    if [ "$fails" -ne 0 ]; then log "health recovered (HTTP 200) after $fails failure(s)"; fi
    fails=0
  else
    fails=$((fails + 1))
    log "health check FAILED ($fails/$FAIL_THRESHOLD) — HTTP '${code:-none}' via $TUNNEL_URL"
    if [ "$fails" -ge "$FAIL_THRESHOLD" ]; then
      log "tunnel wedged (alive but not serving); killing cloudflared (pid $CF_PID) and exiting for restart"
      kill "$CF_PID" 2>/dev/null
      exit 1
    fi
  fi
done
