import type { GroupLetter, ScoringConfig } from "@vm-tipping-2026/shared";
import seed from "../../../data/seed.json";

// The tournament as seeded in data/seed.json, plus the lock rules the UI shares
// with the server.

export const groupLetters = Object.keys(seed.groups) as GroupLetter[];
export const allTeams: string[] = Object.values(seed.groups).flat();

const groups: Record<string, string[]> = seed.groups;

export function teamsInGroup(group: string): string[] {
  return groups[group] ?? [];
}

// Shown on the login screen until the server's player list arrives.
export const seedPlayerNames: string[] = seed.players;

// The seeded points per pick. The admin can change the live values; the
// knockout picks page shows these.
export const seedScoring: ScoringConfig = seed.scoring;

// The real group outcome as the admin enters it: 1st, 2nd and (for the eight
// best) 3rd place per group letter.
export type Advancement = Record<string, { first?: string; second?: string; third?: string }>;

export function matchesByGroup<M extends { group: string }>(matches: M[]): Record<GroupLetter, M[]> {
  return groupLetters.reduce(
    (byGroup, group) => {
      byGroup[group] = matches.filter((match) => match.group === group);
      return byGroup;
    },
    {} as Record<GroupLetter, M[]>
  );
}

// A group match locks at kickoff and every knockout pick at the knockout
// deadline, as on the server. While the server reports deadlinesDisabled
// nothing locks.
export function isMatchLocked(match: { kickoffAt: string }, deadlinesDisabled: boolean, now = Date.now()): boolean {
  return !deadlinesDisabled && now >= Date.parse(match.kickoffAt);
}

export function isKnockoutLocked(deadlinesDisabled: boolean, now = Date.now()): boolean {
  return !deadlinesDisabled && now >= Date.parse(seed.knockoutDeadline);
}
