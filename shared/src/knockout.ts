import type { ScoringConfig } from "./types.js";

export type KnockoutRoundId = "r32" | "r16" | "qf" | "sf" | "final";

export type KnockoutRound = {
  id: KnockoutRoundId;
  /** One match or slot of the round: "Quarter-final". */
  label: string;
  /** The round as a whole: "Quarter-finals". */
  title: string;
  shortLabel: string;
  /** Matches in the round, which is also how many winners a player picks for it. */
  matchCount: number;
  pointsKey: keyof ScoringConfig;
};

/** The knockout rounds in playing order. The champion is picked separately. */
export const knockoutRounds: readonly KnockoutRound[] = [
  { id: "r32", label: "Round of 32", title: "Round of 32", shortLabel: "R32", matchCount: 16, pointsKey: "r32Team" },
  { id: "r16", label: "Round of 16", title: "Round of 16", shortLabel: "R16", matchCount: 8, pointsKey: "r16Team" },
  { id: "qf", label: "Quarter-final", title: "Quarter-finals", shortLabel: "QF", matchCount: 4, pointsKey: "qfTeam" },
  { id: "sf", label: "Semi-final", title: "Semi-finals", shortLabel: "SF", matchCount: 2, pointsKey: "sfTeam" },
  { id: "final", label: "Final", title: "Final", shortLabel: "Final", matchCount: 1, pointsKey: "finalTeam" }
];

export const knockoutRoundIds: readonly KnockoutRoundId[] = knockoutRounds.map((round) => round.id);

export function isKnockoutRoundId(value: unknown): value is KnockoutRoundId {
  return knockoutRoundIds.includes(value as KnockoutRoundId);
}
