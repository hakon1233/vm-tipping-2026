import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storeSession, stubFetch } from "../test/fakeFetch";
import { OverviewPage } from "./OverviewPage";

describe("OverviewPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks every player's group picks against the results", async () => {
    storeSession();
    const sent = stubFetch((request) => {
      if (request.path === "/api/admin/state") {
        return {
          json: {
            players: [
              { id: "p1", name: "Alice" },
              { id: "p2", name: "Bob" }
            ],
            teams: [],
            matches: [{ id: "A-1", group: "A", homeTeam: "Mexico", awayTeam: "South Africa", result: "1" }],
            scoring: {},
            knockout: {},
            champion: null,
            leaderboard: [],
            advancement: {}
          }
        };
      }
      if (request.path === "/api/picks/p1") return { json: { group: { "A-1": "1" }, knockout: {}, groupAdvancement: {} } };
      if (request.path === "/api/picks/p2") return { json: { group: { "A-1": "2" }, knockout: {}, groupAdvancement: {} } };
      return { json: {} };
    });
    render(<OverviewPage />);

    const groupA = (await screen.findByText("Mexico")).closest("table");
    if (!groupA) throw new Error("group A table missing");
    const totals = within(groupA).getByText("Correct picks:").closest("tr");
    expect(totals?.textContent).toBe("Correct picks:1/10/1");
    expect(sent.find((request) => request.path === "/api/picks/p2")?.headers.get("authorization")).toBe("Bearer test-token");
  });
});
