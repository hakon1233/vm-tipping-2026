// apiBaseUrl is loaded at runtime from /config.json so the tunnel URL
// can be updated without a full rebuild+redeploy.
export let apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export async function loadConfig() {
  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const res = await fetch(`${base}config.json`, { cache: "no-store" });
    if (res.ok) {
      const cfg = (await res.json()) as { apiBaseUrl?: string };
      if (cfg.apiBaseUrl) apiBaseUrl = cfg.apiBaseUrl;
    }
  } catch {
    // keep the baked-in default
  }
}

export const configLoaded = loadConfig();

// VMT-29 follow-up: same tunnel-URL-rotation retry used by AdminPage, now
// available to all user-facing fetches. On network failure, re-fetches
// config.json once (picks up the new Quick Tunnel URL) then retries.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiBaseUrl}${path}`, init);
  } catch {
    await loadConfig();
    return fetch(`${apiBaseUrl}${path}`, init);
  }
}
