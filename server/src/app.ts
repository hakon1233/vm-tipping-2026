import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import seed from "../../data/seed.json" with { type: "json" };
import { clientOf, createAuth, type AuthVariables } from "./auth.js";
import { buildExportXlsx } from "./exportXlsx.js";
import type { AppStore, KnockoutRound, Scoring } from "./store.js";

type AppOptions = {
  store: AppStore;
  adminPin: string;
  leaguePin: string;
  now?: () => Date;
  deadlinesDisabled?: boolean;
  corsOrigins?: string[];
};

const validOutcomes = new Set(["1", "X", "2"]);
const validRounds = new Set(["r32", "r16", "qf", "sf", "final"]);

export function createApp(options: AppOptions) {
  const { store, adminPin, leaguePin } = options;
  const now = options.now ?? (() => new Date());
  // When set, pick deadlines are skipped and the flag is reported on /api/matches
  // so the web UI unlocks too; no web redeploy needed to toggle it.
  const deadlinesDisabled = options.deadlinesDisabled ?? false;
  const auth = createAuth({ store, adminPin, leaguePin, now });
  const picksArePublic = () => now().getTime() >= Date.parse(seed.groupStageDeadline);
  const areTeams = (names: unknown[]) => names.every((name) => typeof name === "string" && store.hasTeam(name));
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use(secureHeaders());
  app.use(bodyLimit({ maxSize: 64 * 1024 }));
  const corsOrigins = options.corsOrigins ?? [];
  if (corsOrigins.length > 0) app.use("/api/*", cors({ origin: corsOrigins }));

  app.get("/health", (context) => context.json({ ok: true, service: "vm-tipping-2026-api" }));
  app.get("/api/matches", (context) =>
    context.json({
      players: store.listPlayers(),
      teams: store.listTeams(),
      matches: store.listMatches().map((match) => ({
        ...match,
        round: "group",
        groupName: match.group,
        result: store.getResult(match.id)?.outcome ?? null
      })),
      knockoutRounds: [
        { id: "r32", label: "Round of 32" },
        { id: "r16", label: "Round of 16" },
        { id: "qf", label: "Quarter-finals" },
        { id: "sf", label: "Semi-finals" },
        { id: "final", label: "Final" },
        { id: "champion", label: "Champion" }
      ],
      advancement: store.getGroupAdvancement(),
      deadlinesDisabled
    })
  );
  app.get("/api/leaderboard", (context) => context.json({ leaderboard: store.getLeaderboard() }));
  // Everyone's picks in one workbook, so it follows the same rule as reading
  // another player's picks: a session, and only after the group stage deadline.
  app.get("/api/export.xlsx", auth.requirePlayer, async (context) => {
    if (!picksArePublic()) {
      return context.json({ error: "Picks are private until the group stage deadline" }, 403);
    }
    const file = await buildExportXlsx(store);
    return context.body(file.buffer as ArrayBuffer, 200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="VMtipping2026-export.xlsx"'
    });
  });
  app.get("/api/admin/state", (context) =>
    context.json({
      players: store.listPlayers(),
      teams: store.listTeams(),
      matches: store.listMatches().map((match) => ({
        ...match,
        result: store.getResult(match.id)?.outcome ?? null
      })),
      scoring: store.getScoring(),
      knockout: Object.fromEntries(
        ["r32", "r16", "qf", "sf", "final"].map((round) => [
          round,
          store.getActualKnockout(round as KnockoutRound)
        ])
      ),
      champion: store.getActualChampion() ?? null,
      leaderboard: store.getLeaderboard(),
      advancement: store.getGroupAdvancement()
    })
  );

  app.post("/api/login", async (context) => {
    const body = await context.req.json<{ name?: string; pin?: string }>();
    const result = auth.login(body.name, body.pin, clientOf(context));
    if (!result.ok) return context.json({ error: result.error }, result.status);

    const { player, token } = result;
    return context.json({ player, session: { token, playerId: player.id } });
  });

  app.post("/api/picks", auth.requirePlayer, async (context) => {
    const playerId = context.get("playerId");

    const body = await context.req.json<{
      matchId?: string;
      pick?: string;
      round?: KnockoutRound | "champion";
      teamNames?: string[];
      teamName?: string;
      groupAdvancement?: Record<string, { first?: string; second?: string }>;
    }>();

    if (body.matchId) {
      const match = store.listMatches().find((candidate) => candidate.id === body.matchId);
      if (!match || !validOutcomes.has(body.pick ?? "")) {
        return context.json({ error: "Invalid pick payload" }, 400);
      }
      if (!deadlinesDisabled && now().getTime() >= Date.parse(match.kickoffAt)) {
        return context.json({ error: "Match is locked" }, 409);
      }

      store.saveGroupPick({ playerId, matchId: body.matchId, outcome: body.pick as "1" | "X" | "2" });
      return context.json({ ok: true });
    }

    // Knockout picks lock at the knockout deadline.
    if (!deadlinesDisabled && now().getTime() >= Date.parse(seed.knockoutDeadline)) {
      return context.json({ error: "Knockout picks are locked" }, 409);
    }

    if (body.round === "champion" && body.teamName) {
      if (!areTeams([body.teamName])) return context.json({ error: "Unknown team" }, 400);
      store.saveKnockoutPick({ playerId, round: "champion", teams: [body.teamName] });
      return context.json({ ok: true });
    }

    if (body.round && validRounds.has(body.round) && Array.isArray(body.teamNames)) {
      if (!areTeams(body.teamNames)) return context.json({ error: "Unknown team" }, 400);
      store.saveKnockoutPick({ playerId, round: body.round, teams: body.teamNames });
      return context.json({ ok: true });
    }

    if (body.groupAdvancement && typeof body.groupAdvancement === "object") {
      // A group's 1st and 2nd picks must be distinct teams from that group.
      // Without this guard the same team resolves into two R32 slots (e.g. 1J and 2J)
      // and the rendered bracket shows one team in multiple matchups.
      const teamGroups = new Map(store.listTeams().map((team) => [team.name, team.group.toUpperCase()]));
      const stored = store.getPlayerGroupAdvancement(playerId);
      for (const [group, picks] of Object.entries(body.groupAdvancement)) {
        const groupKey = group.toUpperCase();
        for (const team of [picks.first, picks.second]) {
          if (team && teamGroups.get(team) !== groupKey) {
            return context.json({ error: `Team "${team}" is not in group ${groupKey}` }, 400);
          }
        }
        const first = picks.first !== undefined ? picks.first : stored[groupKey]?.first;
        const second = picks.second !== undefined ? picks.second : stored[groupKey]?.second;
        if (first && second && first === second) {
          return context.json({ error: `Group ${groupKey}: 1st and 2nd picks must be different teams` }, 400);
        }
      }
      for (const [group, picks] of Object.entries(body.groupAdvancement)) {
        if (picks.first !== undefined) {
          store.savePlayerGroupAdvancement({ playerId, group, position: 1, team: picks.first ?? "" });
        }
        if (picks.second !== undefined) {
          store.savePlayerGroupAdvancement({ playerId, group, position: 2, team: picks.second ?? "" });
        }
      }
      return context.json({ ok: true });
    }

    return context.json({ error: "Invalid pick payload" }, 400);
  });

  app.patch("/api/player/name", auth.requirePlayer, async (context) => {
    const playerId = context.get("playerId");

    const body = await context.req.json<{ name?: string }>();
    const name = body.name?.trim();
    if (!name || name.length < 1 || name.length > 50) {
      return context.json({ error: "Name must be 1–50 characters" }, 400);
    }

    try {
      store.updatePlayerName(playerId, name);
    } catch {
      return context.json({ error: "Name already taken" }, 409);
    }

    return context.json({ ok: true, player: store.getPlayerById(playerId) });
  });

  // Picks are never publicly readable: a session is checked before the player
  // lookup, so anonymous callers can't probe which player IDs exist.
  app.get("/api/picks/:playerId", auth.requirePlayer, (context) => {
    const requestedPlayerId = context.req.param("playerId");
    const sessionPlayerId = context.get("playerId");

    const player = store.getPlayerById(requestedPlayerId);
    if (!player) return context.json({ error: "Unknown player" }, 404);

    // Before the group-stage deadline, only the player themselves can view their
    // own picks, so logged-in players can't copy each other's strategies early.
    // After the deadline the Overview "house view" shows everyone's picks to any
    // logged-in player.
    if (!picksArePublic() && sessionPlayerId !== requestedPlayerId) {
      return context.json({ error: "Picks are private until the group stage deadline" }, 403);
    }

    return context.json({
      player,
      group: store.getGroupPicks(requestedPlayerId),
      knockout: store.getKnockoutPicks(requestedPlayerId),
      groupAdvancement: store.getPlayerGroupAdvancement(requestedPlayerId)
    });
  });

  // Every admin write needs the admin PIN. GET /api/admin/state stays public: it
  // holds results and standings, never anyone's picks.
  app.post("/api/admin/*", auth.requireAdmin);

  app.post("/api/admin/results", async (context) => {
    const body = await context.req.json<{ matchId?: string; outcome?: string; result?: string }>();
    const outcome = body.outcome ?? body.result;
    if (!body.matchId || !validOutcomes.has(outcome ?? "")) {
      return context.json({ error: "Invalid result payload" }, 400);
    }
    const matchExists = store.listMatches().some((m) => m.id === body.matchId);
    if (!matchExists) {
      return context.json({ error: "Unknown match" }, 404);
    }

    store.saveResult({ matchId: body.matchId, outcome: outcome as "1" | "X" | "2" });
    return context.json({ ok: true, leaderboard: store.getLeaderboard() });
  });

  app.post("/api/admin/knockout", async (context) => {
    const body = await context.req.json<{ round?: string; teams?: string[]; teamNames?: string[] }>();
    const teams = body.teams ?? body.teamNames;
    if (!validRounds.has(body.round ?? "") || !Array.isArray(teams) || !areTeams(teams)) {
      return context.json({ error: "Invalid knockout payload" }, 400);
    }

    store.saveActualKnockout(body.round as KnockoutRound, teams);
    return context.json({ ok: true, teams: store.getActualKnockout(body.round as KnockoutRound) });
  });

  app.post("/api/admin/champion", async (context) => {
    const body = await context.req.json<{ team?: string; teamName?: string }>();
    const team = body.team ?? body.teamName ?? "";
    if (team === "") {
      store.clearActualChampion();
      return context.json({ ok: true, champion: null });
    }
    if (!areTeams([team])) return context.json({ error: "Unknown team" }, 400);

    store.saveActualChampion(team);
    return context.json({ ok: true, champion: store.getActualChampion() });
  });

  app.post("/api/admin/advancement", async (context) => {
    const body = await context.req.json<{ group?: string; position?: number; team?: string }>();
    const group = body.group?.toUpperCase();
    const position = body.position;
    if (!group || (position !== 1 && position !== 2 && position !== 3) || (body.team && !areTeams([body.team]))) {
      return context.json({ error: "Invalid advancement payload" }, 400);
    }
    try {
      store.saveGroupAdvancement(group, position as 1 | 2 | 3, body.team ?? "");
    } catch (err) {
      return context.json({ error: (err as Error).message }, 400);
    }
    return context.json({ ok: true, advancement: store.getGroupAdvancement() });
  });

  app.post("/api/admin/scoring", async (context) => {
    const body = await context.req.json<{ scoring?: Partial<Scoring> }>();
    if (!body.scoring || typeof body.scoring !== "object") {
      return context.json({ error: "Scoring payload is required" }, 400);
    }

    store.saveScoring(body.scoring);
    return context.json({ ok: true, scoring: store.getScoring() });
  });

  return app;
}
