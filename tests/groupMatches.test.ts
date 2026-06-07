import { describe, expect, it } from "vitest";
import { buildGroupMatches } from "../shared/src/groupMatches";

describe("buildGroupMatches", () => {
  it("expands all 12 groups into 72 stable group-stage matches", () => {
    const matches = buildGroupMatches();

    expect(matches).toHaveLength(72);
    expect(matches.filter((match) => match.group === "A")).toHaveLength(6);
    expect(matches.filter((match) => match.group === "L")).toHaveLength(6);
    expect(new Set(matches.map((match) => match.id)).size).toBe(72);
    expect(matches[0]).toMatchObject({
      id: "A-1",
      group: "A",
      homeTeam: "Mexico",
      awayTeam: "South Africa",
    });
    expect(
      matches
        .filter((match) => match.group === "L")
        .map((match) => [match.homeTeam, match.awayTeam]),
    ).toEqual([
      ["England", "Croatia"],
      ["Ghana", "Panama"],
      ["England", "Ghana"],
      ["Croatia", "Panama"],
      ["England", "Panama"],
      ["Croatia", "Ghana"],
    ]);
  });

  it("assigns kickoff times so lock state can be derived per match", () => {
    const matches = buildGroupMatches();
    const kickoffTimes = matches.map((match) => Date.parse(match.kickoffAt));

    expect(kickoffTimes.every(Number.isFinite)).toBe(true);
    expect(kickoffTimes[1]).toBeGreaterThan(kickoffTimes[0]);
  });
});
