import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Reply, type SentRequest, stubFetch } from "../test/fakeFetch";
import { AdminPage } from "./AdminPage";

const adminState = {
  players: [{ id: "p1", name: "Alice" }],
  teams: [{ name: "Norway" }, { name: "Mexico" }],
  matches: [{ id: "A-1", group: "A", homeTeam: "Mexico", awayTeam: "Norway", result: null }],
  scoring: { groupGame: 1, r32Team: 2, r16Team: 3, qfTeam: 4, sfTeam: 5, finalTeam: 6, champion: 7 },
  knockout: { r32: [], r16: [], qf: [], sf: [], final: [] },
  champion: null,
  leaderboard: [],
  advancement: {}
};

function serveAdmin(onWrite: (request: SentRequest) => Reply = () => ({ json: { ok: true } })) {
  return stubFetch((request) => {
    if (request.path === "/api/admin/state") {
      const pin = request.headers.get("x-admin-pin");
      return pin === null || pin === "admin-pin" ? { json: adminState } : { status: 401, json: { error: "Invalid admin PIN" } };
    }
    if (request.path.startsWith("/api/admin/")) return onWrite(request);
    return { json: {} };
  });
}

async function unlock(pin: string) {
  const user = userEvent.setup();
  render(<AdminPage />);
  await user.type(screen.getByLabelText(/admin pin/i), pin);
  await user.click(screen.getByRole("button", { name: /unlock admin/i }));
  await screen.findByRole("heading", { name: /group results/i });
  return user;
}

describe("AdminPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows result, knockout, champion and scoring sections once unlocked", async () => {
    serveAdmin();
    await unlock("admin-pin");

    expect(screen.getByRole("heading", { name: /knockout qualifiers/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /champion/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /scoring/i })).toBeInTheDocument();
  });

  it("stays locked and says so when the PIN is wrong", async () => {
    const sent = serveAdmin();
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.type(screen.getByLabelText(/admin pin/i), "guess");
    await user.click(screen.getByRole("button", { name: /unlock admin/i }));

    expect(await screen.findByText("Invalid admin PIN")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /group results/i })).not.toBeInTheDocument();
    expect(sent.find((request) => request.path === "/api/admin/state")?.headers.get("x-admin-pin")).toBe("guess");
  });

  it("sends the admin PIN in the x-admin-pin header when saving a result", async () => {
    const sent = serveAdmin();
    const user = await unlock("admin-pin");

    await user.click(screen.getByRole("button", { name: "1" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    const save = sent.find((request) => request.path === "/api/admin/results");
    expect(save?.method).toBe("POST");
    expect(save?.headers.get("x-admin-pin")).toBe("admin-pin");
    expect(save?.body).toEqual({ matchId: "A-1", outcome: "1" });
  });

  it("shows the server's reason when a save is refused", async () => {
    serveAdmin(() => ({ status: 400, json: { error: "Unknown match" } }));
    const user = await unlock("admin-pin");

    await user.click(screen.getByRole("button", { name: "1" }));

    expect(await screen.findByText("Save failed: Unknown match")).toBeInTheDocument();
  });
});
