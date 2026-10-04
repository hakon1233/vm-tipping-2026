import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeSession, stubFetch } from "../test/fakeFetch";
import { LeaderboardPage } from "./LeaderboardPage";

const row = (playerId: string, playerName: string, rank: number, total: number) => ({
  playerId,
  playerName,
  rank,
  total,
  groupPoints: total,
  r32Points: 0,
  r16Points: 0,
  qfPoints: 0,
  sfPoints: 0,
  finalPoints: 0,
  championPoints: 0,
  knockoutPoints: 0
});

describe("LeaderboardPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    stubFetch((request) =>
      request.path === "/api/leaderboard"
        ? { json: { leaderboard: [row("p1", "Alice", 1, 12), row("p2", "Bob", 2, 9), row("p4", "Dina", 4, 3)] } }
        : { json: {} }
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows each player with their rank and total", async () => {
    render(<LeaderboardPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByLabelText("Rank 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Rank 2")).toBeInTheDocument();
    expect(screen.getByText("#4")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((tableRow) => tableRow.textContent)).toEqual(["🥇Alice1212", "🥈Bob99", "#4Dina33"]);
  });

  it("offers the Excel export to a logged-in player", async () => {
    storeSession();
    render(<LeaderboardPage />);

    expect(await screen.findByRole("button", { name: /excel/i })).toBeInTheDocument();
  });

  it("hides the Excel export without a session", async () => {
    render(<LeaderboardPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excel/i })).not.toBeInTheDocument();
  });

  it("says so when the leaderboard cannot be loaded", async () => {
    stubFetch(() => ({ status: 500, json: { error: "boom" } }));
    render(<LeaderboardPage />);

    expect(await screen.findByText("Leaderboard could not be loaded.")).toBeInTheDocument();
  });
});
