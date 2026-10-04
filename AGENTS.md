# AGENTS.md

World Cup 2026 prediction league for eight friends (finished tournament; runs locally as a demo). npm workspaces: `server/` (Hono + `node:sqlite`), `web/` (Vite + React + Tailwind), `shared/` (types, group-match list). Domain terms: [`CONTEXT.md`](CONTEXT.md).

## Checks

Run from the repo root; each builds `shared/` first, because the other workspaces import its `dist/`.

- `npm run typecheck` — all workspaces, test files included
- `npm test` — server, web and shared tests, offline
- `npm run build`, then `npm run test:e2e` — Playwright smoke against the real API on ports 7111/7112

A change is done when typecheck and `npm test` are green. Run the e2e smoke when you touch login, picks, admin results or the leaderboard.

## Where to work

| Asked to change… | Work in |
|---|---|
| Points, ranking, ties | `server/src/scoring.ts` (pure; test in `server/test/scoring.test.ts`) |
| Who may call what, PINs, sessions, guess limit | `server/src/auth.ts`; route rules in `server/src/app.ts` |
| A route's request or response | `server/src/app.ts`, and the matching call in `web/src/api.ts` |
| Tables, seeding, queries | `server/src/store.ts` |
| Environment variables | `server/src/config.ts` and `.env.example` together |
| Bracket rules (R32 slots, matchups, what gets saved) | `web/src/lib/knockout.ts` |
| Lock rules shown in the UI | `web/src/lib/tournament.ts` |
| A page's layout or text | `web/src/pages/<Page>.tsx` |
| Teams, groups, bracket, deadlines, default points | `data/seed.json` (read by server, web and shared) |
| Deploy | `ops/` and `.github/workflows/deploy-web.yml`; runbook in `ops/README.md` |

## Conventions

- Pages are wiring. Put rules in the modules above and test them there.
- Web code reaches the server only through `web/src/api.ts`. Tests replace only `fetch` (`web/src/test/fakeFetch.ts`). Server tests use `app.request()` with an in-memory store.
- Tests assert literal expected values and are named after behaviour.
- Environment variables are parsed in one place, `server/src/config.ts`, and listed in `.env.example`.

## Gotchas

- Node 22.13+ is required (`node:sqlite`).
- One `.env` at the repo root serves both the server (`--env-file`) and Vite (`envDir: ".."`). The server refuses to start without `ADMIN_PIN` and `LEAGUE_PIN`.
- The 2026 deadlines are in the past. Tests that edit picks pass `deadlinesDisabled` or a fixed `now`; the demo sets `DEADLINES_DISABLED=1`.
- Other players' picks, and the Excel export, are visible only after the group-stage deadline. Keep that rule when adding routes that return picks.
- The scripts in `ops/` push to GitHub and expect launchd and cloudflared. Run them only to deploy, never from tests.
- A push to `main` that touches `web/`, `shared/` or `data/seed.json` triggers the Pages deploy.
- The root `package.json` overrides `vite` to one 7.x version. Vitest would otherwise hoist Vite 8, and that breaks `npm run dev` for the React plugin.
