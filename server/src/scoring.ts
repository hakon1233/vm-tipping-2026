import type { GroupPickOutcome, KnockoutRound, LeaderboardRow, ScoringConfig } from "@vm-tipping-2026/shared";

export type PlayerPicks = {
  /** Match id → predicted outcome. */
  group: Record<string, GroupPickOutcome>;
  /** Group letter → predicted 1st and 2nd place. */
  advancement: Record<string, { first?: string; second?: string }>;
  /** Round → teams predicted to reach it; "champion" holds one team. */
  knockout: Partial<Record<KnockoutRound | "champion", string[]>>;
};

/** What really happened, as entered by the admin. */
export type Actuals = {
  results: Record<string, GroupPickOutcome>;
  advancement: Record<string, { first?: string; second?: string; third?: string }>;
  knockout: Record<KnockoutRound, string[]>;
  champion?: string;
};

export type Standing = LeaderboardRow & { name: string };

const KNOCKOUT_POINTS = {
  r32: "r32Team",
  r16: "r16Team",
  qf: "qfTeam",
  sf: "sfTeam",
  final: "finalTeam"
} as const satisfies Record<KnockoutRound, keyof ScoringConfig>;

/**
 * Scores every player against the actuals and ranks them: highest total first,
 * equal totals share a rank (1, 2, 2, 4) and are listed by name. A team picked
 * twice in one round scores once. groupPoints includes group advancement points.
 */
export function rankPlayers(
  players: { id: string; name: string; picks: PlayerPicks }[],
  actuals: Actuals,
  scoring: ScoringConfig
): Standing[] {
  const rows = players.map(({ id, name, picks }) => {
    const knockout = scoreKnockout(picks, actuals, scoring);
    const knockoutPoints = Object.values(knockout).reduce((sum, points) => sum + points, 0);
    const groupPoints = scoreGroupGames(picks, actuals, scoring) + scoreAdvancement(picks, actuals, scoring);
    return {
      playerId: id,
      playerName: name,
      name,
      groupPoints,
      ...knockout,
      knockoutPoints,
      total: groupPoints + knockoutPoints,
      rank: 0
    };
  });

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    row.rank = previous && previous.total === row.total ? previous.rank : index + 1;
  });
  return rows;
}

function scoreGroupGames(picks: PlayerPicks, actuals: Actuals, scoring: ScoringConfig): number {
  const correct = Object.entries(picks.group).filter(([matchId, outcome]) => actuals.results[matchId] === outcome);
  return correct.length * scoring.groupGame;
}

function scoreAdvancement(picks: PlayerPicks, actuals: Actuals, scoring: ScoringConfig): number {
  let points = 0;
  for (const [group, picked] of Object.entries(picks.advancement)) {
    const actual = actuals.advancement[group];
    if (!actual) continue;
    if (picked.first && picked.first === actual.first) points += scoring.groupFirst;
    if (picked.second && picked.second === actual.second) points += scoring.groupSecond;
  }
  return points;
}

function scoreKnockout(picks: PlayerPicks, actuals: Actuals, scoring: ScoringConfig) {
  const pointsFor = (round: KnockoutRound) => {
    const reached = new Set(actuals.knockout[round]);
    const correct = [...new Set(picks.knockout[round] ?? [])].filter((team) => reached.has(team));
    return correct.length * scoring[KNOCKOUT_POINTS[round]];
  };
  const champion = actuals.champion;
  return {
    r32Points: pointsFor("r32"),
    r16Points: pointsFor("r16"),
    qfPoints: pointsFor("qf"),
    sfPoints: pointsFor("sf"),
    finalPoints: pointsFor("final"),
    championPoints: champion && picks.knockout.champion?.includes(champion) ? scoring.champion : 0
  };
}
