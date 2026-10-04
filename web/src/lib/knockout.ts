import seed from "../../../data/seed.json";
import { allTeams, groupLetters, teamsInGroup, type Advancement } from "./tournament";

// The knockout bracket and a player's picks for it: which teams can go in each
// slot, how picks are stored locally, and how they travel to and from the server.

export type KnockoutRoundId = "r32" | "r16" | "qf" | "sf" | "final";

export type KnockoutRound = {
  id: KnockoutRoundId;
  label: string;
  shortLabel: string;
  slotCount: number;
  pointsKey: "r32Team" | "r16Team" | "qfTeam" | "sfTeam" | "finalTeam";
};

export type KnockoutPicks = {
  rounds: Record<KnockoutRoundId, string[]>;
  champion: string;
};

// A player's own 1st/2nd place pick per group letter; "" means not picked.
export type GroupAdvPicks = Record<string, { first: string; second: string }>;

// One POST /api/picks body for the knockout stage.
export type KnockoutPickPayload =
  | { round: KnockoutRoundId; teamNames: string[] }
  | { round: "champion"; teamName: string };

export type KnockoutStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

// One Round of 32 match. A slot is "1A"/"2A" (group A winner/runner-up) or
// "3rd" (one of the best third-placed teams from slot2Groups).
export type R32Match = { id: string; slot1: string; slot2: string; slot2Groups?: string[] };

export const knockoutRounds: KnockoutRound[] = [
  { id: "r32", label: "Round of 32", shortLabel: "R32", slotCount: 16, pointsKey: "r32Team" },
  { id: "r16", label: "Round of 16", shortLabel: "R16", slotCount: 8, pointsKey: "r16Team" },
  { id: "qf", label: "Quarter-final", shortLabel: "QF", slotCount: 4, pointsKey: "qfTeam" },
  { id: "sf", label: "Semi-final", shortLabel: "SF", slotCount: 2, pointsKey: "sfTeam" },
  { id: "final", label: "Final", shortLabel: "Final", slotCount: 1, pointsKey: "finalTeam" }
];

export const r32Bracket: R32Match[] = seed.r32Bracket;

const storagePrefix = "vm-tipping-2026:knockout";
const groupAdvStoragePrefix = "vm-tipping-2026:group-adv";

// Every round padded to its slot count; anything that is not a string becomes "".
function roundsFrom(saved: (round: KnockoutRoundId) => unknown): Record<KnockoutRoundId, string[]> {
  return knockoutRounds.reduce(
    (rounds, round) => {
      const savedRound = saved(round.id);
      rounds[round.id] = Array.from({ length: round.slotCount }, (_, index) => {
        const pick: unknown = Array.isArray(savedRound) ? savedRound[index] : undefined;
        return typeof pick === "string" ? pick : "";
      });
      return rounds;
    },
    {} as Record<KnockoutRoundId, string[]>
  );
}

export function createEmptyKnockoutPicks(): KnockoutPicks {
  return { rounds: roundsFrom(() => undefined), champion: "" };
}

export function duplicateTeamNamesByRound(picks: KnockoutPicks): Record<KnockoutRoundId, Set<string>> {
  return knockoutRounds.reduce(
    (duplicates, round) => {
      const seen = new Set<string>();
      const repeated = new Set<string>();

      for (const teamName of picks.rounds[round.id]) {
        if (!teamName) continue;
        if (seen.has(teamName)) {
          repeated.add(teamName);
        }
        seen.add(teamName);
      }

      duplicates[round.id] = repeated;
      return duplicates;
    },
    {} as Record<KnockoutRoundId, Set<string>>
  );
}

// The teams a player can pick from in a knockout slot without a known matchup:
// once the admin has set 1st and 2nd for every group, only the teams that
// advanced; before that, all 48.
export function knockoutTeamPool(advancement: Advancement): string[] {
  const entries = Object.values(advancement);
  const allGroupsSet = entries.length === groupLetters.length && entries.every((entry) => entry.first && entry.second);
  if (!allGroupsSet) return allTeams;
  return entries.flatMap((entry) => [entry.first, entry.second, entry.third].filter((team): team is string => Boolean(team))).sort();
}

function resolveR32Slot(
  slot: string,
  slotGroups: string[] | undefined,
  playerAdv: GroupAdvPicks,
  advancement: Advancement
): { label: string; options: string[] } {
  if (slot === "3rd") {
    const groups = slotGroups ?? [];
    return { label: `Best 3rd (${groups.join("/")})`, options: groups.flatMap(teamsInGroup) };
  }
  const position = parseInt(slot[0]);
  const group = slot.slice(1);
  // The admin's real result wins over the player's own group pick.
  const adminTeam = position === 1 ? advancement[group]?.first : advancement[group]?.second;
  const playerTeam = position === 1 ? playerAdv[group]?.first : playerAdv[group]?.second;
  const resolved = adminTeam ?? playerTeam;
  return {
    label: resolved ?? (position === 1 ? `1st Group ${group}` : `2nd Group ${group}`),
    options: resolved ? [resolved] : teamsInGroup(group)
  };
}

// The two sides of a Round of 32 match and the teams that can win it. A pick
// that is no longer among those teams stays first, so the player still sees it.
export function r32Choice(
  match: R32Match,
  playerAdv: GroupAdvPicks,
  advancement: Advancement,
  currentPick: string
): { home: string; away: string; options: string[] } {
  const home = resolveR32Slot(match.slot1, undefined, playerAdv, advancement);
  const away = resolveR32Slot(match.slot2, match.slot2Groups, playerAdv, advancement);
  const options = [...new Set([...home.options, ...away.options])].sort();
  return {
    home: home.label,
    away: away.label,
    options: currentPick && !options.includes(currentPick) ? [currentPick, ...options] : options
  };
}

export function previousRound(roundId: KnockoutRoundId): KnockoutRound | undefined {
  const index = knockoutRounds.findIndex((round) => round.id === roundId);
  return index > 0 ? knockoutRounds[index - 1] : undefined;
}

// Slot n of a round is played between the winners of slots 2n and 2n+1 of the
// round before. Null until the player has picked both.
export function matchupTeams(picks: KnockoutPicks, roundId: KnockoutRoundId, slotIndex: number): [string, string] | null {
  const previous = previousRound(roundId);
  if (!previous) return null;
  const home = picks.rounds[previous.id][slotIndex * 2] ?? "";
  const away = picks.rounds[previous.id][slotIndex * 2 + 1] ?? "";
  return home && away ? [home, away] : null;
}

// 1st and 2nd must differ (the server enforces it too): picking the team that
// holds the other place clears that place.
export function withGroupAdvPick(current: GroupAdvPicks, group: string, position: 1 | 2, team: string): GroupAdvPicks {
  const other = position === 1 ? (current[group]?.second ?? "") : (current[group]?.first ?? "");
  const collides = Boolean(team) && team === other;
  return {
    ...current,
    [group]: {
      first: position === 1 ? team : collides ? "" : (current[group]?.first ?? ""),
      second: position === 2 ? team : collides ? "" : (current[group]?.second ?? "")
    }
  };
}

export function knockoutPicksFromServer(record: Record<string, string[]>): KnockoutPicks {
  return { rounds: roundsFrom((round) => record[round]), champion: record.champion?.[0] ?? "" };
}

export function groupAdvFromServer(record: Record<string, { first?: string; second?: string }>): GroupAdvPicks {
  const picks: GroupAdvPicks = {};
  for (const [group, pick] of Object.entries(record)) {
    picks[group] = { first: pick.first ?? "", second: pick.second ?? "" };
  }
  return picks;
}

// Rounds with no picks, and an empty champion, are left out, so clearing the
// last pick of a round is never sent to the server.
export function knockoutPickPayloads(picks: KnockoutPicks): KnockoutPickPayload[] {
  const payloads: KnockoutPickPayload[] = knockoutRounds
    .filter((round) => picks.rounds[round.id].some(Boolean))
    .map((round) => ({ round: round.id, teamNames: picks.rounds[round.id].filter(Boolean) }));
  if (picks.champion) payloads.push({ round: "champion", teamName: picks.champion });
  return payloads;
}

// The local copies below are a cache keyed by player name; the server is
// authoritative and overwrites them when the picks load.

function knockoutStorageKey(playerName: string): string {
  return `${storagePrefix}:${playerName}`;
}

export function readKnockoutPicks(storage: KnockoutStorage, playerName: string): KnockoutPicks {
  const raw = storage.getItem(knockoutStorageKey(playerName));
  if (!raw) return createEmptyKnockoutPicks();

  try {
    const parsed = JSON.parse(raw) as Partial<KnockoutPicks>;
    return {
      champion: typeof parsed.champion === "string" ? parsed.champion : "",
      rounds: roundsFrom((round) => parsed.rounds?.[round])
    };
  } catch {
    return createEmptyKnockoutPicks();
  }
}

export function writeKnockoutPicks(storage: KnockoutStorage, playerName: string, picks: KnockoutPicks): void {
  storage.setItem(knockoutStorageKey(playerName), JSON.stringify(picks));
}

// A rename moves the knockout cache to the new name. The group-advancement
// cache is not moved.
export function renameKnockoutPicks(
  storage: KnockoutStorage & { removeItem: (key: string) => void },
  oldName: string,
  newName: string
): void {
  if (oldName === newName) return;
  const oldKey = knockoutStorageKey(oldName);
  const raw = storage.getItem(oldKey);
  if (raw) {
    storage.setItem(knockoutStorageKey(newName), raw);
    storage.removeItem(oldKey);
  }
}

export function readGroupAdvPicks(storage: KnockoutStorage, playerName: string): GroupAdvPicks {
  const raw = storage.getItem(`${groupAdvStoragePrefix}:${playerName}`);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as GroupAdvPicks;
  } catch {
    return {};
  }
}

export function writeGroupAdvPicks(storage: KnockoutStorage, playerName: string, picks: GroupAdvPicks): void {
  storage.setItem(`${groupAdvStoragePrefix}:${playerName}`, JSON.stringify(picks));
}
