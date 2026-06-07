# MVP Spec — VM-tipping 2026

Goal: a clean, simple web app that replaces the World Cup prediction spreadsheet for 8 friends,
with a live leaderboard. Mirrors the Excel tabs but with a nice UI.

Seed data (players, 12 groups A–L, 48 teams, scoring) lives in [`data/seed.json`](data/seed.json).

## Users & access

- **8 players** (no accounts — pick your name + a shared league code/PIN to identify yourself; keep it simple).
- **1 admin** (you) — separate admin PIN. Only the admin can enter real results/qualifiers and edit scoring.

## Views

### 1. Player — Group Stage
- All 72 group games (12 groups × 6 games), grouped A–L, shown as a clean grid.
- Per game: pick `1` / `X` / `2`. Auto-saved.
- Picks lock at kickoff time per game (admin can also lock a whole group). Locked picks are read-only.

### 2. Player — Knockout
- For each round (Round of 32, R16, QF, Semis, Final) pick the teams you think advance.
- Pick the **Champion** (single team).
- Duplicate team picks within a round are flagged and score once.

### 3. Admin
- Enter group-game results (`1`/`X`/`2`).
- Enter actual qualifiers per knockout round + actual champion.
- Edit scoring values (defaults from seed).
- PIN-gated.

### 4. Leaderboard (the centerpiece)
- Per player: group points, R32, R16, QF, SF, Final, Champ, KO total, **TOTAL**, **Rank**.
- Updates automatically from picks + entered results.
- Nice visual ranking (medals/top-3 highlight).

## Scoring rules
- Group game correct = 1 pt.
- Knockout: per correct team per round — R32 2, R16 3, QF 4, SF 5, Final 6, Champion 7.
- Same team picked twice in a round → counts once.

## Tech
- **Frontend**: Vite + React + TypeScript + Tailwind. Mobile-friendly (friends will use phones).
- **Backend**: small API (Node/Express or Hono) + SQLite on the mac mini. REST endpoints for players, picks, results, leaderboard.
- **Deploy**: frontend built → public GitHub Pages repo; backend on mac mini behind a Cloudflare tunnel (config the API base URL via env).

## Non-goals (MVP)
- No live score feeds / auto-result fetching — admin enters results manually (like the sheet today).
- No real auth/passwords beyond simple PINs.
- No real-money handling.

## Definition of done
- All seed data loads; 8 players can submit group + knockout picks; admin can enter results; leaderboard ranks correctly; deployable to GitHub Pages + mac mini.
