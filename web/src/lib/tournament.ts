import type { GroupLetter } from "@vm-tipping-2026/shared";
import seed from "../../../data/seed.json";

export const groupLetters = Object.keys(seed.groups) as GroupLetter[];
export const allTeams = Object.values(seed.groups).flat();

// The real group outcome as the admin enters it: 1st, 2nd and (for the eight
// best) 3rd place per group letter.
export type Advancement = Record<string, { first?: string; second?: string; third?: string }>;
