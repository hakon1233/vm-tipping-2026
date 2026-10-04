import { useRef, useState } from "react";
import type { SaveState } from "./ui";

type Options = {
  /** While true, nothing is scheduled. */
  locked?: boolean;
  delayMs?: number;
};

// Auto-save for values the player edits: `schedule(value, key)` saves the value
// `delayMs` after the last call with the same key (each key, e.g. a match id, has
// its own timer), and `state` tracks the saves for SaveIndicator ("saved" falls
// back to "idle" after 1.2 s). `cancel()` drops every pending save.
export function useDebouncedSave<T>(save: (value: T) => Promise<unknown>, { locked = false, delayMs = 500 }: Options = {}) {
  const [state, setState] = useState<SaveState>("idle");
  const timers = useRef(new Map<string, number>());

  async function run(value: T) {
    try {
      await save(value);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1200);
    } catch {
      setState("error");
    }
  }

  function schedule(value: T, key = "") {
    if (locked) return;
    window.clearTimeout(timers.current.get(key));
    setState("saving");
    timers.current.set(
      key,
      window.setTimeout(() => {
        timers.current.delete(key);
        void run(value);
      }, delayMs)
    );
  }

  function cancel() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }

  return [state, schedule, cancel] as const;
}
