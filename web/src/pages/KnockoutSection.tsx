import { Check, Crown, LockKeyhole, Save, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPlayerPicks, saveGroupAdvancement, saveKnockoutPicks } from "../api";
import {
  type GroupAdvPicks,
  type KnockoutPicks,
  type KnockoutRoundId,
  createEmptyKnockoutPicks,
  duplicateTeamNamesByRound,
  groupAdvFromServer,
  knockoutPickPayloads,
  knockoutPicksFromServer,
  knockoutRounds,
  knockoutTeamPool,
  matchupTeams,
  previousRound,
  r32Bracket,
  r32Choice,
  readGroupAdvPicks,
  readKnockoutPicks,
  withGroupAdvPick,
  writeGroupAdvPicks,
  writeKnockoutPicks
} from "../lib/knockout";
import { type Advancement, groupLetters, isKnockoutLocked, seedScoring, teamsInGroup } from "../lib/tournament";
import type { Session } from "../session";
import { BrandEyebrow, SaveIndicator, type SaveState } from "../ui";

export function KnockoutSection({
  session,
  advancement,
  deadlinesDisabled
}: {
  session: Session;
  advancement: Advancement;
  deadlinesDisabled: boolean;
}) {
  const locked = isKnockoutLocked(deadlinesDisabled);

  const [picks, setPicks] = useState<KnockoutPicks>(() => readKnockoutPicks(window.localStorage, session.playerName));
  const [koSaveState, setKoSaveState] = useState<SaveState>("idle");
  const duplicates = useMemo(() => duplicateTeamNamesByRound(picks), [picks]);
  const saveTimer = useRef<number | undefined>(undefined);
  // What the server holds, so a save sends only the rounds that changed.
  const savedPicks = useRef<KnockoutPicks>(createEmptyKnockoutPicks());

  // The player's own 1st/2nd place pick per group
  const [playerAdv, setPlayerAdv] = useState<GroupAdvPicks>(() => readGroupAdvPicks(window.localStorage, session.playerName));
  const [advSaveState, setAdvSaveState] = useState<SaveState>("idle");
  const advSaveTimer = useRef<number | undefined>(undefined);

  const teamPool = useMemo(() => knockoutTeamPool(advancement), [advancement]);

  // The server is authoritative; localStorage is only a cache.
  useEffect(() => {
    getPlayerPicks(session.token, session.playerId)
      .then((payload) => {
        savedPicks.current = knockoutPicksFromServer(payload.knockout);
        setPicks(savedPicks.current);
        setPlayerAdv(groupAdvFromServer(payload.groupAdvancement));
      })
      .catch(() => {});
  }, [session.playerId]);

  useEffect(() => {
    writeGroupAdvPicks(window.localStorage, session.playerName, playerAdv);
  }, [playerAdv, session.playerName]);

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
      await saveKnockoutPicks(session.token, knockoutPickPayloads(updatedPicks, savedPicks.current));
      savedPicks.current = updatedPicks;
      setKoSaveState("saved");
      window.setTimeout(() => setKoSaveState("idle"), 1200);
    } catch {
      setKoSaveState("error");
    }
  }

  function scheduleAdvSave(updated: GroupAdvPicks) {
    if (locked) return;
    window.clearTimeout(advSaveTimer.current);
    setAdvSaveState("saving");
    advSaveTimer.current = window.setTimeout(() => void saveAdvToServer(updated), 500);
  }

  async function saveAdvToServer(updated: GroupAdvPicks) {
    try {
      await saveGroupAdvancement(session.token, updated);
      setAdvSaveState("saved");
      window.setTimeout(() => setAdvSaveState("idle"), 1200);
    } catch {
      setAdvSaveState("error");
    }
  }

  function updateGroupAdvPick(group: string, position: 1 | 2, team: string) {
    if (locked) return;
    setPlayerAdv((current) => {
      const next = withGroupAdvPick(current, group, position, team);
      scheduleAdvSave(next);
      return next;
    });
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
  const completedAdvGroups = groupLetters.filter((g) => playerAdv[g]?.first && playerAdv[g]?.second).length;

  return (
    <>
      <header className="grid gap-5 rounded-md border border-ink/10 bg-white px-5 py-6 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <BrandEyebrow />
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

      {/* Group Advancement section — pick 1st and 2nd per group */}
      <article className="overflow-hidden rounded-md border border-ink/10 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 bg-pitch px-5 py-4 text-white">
          <div>
            <p className="font-black text-lime">Group stage</p>
            <h2 className="mt-1 text-xl font-bold">Pick who advances from each group</h2>
          </div>
          <span className="rounded-full border border-white/20 px-3 py-1 text-sm font-bold">
            {completedAdvGroups}/{groupLetters.length} groups
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groupLetters.map((group) => {
            const teams = teamsInGroup(group);
            const firstPick = playerAdv[group]?.first ?? "";
            const secondPick = playerAdv[group]?.second ?? "";
            return (
              <div key={group} className="grid gap-2 rounded-md border border-ink/10 bg-paper p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black">Group {group}</span>
                  {firstPick && secondPick && <Check size={14} className="text-green-700" aria-hidden="true" />}
                </div>
                <p className="text-xs leading-relaxed text-ink/50">{teams.join(" · ")}</p>
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-ink/60">1st place</span>
                  <select
                    className="min-h-9 w-full rounded-md border border-ink/20 bg-white px-2 text-sm disabled:opacity-50"
                    disabled={locked}
                    value={firstPick}
                    onChange={(e) => updateGroupAdvPick(group, 1, e.target.value)}
                  >
                    <option value="">—</option>
                    {teams.map((t) => (
                      <option key={t} value={t} disabled={t === secondPick}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-ink/60">2nd place</span>
                  <select
                    className="min-h-9 w-full rounded-md border border-ink/20 bg-white px-2 text-sm disabled:opacity-50"
                    disabled={locked}
                    value={secondPick}
                    onChange={(e) => updateGroupAdvPick(group, 2, e.target.value)}
                  >
                    <option value="">—</option>
                    {teams.map((t) => (
                      <option key={t} value={t} disabled={t === firstPick}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
        {!locked && (
          <div className="border-t border-ink/10 px-4 py-3 text-sm">
            <SaveIndicator state={advSaveState} />
          </div>
        )}
      </article>

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
                <span className="rounded-full border border-white/20 px-3 py-1 text-sm font-bold">{seedScoring[round.pointsKey]} pts</span>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {round.id === "r32"
                  ? r32Bracket.map((match, slotIndex) => {
                      const currentPick = picks.rounds[round.id][slotIndex];
                      const choice = r32Choice(match, playerAdv, advancement, currentPick);
                      const duplicate = Boolean(currentPick && duplicateNames.has(currentPick));
                      return (
                        <label
                          key={slotIndex}
                          className={
                            duplicate
                              ? "grid gap-2 rounded-md border border-yellow-500 bg-yellow-100 p-3"
                              : "grid gap-2 rounded-md border border-transparent bg-paper p-3"
                          }
                        >
                          <span className="text-xs font-bold text-ink/40">{match.id.toUpperCase()}</span>
                          <span className="text-sm font-bold text-ink/80">
                            {choice.home} <span className="font-normal text-ink/40">vs</span> {choice.away}
                          </span>
                          <select
                            aria-label={`${match.id} winner`}
                            className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base disabled:opacity-50"
                            disabled={locked}
                            value={currentPick}
                            onChange={(e) => updateRoundPick(round.id, slotIndex, e.target.value)}
                          >
                            <option value="">Pick winner</option>
                            {choice.options.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          {duplicate ? (
                            <em className="text-sm font-black not-italic text-yellow-800" title="This duplicate team scores once">
                              scores once
                            </em>
                          ) : currentPick ? (
                            <Check size={16} aria-label="Picked" className="text-green-700" />
                          ) : null}
                        </label>
                      );
                    })
                  : picks.rounds[round.id].map((teamName, slotIndex) => {
                      const matchup = matchupTeams(picks, round.id, slotIndex);
                      const matchupOptions = matchup ?? teamPool;
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
                          <span className="text-xs font-bold text-ink/40">Match {slotIndex + 1}</span>
                          {matchup ? (
                            <span className="text-sm font-bold text-ink/80">
                              {matchup[0]} <span className="font-normal text-ink/40">vs</span> {matchup[1]}
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-ink/40 italic">
                              Pick {previousRound(round.id)?.shortLabel} winners to see matchup
                            </span>
                          )}
                          <select
                            aria-label={`${round.label} match ${slotIndex + 1}`}
                            className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base disabled:opacity-50"
                            disabled={locked}
                            value={teamName}
                            onChange={(event) => updateRoundPick(round.id, slotIndex, event.target.value)}
                          >
                            <option value="">Pick advancing team</option>
                            {matchupOptions.map((optionTeamName) => (
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
                    })
                }
              </div>
            </article>
          );
        })}
      </section>

      <footer className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
        <Trophy size={18} aria-hidden="true" />
        <span>
          {Object.keys(advancement).length > 0
            ? `Admin has set advancement for ${Object.keys(advancement).length} of 12 groups — R32 matchups show actual teams where known.`
            : "R32 matchups show your group picks where made, otherwise all teams from that group."}
        </span>
      </footer>
    </>
  );
}
