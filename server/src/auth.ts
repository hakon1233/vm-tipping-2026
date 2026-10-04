import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

import type { AppStore } from "./store.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 10;
const MAX_FAILURES_TOTAL = 100;

type AuthOptions = {
  store: AppStore;
  adminPin: string;
  leaguePin: string;
  now: () => Date;
};

export type AuthVariables = { playerId: string };

type LoginResult =
  | { ok: true; player: { id: string; name: string }; token: string }
  | { ok: false; status: 401 | 404 | 429; error: string };

/**
 * Everything the API knows about who is calling: the league PIN login, player
 * sessions, the admin PIN, and the limit on wrong PIN guesses (10 per client and
 * 100 in total per 15 minutes; a blocked caller gets 429 even with the right PIN).
 */
export function createAuth({ store, adminPin, leaguePin, now }: AuthOptions) {
  const failures = createFailureCounter(now);
  const tooManyAttempts = { error: "Too many attempts, try again later" };

  function playerFor(authorization: string | undefined): string | undefined {
    const token = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return undefined;
    const session = store.getSession(hash(token));
    if (!session || now().getTime() - session.createdAt >= SESSION_TTL_MS) return undefined;
    return session.playerId;
  }

  return {
    login(name: string | undefined, pin: string | undefined, client: string): LoginResult {
      if (failures.blocked(client)) return { ok: false, status: 429, ...tooManyAttempts };
      if (!pinMatches(pin, leaguePin)) {
        failures.record(client);
        return { ok: false, status: 401, error: "Invalid league PIN" };
      }
      const player = name ? store.getPlayerByName(name) : undefined;
      if (!player) return { ok: false, status: 404, error: "Unknown player" };

      const token = randomBytes(32).toString("base64url");
      store.createSession(hash(token), player.id, now().getTime());
      return { ok: true, player, token };
    },

    requirePlayer: (async (context, next) => {
      const playerId = playerFor(context.req.header("authorization"));
      if (!playerId) return context.json({ error: "Unauthorized" }, 401);
      context.set("playerId", playerId);
      await next();
    }) satisfies MiddlewareHandler<{ Variables: AuthVariables }>,

    /** Accepts the admin PIN from the `x-admin-pin` header only. */
    requireAdmin: (async (context, next) => {
      const client = clientOf(context);
      if (failures.blocked(client)) return context.json(tooManyAttempts, 429);
      if (!pinMatches(context.req.header("x-admin-pin"), adminPin)) {
        failures.record(client);
        return context.json({ error: "Invalid admin PIN" }, 401);
      }
      await next();
    }) satisfies MiddlewareHandler
  };
}

/** Behind the Cloudflare tunnel every request carries the caller's address in cf-connecting-ip. */
export function clientOf(context: Context): string {
  return (
    context.req.header("cf-connecting-ip") ??
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "direct"
  );
}

function pinMatches(given: string | undefined, expected: string): boolean {
  return given !== undefined && timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}

/** Sessions are stored by hash, so a copy of the database holds no usable tokens. */
function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createFailureCounter(now: () => Date) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const TOTAL = "*";

  function count(key: string): number {
    const window = windows.get(key);
    return window && window.resetAt > now().getTime() ? window.count : 0;
  }

  function bump(key: string) {
    const current = now().getTime();
    if (windows.size > 1000) {
      for (const [stale, window] of windows) if (window.resetAt <= current) windows.delete(stale);
    }
    const window = windows.get(key);
    if (window && window.resetAt > current) window.count += 1;
    else windows.set(key, { count: 1, resetAt: current + ATTEMPT_WINDOW_MS });
  }

  return {
    blocked: (client: string) => count(client) >= MAX_FAILURES_PER_CLIENT || count(TOTAL) >= MAX_FAILURES_TOTAL,
    record(client: string) {
      bump(client);
      bump(TOTAL);
    }
  };
}
