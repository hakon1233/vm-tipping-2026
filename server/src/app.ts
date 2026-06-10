import { Hono } from "hono";
import { cors } from "hono/cors";

import seed from "../../data/seed.json" with { type: "json" };
import { createStore, type AppStore, type KnockoutRound, type Scoring } from "./store.js";

type AppOptions = {
  store?: AppStore;
  db?: unknown;
  adminPin?: string;
  leaguePin?: string;
  now?: () => Date;
};

type InjectInput = {
  method: string;
  path: string;
  body?: unknown;
};

const validOutcomes = new Set(["1", "X", "2"]);
const validRounds = new Set(["r32", "r16", "qf", "sf", "final"]);

export function createApp(options: AppOptions = {}) {
  const store =
    options.store ??
    createStore({
      databasePath: options.db ? ":memory:" : (process.env.DATABASE_PATH ?? "data/vm-tipping.sqlite")
    });
  const adminPin = options.adminPin ?? process.env.ADMIN_PIN ?? "admin";
  const leaguePin = options.leaguePin ?? process.env.LEAGUE_PIN ?? "league";
  const now = options.now ?? (() => new Date());
  const app = new Hono();

  app.use("/api/*", cors());

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
      advancement: store.getGroupAdvancement()
    })
  );
  app.get("/api/leaderboard", (context) => context.json({ leaderboard: store.getLeaderboard() }));
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
    if (body.pin !== leaguePin) return context.json({ error: "Invalid league PIN" }, 401);

    const player = body.name ? store.getPlayerByName(body.name) : undefined;
    if (!player) return context.json({ error: "Unknown player" }, 404);

    const token = `session-${player.id}-${Math.random().toString(36).slice(2)}`;
    store.createSession(token, player.id);
    return context.json({ player, session: { token, playerId: player.id } });
  });

  app.post("/api/picks", async (context) => {
    const playerId = authenticate(context.req.header("authorization"), store);
    if (!playerId) return context.json({ error: "Unauthorized" }, 401);

    const body = await context.req.json<{
      matchId?: string;
      pick?: string;
      round?: KnockoutRound | "champion";
      teamNames?: string[];
      teamName?: string;
    }>();

    if (body.matchId) {
      const match = store.listMatches().find((candidate) => candidate.id === body.matchId);
      if (!match || !validOutcomes.has(body.pick ?? "")) {
        return context.json({ error: "Invalid pick payload" }, 400);
      }
      if (now().getTime() >= Date.parse(match.kickoffAt)) {
        return context.json({ error: "Match is locked" }, 409);
      }

      store.saveGroupPick({ playerId, matchId: body.matchId, outcome: body.pick as "1" | "X" | "2" });
      return context.json({ ok: true });
    }

    // VMT-15: lock knockout picks after knockoutDeadline
    if (now().getTime() >= Date.parse(seed.knockoutDeadline)) {
      return context.json({ error: "Knockout picks are locked" }, 409);
    }

    if (body.round === "champion" && body.teamName) {
      store.saveKnockoutPick({ playerId, round: "champion", teams: [body.teamName] });
      return context.json({ ok: true });
    }

    if (body.round && validRounds.has(body.round) && Array.isArray(body.teamNames)) {
      store.saveKnockoutPick({ playerId, round: body.round, teams: body.teamNames });
      return context.json({ ok: true });
    }

    return context.json({ error: "Invalid pick payload" }, 400);
  });

  app.patch("/api/player/name", async (context) => {
    const playerId = authenticate(context.req.header("authorization"), store);
    if (!playerId) return context.json({ error: "Unauthorized" }, 401);

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

  app.get("/api/picks/:playerId", (context) => {
    const requestedPlayerId = context.req.param("playerId");
    const player = store.getPlayerById(requestedPlayerId);
    if (!player) return context.json({ error: "Unknown player" }, 404);

    // VMT-16: before the group-stage deadline, only the player themselves can view their picks
    if (now().getTime() < Date.parse(seed.groupStageDeadline)) {
      const sessionPlayerId = authenticate(context.req.header("authorization"), store);
      if (sessionPlayerId !== requestedPlayerId) {
        return context.json({ error: "Picks are private until the group stage deadline" }, 403);
      }
    }

    return context.json({
      player,
      group: store.getGroupPicks(requestedPlayerId),
      knockout: store.getKnockoutPicks(requestedPlayerId)
    });
  });

  app.post("/api/admin/results", async (context) => {
    const body = await context.req.json<{ adminPin?: string; matchId?: string; outcome?: string; result?: string }>();
    if (!isAdmin(context.req.header("x-admin-pin"), body.adminPin, adminPin)) {
      return context.json({ error: "Invalid admin PIN" }, 401);
    }
    const outcome = body.outcome ?? body.result;
    if (!body.matchId || !validOutcomes.has(outcome ?? "")) {
      return context.json({ error: "Invalid result payload" }, 400);
    }

    store.saveResult({ matchId: body.matchId, outcome: outcome as "1" | "X" | "2" });
    return context.json({ ok: true, leaderboard: store.getLeaderboard() });
  });

  app.post("/api/admin/knockout", async (context) => {
    const body = await context.req.json<{ adminPin?: string; round?: string; teams?: string[]; teamNames?: string[] }>();
    if (!isAdmin(context.req.header("x-admin-pin"), body.adminPin, adminPin)) {
      return context.json({ error: "Invalid admin PIN" }, 401);
    }
    const teams = body.teams ?? body.teamNames;
    if (!validRounds.has(body.round ?? "") || !Array.isArray(teams)) {
      return context.json({ error: "Invalid knockout payload" }, 400);
    }

    store.saveActualKnockout(body.round as KnockoutRound, teams);
    return context.json({ ok: true, teams: store.getActualKnockout(body.round as KnockoutRound) });
  });

  app.post("/api/admin/champion", async (context) => {
    const body = await context.req.json<{ adminPin?: string; team?: string; teamName?: string }>();
    if (!isAdmin(context.req.header("x-admin-pin"), body.adminPin, adminPin)) {
      return context.json({ error: "Invalid admin PIN" }, 401);
    }
    const team = body.team ?? body.teamName;
    if (!team) return context.json({ error: "Champion team is required" }, 400);

    store.saveActualChampion(team);
    return context.json({ ok: true, champion: store.getActualChampion() });
  });

  app.post("/api/admin/advancement", async (context) => {
    const body = await context.req.json<{ adminPin?: string; group?: string; position?: number; team?: string }>();
    if (!isAdmin(context.req.header("x-admin-pin"), body.adminPin, adminPin)) {
      return context.json({ error: "Invalid admin PIN" }, 401);
    }
    const group = body.group?.toUpperCase();
    const position = body.position;
    if (!group || (position !== 1 && position !== 2 && position !== 3)) {
      return context.json({ error: "Invalid advancement payload" }, 400);
    }
    try {
      store.saveGroupAdvancement(group, position as 1 | 2 | 3, body.team ?? "");
    } catch (err) {
      return context.json({ error: (err as Error).message }, 409);
    }
    return context.json({ ok: true, advancement: store.getGroupAdvancement() });
  });

  app.post("/api/admin/scoring", async (context) => {
    const body = await context.req.json<{ adminPin?: string; scoring?: Partial<Scoring> }>();
    if (!isAdmin(context.req.header("x-admin-pin"), body.adminPin, adminPin)) {
      return context.json({ error: "Invalid admin PIN" }, 401);
    }
    if (!body.scoring || typeof body.scoring !== "object") {
      return context.json({ error: "Scoring payload is required" }, 400);
    }

    store.saveScoring(body.scoring);
    return context.json({ ok: true, scoring: store.getScoring() });
  });

  return Object.assign(app, {
    inject(input: InjectInput) {
      return app.request(input.path, {
        method: input.method,
        headers: input.body ? { "content-type": "application/json" } : undefined,
        body: input.body ? JSON.stringify(input.body) : undefined
      });
    }
  });
}

export const app = createApp({ store: createStore({ databasePath: ":memory:" }) });

function authenticate(authorization: string | undefined, store: AppStore) {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  return token ? store.getSession(token) : undefined;
}

function isAdmin(headerPin: string | undefined, bodyPin: string | undefined, expectedPin: string) {
  return headerPin === expectedPin || bodyPin === expectedPin;
}
