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

export type KnockoutStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const knockoutRounds: KnockoutRound[] = [
  { id: "r32", label: "Round of 32", shortLabel: "R32", slotCount: 16, pointsKey: "r32Team" },
  { id: "r16", label: "Round of 16", shortLabel: "R16", slotCount: 8, pointsKey: "r16Team" },
  { id: "qf", label: "Quarter-final", shortLabel: "QF", slotCount: 4, pointsKey: "qfTeam" },
  { id: "sf", label: "Semi-final", shortLabel: "SF", slotCount: 2, pointsKey: "sfTeam" },
  { id: "final", label: "Final", shortLabel: "Final", slotCount: 1, pointsKey: "finalTeam" }
];

const storagePrefix = "vm-tipping-2026:knockout";

export function createEmptyKnockoutPicks(): KnockoutPicks {
  return {
    rounds: knockoutRounds.reduce(
      (rounds, round) => ({
        ...rounds,
        [round.id]: Array.from({ length: round.slotCount }, () => "")
      }),
      {} as Record<KnockoutRoundId, string[]>
    ),
    champion: ""
  };
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

export function knockoutStorageKey(playerName: string): string {
  return `${storagePrefix}:${playerName}`;
}

export function readKnockoutPicks(storage: KnockoutStorage, playerName: string): KnockoutPicks {
  const emptyPicks = createEmptyKnockoutPicks();
  const raw = storage.getItem(knockoutStorageKey(playerName));

  if (!raw) {
    return emptyPicks;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<KnockoutPicks>;

    return {
      champion: typeof parsed.champion === "string" ? parsed.champion : "",
      rounds: knockoutRounds.reduce(
        (rounds, round) => {
          const savedRound = parsed.rounds?.[round.id];
          rounds[round.id] = Array.from({ length: round.slotCount }, (_, index) =>
            typeof savedRound?.[index] === "string" ? savedRound[index] : ""
          );
          return rounds;
        },
        {} as Record<KnockoutRoundId, string[]>
      )
    };
  } catch {
    return emptyPicks;
  }
}

export function writeKnockoutPicks(storage: KnockoutStorage, playerName: string, picks: KnockoutPicks): void {
  storage.setItem(knockoutStorageKey(playerName), JSON.stringify(picks));
}

// VMT-20: when a player renames themselves, migrate their localStorage key
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
