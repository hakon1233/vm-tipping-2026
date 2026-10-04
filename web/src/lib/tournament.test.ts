import { describe, expect, it } from "vitest";
import { isKnockoutLocked, isMatchLocked } from "./tournament";

const match = { kickoffAt: "2026-06-20T18:00:00.000Z" };

describe("pick locks", () => {
  it("locks a group match at kickoff", () => {
    expect(isMatchLocked(match, false, Date.parse("2026-06-20T17:59:59.000Z"))).toBe(false);
    expect(isMatchLocked(match, false, Date.parse("2026-06-20T18:00:00.000Z"))).toBe(true);
  });

  it("locks knockout picks at the seeded knockout deadline", () => {
    expect(isKnockoutLocked(false, Date.parse("2026-06-11T18:59:59.000Z"))).toBe(false);
    expect(isKnockoutLocked(false, Date.parse("2026-06-11T19:00:00.000Z"))).toBe(true);
  });

  it("locks nothing while the server has deadlines disabled", () => {
    const later = Date.parse("2026-12-01T00:00:00.000Z");

    expect(isMatchLocked(match, true, later)).toBe(false);
    expect(isKnockoutLocked(true, later)).toBe(false);
  });
});
