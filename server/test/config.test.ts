import { describe, expect, it } from "vitest";

import { readServerConfig } from "../src/config.js";

const pins = { ADMIN_PIN: "admin-pin", LEAGUE_PIN: "league-pin" };

describe("server config", () => {
  it("refuses to start without an admin PIN", () => {
    expect(() => readServerConfig({ LEAGUE_PIN: "league-pin" })).toThrow(/ADMIN_PIN/);
  });

  it("refuses to start without a league PIN", () => {
    expect(() => readServerConfig({ ADMIN_PIN: "admin-pin", LEAGUE_PIN: "" })).toThrow(/LEAGUE_PIN/);
  });

  it("uses local defaults for everything optional", () => {
    expect(readServerConfig(pins)).toEqual({
      adminPin: "admin-pin",
      leaguePin: "league-pin",
      port: 3000,
      databasePath: "data/vm-tipping.sqlite",
      deadlinesDisabled: false,
      corsOrigins: []
    });
  });

  it("reads a comma-separated list of allowed web origins", () => {
    expect(readServerConfig({ ...pins, CORS_ORIGIN: "https://a.example, http://localhost:5173" }).corsOrigins).toEqual([
      "https://a.example",
      "http://localhost:5173"
    ]);
  });

  it("reads port, database path and the deadline switch", () => {
    expect(
      readServerConfig({ ...pins, PORT: "7110", DATABASE_PATH: "/tmp/x.sqlite", DEADLINES_DISABLED: "1" })
    ).toMatchObject({ port: 7110, databasePath: "/tmp/x.sqlite", deadlinesDisabled: true });
  });
});
