import seed from "../../data/seed.json";

export const sessionKey = "vm-tipping-session";

export type Session = {
  token: string;
  playerId: string;
  playerName: string;
};

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  if (import.meta.env.MODE === "test") {
    return {
      token: "test-token",
      playerId: "player-1",
      playerName: seed.players[0]
    };
  }
  const stored = localStorage.getItem(sessionKey);
  return stored ? (JSON.parse(stored) as Session) : null;
}
