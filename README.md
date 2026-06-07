# VM-tipping 2026 — Friends Prediction League

A small, nice-looking web app for 8 friends to predict the **2026 World Cup** and track a
live leaderboard. Replaces the shared Excel/Google Sheet we use today.

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

MVP in progress — built by a Paperclip company (engineer on Claude Opus 4.8). See [`SPEC.md`](SPEC.md).

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
