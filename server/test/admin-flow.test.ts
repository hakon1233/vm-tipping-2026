import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { createStore } from "../src/store.js";

describe("admin result flow", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vm-tipping-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists an admin group result and applies it to leaderboard scoring", async () => {
    const store = createStore({ databasePath: join(dir, "test.sqlite") });
    const match = store.listMatches()[0];
    const player = store.listPlayers()[0];
    store.saveGroupPick({ playerId: player.id, matchId: match.id, outcome: "1" });

    const app = createApp({ store, adminPin: "secret", leaguePin: "league" });
    const response = await app.request("/api/admin/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPin: "secret", matchId: match.id, outcome: "1" })
    });

    expect(response.status).toBe(200);
    expect(store.getResult(match.id)?.outcome).toBe("1");
    expect(store.getLeaderboard()[0]).toMatchObject({
      playerId: player.id,
      groupPoints: 1,
      total: 1,
      rank: 1
    });
  });

  it("persists knockout, champion, and scoring config updates", async () => {
    const store = createStore({ databasePath: join(dir, "test.sqlite") });
    const app = createApp({ store, adminPin: "secret", leaguePin: "league" });
    const teams = store.listTeams().slice(0, 4).map((team) => team.name);

    expect(
      await app.request("/api/admin/knockout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminPin: "secret", round: "r16", teams })
      })
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/api/admin/champion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminPin: "secret", team: teams[0] })
      })
    ).toMatchObject({ status: 200 });
    expect(
      await app.request("/api/admin/scoring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminPin: "secret", scoring: { r16Team: 9, champion: 13 } })
      })
    ).toMatchObject({ status: 200 });

    expect(store.getActualKnockout("r16")).toEqual(teams);
    expect(store.getActualChampion()).toBe(teams[0]);
    expect(store.getScoring()).toMatchObject({ r16Team: 9, champion: 13 });
  });
});
