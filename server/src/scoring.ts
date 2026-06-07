import type Database from "better-sqlite3";

import { loadSeed, teamRounds } from "./db.js";

type PlayerRow = { id: number; name: string };
type GroupScoreRow = { player_id: number; points: number | null };
type TeamScoreRow = { player_id: number; round: string; points: number };

const scoreKeys = {
  r32: "r32Team",
  r16: "r16Team",
  qf: "qfTeam",
  sf: "sfTeam",
  final: "finalTeam",
} as const;

export function computeLeaderboard(db: Database.Database) {
  const seed = loadSeed();
  const players = db.prepare("SELECT id, name FROM players ORDER BY id").all() as PlayerRow[];

  const groupRows = db
    .prepare(`
      SELECT gp.player_id, COUNT(*) AS points
      FROM group_picks gp
      JOIN matches m ON m.id = gp.match_id
      WHERE m.result IS NOT NULL AND gp.pick = m.result
      GROUP BY gp.player_id
    `)
    .all() as GroupScoreRow[];

  const teamRows = db
    .prepare(`
      SELECT kp.player_id, kp.round, COUNT(*) AS points
      FROM knockout_picks kp
      JOIN knockout_results kr ON kr.round = kp.round AND kr.team_name = kp.team_name
      WHERE kp.round != 'champion'
      GROUP BY kp.player_id, kp.round
    `)
    .all() as TeamScoreRow[];

  const championRows = db
    .prepare(`
      SELECT kp.player_id, COUNT(*) AS points
      FROM knockout_picks kp
      JOIN knockout_results kr ON kr.round = 'champion' AND kr.team_name = kp.team_name
      WHERE kp.round = 'champion'
      GROUP BY kp.player_id
    `)
    .all() as GroupScoreRow[];

  const groupByPlayer = new Map(groupRows.map((row) => [row.player_id, row.points ?? 0]));
  const championByPlayer = new Map(championRows.map((row) => [row.player_id, row.points ?? 0]));
  const teamsByPlayer = new Map<number, Record<string, number>>();

  for (const row of teamRows) {
    const current = teamsByPlayer.get(row.player_id) ?? {};
    current[row.round] = row.points;
    teamsByPlayer.set(row.player_id, current);
  }

  const leaderboard = players.map((player) => {
    const groupPoints = groupByPlayer.get(player.id) ?? 0;
    const teamPoints = teamsByPlayer.get(player.id) ?? {};
    const roundScores = Object.fromEntries(
      teamRounds.map((round) => {
        const roundId = round.id as keyof typeof scoreKeys;
        return [`${round.id}Points`, (teamPoints[round.id] ?? 0) * seed.scoring[scoreKeys[roundId]]];
      }),
    );
    const championPoints = (championByPlayer.get(player.id) ?? 0) * seed.scoring.champion;
    const knockoutTotal =
      Object.values(roundScores).reduce((sum, points) => sum + Number(points), 0) + championPoints;
    const total = groupPoints * seed.scoring.groupGame + knockoutTotal;

    return {
      playerId: player.id,
      playerName: player.name,
      groupPoints: groupPoints * seed.scoring.groupGame,
      ...roundScores,
      championPoints,
      knockoutTotal,
      total,
      rank: 0,
    };
  });

  leaderboard.sort((a, b) => b.total - a.total || a.playerName.localeCompare(b.playerName));

  let previousTotal: number | null = null;
  let previousRank = 0;
  return leaderboard.map((entry, index) => {
    const rank = entry.total === previousTotal ? previousRank : index + 1;
    previousTotal = entry.total;
    previousRank = rank;
    return { ...entry, rank };
  });
}
