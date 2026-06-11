import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createStore } from "../src/store.js";

function testApp(now = new Date("2026-01-01T12:00:00.000Z")) {
  return createApp({
    store: createStore({ databasePath: ":memory:" }),
    leaguePin: "league-pin",
    adminPin: "admin-pin",
    now: () => now
  });
}

async function login(app: ReturnType<typeof createApp>, name = "Player 1") {
  const response = await app.request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pin: "league-pin" })
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ session: { token: string } }>;
}

async function readWorkbook(response: Response) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

describe("GET /api/export.xlsx (VMT-28)", () => {
  it("returns an xlsx with the founder's tab layout", async () => {
    const app = testApp();
    const response = await app.request("/api/export.xlsx");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain("VMtipping2026-export.xlsx");

    const workbook = await readWorkbook(response);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Group Stage",
      "Knockout",
      "Group Advancement",
      "Leaderboard"
    ]);

    const groupSheet = workbook.getWorksheet("Group Stage")!;
    expect(groupSheet.getRow(1).values).toEqual([
      undefined,
      "Group",
      "Game",
      "Team 1",
      "Team 2",
      "Result",
      "Player 1",
      "Player 2",
      "Player 3",
      "Player 4",
      "Player 5",
      "Player 6",
      "Player 7",
      "Player 8"
    ]);
    // 72 games + header
    expect(groupSheet.actualRowCount).toBe(73);
    // Founder row order for group A: 1v2, 1v3, 1v4, 2v3, 2v4, 3v4
    expect(groupSheet.getRow(2).getCell(3).value).toBe("Mexico");
    expect(groupSheet.getRow(2).getCell(4).value).toBe("South Africa");
    expect(groupSheet.getRow(3).getCell(3).value).toBe("Mexico");
    expect(groupSheet.getRow(3).getCell(4).value).toBe("South Korea");
    expect(groupSheet.getRow(7).getCell(3).value).toBe("South Korea");
    expect(groupSheet.getRow(7).getCell(4).value).toBe("Czech Republic");
  });

  it("exports picks, results, knockout and leaderboard values matching the API", async () => {
    const app = testApp();
    const { session } = await login(app);

    // Player 1 picks "1" for A-1 (Mexico vs South Africa, founder row 1 of group A)
    const pickResponse = await app.request("/api/picks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify({ matchId: "A-1", pick: "1" })
    });
    expect(pickResponse.status).toBe(200);

    // Admin sets the matching result and an R32 actual
    await app.request("/api/admin/results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-pin": "admin-pin" },
      body: JSON.stringify({ matchId: "A-1", outcome: "1" })
    });
    await app.request("/api/picks", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ round: "r32", teamNames: ["Mexico", "Brazil"] })
    });
    await app.request("/api/admin/knockout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-pin": "admin-pin" },
      body: JSON.stringify({ round: "r32", teams: ["Mexico"] })
    });

    const workbook = await readWorkbook(await app.request("/api/export.xlsx"));

    const groupSheet = workbook.getWorksheet("Group Stage")!;
    // Row 2 = group A game 1 = match A-1; column 5 result, column 6 Player 1 pick
    expect(groupSheet.getRow(2).getCell(5).value).toBe("1");
    expect(groupSheet.getRow(2).getCell(6).value).toBe("1");

    const knockoutSheet = workbook.getWorksheet("Knockout")!;
    expect(knockoutSheet.getRow(1).getCell(1).value).toContain("ROUND OF 32");
    expect(knockoutSheet.getRow(2).getCell(1).value).toBe("Actual (teams that advanced)");
    expect(knockoutSheet.getRow(2).getCell(2).value).toBe("Player 1");
    expect(knockoutSheet.getRow(3).getCell(1).value).toBe("Mexico"); // actual
    expect(knockoutSheet.getRow(3).getCell(2).value).toBe("Mexico"); // Player 1 pick slot 1
    expect(knockoutSheet.getRow(4).getCell(2).value).toBe("Brazil"); // Player 1 pick slot 2

    // Leaderboard sheet matches the live /api/leaderboard values
    const apiLeaderboard = (await (await app.request("/api/leaderboard")).json()) as {
      leaderboard: { playerName: string; total: number; rank: number }[];
    };
    const leaderboardSheet = workbook.getWorksheet("Leaderboard")!;
    expect(leaderboardSheet.getRow(7).values).toEqual([
      undefined,
      "Player",
      "Group",
      "R32",
      "R16",
      "QF",
      "SF",
      "Final",
      "Champ",
      "KO total",
      "TOTAL",
      "Rank"
    ]);
    const firstRow = leaderboardSheet.getRow(8);
    expect(firstRow.getCell(1).value).toBe(apiLeaderboard.leaderboard[0].playerName);
    expect(firstRow.getCell(10).value).toBe(apiLeaderboard.leaderboard[0].total);
    expect(firstRow.getCell(11).value).toBe(apiLeaderboard.leaderboard[0].rank);
    // Player 1: 1 group point + 2 R32 points
    expect(apiLeaderboard.leaderboard[0].playerName).toBe("Player 1");
    expect(apiLeaderboard.leaderboard[0].total).toBe(3);
  });
});
