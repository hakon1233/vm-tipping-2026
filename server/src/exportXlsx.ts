import ExcelJS from "exceljs";

import type { AppStore, KnockoutRound } from "./store.js";

// VMT-28: export live app data as an .xlsx whose tabs/columns mirror the founder's
// workbook (reference/VMtipping2026.xlsx): Group Stage, Knockout, Leaderboard.
// A "Group Advancement" sheet is added for app-only data the workbook doesn't have.

// The founder's Group Stage tab lists each group's six games in this pairing order
// (1v2, 1v3, 1v4, 2v3, 2v4, 3v4). The app stores matches as G-1..G-6 in a different
// order, so map founder row -> app match id suffix.
const FOUNDER_GAME_ORDER = [1, 3, 5, 6, 4, 2] as const;

const KNOCKOUT_SECTIONS: { round: KnockoutRound; label: string; slots: number; scoringKey: string }[] = [
  { round: "r32", label: "ROUND OF 32", slots: 32, scoringKey: "r32Team" },
  { round: "r16", label: "ROUND OF 16", slots: 16, scoringKey: "r16Team" },
  { round: "qf", label: "QUARTER-FINALS", slots: 8, scoringKey: "qfTeam" },
  { round: "sf", label: "SEMI-FINALS", slots: 4, scoringKey: "sfTeam" },
  { round: "final", label: "FINAL", slots: 2, scoringKey: "finalTeam" }
];

export async function buildExportXlsx(store: AppStore): Promise<Uint8Array> {
  const players = store.listPlayers();
  const playerNames = players.map((player) => player.name);
  const scoring = store.getScoring() as Record<string, number>;
  const matches = store.listMatches();
  const groupPicksByPlayer = new Map(players.map((player) => [player.id, store.getGroupPicks(player.id)]));
  const knockoutPicksByPlayer = new Map(players.map((player) => [player.id, store.getKnockoutPicks(player.id)]));

  const workbook = new ExcelJS.Workbook();

  // --- Group Stage: Group | Game | Team 1 | Team 2 | Result | one column per player ---
  const groupSheet = workbook.addWorksheet("Group Stage");
  groupSheet.addRow(["Group", "Game", "Team 1", "Team 2", "Result", ...playerNames]);
  const groups = [...new Set(matches.map((match) => match.group))].sort();
  for (const group of groups) {
    FOUNDER_GAME_ORDER.forEach((suffix, gameIndex) => {
      const match = matches.find((candidate) => candidate.id === `${group}-${suffix}`);
      if (!match) return;
      groupSheet.addRow([
        group,
        gameIndex + 1,
        match.homeTeam,
        match.awayTeam,
        store.getResult(match.id)?.outcome ?? "",
        ...players.map((player) => groupPicksByPlayer.get(player.id)?.[match.id] ?? "")
      ]);
    });
  }

  // --- Knockout: per-round sections, actual teams in column A, player picks beside ---
  const knockoutSheet = workbook.addWorksheet("Knockout");
  for (const section of KNOCKOUT_SECTIONS) {
    knockoutSheet.addRow([`${section.label}  —  ${scoring[section.scoringKey]} points / team`]);
    knockoutSheet.addRow(["Actual (teams that advanced)", ...playerNames]);
    const actual = store.getActualKnockout(section.round);
    for (let slot = 0; slot < section.slots; slot += 1) {
      knockoutSheet.addRow([
        actual[slot] ?? "",
        ...players.map((player) => knockoutPicksByPlayer.get(player.id)?.[section.round]?.[slot] ?? "")
      ]);
    }
    knockoutSheet.addRow([]);
  }
  knockoutSheet.addRow([`CHAMPION  —  ${scoring.champion} points (pick the tournament winner)`]);
  knockoutSheet.addRow(["Actual winner", ...playerNames]);
  knockoutSheet.addRow([
    store.getActualChampion() ?? "",
    ...players.map((player) => knockoutPicksByPlayer.get(player.id)?.champion?.[0] ?? "")
  ]);

  // --- Group Advancement (app-only data, not in the founder's workbook) ---
  const advancementSheet = workbook.addWorksheet("Group Advancement");
  advancementSheet.addRow(["Group", "Position", "Actual", ...playerNames]);
  const actualAdvancement = store.getGroupAdvancement();
  const advancementByPlayer = new Map(players.map((player) => [player.id, store.getPlayerGroupAdvancement(player.id)]));
  for (const group of groups) {
    for (const position of ["first", "second"] as const) {
      advancementSheet.addRow([
        group,
        position === "first" ? "1st" : "2nd",
        actualAdvancement[group]?.[position] ?? "",
        ...players.map((player) => advancementByPlayer.get(player.id)?.[group]?.[position] ?? "")
      ]);
    }
  }

  // --- Leaderboard: points config block + standings table, founder column order ---
  const leaderboardSheet = workbook.addWorksheet("Leaderboard");
  leaderboardSheet.addRow(["WORLD CUP 2026 — LEADERBOARD"]);
  leaderboardSheet.addRow([]);
  leaderboardSheet.addRow(["Points per correct pick:"]);
  leaderboardSheet.addRow(["", "Group game", "R32 team", "R16 team", "QF team", "SF team", "Final team", "Champion"]);
  leaderboardSheet.addRow([
    "",
    scoring.groupGame,
    scoring.r32Team,
    scoring.r16Team,
    scoring.qfTeam,
    scoring.sfTeam,
    scoring.finalTeam,
    scoring.champion
  ]);
  leaderboardSheet.addRow([]);
  leaderboardSheet.addRow(["Player", "Group", "R32", "R16", "QF", "SF", "Final", "Champ", "KO total", "TOTAL", "Rank"]);
  for (const row of store.getLeaderboard()) {
    leaderboardSheet.addRow([
      row.playerName,
      row.groupPoints,
      row.r32Points,
      row.r16Points,
      row.qfPoints,
      row.sfPoints,
      row.finalPoints,
      row.championPoints,
      row.knockoutPoints,
      row.total,
      row.rank
    ]);
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
