import type { GroupPickOutcome, LeaderboardRow, Match } from "@vm-tipping-2026/shared";
import type { GroupAdvPicks, KnockoutPickPayload, KnockoutRoundId } from "./lib/knockout";
import type { Advancement } from "./lib/tournament";
import type { Session } from "./session";

export type PlayerRef = { id: string; name: string };

export type MatchList = {
  matches: Match[];
  players: PlayerRef[];
  advancement: Advancement;
  // DEADLINES_DISABLED=1 on the server: while true the UI skips every pick lock.
  deadlinesDisabled: boolean;
};

export type PlayerPicks = {
  group: Record<string, GroupPickOutcome>;
  knockout: Record<string, string[]>;
  groupAdvancement: Record<string, { first?: string; second?: string }>;
};

export type AdminState = {
  players: PlayerRef[];
  teams: { name: string }[];
  matches: { id: string; group: string; homeTeam: string; awayTeam: string; result: GroupPickOutcome | null }[];
  scoring: Record<string, number>;
  knockout: Record<string, string[]>;
  champion: string | null;
  leaderboard: LeaderboardRow[];
  advancement: Advancement;
};

// A failed call. status 0 means the server could not be reached; otherwise it
// is the HTTP status, with the server's `error` text when it sent one.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly serverMessage?: string
  ) {
    super(serverMessage ?? (status === 0 ? "Could not reach the server" : `HTTP ${status}`));
    this.name = "ApiError";
  }
}

// The base URL comes from config.json at runtime, so a new tunnel URL needs no
// rebuild. It can change while a tab is open (tunnel restart), so a call that
// fails on the network reloads config.json once and retries.
let apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
let configReady: Promise<void> | undefined;

async function loadConfig(): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL ?? "/"}config.json`, { cache: "no-store" });
    if (!response.ok) return;
    const config = (await response.json()) as { apiBaseUrl?: unknown };
    if (typeof config.apiBaseUrl === "string" && config.apiBaseUrl) apiBaseUrl = config.apiBaseUrl;
  } catch {
    // keep the current base URL
  }
}

// Resolves once config.json has been read (or failed to load). Loaded on the
// first call, then shared.
export function whenConfigReady(): Promise<void> {
  configReady ??= loadConfig();
  return configReady;
}

type Credentials = { token: string } | { adminPin: string };

async function request(
  path: string,
  { method, json, credentials }: { method?: "POST" | "PATCH"; json?: unknown; credentials?: Credentials } = {}
): Promise<Response> {
  await whenConfigReady();
  const headers: Record<string, string> = {};
  if (credentials && "token" in credentials) headers.authorization = `Bearer ${credentials.token}`;
  if (json !== undefined) headers["content-type"] = "application/json";
  if (credentials && "adminPin" in credentials) headers["x-admin-pin"] = credentials.adminPin;
  const init: RequestInit = { method, headers, body: json === undefined ? undefined : JSON.stringify(json) };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, init);
  } catch {
    await loadConfig();
    try {
      response = await fetch(`${apiBaseUrl}${path}`, init);
    } catch {
      throw new ApiError(0);
    }
  }
  if (!response.ok) throw new ApiError(response.status, await serverMessage(response));
  return response;
}

async function serverMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

async function readJson<T>(response: Promise<Response>): Promise<Partial<T>> {
  return (await (await response).json()) as Partial<T>;
}

export async function getMatches(): Promise<MatchList> {
  const body = await readJson<MatchList>(request("/api/matches"));
  return {
    matches: body.matches ?? [],
    players: body.players ?? [],
    advancement: body.advancement ?? {},
    deadlinesDisabled: body.deadlinesDisabled === true
  };
}

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  return (await readJson<{ leaderboard: LeaderboardRow[] }>(request("/api/leaderboard"))).leaderboard ?? [];
}

// Public: results and standings, never anyone's picks.
export async function getAdminState(): Promise<AdminState> {
  return (await (await request("/api/admin/state")).json()) as AdminState;
}

export async function getPlayerPicks(token: string, playerId: string): Promise<PlayerPicks> {
  const body = await readJson<PlayerPicks>(request(`/api/picks/${playerId}`, { credentials: { token } }));
  return { group: body.group ?? {}, knockout: body.knockout ?? {}, groupAdvancement: body.groupAdvancement ?? {} };
}

export async function login(name: string, pin: string): Promise<Session> {
  const body = (await (await request("/api/login", { method: "POST", json: { name, pin } })).json()) as {
    player: PlayerRef;
    session: { token: string; playerId: string };
  };
  return { token: body.session.token, playerId: body.session.playerId, playerName: body.player.name };
}

export async function renamePlayer(token: string, name: string): Promise<void> {
  await request("/api/player/name", { method: "PATCH", json: { name }, credentials: { token } });
}

export async function saveGroupPick(token: string, matchId: string, pick: GroupPickOutcome): Promise<void> {
  await request("/api/picks", { method: "POST", json: { matchId, pick }, credentials: { token } });
}

// One POST per payload, sent in parallel; rejects if any of them fails.
export async function saveKnockoutPicks(token: string, payloads: KnockoutPickPayload[]): Promise<void> {
  await Promise.all(
    payloads.map((payload) => request("/api/picks", { method: "POST", json: payload, credentials: { token } }))
  );
}

export async function saveGroupAdvancement(token: string, groupAdvancement: GroupAdvPicks): Promise<void> {
  await request("/api/picks", { method: "POST", json: { groupAdvancement }, credentials: { token } });
}

// Everyone's picks as a workbook; the server refuses it before the group-stage deadline.
export async function downloadExport(token: string): Promise<Blob> {
  return (await request("/api/export.xlsx", { credentials: { token } })).blob();
}

function adminWrite(adminPin: string, path: string, json: unknown): Promise<Response> {
  return request(path, { method: "POST", json, credentials: { adminPin } });
}

export const admin = {
  async saveResult(adminPin: string, matchId: string, outcome: GroupPickOutcome): Promise<void> {
    await adminWrite(adminPin, "/api/admin/results", { matchId, outcome });
  },
  async saveAdvancement(adminPin: string, group: string, position: 1 | 2 | 3, team: string): Promise<void> {
    await adminWrite(adminPin, "/api/admin/advancement", { group, position, team });
  },
  async saveKnockout(adminPin: string, round: KnockoutRoundId, teams: string[]): Promise<void> {
    await adminWrite(adminPin, "/api/admin/knockout", { round, teams });
  },
  // An empty team clears the champion.
  async saveChampion(adminPin: string, team: string): Promise<void> {
    await adminWrite(adminPin, "/api/admin/champion", { team });
  },
  async saveScoring(adminPin: string, scoring: Record<string, number>): Promise<void> {
    await adminWrite(adminPin, "/api/admin/scoring", { scoring });
  }
};
