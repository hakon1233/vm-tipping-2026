import { Lock, Pencil, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GroupLetter, GroupPickOutcome, Match } from "@vm-tipping-2026/shared";
import { ApiError, getMatches, getPlayerPicks, login as requestLogin, renamePlayer, saveGroupPick } from "../api";
import { renameKnockoutPicks } from "../lib/knockout";
import { groupLetters, isMatchLocked, matchesByGroup, seedPlayerNames, teamsInGroup } from "../lib/tournament";
import { clearSession, saveSession, useSession, type Session } from "../session";
import { BrandEyebrow, SaveIndicator, type SaveState } from "../ui";
import { KnockoutSection } from "./KnockoutSection";

const pickOptions: GroupPickOutcome[] = ["1", "X", "2"];

export function PlayerPage() {
  const session = useSession();
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
  // The server reports deadlinesDisabled on /api/matches (DEADLINES_DISABLED=1 in
  // the server .env). While true, the UI skips every pick lock.
  const [deadlinesDisabled, setDeadlinesDisabled] = useState(false);
  const saveTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    getMatches()
      .then((payload) => {
        setDeadlinesDisabled(payload.deadlinesDisabled);
        setMatches(payload.matches);
        setPlayers(payload.players);
        setAdvancement(payload.advancement);
      })
      .catch(() => setError("Match schedule could not be loaded."));
  }, []);

  useEffect(() => {
    if (!session) return;

    // Reset immediately so a previous player's picks never show while loading
    setGroupPicks({});

    getPlayerPicks(session.token, session.playerId)
      .then((payload) => setGroupPicks(payload.group))
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // Session is invalid or expired — clear it so the user is shown login
          clearSession();
          return;
        }
        setError("Saved picks could not be restored.");
      });
  }, [session?.playerId]);

  const groupedMatches = useMemo(() => matchesByGroup(matches), [matches]);

  async function login(name: string, pin: string) {
    setError(null);
    let nextSession: Session;
    try {
      nextSession = await requestLogin(name, pin);
    } catch (error) {
      setError(
        error instanceof ApiError && error.status === 0
          ? "Could not reach the server. Check your connection."
          : "Name or league PIN was not accepted."
      );
      return;
    }
    saveSession(nextSession);
  }

  async function saveName() {
    if (!session) return;
    setNameError(null);
    const name = nameInput.trim();
    if (!name) return;

    try {
      await renamePlayer(session.token, name);
    } catch (error) {
      setNameError(
        error instanceof ApiError && error.status !== 0
          ? (error.serverMessage ?? "Could not save name.")
          : "Could not reach the server."
      );
      return;
    }

    // The local knockout-pick cache is keyed by player name, so move it first.
    renameKnockoutPicks(window.localStorage, session.playerName, name);
    saveSession({ ...session, playerName: name });
    setPlayers((prev) => prev.map((p) => (p.id === session.playerId ? { ...p, name } : p)));
    setEditingName(false);
    setNameError(null);
  }

  function queuePickSave(match: Match, pick: GroupPickOutcome) {
    if (!session || isMatchLocked(match, deadlinesDisabled)) return;

    setGroupPicks((current) => ({ ...current, [match.id]: pick }));
    setSaveState("saving");
    window.clearTimeout(saveTimers.current[match.id]);
    saveTimers.current[match.id] = window.setTimeout(() => {
      void savePick(match.id, pick);
    }, 250);
  }

  async function savePick(matchId: string, pick: GroupPickOutcome) {
    if (!session) return;

    try {
      await saveGroupPick(session.token, matchId, pick);
    } catch (error) {
      setSaveState("error");
      if (!(error instanceof ApiError) || error.status === 0) setError("Could not reach the server.");
      else setError(error.status === 409 ? "That match has locked." : "Pick could not be saved.");
      return;
    }

    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
  }

  function logout() {
    // Cancel any pending debounced saves so player 1's timer can't fire after switch
    Object.values(saveTimers.current).forEach((id) => window.clearTimeout(id));
    saveTimers.current = {};
    clearSession();
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
            <BrandEyebrow />
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
            <h2 className="mt-1 text-xl font-black">{teamsInGroup(activeGroup).join(" · ")}</h2>
          </div>
          {(groupedMatches[activeGroup] ?? []).map((match) => (
            <GroupMatchRow
              key={match.id}
              match={match}
              selectedPick={groupPicks[match.id]}
              deadlinesDisabled={deadlinesDisabled}
              onPick={(pick) => queuePickSave(match, pick)}
            />
          ))}
        </section>

        <KnockoutSection
          key={session.playerId}
          session={session}
          advancement={advancement}
          deadlinesDisabled={deadlinesDisabled}
        />
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
  const displayPlayers = players.length > 0 ? players : seedPlayerNames.map((n, i) => ({ id: `player-${i + 1}`, name: n }));
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
        <BrandEyebrow />
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
  deadlinesDisabled,
  onPick
}: {
  match: Match;
  selectedPick?: GroupPickOutcome;
  deadlinesDisabled: boolean;
  onPick: (pick: GroupPickOutcome) => void;
}) {
  const locked = isMatchLocked(match, deadlinesDisabled);
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
