import { describe, expect, it } from "vitest";

import { rankPlayers, type Actuals, type PlayerPicks } from "../src/scoring.js";

const scoring = {
  groupGame: 1,
  groupFirst: 3,
  groupSecond: 2,
  r32Team: 2,
  r16Team: 3,
  qfTeam: 4,
  sfTeam: 5,
  finalTeam: 6,
  champion: 7
};

const nothingYet: Actuals = { results: {}, advancement: {}, knockout: { r32: [], r16: [], qf: [], sf: [], final: [] } };
const noPicks: PlayerPicks = { group: {}, advancement: {}, knockout: {} };

function scoreOne(picks: Partial<PlayerPicks>, actuals: Partial<Actuals>) {
  const [row] = rankPlayers([{ id: "p1", name: "Alice", picks: { ...noPicks, ...picks } }], { ...nothingYet, ...actuals }, scoring);
  return row;
}

describe("group stage scoring", () => {
  it("gives a point per correct 1/X/2 and nothing for wrong or unplayed games", () => {
    const row = scoreOne({ group: { "A-1": "1", "A-2": "X", "A-3": "2" } }, { results: { "A-1": "1", "A-2": "2" } });

    expect(row).toMatchObject({ groupPoints: 1, total: 1 });
  });

  it("adds points for the correct group winner and runner-up", () => {
    const row = scoreOne(
      { advancement: { A: { first: "Mexico", second: "South Korea" }, B: { first: "Canada", second: "Qatar" } } },
      { advancement: { A: { first: "Mexico", second: "Czech Republic" }, B: { first: "Qatar", second: "Qatar" } } }
    );

    expect(row).toMatchObject({ groupPoints: 3 + 2, knockoutPoints: 0, total: 5 });
  });
});

describe("knockout scoring", () => {
  it("scores each team that reached a round, with points rising per round", () => {
    const row = scoreOne(
      { knockout: { r32: ["Spain", "Brazil", "Japan"], r16: ["Spain"], qf: ["Spain"], sf: ["Spain"], final: ["Spain"] } },
      { knockout: { r32: ["Spain", "Brazil"], r16: ["Spain"], qf: ["Spain"], sf: ["Spain"], final: ["Spain", "Brazil"] } }
    );

    expect(row).toMatchObject({ r32Points: 4, r16Points: 3, qfPoints: 4, sfPoints: 5, finalPoints: 6, knockoutPoints: 22 });
  });

  it("scores a team picked twice in the same round once", () => {
    expect(scoreOne({ knockout: { r32: ["Spain", "Spain"] } }, { knockout: { ...nothingYet.knockout, r32: ["Spain"] } })).toMatchObject({
      r32Points: 2
    });
  });

  it("gives champion points only once the champion is known and was picked", () => {
    const picks = { knockout: { champion: ["Spain"] } };

    expect(scoreOne(picks, {}).championPoints).toBe(0);
    expect(scoreOne(picks, { champion: "Brazil" }).championPoints).toBe(0);
    expect(scoreOne(picks, { champion: "Spain" })).toMatchObject({ championPoints: 7, knockoutPoints: 7, total: 7 });
  });
});

describe("ranking", () => {
  it("ranks by total, shares a rank on ties and lists tied players by name", () => {
    const actuals = { ...nothingYet, results: { "A-1": "1" as const, "A-2": "1" as const } };
    const players = [
      { id: "p1", name: "Dave", picks: noPicks },
      { id: "p2", name: "Carol", picks: { ...noPicks, group: { "A-1": "1" as const } } },
      { id: "p3", name: "Bob", picks: { ...noPicks, group: { "A-1": "1" as const } } },
      { id: "p4", name: "Alice", picks: { ...noPicks, group: { "A-1": "1" as const, "A-2": "1" as const } } }
    ];

    expect(rankPlayers(players, actuals, scoring).map((row) => [row.name, row.total, row.rank])).toEqual([
      ["Alice", 2, 1],
      ["Bob", 1, 2],
      ["Carol", 1, 2],
      ["Dave", 0, 4]
    ]);
  });
});
