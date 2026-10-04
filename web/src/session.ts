export const sessionKey = "vm-tipping-session";

export type Session = {
  token: string;
  playerId: string;
  playerName: string;
};

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(sessionKey);
  return stored ? (JSON.parse(stored) as Session) : null;
}
