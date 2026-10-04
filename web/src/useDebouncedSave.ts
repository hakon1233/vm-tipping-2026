import { useRef, useState } from "react";
import type { SaveState } from "./ui";

// Auto-save for a value the player edits: `schedule(value)` saves it 500 ms
// after the last call, and `state` tracks that save for SaveIndicator ("saved"
// falls back to "idle" after 1.2 s). Nothing is saved while `locked`.
export function useDebouncedSave<T>(save: (value: T) => Promise<unknown>, locked: boolean) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<number | undefined>(undefined);

  async function run(value: T) {
    try {
      await save(value);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1200);
    } catch {
      setState("error");
    }
  }

  function schedule(value: T) {
    if (locked) return;
    window.clearTimeout(timer.current);
    setState("saving");
    timer.current = window.setTimeout(() => void run(value), 500);
  }

  return [state, schedule] as const;
}
