import { Download, RefreshCw, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { apiBaseUrl, apiFetch } from "../api";
import { readSession } from "../session";
import { BrandEyebrow } from "../ui";

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

export function LeaderboardPage() {
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
  const session = readSession();

  async function downloadExport(token: string) {
    const response = await apiFetch("/api/export.xlsx", { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (!response?.ok) {
      setError("The Excel export could not be downloaded.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "VMtipping2026-export.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 pb-24 sm:px-6 lg:px-8">
        <header className="grid gap-4 rounded-md border border-ink/10 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <BrandEyebrow />
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
            {/* The export holds everyone's picks, so it needs a logged-in player. */}
            {session ? (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-ink/20 bg-white px-4 text-sm font-bold shadow-sm"
                onClick={() => void downloadExport(session.token)}
                type="button"
              >
                <Download size={15} aria-hidden="true" />
                Excel
              </button>
            ) : null}
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
