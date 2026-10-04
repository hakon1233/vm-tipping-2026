import { Check, Crown, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GroupPickOutcome } from "@vm-tipping-2026/shared";
import { getAdminState, getPlayerPicks, type AdminState } from "../api";
import { groupLetters, matchesByGroup } from "../lib/tournament";
import { readSession } from "../session";
import { BrandEyebrow } from "../ui";

type OverviewMatch = AdminState["matches"][number];

type PlayerPicks = {
  group: Record<string, GroupPickOutcome>;
  knockout: Record<string, string[]>;
};

export function OverviewPage() {
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
      const state = await getAdminState();

      setMatches(state.matches);
      setKnockout(state.knockout);
      setChampion(state.champion);
      setPlayers(state.players);

      // Reading picks needs a session; the Overview route is only shown to a
      // logged-in player. Before the group-stage deadline the server refuses
      // other players' picks, so their columns stay empty.
      const session = readSession();
      const picksMap: Record<string, PlayerPicks> = {};
      if (session) {
        await Promise.all(
          state.players.map(async (player) => {
            try {
              const picks = await getPlayerPicks(session.token, player.id);
              picksMap[player.id] = { group: picks.group, knockout: picks.knockout };
            } catch {
              // skip failing player
            }
          })
        );
      }
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

  const groupedMatches = useMemo(() => matchesByGroup(matches), [matches]);

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
            <BrandEyebrow />
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
