import { buildGroupMatches, type Outcome } from "@vm-tipping-2026/shared";

type SavePickInput = {
  playerName: string;
  matchId: string;
  pick: Outcome;
  now: Date;
};

export function createPickStore(kickoffs: Record<string, string> = {}) {
  const picks = new Map<string, Record<string, Outcome>>();
  const defaultKickoffs = Object.fromEntries(buildGroupMatches().map((match) => [match.id, match.kickoffAt]));

  return {
    savePick(input: SavePickInput) {
      const kickoffAt = kickoffs[input.matchId] ?? defaultKickoffs[input.matchId];
      if (!kickoffAt) {
        throw new Error("Unknown match");
      }
      if (input.now.getTime() > Date.parse(kickoffAt)) {
        throw new Error("Match is locked");
      }
      const playerPicks = picks.get(input.playerName) ?? {};
      playerPicks[input.matchId] = input.pick;
      picks.set(input.playerName, playerPicks);
    },
    getPicks(playerName: string) {
      return picks.get(playerName) ?? {};
    }
  };
}
