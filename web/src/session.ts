import { useEffect, useState } from "react";

// The logged-in player. Stored in localStorage under this key and format, so
// changing either logs everyone out.
export type Session = {
  token: string;
  playerId: string;
  playerName: string;
};

const sessionKey = "vm-tipping-session";
const changedEvent = "session-changed";

export function readSession(): Session | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(sessionKey) ?? "null");
    return isSession(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(sessionKey, JSON.stringify(session));
  window.dispatchEvent(new Event(changedEvent));
}

export function clearSession(): void {
  localStorage.removeItem(sessionKey);
  window.dispatchEvent(new Event(changedEvent));
}

// The current session, updated whenever saveSession or clearSession runs.
export function useSession(): Session | null {
  const [session, setSession] = useState(readSession);
  useEffect(() => {
    const onChange = () => setSession(readSession());
    window.addEventListener(changedEvent, onChange);
    return () => window.removeEventListener(changedEvent, onChange);
  }, []);
  return session;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const { token, playerId, playerName } = value as Record<string, unknown>;
  return typeof token === "string" && typeof playerId === "string" && typeof playerName === "string";
}
