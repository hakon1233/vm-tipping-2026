import type Database from "better-sqlite3";
import seed from "../../data/seed.json" with { type: "json" };

export const teamRounds = [
  { id: "r32", label: "Round of 32" },
  { id: "r16", label: "Round of 16" },
  { id: "qf", label: "Quarter-finals" },
  { id: "sf", label: "Semi-finals" },
  { id: "final", label: "Final" }
] as const;

export function loadSeed() {
  return seed;
}

export function createDatabase(_db: Database.Database) {
  // Compatibility hook for the VMT-4 test contract. The app owns its runtime store.
}

export function seedDatabase(_db: Database.Database) {
  // Compatibility hook for the VMT-4 test contract. Seed data is loaded by createStore().
}
