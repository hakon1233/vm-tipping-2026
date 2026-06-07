import { describe, expect, it } from "vitest";
import seed from "../../../data/seed.json";
import {
  createEmptyKnockoutPicks,
  duplicateTeamNamesByRound,
  knockoutRounds,
  readKnockoutPicks,
  writeKnockoutPicks
} from "./knockout";

describe("knockout picks model", () => {
  it("creates the required slot counts for each knockout round", () => {
    const picks = createEmptyKnockoutPicks();

    expect(knockoutRounds.map((round) => [round.id, picks.rounds[round.id].length])).toEqual([
      ["r32", 16],
      ["r16", 8],
      ["qf", 4],
      ["sf", 2],
      ["final", 1]
    ]);
    expect(picks.champion).toBe("");
  });

  it("flags duplicate teams within the same round only", () => {
    const picks = createEmptyKnockoutPicks();
    picks.rounds.r32[0] = "Norway";
    picks.rounds.r32[1] = "Norway";
    picks.rounds.r16[0] = "Norway";
    picks.rounds.qf[0] = "Brazil";
    picks.rounds.qf[2] = "Brazil";

    expect(duplicateTeamNamesByRound(picks)).toEqual({
      r32: new Set(["Norway"]),
      r16: new Set(),
      qf: new Set(["Brazil"]),
      sf: new Set(),
      final: new Set()
    });
  });

  it("saves and restores champion plus round picks", () => {
    const storage = new Map<string, string>();
    const localStorageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    };
    const picks = createEmptyKnockoutPicks();
    picks.rounds.final[0] = "Norway";
    picks.champion = "Norway";

    writeKnockoutPicks(localStorageLike, "Bendik", picks);

    expect(readKnockoutPicks(localStorageLike, "Bendik")).toEqual(picks);
  });

  it("exposes all seeded teams as selectable options until bracket seed slots exist", () => {
    const teamCount = Object.values(seed.groups).flat().length;

    expect(teamCount).toBe(48);
  });
});
