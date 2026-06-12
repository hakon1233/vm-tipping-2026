import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createDatabase, seedDatabase } from "../src/db.js";

function testApp(now = new Date("2026-01-01T12:00:00.000Z"), options: { deadlinesDisabled?: boolean } = {}) {
  const db = new Database(":memory:");
  createDatabase(db);
  seedDatabase(db);

  return {
    app: createApp({
      db,
      leaguePin: "league-pin",
      adminPin: "admin-pin",
      now: () => now,
      ...options,
    }),
    db,
  };
}

async function login(app: ReturnType<typeof createApp>, name = "Player 1") {
  const response = await app.request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pin: "league-pin" }),
  });

  expect(response.status).toBe(200);
  return response.json() as Promise<{
    player: { id: number; name: string };
    session: { token: string; playerId: number };
  }>;
}

describe("VM tipping API", () => {
  it("loads seed players, teams, and 72 group matches", async () => {
    const { app } = testApp();

    const response = await app.request("/api/matches");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.players).toHaveLength(8);
    expect(body.teams).toHaveLength(48);
    expect(body.matches).toHaveLength(72);
    expect(body.matches[0]).toMatchObject({
      id: "A-1",
      round: "group",
      groupName: "A",
      homeTeam: "Mexico",
      awayTeam: "South Africa",
      result: null,
    });
    expect(body.knockoutRounds.map((round: { id: string }) => round.id)).toEqual([
      "r32",
      "r16",
      "qf",
      "sf",
      "final",
      "champion",
    ]);
  });

  it("validates player login with the shared league PIN", async () => {
    const { app } = testApp();

    const ok = await login(app, "Player 2");
    expect(ok.player.name).toBe("Player 2");
    expect(ok.session.token).toBeTruthy();

    const bad = await app.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nils Erland", pin: "wrong" }),
    });
    expect(bad.status).toBe(401);
  });

  it("lets a player save group and knockout picks and read them back", async () => {
    const { app } = testApp();
    const { session, player } = await login(app);

    const groupPick = await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ matchId: "A-1", pick: "1" }),
    });
    expect(groupPick.status).toBe(200);

    const knockoutPick = await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ round: "r32", teamNames: ["Mexico", "Mexico", "South Africa"] }),
    });
    expect(knockoutPick.status).toBe(200);

    const picks = await app.request(`/api/picks/${player.id}`, {
      headers: { authorization: `Bearer ${session.token}` }
    });
    expect(picks.status).toBe(200);
    await expect(picks.json()).resolves.toMatchObject({
      player: { id: player.id, name: "Player 1" },
      group: { "A-1": "1" },
      knockout: { r32: ["Mexico", "South Africa"] },
    });
  });

  it("rejects group picks after kickoff", async () => {
    const { app } = testApp(new Date("2026-06-11T19:00:01.000Z"));
    const { session } = await login(app);

    const response = await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ matchId: "A-1", pick: "2" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "Match is locked" });
  });

  // VMT-29: temporary founder-requested deadline override (DEADLINES_DISABLED=1)
  it("accepts group and knockout picks after the deadline when deadlines are disabled", async () => {
    const { app } = testApp(new Date("2026-06-12T19:00:00.000Z"), { deadlinesDisabled: true });
    const { session } = await login(app);

    const groupPick = await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ matchId: "A-1", pick: "2" }),
    });
    expect(groupPick.status).toBe(200);

    const knockoutPick = await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ round: "r32", teamNames: ["Mexico"] }),
    });
    expect(knockoutPick.status).toBe(200);

    const matches = await app.request("/api/matches");
    await expect(matches.json()).resolves.toMatchObject({ deadlinesDisabled: true });
  });

  it("keeps the deadline lock and reports deadlinesDisabled=false by default", async () => {
    const { app } = testApp(new Date("2026-06-12T19:00:00.000Z"));
    const { session } = await login(app);

    const knockoutPick = await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ round: "r32", teamNames: ["Mexico"] }),
    });
    expect(knockoutPick.status).toBe(409);

    const matches = await app.request("/api/matches");
    await expect(matches.json()).resolves.toMatchObject({ deadlinesDisabled: false });
  });

  it("accepts admin results and computes the leaderboard with duplicate knockout picks counted once", async () => {
    const { app } = testApp();
    const { session } = await login(app);

    await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ matchId: "A-1", pick: "1" }),
    });
    await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ round: "r32", teamNames: ["Mexico", "Mexico", "Brazil"] }),
    });
    await app.request("/api/picks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ round: "champion", teamName: "Mexico" }),
    });

    const result = await app.request("/api/admin/results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-pin": "admin-pin" },
      body: JSON.stringify({ matchId: "A-1", result: "1" }),
    });
    expect(result.status).toBe(200);

    const knockout = await app.request("/api/admin/knockout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-pin": "admin-pin" },
      body: JSON.stringify({ round: "r32", teamNames: ["Mexico", "Brazil"] }),
    });
    expect(knockout.status).toBe(200);

    const champion = await app.request("/api/admin/champion", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-pin": "admin-pin" },
      body: JSON.stringify({ teamName: "Mexico" }),
    });
    expect(champion.status).toBe(200);

    const leaderboard = await app.request("/api/leaderboard");
    expect(leaderboard.status).toBe(200);
    const body = await leaderboard.json();
    expect(body.leaderboard[0]).toMatchObject({
      playerName: "Player 1",
      groupPoints: 1,
      r32Points: 4,
      championPoints: 7,
      total: 12,
      rank: 1,
    });
  });
});
