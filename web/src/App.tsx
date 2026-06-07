import { Check, Crown, LockKeyhole, Save, ShieldCheck, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import seed from "../../data/seed.json";
import {
  KnockoutRoundId,
  KnockoutPicks,
  createEmptyKnockoutPicks,
  duplicateTeamNamesByRound,
  knockoutRounds,
  readKnockoutPicks,
  writeKnockoutPicks
} from "./lib/knockout";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const selectedPlayer = seed.players[0];
const allTeams = Object.values(seed.groups).flat();

export function App() {
  if (window.location.pathname === "/admin") {
    return <AdminPage />;
  }
  return <KnockoutPage />;
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
};

const adminRounds = [
  { id: "r32", label: "Round of 32", slots: 16 },
  { id: "r16", label: "Round of 16", slots: 8 },
  { id: "qf", label: "Quarter-final", slots: 4 },
  { id: "sf", label: "Semi-final", slots: 2 },
  { id: "final", label: "Final", slots: 1 }
] as const;

function AdminPage() {
  const [pinInput, setPinInput] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [state, setState] = useState<AdminState | null>(null);
  const [status, setStatus] = useState("Locked");

  async function loadState() {
    const response = await fetch(`${apiBaseUrl}/api/admin/state`);
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
            <button className="inline-flex min-h-11 items-center gap-2 bg-red-700 px-4 font-black text-white" onClick={unlock}>
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
                    <span className="text-xs font-black uppercase text-red-700">Group {match.group} · {match.id}</span>
                    <strong>{match.homeTeam} vs {match.awayTeam}</strong>
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
                    <option key={team} value={team}>{team}</option>
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
                    <span className="font-bold">#{row.rank} {row.playerName ?? row.name}</span>
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

function KnockoutPage() {
  const [picks, setPicks] = useState<KnockoutPicks>(() => {
    if (typeof window === "undefined") {
      return createEmptyKnockoutPicks();
    }
    return readKnockoutPicks(window.localStorage, selectedPlayer);
  });
  const duplicates = useMemo(() => duplicateTeamNamesByRound(picks), [picks]);

  useEffect(() => {
    writeKnockoutPicks(window.localStorage, selectedPlayer, picks);
  }, [picks]);

  const updateRoundPick = (roundId: KnockoutRoundId, slotIndex: number, teamName: string) => {
    setPicks((current) => ({
      ...current,
      rounds: {
        ...current.rounds,
        [roundId]: current.rounds[roundId].map((pick, index) => (index === slotIndex ? teamName : pick))
      }
    }));
  };

  const completedSlots = knockoutRounds.reduce(
    (total, round) => total + picks.rounds[round.id].filter(Boolean).length,
    picks.champion ? 1 : 0
  );
  const totalSlots = knockoutRounds.reduce((total, round) => total + round.slotCount, 1);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="grid gap-5 rounded-md border border-ink/10 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-normal text-red-700">VM-tipping 2026</p>
            <h1 className="mt-2 text-4xl font-black leading-none sm:text-6xl">Knockout picks</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">
              Pick the teams you think advance from each knockout round. Duplicate teams in the same round are
              highlighted because they score once.
            </p>
          </div>
          <div className="grid min-w-48 gap-2 rounded-md border border-ink/10 bg-paper p-4 text-sm text-ink/70">
            <div className="flex items-center gap-2 font-semibold text-pitch">
              <Save size={18} aria-hidden="true" />
              <span>Autosaved for {selectedPlayer}</span>
            </div>
            <strong className="text-2xl text-ink">
              {completedSlots}/{totalSlots}
            </strong>
            <span className="font-mono text-xs text-ink/50">API {apiBaseUrl}</span>
          </div>
        </header>

        <section className="grid gap-4 rounded-md border border-ink/10 bg-white p-5 shadow-sm md:grid-cols-[1fr_minmax(240px,360px)] md:items-center">
          <div className="flex items-center gap-3">
            <Crown size={28} aria-hidden="true" className="text-yellow-600" />
            <div>
              <h2 className="text-xl font-bold">Champion</h2>
              <p className="mt-1 text-sm text-ink/65">One final pick for the tournament winner.</p>
            </div>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-ink/70">Champion</span>
            <select
              className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base"
              value={picks.champion}
              onChange={(event) => setPicks({ ...picks, champion: event.target.value })}
            >
              <option value="">Choose champion</option>
              {allTeams.map((teamName) => (
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
              <article
                className="overflow-hidden rounded-md border border-ink/10 bg-white shadow-sm"
                data-testid={`round-${round.id}`}
                key={round.id}
              >
                <div className="flex items-start justify-between gap-4 bg-pitch px-5 py-4 text-white">
                  <div>
                    <p className="font-black text-lime">{round.shortLabel}</p>
                    <h2 className="mt-1 text-xl font-bold">{round.label}</h2>
                  </div>
                  <span className="rounded-full border border-white/20 px-3 py-1 text-sm font-bold">
                    {seed.scoring[round.pointsKey]} pts
                  </span>
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
                          className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base"
                          value={teamName}
                          onChange={(event) => updateRoundPick(round.id, slotIndex, event.target.value)}
                        >
                          <option value="">Pick advancing team</option>
                          {allTeams.map((optionTeamName) => (
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
          <span>Round options use every seeded team until bracket slot metadata is added to the seed/API.</span>
        </footer>
      </section>
    </main>
  );
}
