import type { GroupLetter, Match } from "./types.js";
import seed from "../../data/seed.json" with { type: "json" };

const PAIRINGS = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2]
] as const;

const FIRST_KICKOFF = Date.UTC(2026, 5, 11, 19, 0, 0);
const MATCH_SPACING_HOURS = 3;

export function buildGroupMatchesFromGroups(
  groups: Record<GroupLetter, readonly string[]>
): Match[] {
  const matches: Match[] = [];

  for (const group of Object.keys(groups).sort() as GroupLetter[]) {
    const teams = groups[group];

    PAIRINGS.forEach(([homeIndex, awayIndex], pairingIndex) => {
      const matchIndex = matches.length;
      const kickoffAt = new Date(
        FIRST_KICKOFF + matchIndex * MATCH_SPACING_HOURS * 60 * 60 * 1000
      ).toISOString();

      matches.push({
        id: `${group}-${pairingIndex + 1}`,
        round: "group",
        group,
        groupName: group,
        homeTeam: teams[homeIndex],
        awayTeam: teams[awayIndex],
        kickoffAt
      });
    });
  }

  return matches;
}

export function buildGroupMatches(): Match[] {
  return buildGroupMatchesFromGroups(seed.groups as Record<GroupLetter, readonly string[]>);
}
