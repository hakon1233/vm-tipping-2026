import { afterEach, describe, expect, it, vi } from "vitest";
import { type Reply, type SentRequest, stubFetch } from "./test/fakeFetch";

// api.ts keeps the loaded config for the life of the page, so each test
// imports a fresh copy.
async function freshApi() {
  vi.resetModules();
  return import("./api");
}

function serve(configs: Reply[], api: (request: SentRequest) => Reply) {
  return stubFetch((request) => (request.path === "/config.json" ? (configs.shift() ?? { json: {} }) : api(request)));
}

const ok: Reply = { json: { ok: true } };

describe("api", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the base URL from config.json, loading it once", async () => {
    const sent = serve([{ json: { apiBaseUrl: "https://api.example" } }], () => ({ json: { leaderboard: [] } }));
    const api = await freshApi();

    await api.getLeaderboard();
    await api.getLeaderboard();

    expect(sent.map((request) => request.url)).toEqual([
      "/config.json",
      "https://api.example/api/leaderboard",
      "https://api.example/api/leaderboard"
    ]);
  });

  it("falls back to the built-in base URL when config.json is missing", async () => {
    const sent = serve([{ status: 404 }], () => ({ json: { leaderboard: [] } }));
    const api = await freshApi();

    await api.getLeaderboard();

    expect(sent[1].url).toBe("http://localhost:3000/api/leaderboard");
  });

  it("reloads config.json and retries once when the network fails", async () => {
    const sent = serve(
      [{ json: { apiBaseUrl: "https://old.example" } }, { json: { apiBaseUrl: "https://new.example" } }],
      (request) => (request.url.startsWith("https://old.example") ? "network-error" : { json: { matches: [] } })
    );
    const api = await freshApi();

    await expect(api.getMatches()).resolves.toMatchObject({ matches: [] });
    expect(sent.map((request) => request.url)).toEqual([
      "/config.json",
      "https://old.example/api/matches",
      "/config.json",
      "https://new.example/api/matches"
    ]);
  });

  it("rejects with status 0 when the retry fails as well", async () => {
    const sent = serve([], () => "network-error");
    const api = await freshApi();

    await expect(api.saveGroupPick("tok", "A-1", "1")).rejects.toMatchObject({ name: "ApiError", status: 0 });
    expect(sent.filter((request) => request.path === "/api/picks")).toHaveLength(2);
  });

  it("rejects with the HTTP status and the server's error text", async () => {
    serve([], () => ({ status: 409, json: { error: "Match is locked" } }));
    const api = await freshApi();

    const failure = api.saveGroupPick("tok", "A-1", "1");

    await expect(failure).rejects.toBeInstanceOf(api.ApiError);
    await expect(failure).rejects.toMatchObject({ status: 409, serverMessage: "Match is locked" });
  });

  it("rejects an error response even when the body has no error text", async () => {
    serve([], () => ({ status: 500, json: "Internal Server Error" }));
    const api = await freshApi();

    await expect(api.getMatches()).rejects.toMatchObject({ status: 500, serverMessage: undefined });
  });

  it("sends the player's token as a bearer header with a JSON body", async () => {
    const sent = serve([], () => ok);
    const api = await freshApi();

    await api.saveGroupPick("player-token", "A-1", "X");

    const save = sent[1];
    expect(save.method).toBe("POST");
    expect(save.headers.get("authorization")).toBe("Bearer player-token");
    expect(save.headers.get("content-type")).toBe("application/json");
    expect(save.headers.get("x-admin-pin")).toBeNull();
    expect(save.body).toEqual({ matchId: "A-1", pick: "X" });
  });

  it("sends the admin PIN in x-admin-pin and no bearer token", async () => {
    const sent = serve([], () => ok);
    const api = await freshApi();

    await api.admin.saveAdvancement("admin-pin", "C", 3, "Scotland");

    const save = sent[1];
    expect(save.path).toBe("/api/admin/advancement");
    expect(save.headers.get("x-admin-pin")).toBe("admin-pin");
    expect(save.headers.get("authorization")).toBeNull();
    expect(save.body).toEqual({ group: "C", position: 3, team: "Scotland" });
  });

  it("turns a login into a session", async () => {
    const sent = serve([], () => ({
      json: { player: { id: "p2", name: "Bob" }, session: { token: "bob-token", playerId: "p2" } }
    }));
    const api = await freshApi();

    await expect(api.login("Bob", "1234")).resolves.toEqual({ token: "bob-token", playerId: "p2", playerName: "Bob" });
    expect(sent[1].body).toEqual({ name: "Bob", pin: "1234" });
    expect(sent[1].headers.get("authorization")).toBeNull();
  });

  it("posts every knockout payload and fails if any is refused", async () => {
    const sent = serve([], (request) =>
      (request.body as { round?: string }).round === "champion" ? { status: 409, json: { error: "Locked" } } : ok
    );
    const api = await freshApi();

    await expect(
      api.saveKnockoutPicks("tok", [
        { round: "r32", teamNames: ["Norway", "Brazil"] },
        { round: "champion", teamName: "Norway" }
      ])
    ).rejects.toMatchObject({ status: 409 });
    expect(sent.slice(1).map((request) => request.body)).toEqual([
      { round: "r32", teamNames: ["Norway", "Brazil"] },
      { round: "champion", teamName: "Norway" }
    ]);
  });
});
