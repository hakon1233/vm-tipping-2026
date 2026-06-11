import { Check, Crown, Lock, LockKeyhole, Pencil, RefreshCw, Save, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import seed from "../../data/seed.json";
import type { GroupLetter, GroupPickOutcome, Match } from "@vm-tipping-2026/shared";
import {
  KnockoutRoundId,
  KnockoutPicks,
  createEmptyKnockoutPicks,
  duplicateTeamNamesByRound,
  knockoutRounds,
  readKnockoutPicks,
  renameKnockoutPicks,
  writeKnockoutPicks
} from "./lib/knockout";

// apiBaseUrl is loaded at runtime from /config.json so the tunnel URL
// can be updated without a full rebuild+redeploy.
let apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function loadConfig() {
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

const configLoaded = loadConfig();

const sessionKey = "vm-tipping-session";
const groupLetters = Object.keys(seed.groups) as GroupLetter[];
const allTeams = Object.values(seed.groups).flat();
const pickOptions: GroupPickOutcome[] = ["1", "X", "2"];

type Session = {
  token: string;
  playerId: string;
  playerName: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

// Hash-based routing so the SPA works on a static host (GitHub Pages) under any
// base path, with deep links and refresh surviving — no server rewrite rules needed.
// Routes: #/ → player picks, #/leaderboard → public leaderboard, #/admin → admin.
function getRoute(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return (hash || "/").replace(/\/+$/, "") || "/";
}

function useRoute(): string {
  const [route, setRoute] = useState(getRoute());
  useEffect(() => {
    const onChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    void configLoaded.then(() => setConfigReady(true));
  }, []);

  if (!configReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper text-ink">
        <p className="text-ink/50">Loading…</p>
      </main>
    );
  }

  const page =
    route === "/admin"
      ? <AdminPage />
      : route === "/leaderboard"
      ? <LeaderboardPage />
      : route === "/overview"
      ? <OverviewPage />
      : <PlayerPage />;
  return (
    <>
      {page}
      {route === "/admin" ? null : <RouteNav route={route} />}
    </>
  );
}

function RouteNav({ route }: { route: string }) {
  const links = [
    { href: "#/", label: "Picks", match: route === "/" },
    { href: "#/leaderboard", label: "Leaderboard", match: route === "/leaderboard" },
    { href: "#/overview", label: "Overview", match: route === "/overview" }
  ];
  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" aria-label="Primary">
      <div className="flex items-center gap-1 rounded-full border border-ink/10 bg-white/95 p-1 shadow-lg backdrop-blur">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={link.match ? "page" : undefined}
            className={`min-h-10 rounded-full px-5 text-sm font-bold transition ${
              link.match ? "bg-pitch text-white" : "text-ink/70 hover:bg-ink/5"
            } inline-flex items-center`}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

type LeaderboardRow = {
  playerId: string;
  playerName: string;
  rank: number;
  groupPoints: number;
  r32Points: number;
  r16Points: number;
  qfPoints: number;
  sfPoints: number;
  finalPoints: number;
  championPoints: number;
  knockoutPoints: number;
  total: number;
};

const rankMedal = ["🥇", "🥈", "🥉"] as const;
const rankClass = [
  "bg-yellow-50 border-l-4 border-yellow-400",
  "bg-slate-50 border-l-4 border-slate-400",
  "bg-orange-50 border-l-4 border-orange-400"
] as const;

function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadLeaderboard() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/leaderboard`);
      if (!response.ok) throw new Error("Failed to load");
      const body = (await response.json()) as { leaderboard: LeaderboardRow[] };
      setRows(body.leaderboard);
      setLastRefreshed(new Date());
      setError(null);
    } catch {
      setError("Leaderboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLeaderboard();
    const interval = window.setInterval(() => void loadLeaderboard(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const hasKoData = rows.some((r) => r.knockoutPoints > 0);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 pb-24 sm:px-6 lg:px-8">
        <header className="grid gap-4 rounded-md border border-ink/10 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-red-700">VM-tipping 2026</p>
            <h1 className="mt-2 text-4xl font-black leading-none sm:text-6xl">Leaderboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed ? (
              <span className="text-sm text-ink/50">
                Updated {lastRefreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-ink/20 bg-white px-4 text-sm font-bold shadow-sm"
              onClick={() => void loadLeaderboard()}
              type="button"
            >
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800">{error}</p> : null}
        {loading && !error ? <p className="text-center text-ink/50 py-12">Loading…</p> : null}

        {!loading && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-ink/10 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-pitch text-white">
                  <th className="px-4 py-3 text-left font-black">Rank</th>
                  <th className="px-4 py-3 text-left font-black">Player</th>
                  <th className="px-4 py-3 text-right font-black">Group</th>
                  {hasKoData ? (
                    <>
                      <th className="px-3 py-3 text-right font-black text-white/80">R32</th>
                      <th className="px-3 py-3 text-right font-black text-white/80">R16</th>
                      <th className="px-3 py-3 text-right font-black text-white/80">QF</th>
                      <th className="px-3 py-3 text-right font-black text-white/80">SF</th>
                      <th className="px-3 py-3 text-right font-black text-white/80">Final</th>
                      <th className="px-3 py-3 text-right font-black text-white/80">KO</th>
                    </>
                  ) : null}
                  <th className="px-4 py-3 text-right font-black">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const podium = row.rank <= 3 ? row.rank - 1 : null;
                  return (
                    <tr
                      key={row.playerId}
                      className={[
                        "border-b border-ink/5 last:border-0",
                        podium !== null ? rankClass[podium] : "hover:bg-paper/60"
                      ].join(" ")}
                    >
                      <td className="px-4 py-3 font-black text-ink/70">
                        {podium !== null ? (
                          <span aria-label={`Rank ${row.rank}`}>{rankMedal[podium]}</span>
                        ) : (
                          `#${row.rank}`
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold">{row.playerName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.groupPoints}</td>
                      {hasKoData ? (
                        <>
                          <td className="px-3 py-3 text-right tabular-nums text-ink/60">{row.r32Points || "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-ink/60">{row.r16Points || "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-ink/60">{row.qfPoints || "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-ink/60">{row.sfPoints || "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-ink/60">{row.finalPoints || "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-ink/60">{row.knockoutPoints || "—"}</td>
                        </>
                      ) : null}
                      <td className="px-4 py-3 text-right font-black tabular-nums text-pitch">{row.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <footer className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
          <Trophy size={18} aria-hidden="true" />
          <span>Knockout columns appear once admin has entered knockout results. Auto-refreshes every 60 s.</span>
        </footer>
      </section>
    </main>
  );
}

type OverviewMatch = {
  id: string;
  group: string;
  homeTeam: string;
  awayTeam: string;
  result: "1" | "X" | "2" | null;
};

type PlayerPicks = {
  group: Record<string, GroupPickOutcome>;
  knockout: Record<string, string[]>;
};

function OverviewPage() {
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [matches, setMatches] = useState<OverviewMatch[]>([]);
  const [knockout, setKnockout] = useState<Record<string, string[]>>({});
  const [champion, setChampion] = useState<string | null>(null);
  const [allPicks, setAllPicks] = useState<Record<string, PlayerPicks>>({});
  const [tab, setTab] = useState<"group" | "knockout">("group");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  async function load() {
    try {
      const stateRes = await fetch(`${apiBaseUrl}/api/admin/state`);
      if (!stateRes.ok) throw new Error("Failed to load");
      const state = (await stateRes.json()) as AdminState & { players: { id: string; name: string }[] };

      setMatches(state.matches);
      setKnockout(state.knockout ?? {});
      setChampion(state.champion ?? null);
      setPlayers(state.players ?? []);

      const picksMap: Record<string, PlayerPicks> = {};
      await Promise.all(
        (state.players ?? []).map(async (player) => {
          try {
            const res = await fetch(`${apiBaseUrl}/api/picks/${player.id}`);
            if (res.ok) {
              const data = (await res.json()) as { group?: Record<string, GroupPickOutcome>; knockout?: Record<string, string[]> };
              picksMap[player.id] = { group: data.group ?? {}, knockout: data.knockout ?? {} };
            }
          } catch {
            // skip failing player
          }
        })
      );
      setAllPicks(picksMap);
      setLastRefreshed(new Date());
      setError(null);
    } catch {
      setError("Overview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const groupedMatches = useMemo(
    () =>
      groupLetters.reduce<Record<GroupLetter, OverviewMatch[]>>((groups, g) => {
        groups[g] = matches.filter((m) => m.group === g);
        return groups;
      }, {} as Record<GroupLetter, OverviewMatch[]>),
    [matches]
  );

  const pickLabel = (pick: GroupPickOutcome | undefined, result: "1" | "X" | "2" | null) => {
    if (!pick) return { text: "—", cls: "text-ink/25" };
    if (!result) return { text: pick, cls: "text-ink/60" };
    if (pick === result) return { text: pick, cls: "font-black text-green-700" };
    return { text: pick, cls: "text-red-600 line-through" };
  };

  const koRounds = [
    { id: "r32", label: "Round of 32", pts: 2 },
    { id: "r16", label: "Round of 16", pts: 3 },
    { id: "qf", label: "Quarter-finals", pts: 4 },
    { id: "sf", label: "Semi-finals", pts: 5 },
    { id: "final", label: "Final", pts: 6 },
  ];

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-5 px-4 py-5 pb-24 sm:px-6 lg:px-8">
        <header className="grid gap-4 rounded-md border border-ink/10 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-red-700">VM-tipping 2026</p>
            <h1 className="mt-2 text-4xl font-black leading-none sm:text-6xl">Overview</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed ? (
              <span className="text-sm text-ink/50">
                Updated {lastRefreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-ink/20 bg-white px-4 text-sm font-bold shadow-sm"
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        <div className="flex gap-1 rounded-md border border-ink/10 bg-white p-1 shadow-sm self-start">
          <button
            className={`min-h-9 rounded px-4 text-sm font-bold transition ${tab === "group" ? "bg-pitch text-white" : "text-ink/60 hover:bg-ink/5"}`}
            onClick={() => setTab("group")}
            type="button"
          >
            Group Stage
          </button>
          <button
            className={`min-h-9 rounded px-4 text-sm font-bold transition ${tab === "knockout" ? "bg-pitch text-white" : "text-ink/60 hover:bg-ink/5"}`}
            onClick={() => setTab("knockout")}
            type="button"
          >
            Knockout
          </button>
        </div>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800">{error}</p> : null}
        {loading ? <p className="py-12 text-center text-ink/50">Loading…</p> : null}

        {!loading && tab === "group" ? (
          <div className="grid gap-5">
            {groupLetters.map((g) => (
              <div key={g} className="overflow-x-auto rounded-md border border-ink/10 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-pitch text-white">
                      <th className="px-3 py-2 text-left font-black text-white/70 w-6">Grp</th>
                      <th className="px-3 py-2 text-left font-black">Home</th>
                      <th className="px-3 py-2 text-center font-black text-white/70">vs</th>
                      <th className="px-3 py-2 text-left font-black">Away</th>
                      <th className="px-3 py-2 text-center font-black">Result</th>
                      {players.map((p) => (
                        <th key={p.id} className="px-3 py-2 text-center font-black whitespace-nowrap">{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(groupedMatches[g] ?? []).map((match, i) => {
                      const correctCount = players.filter(
                        (p) => allPicks[p.id]?.group[match.id] === match.result
                      ).length;
                      return (
                        <tr key={match.id} className={`border-b border-ink/5 last:border-0 ${i % 2 === 0 ? "" : "bg-paper/40"}`}>
                          <td className="px-3 py-2 font-bold text-red-700">{match.group}</td>
                          <td className="px-3 py-2 font-semibold whitespace-nowrap">{match.homeTeam}</td>
                          <td className="px-3 py-2 text-center text-ink/40">vs</td>
                          <td className="px-3 py-2 font-semibold whitespace-nowrap">{match.awayTeam}</td>
                          <td className="px-3 py-2 text-center">
                            {match.result ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-pitch font-black text-white text-xs">
                                {match.result}
                              </span>
                            ) : (
                              <span className="text-ink/30">—</span>
                            )}
                          </td>
                          {players.map((p) => {
                            const pick = allPicks[p.id]?.group[match.id];
                            const { text, cls } = pickLabel(pick, match.result);
                            return (
                              <td key={p.id} className="px-3 py-2 text-center">
                                <span className={`text-sm tabular-nums ${cls}`}>{text}</span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink/10 bg-paper">
                      <td colSpan={5} className="px-3 py-2 text-xs font-bold text-ink/50 text-right">Correct picks:</td>
                      {players.map((p) => {
                        const groupMatches = groupedMatches[g] ?? [];
                        const correct = groupMatches.filter(
                          (m) => m.result && allPicks[p.id]?.group[m.id] === m.result
                        ).length;
                        const total = groupMatches.filter((m) => m.result).length;
                        return (
                          <td key={p.id} className="px-3 py-2 text-center text-xs font-bold tabular-nums">
                            {total > 0 ? <span className="text-green-700">{correct}/{total}</span> : <span className="text-ink/30">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && tab === "knockout" ? (
          <div className="grid gap-5">
            {koRounds.map(({ id, label, pts }) => {
              const actual = new Set(knockout[id] ?? []);
              const allTeamsInRound = new Set<string>([
                ...actual,
                ...players.flatMap((p) => allPicks[p.id]?.knockout[id] ?? [])
              ]);
              const teamRows = [...allTeamsInRound].sort((a, b) => {
                const aActual = actual.has(a) ? 0 : 1;
                const bActual = actual.has(b) ? 0 : 1;
                return aActual - bActual || a.localeCompare(b);
              });

              return (
                <div key={id} className="overflow-x-auto rounded-md border border-ink/10 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-pitch text-white">
                        <th className="px-4 py-3 text-left font-black" colSpan={2}>
                          {label} — {pts} pts/team
                        </th>
                        {players.map((p) => (
                          <th key={p.id} className="px-3 py-3 text-center font-black whitespace-nowrap">{p.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teamRows.length === 0 ? (
                        <tr>
                          <td colSpan={2 + players.length} className="px-4 py-4 text-center text-ink/40 italic">
                            No picks or actuals recorded yet
                          </td>
                        </tr>
                      ) : (
                        teamRows.map((team, i) => (
                          <tr key={team} className={`border-b border-ink/5 last:border-0 ${i % 2 === 0 ? "" : "bg-paper/40"}`}>
                            <td className="px-4 py-2 w-5">
                              {actual.has(team) ? (
                                <Check size={14} className="text-green-600" aria-label="Advanced" />
                              ) : (
                                <span className="w-4 inline-block" />
                              )}
                            </td>
                            <td className={`px-2 py-2 font-semibold whitespace-nowrap ${actual.has(team) ? "" : "text-ink/50"}`}>
                              {team}
                            </td>
                            {players.map((p) => {
                              const picks = new Set(allPicks[p.id]?.knockout[id] ?? []);
                              const picked = picks.has(team);
                              const correct = picked && actual.has(team);
                              const wrong = picked && actual.size > 0 && !actual.has(team);
                              return (
                                <td key={p.id} className="px-3 py-2 text-center">
                                  {picked ? (
                                    <span
                                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                                        correct ? "bg-green-100 text-green-700" : wrong ? "bg-red-100 text-red-600" : "bg-ink/10 text-ink/60"
                                      }`}
                                    >
                                      {correct ? "✓" : wrong ? "✗" : "·"}
                                    </span>
                                  ) : null}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-ink/10 bg-paper">
                        <td colSpan={2} className="px-4 py-2 text-xs font-bold text-ink/50 text-right">Correct:</td>
                        {players.map((p) => {
                          const picks = new Set(allPicks[p.id]?.knockout[id] ?? []);
                          const correct = [...picks].filter((t) => actual.has(t)).length;
                          return (
                            <td key={p.id} className="px-3 py-2 text-center text-xs font-bold tabular-nums">
                              {actual.size > 0 ? (
                                <span className="text-green-700">{correct}/{actual.size}</span>
                              ) : (
                                <span className="text-ink/30">{picks.size} picked</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}

            {/* Champion */}
            <div className="overflow-x-auto rounded-md border border-ink/10 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-pitch text-white">
                    <th className="px-4 py-3 text-left font-black" colSpan={2}>
                      Champion — 7 pts
                    </th>
                    {players.map((p) => (
                      <th key={p.id} className="px-3 py-3 text-center font-black whitespace-nowrap">{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const champPicks = players.map((p) => allPicks[p.id]?.knockout.champion?.[0] ?? null);
                    const allChampTeams = [...new Set([...(champion ? [champion] : []), ...champPicks.filter((x): x is string => Boolean(x))])].sort((a, b) => {
                      if (champion === a) return -1;
                      if (champion === b) return 1;
                      return a.localeCompare(b);
                    });
                    return allChampTeams.length === 0 ? (
                      <tr>
                        <td colSpan={2 + players.length} className="px-4 py-4 text-center text-ink/40 italic">
                          No champion picks recorded yet
                        </td>
                      </tr>
                    ) : (
                      allChampTeams.map((team, i) => (
                        <tr key={team} className={`border-b border-ink/5 last:border-0 ${i % 2 === 0 ? "" : "bg-paper/40"}`}>
                          <td className="px-4 py-2 w-5">
                            {champion === team ? (
                              <Crown size={14} className="text-yellow-500" aria-label="Champion" />
                            ) : (
                              <span className="w-4 inline-block" />
                            )}
                          </td>
                          <td className={`px-2 py-2 font-semibold whitespace-nowrap ${champion === team ? "" : "text-ink/50"}`}>
                            {team}
                          </td>
                          {players.map((p) => {
                            const pick = allPicks[p.id]?.knockout.champion?.[0];
                            const picked = pick === team;
                            const correct = picked && champion === team;
                            const wrong = picked && champion !== null && champion !== team;
                            return (
                              <td key={p.id} className="px-3 py-2 text-center">
                                {picked ? (
                                  <span
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                                      correct ? "bg-yellow-100 text-yellow-700" : wrong ? "bg-red-100 text-red-600" : "bg-ink/10 text-ink/60"
                                    }`}
                                  >
                                    {correct ? "★" : wrong ? "✗" : "·"}
                                  </span>
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function PlayerPage() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groupPicks, setGroupPicks] = useState<Record<string, GroupPickOutcome>>({});
  const [activeGroup, setActiveGroup] = useState<GroupLetter>("A");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [advancement, setAdvancement] = useState<Record<string, { first?: string; second?: string; third?: string }>>({});
  const saveTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/matches`)
      .then((response) => response.json())
      .then((payload: { matches: Match[]; players?: { id: string; name: string }[]; advancement?: Record<string, { first?: string; second?: string; third?: string }> }) => {
        setMatches(payload.matches);
        if (payload.players) setPlayers(payload.players);
        if (payload.advancement) setAdvancement(payload.advancement);
      })
      .catch(() => setError("Match schedule could not be loaded."));
  }, []);

  useEffect(() => {
    if (!session) return;

    fetch(`${apiBaseUrl}/api/picks/${session.playerId}`, {
      headers: { authorization: `Bearer ${session.token}` }
    })
      .then((response) => {
        if (response.status === 401 || response.status === 403) {
          // Session is invalid or expired — clear it so the user is shown login
          localStorage.removeItem(sessionKey);
          setSession(null);
          return null;
        }
        if (!response.ok) throw new Error("picks fetch failed");
        return response.json();
      })
      .then((payload: { group: Record<string, GroupPickOutcome> } | null) => {
        if (payload?.group) setGroupPicks(payload.group);
      })
      .catch(() => setError("Saved picks could not be restored."));
  }, [session]);

  const groupedMatches = useMemo(
    () =>
      groupLetters.reduce<Record<GroupLetter, Match[]>>((groups, group) => {
        groups[group] = matches.filter((match) => match.groupName === group || match.group === group);
        return groups;
      }, {} as Record<GroupLetter, Match[]>),
    [matches]
  );

  async function login(name: string, pin: string) {
    setError(null);
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin })
      });
    } catch {
      setError("Could not reach the server. Check your connection.");
      return;
    }

    if (!response.ok) {
      setError("Name or league PIN was not accepted.");
      return;
    }

    const body = (await response.json()) as {
      player: { id: string; name: string };
      session: { token: string; playerId: string };
    };
    const nextSession = {
      token: body.session.token,
      playerId: body.session.playerId,
      playerName: body.player.name
    };
    localStorage.setItem(sessionKey, JSON.stringify(nextSession));
    setSession(nextSession);
  }

  async function saveName() {
    if (!session) return;
    const name = nameInput.trim();
    if (!name) return;
    setNameError(null);

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/player/name`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
    } catch {
      setNameError("Could not reach the server.");
      return;
    }

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setNameError(body.error ?? "Could not save name.");
      return;
    }

    // VMT-20: migrate localStorage KO key to new name before updating session
    renameKnockoutPicks(window.localStorage, session.playerName, name);
    const updated = { ...session, playerName: name };
    localStorage.setItem(sessionKey, JSON.stringify(updated));
    setSession(updated);
    setPlayers((prev) => prev.map((p) => (p.id === session.playerId ? { ...p, name } : p)));
    setEditingName(false);
    setNameError(null);
  }

  function queuePickSave(match: Match, pick: GroupPickOutcome) {
    if (!session || isLocked(match)) return;

    setGroupPicks((current) => ({ ...current, [match.id]: pick }));
    setSaveState("saving");
    window.clearTimeout(saveTimers.current[match.id]);
    saveTimers.current[match.id] = window.setTimeout(() => {
      void savePick(match.id, pick);
    }, 250);
  }

  async function savePick(matchId: string, pick: GroupPickOutcome) {
    if (!session) return;

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/picks`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ matchId, pick })
      });
    } catch {
      setSaveState("error");
      setError("Could not reach the server.");
      return;
    }

    if (!response.ok) {
      setSaveState("error");
      setError(response.status === 409 ? "That match has locked." : "Pick could not be saved.");
      return;
    }

    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
  }

  function logout() {
    localStorage.removeItem(sessionKey);
    setSession(null);
    setGroupPicks({});
  }

  if (!session) {
    return <LoginScreen error={error} players={players} onLogin={login} />;
  }

  const pickedCount = Object.keys(groupPicks).length;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 pb-24 sm:px-6 lg:px-8">
        <header className="grid gap-5 rounded-md border border-ink/10 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-red-700">VM-tipping 2026</p>
            <h1 className="mt-2 text-4xl font-black leading-none sm:text-6xl">Group-stage picks</h1>
          </div>
          <div className="grid min-w-52 gap-2 rounded-md border border-ink/10 bg-paper p-4 text-sm text-ink/70">
            {editingName ? (
              <div className="grid gap-2">
                <input
                  autoFocus
                  className="min-h-10 rounded-md border border-ink/20 bg-white px-3 text-base text-ink"
                  maxLength={50}
                  placeholder="Your name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveName(); if (e.key === "Escape") setEditingName(false); }}
                />
                {nameError ? <p className="text-xs font-semibold text-red-700">{nameError}</p> : null}
                <div className="flex gap-2">
                  <button className="flex-1 min-h-9 rounded-md bg-pitch text-xs font-black text-white" onClick={() => void saveName()} type="button">Save</button>
                  <button className="min-h-9 rounded-md border border-ink/20 px-3 text-xs font-bold" onClick={() => { setEditingName(false); setNameError(null); }} type="button">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 font-semibold text-pitch">
                <Trophy size={18} aria-hidden="true" />
                <span>{session.playerName}</span>
                <button
                  aria-label="Edit name"
                  className="ml-auto text-ink/40 hover:text-ink"
                  onClick={() => { setNameInput(session.playerName); setEditingName(true); }}
                  type="button"
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
            <strong className="text-2xl text-ink">{pickedCount}/72</strong>
            <SaveIndicator state={saveState} />
            <button className="text-left text-sm font-bold text-red-700" onClick={logout} type="button">
              Switch player
            </button>
          </div>
        </header>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800">{error}</p> : null}

        <nav className="grid grid-cols-6 gap-2 md:grid-cols-12" aria-label="Groups">
          {groupLetters.map((group) => (
            <button
              className={
                group === activeGroup
                  ? "min-h-11 rounded-md bg-pitch text-base font-black text-white"
                  : "min-h-11 rounded-md border border-ink/10 bg-white text-base font-black text-ink shadow-sm"
              }
              key={group}
              onClick={() => setActiveGroup(group)}
              type="button"
            >
              {group}
            </button>
          ))}
        </nav>

        <section className="grid gap-3" aria-label={`Group ${activeGroup} matches`}>
          <div className="rounded-md border border-ink/10 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-normal text-red-700">Group {activeGroup}</p>
            <h2 className="mt-1 text-xl font-black">{seed.groups[activeGroup].join(" · ")}</h2>
          </div>
          {(groupedMatches[activeGroup] ?? []).map((match) => (
            <GroupMatchRow
              key={match.id}
              match={match}
              selectedPick={groupPicks[match.id]}
              onPick={(pick) => queuePickSave(match, pick)}
            />
          ))}
        </section>

        <KnockoutSection session={session} advancement={advancement} />
      </section>
    </main>
  );
}

type AdminState = {
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

function AdminPage() {
  const [pinInput, setPinInput] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [state, setState] = useState<AdminState | null>(null);
  const [status, setStatus] = useState("Locked");

  async function loadState() {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/admin/state`);
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
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPin, ...body })
    });
    if (!response.ok) {
      setStatus("Save failed");
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
                          {(seed.groups as Record<string, string[]>)[group]?.map((team) => (
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
                  {groupLetters.map((group) => (
                    <div className="grid gap-1 rounded border border-ink/10 bg-paper p-3" key={group}>
                      <span className="text-xs font-black uppercase text-red-700">Group {group}</span>
                      <select
                        className="min-h-9 border border-ink/20 bg-white px-2 text-sm"
                        value={state.advancement?.[group]?.third ?? ""}
                        onChange={(event) => post("/api/admin/advancement", { group, position: 3, team: event.target.value })}
                      >
                        <option value="">— did not advance —</option>
                        {(seed.groups as Record<string, string[]>)[group]?.map((team) => (
                          <option key={team} value={team}>{team}</option>
                        ))}
                      </select>
                    </div>
                  ))}
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
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(state.scoring).map(([key, value]) => (
                    <label className="grid gap-1" key={key}>
                      <span className="text-sm font-bold text-ink/70">{key}</span>
                      <input
                        className="min-h-10 border border-ink/20 px-3"
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

function LoginScreen({
  error,
  players,
  onLogin
}: {
  error: string | null;
  players: { id: string; name: string }[];
  onLogin: (name: string, pin: string) => void;
}) {
  const displayPlayers = players.length > 0 ? players : seed.players.map((n, i) => ({ id: `player-${i + 1}`, name: n }));
  const [name, setName] = useState(displayPlayers[0]?.name ?? "");
  const [pin, setPin] = useState("");

  // keep selected name in sync when the player list loads
  useEffect(() => {
    if (players.length > 0 && !players.find((p) => p.name === name)) {
      setName(players[0].name);
    }
  }, [players]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <section className="w-full max-w-md rounded-md border border-ink/10 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-normal text-red-700">VM-tipping 2026</p>
        <h1 className="mt-2 text-4xl font-black leading-none">Player login</h1>
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(name, pin);
          }}
        >
          <label className="grid gap-2 text-sm font-bold text-ink/70">
            Player
            <select
              className="min-h-12 rounded-md border border-ink/20 bg-paper px-3 text-base text-ink"
              value={name}
              onChange={(event) => setName(event.target.value)}
            >
              {displayPlayers.map((player) => (
                <option key={player.id} value={player.name}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink/70">
            League PIN
            <input
              className="min-h-12 rounded-md border border-ink/20 bg-paper px-3 text-base text-ink"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          </label>
          {error ? <p className="font-semibold text-red-800">{error}</p> : null}
          <button className="min-h-12 rounded-md bg-pitch px-4 font-black text-white" type="submit">
            Open picks
          </button>
        </form>
      </section>
    </main>
  );
}

function GroupMatchRow({
  match,
  selectedPick,
  onPick
}: {
  match: Match;
  selectedPick?: GroupPickOutcome;
  onPick: (pick: GroupPickOutcome) => void;
}) {
  const locked = isLocked(match);
  const kickoff = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(match.kickoffAt));

  return (
    <article className={locked ? "rounded-md border border-ink/10 bg-white/70 p-4 opacity-65 shadow-sm" : "rounded-md border border-ink/10 bg-white p-4 shadow-sm"}>
      <div className="grid gap-3 md:grid-cols-[8rem_1fr_12rem] md:items-center">
        <div className="text-sm font-bold text-ink/60">
          <span>{kickoff}</span>
          {locked ? (
            <span className="mt-1 flex items-center gap-1 text-ink/50">
              <Lock size={14} aria-hidden="true" /> Locked
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <strong className="min-w-0 break-words text-base">{match.homeTeam}</strong>
          <span className="text-xs font-black uppercase text-ink/40">vs</span>
          <strong className="min-w-0 break-words text-right text-base">{match.awayTeam}</strong>
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={`${match.homeTeam} against ${match.awayTeam}`}>
          {pickOptions.map((pick) => (
            <button
              className={
                selectedPick === pick
                  ? "min-h-11 rounded-md bg-red-700 font-black text-white"
                  : "min-h-11 rounded-md border border-ink/15 bg-paper font-black text-ink"
              }
              disabled={locked}
              key={pick}
              onClick={() => onPick(pick)}
              type="button"
            >
              {pick}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function KnockoutSection({ session, advancement }: { session: Session; advancement: Record<string, { first?: string; second?: string; third?: string }> }) {
  const locked = Date.now() >= Date.parse(seed.knockoutDeadline);
  const [picks, setPicks] = useState<KnockoutPicks>(() => {
    if (typeof window === "undefined") return createEmptyKnockoutPicks();
    return readKnockoutPicks(window.localStorage, session.playerName);
  });
  const [koSaveState, setKoSaveState] = useState<SaveState>("idle");
  const duplicates = useMemo(() => duplicateTeamNamesByRound(picks), [picks]);
  const saveTimer = useRef<number | undefined>(undefined);

  const teamPool = useMemo(() => {
    const advanced = Object.values(advancement).flatMap((entry) =>
      [entry.first, entry.second, entry.third].filter((t): t is string => Boolean(t))
    );
    return advanced.length > 0 ? advanced.sort() : allTeams;
  }, [advancement]);

  // VMT-12: load knockout picks from server (server is authoritative)
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/picks/${session.playerId}`, {
      headers: { authorization: `Bearer ${session.token}` }
    })
      .then((r) => r.json())
      .then((payload: { knockout?: Record<string, string[]> }) => {
        if (!payload.knockout) return;
        const serverPicks: KnockoutPicks = {
          champion: payload.knockout.champion?.[0] ?? "",
          rounds: knockoutRounds.reduce(
            (acc, r) => ({
              ...acc,
              [r.id]: Array.from({ length: r.slotCount }, (_, i) => payload.knockout![r.id]?.[i] ?? "")
            }),
            {} as Record<KnockoutRoundId, string[]>
          )
        };
        setPicks(serverPicks);
        writeKnockoutPicks(window.localStorage, session.playerName, serverPicks);
      })
      .catch(() => {}); // keep localStorage picks if server unavailable
  }, [session.playerId]);

  // Persist to localStorage on every change
  useEffect(() => {
    writeKnockoutPicks(window.localStorage, session.playerName, picks);
  }, [picks, session.playerName]);

  function scheduleSave(updatedPicks: KnockoutPicks) {
    if (locked) return;
    window.clearTimeout(saveTimer.current);
    setKoSaveState("saving");
    saveTimer.current = window.setTimeout(() => void saveToServer(updatedPicks), 500);
  }

  async function saveToServer(updatedPicks: KnockoutPicks) {
    try {
      const headers = { authorization: `Bearer ${session.token}`, "content-type": "application/json" };
      const requests: Promise<Response>[] = knockoutRounds.map((r) =>
        fetch(`${apiBaseUrl}/api/picks`, {
          method: "POST",
          headers,
          body: JSON.stringify({ round: r.id, teamNames: updatedPicks.rounds[r.id].filter(Boolean) })
        })
      );
      if (updatedPicks.champion) {
        requests.push(
          fetch(`${apiBaseUrl}/api/picks`, {
            method: "POST",
            headers,
            body: JSON.stringify({ round: "champion", teamName: updatedPicks.champion })
          })
        );
      }
      const responses = await Promise.all(requests);
      if (responses.every((r) => r.ok)) {
        setKoSaveState("saved");
        window.setTimeout(() => setKoSaveState("idle"), 1200);
      } else {
        setKoSaveState("error");
      }
    } catch {
      setKoSaveState("error");
    }
  }

  function updateRoundPick(roundId: KnockoutRoundId, slotIndex: number, teamName: string) {
    if (locked) return;
    setPicks((current) => {
      const next = {
        ...current,
        rounds: {
          ...current.rounds,
          [roundId]: current.rounds[roundId].map((pick, index) => (index === slotIndex ? teamName : pick))
        }
      };
      scheduleSave(next);
      return next;
    });
  }

  function updateChampion(teamName: string) {
    if (locked) return;
    setPicks((current) => {
      const next = { ...current, champion: teamName };
      scheduleSave(next);
      return next;
    });
  }

  const completedSlots = knockoutRounds.reduce(
    (total, round) => total + picks.rounds[round.id].filter(Boolean).length,
    picks.champion ? 1 : 0
  );
  const totalSlots = knockoutRounds.reduce((total, round) => total + round.slotCount, 1);

  return (
    <>
      <header className="grid gap-5 rounded-md border border-ink/10 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-normal text-red-700">VM-tipping 2026</p>
          <h1 className="mt-2 text-4xl font-black leading-none sm:text-6xl">Knockout picks</h1>
        </div>
        <div className="grid min-w-48 gap-2 rounded-md border border-ink/10 bg-paper p-4 text-sm text-ink/70">
          {locked ? (
            <div className="flex items-center gap-2 font-semibold text-red-700">
              <LockKeyhole size={18} aria-hidden="true" />
              <span>Picks locked</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 font-semibold text-pitch">
              <Save size={18} aria-hidden="true" />
              <span>Saving for {session.playerName}</span>
            </div>
          )}
          <strong className="text-2xl text-ink">
            {completedSlots}/{totalSlots}
          </strong>
          {!locked && <SaveIndicator state={koSaveState} />}
        </div>
      </header>

      <section className="grid gap-4 rounded-md border border-ink/10 bg-white p-5 shadow-sm md:grid-cols-[1fr_minmax(240px,360px)] md:items-center">
        <div className="flex items-center gap-3">
          <Crown size={28} aria-hidden="true" className="text-yellow-600" />
          <div>
            <h2 className="text-xl font-bold">Champion</h2>
          </div>
        </div>
        <label className="grid gap-2">
          <span className="text-sm font-bold text-ink/70">Champion</span>
          <select
            className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base disabled:opacity-50"
            disabled={locked}
            value={picks.champion}
            onChange={(event) => updateChampion(event.target.value)}
          >
            <option value="">Choose champion</option>
            {teamPool.map((teamName) => (
              <option key={teamName} value={teamName}>
                {teamName}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Knockout rounds">
        {knockoutRounds.map((round) => {
          const duplicateNames = duplicates[round.id];
          return (
            <article className="overflow-hidden rounded-md border border-ink/10 bg-white shadow-sm" data-testid={`round-${round.id}`} key={round.id}>
              <div className="flex items-start justify-between gap-4 bg-pitch px-5 py-4 text-white">
                <div>
                  <p className="font-black text-lime">{round.shortLabel}</p>
                  <h2 className="mt-1 text-xl font-bold">{round.label}</h2>
                </div>
                <span className="rounded-full border border-white/20 px-3 py-1 text-sm font-bold">{seed.scoring[round.pointsKey]} pts</span>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {picks.rounds[round.id].map((teamName, slotIndex) => {
                  const duplicate = Boolean(teamName && duplicateNames.has(teamName));
                  return (
                    <label
                      className={
                        duplicate
                          ? "grid gap-2 rounded-md border border-yellow-500 bg-yellow-100 p-3"
                          : "grid gap-2 rounded-md border border-transparent bg-paper p-3"
                      }
                      key={slotIndex}
                    >
                      <span className="text-sm font-bold text-ink/70">
                        {round.label} match {slotIndex + 1}
                      </span>
                      <select
                        aria-label={`${round.label} match ${slotIndex + 1}`}
                        className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base disabled:opacity-50"
                        disabled={locked}
                        value={teamName}
                        onChange={(event) => updateRoundPick(round.id, slotIndex, event.target.value)}
                      >
                        <option value="">Pick advancing team</option>
                        {teamPool.map((optionTeamName) => (
                          <option key={optionTeamName} value={optionTeamName}>
                            {optionTeamName}
                          </option>
                        ))}
                      </select>
                      {duplicate ? (
                        <em className="text-sm font-black not-italic text-yellow-800" title="This duplicate team scores once">
                          scores once
                        </em>
                      ) : teamName ? (
                        <Check size={16} aria-label="Picked" className="text-green-700" />
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      <footer className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
        <Trophy size={18} aria-hidden="true" />
        <span>{Object.keys(advancement).length > 0 ? `Showing ${Object.values(advancement).flatMap(e => [e.first, e.second, e.third]).filter(Boolean).length} teams that advanced from the group stage.` : "Showing all teams — admin has not yet set group advancement."}</span>
      </footer>
    </>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-2 text-ink/70">
        <RefreshCw size={16} aria-hidden="true" /> Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-2 text-green-700">
        <Check size={16} aria-hidden="true" /> Saved
      </span>
    );
  }
  if (state === "error") return <span className="font-semibold text-red-800">Save failed</span>;
  return <span className="font-semibold text-ink/60">Auto-save on</span>;
}

function isLocked(match: Match) {
  return Boolean(match.locked) || Date.now() >= Date.parse(match.kickoffAt);
}

function readSession(): Session | null {
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
