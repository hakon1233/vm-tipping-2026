import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, readSession, saveSession, useSession } from "./session";

const alice = { token: "alice-token", playerId: "p1", playerName: "Alice" };

describe("session", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores the session as JSON under vm-tipping-session", () => {
    saveSession(alice);

    expect(window.localStorage.getItem("vm-tipping-session")).toBe(
      '{"token":"alice-token","playerId":"p1","playerName":"Alice"}'
    );
    expect(readSession()).toEqual(alice);
  });

  it("reads a corrupt or incomplete stored session as logged out", () => {
    window.localStorage.setItem("vm-tipping-session", "{not json");
    expect(readSession()).toBeNull();

    window.localStorage.setItem("vm-tipping-session", '{"token":"t"}');
    expect(readSession()).toBeNull();
  });

  it("keeps every useSession caller in step with save and clear", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current).toBeNull();

    act(() => saveSession(alice));
    expect(result.current).toEqual(alice);

    act(() => clearSession());
    expect(result.current).toBeNull();
    expect(window.localStorage.getItem("vm-tipping-session")).toBeNull();
  });
});
