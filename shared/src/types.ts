export type GroupLetter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L";

export type GroupPickOutcome = "1" | "X" | "2";
export type KnockoutRound = "r32" | "r16" | "qf" | "sf" | "final";

export type Player = {
  id: string;
  name: string;
};

export type Team = {
  id: string;
  name: string;
  group: GroupLetter;
};

export type Match = {
  id: string;
  round: "group";
  group: GroupLetter;
  groupName: GroupLetter;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  result?: GroupPickOutcome | null;
  locked?: boolean;
};

export type GroupPick = {
  playerId: string;
  matchId: string;
  outcome: GroupPickOutcome;
};

export type ScoringConfig = {
  groupGame: number;
  r32Team: number;
  r16Team: number;
  qfTeam: number;
  sfTeam: number;
  finalTeam: number;
  champion: number;
};

export type LeaderboardRow = {
  playerId: string;
  playerName: string;
  groupPoints: number;
  r32Points: number;
  r16Points: number;
  qfPoints: number;
  sfPoints: number;
  finalPoints: number;
  championPoints: number;
  knockoutPoints: number;
  total: number;
  rank: number;
};
