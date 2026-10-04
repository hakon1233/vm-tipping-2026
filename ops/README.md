# Deploying

How the league ran during the 2026 World Cup. The tournament is over and nothing is deployed now, but this path still works.

```
browser ──▶ GitHub Pages (static web app, separate deploy repo)
               │ reads config.json at runtime → API URL
               ▼
         Cloudflare quick tunnel (HTTPS)  ◀── ops/run-tunnel.sh (launchd)
               │
               ▼
         Mac mini: node server/dist/index.js on 127.0.0.1:3000 (launchd) + SQLite
```

| Piece | What it does |
|---|---|
| `.github/workflows/deploy-web.yml` | On a push to `main` that touches `web/`, `shared/` or `data/seed.json`: runs the CI checks, then builds `web/` and publishes it to the deploy repo's `gh-pages` branch. It keeps the `config.json` already there. |
| `ops/run-tunnel.sh` | Starts a quick tunnel to the API, publishes its URL with `update-tunnel.sh`, and restarts itself when `/health` stops answering. |
| `ops/update-tunnel.sh [url]` | Writes `{"apiBaseUrl": url}` to `config.json` on the deploy repo's `gh-pages` branch. Open tabs pick it up on their next failed request. |

A quick tunnel gets a new URL on every restart, which is why the API URL lives in `config.json` and not in the bundle.

## One-time setup

1. **Deploy repo.** Create an empty repo (for example `you/vm-tipping-2026-web`) and enable Pages from the `gh-pages` branch.
2. **This repo's Actions settings.**
   - Variables: `DEPLOY_REPO` (`owner/name`) and `VITE_BASE_PATH` (the Pages subpath, e.g. `/vm-tipping-2026-web/`).
   - Secrets: `DEPLOY_TOKEN`, a fine-grained token with *Contents: write* on the deploy repo only. Optionally `VITE_API_BASE_URL`, the fallback API URL baked into the bundle.
3. **Server machine.** Install Node 22.13+, `cloudflared` and `gh` (logged in). Then:
   ```bash
   npm ci && npm run build
   cp .env.example .env
   ```
   In `.env`, set real `ADMIN_PIN` and `LEAGUE_PIN`, and set `CORS_ORIGIN` to the Pages origin (e.g. `https://you.github.io`). Without `CORS_ORIGIN` the browser can't call the API. Without the PINs the server won't start.
4. **launchd.** Run two LaunchAgents with `KeepAlive`: one for the server, one for the tunnel. The server agent runs from the repo directory:
   ```xml
   <key>ProgramArguments</key>
   <array>
     <string>/path/to/node</string>
     <string>--env-file=/path/to/repo/.env</string>
     <string>/path/to/repo/server/dist/index.js</string>
   </array>
   <key>WorkingDirectory</key><string>/path/to/repo</string>
   ```
   The tunnel agent runs `/bin/bash /path/to/repo/ops/run-tunnel.sh`. Load both with `launchctl bootstrap gui/$UID <plist>`.

## Operating

- **Logs:** `/tmp/cloudflared-vm-tipping.log` for the tunnel. The server's log goes wherever its plist sends stdout.
- **Lift the pick deadlines:** set `DEADLINES_DISABLED=1` in `.env` and restart the server. The web app unlocks too; no redeploy needed.
- **Data:** everything is in `data/vm-tipping.sqlite` (or `DATABASE_PATH`). Back up that file.
- **Stop:** `launchctl bootout gui/$UID/<label>` for each agent.
