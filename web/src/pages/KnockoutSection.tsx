import { Check, Crown, LockKeyhole, Save, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import seed from "../../../data/seed.json";
import { apiBaseUrl, apiFetch } from "../api";
import {
  KnockoutRoundId,
  KnockoutPicks,
  createEmptyKnockoutPicks,
  duplicateTeamNamesByRound,
  knockoutRounds,
  readKnockoutPicks,
  writeKnockoutPicks
} from "../lib/knockout";
import { allTeams, groupLetters } from "../lib/tournament";
import type { Session } from "../session";
import { BrandEyebrow, SaveIndicator, type SaveState } from "../ui";

type GroupAdvPicks = Record<string, { first: string; second: string }>;
type R32Match = { id: string; slot1: string; slot2: string; slot2Groups?: string[] };

function resolveR32Slot(
  slot: string,
  slotGroups: string[] | undefined,
  playerAdv: GroupAdvPicks,
  adminAdv: Record<string, { first?: string; second?: string; third?: string }>
): { label: string; options: string[] } {
  if (slot === "3rd") {
    const groups = slotGroups ?? [];
    return {
      label: `Best 3rd (${groups.join("/")})`,
      options: groups.flatMap((g) => (seed.groups as Record<string, string[]>)[g] ?? [])
    };
  }
  const pos = parseInt(slot[0]);
  const group = slot.slice(1);
  const adminTeam = pos === 1 ? adminAdv[group]?.first : adminAdv[group]?.second;
  const playerTeam = pos === 1 ? playerAdv[group]?.first : playerAdv[group]?.second;
  const resolved = adminTeam ?? playerTeam;
  const groupTeams = (seed.groups as Record<string, string[]>)[group] ?? [];
  return {
    label: resolved ?? (pos === 1 ? `1st Group ${group}` : `2nd Group ${group}`),
    options: resolved ? [resolved] : groupTeams
  };
}

export function KnockoutSection({
  session,
  advancement,
  deadlinesDisabled
}: {
  session: Session;
  advancement: Record<string, { first?: string; second?: string; third?: string }>;
  deadlinesDisabled: boolean;
}) {
  const locked = !deadlinesDisabled && Date.now() >= Date.parse(seed.knockoutDeadline);

  // Knockout bracket picks
  const [picks, setPicks] = useState<KnockoutPicks>(() => {
    if (typeof window === "undefined") return createEmptyKnockoutPicks();
    return readKnockoutPicks(window.localStorage, session.playerName);
  });
  const [koSaveState, setKoSaveState] = useState<SaveState>("idle");
  const duplicates = useMemo(() => duplicateTeamNamesByRound(picks), [picks]);
  const saveTimer = useRef<number | undefined>(undefined);

  // Player's group advancement picks (1st/2nd per group)
  const advKey = `vm-tipping-2026:group-adv:${session.playerName}`;
  const [playerAdv, setPlayerAdv] = useState<GroupAdvPicks>(() => {
    if (typeof window === "undefined") return {};
    const raw = localStorage.getItem(advKey);
    if (!raw) return {};
    try { return JSON.parse(raw) as GroupAdvPicks; } catch { return {}; }
  });
  const [advSaveState, setAdvSaveState] = useState<SaveState>("idle");
  const advSaveTimer = useRef<number | undefined>(undefined);

  const teamPool = useMemo(() => {
    const entries = Object.values(advancement);
    const allGroupsSet = entries.length === 12 && entries.every((e) => e.first && e.second);
    const advanced = entries.flatMap((entry) =>
      [entry.first, entry.second, entry.third].filter((t): t is string => Boolean(t))
    );
    return allGroupsSet ? advanced.sort() : allTeams;
  }, [advancement]);

  // VMT-12: load knockout picks + group advancement from server (server is authoritative)
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/picks/${session.playerId}`, {
      headers: { authorization: `Bearer ${session.token}` }
    })
      .then((r) => r.json())
      .then((payload: { knockout?: Record<string, string[]>; groupAdvancement?: Record<string, { first?: string; second?: string }> }) => {
        if (payload.knockout) {
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
        }
        if (payload.groupAdvancement) {
          const serverAdv: GroupAdvPicks = {};
          for (const [g, v] of Object.entries(payload.groupAdvancement)) {
            serverAdv[g] = { first: v.first ?? "", second: v.second ?? "" };
          }
          setPlayerAdv(serverAdv);
          localStorage.setItem(advKey, JSON.stringify(serverAdv));
        }
      })
      .catch(() => {});
  }, [session.playerId]);

  // Persist group advancement picks to localStorage on change
  useEffect(() => {
    localStorage.setItem(advKey, JSON.stringify(playerAdv));
  }, [playerAdv, advKey]);

  // Persist knockout picks to localStorage on change
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
      const requests: Promise<Response>[] = knockoutRounds
        .filter((r) => updatedPicks.rounds[r.id].some(Boolean))
        .map((r) =>
          apiFetch("/api/picks", {
            method: "POST",
            headers,
            body: JSON.stringify({ round: r.id, teamNames: updatedPicks.rounds[r.id].filter(Boolean) })
          })
        );
      if (updatedPicks.champion) {
        requests.push(
          apiFetch("/api/picks", {
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

  function scheduleAdvSave(updated: GroupAdvPicks) {
    if (locked) return;
    window.clearTimeout(advSaveTimer.current);
    setAdvSaveState("saving");
    advSaveTimer.current = window.setTimeout(() => void saveAdvToServer(updated), 500);
  }

  async function saveAdvToServer(updated: GroupAdvPicks) {
    try {
      const response = await apiFetch("/api/picks", {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
        body: JSON.stringify({ groupAdvancement: updated })
      });
      if (response.ok) {
        setAdvSaveState("saved");
        window.setTimeout(() => setAdvSaveState("idle"), 1200);
      } else {
        setAdvSaveState("error");
      }
    } catch {
      setAdvSaveState("error");
    }
  }

  function updateGroupAdvPick(group: string, position: 1 | 2, team: string) {
    if (locked) return;
    setPlayerAdv((current) => {
      // VMT-27: 1st and 2nd must be distinct — if the new pick collides with the
      // other position, clear that position so the same team can't occupy two R32 slots.
      const other = position === 1 ? (current[group]?.second ?? "") : (current[group]?.first ?? "");
      const collides = Boolean(team) && team === other;
      const next = {
        ...current,
        [group]: {
          first: position === 1 ? team : collides ? "" : (current[group]?.first ?? ""),
          second: position === 2 ? team : collides ? "" : (current[group]?.second ?? "")
        }
      };
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

  const r32Bracket = seed.r32Bracket as unknown as R32Match[];

  // Which two slots from the prior round feed each slot in the current round.
  // R32 (16 slots) → R16 (8 slots): pairs [0,1], [2,3], …
  // R16 (8 slots)  → QF  (4 slots): pairs [0,1], [2,3], …
  // QF  (4 slots)  → SF  (2 slots): pairs [0,1], [2,3]
  // SF  (2 slots)  → Final (1 slot): [0,1]
  function getMatchupTeams(roundId: KnockoutRoundId, slotIndex: number): [string, string] {
    const prevRoundId: KnockoutRoundId | null =
      roundId === "r16" ? "r32" :
      roundId === "qf"  ? "r16" :
      roundId === "sf"  ? "qf"  :
      roundId === "final" ? "sf" : null;
    if (!prevRoundId) return ["", ""];
    const a = picks.rounds[prevRoundId][slotIndex * 2] ?? "";
    const b = picks.rounds[prevRoundId][slotIndex * 2 + 1] ?? "";
    return [a, b];
  }

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
            const teams = seed.groups[group] as string[];
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
                <span className="rounded-full border border-white/20 px-3 py-1 text-sm font-bold">{seed.scoring[round.pointsKey]} pts</span>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {round.id === "r32"
                  ? r32Bracket.map((match, slotIndex) => {
                      const slot1 = resolveR32Slot(match.slot1, undefined, playerAdv, advancement);
                      const slot2 = resolveR32Slot(match.slot2, match.slot2Groups, playerAdv, advancement);
                      const allOptions = [...new Set([...slot1.options, ...slot2.options])].sort();
                      const currentPick = picks.rounds[round.id][slotIndex];
                      const finalOptions = currentPick && !allOptions.includes(currentPick) ? [currentPick, ...allOptions] : allOptions;
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
                            {slot1.label} <span className="font-normal text-ink/40">vs</span> {slot2.label}
                          </span>
                          <select
                            aria-label={`${match.id} winner`}
                            className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base disabled:opacity-50"
                            disabled={locked}
                            value={currentPick}
                            onChange={(e) => updateRoundPick(round.id, slotIndex, e.target.value)}
                          >
                            <option value="">Pick winner</option>
                            {finalOptions.map((t) => (
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
                      const [teamA, teamB] = getMatchupTeams(round.id, slotIndex);
                      const matchupKnown = Boolean(teamA && teamB);
                      const matchupOptions = matchupKnown ? [teamA, teamB] : teamPool;
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
                          {matchupKnown ? (
                            <span className="text-sm font-bold text-ink/80">
                              {teamA} <span className="font-normal text-ink/40">vs</span> {teamB}
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-ink/40 italic">
                              Pick {round.id === "r16" ? "R32" : round.id === "qf" ? "R16" : round.id === "sf" ? "QF" : "SF"} winners to see matchup
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
