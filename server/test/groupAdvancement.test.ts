import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createDatabase, seedDatabase } from "../src/db.js";

// VMT-27: a player's 1st and 2nd advancement picks for a group must be distinct
// teams from that group — otherwise the same team resolves into two R32 slots
// (e.g. 1J and 2J) and the rendered bracket shows one team in multiple matchups.

function testApp(now = new Date("2026-01-01T12:00:00.000Z")) {
  const db = new Database(":memory:");
  createDatabase(db);
  seedDatabase(db);

  return {
    app: createApp({
      db,
      leaguePin: "league-pin",
      adminPin: "admin-pin",
      now: () => now
    }),
    db
  };
}

async function login(app: ReturnType<typeof createApp>, name = "Player 1") {
  const response = await app.request("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pin: "league-pin" })
  });

  expect(response.status).toBe(200);
  return response.json() as Promise<{
    player: { id: string; name: string };
    session: { token: string; playerId: string };
  }>;
}

async function postAdvancement(
  app: ReturnType<typeof createApp>,
  token: string,
  groupAdvancement: Record<string, { first?: string; second?: string }>
) {
  return app.request("/api/picks", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ groupAdvancement })
  });
}

describe("player group advancement validation (VMT-27)", () => {
  it("accepts distinct 1st/2nd picks from the same group", async () => {
    const { app } = testApp();
    const { session } = await login(app);

    const response = await postAdvancement(app, session.token, {
      J: { first: "Argentina", second: "Algeria" }
    });

    expect(response.status).toBe(200);
  });

  it("rejects the same team as both 1st and 2nd in one payload", async () => {
    const { app } = testApp();
    const { session } = await login(app);

    const response = await postAdvancement(app, session.token, {
      J: { first: "Argentina", second: "Argentina" }
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/different teams/);
  });

  it("rejects a pick that duplicates the stored team in the other position", async () => {
    const { app } = testApp();
    const { session } = await login(app);

    expect((await postAdvancement(app, session.token, { J: { first: "Argentina" } })).status).toBe(200);

    const response = await postAdvancement(app, session.token, { J: { second: "Argentina" } });
    expect(response.status).toBe(400);
  });

  it("rejects a team that is not in the group", async () => {
    const { app } = testApp();
    const { session } = await login(app);

    const response = await postAdvancement(app, session.token, {
      A: { first: "Argentina" }
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not in group A/);
  });

  it("allows clearing a position with an empty string", async () => {
    const { app } = testApp();
    const { session } = await login(app);

    expect(
      (await postAdvancement(app, session.token, { J: { first: "Argentina", second: "Algeria" } })).status
    ).toBe(200);
    expect((await postAdvancement(app, session.token, { J: { second: "" } })).status).toBe(200);
  });
});

// VMT-29: the admin must always be able to edit actual advancement, including
// swapping 1st/2nd. The VMT-17 guard used to reject any write where the team
// already held another position, which made swaps impossible from the admin UI
// ("Save failed" with no path forward). Now the conflicting position is cleared
// so the write lands and the one-position-per-team invariant still holds.
describe("admin group advancement editing (VMT-29)", () => {
  async function postAdminAdvancement(
    app: ReturnType<typeof createApp>,
    body: { group: string; position: number; team: string }
  ) {
    return app.request("/api/admin/advancement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPin: "admin-pin", ...body })
    });
  }

  async function getAdvancement(app: ReturnType<typeof createApp>) {
    const response = await app.request("/api/admin/state");
    const state = (await response.json()) as {
      advancement: Record<string, { first?: string; second?: string; third?: string }>;
    };
    return state.advancement;
  }

  it("moving the current 2nd-place team to 1st clears the 2nd slot instead of rejecting", async () => {
    const { app } = testApp();

    expect((await postAdminAdvancement(app, { group: "J", position: 1, team: "Argentina" })).status).toBe(200);
    expect((await postAdminAdvancement(app, { group: "J", position: 2, team: "Algeria" })).status).toBe(200);

    // Real result: Algeria actually won the group. This used to 409.
    const response = await postAdminAdvancement(app, { group: "J", position: 1, team: "Algeria" });
    expect(response.status).toBe(200);

    const advancement = await getAdvancement(app);
    expect(advancement.J.first).toBe("Algeria");
    expect(advancement.J.second).toBeUndefined();
  });

  it("a full 1st/2nd swap is possible in two edits", async () => {
    const { app } = testApp();

    await postAdminAdvancement(app, { group: "J", position: 1, team: "Argentina" });
    await postAdminAdvancement(app, { group: "J", position: 2, team: "Algeria" });

    expect((await postAdminAdvancement(app, { group: "J", position: 1, team: "Algeria" })).status).toBe(200);
    expect((await postAdminAdvancement(app, { group: "J", position: 2, team: "Argentina" })).status).toBe(200);

    const advancement = await getAdvancement(app);
    expect(advancement.J.first).toBe("Algeria");
    expect(advancement.J.second).toBe("Argentina");
  });

  it("still never stores the same team in two positions of one group", async () => {
    const { app } = testApp();

    await postAdminAdvancement(app, { group: "J", position: 1, team: "Argentina" });
    await postAdminAdvancement(app, { group: "J", position: 3, team: "Argentina" });

    const advancement = await getAdvancement(app);
    expect(advancement.J.third).toBe("Argentina");
    expect(advancement.J.first).toBeUndefined();
  });
});
