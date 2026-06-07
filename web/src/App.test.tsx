import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("Knockout page", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders all knockout rounds and a champion selector", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /knockout picks/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/champion/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Round of 32 match/i)).toHaveLength(16);
    expect(screen.getAllByLabelText(/Round of 16 match/i)).toHaveLength(8);
    expect(screen.getAllByLabelText(/Quarter-final match/i)).toHaveLength(4);
    expect(screen.getAllByLabelText(/Semi-final match/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/^Final match/i)).toHaveLength(1);
  });

  it("auto-saves and restores the champion pick", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.selectOptions(screen.getByLabelText(/champion/i), "Norway");
    unmount();
    render(<App />);

    expect(screen.getByLabelText(/champion/i)).toHaveValue("Norway");
  });

  it("flags duplicate picks in the same round with scores-once text", async () => {
    const user = userEvent.setup();
    render(<App />);
    const r32 = screen.getByTestId("round-r32");
    const selects = within(r32).getAllByLabelText(/Round of 32 match/i);

    await user.selectOptions(selects[0], "Norway");
    await user.selectOptions(selects[1], "Norway");

    expect(within(r32).getAllByText(/scores once/i)).toHaveLength(2);
  });
});

describe("Admin page", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/admin");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          teams: [{ name: "Norway" }, { name: "Mexico" }],
          matches: [
            {
              id: "A-1",
              group: "A",
              homeTeam: "Mexico",
              awayTeam: "Norway",
              result: null
            }
          ],
          scoring: {
            groupGame: 1,
            r32Team: 2,
            r16Team: 3,
            qfTeam: 4,
            sfTeam: 5,
            finalTeam: 6,
            champion: 7
          },
          knockout: { r32: [], r16: [], qf: [], sf: [], final: [] },
          champion: null,
          leaderboard: []
        })
      }))
    );
  });

  it("PIN-gates admin controls and renders result, knockout, champion, and scoring sections", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: /admin match room/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/admin pin/i), "admin-pin");
    await user.click(screen.getByRole("button", { name: /unlock admin/i }));

    expect(await screen.findByRole("heading", { name: /group results/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /knockout qualifiers/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /champion/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /scoring/i })).toBeInTheDocument();
  });
});
