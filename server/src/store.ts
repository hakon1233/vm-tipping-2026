import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import seed from "../../data/seed.json" with { type: "json" };
import { buildGroupMatches, type GroupMatch, type Outcome } from "@vm-tipping-2026/shared";

export type KnockoutRound = "r32" | "r16" | "qf" | "sf" | "final";
export type Scoring = typeof seed.scoring;
type Player = { id: string; name: string };
type Team = { id: string; name: string; group: string };

type StoreOptions = {
  databasePath: string;
};

export function createStore(options: StoreOptions) {
  if (options.databasePath !== ":memory:") {
    mkdirSync(dirname(options.databasePath), { recursive: true });
  }
  const db = new DatabaseSync(options.databasePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, group_name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      round TEXT NOT NULL DEFAULT 'group',
      group_name TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      kickoff_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_picks (
      player_id TEXT NOT NULL,
      match_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      PRIMARY KEY (player_id, match_id)
    );
    CREATE TABLE IF NOT EXISTS knockout_picks (
      player_id TEXT NOT NULL,
      round TEXT NOT NULL,
      team TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (player_id, round, team)
    );
    CREATE TABLE IF NOT EXISTS results (match_id TEXT PRIMARY KEY, outcome TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS knockout_actuals (
      round TEXT NOT NULL,
      team TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (round, team)
    );
    CREATE TABLE IF NOT EXISTS champion_actual (id INTEGER PRIMARY KEY CHECK (id = 1), team TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scoring (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS group_advancement (
      group_name TEXT NOT NULL,
      position INTEGER NOT NULL,
      team TEXT NOT NULL,
      PRIMARY KEY (group_name, position)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
    );
    CREATE TABLE IF NOT EXISTS player_group_advancement (
      player_id TEXT NOT NULL,
      group_name TEXT NOT NULL,
      position INTEGER NOT NULL,
      team TEXT NOT NULL,
      PRIMARY KEY (player_id, group_name, position)
    );
  `);
  try {
    db.exec("ALTER TABLE matches ADD COLUMN round TEXT NOT NULL DEFAULT 'group'");
  } catch {
    // Existing databases created after this migration already have the column.
  }

  seedDatabase();

  // Migrate all group match kickoff times to the real deadline so picks lock correctly.
  db.prepare("UPDATE matches SET kickoff_at = ? WHERE round = 'group'").run(seed.groupStageDeadline);

  function seedDatabase() {
    const playerInsert = db.prepare("INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)");
    seed.players.forEach((name, index) => playerInsert.run(`player-${index + 1}`, name));

    const teamInsert = db.prepare("INSERT OR IGNORE INTO teams (id, name, group_name) VALUES (?, ?, ?)");
    Object.entries(seed.groups).forEach(([group, teams]) => {
      teams.forEach((name) => teamInsert.run(slug(name), name, group));
    });

    const matchInsert = db.prepare(
      "INSERT OR IGNORE INTO matches (id, round, group_name, home_team, away_team, kickoff_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    buildGroupMatches().forEach((match) => {
      matchInsert.run(match.id, match.round, match.group, match.homeTeam, match.awayTeam, match.kickoffAt);
    });

    const scoreInsert = db.prepare("INSERT OR IGNORE INTO scoring (key, value) VALUES (?, ?)");
    Object.entries(seed.scoring).forEach(([key, value]) => scoreInsert.run(key, value));
  }

  function getScoring(): Scoring {
    const rows = db.prepare("SELECT key, value FROM scoring").all() as { key: keyof Scoring; value: number }[];
    return { ...seed.scoring, ...Object.fromEntries(rows.map((row) => [row.key, row.value])) } as Scoring;
  }

  const store = {
    close: () => db.close(),
    listPlayers: () => db.prepare("SELECT id, name FROM players ORDER BY id").all() as Player[],
    getPlayerByName: (name: string) => db.prepare("SELECT id, name FROM players WHERE name = ?").get(name) as Player | undefined,
    getPlayerById: (id: string) => db.prepare("SELECT id, name FROM players WHERE id = ?").get(id) as Player | undefined,
    updatePlayerName: (playerId: string, newName: string) => {
      const conflict = db.prepare("SELECT id FROM players WHERE name = ? AND id != ?").get(newName, playerId);
      if (conflict) throw new Error("Name already taken");
      db.prepare("UPDATE players SET name = ? WHERE id = ?").run(newName, playerId);
    },
    listTeams: () => db.prepare("SELECT id, name, group_name AS 'group' FROM teams ORDER BY group_name, name").all() as Team[],
    listMatches: () =>
      db
        .prepare(
          `SELECT
            m.id,
            m.round,
            m.group_name AS 'group',
            m.home_team AS homeTeam,
            m.away_team AS awayTeam,
            m.kickoff_at AS kickoffAt,
            r.outcome AS result
           FROM matches m
           LEFT JOIN results r ON r.match_id = m.id
           ORDER BY m.id`
        )
        .all() as unknown as (GroupMatch & { result: Outcome | null })[],
    getMatch: (id: string) =>
      db
        .prepare(
          "SELECT id, round, group_name AS 'group', home_team AS homeTeam, away_team AS awayTeam, kickoff_at AS kickoffAt FROM matches WHERE id = ?"
        )
        .get(id) as GroupMatch | undefined,
    getResult: (matchId: string) =>
      db.prepare("SELECT match_id AS matchId, outcome FROM results WHERE match_id = ?").get(matchId) as
        | { matchId: string; outcome: Outcome }
        | undefined,
    saveGroupPick: ({ playerId, matchId, outcome }: { playerId: string; matchId: string; outcome: Outcome }) => {
      db.prepare(
        "INSERT INTO group_picks (player_id, match_id, outcome) VALUES (?, ?, ?) ON CONFLICT(player_id, match_id) DO UPDATE SET outcome = excluded.outcome"
      ).run(playerId, matchId, outcome);
    },
    getGroupPicks: (playerId: string) => {
      const rows = db.prepare("SELECT match_id AS matchId, outcome FROM group_picks WHERE player_id = ?").all(playerId) as {
        matchId: string;
        outcome: Outcome;
      }[];
      return Object.fromEntries(rows.map((row) => [row.matchId, row.outcome])) as Record<string, Outcome>;
    },
    hasTeam: (team: string) => Boolean(db.prepare("SELECT id FROM teams WHERE name = ?").get(team)),
    saveKnockoutPick: ({ playerId, round, teams }: { playerId: string; round: KnockoutRound | "champion"; teams: string[] }) => {
      db.prepare("DELETE FROM knockout_picks WHERE player_id = ? AND round = ?").run(playerId, round);
      const insert = db.prepare("INSERT INTO knockout_picks (player_id, round, team, position) VALUES (?, ?, ?, ?)");
      [...new Set(teams)].forEach((team, index) => insert.run(playerId, round, team, index));
    },
    getKnockoutPicks: (playerId: string) => {
      const rows = db.prepare("SELECT round, team FROM knockout_picks WHERE player_id = ? ORDER BY round, position").all(playerId) as {
        round: KnockoutRound | "champion";
        team: string;
      }[];
      return rows.reduce<Record<string, string[]>>((acc, row) => {
        acc[row.round] = [...(acc[row.round] ?? []), row.team];
        return acc;
      }, {});
    },
    saveResult: ({ matchId, outcome }: { matchId: string; outcome: Outcome }) => {
      db.prepare(
        "INSERT INTO results (match_id, outcome) VALUES (?, ?) ON CONFLICT(match_id) DO UPDATE SET outcome = excluded.outcome"
      ).run(matchId, outcome);
    },
    saveActualKnockout: (round: KnockoutRound, teams: string[]) => {
      db.prepare("DELETE FROM knockout_actuals WHERE round = ?").run(round);
      const insert = db.prepare("INSERT INTO knockout_actuals (round, team, position) VALUES (?, ?, ?)");
      [...new Set(teams)].forEach((team, index) => insert.run(round, team, index));
    },
    getActualKnockout: (round: KnockoutRound) =>
      (
        db.prepare("SELECT team FROM knockout_actuals WHERE round = ? ORDER BY position").all(round) as {
          team: string;
        }[]
      ).map((row) => row.team),
    saveActualChampion: (team: string) => {
      db.prepare(
        "INSERT INTO champion_actual (id, team) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET team = excluded.team"
      ).run(team);
    },
    clearActualChampion: () => {
      db.prepare("DELETE FROM champion_actual WHERE id = 1").run();
    },
    getActualChampion: () =>
      (db.prepare("SELECT team FROM champion_actual WHERE id = 1").get() as { team: string } | undefined)?.team,
    saveGroupAdvancement: (group: string, position: 1 | 2 | 3, team: string) => {
      if (!team) {
        db.prepare("DELETE FROM group_advancement WHERE group_name = ? AND position = ?").run(group.toUpperCase(), position);
        return;
      }
      // VMT-17: a team can only hold one position per group. VMT-29: instead of
      // rejecting the write (which made it impossible for the admin to swap
      // 1st/2nd when entering real results), clear the conflicting position so
      // the edit always lands and the invariant still holds.
      db.prepare(
        "DELETE FROM group_advancement WHERE group_name = ? AND team = ? AND position != ?"
      ).run(group.toUpperCase(), team, position);
      // VMT-18: cap third-place qualifiers at 8
      if (position === 3) {
        const existing = db.prepare(
          "SELECT team FROM group_advancement WHERE group_name = ? AND position = 3"
        ).get(group.toUpperCase()) as { team: string } | undefined;
        if (!existing) {
          const count = (db.prepare("SELECT COUNT(*) as c FROM group_advancement WHERE position = 3").get() as { c: number }).c;
          if (count >= 8) throw new Error("Maximum 8 third-place qualifiers already set");
        }
      }
      db.prepare(
        "INSERT INTO group_advancement (group_name, position, team) VALUES (?, ?, ?) ON CONFLICT(group_name, position) DO UPDATE SET team = excluded.team"
      ).run(group.toUpperCase(), position, team);
    },
    getGroupAdvancement: () => {
      const rows = db.prepare(
        "SELECT group_name, position, team FROM group_advancement ORDER BY group_name, position"
      ).all() as { group_name: string; position: number; team: string }[];
      return rows.reduce<Record<string, { first?: string; second?: string; third?: string }>>((acc, row) => {
        if (!acc[row.group_name]) acc[row.group_name] = {};
        if (row.position === 1) acc[row.group_name].first = row.team;
        if (row.position === 2) acc[row.group_name].second = row.team;
        if (row.position === 3) acc[row.group_name].third = row.team;
        return acc;
      }, {});
    },
    saveScoring: (scoring: Partial<Scoring>) => {
      const insert = db.prepare(
        "INSERT INTO scoring (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      );
      Object.entries(scoring).forEach(([key, value]) => {
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) insert.run(key, value);
      });
    },
    getScoring,
    // VMT-21: SQLite-backed sessions so logins survive server restarts
    createSession: (token: string, playerId: string) => {
      db.prepare("INSERT OR REPLACE INTO sessions (token, player_id) VALUES (?, ?)").run(token, playerId);
    },
    getSession: (token: string): string | undefined => {
      const row = db.prepare("SELECT player_id FROM sessions WHERE token = ?").get(token) as
        | { player_id: string }
        | undefined;
      return row?.player_id;
    },
    deleteSession: (token: string) => {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    },
    savePlayerGroupAdvancement: ({ playerId, group, position, team }: { playerId: string; group: string; position: 1 | 2; team: string }) => {
      if (!team) {
        db.prepare("DELETE FROM player_group_advancement WHERE player_id = ? AND group_name = ? AND position = ?").run(playerId, group.toUpperCase(), position);
        return;
      }
      db.prepare(
        "INSERT INTO player_group_advancement (player_id, group_name, position, team) VALUES (?, ?, ?, ?) ON CONFLICT(player_id, group_name, position) DO UPDATE SET team = excluded.team"
      ).run(playerId, group.toUpperCase(), position, team);
    },
    getPlayerGroupAdvancement: (playerId: string): Record<string, { first?: string; second?: string }> => {
      const rows = db.prepare(
        "SELECT group_name, position, team FROM player_group_advancement WHERE player_id = ? ORDER BY group_name, position"
      ).all(playerId) as { group_name: string; position: number; team: string }[];
      return rows.reduce<Record<string, { first?: string; second?: string }>>((acc, row) => {
        if (!acc[row.group_name]) acc[row.group_name] = {};
        if (row.position === 1) acc[row.group_name].first = row.team;
        if (row.position === 2) acc[row.group_name].second = row.team;
        return acc;
      }, {});
    },
    getLeaderboard: () => {
      const scoring = getScoring();
      const players = db.prepare("SELECT id, name FROM players ORDER BY id").all() as Player[];
      const rows = players.map((player) => {
        const correct = db
          .prepare(
            `SELECT COUNT(*) AS total
             FROM group_picks gp
             JOIN results r ON r.match_id = gp.match_id AND r.outcome = gp.outcome
             WHERE gp.player_id = ?`
          )
          .get(player.id) as { total: number };
        const groupPoints = correct.total * scoring.groupGame;
        const groupAdvPoints = scoreGroupAdvancement(player.id, scoring);
        const knockout = scoreKnockout(player.id, scoring);
        return {
          playerId: player.id,
          playerName: player.name,
          name: player.name,
          groupPoints: groupPoints + groupAdvPoints,
          ...knockout,
          knockoutPoints: knockout.r32Points + knockout.r16Points + knockout.qfPoints + knockout.sfPoints + knockout.finalPoints + knockout.championPoints,
          total:
            groupPoints +
            groupAdvPoints +
            knockout.r32Points +
            knockout.r16Points +
            knockout.qfPoints +
            knockout.sfPoints +
            knockout.finalPoints +
            knockout.championPoints,
          rank: 0
        };
      });
      rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      let previousTotal: number | undefined;
      let previousRank = 0;
      rows.forEach((row, index) => {
        row.rank = row.total === previousTotal ? previousRank : index + 1;
        previousTotal = row.total;
        previousRank = row.rank;
      });
      return rows;
    }
  };

  function scoreGroupAdvancement(playerId: string, scoring: Scoring): number {
    const picks = store.getPlayerGroupAdvancement(playerId);
    const actual = store.getGroupAdvancement();
    let points = 0;
    for (const [group, groupPicks] of Object.entries(picks)) {
      const actualGroup = actual[group];
      if (!actualGroup) continue;
      if (groupPicks.first && groupPicks.first === actualGroup.first) points += scoring.groupFirst ?? 0;
      if (groupPicks.second && groupPicks.second === actualGroup.second) points += scoring.groupSecond ?? 0;
    }
    return points;
  }

  function scoreKnockout(playerId: string, scoring: Scoring) {
    const pointMap = {
      r32: scoring.r32Team,
      r16: scoring.r16Team,
      qf: scoring.qfTeam,
      sf: scoring.sfTeam,
      final: scoring.finalTeam
    };
    const roundPoints = {
      r32Points: 0,
      r16Points: 0,
      qfPoints: 0,
      sfPoints: 0,
      finalPoints: 0,
      championPoints: 0
    };
    (["r32", "r16", "qf", "sf", "final"] as const).forEach((round) => {
      const actual = new Set(store.getActualKnockout(round));
      const picks = new Set((store.getKnockoutPicks(playerId)[round] ?? []) as string[]);
      const correct = [...picks].filter((team) => actual.has(team)).length;
      roundPoints[`${round}Points` as keyof typeof roundPoints] = correct * pointMap[round];
    });
    const champion = store.getActualChampion();
    const championPicks = new Set(store.getKnockoutPicks(playerId).champion ?? []);
    roundPoints.championPoints = champion && championPicks.has(champion) ? scoring.champion : 0;
    return roundPoints;
  }

  return store;
}

export type AppStore = ReturnType<typeof createStore>;

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
