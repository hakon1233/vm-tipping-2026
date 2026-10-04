import { Check, Crown, LockKeyhole, Save, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPlayerPicks, saveGroupAdvancement, saveKnockoutPicks } from "../api";
import {
  type GroupAdvPicks,
  type KnockoutPicks,
  type KnockoutRoundId,
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
import { BrandEyebrow, SaveIndicator } from "../ui";
import { useDebouncedSave } from "../useDebouncedSave";

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
  const duplicates = useMemo(() => duplicateTeamNamesByRound(picks), [picks]);
  // What the server is known to hold, so a save sends the rounds that changed
  // (cleared ones included). Until the server's picks load, the local copy of
  // the last load or save stands in for them.
  const savedPicks = useRef<KnockoutPicks>(picks);
  const [koSaveState, scheduleSave] = useDebouncedSave(async (updated: KnockoutPicks) => {
    await saveKnockoutPicks(session.token, knockoutPickPayloads(updated, savedPicks.current));
    savedPicks.current = updated;
  }, { locked });

  // The player's own 1st/2nd place pick per group
  const [playerAdv, setPlayerAdv] = useState<GroupAdvPicks>(() => readGroupAdvPicks(window.localStorage, session.playerName));
  const [advSaveState, scheduleAdvSave] = useDebouncedSave(
    (updated: GroupAdvPicks) => saveGroupAdvancement(session.token, updated),
    { locked }
  );

  const teamPool = useMemo(() => knockoutTeamPool(advancement), [advancement]);

  // Whether the player has changed knockout picks / group advancement since
  // this page opened.
  const pickedKnockout = useRef(false);
  const pickedAdvancement = useRef(false);

  // The server is authoritative; localStorage is only a cache. A change the
  // player made before the server's copy arrived wins over that copy.
  useEffect(() => {
    getPlayerPicks(session.token, session.playerId)
      .then((payload) => {
        savedPicks.current = knockoutPicksFromServer(payload.knockout);
        if (!pickedKnockout.current) setPicks(savedPicks.current);
        if (!pickedAdvancement.current) setPlayerAdv(groupAdvFromServer(payload.groupAdvancement));
      })
      .catch(() => {});
  }, [session.playerId]);

  useEffect(() => {
    writeGroupAdvPicks(window.localStorage, session.playerName, playerAdv);
  }, [playerAdv, session.playerName]);

  useEffect(() => {
    writeKnockoutPicks(window.localStorage, session.playerName, picks);
  }, [picks, session.playerName]);

  function updateGroupAdvPick(group: string, position: 1 | 2, team: string) {
    if (locked) return;
    const next = withGroupAdvPick(playerAdv, group, position, team);
    pickedAdvancement.current = true;
    setPlayerAdv(next);
    scheduleAdvSave(next);
  }

  function updatePicks(next: KnockoutPicks) {
    if (locked) return;
    pickedKnockout.current = true;
    setPicks(next);
    scheduleSave(next);
  }

  function updateRoundPick(roundId: KnockoutRoundId, slotIndex: number, teamName: string) {
    updatePicks({
      ...picks,
      rounds: { ...picks.rounds, [roundId]: picks.rounds[roundId].map((pick, index) => (index === slotIndex ? teamName : pick)) }
    });
  }

  function updateChampion(teamName: string) {
    updatePicks({ ...picks, champion: teamName });
  }

  const completedSlots = knockoutRounds.reduce(
    (total, round) => total + picks.rounds[round.id].filter(Boolean).length,
    picks.champion ? 1 : 0
  );
  const totalSlots = knockoutRounds.reduce((total, round) => total + round.matchCount, 1);
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
                      const choice = r32Choice(match, playerAdv, advancement, picks.rounds[round.id][slotIndex]);
                      return (
                        <PickSlot
                          key={slotIndex}
                          heading={match.id.toUpperCase()}
                          matchup={[choice.home, choice.away]}
                          ariaLabel={`${match.id} winner`}
                          placeholder="Pick winner"
                          options={choice.options}
                          value={picks.rounds[round.id][slotIndex]}
                          duplicateNames={duplicateNames}
                          locked={locked}
                          onChange={(teamName) => updateRoundPick(round.id, slotIndex, teamName)}
                        />
                      );
                    })
                  : picks.rounds[round.id].map((teamName, slotIndex) => {
                      const matchup = matchupTeams(picks, round.id, slotIndex);
                      return (
                        <PickSlot
                          key={slotIndex}
                          heading={`Match ${slotIndex + 1}`}
                          matchup={matchup ?? `Pick ${previousRound(round.id)?.shortLabel} winners to see matchup`}
                          ariaLabel={`${round.label} match ${slotIndex + 1}`}
                          placeholder="Pick advancing team"
                          options={matchup ?? teamPool}
                          value={teamName}
                          duplicateNames={duplicateNames}
                          locked={locked}
                          onChange={(picked) => updateRoundPick(round.id, slotIndex, picked)}
                        />
                      );
                    })}
              </div>
            </article>
          );
        })}
      </section>

      <footer className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
        <Trophy size={18} aria-hidden="true" />
        <span>
          {Object.keys(advancement).length > 0
            ? `Admin has set advancement for ${Object.keys(advancement).length} of ${groupLetters.length} groups — R32 matchups show actual teams where known.`
            : "R32 matchups show your group picks where made, otherwise all teams from that group."}
        </span>
      </footer>
    </>
  );
}

// One knockout slot: which match it is, who plays (or, as a string, why that
// is not known yet), the pick, and whether that pick repeats a team already
// picked in the round (it then scores once).
function PickSlot({
  heading,
  matchup,
  ariaLabel,
  placeholder,
  options,
  value,
  duplicateNames,
  locked,
  onChange
}: {
  heading: string;
  matchup: [string, string] | string;
  ariaLabel: string;
  placeholder: string;
  options: string[];
  value: string;
  duplicateNames: Set<string>;
  locked: boolean;
  onChange: (teamName: string) => void;
}) {
  const duplicate = Boolean(value && duplicateNames.has(value));
  return (
    <label
      className={
        duplicate
          ? "grid gap-2 rounded-md border border-yellow-500 bg-yellow-100 p-3"
          : "grid gap-2 rounded-md border border-transparent bg-paper p-3"
      }
    >
      <span className="text-xs font-bold text-ink/40">{heading}</span>
      {typeof matchup === "string" ? (
        <span className="text-sm font-bold text-ink/40 italic">{matchup}</span>
      ) : (
        <span className="text-sm font-bold text-ink/80">
          {matchup[0]} <span className="font-normal text-ink/40">vs</span> {matchup[1]}
        </span>
      )}
      <select
        aria-label={ariaLabel}
        className="min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-base disabled:opacity-50"
        disabled={locked}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((teamName) => (
          <option key={teamName} value={teamName}>
            {teamName}
          </option>
        ))}
      </select>
      {duplicate ? (
        <em className="text-sm font-black not-italic text-yellow-800" title="This duplicate team scores once">
          scores once
        </em>
      ) : value ? (
        <Check size={16} aria-label="Picked" className="text-green-700" />
      ) : null}
    </label>
  );
}
