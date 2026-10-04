# Glossary

The words this app uses for the prediction league. Code, tests and UI use these terms.

**League** — The eight friends playing this prediction game for the 2026 World Cup. One league per deployment.

**Player** — A league member who makes picks. Players are seeded from `data/seed.json` and can rename themselves.
_Avoid_: user, member

**League PIN** — The one PIN all players share to log in; a player then picks their own name. It identifies, it does not authenticate individuals.

**Admin** — The person who enters what really happened. Admin actions need the **admin PIN**.

**Session** — What a player gets after logging in: a token that expires after 30 days.

**Group pick** — A player's prediction for one group-stage match: `1` (first-named team wins), `X` (draw) or `2` (second-named team wins).
_Avoid_: tip, bet

**Outcome** — One of `1`, `X`, `2`. Used for both a group pick and a **result**.

**Result** — The real outcome of a group-stage match, entered by the admin.

**Group advancement** — Which teams finish 1st and 2nd in each group (and, for the admin, which 3rd-placed teams qualify, at most 8). Players predict 1st and 2nd; correct ones score points.

**Knockout pick** — The teams a player predicts will reach a **round**. A team picked twice in one round scores once.

**Round** — A knockout stage: Round of 32 (`r32`), Round of 16 (`r16`), quarter-final (`qf`), semi-final (`sf`), final (`final`). The **champion** is scored like a round of one.

**Bracket** — The fixed Round-of-32 draw in `data/seed.json`: which group positions meet (for example 1E v a 3rd-placed team). Players fill it from their group advancement picks.

**Champion** — The team that wins the tournament; one pick per player.

**Deadline** — The time after which picks lock: one for the group stage, one for the knockout picks. `DEADLINES_DISABLED=1` lifts both. Other players' picks become visible after the group-stage deadline.

**Scoring** — The points per correct pick (group game, group 1st/2nd, each round, champion). Defaults come from the seed; the admin can change them.

**Leaderboard** — Every player's points per category, total and **rank**. Equal totals share a rank (1, 2, 2, 4).
_Avoid_: standings table, scoreboard

**Overview** — The page that shows everyone's picks next to the results once picks are public.

**Export** — The Excel workbook of all picks, results and the leaderboard, laid out like the spreadsheet the league used before this app.

## Flagged ambiguities

- **What a round's picks mean.** The web bracket asks for the *winners* of each round's matches (16 picks for the Round of 32, 1 for the final). The admin screen and the Excel export treat a round as the teams *in* it (32 teams in the Round of 32, 2 in the final). Scoring compares a player's `r32` picks with the admin's `r32` list either way. Which meaning the league used depends on what the admin entered.
