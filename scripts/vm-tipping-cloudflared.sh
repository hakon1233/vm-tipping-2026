#!/bin/bash
# vm-tipping-cloudflared.sh — supervised Cloudflare quick-tunnel for the live app.
#
# Runs under launchd (com.vm-tipping.cloudflared, KeepAlive=true). On each start it:
#   1. Launches `cloudflared tunnel --url http://localhost:3000` and captures the
#      ephemeral *.trycloudflare.com URL.
#   2. Publishes that URL to the live site two ways:
#        a) FAST PATH  — pushes config.json straight to the deploy repo's gh-pages
#           branch via update-tunnel.sh (live site self-heals in ~30s, no rebuild).
#        b) SLOW PATH  — writes web/public/config.json and pushes to main so the
#           next CI build keeps the baked-in fallback in sync.
#   3. Runs a HEALTH WATCHDOG: every WATCH_INTERVAL it curls the tunnel's /health.
#      A tunnel that is alive-but-not-serving (e.g. wedged on DNS timeouts, edge
#      connections silently dropped) is treated as DOWN — after FAIL_THRESHOLD
#      consecutive failures the script kills cloudflared and exits, so launchd
#      restarts it, a fresh URL is minted and re-published. Zero manual steps.
#
# This closes the gap where plain launchd KeepAlive only restarts on process EXIT
# and never notices a process that is up but no longer serving traffic (VMT-36).
#
# Requirements: cloudflared, gh (authed) for the fast path, git+ssh for main push.

set -uo pipefail

PROJECT_DIR="~/projects/work/vm-tipping-2026"
LOG_FILE="/tmp/cloudflared-vm-tipping.log"
CLOUDFLARED="/opt/homebrew/bin/cloudflared"
GIT="/usr/bin/git"

# Watchdog tuning
WATCH_INTERVAL="${WATCH_INTERVAL:-30}"   # seconds between health checks
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"    # consecutive failures => declare wedged
URL_WAIT_SECS="${URL_WAIT_SECS:-60}"     # how long to wait for the URL on startup

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
# launchd does not inherit the interactive ssh-agent; use the macOS keychain socket.
export SSH_AUTH_SOCK="$HOME/.ssh/agent.sock"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG_FILE"; }

cleanup() {
  [ -n "${CF_PID:-}" ] && kill "$CF_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# Rotate log on each (re)start
: > "$LOG_FILE"
log "Starting cloudflared quick tunnel (supervised, watchdog every ${WATCH_INTERVAL}s, threshold ${FAIL_THRESHOLD})"

# --- Start cloudflared in the background, stream its output to the log ---
"$CLOUDFLARED" tunnel --url http://localhost:3000 >> "$LOG_FILE" 2>&1 &
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
  local url="$1"
  # gh-pages config.json is the SINGLE source of truth for the live backend hostname.
  # Push it directly; the live site self-heals in ~30s, no rebuild. The deploy workflow
  # is configured to never overwrite this file (keep_files + strips it from the bundle),
  # so a redeploy can no longer clobber it (VMT-11). The old "slow path" that committed
  # web/public/config.json to main was removed: it only triggered needless deploys and
  # was itself a clobber source whenever it lagged the live URL.
  if "$PROJECT_DIR/update-tunnel.sh" "$url" >> "$LOG_FILE" 2>&1; then
    log "config.json pushed to gh-pages (single source of truth)"
  else
    log "WARNING: update-tunnel.sh failed; live site may be stale until next publish"
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
