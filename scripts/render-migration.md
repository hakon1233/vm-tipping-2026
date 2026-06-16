# Render fallback runbook (VMT-11)

The **armed default** for VMT-11's permanent-hostname half: if the founder is
silent past the deadline on the on-mini Cloudflare named tunnel (Option A), move
the backend to Render so the live site has a permanent `*.onrender.com` URL that
survives restarts and redeploys. This file makes that a fast, scripted execute.

**Do NOT run this before the founder window closes.** Option A (named tunnel,
keeps backend + SQLite on the mini) is preferred; this is the fallback.

---

## ⚠️ Read first: free tier loses data

The backend stores every pick/result in a `node:sqlite` file
(`server/src/store.ts`). Render's **free** instance type has an **ephemeral
filesystem** — runtime writes vanish on every redeploy and on each spin-up from
idle. A free-tier SQLite deploy would silently wipe the league's data.

`render.yaml` therefore pins `plan: starter` (~$7/mo) + a 1 GB persistent disk at
`/var/data`. This is non-negotiable for durability. If paying is off the table,
do **not** use Render — use Option A (named tunnel) or Option C (Railway, which
includes a persistent volume on its $5 credit).

---

## Prerequisites (founder-provided, one-time)
1. A Render account (free to create) connected to GitHub `hakon1233`.
2. Card on file for the Starter plan (required for the persistent disk).
   - This is the only blocker that makes Render not fully zero-credential.

## Execute (≈10 min)

### 1. Create the service from the blueprint
Render Dashboard → **New → Blueprint** → select repo `hakon1233/vm-tipping-2026`
→ it reads `render.yaml`. Set the two `sync:false` secrets when prompted:
`ADMIN_PIN`, `LEAGUE_PIN` (current real values are in the mini's `.env`).

First deploy builds shared+server and boots an **empty** DB (seeded from
`data/seed.json` on first run — but with NO player picks yet). Migrate next.

### 2. Migrate the live SQLite (152 KB, all picks/results)
The live DB is on the mini at `server/data/vm-tipping.sqlite`. Render disks have
no direct upload, so seed via Render's SSH (available on paid instances):

```bash
# from the mac mini, repo root:
SVC=vm-tipping-2026-api               # Render service name
render login                          # one-time, browser
# copy the live DB onto the Render disk:
cat server/data/vm-tipping.sqlite | render ssh $SVC -- 'cat > /var/data/vm-tipping.sqlite'
render restart $SVC                   # reload with the migrated data
```
(If `render` CLI SSH is unavailable, the fallback is a tiny one-shot admin import
endpoint — ask before adding one; it's extra surface area.)

### 3. Point the live site at Render
`config.json` on gh-pages is the single source of truth (VMT-11 fix). Switch it:

```bash
./update-tunnel.sh "https://vm-tipping-2026-api.onrender.com"
```

Also stop the quick-tunnel supervisor so the two don't fight:
```bash
launchctl unload "$HOME/Library/LaunchAgents/com.vm-tipping.cloudflared.plist"
```
And set repo variable `VITE_API_BASE_URL=https://vm-tipping-2026-api.onrender.com`
so the baked fallback matches (Settings → Actions → Variables).

### 4. Verify end-to-end (REQUIRED before calling it done)
```bash
URL=https://vm-tipping-2026-api.onrender.com
curl -s -o /dev/null -w '%{http_code}\n' "$URL/health"           # expect 200
curl -s "$URL/api/leaderboard" | head -c 300                     # real names, not "Player N"
# real write path — login + a pick save round-trips (use a real name from /api/leaderboard)
# then load the Pages site and confirm leaderboard renders.
```
Cold start after idle is ~30s on the first request — acceptable for 8 users.

## Rollback
Re-point config.json back to the live quick-tunnel URL and reload the supervisor:
```bash
launchctl load "$HOME/Library/LaunchAgents/com.vm-tipping.cloudflared.plist"
# the supervisor republishes the current tunnel URL to config.json on start
```
