# VM-tipping 2026 — Friends Prediction League

A small web app for 8 friends to predict the **2026 World Cup** and track a live
leaderboard. Replaces the shared spreadsheet we used to keep.

**Live:** <https://hakon1233.github.io/vm-tipping-2026-web/>

## What it does

- **Group stage** — each player predicts every group game as `1` / `X` / `2`. 1 pt per correct result.
- **Knockout** — each player picks which teams reach each round (R32 → Champion). Points scale per round.
- **Leaderboard** — totals, per-round breakdown and ranking, computed automatically.
- **Admin** — one admin (you) enters real results and qualifiers as the tournament plays out.

Players, teams, groups and scoring are seeded from the original spreadsheet — see [`data/seed.json`](data/seed.json).

### Scoring (editable)

| Item | Points |
|------|--------|
| Group game (correct 1/X/2) | 1 |
| Round of 32 team | 2 |
| Round of 16 team | 3 |
| Quarter-final team | 4 |
| Semi-final team | 5 |
| Final team | 6 |
| Champion | 7 |

> Picking the same team twice in a round scores only once.

## Architecture

```
8 friends ──▶ GitHub Pages (static SPA, HTTPS)   ← public deploy repo
                   │  fetch()
                   ▼
            Cloudflare Tunnel (HTTPS)
                   │
                   ▼
            Mac mini: API server + SQLite  ← shared picks & results live here
```

- **Frontend** (`/web`): Vite + React + Tailwind. Built and published to a separate **public** repo for GitHub Pages.
- **Backend** (`/server`): small API + SQLite, runs on the mac mini. Exposed to the Pages site via a Cloudflare tunnel (HTTPS).
- This repo is the **private source** of truth for both.

## Status

Deployed and in use. Group-stage and knockout predictions, scoring and the leaderboard
all work end to end; the admin surface accepts real results as the tournament plays out.
See [`SPEC.md`](SPEC.md) for the full specification.

## Layout

```
data/seed.json   players, groups, teams, scoring (from the Excel)
web/             Vite + React + TypeScript + Tailwind frontend
server/          Hono + TypeScript + SQLite API
shared/          shared TypeScript types and match helpers
SPEC.md          MVP feature spec
```

## Local development

```bash
npm install
npm run dev
```

`npm run dev` starts:

- Web: http://localhost:5173
- API: http://localhost:3000

Copy `.env.example` to `.env` and set:

- `VITE_API_BASE_URL` for the web app API URL
- `ADMIN_PIN` for admin result/scoring routes
- `LEAGUE_PIN` for player login

Useful commands:

```bash
npm test
npm run build
npm start
```

`npm start` runs the built API server from `server/dist`.

## Routing

The SPA is a static site and uses **hash routing** so it works on GitHub Pages with no
server rewrite rules (deep links and refresh just work):

- `#/` — player picks (group stage + knockout), login-gated
- `#/leaderboard` — public leaderboard
- `#/admin` — admin (PIN-gated)

A floating bottom nav links Picks ↔ Leaderboard. Admin is reachable by URL.

## Deploy

Architecture: the **frontend** is a static SPA served by GitHub Pages from a separate
public repo, which owns the `gh-pages` branch and the runtime `config.json`. The
**backend** runs on a mac mini, exposed over HTTPS by a Cloudflare tunnel. The Pages
site calls that tunnel URL, reading it from `config.json` at runtime — so restarting
the tunnel needs no rebuild.

### Backend — mac mini

```bash
# one-time
git clone git@github.com:hakon1233/vm-tipping-2026.git
cd vm-tipping-2026
npm install
npm run build                       # builds shared + server + web

# configure
cp .env.example .env                # set ADMIN_PIN and LEAGUE_PIN to real values

# run the API (serves on :3000, SQLite persisted at data/vm-tipping.sqlite)
ADMIN_PIN=… LEAGUE_PIN=… npm start
```

Keep it running across restarts with `pm2` (or a launchd plist):

```bash
npm i -g pm2
pm2 start "npm start" --name vm-tipping-api
pm2 save && pm2 startup            # follow the printed command to enable on boot
```

### Cloudflare tunnel (HTTPS for the API)

```bash
brew install cloudflared
cloudflared tunnel login                       # authorise once
cloudflared tunnel create vm-tipping
# Route a hostname you control to the tunnel, then point it at the local API:
cloudflared tunnel route dns vm-tipping api.example.com
cloudflared tunnel run --url http://localhost:3000 vm-tipping
```

Quick test without a domain (gives an ephemeral `*.trycloudflare.com` URL):

```bash
cloudflared tunnel --url http://localhost:3000
```

Use the resulting HTTPS URL as `VITE_API_BASE_URL` for the frontend build. CORS is open
on the API, so the Pages origin can call it directly.

### Frontend — GitHub Pages

A workflow (`.github/workflows/deploy-web.yml`) builds `/web` and publishes it to the
public deploy repo on every push to `main` that touches the frontend.

One-time setup:

1. Create the public repo `hakon1233/vm-tipping-2026-web` (empty is fine).
2. In **this** repo → Settings → Secrets and variables → Actions:
   - **Variables**: `DEPLOY_REPO` = `hakon1233/vm-tipping-2026-web`,
     `VITE_BASE_PATH` = `/vm-tipping-2026-web/` (the Pages subpath).
   - **Secrets**: `VITE_API_BASE_URL` = the Cloudflare tunnel HTTPS URL,
     `DEPLOY_TOKEN` = a PAT with `repo` scope that can push to the public repo.
3. In the **public** repo → Settings → Pages → Deploy from branch → `gh-pages` / root.
4. Push to `main` (or run the workflow manually) — the SPA lands at
   `https://hakon1233.github.io/vm-tipping-2026-web/`.

> Using a custom domain or a user/org Pages root instead? Set `VITE_BASE_PATH=/` and add
> the `PAGES_CNAME` variable.

### Smoke test (end-to-end)

Verified locally against the built server: player login → submit a group pick → admin
enters that match's result → leaderboard reflects the point. In production, run the same
flow against the deployed Pages site once the tunnel URL is wired.

## Licence

MIT — see [LICENSE](LICENSE).
