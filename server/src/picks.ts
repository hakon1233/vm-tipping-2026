import { isKnockoutRoundId, type GroupPickOutcome, type KnockoutRoundId } from "@vm-tipping-2026/shared";

import seed from "../../data/seed.json" with { type: "json" };
import type { AppStore } from "./store.js";

type PickRulesOptions = {
  store: AppStore;
  now: () => Date;
  /** Lifts both deadlines, so picks stay editable after kickoff. */
  deadlinesDisabled: boolean;
};

export type PickResult = { ok: true } | { ok: false; status: 400 | 409; error: string };

const OUTCOMES: readonly string[] = ["1", "X", "2"] satisfies GroupPickOutcome[];
const invalid: PickResult = { ok: false, status: 400, error: "Invalid pick payload" };
const saved: PickResult = { ok: true };

/**
 * The rules for a player's picks: when they lock, what a valid pick is, and
 * who may read whose picks. `save` takes the raw POST /api/picks body, which is
 * one of: a group pick ({ matchId, pick }), a knockout round ({ round, teamNames }),
 * the champion ({ round: "champion", teamName }, empty clears it) or group
 * advancement ({ groupAdvancement: { A: { first?, second? } } }).
 */
export function createPickRules({ store, now, deadlinesDisabled }: PickRulesOptions) {
  const isTeam = (name: unknown) => typeof name === "string" && store.hasTeam(name);
  const hasPassed = (deadline: string) => !deadlinesDisabled && now().getTime() >= Date.parse(deadline);
  // Lifting the pick deadlines does not make picks public early.
  const picksArePublic = () => now().getTime() >= Date.parse(seed.groupStageDeadline);

  function saveGroupPick(playerId: string, matchId: unknown, pick: unknown): PickResult {
    const match = store.listMatches().find((candidate) => candidate.id === matchId);
    if (!match || typeof pick !== "string" || !OUTCOMES.includes(pick)) return invalid;
    if (hasPassed(match.kickoffAt)) return { ok: false, status: 409, error: "Match is locked" };
    store.saveGroupPick({ playerId, matchId: match.id, outcome: pick as GroupPickOutcome });
    return saved;
  }

  function saveTeams(playerId: string, round: KnockoutRoundId | "champion", teams: unknown[]): PickResult {
    if (!teams.every(isTeam)) return { ok: false, status: 400, error: "Unknown team" };
    store.saveKnockoutPick({ playerId, round, teams: teams as string[] });
    return saved;
  }

  // A group's 1st and 2nd picks must be distinct teams from that group, or the
  // same team would fill two Round-of-32 slots.
  function saveGroupAdvancement(playerId: string, advancement: unknown): PickResult {
    if (!isRecord(advancement)) return invalid;
    const picks = Object.entries(advancement);
    if (!picks.every(([, pick]) => isRecord(pick) && isOptionalString(pick.first) && isOptionalString(pick.second))) {
      return invalid;
    }
    const teamGroups = new Map(store.listTeams().map((team) => [team.name, team.group.toUpperCase()]));
    const stored = store.getPlayerGroupAdvancement(playerId);
    for (const [group, pick] of picks as [string, { first?: string; second?: string }][]) {
      const groupKey = group.toUpperCase();
      for (const team of [pick.first, pick.second]) {
        if (team && teamGroups.get(team) !== groupKey) {
          return { ok: false, status: 400, error: `Team "${team}" is not in group ${groupKey}` };
        }
      }
      const first = pick.first ?? stored[groupKey]?.first;
      const second = pick.second ?? stored[groupKey]?.second;
      if (first && second && first === second) {
        return { ok: false, status: 400, error: `Group ${groupKey}: 1st and 2nd picks must be different teams` };
      }
    }
    for (const [group, pick] of picks as [string, { first?: string; second?: string }][]) {
      if (pick.first !== undefined) store.savePlayerGroupAdvancement({ playerId, group, position: 1, team: pick.first });
      if (pick.second !== undefined) store.savePlayerGroupAdvancement({ playerId, group, position: 2, team: pick.second });
    }
    return saved;
  }

  return {
    save(playerId: string, body: unknown): PickResult {
      if (!isRecord(body)) return invalid;
      if (body.matchId) return saveGroupPick(playerId, body.matchId, body.pick);
      if (hasPassed(seed.knockoutDeadline)) return { ok: false, status: 409, error: "Knockout picks are locked" };
      if (body.round === "champion" && typeof body.teamName === "string") {
        return saveTeams(playerId, "champion", body.teamName ? [body.teamName] : []);
      }
      if (isKnockoutRoundId(body.round) && Array.isArray(body.teamNames)) return saveTeams(playerId, body.round, body.teamNames);
      if (body.groupAdvancement !== undefined) return saveGroupAdvancement(playerId, body.groupAdvancement);
      return invalid;
    },

    /** Picks are private until the group-stage deadline, except to their owner. */
    canRead: (viewerId: string, ownerId: string) => viewerId === ownerId || picksArePublic(),

    /** Everyone's picks (the Excel export) are readable once the group-stage deadline has passed. */
    allArePublic: picksArePublic
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}
