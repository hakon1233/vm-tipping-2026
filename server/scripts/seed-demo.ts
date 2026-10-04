// Fills the local database with made-up picks and half a tournament of results,
// so the demo leaderboard has something to show. Overwrites existing picks.
import { buildGroupMatches, type GroupPickOutcome } from "@vm-tipping-2026/shared";

import seed from "../../data/seed.json" with { type: "json" };
import { createStore } from "../src/store.js";

const store = createStore({ databasePath: process.env.DATABASE_PATH ?? "data/vm-tipping.sqlite" });
let state = 7; // a fixed seed, so every run gives the same demo
const random = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pickOne = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const outcomes: GroupPickOutcome[] = ["1", "X", "2"];
const groups = seed.groups as Record<string, string[]>;
const letters = Object.keys(groups).sort();
const matches = buildGroupMatches();

const results = new Map(matches.slice(0, 48).map((match) => [match.id, pickOne(outcomes)]));
results.forEach((outcome, matchId) => store.saveResult({ matchId, outcome }));
letters.slice(0, 6).forEach((group) => {
  store.saveGroupAdvancement(group, 1, groups[group][0]);
  store.saveGroupAdvancement(group, 2, groups[group][1]);
});
store.saveActualKnockout("r32", letters.slice(0, 6).flatMap((group) => groups[group].slice(0, 2)));

const players = store.listPlayers();
players.forEach((player, index) => {
  const skill = 0.35 + index * 0.06;
  for (const match of matches) {
    const result = results.get(match.id);
    store.saveGroupPick({ playerId: player.id, matchId: match.id, outcome: result && random() < skill ? result : pickOne(outcomes) });
  }
  const advancing = letters.flatMap((group) => {
    const [first, second] = [...groups[group]].sort(() => random() - 0.5);
    store.savePlayerGroupAdvancement({ playerId: player.id, group, position: 1, team: first });
    store.savePlayerGroupAdvancement({ playerId: player.id, group, position: 2, team: second });
    return [first, second];
  });
  store.saveKnockoutPick({ playerId: player.id, round: "r32", teams: advancing.slice(0, 16) });
  store.saveKnockoutPick({ playerId: player.id, round: "champion", teams: [pickOne(advancing)] });
});

store.close();
console.log(`Demo data written: ${results.size} results and picks for ${players.length} players.`);
