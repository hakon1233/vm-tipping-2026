import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createStore } from "../src/store.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function testApp() {
  const clock = { now: new Date("2026-06-01T12:00:00.000Z") };
  const app = createApp({
    store: createStore({ databasePath: ":memory:" }),
    leaguePin: "league-pin",
    adminPin: "admin-pin",
    now: () => clock.now
  });
  return { app, clock };
}

function login(app: ReturnType<typeof createApp>, pin = "league-pin", client = "198.51.100.1") {
  return app.request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": client },
    body: JSON.stringify({ name: "Player 1", pin })
  });
}

function postResult(app: ReturnType<typeof createApp>, headers: Record<string, string>, body: object = {}) {
  return app.request("/api/admin/results", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ matchId: "A-1", outcome: "1", ...body })
  });
}

function readOwnPicks(app: ReturnType<typeof createApp>, token: string) {
  return app.request("/api/picks/player-1", { headers: { authorization: `Bearer ${token}` } });
}

describe("player sessions", () => {
  it("issues an unguessable token that does not reveal the player", async () => {
    const { app } = testApp();
    const { session } = await (await login(app)).json();

    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.token).not.toContain("player-1");
  });

  it("keeps a session valid for 30 days and then expires it", async () => {
    const { app, clock } = testApp();
    const { session } = await (await login(app)).json();

    clock.now = new Date(clock.now.getTime() + 29 * DAY_MS);
    expect((await readOwnPicks(app, session.token)).status).toBe(200);

    clock.now = new Date(clock.now.getTime() + 2 * DAY_MS);
    expect((await readOwnPicks(app, session.token)).status).toBe(401);
  });
});

describe("admin PIN", () => {
  it("is accepted in the x-admin-pin header", async () => {
    const { app } = testApp();
    expect((await postResult(app, { "x-admin-pin": "admin-pin" })).status).toBe(200);
  });

  it("is checked when sent to read the admin state, which stays public without it", async () => {
    const { app } = testApp();
    const state = (headers: Record<string, string>) => app.request("/api/admin/state", { headers });

    expect((await state({})).status).toBe(200);
    expect((await state({ "x-admin-pin": "admin-pin" })).status).toBe(200);
    expect((await state({ "x-admin-pin": "wrong" })).status).toBe(401);
  });

  it("is not accepted in the request body", async () => {
    const { app } = testApp();
    expect((await postResult(app, {}, { adminPin: "admin-pin" })).status).toBe(401);
  });
});

describe("PIN guessing", () => {
  it("blocks a client after 10 wrong league PINs, even for the right PIN", async () => {
    const { app } = testApp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await login(app, `wrong-${attempt}`)).status).toBe(401);
    }

    expect((await login(app)).status).toBe(429);
    expect((await login(app, "league-pin", "203.0.113.9")).status).toBe(200);
  });

  it("lets a blocked client try again after 15 minutes", async () => {
    const { app, clock } = testApp();
    for (let attempt = 0; attempt < 10; attempt += 1) await login(app, "wrong");

    clock.now = new Date(clock.now.getTime() + 15 * 60 * 1000);
    expect((await login(app)).status).toBe(200);
  });

  it("blocks wrong admin PINs the same way", async () => {
    const { app } = testApp();
    const client = { "cf-connecting-ip": "198.51.100.7" };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await postResult(app, { ...client, "x-admin-pin": "nope" })).status).toBe(401);
    }

    expect((await postResult(app, { ...client, "x-admin-pin": "admin-pin" })).status).toBe(429);
  });

  it("locks everyone out after 100 failures spread over many clients", async () => {
    const { app } = testApp();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await login(app, "wrong", `198.51.100.${attempt}`);
    }

    expect((await login(app, "league-pin", "203.0.113.9")).status).toBe(429);
  });
});
