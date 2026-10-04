import { describe, expect, it } from "vitest";

import { createStore } from "../src/store.js";

// One full scenario through the store: picks and results in SQLite in, ranked
// leaderboard out. Scoring rules in detail are covered in scoring.test.ts.
describe("leaderboard from stored picks and results", () => {
  it("scores every pick type with the seed scoring and ranks players", () => {
    const store = createStore({ databasePath: ":memory:" });

    // Results: A-1 home win, A-2 draw. Real advancement: group A Mexico 1st, South Korea 2nd.
    store.saveResult({ matchId: "A-1", outcome: "1" });
    store.saveResult({ matchId: "A-2", outcome: "X" });
    store.saveGroupAdvancement("A", 1, "Mexico");
    store.saveGroupAdvancement("A", 2, "South Korea");
    store.saveActualKnockout("r32", ["Mexico", "Brazil", "Spain"]);
    store.saveActualKnockout("final", ["Spain", "Brazil"]);
    store.saveActualChampion("Spain");

    // Player 1: both group games right, A 1st right, 2 R32 teams (one picked twice), final + champion right.
    store.saveGroupPick({ playerId: "player-1", matchId: "A-1", outcome: "1" });
    store.saveGroupPick({ playerId: "player-1", matchId: "A-2", outcome: "X" });
    store.savePlayerGroupAdvancement({ playerId: "player-1", group: "A", position: 1, team: "Mexico" });
    store.savePlayerGroupAdvancement({ playerId: "player-1", group: "A", position: 2, team: "Czech Republic" });
    store.saveKnockoutPick({ playerId: "player-1", round: "r32", teams: ["Mexico", "Brazil", "Brazil", "Japan"] });
    store.saveKnockoutPick({ playerId: "player-1", round: "final", teams: ["Spain", "Norway"] });
    store.saveKnockoutPick({ playerId: "player-1", round: "champion", teams: ["Spain"] });

    // Player 2: one group game right, A 2nd right, wrong champion.
    store.saveGroupPick({ playerId: "player-2", matchId: "A-1", outcome: "1" });
    store.saveGroupPick({ playerId: "player-2", matchId: "A-2", outcome: "2" });
    store.savePlayerGroupAdvancement({ playerId: "player-2", group: "A", position: 2, team: "South Korea" });
    store.saveKnockoutPick({ playerId: "player-2", round: "champion", teams: ["Brazil"] });

    // Player 3: same total as player 2 (one group game + 2 points) through an R32 team.
    store.saveGroupPick({ playerId: "player-3", matchId: "A-1", outcome: "1" });
    store.saveKnockoutPick({ playerId: "player-3", round: "r32", teams: ["Spain"] });

    const leaderboard = store.getLeaderboard();

    expect(leaderboard[0]).toEqual({
      playerId: "player-1",
      playerName: "Player 1",
      name: "Player 1",
      groupPoints: 5,
      r32Points: 4,
      r16Points: 0,
      qfPoints: 0,
      sfPoints: 0,
      finalPoints: 6,
      championPoints: 7,
      knockoutPoints: 17,
      total: 22,
      rank: 1
    });
    expect(leaderboard.slice(1, 4).map((row) => [row.playerName, row.total, row.rank])).toEqual([
      ["Player 2", 3, 2],
      ["Player 3", 3, 2],
      ["Player 4", 0, 4]
    ]);
    expect(leaderboard).toHaveLength(8);
    expect(leaderboard.slice(3).every((row) => row.total === 0 && row.rank === 4)).toBe(true);
  });

  it("uses scoring values the admin changed", () => {
    const store = createStore({ databasePath: ":memory:" });
    store.saveResult({ matchId: "A-1", outcome: "1" });
    store.saveGroupPick({ playerId: "player-1", matchId: "A-1", outcome: "1" });
    store.saveScoring({ groupGame: 4 });

    expect(store.getLeaderboard()[0]).toMatchObject({ playerId: "player-1", groupPoints: 4, total: 4 });
  });
});
