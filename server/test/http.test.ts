import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createStore } from "../src/store.js";

function testApp(corsOrigins: string[] = []) {
  return createApp({
    store: createStore({ databasePath: ":memory:" }),
    leaguePin: "league-pin",
    adminPin: "admin-pin",
    corsOrigins
  });
}

describe("cross-origin access", () => {
  it("is allowed only for the configured web origins", async () => {
    const app = testApp(["https://web.example"]);

    const allowed = await app.request("/api/leaderboard", { headers: { origin: "https://web.example" } });
    const other = await app.request("/api/leaderboard", { headers: { origin: "https://evil.example" } });

    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://web.example");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("is off when no origin is configured", async () => {
    const response = await testApp().request("/api/leaderboard", { headers: { origin: "https://web.example" } });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("HTTP hardening", () => {
  it("sends security headers", async () => {
    const response = await testApp().request("/health");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects request bodies over 64 KB", async () => {
    const response = await testApp().request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(70_000), pin: "league-pin" })
    });

    expect(response.status).toBe(413);
  });
});
