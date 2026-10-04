import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { isKnockoutRoundId, knockoutRoundIds } from "@vm-tipping-2026/shared";

import { clientOf, createAuth, type AuthVariables } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { buildExportXlsx } from "./exportXlsx.js";
import { createPickRules } from "./picks.js";
import type { AppStore, Scoring } from "./store.js";

// The settings come from ServerConfig; tests may leave out the optional ones
// and pin the clock with `now`.
type AppOptions = Pick<ServerConfig, "adminPin" | "leaguePin"> &
  Partial<Pick<ServerConfig, "deadlinesDisabled" | "corsOrigins">> & {
    store: AppStore;
    now?: () => Date;
  };

const validOutcomes = new Set(["1", "X", "2"]);

export function createApp(options: AppOptions) {
  const { store, adminPin, leaguePin } = options;
  const now = options.now ?? (() => new Date());
  // When set, pick deadlines are skipped and the flag is reported on /api/matches
  // so the web UI unlocks too; no web redeploy needed to toggle it.
  const deadlinesDisabled = options.deadlinesDisabled ?? false;
  const auth = createAuth({ store, adminPin, leaguePin, now });
  const picks = createPickRules({ store, now, deadlinesDisabled });
  const areTeams = (names: unknown[]) => names.every((name) => typeof name === "string" && store.hasTeam(name));
  const app = new Hono<{ Variables: AuthVariables }>();

  // A body that isn't JSON is the caller's mistake, not a server error.
  app.onError((error, context) => {
    if (error instanceof HTTPException) return error.getResponse();
    if (error instanceof SyntaxError) return context.json({ error: "Invalid JSON" }, 400);
    console.error(error);
    return context.json({ error: "Internal server error" }, 500);
  });
  app.use(secureHeaders());
  app.use(bodyLimit({ maxSize: 64 * 1024 }));
  const corsOrigins = options.corsOrigins ?? [];
  if (corsOrigins.length > 0) app.use("/api/*", cors({ origin: corsOrigins }));

  app.get("/health", (context) => context.json({ ok: true, service: "vm-tipping-2026-api" }));
  app.get("/api/matches", (context) =>
    context.json({
      players: store.listPlayers(),
      matches: store.listMatches(),
      advancement: store.getGroupAdvancement(),
      deadlinesDisabled
    })
  );
  app.get("/api/leaderboard", (context) => context.json({ leaderboard: store.getLeaderboard() }));
  // Everyone's picks in one workbook, so it follows the same rule as reading
  // another player's picks: a session, and only after the group stage deadline.
  app.get("/api/export.xlsx", auth.requirePlayer, async (context) => {
    if (!picks.allArePublic()) {
      return context.json({ error: "Picks are private until the group stage deadline" }, 403);
    }
    const file = await buildExportXlsx(store);
    return context.body(file.buffer as ArrayBuffer, 200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="VMtipping2026-export.xlsx"'
    });
  });
  // Public: it holds results and standings, never anyone's picks. The admin page
  // sends its PIN here to check it before unlocking, so a PIN that is sent must match.
  app.get(
    "/api/admin/state",
    (context, next) => (context.req.header("x-admin-pin") === undefined ? next() : auth.requireAdmin(context, next)),
    (context) =>
      context.json({
        players: store.listPlayers(),
        teams: store.listTeams(),
        matches: store.listMatches(),
        scoring: store.getScoring(),
        knockout: Object.fromEntries(
          knockoutRoundIds.map((round) => [round, store.getActualKnockout(round)])
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
    const result = picks.save(context.get("playerId"), await context.req.json());
    return result.ok ? context.json({ ok: true }) : context.json({ error: result.error }, result.status);
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
    if (!picks.canRead(sessionPlayerId, requestedPlayerId)) {
      return context.json({ error: "Picks are private until the group stage deadline" }, 403);
    }

    return context.json({
      player,
      group: store.getGroupPicks(requestedPlayerId),
      knockout: store.getKnockoutPicks(requestedPlayerId),
      groupAdvancement: store.getPlayerGroupAdvancement(requestedPlayerId)
    });
  });

  // Every admin write needs the admin PIN.
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
    if (!isKnockoutRoundId(body.round) || !Array.isArray(teams) || !areTeams(teams)) {
      return context.json({ error: "Invalid knockout payload" }, 400);
    }

    store.saveActualKnockout(body.round, teams);
    return context.json({ ok: true, teams: store.getActualKnockout(body.round) });
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
