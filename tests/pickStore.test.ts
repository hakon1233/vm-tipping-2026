import { describe, expect, it } from "vitest";
import { createPickStore } from "../server/src/pickStore";

describe("pick store", () => {
  it("saves and restores a player's group-stage picks", () => {
    const store = createPickStore();

    store.savePick({
      playerName: "Bendik",
      matchId: "A-1",
      pick: "1",
      now: new Date("2026-01-01T12:00:00.000Z"),
    });

    expect(store.getPicks("Bendik")).toEqual({ "A-1": "1" });
  });

  it("rejects changes for matches that have kicked off", () => {
    const store = createPickStore({
      "A-1": "2026-06-11T19:00:00.000Z",
    });

    expect(() =>
      store.savePick({
        playerName: "Bendik",
        matchId: "A-1",
        pick: "2",
        now: new Date("2026-06-11T19:00:01.000Z"),
      }),
    ).toThrow("Match is locked");
  });
});
