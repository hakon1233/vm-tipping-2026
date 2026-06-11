import { describe, expect, it } from "vitest";

import seed from "../data/seed.json" with { type: "json" };

// VMT-27: the R32 bracket must be a valid single-elimination draw — every team
// (slot) appears in exactly one matchup. This guard fails loudly if the seed
// ever regresses to a bracket where a slot or team is duplicated.

type R32Match = { id: string; slot1: string; slot2: string; slot2Groups?: string[] };

const bracket = seed.r32Bracket as R32Match[];
const groups = seed.groups as Record<string, string[]>;
const groupLetters = Object.keys(groups);

describe("seed bracket integrity (VMT-27)", () => {
  it("has 12 groups of 4 with 48 distinct teams (no team in two groups)", () => {
    expect(groupLetters).toHaveLength(12);
    const allTeams = groupLetters.flatMap((g) => groups[g]);
    expect(allTeams).toHaveLength(48);
    expect(new Set(allTeams).size).toBe(48);
    for (const g of groupLetters) {
      expect(groups[g]).toHaveLength(4);
    }
  });

  it("defines exactly 16 R32 matches with unique match ids", () => {
    expect(bracket).toHaveLength(16);
    expect(new Set(bracket.map((m) => m.id)).size).toBe(16);
  });

  it("uses every group winner and runner-up slot exactly once, plus 8 third-place slots", () => {
    const slots = bracket.flatMap((m) => [m.slot1, m.slot2]);
    expect(slots).toHaveLength(32);

    const positional = slots.filter((s) => s !== "3rd");
    const thirds = slots.filter((s) => s === "3rd");
    expect(thirds).toHaveLength(8);

    // 1A–1L and 2A–2L each appear exactly once → no team can play two R32 matches
    const expected = groupLetters.flatMap((g) => [`1${g}`, `2${g}`]).sort();
    expect([...positional].sort()).toEqual(expected);
  });

  it("gives every third-place slot an explicit eligible-groups list", () => {
    for (const match of bracket) {
      for (const [slot, slotGroups] of [[match.slot2, match.slot2Groups]] as const) {
        if (slot === "3rd") {
          expect(slotGroups, `${match.id} third-place slot needs slot2Groups`).toBeDefined();
          expect(slotGroups!.length).toBeGreaterThan(0);
          for (const g of slotGroups!) expect(groupLetters).toContain(g);
        }
      }
      // slot1 is never a third-place slot in this draw; fail loudly if that changes
      expect(match.slot1).not.toBe("3rd");
    }
  });
});
