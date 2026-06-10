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

// All group picks lock at the same real deadline rather than synthetic per-match times.
const KICKOFF_AT = seed.groupStageDeadline;

export function buildGroupMatchesFromGroups(
  groups: Record<GroupLetter, readonly string[]>
): Match[] {
  const matches: Match[] = [];

  for (const group of Object.keys(groups).sort() as GroupLetter[]) {
    const teams = groups[group];

    PAIRINGS.forEach(([homeIndex, awayIndex], pairingIndex) => {
      matches.push({
        id: `${group}-${pairingIndex + 1}`,
        round: "group",
        group,
        groupName: group,
        homeTeam: teams[homeIndex],
        awayTeam: teams[awayIndex],
        kickoffAt: KICKOFF_AT
      });
    });
  }

  return matches;
}

export function buildGroupMatches(): Match[] {
  return buildGroupMatchesFromGroups(seed.groups as Record<GroupLetter, readonly string[]>);
}
