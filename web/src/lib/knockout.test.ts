import { describe, expect, it } from "vitest";
import {
  createEmptyKnockoutPicks,
  duplicateTeamNamesByRound,
  groupAdvFromServer,
  knockoutPickPayloads,
  knockoutPicksFromServer,
  knockoutRounds,
  knockoutTeamPool,
  matchupTeams,
  r32Bracket,
  r32Choice,
  readGroupAdvPicks,
  readKnockoutPicks,
  renameKnockoutPicks,
  withGroupAdvPick,
  writeGroupAdvPicks,
  writeKnockoutPicks
} from "./knockout";
import type { Advancement } from "./tournament";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key)
  };
}

const m73 = r32Bracket[0]; // 2A v 2B
const m74 = r32Bracket[1]; // 1E v best 3rd from A/B/C/D/F

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
    const storage = memoryStorage();
    const picks = createEmptyKnockoutPicks();
    picks.rounds.final[0] = "Norway";
    picks.champion = "Norway";

    writeKnockoutPicks(storage, "Alice", picks);

    expect(readKnockoutPicks(storage, "Alice")).toEqual(picks);
  });

  it("moves the knockout cache, and only that, to a new player name", () => {
    const storage = memoryStorage();
    writeKnockoutPicks(storage, "Alice", createEmptyKnockoutPicks());
    writeGroupAdvPicks(storage, "Alice", { A: { first: "Mexico", second: "" } });

    renameKnockoutPicks(storage, "Alice", "Alicia");

    expect([...storage.items.keys()].sort()).toEqual([
      "vm-tipping-2026:group-adv:Alice",
      "vm-tipping-2026:knockout:Alicia"
    ]);
  });
});

describe("Round of 32 choices", () => {
  it("offers both groups' teams while neither place is known", () => {
    expect(r32Choice(m73, {}, {}, "")).toEqual({
      home: "2nd Group A",
      away: "2nd Group B",
      options: [
        "Bosnia and Herzegovina",
        "Canada",
        "Czech Republic",
        "Mexico",
        "Qatar",
        "South Africa",
        "South Korea",
        "Switzerland"
      ]
    });
  });

  it("uses the player's own group pick for a place", () => {
    const choice = r32Choice(m73, { A: { first: "South Africa", second: "Mexico" } }, {}, "");

    expect(choice.home).toBe("Mexico");
    expect(choice.options).toEqual(["Bosnia and Herzegovina", "Canada", "Mexico", "Qatar", "Switzerland"]);
  });

  it("prefers the admin's real result over the player's pick", () => {
    const advancement: Advancement = { A: { first: "Mexico", second: "South Korea" } };

    expect(r32Choice(m73, { A: { first: "South Africa", second: "Mexico" } }, advancement, "").home).toBe("South Korea");
  });

  it("labels a best-third slot with its groups and offers all their teams", () => {
    const choice = r32Choice(m74, {}, { E: { first: "Germany", second: "Ecuador" } }, "");

    expect(choice.home).toBe("Germany");
    expect(choice.away).toBe("Best 3rd (A/B/C/D/F)");
    expect(choice.options).toHaveLength(21);
    expect(choice.options).toContain("Scotland");
    expect(choice.options).not.toContain("Ecuador");
  });

  it("keeps a pick that is no longer possible at the top of the options", () => {
    expect(r32Choice(m73, {}, {}, "Norway").options.slice(0, 2)).toEqual(["Norway", "Bosnia and Herzegovina"]);
  });
});

describe("later-round matchups", () => {
  it("pairs slot n with the winners of slots 2n and 2n+1 of the round before", () => {
    const picks = createEmptyKnockoutPicks();
    picks.rounds.r32[2] = "Norway";
    picks.rounds.r32[3] = "Brazil";
    picks.rounds.sf[0] = "Spain";

    expect(matchupTeams(picks, "r16", 1)).toEqual(["Norway", "Brazil"]);
    expect(matchupTeams(picks, "r16", 0)).toBeNull();
    expect(matchupTeams(picks, "final", 0)).toBeNull();
    expect(matchupTeams(picks, "r32", 0)).toBeNull();
  });

  it("offers all 48 teams until the admin has set 1st and 2nd in every group", () => {
    expect(knockoutTeamPool({ A: { first: "Mexico", second: "South Korea" } })).toHaveLength(48);
  });

  it("offers only the advanced teams, sorted, once every group is set", () => {
    const advancement: Advancement = {
      A: { first: "Mexico", second: "South Korea", third: "Czech Republic" },
      B: { first: "Canada", second: "Switzerland" },
      C: { first: "Brazil", second: "Morocco" },
      D: { first: "United States", second: "Paraguay" },
      E: { first: "Germany", second: "Ecuador" },
      F: { first: "Netherlands", second: "Japan" },
      G: { first: "Belgium", second: "Egypt" },
      H: { first: "Spain", second: "Uruguay" },
      I: { first: "France", second: "Norway" },
      J: { first: "Argentina", second: "Austria" },
      K: { first: "Portugal", second: "Colombia" },
      L: { first: "England", second: "Croatia" }
    };

    const pool = knockoutTeamPool(advancement);

    expect(pool).toHaveLength(25);
    expect(pool.slice(0, 4)).toEqual(["Argentina", "Austria", "Belgium", "Brazil"]);
    expect(pool).toContain("Czech Republic");
    expect(pool).not.toContain("South Africa");
  });
});

describe("group advancement picks", () => {
  it("clears the other place when a team is picked for both", () => {
    const current = { A: { first: "Mexico", second: "Canada" } };

    expect(withGroupAdvPick(current, "A", 2, "Mexico")).toEqual({ A: { first: "", second: "Mexico" } });
    expect(withGroupAdvPick(current, "A", 1, "")).toEqual({ A: { first: "", second: "Canada" } });
    expect(withGroupAdvPick({}, "B", 1, "Qatar")).toEqual({ B: { first: "Qatar", second: "" } });
  });

  it("caches picks per player and ignores a corrupt cache", () => {
    const storage = memoryStorage();
    writeGroupAdvPicks(storage, "Alice", { A: { first: "Mexico", second: "" } });

    expect(storage.items.get("vm-tipping-2026:group-adv:Alice")).toBe('{"A":{"first":"Mexico","second":""}}');
    expect(readGroupAdvPicks(storage, "Alice")).toEqual({ A: { first: "Mexico", second: "" } });

    storage.items.set("vm-tipping-2026:group-adv:Bob", "{oops");
    expect(readGroupAdvPicks(storage, "Bob")).toEqual({});
  });
});

describe("picks on the server", () => {
  it("reads the server's knockout record into padded rounds", () => {
    const picks = knockoutPicksFromServer({ r16: ["Norway", "Brazil"], champion: ["Brazil"] });

    expect(picks.champion).toBe("Brazil");
    expect(picks.rounds.r16).toEqual(["Norway", "Brazil", "", "", "", "", "", ""]);
    expect(picks.rounds.r32).toHaveLength(16);
    expect(picks.rounds.final).toEqual([""]);
  });

  it("fills a missing place in the server's group picks with an empty pick", () => {
    expect(groupAdvFromServer({ A: { first: "Mexico" } })).toEqual({ A: { first: "Mexico", second: "" } });
  });

  it("sends one payload per round with picks, then the champion, leaving out empty ones", () => {
    const picks = createEmptyKnockoutPicks();
    picks.rounds.r32[0] = "Norway";
    picks.rounds.r32[5] = "Brazil";
    picks.rounds.sf[1] = "Spain";

    expect(knockoutPickPayloads(picks)).toEqual([
      { round: "r32", teamNames: ["Norway", "Brazil"] },
      { round: "sf", teamNames: ["Spain"] }
    ]);

    picks.champion = "Spain";
    expect(knockoutPickPayloads(picks).at(-1)).toEqual({ round: "champion", teamName: "Spain" });
    expect(knockoutPickPayloads(createEmptyKnockoutPicks())).toEqual([]);
  });
});
