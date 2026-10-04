import type { GroupLetter } from "@vm-tipping-2026/shared";
import seed from "../../../data/seed.json";

export const groupLetters = Object.keys(seed.groups) as GroupLetter[];
export const allTeams = Object.values(seed.groups).flat();
