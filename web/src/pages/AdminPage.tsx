import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";
import seed from "../../../data/seed.json";
import { apiBaseUrl, loadConfig } from "../api";
import { allTeams, groupLetters } from "../lib/tournament";

export type AdminState = {
  teams: { name: string }[];
  matches: {
    id: string;
    group: string;
    homeTeam: string;
    awayTeam: string;
    result: "1" | "X" | "2" | null;
  }[];
  scoring: Record<string, number>;
  knockout: Record<string, string[]>;
  champion: string | null;
  leaderboard: { playerId: string; playerName?: string; name?: string; total: number; rank: number }[];
  advancement: Record<string, { first?: string; second?: string; third?: string }>;
};

const adminRounds = [
  { id: "r32", label: "Round of 32" },
  { id: "r16", label: "Round of 16" },
  { id: "qf", label: "Quarter-final" },
  { id: "sf", label: "Semi-final" },
  { id: "final", label: "Final" }
] as const;

export function AdminPage() {
  const [pinInput, setPinInput] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [state, setState] = useState<AdminState | null>(null);
  const [status, setStatus] = useState("Locked");

  // VMT-29: the tunnel URL can rotate while a tab stays open, leaving the
  // in-memory apiBaseUrl pointing at a dead host. On network failure, re-fetch
  // config.json once to pick up the new URL and retry.
  async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(`${apiBaseUrl}${path}`, init);
    } catch {
      await loadConfig();
      return fetch(`${apiBaseUrl}${path}`, init);
    }
  }

  async function loadState() {
    let response: Response;
    try {
      response = await adminFetch("/api/admin/state");
    } catch {
      setStatus("Error: could not reach server");
      return;
    }
    if (!response.ok) {
      setStatus("Error: " + response.status);
      return;
    }
    const body = (await response.json()) as AdminState;
    setState(body);
    setStatus("Loaded");
  }

  async function unlock() {
    setAdminPin(pinInput);
    setStatus("Loading");
    await loadState();
  }

  async function post(path: string, body: object) {
    if (!adminPin) return;
    setStatus("Saving");
    let response: Response;
    try {
      response = await adminFetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-pin": adminPin },
        body: JSON.stringify(body)
      });
    } catch {
      setStatus("Save failed: could not reach server");
      return;
    }
    if (!response.ok) {
      // VMT-29: show WHY the save failed (wrong PIN, validation conflict, …)
      // instead of a generic "Save failed" that hides the cause.
      const message = await response
        .json()
        .then((data: { error?: string }) => data.error)
        .catch(() => undefined);
      setStatus(`Save failed: ${message ?? `HTTP ${response.status}`}`);
      return;
    }
    await loadState();
    setStatus("Saved");
  }

  const teams = state?.teams.map((team) => team.name) ?? allTeams;

  return (
    <main className="min-h-screen bg-admin text-ink">
      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="grid gap-5 border border-red-900/15 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-black uppercase text-red-700">Admin only</p>
            <h1 className="mt-2 text-4xl font-black leading-none sm:text-6xl">Admin match room</h1>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-ink/70">Admin PIN</span>
              <input
                className="min-h-11 w-44 border border-ink/20 bg-white px-3"
                type="password"
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value)}
              />
            </label>
            <button className="inline-flex min-h-11 items-center gap-2 bg-red-700 px-4 font-black text-white" onClick={unlock} type="button">
              <LockKeyhole size={18} aria-hidden="true" />
              Unlock admin
            </button>
            <span className="inline-flex min-h-11 items-center gap-2 border border-ink/15 bg-paper px-3 text-sm font-bold">
              <ShieldCheck size={17} aria-hidden="true" />
              {status}
            </span>
          </div>
        </header>

        {state ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
            <section className="grid gap-4 border border-ink/10 bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-black">Group results</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {state.matches.map((match) => (
                  <div className="grid gap-2 border border-ink/10 bg-paper p-3" key={match.id}>
                    <span className="text-xs font-black uppercase text-red-700">
                      Group {match.group} · {match.id}
                    </span>
                    <strong>
                      {match.homeTeam} vs {match.awayTeam}
                    </strong>
                    <div className="grid grid-cols-3 gap-2">
                      {(["1", "X", "2"] as const).map((outcome) => (
                        <button
                          className={
                            match.result === outcome
                              ? "min-h-10 bg-pitch font-black text-white"
                              : "min-h-10 border border-ink/20 bg-white font-black"
                          }
                          key={outcome}
                          onClick={() => post("/api/admin/results", { matchId: match.id, outcome })}
                          type="button"
                        >
                          {outcome}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="grid content-start gap-5">
              <section className="grid gap-4 border border-ink/10 bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-black">Group advancement</h2>
                <p className="text-sm text-ink/60">Set the 1st and 2nd place teams from each group. Players will only see these teams in their knockout picks.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {groupLetters.map((group) => (
                    <div className="grid gap-2 rounded border border-ink/10 bg-paper p-3" key={group}>
                      <span className="text-xs font-black uppercase text-red-700">Group {group}</span>
                      <label className="grid gap-1">
                        <span className="text-xs font-bold text-ink/60">1st place</span>
                        <select
                          className="min-h-9 border border-ink/20 bg-white px-2 text-sm"
                          value={state.advancement?.[group]?.first ?? ""}
                          onChange={(event) => event.target.value && post("/api/admin/advancement", { group, position: 1, team: event.target.value })}
                        >
                          <option value="">— not set —</option>
                          {(seed.groups as Record<string, string[]>)[group]?.map((team) => (
                            <option key={team} value={team}>{team}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-bold text-ink/60">2nd place</span>
                        <select
                          className="min-h-9 border border-ink/20 bg-white px-2 text-sm"
                          value={state.advancement?.[group]?.second ?? ""}
                          onChange={(event) => event.target.value && post("/api/admin/advancement", { group, position: 2, team: event.target.value })}
                        >
                          <option value="">— not set —</option>
                          {(seed.groups as Record<string, string[]>)[group]?.filter((team) => team !== state.advancement?.[group]?.first).map((team) => (
                            <option key={team} value={team}>{team}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 border border-ink/10 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black">Best 3rd-place qualifiers</h2>
                    <p className="text-sm text-ink/60 mt-1">Select the 8 groups whose 3rd-place team advanced to R32. These join the 24 group-stage top-2 in players' knockout pick dropdowns.</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${
                    Object.values(state.advancement ?? {}).filter(a => a.third).length === 8
                      ? "bg-green-100 text-green-700"
                      : "bg-ink/10 text-ink/60"
                  }`}>
                    {Object.values(state.advancement ?? {}).filter(a => a.third).length}/8
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(() => {
                    const thirdCount = Object.values(state.advancement ?? {}).filter(a => a.third).length;
                    return groupLetters.map((group) => {
                      const hasThird = !!state.advancement?.[group]?.third;
                      const atCap = thirdCount >= 8 && !hasThird;
                      return (
                        <div className="grid gap-1 rounded border border-ink/10 bg-paper p-3" key={group}>
                          <span className="text-xs font-black uppercase text-red-700">Group {group}</span>
                          <select
                            className="min-h-9 border border-ink/20 bg-white px-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            value={state.advancement?.[group]?.third ?? ""}
                            disabled={atCap}
                            onChange={(event) => post("/api/admin/advancement", { group, position: 3, team: event.target.value })}
                          >
                            <option value="">{atCap ? "— cap reached (8/8) —" : "— did not advance —"}</option>
                            {(seed.groups as Record<string, string[]>)[group]?.filter((team) => team !== state.advancement?.[group]?.first && team !== state.advancement?.[group]?.second).map((team) => (
                              <option key={team} value={team}>{team}</option>
                            ))}
                          </select>
                        </div>
                      );
                    });
                  })()}
                </div>
              </section>

              <section className="grid gap-4 border border-ink/10 bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-black">Knockout qualifiers</h2>
                {adminRounds.map((round) => (
                  <label className="grid gap-2" key={round.id}>
                    <span className="text-sm font-bold text-ink/70">{round.label}</span>
                    <select
                      className="min-h-28 border border-ink/20 bg-white px-3 py-2"
                      multiple
                      value={state.knockout[round.id] ?? []}
                      onChange={(event) =>
                        post("/api/admin/knockout", {
                          round: round.id,
                          teams: Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                        })
                      }
                    >
                      {teams.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </section>

              <section className="grid gap-3 border border-ink/10 bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-black">Champion</h2>
                <select
                  aria-label="Actual champion"
                  className="min-h-11 border border-ink/20 bg-white px-3"
                  value={state.champion ?? ""}
                  onChange={(event) => post("/api/admin/champion", { team: event.target.value })}
                >
                  <option value="">Choose champion</option>
                  {teams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </section>

              <section className="grid gap-3 border border-ink/10 bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-black">Scoring</h2>
                <div className="grid grid-cols-2 gap-3 overflow-hidden">
                  {Object.entries(state.scoring).map(([key, value]) => (
                    <label className="grid gap-1" key={key}>
                      <span className="text-sm font-bold text-ink/70">{key}</span>
                      <input
                        className="min-h-10 w-full border border-ink/20 px-3"
                        min={0}
                        type="number"
                        value={value}
                        onChange={(event) => post("/api/admin/scoring", { scoring: { [key]: Number(event.target.value) } })}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="grid gap-3 border border-ink/10 bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-black">Leaderboard</h2>
                {state.leaderboard.slice(0, 8).map((row) => (
                  <div className="flex items-center justify-between border-b border-ink/10 py-2" key={row.playerId}>
                    <span className="font-bold">
                      #{row.rank} {row.playerName ?? row.name}
                    </span>
                    <strong>{row.total}</strong>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}
