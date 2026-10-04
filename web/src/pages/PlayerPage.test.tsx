import { render, screen } from "@testing-library/react";
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

  it("sends a player with an expired session back to login", async () => {
    storeSession();
    servePlayer((request) => (request.path === "/api/picks/p1" ? { status: 401, json: { error: "Login required" } } : undefined));
    render(<PlayerPage />);

    expect(await screen.findByRole("heading", { name: "Player login" })).toBeInTheDocument();
    expect(window.localStorage.getItem("vm-tipping-session")).toBeNull();
  });
});
