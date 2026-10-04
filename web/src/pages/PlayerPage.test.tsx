import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Reply, type SentRequest, storeSession, stubFetch } from "../test/fakeFetch";
import { PlayerPage } from "./PlayerPage";

const players = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" }
];

function servePlayer(overrides: (request: SentRequest) => Reply | undefined = () => undefined) {
  return stubFetch((request) => {
    const override = overrides(request);
    if (override) return override;
    if (request.path === "/api/matches") {
      return { json: { matches: [], players, advancement: {}, deadlinesDisabled: false } };
    }
    if (request.path === "/api/login") {
      return { json: { player: { id: "p2", name: "Bob" }, session: { token: "bob-token", playerId: "p2" } } };
    }
    if (request.path.startsWith("/api/picks/")) return { json: { group: {}, knockout: {}, groupAdvancement: {} } };
    return { json: {} };
  });
}

describe("PlayerPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("logging in stores the session and opens the picks page", async () => {
    const sent = servePlayer();
    const user = userEvent.setup();
    render(<PlayerPage />);

    await user.selectOptions(await screen.findByRole("combobox", { name: "Player" }), "Bob");
    await user.type(screen.getByLabelText("League PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Open picks" }));

    expect(await screen.findByRole("heading", { name: "Group-stage picks" })).toBeInTheDocument();
    expect(sent.find((request) => request.path === "/api/login")?.body).toEqual({ name: "Bob", pin: "1234" });
    expect(JSON.parse(window.localStorage.getItem("vm-tipping-session") ?? "null")).toEqual({
      token: "bob-token",
      playerId: "p2",
      playerName: "Bob"
    });
  });

  it("says the name or PIN was not accepted when login is refused", async () => {
    servePlayer((request) => (request.path === "/api/login" ? { status: 401, json: { error: "Invalid PIN" } } : undefined));
    const user = userEvent.setup();
    render(<PlayerPage />);

    await user.type(await screen.findByLabelText("League PIN"), "0000");
    await user.click(screen.getByRole("button", { name: "Open picks" }));

    expect(await screen.findByText("Name or league PIN was not accepted.")).toBeInTheDocument();
    expect(window.localStorage.getItem("vm-tipping-session")).toBeNull();
  });

  it("tells a player to wait when the server has paused logins after too many wrong PINs", async () => {
    servePlayer((request) =>
      request.path === "/api/login" ? { status: 429, json: { error: "Too many attempts, try again later" } } : undefined
    );
    const user = userEvent.setup();
    render(<PlayerPage />);

    await user.type(await screen.findByLabelText("League PIN"), "0000");
    await user.click(screen.getByRole("button", { name: "Open picks" }));

    expect(await screen.findByText("Too many wrong PINs. Wait a few minutes, then try again.")).toBeInTheDocument();
  });

  it("sends a player with an expired session back to login", async () => {
    storeSession();
    servePlayer((request) => (request.path === "/api/picks/p1" ? { status: 401, json: { error: "Login required" } } : undefined));
    render(<PlayerPage />);

    expect(await screen.findByRole("heading", { name: "Player login" })).toBeInTheDocument();
    expect(window.localStorage.getItem("vm-tipping-session")).toBeNull();
  });

  it("shows a schedule error instead of crashing when the match list fails", async () => {
    storeSession();
    servePlayer((request) => (request.path === "/api/matches" ? { status: 500, json: { error: "Database locked" } } : undefined));
    render(<PlayerPage />);

    expect(await screen.findByText("Match schedule could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Group-stage picks" })).toBeInTheDocument();
  });

  it("renaming updates the stored session and moves the local knockout picks", async () => {
    storeSession();
    const sent = servePlayer();
    const user = userEvent.setup();
    render(<PlayerPage />);

    await user.click(await screen.findByRole("button", { name: "Edit name" }));
    const nameInput = screen.getByPlaceholderText("Your name");
    await user.clear(nameInput);
    await user.type(nameInput, "Alicia");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Alicia")).toBeInTheDocument();
    const rename = sent.find((request) => request.path === "/api/player/name");
    expect(rename?.method).toBe("PATCH");
    expect(rename?.body).toEqual({ name: "Alicia" });
    expect(JSON.parse(window.localStorage.getItem("vm-tipping-session") ?? "null")).toEqual({
      token: "test-token",
      playerId: "p1",
      playerName: "Alicia"
    });
    expect(window.localStorage.getItem("vm-tipping-2026:knockout:Alice")).toBeNull();
    expect(window.localStorage.getItem("vm-tipping-2026:knockout:Alicia")).not.toBeNull();
  });

  describe("group picks", () => {
    const matches = [
      { id: "A-1", round: "group", group: "A", homeTeam: "Mexico", awayTeam: "South Africa", kickoffAt: "2026-06-11T19:00:00.000Z", result: null },
      { id: "A-2", round: "group", group: "A", homeTeam: "South Korea", awayTeam: "Czech Republic", kickoffAt: "2026-06-11T19:00:00.000Z", result: null }
    ];

    function serveMatches(onPick: (request: SentRequest) => Reply = () => ({ json: { ok: true } })) {
      storeSession({ token: "alice-token", playerId: "p1", playerName: "Alice" });
      return servePlayer((request) => {
        if (request.path === "/api/matches") return { json: { matches, players, advancement: {}, deadlinesDisabled: true } };
        if (request.path === "/api/picks" && request.method === "POST") return onPick(request);
        return undefined;
      });
    }

    const pickPosts = (sent: SentRequest[]) =>
      sent.filter((request) => request.path === "/api/picks" && request.method === "POST").map((request) => request.body);

    async function pick(user: ReturnType<typeof userEvent.setup>, match: string, outcome: string) {
      const buttons = await screen.findByRole("group", { name: match });
      await user.click(within(buttons).getByRole("button", { name: outcome }));
    }

    it("saves a pick and shows that it was saved", async () => {
      const sent = serveMatches();
      const user = userEvent.setup();
      render(<PlayerPage />);

      await pick(user, "Mexico against South Africa", "1");

      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(pickPosts(sent)).toEqual([{ matchId: "A-1", pick: "1" }]);
    });

    it("saves quick picks on two matches separately, and only the last pick for one match", async () => {
      const sent = serveMatches();
      const user = userEvent.setup();
      render(<PlayerPage />);

      await pick(user, "Mexico against South Africa", "1");
      await pick(user, "Mexico against South Africa", "2");
      await pick(user, "South Korea against Czech Republic", "X");

      await waitFor(() => expect(pickPosts(sent)).toHaveLength(2));
      expect(pickPosts(sent)).toEqual(expect.arrayContaining([{ matchId: "A-1", pick: "2" }, { matchId: "A-2", pick: "X" }]));
    });

    it("drops a pending pick when the player switches player", async () => {
      const sent = serveMatches();
      const user = userEvent.setup();
      render(<PlayerPage />);

      await pick(user, "Mexico against South Africa", "1");
      await user.click(screen.getByRole("button", { name: "Switch player" }));

      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(pickPosts(sent)).toEqual([]);
    });

    it("says when a match has locked", async () => {
      serveMatches(() => ({ status: 409, json: { error: "Match is locked" } }));
      const user = userEvent.setup();
      render(<PlayerPage />);

      await pick(user, "Mexico against South Africa", "1");

      expect(await screen.findByText("That match has locked.")).toBeInTheDocument();
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
  });
});
