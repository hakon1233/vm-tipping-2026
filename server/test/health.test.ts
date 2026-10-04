import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createStore } from "../src/store.js";

describe("health endpoint", () => {
  it("returns an ok health payload", async () => {
    const app = createApp({ store: createStore({ databasePath: ":memory:" }), adminPin: "a", leaguePin: "l" });
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "vm-tipping-2026-api"
    });
  });
});
