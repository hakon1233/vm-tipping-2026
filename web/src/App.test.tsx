import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { type SentRequest, storeSession, stubFetch } from "./test/fakeFetch";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("Knockout page", () => {
  let sent: SentRequest[];

  beforeEach(() => {
    window.history.pushState({}, "", "/");
    window.localStorage.clear();
    storeSession();
    // A small picks server: knockout picks POSTed are served back on GET.
    const knockout: Record<string, string[]> = {};
    sent = stubFetch((request) => {
      if (request.path === "/api/matches") {
        // The tournament deadlines are in the past; the server's switch keeps picks editable.
        return { json: { matches: [], players: [], advancement: {}, deadlinesDisabled: true } };
      }
      if (request.path === "/api/picks" && request.method === "POST") {
        const body = request.body as { round?: string; teamName?: string; teamNames?: string[] };
        if (body.round) knockout[body.round] = body.teamName ? [body.teamName] : (body.teamNames ?? []);
        return { json: { ok: true } };
      }
      if (request.path.startsWith("/api/picks/")) return { json: { group: {}, knockout, groupAdvancement: {} } };
      return { json: {} };
    });
  });

  it("renders all knockout rounds and a champion selector", async () => {
    render(<App />);

    // App gates first render on an async config load (config.json), so await the heading.
    expect(await screen.findByRole("heading", { name: /knockout picks/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/champion/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^m\d+ winner$/)).toHaveLength(16);
    expect(screen.getAllByLabelText(/Round of 16 match/i)).toHaveLength(8);
    expect(screen.getAllByLabelText(/Quarter-final match/i)).toHaveLength(4);
    expect(screen.getAllByLabelText(/Semi-final match/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/^Final match/i)).toHaveLength(1);
  });

  it("auto-saves and restores the champion pick", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    const champion = await screen.findByLabelText(/champion/i);
    // Picks unlock once /api/matches reports deadlinesDisabled.
    await waitFor(() => expect(champion).toBeEnabled());
    await user.selectOptions(champion, "Norway");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(sent.filter((request) => request.method === "POST").map((request) => request.body)).toContainEqual({
      round: "champion",
      teamName: "Norway"
    });
    unmount();
    // The server is authoritative: drop the local cache and restore from it.
    window.localStorage.removeItem("vm-tipping-2026:knockout:Alice");
    render(<App />);

    const restored = await screen.findByLabelText(/champion/i);
    await waitFor(() => expect(restored).toHaveValue("Norway"));
  });

  it("flags duplicate picks in the same round with scores-once text", async () => {
    const user = userEvent.setup();
    render(<App />);
    const r32 = await screen.findByTestId("round-r32");
    await waitFor(() => expect(within(r32).getByLabelText("m77 winner")).toBeEnabled());
    // m77 (1I v 3rd) and m78 (2E v 2I) can both be won by a group I team.
    await user.selectOptions(within(r32).getByLabelText("m77 winner"), "Norway");
    await user.selectOptions(within(r32).getByLabelText("m78 winner"), "Norway");

    expect(within(r32).getAllByText(/scores once/i)).toHaveLength(2);
  });
});

describe("Routing", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ matches: [], leaderboard: [] }) }))
    );
  });

  it("asks for a login before showing the leaderboard", async () => {
    window.history.pushState({}, "", "/#/leaderboard");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Player login" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Leaderboard" })).not.toBeInTheDocument();
  });

  it("shows the leaderboard to a logged-in player", async () => {
    window.localStorage.setItem(
      "vm-tipping-session",
      JSON.stringify({ token: "test-token", playerId: "player-1", playerName: "Alice" })
    );
    window.history.pushState({}, "", "/#/leaderboard");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Leaderboard" })).toBeInTheDocument();
  });
});
