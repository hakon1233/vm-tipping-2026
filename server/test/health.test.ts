import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

describe("health endpoint", () => {
  it("returns an ok health payload", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "vm-tipping-2026-api"
    });
  });
});
