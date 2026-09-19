/* ============================================================
   THE RULES, WRITTEN DOWN ONCE

   These are requirements, not preferences, and they have each been broken by a
   well-meaning change at least once. They are stated here, next to the code
   that enforces them, so a future repair has to disagree with them on purpose.

   THE TRAFFIC LIGHT DECIDES THE DOSE.

     Green     3 main rounds   warm-up, coordination, main, prep, finisher, skill
     Yellow    2               warm-up, coordination, main, skill
     Red       1               warm-up, main, skill
     Recovery  0               the recovery menu only

   The light that counts is the FINAL one — what the adult chose and the session
   actually ran under. Blocks, rounds, the completion denominator, the streak
   denominator, the XP ceiling and every report use it. The body's own
   suggestion is stored beside it (`suggestedLight`) and never overwritten, so
   an override cannot rewrite the history of what her body reported.

   THE STREAK IS 75% OF THE FINAL LIGHT'S PLAN, AND NOTHING ELSE.

     streak = credit earned / the final light's expected work >= 0.75

   For green, yellow and red alike. It is INDEPENDENT of main rounds: a red day
   can earn its streak at 75% with zero complete main rounds, and that is
   correct, not a loophole to close. Recovery adds no streak day; finishing the
   recovery menu HOLDS the existing streak rather than breaking it, so reporting
   soreness honestly is never the day the flame goes out.

   A MAIN ROUND COUNTS ON THE DOSE IT PRODUCED.

   Every expected row present, nothing skipped, no single row below half its
   dose, and the round's mean credit at least 80%. Deliberately not "every row
   at its own full rule": a ten-year-old tapping Done a beat early on ONE hold
   turned a round she physically trained into nothing, three times over, and the
   finish screen printed "0 of 3". The per-row floor is what stops the mean from
   laundering a move that was never really trained. Do not tighten this to
   every-row-perfect, and do not remove the floor.

   AND WORK IS NEVER LOST TO BOOKKEEPING.

   A finished round is banked the instant its last row lands, before any prompt,
   speech or rest. A day's progress is cleared only after the record replacing
   it has actually reached storage. A block is finished only when every row it
   asked for is done. Each of those was once the other way round, and each cost
   a child work she had really done.
   ============================================================ */

/* ============================================================
   ONE SESSION-OUTCOME AUTHORITY

   "Did she train, how much, and does it pay?" used to be answered
   independently in the engine, the store, four view-models and the effort
   score — and they disagreed. The engine's `completedFully` meant only "the
   loop reached the end", so skipping every move still read as a finished
   session; meanwhile a session of 7-of-8 reps on every move read as NOTHING,
   because only a `done` ledger row counted as work.

   This module is the single answer. The scoring rules are pure functions of a
   record, so the store, the view-models and the tests can all ask them without
   a cycle. Nothing else may re-derive completion.

   The DAY RECORD at the bottom of this file is the one exception: it reads the
   session log, the event log and the day-progress record, and prices the day's
   plan through the engine. Those imports are used only inside functions, never
   while the module loads, which is what keeps the store -> outcome -> engine ->
   store cycle safe at start-up.
   ============================================================ */

import { edmontonISO, todayISODate, DAY_MS } from "./util.js";
import { DAYS } from "./data.js";
import { roundsForLight, assembleCircuits, lockedLightFromLog, dayPlanState,
         countExpectedWork, countExpectedByRound, DONE_WORK_FRACTION, MIN_EXERCISE_SECS } from "./engine.js";
import { loadSessions, loadEvents, loadDayProgress, dayRoundsPlanned, settledXpByDate,
         XP_SHOWED_UP, XP_PER_ROUND } from "./store.js";

/* Records written from this version carry `outcomeVersion`, which is what lets
   partial work count as work. Rows written before it keep the old done-only
   reading, so her existing history is not re-scored underneath her.

   v1 let partial rows count as work at all. v2 added the streak dose bar. v3
   judges a MAIN ROUND on its dose rather than demanding every move be perfect —
   see mainRoundReport below. v4 numbers a resumed sitting's main rounds from
   what the day has already banked, which is what makes its ledger rows safe to
   merge per planned move — see mergeLedgerRows. v5 pays a round that fell short
   the fraction of it she actually did, instead of nothing — see roundPayCredit.
   v6 stamps the row with the PROOF of work banked before it (`bankedRows` by
   name and `bankedSecs`, instead of a bare count), records an override only
   when an adult actually moved the light, and prices XP once per DAY off the
   merged ledger rather than once per sitting — see dayRecords below and
   settledDayXp in store.js. Each step is gated on the version that introduced
   it, so a record is always read by the rules it was written under. */
export const OUTCOME_VERSION = 6;

/* How much of a session has to actually be there before the day counts toward
   the streak. Deliberately high: the streak is the app's loudest claim about
   effort, and it used to be bought by a SINGLE recorded move — warm up, do one
   thing, walk away, keep the flame. That is not a training day.

   The fraction is of the FINAL LIGHT'S OWN plan, so it scales with what the day
   actually asked for. A red day's plan is a third the size of a green one, and
   75% of it is 75% either way: a light day is a smaller ask, never a harder one.

   The fraction is of the COMPLETION CREDIT, not of the row count — see
   streakCredit below. Counting rows was the hole this bar was supposed to close:
   a `partial` row counted as one whole unit, so three seconds of a thirty-second
   hold, fifteen times over, cleared 75% of a twenty-move session.

   Say what that credit is, exactly, because "75% of the dose" overstates it. A
   row the engine already called `done` is worth 1 and is not re-measured; only
   `partial` rows are pro-rated. The engine calls a timed move done at 80% of its
   clock (DONE_WORK_FRACTION in js/engine.js), so a session performed at that
   floor all the way through clears this bar at 60% of the literal planned
   seconds. That is deliberate, not an oversight: the 80% floor is the app's
   answer to a ten-year-old who is a beat slow off every start, and paying a
   finished move less than full credit would take it back. The bar is 75% OF THE
   SESSION COMPLETED, not 75% of the stopwatch.

   Recovery does not earn a streak day at all; it FREEZES the one she has. Its
   menu is care, not training, so it cannot add to a training streak — but
   reporting soreness honestly must never break one either. The whole menu is
   what buys that protection: a recovery pass abandoned after two moves is not
   a day's care. */
export const STREAK_WORK_FRACTION = 0.75;
export const RECOVERY_STREAK_FRACTION = 1;

/* ---- HOW WELL A MOVE WAS HELD, SAID OUT LOUD --------------------------------

   The engine has always measured a timed move against its dose and quietly
   filed anything under DONE_WORK_FRACTION as `partial`. Nothing on screen ever
   said so, so a thirty-second hold let go at twelve seconds and one held the
   whole way read exactly alike on the card, and a grown-up had no way to know
   the difference without watching every rep.

   Four bands, and the gaps between them are the point:

     green   >= 90%   the dose, held
     amber   >= 75%   almost — worth a word, not a warning
     yellow  >= 50%   short
     red      < 50%   very short

   This is a REPORT, never a verdict. It changes no XP and no streak day: the
   flame asks whether she finished the plan, this asks how well she held it, and
   conflating them would punish a kid twice for one bad evening.

   A move with no measurable dose scores NOTHING rather than green. Rep work is
   judged on reps and timed work on seconds — the same split exerciseStatus
   already makes in js/engine.js — and a row that kept neither denominator is a
   row we cannot grade. Grading it green would be the app inventing a pass. */
export const PACE_BANDS = { green: 0.90, amber: 0.75, yellow: 0.50 };
export const PACE_ORDER = ["green", "amber", "yellow", "red"];

export function bandOf(ratio) {
  if (!Number.isFinite(ratio)) return null;
  if (ratio >= PACE_BANDS.green) return "green";
  if (ratio >= PACE_BANDS.amber) return "amber";
  if (ratio >= PACE_BANDS.yellow) return "yellow";
  return "red";
}

/* The dose a row actually produced, 0..1, or null when it cannot be proved.
   A skipped move is not a short move — it is no move — so it bands as `red`
   only through paceOf below, never by pretending its ratio is zero work. */
export function paceRatio(row) {
  if (!row || row.status === "skipped") return null;
  const frac = (got, planned) =>
    Number.isFinite(Number(planned)) && Number(planned) > 0
      ? Math.min(1, Math.max(0, Number(got) / Number(planned))) : null;
  const byReps = frac(row.repsCounted, row.repsPlanned);
  const byTime = frac(row.actualSecs, row.plannedSecs);
  if (row.driver === "reps") return byReps;
  if (row.driver === "time") return byTime;
  return byReps !== null ? byReps : byTime;
}

export function paceBand(row) {
  if (!row) return null;
  if (row.status === "done" && paceRatio(row) === null) return "green";
  return bandOf(paceRatio(row));
}

/* The whole sitting's pace: how many rows landed in each band, and the mean of
   the rows we could actually grade. Rows with no provable dose are counted in
   `ungraded` rather than dragged into the mean — an average that silently
   includes unmeasurable rows is an average of two different things. */
export function paceReport(rows) {
  const counts = { green: 0, amber: 0, yellow: 0, red: 0 };
  let sum = 0, graded = 0, ungraded = 0, worst = null;
  (rows || []).forEach(row => {
    if (!row || row.status === "skipped") return;
    const band = paceBand(row);
    if (!band) { ungraded++; return; }
    counts[band]++;
    const r = paceRatio(row);
    if (Number.isFinite(r)) { sum += r; graded++; }
    if (!worst || PACE_ORDER.indexOf(band) > PACE_ORDER.indexOf(worst.band)) {
      worst = { band, name: row.name || "", ratio: Number.isFinite(r) ? r : null };
    }
  });
  const ratio = graded ? sum / graded : null;
  return {
    counts, ungraded, graded, ratio,
    band: ratio === null ? null : bandOf(ratio),
    worst,
    // What a grown-up is actually being asked to look at.
    shortCount: counts.yellow + counts.red
  };
}

export const OUTCOME_STATES = ["none", "partial", "complete", "safety-stop", "recovery"];

/* A ledger row is WORK if the move was actually performed to any degree.
   `partial` is real work — 7 of 8 reps, or 14 of 30 valid seconds, is not
   nothing. The instant-tap and too-short protections live in the engine
   (an instant Done tap is written as `skipped`, never as `partial`), so by
   the time a row says `partial` it has already earned the name. */
function rowIsWork(row, countPartial) {
  if (!row) return false;
  if (row.status === "done") return true;
  return countPartial && row.status === "partial";
}

/* How much of a work unit a row is WORTH to the streak.

   `rowIsWork` above answers "was this move performed at all", which is the
   right question for "did she train" and must stay that way. It is the wrong
   question for the streak: it made a three-second rep of a thirty-second hold
   worth exactly as much as the hold. The engine already raised the bar for
   calling a timed dose `done` (DONE_WORK_FRACTION in js/engine.js) — this
   applies the same honesty one level up, by paying a partial row the fraction
   of the dose it actually produced.

   A `done` row is worth 1 and is NOT re-measured against its clock. That is the
   whole reason the engine has an 80% floor for calling a timed move done: below
   it the row is `partial` and gets pro-rated here, at or above it the move is
   finished and paid in full. Pro-rating done rows as well would move the floor
   without saying so, and is a different decision from this one — see
   STREAK_WORK_FRACTION above for what the resulting bar does and does not mean.

   The numbers come off the ledger row itself (see recordExercise in
   js/engine.js), so nothing new has to be measured or stored. A partial row
   whose dose cannot be computed — no denominator, or a shape from before these
   fields existed — scores ZERO: the streak is the app's loudest claim about
   effort, and a dose we cannot prove is not one we pay for. */
export function streakCredit(row, countPartial = true) {
  if (!row) return 0;
  if (row.status === "done") return 1;
  if (!countPartial || row.status !== "partial") return 0;
  const frac = (got, planned) =>
    Number.isFinite(Number(planned)) && Number(planned) > 0
      ? Number(got) / Number(planned) : null;
  const byReps = frac(row.repsCounted, row.repsPlanned);
  const byTime = frac(row.actualSecs, row.plannedSecs);
  const f = row.driver === "reps" ? byReps
    : row.driver === "time" ? byTime
    : (byReps !== null ? byReps : byTime);   // driver missing: whichever it kept
  if (!Number.isFinite(f)) return 0;
  return Math.min(1, Math.max(0, f));
}

/* Legacy rows (no ledger at all) fall back to the per-move shape. */
function legacyHadWork(entry) {
  return ((entry && entry.perExercise) || []).some(p => p && !p.skipped);
}

/* How many main rounds were actually finished, and — when one did not count —
   WHICH MOVE STOPPED IT.

   The rule used to be "every row in the round is `done`". That is the same 80%
   clock the engine already applies to a single move (DONE_WORK_FRACTION in
   js/engine.js), except applied with no tolerance at all one level up: a
   ten-year-old who taps Done a beat early on ONE hold turned a round she
   physically trained into nothing, three times over, and the finish screen
   printed "0 of 3" without naming the move. That is how a full session read as
   the show-up credit alone.

   So a round now counts on the DOSE it produced, by the same 80% floor:

     · every row the round was supposed to produce is there, and
     · nothing in it was SKIPPED — a move not attempted is not a short move, and
       no amount of credit elsewhere in the round buys it back, and
     · no single move is below ROUND_ROW_FLOOR — half its dose, and
     · the round's mean credit is at least ROUND_DOSE_FRACTION.

   The per-move floor is what stops a mean from laundering a move. Five moves
   average 0.82 when four are perfect and the fifth is three seconds of a
   thirty-second hold: over the bar on the arithmetic, and plainly not a round
   she trained. Above the floor the mean is doing the job it should — absorbing
   a beat-early tap here and there — and below it a move is missing in all but
   name, which is the skip rule one step softer, not a different rule.

   The credit per row is `streakCredit` unchanged — 1 for a `done` row, and a
   `partial` pro-rated by its own reps or seconds. Nothing new is measured and
   nothing new is stored.

   "All the rows that exist are done" was also trivially true of a round that was
   cut short: abort three moves into an eight-move round and the ledger holds
   three rows, which read as a finished round and paid like one. So the record
   carries `expectedByRound` (see countExpectedByRound in js/engine.js) and a
   round has to produce that many rows before it can count.

   This rule is LOOSER than the one it replaces, so it applies only to records
   written with it (outcomeVersion 3+). Older rows — and rows restored from the
   cloud or a backup — keep the all-done reading rather than being re-scored
   underneath her, the same way partial work and the streak bar are gated above. */
export const ROUND_DOSE_FRACTION = 0.8;
export const ROUND_ROW_FLOOR = 0.5;

export function mainRoundReport(ledger, expectedByRound = null, outcomeVersion = null) {
  const rows = (ledger || []).filter(l => l && l.block === "main");
  if (!rows.length) return [];
  const doseJudged = Number(outcomeVersion) >= 3;
  const byRound = new Map();
  rows.forEach(l => {
    const r = l.round || 1;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push(l);
  });
  const report = [];
  byRound.forEach((rs, r) => {
    const expected = expectedByRound ? Number(expectedByRound[r]) : NaN;
    const missing = Number.isFinite(expected) ? Math.max(0, expected - rs.length) : 0;
    const skipped = rs.filter(l => l.status === "skipped");
    const credit = rs.reduce((a, l) => a + streakCredit(l, true), 0);
    const ratio = rs.length ? credit / rs.length : 0;
    const underFloor = rs.filter(l => streakCredit(l, true) < ROUND_ROW_FLOOR);
    const counts = doseJudged
      ? (missing === 0 && !skipped.length && !underFloor.length && ratio >= ROUND_DOSE_FRACTION)
      : (rs.every(l => l.status === "done") && missing === 0);
    report.push({
      round: r, rows: rs.length, expected: Number.isFinite(expected) ? expected : null,
      missing, skipped: skipped.map(l => l.name), credit, ratio, counts,
      // The one move that cost her the round, so the screen can name it instead
      // of printing a bare zero. A skipped move outranks a short one: it is the
      // thing she can actually do differently next time.
      blockedBy: counts ? null : worstRow(rs)
    });
  });
  return report.sort((a, b) => a.round - b.round);
}

/* The row that dragged the round down — lowest credit, skips first. */
function worstRow(rs) {
  const ranked = rs.slice().sort((a, b) => {
    const sa = a.status === "skipped" ? -1 : streakCredit(a, true);
    const sb = b.status === "skipped" ? -1 : streakCredit(b, true);
    return sa - sb;
  });
  const l = ranked[0];
  if (!l) return null;
  return {
    name: l.name, round: l.round || 1, status: l.status,
    driver: l.driver || (l.repsPlanned ? "reps" : "time"),
    got: l.driver === "reps" ? l.repsCounted : l.actualSecs,
    planned: l.driver === "reps" ? l.repsPlanned : l.plannedSecs
  };
}

/* ---- WHY A MOVE COUNTED, OR DIDN'T, IN HER OWN UNITS -----------------------

   Nothing ever showed, move by move, what counted and why: the day card listed
   moves with dose and cue, the finish screen named short rounds but not moves,
   and a kid tapping Done a beat early learned nothing from a "½". These are the
   rules already stated in this file and in the engine, quoted back one move at
   a time — DONE_WORK_FRACTION for the clock, the whole rep count for reps,
   MIN_EXERCISE_SECS for an instant tap — so the sentence beside a move can
   never disagree with the verdict on it. Factual, never scolding: what she
   did, what was asked, what "counting" means.

   `status` is one of done | partial | skipped | banked | missing — the last
   two for a row the log cannot grade (proved earlier today, or never reached). */
/* A function, not a constant: the engine's numbers are read inside it, after
   both modules have loaded, which is what the import cycle above requires. */
export function moveReviewLegend() {
  return "✓ counts: " + Math.round(DONE_WORK_FRACTION * 100)
    + "% of the time or all reps · ½ short · ⏭ skipped (under " + MIN_EXERCISE_SECS + "s or Skip)";
}

export function moveReviewReason(row, status) {
  if (status === "banked") return "done earlier today";
  if (status === "missing") return "not reached";
  if (!row) return "";
  const driver = row.driver || (Number(row.repsPlanned) > 0 ? "reps" : "time");
  const got = driver === "reps" ? Math.round(Number(row.repsCounted) || 0) : Math.round(Number(row.actualSecs) || 0);
  const planned = driver === "reps" ? Math.round(Number(row.repsPlanned) || 0) : Math.round(Number(row.plannedSecs) || 0);
  if (status === "skipped") {
    return (Number(row.actualSecs) || 0) >= MIN_EXERCISE_SECS
      ? "skipped"
      : "under " + MIN_EXERCISE_SECS + "s — counted as skipped";
  }
  if (status === "partial") {
    if (driver === "reps") return got + " of " + planned + " reps — all " + planned + " to count";
    if (planned > 0) {
      const need = Math.ceil(planned * DONE_WORK_FRACTION);
      return got + "s of " + planned + "s — needs " + need + "s (" + Math.round(DONE_WORK_FRACTION * 100) + "%) to count";
    }
    return "cut short";
  }
  return "";
}

/* The two numbers the review prints beside the reason, or nulls for a row
   with nothing measurable on it (a banked row, a legacy row). */
export function moveReviewDose(row) {
  if (!row || row.banked) return { got: null, planned: null, driver: row && row.driver ? row.driver : null };
  const driver = row.driver || (Number(row.repsPlanned) > 0 ? "reps" : "time");
  const got = driver === "reps" ? Number(row.repsCounted) : Number(row.actualSecs);
  const planned = driver === "reps" ? Number(row.repsPlanned) : Number(row.plannedSecs);
  if (!Number.isFinite(planned) || planned <= 0) return { got: null, planned: null, driver };
  return { got: Math.round(Math.max(0, Number(got) || 0)), planned: Math.round(planned), driver };
}

export function mainRoundsFromLedger(ledger, expectedByRound = null, outcomeVersion = null) {
  return mainRoundReport(ledger, expectedByRound, outcomeVersion)
    .filter(r => r.counts).length;
}

/* WHAT A ROUND IS WORTH TO THE XP, from 0 to 1.

   Whether a round COUNTS is a yes-or-no question, and it should be: a round
   with a skipped move in it is not a round she trained, and every report says
   so. Pricing it that way was a different matter. A round paid 90 XP or nothing,
   so one skipped move in an eight-move round cost the whole 90 — the same as
   skipping all eight. Two things followed, both bad. Once a round was lost there
   was no reason left to do its other seven moves properly; and skipping a move
   that felt wrong was punished harder than grinding through it badly, which is
   exactly backwards for a ten-year-old we are trying to teach to stop when
   something hurts.

   So the cliff becomes a slope, in the one direction that is safe:

     · a round that COUNTS still pays in full — nothing she earns today gets
       smaller because this rule changed, and
     · a round that fell short pays the fraction of it she actually produced.

   The denominator is what the round ASKED FOR, not the rows that happen to
   exist: a round abandoned after three of eight moves has a perfect ratio over
   its three rows, and paying that as a whole round would pay a full round's XP
   for three eighths of one. */
export function roundPayCredit(r) {
  if (!r) return 0;
  if (r.counts) return 1;
  const rows = Number(r.rows) || 0;
  const asked = Number.isFinite(Number(r.expected)) && Number(r.expected) > 0
    ? Number(r.expected) : rows;
  if (asked <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(r.credit) || 0) / asked));
}

/* The one function. Everything that has an opinion about a session asks this.

   { ledger, expectedWork, safetyStop, explicitAbort, sessionType, practice,
     outcomeVersion, perExercise, completedFully }

   `expectedWork` is the number of exercise-round instances the session was
   supposed to produce. When it is a finite number, `complete` requires that
   many `done` rows — a session that ended early leaves rows MISSING, and
   missing rows are not completion. */
export function deriveSessionOutcome(input = {}) {
  const {
    ledger = [], expectedWork = null, safetyStop = false, explicitAbort = false,
    sessionType = null, practice = false, outcomeVersion = null,
    expectedByRound = null, roundsDone = null, bankedCredit = 0
  } = input;

  /* WORK ALREADY BANKED TODAY, before this sitting started.

     A day can be trained in two goes. The second used to be judged against its
     own leftovers alone, which cut both ways: a sitting that finished everything
     still owed could not read as completing the DAY, and a two-move sitting on a
     barely-started day cleared 75% of two moves and bought the streak.

     So `expectedWork` is the whole day's ask, and this is what the day has
     already been paid. Only FINISHED moves are banked (see bankMove in
     js/engine.js), and a finished move is worth exactly 1, so the count is the
     credit. Zero for a first sitting and for every record written before this,
     which is what keeps their scores identical. */
  const banked = Math.max(0, Number(bankedCredit) || 0);

  const rows = ledger || [];
  const countPartial = Number(outcomeVersion) >= 1;
  const hasDetail = rows.length > 0 || ((input.perExercise || []).length > 0);

  const doneRows = rows.filter(l => l && l.status === "done").length;
  const workRows = rows.filter(l => rowIsWork(l, countPartial)).length;

  // With no per-move detail at all there is nothing to judge, so the old flag
  // is all there is — that is how records written before the ledger read.
  const meaningfulWork = rows.length ? workRows > 0
    : hasDetail ? legacyHadWork(input)
    : input.completedFully !== false;

  /* THE LEDGER DECIDES. It used to be the smaller of two witnesses: the ledger,
     which holds a row per move and can be re-checked by anything; and the
     engine's own `roundsDone`, a bare number nothing can check. Believing the
     smaller one meant either witness could erase the other in silence — and one
     of them did. The engine increments its counter at the BOTTOM of the round
     loop, after the round rest, so a round finished and then interrupted during
     its rest was saved as `roundsDone: 0`; min() then threw away three rounds
     the rows could prove, and the finish screen printed "0 of 3 main rounds"
     next to thirty-four minutes of work.

     So the evidence wins, and the bare number is kept only as a check on it:
     `roundsDisagree` still fires and is still logged (see finalize in
     js/engine.js), because the two SHOULD now agree — the engine commits a round
     the moment its last row lands, under this same rule — and a disagreement is
     a real defect worth seeing rather than an outcome worth splitting. Records
     with no ledger at all — legacy rows, cloud restores — have no evidence to
     read, so there the bare number is all there is. */
  const roundReport = mainRoundReport(rows, expectedByRound, outcomeVersion);
  const ledgerRounds = roundReport.filter(r => r.counts).length;
  const engineRounds = Number(roundsDone);
  const mainRoundsDone = rows.length
    ? ledgerRounds
    : Number.isFinite(engineRounds) ? Math.max(0, engineRounds) : 0;
  const roundsDisagree = Number.isFinite(engineRounds) && engineRounds !== ledgerRounds;

  // Completion is "every expected instance was DONE" — never "the loop ended".
  // Partial rows do not complete a session even though they are real work.
  const expected = Number.isFinite(expectedWork) ? expectedWork : null;
  // `allRowsDone` stays about THIS sitting: a sitting with a skipped move in it
  // is not a finished sitting, however much of the day was banked before it.
  const allRowsDone = rows.length > 0 && rows.every(l => l && l.status === "done");
  const completedFully = expected !== null
    ? (doneRows + banked >= expected && rows.length + banked >= expected && allRowsDone)
    : rows.length ? allRowsDone
    : input.completedFully === true;

  let state;
  if (practice)                            state = "none";
  else if (safetyStop)                     state = "safety-stop";
  else if (sessionType === "recovery" ||
           sessionType === "spa")          state = "recovery";
  else if (!meaningfulWork)                state = "none";
  else if (completedFully && !explicitAbort) state = "complete";
  else                                     state = "partial";

  // Recovery and safety stops are deliberately outside training: a recovery day
  // is care, not a workout, and a pain stop is a safety event. Both stay fully
  // visible in the log and in Safety & Flags — they simply do not buy a
  // training day, a streak day, or a point of adherence.
  const isTraining = state === "complete" || state === "partial";

  /* THE STREAK IS A SEPARATE QUESTION FROM "DID SHE TRAIN".

     Training, adherence and XP all still count any real work — a partial day is
     a real day and is paid for. The streak asks something stricter: was this a
     session, or a piece of one? It was answered by `countsAsTraining` until
     now, which one recorded move satisfied.

     The bar only applies to records written with it (outcomeVersion 2+).
     Re-judging her history would drop the number she is standing on tonight
     because a rule changed underneath her, which is exactly the kind of thing
     the streak must never do. */
  const streakJudged = Number(outcomeVersion) >= 2;
  const streakWork = banked + rows.reduce((a, l) => a + streakCredit(l, countPartial), 0);
  const workRatio = expected !== null && expected > 0 ? streakWork / expected : null;
  /* SHE FINISHED THE PLAN. THAT IS A TRAINING DAY.

     The dose bar above asks for three quarters of the plan's WORTH, and a girl
     who walked through every single move a beat early on each one scored 0.70
     and lost the day: the card said PARTLY DONE, the XP was paid, and the flame
     did not move. Nothing on the screen could explain that to her, because from
     where she stood she had done the whole workout.

     So there are two ways to earn the day now, and this is the second: every
     move the plan asked for is in the ledger, none of them was SKIPPED, and no
     single move came in under half its dose. Reaching the end of the plan is
     itself the achievement the streak is supposed to be about.

     The floor is ROUND_ROW_FLOOR, the same half-dose the round rule already
     uses, and it is what stops this from re-opening the hole the bar was dug
     for: three seconds of every thirty-second hold still earns nothing, because
     every row is under the floor. What it newly allows is a day at half to
     three-quarters of every move with nothing skipped and nothing missing —
     which is a kid who trained, tired.

     NOT gated behind a new outcome version, and deliberately so. Every other
     rule in this file is gated because re-scoring history could take away a day
     she is standing on. This one can only ever ADD a day — a record that earned
     the streak still earns it — so it applies to everything already judged by
     the bar, which is the only way the day on her device tonight starts
     counting. Nothing stored changes shape. */
  const wholePlanAttempted = expected !== null && rows.length > 0
    && !rows.some(l => l && l.status === "skipped")
    && rows.length + banked >= expected
    && rows.every(l => streakCredit(l, countPartial) >= ROUND_ROW_FLOOR);

  let countsForStreak;
  if (!streakJudged || workRatio === null) {
    countsForStreak = isTraining;                   // the old reading, unchanged
  } else if (state === "recovery") {
    countsForStreak = false;                        // care freezes, never counts
  } else if (isTraining) {
    countsForStreak = workRatio >= STREAK_WORK_FRACTION || wholePlanAttempted;
  } else {
    countsForStreak = false;                        // no work, or a safety stop
  }

  /* A finished recovery pass HOLDS the streak without adding to it, so a sore
     day costs her nothing and buys her nothing. Judged on the same dose ratio,
     so brushing at every move on the menu is not a day of care — which is what
     counting rows made it. Pre-v2 records keep the old reading and are left
     alone; the freeze is only ever offered, never required. */
  const streakFreeze = streakJudged && state === "recovery"
    && workRatio !== null && workRatio >= RECOVERY_STREAK_FRACTION;

  return {
    state,
    meaningfulWork,
    completedFully: state === "complete",
    mainRoundsDone,
    // Per-round detail, so a screen can say WHICH move cost her a round rather
    // than leaving a "0 of 3" to be guessed at. See mainRoundReport.
    roundReport,
    // Surfaced rather than logged here: this module stays pure and
    // dependency-free (store.js imports IT), so the caller does the logging.
    roundsDisagree,
    countsAsTraining: isTraining,
    countsForStreak,
    streakFreeze,
    // What the streak was judged on, so a screen can say "3 more moves" rather
    // than leaving her to guess why a day she worked at did not count.
    workRatio,
    /* And what the ratio was measured AGAINST. A ten-year-old has no unit for a
       percentage point of a plan; she has a unit for a move. Reported, never
       judged on — no reader re-scores anything with it. */
    expectedWork: expected,
    // Which of the two doors the day came through, so the card can say so.
    wholePlanAttempted,
    /* How well it was held, as opposed to how much of it there was. Carried on
       the outcome so the session screen, the day card, the Progress table and
       the Grown-up Zone all read one reading rather than four. */
    pace: paceReport(rows),
    streakJudged,
    xpEligible: isTraining || state === "recovery"
  };
}

/* Adapter: read a SAVED session record. Every consumer in the app goes through
   here, so the shape of a stored row is interpreted in exactly one place. */
export function outcomeOf(entry) {
  if (!entry) return deriveSessionOutcome({ practice: true });
  return deriveSessionOutcome({
    ledger: entry.ledger || [],
    perExercise: entry.perExercise || [],
    expectedWork: Number.isFinite(entry.expectedWork) ? entry.expectedWork : null,
    expectedByRound: entry.expectedByRound || null,
    roundsDone: Number.isFinite(entry.roundsDone) ? entry.roundsDone : null,
    bankedCredit: Number.isFinite(entry.bankedCredit) ? entry.bankedCredit : 0,
    safetyStop: !!(entry.safetyStop || entry.pain),
    explicitAbort: entry.endedEarly === true,
    sessionType: entry.sessionType || (entry.spa ? "spa" : null),
    practice: !!entry.practice,
    outcomeVersion: entry.outcomeVersion,
    completedFully: entry.completedFully
  });
}


/* ============================================================
   ONE WORKOUT, HOWEVER MANY SITTINGS IT TOOK

   A day trained in two goes writes two session records. Nothing could say they
   were the same workout: rows were told apart by `isoDate|dayKey` and resume
   was keyed on the weekday, so the progress screen counted two sessions, the
   average duration halved, and the completion rate was computed against a
   denominator that had grown by one for work that was really one day's.

   Records written from now on carry `workoutInstanceId` (minted in
   js/engine.js when a plan starts, carried on the day's progress record so a
   resume keeps it). Older rows and rows restored from the cloud have none, so
   they fall back to the day and the actual Edmonton date — which is exactly
   how they were already being grouped, so no history is re-read.

   The fragments' ledgers are concatenated and scored ONCE through
   deriveSessionOutcome, so a day that is complete only when both sittings are
   counted together reads complete — and reads it the same way everywhere.
   ============================================================ */
export function instanceKeyOf(entry) {
  if (!entry) return "";
  if (entry.workoutInstanceId) return String(entry.workoutInstanceId);
  return (edmontonISO(entry.isoDate) || "?") + "|" + String(entry.dayKey || "?");
}

/* ============================================================
   ONE PLANNED MOVE IS ONE PLANNED MOVE, HOWEVER OFTEN IT WAS ATTEMPTED

   The fragments' ledgers used to be CONCATENATED, which quietly turned "how
   much of the day did she do" into "how many rows are there". Two consequences,
   both of them wrong in her favour:

     · A move attempted again pays again. Six goes at the same thirty-second
       hold, half-finished each time, added up to three whole units of credit —
       enough to clear the 75% streak bar on a four-move day where exactly one
       move had ever been touched. The streak is the app's loudest claim about
       effort and that is not a training day.

     · Prep is re-run in full every sitting by design (see bankMove in
       js/engine.js — running main cold is the thing it exists to prevent), so
       a day trained in two goes paid for its prep twice.

   So rows are merged by the PLANNED INSTANCE they belong to, and the instance
   keeps the best credit anything ever proved for it. A retry is a second chance
   at a move, not a second move.

   The id is block + round + name. Name, not index: the same block assembles
   differently depending on the valgus gate and on whether the day is a double
   double day (see assembleCircuits), so an index would point at a different move
   on the next sitting — which is exactly why bankMove already banks by name.
   Round, because a main move in round two is a different unit of work from the
   same move in round one; `roundBase` numbers those absolutely across sittings
   so the two cannot collide. */
export function logicalRowId(row) {
  if (!row) return "";
  return String(row.block || "?") + "|" + String(row.round || 1) + "|" + String(row.name || "?");
}

/* How good a proof of one planned move a row is. A finished move outranks every
   partial, including a partial the arithmetic scores at 1 — `done` is the
   engine's own verdict against the 80% floor (DONE_WORK_FRACTION) and it is not
   re-litigated here. A skip proves nothing and ranks last, but is still kept
   when it is all there is: a move only ever skipped must stay visibly skipped,
   because the main-round rule turns on exactly that. */
function rowProofRank(row) {
  if (!row) return -1;
  if (row.status === "done") return 3;
  if (row.status === "partial") return 1 + streakCredit(row, true);
  return 0;
}

export function mergeLedgerRows(rows) {
  const best = new Map();
  (rows || []).forEach(row => {
    if (!row) return;
    const id = logicalRowId(row);
    const held = best.get(id);
    if (!held || rowProofRank(row) > rowProofRank(held)) best.set(id, row);
  });
  return [...best.values()];
}

/* ------------------------------------------------------------
   HOW EACH ROUND OF A MOVE ACTUALLY WENT.

   Three screens need to answer a question about a move ACROSS its rounds —
   the end report ("what is still owed"), the Today list (one icon per round)
   and the resume's redo ("offer those rounds again"). They used to answer it
   three different ways, and the screens disagreed.

   They go through here now, and the merge is the reason why. A day's rows are
   not one row per planned unit: a redo writes a SECOND row for the same
   block|round|name, so the raw list holds both the partial she cut short and
   the done she came back and finished. Counting raw rows leaves a move short
   forever — the redo could never clear it, and the report would keep offering
   a round she had already fixed. mergeLedgerRows keeps the best proof per
   logical row, so a round is judged once, on her best attempt at it.

   Banked rows are `done` (see bankMove), so nothing special is needed for
   them; a round she never reached has no row and is not short, it is simply
   not there.
   ------------------------------------------------------------ */
const moveHistoryKey = (block, name) => String(block || "?") + "|" + String(name || "?");

/* One merge, then indexed: move -> (round -> its best row). Callers that walk
   a whole plan build this ONCE rather than re-merging the ledger per move. */
export function roundHistoryByMove(rows) {
  const byMove = new Map();
  mergeLedgerRows(rows).forEach(row => {
    if (!row || !row.block || !row.name) return;
    const k = moveHistoryKey(row.block, row.name);
    let perRound = byMove.get(k);
    if (!perRound) { perRound = new Map(); byMove.set(k, perRound); }
    perRound.set(Number(row.round) || 1, row);
  });
  return byMove;
}

export function roundHistoryFor(rows, block, name) {
  return roundHistoryByMove(rows).get(moveHistoryKey(block, name)) || new Map();
}

/* The verdict one round of one move earned. `null` when she never reached it. */
export function roundStatusOf(row) {
  if (!row) return null;
  if (row.banked) return "done";
  return row.status || null;
}

/* The rounds of a move that were NOT completed in full, oldest first, each
   with what went wrong. This is the list the end report prints and the list
   the redo hands back — the same list, so the two cannot disagree about what
   is still owed. */
/* ONE predicate for "this round was not done in full", so the end report, the
   Today list and the redo cannot disagree about what is still owed. `missing`
   is deliberately not short: a round she never reached is not a round she came
   up short on, and offering it back as a redo would be a different promise. */
export const roundIsShort = (status) => status === "partial" || status === "skipped";

export function shortRoundsFrom(perRound) {
  if (!perRound) return [];
  return [...perRound.entries()]
    .map(([round, row]) => ({ round, status: roundStatusOf(row) }))
    .filter(r => roundIsShort(r.status))
    .sort((a, b) => a.round - b.round);
}

/* The same question asked of a day PLAN's move rows (dayPlanState's shape)
   instead of raw ledger rows. Those are already merged and already carry one
   status per planned round, so the screens that have a plan in hand use this
   and the ones that only have rows use shortRoundsFor — same predicate. */
export function shortRoundsByMoveFromPlan(moves) {
  const out = new Map();
  (moves || []).forEach(m => {
    if (!m || !m.name) return;
    const k = String(m.block || "?") + "|" + String(m.name);
    let g = out.get(k);
    if (!g) { g = { block: m.block, name: m.name, circuit: m.circuit, rounds: [], short: [] }; out.set(k, g); }
    g.rounds.push({ round: m.round, status: m.status });
    if (roundIsShort(m.status)) g.short.push({ round: m.round, status: m.status });
  });
  out.forEach(g => {
    g.rounds.sort((a, b) => a.round - b.round);
    g.short.sort((a, b) => a.round - b.round);
  });
  return out;
}

/* "round 3 short" · "rounds 2, 3 skipped" · "round 2 short · round 3 skipped".
   The round is NAMED rather than counted, because the Today list shows one
   icon per round in round order — so the two readings line up. A move with a
   single round has no round to name and just says what happened. */
export function shortRoundsLabel(short, totalRounds) {
  if (!short || !short.length) return "";
  const word = (st) => st === "skipped" ? "skipped" : "short";
  if (!(totalRounds > 1)) return word(short[0].status);
  const parts = [];
  ["partial", "skipped"].forEach(st => {
    const rs = short.filter(s => s.status === st).map(s => s.round);
    if (!rs.length) return;
    parts.push((rs.length > 1 ? "rounds " : "round ") + rs.join(", ") + " " + word(st));
  });
  return parts.join(" · ");
}

export function shortRoundsFor(rows, block, name) {
  return shortRoundsFrom(roundHistoryFor(rows, block, name));
}

/* ============================================================
   ONE WORKOUT, HOWEVER MANY SITTINGS IT TOOK

   A day trained in two goes writes two session records. Nothing could say they
   were the same workout: rows were told apart by `isoDate|dayKey` and resume
   was keyed on the weekday, so the progress screen counted two sessions, the
   average duration halved, and the completion rate was computed against a
   denominator that had grown by one for work that was really one day's.

   Records written from now on carry `workoutInstanceId` (minted in
   js/engine.js when a plan starts, carried on the day's progress record so a
   resume keeps it). Older rows and rows restored from the cloud have none, so
   they fall back to the day and the actual Edmonton date — which is exactly
   how they were already being grouped, so no history is re-read.

   The fragments' ledgers are merged per planned move (see mergeLedgerRows) and
   scored ONCE through deriveSessionOutcome, so a day that is complete only when
   both sittings are counted together reads complete — and reads it the same way
   everywhere.
   ============================================================ */
export function workoutOutcome(fragments) {
  // Oldest fragment first: it holds the plan the day was started against,
  // and the newest holds how the day actually ended.
  const frags = (fragments || []).slice().sort((a, b) =>
    String(a.isoDate).localeCompare(String(b.isoDate)));
  const first = frags[0] || {};
  const last = frags[frags.length - 1] || {};
  const version = frags.reduce((m, s) => Math.max(m, Number(s.outcomeVersion) || 0), 0) || null;
  /* GATED ON v4, AND THE GATE IS THE WHOLE POINT.

     The merge asks "what is the best proof this planned move was performed",
     which is the right question — but only of a ledger whose rows say which
     move they are. Before v4 a resume numbered its main rounds from one again
     (see roundOffset in js/engine.js), so the second sitting's round-two rows
     were written as round one and carry the SAME logical id as the first
     sitting's. Merging those collapses two real rounds into one: a green day
     already saved on the device would drop from complete to partial and lose
     the streak day she is standing on — which is exactly the re-scoring this
     file refuses to do anywhere else.

     So records written before the numbering was fixed keep the concatenated
     reading they were written under, and records written since get the merge. */
  const raw = frags.reduce((a, s) => a.concat(s.ledger || []), []);
  const ledger = Number(version) >= 4 ? mergeLedgerRows(raw) : raw;
  /* The day's ask, not the sum of the sittings' asks. Adding them would count
     the same plan once per attempt and make a finished day read as a third
     of itself. Every fragment already carries the DAY's expectedWork (see
     startSession), so the largest is the day's. */
  const expectedWork = frags.reduce((m, s) =>
    Number.isFinite(s.expectedWork) ? Math.max(m, s.expectedWork) : m, 0) || null;
  /* And per round, the LARGEST any fragment declares — not the last one to
     mention it. A resume's ragged round declares only what was left of it, and
     spreading the fragments in order let that smaller number overwrite the
     day's real ask: a remainder round cut short a second time then had every
     row it still knew about, and passed for a finished round. Taking the
     maximum asks each round for everything it was ever supposed to produce. */
  const expectedByRound = {};
  frags.forEach(s => Object.entries(s.expectedByRound || {}).forEach(([r, n]) => {
    expectedByRound[r] = Math.max(Number(expectedByRound[r]) || 0, Number(n) || 0);
  }));
  return deriveSessionOutcome({
    ledger,
    expectedWork,
    expectedByRound: Object.keys(expectedByRound).length ? expectedByRound : null,
    // Banked credit is already inside the merged ledger here: it is what the
    // EARLIER fragments hold. Passing it again would pay for it twice.
    bankedCredit: 0,
    safetyStop: frags.some(s => s.safetyStop || s.pain),
    explicitAbort: last.endedEarly === true,
    sessionType: last.sessionType || first.sessionType || null,
    practice: false,
    outcomeVersion: version,
    completedFully: frags.some(s => s.completedFully === true)
  });
}

/* ============================================================
   WHICH DAY A WORKOUT BELONGS TO

   Every fragment is stamped `isoDate` when finalize() runs — the moment the
   sitting ENDED — and this used to read that. So a bout begun at 23:40 and
   finished at 00:10 was filed under the next day: train again that evening and
   the two workouts collapsed onto one date, the Set below kept one of them, and
   a kid who had trained two nights running was shown a streak of one.

   The record already carries the answer. `dayIso` is the day the workout
   STARTED, stamped by the engine off the day-progress record, and the XP budget
   has keyed off it since the day a midnight bout could draw two budgets (see
   dayXpKey in js/store.js). XP knew; the streak never asked. One rule now, and
   store.js's dayXpKey delegates here so there is exactly one definition of it.

   The EARLIEST dayIso any fragment declares, because that is the one that names
   the day the work began. Rows written before the field existed have none and
   fall back to the finish stamp, which is how they already read — no history is
   re-dated. */
export function workoutDate(fragments) {
  const frags = fragments || [];
  let began = null;
  frags.forEach(s => {
    const d = s && s.dayIso;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (began === null || d < began) began = d;
    }
  });
  if (began) return began;
  const last = frags[frags.length - 1];
  return edmontonISO(last && last.isoDate) || "";
}

export function workoutInstances(sessions) {
  const byKey = new Map();
  (sessions || []).forEach(s => {
    if (!s || s.practice) return;
    const key = instanceKeyOf(s);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  });
  const out = [];
  byKey.forEach((rows, key) => {
    const frags = rows.slice().sort((a, b) =>
      String(a.isoDate).localeCompare(String(b.isoDate)));
    const last = frags[frags.length - 1];
    out.push({
      key,
      workoutInstanceId: last.workoutInstanceId || null,
      isoDate: last.isoDate,
      date: workoutDate(frags),
      dayKey: last.dayKey,
      lightResult: last.lightResult || last.light || null,
      sessionType: last.sessionType || null,
      fragments: frags,
      attempts: frags.length,
      durationSecs: frags.reduce((a, s) => a + (Number(s.durationSecs) || 0), 0),
      outcome: workoutOutcome(frags)
    });
  });
  return out.sort((a, b) => String(a.isoDate).localeCompare(String(b.isoDate)));
}

/* ---- THE DAYS THE STREAK IS BUILT FROM -----------------------------------

   The streak used to be `currentStreak(sessions.filter(countsForStreak))`,
   which judges each SITTING on its own. A day trained in two goes was then two
   short sessions, neither of which cleared the bar, while Today — which had
   already learned to combine them — told her the day counted. The app
   contradicting itself to a ten-year-old about the one number she cares about.

   A workout is the unit. These are the Edmonton dates its outcome earned. */
export function streakDatesOf(sessions) {
  return new Set(workoutInstances(sessions)
    .filter(w => w.outcome.countsForStreak)
    .map(w => w.date).filter(Boolean));
}

/* And the dates a finished recovery pass HOLDS without adding to — care is not
   training, so it cannot pay into a training streak, but the day she reports
   soreness honestly must not be the day the flame goes out. */
export function freezeDatesOf(sessions) {
  return new Set(workoutInstances(sessions)
    .filter(w => w.outcome.streakFreeze)
    .map(w => w.date).filter(Boolean));
}

/* ============================================================
   THE DAY RECORD — one authority, every screen a view of it

   There was no single "day" in the engine. Each screen rebuilt the day from
   raw session rows with its own date key, its own way of grouping sittings,
   its own filter and its own rounding, and so the same Monday read "done" on
   the strip, "partly done" on the card, "2 of 3" on Progress, "3 of 3" on the
   Grown-up board and "complete" on the finish screen. This settles each
   training day once:

     identity   the weekday it was FOR (dayKey) plus the date it was trained on
                (workoutDate: the start date, with the six-hour grace) — never
                the device-local workoutInstanceId, so a morning on the iPad and
                an afternoon on the phone are one workout;
     evidence   the log's rows merged per planned move, plus the work the log
                cannot see: the day-progress record while it exists, and the
                `bankedRows` the next sitting stamped on its row once the record
                was cleared. Both are marked `banked` so pace never grades a
                row it cannot measure;
     the ask    what the day was STARTED under — its first sitting's light and
                rounds — lowered only by a genuine tier drop, never by a lower
                light on a resume (that is what printed "2 of 1");
     numbers    minutes summed in seconds and rounded once; rounds scored on the
                merged ledger; movements in both units under both names;
                completion; the round-priced XP; streak and freeze.

   A pain stop is one sitting's fact, not the day's verdict: `hadPainStop` says
   it happened, `safetyStop` says the day ENDED there with nothing finished
   after it. Coming back and finishing is a finished day.
   ============================================================ */

const isCareRow = s => s.sessionType === "recovery" || s.sessionType === "spa";
const byIso = (a, b) => String(a.isoDate).localeCompare(String(b.isoDate));
const painRow = s => !!(s && (s.safetyStop || s.pain));

/* Every planned instance of the day under one light and round cap, in plan
   order, keyed the way dayPlanState keys them (block | absolute round | name). */
function plannedInstances(dayKey, light, roundsPlanned) {
  const full = roundsForLight(light);
  const circuits = assembleCircuits(dayKey, light,
    Number.isFinite(roundsPlanned) && roundsPlanned < full ? { mainRounds: roundsPlanned } : {});
  const out = [];
  circuits.forEach(c => {
    const rb = Number.isFinite(Number(c.roundBase)) ? Number(c.roundBase) : 1;
    for (let r = 1; r <= c.rounds; r++) c.exercises.forEach(ex => {
      if (ex.rounds && r > ex.rounds) return;
      out.push({ block: c.block, round: rb + r - 1, name: ex.name });
    });
  });
  return out;
}

/* The day's ask is lowered only by a genuine tier drop — a row that says so,
   or a tier_drop event inside the day's span — never by the plain minimum
   across sittings: a lower-light resume also stamps a smaller dayRoundsPlanned,
   and taking the minimum is exactly what printed "2 of 1". */
function tierDropCap(frags, events) {
  let cap = Infinity;
  frags.forEach(f => {
    if (Number(f.tierDropped) > 0 && Number.isFinite(f.dayRoundsPlanned)) cap = Math.min(cap, f.dayRoundsPlanned);
  });
  const t0 = Math.min(...frags.map(f => new Date(f.isoDate).getTime() - (Number(f.durationSecs) || 0) * 1000 - 3600000));
  const t1 = Math.max(...frags.map(f => new Date(f.isoDate).getTime()));
  (events || []).forEach(e => {
    if (e && e.type === "tier_drop" && e.day === frags[0].dayKey && e.t >= t0 && e.t <= t1 && Number(e.rounds) > 0) {
      cap = Math.min(cap, e.rounds);
    }
  });
  return cap;
}

/* Rows the log cannot see, from the two places they survive.

   Source A is the live day-progress record: a v6 record keeps its rows by name
   (see bankMove in engine.js); an older record only knows counts, and those
   are reconstructed the way the old app did — a main round the log holds ANY
   row for is judged by the log, never by a count, and the silent rounds are
   filled in plan order.

   Source B is what each saved sitting stamped about the work banked before it
   ran. A v6 row carries `bankedRows` by name. A pre-v6 row carries only
   `bankedCredit` and `bankedRounds`, counts of everything banked before it —
   rows from earlier SAVED sittings (in the log) plus rows from a sitting that
   never saved (not in the log). Only the second kind is missing, so the
   counts are taken net of what the earlier rows already prove. The engine paid
   XP on those stamps, so they are evidence, not invention. Prep is never
   synthesised: the engine never banks it. */
function bankedRowsFor(planned, logRows, prog, frags, expectedByRound, version) {
  const out = [];
  const seen = new Set(logRows.map(logicalRowId));
  const add = (p, source, extra = {}) => {
    const id = logicalRowId(p);
    if (seen.has(id) || p.block === "prep") return;
    seen.add(id);
    out.push({ block: p.block, round: Number(p.round || 1), name: p.name, status: "done",
               ...extra, banked: true, source });
  };
  const logRoundSet = new Set(logRows.filter(r => r.block === "main").map(r => Number(r.round || 1)));
  const silentRounds = [...new Set(planned.filter(p => p.block === "main" && !logRoundSet.has(p.round)).map(p => p.round))]
    .sort((a, b) => a - b);
  const bankRounds = (n, source) => silentRounds.slice(0, Math.max(0, n))
    .forEach(r => planned.forEach(p => { if (p.block === "main" && p.round === r) add(p, source); }));

  if (prog) {
    if (Array.isArray(prog.rows)) {
      prog.rows.forEach(r => { if (r && r.status === "done") add(r, "record", { secs: Number(r.secs) || 0 }); });
    } else {
      const logCounted = mainRoundReport(logRows, expectedByRound, version).filter(r => r.counts).length;
      bankRounds((Number(prog.mainRoundsCompleted) || 0) - logCounted, "record");
      const doneBlocks = new Set(prog.done || []);
      planned.forEach(p => {
        if (p.block !== "main" && (doneBlocks.has(p.block) || ((prog.moves || {})[p.block] || []).includes(p.name))) add(p, "record");
      });
    }
  }

  const stamped = frags.filter(f => Array.isArray(f.bankedRows));
  if (stamped.length) {
    stamped.forEach(f => f.bankedRows.forEach(r => {
      if (r && r.name && r.block && r.status !== "skipped") add(r, "row", { secs: Number(r.secs) || 0 });
    }));
    return out;
  }
  const last = frags[frags.length - 1];
  if (!last || Number(last.outcomeVersion) >= 6) return out;
  const lastIds = new Set((last.ledger || []).map(logicalRowId));
  const priorRows = logRows.filter(r => !lastIds.has(logicalRowId(r)));
  const priorCounted = mainRoundReport(priorRows, expectedByRound, version).filter(r => r.counts).length;
  const priorDone = priorRows.filter(r => r.status === "done" && r.block !== "prep").length;
  let credit = (Number(last.bankedCredit) || 0) - priorDone;
  if (credit <= 0) return out;
  const before = out.length;
  bankRounds((Number(last.bankedRounds) || 0) - priorCounted, "row");
  credit -= out.length - before;
  planned.forEach(p => {
    if (p.block !== "main" && credit > 0 && !seen.has(logicalRowId(p))) { add(p, "row"); credit--; }
  });
  return out;
}

/* WHAT A DAY IS WORTH, priced once.

   Showing up pays once per day — a resume never re-earns it — and each main
   round pays once off the MERGED ledger (roundPayCredit, so a short round is
   still paid the fraction she did), capped by the day's own ask. A pain-stop
   sitting contributes the rounds it finished when she comes back and goes on;
   a day that ENDS in a pain stop still pays nothing for that sitting, which is
   the promise the README makes — so on such a day only the rows the other
   sittings proved are priced. A recovery pass pays its show-up credit as it
   always has. Rows that exist only in this device's live day-progress record
   are never priced: XP with no saved row behind it is how a total drifts away
   from the history that is supposed to explain it. */
function dayPrice({ frags, careFrags, rows, safetyStop, expectedByRound, version, roundsPlanned }) {
  const showedUp = frags.some(f => !painRow(f) && outcomeOf(f).countsAsTraining);
  const careShowUp = careFrags.some(f => f.sessionType === "recovery" && !painRow(f));
  let payRows = rows.filter(r => r.source !== "record");
  if (safetyStop) {
    const painIds = new Set(frags.filter(painRow).reduce((a, f) => a.concat(f.ledger || []), []).map(logicalRowId));
    const cleanIds = new Set(frags.filter(f => !painRow(f)).reduce((a, f) => a.concat(f.ledger || []), []).map(logicalRowId));
    payRows = payRows.filter(r => r.banked || cleanIds.has(logicalRowId(r)) || !painIds.has(logicalRowId(r)));
  }
  const rounds = mainRoundReport(payRows, expectedByRound, version).reduce((a, r) => a + roundPayCredit(r), 0);
  const cap = XP_SHOWED_UP + XP_PER_ROUND * Math.max(0, Number(roundsPlanned) || 0);
  const raw = (showedUp ? XP_SHOWED_UP : 0) + (careShowUp ? XP_SHOWED_UP : 0) + Math.round(XP_PER_ROUND * rounds);
  return Math.min(cap, raw);
}

/* Build one record per training day.

   opts.sessions / opts.events / opts.dayProgress replace the stores (tests,
   and the XP settlement, which must price the LOG alone). opts.priceOnly
   skips the settled-XP lookup — the settlement itself calls this, so the
   lookup would recurse. */
export function dayRecords(opts = {}) {
  const sessions = (opts.sessions || loadSessions()).filter(s => s && !s.practice);
  const events = opts.events || loadEvents();
  /* A day-progress record is fresh for six hours past midnight at most (see
     loadDayProgress), so only today's and yesterday's records can be live.
     Older dates are not asked, which is also what keeps a season of records
     from re-reading storage once per day. */
  const today = todayISODate();
  const liveDates = new Set([today, shiftISO(today, -1)]);
  const progressFor = opts.dayProgress || (k => loadDayProgress(k));
  const dayProgress = (dayKey, date) => (liveDates.has(date) ? progressFor(dayKey) : null);
  const plans = new Map();
  const plannedFor = (dayKey, light, rounds) => {
    const k = dayKey + "|" + light + "|" + rounds;
    if (!plans.has(k)) plans.set(k, plannedInstances(dayKey, light, rounds));
    return plans.get(k);
  };
  const groups = new Map();
  sessions.forEach(s => {
    const key = String(s.dayKey) + "|" + workoutDate([s]);
    if (!groups.has(key)) groups.set(key, { train: [], care: [] });
    groups.get(key)[isCareRow(s) ? "care" : "train"].push(s);
  });
  /* A day whose only proof is the live record — a first sitting that crashed
     or never saved — is still a day she trained on. It is shown, never paid
     (see dayPrice). Only today's own records can be live, by construction. */
  if (!opts.sessions) {
    Object.keys(DAYS).forEach(dayKey => {
      const prog = progressFor(dayKey);
      if (!prog || !(Array.isArray(prog.rows) ? prog.rows.length : (prog.done || []).length || Number(prog.mainRoundsCompleted) > 0)) return;
      const key = dayKey + "|" + (prog.dayIso || todayISODate());
      if (!groups.has(key)) groups.set(key, { train: [], care: [], live: prog });
    });
  }
  const records = [];
  groups.forEach(({ train, care, live }, key) => {
    const [dayKey, date] = key.split("|");
    const frags = train.sort(byIso), careFrags = care.sort(byIso);
    const careOutcome = careFrags.length ? workoutOutcome(careFrags) : null;
    const streakFreeze = !!(careOutcome && careOutcome.streakFreeze);
    const recovery = careFrags.some(f => f.sessionType === "recovery");
    const careSecs = careFrags.reduce((a, f) => a + (Number(f.durationSecs) || 0), 0);
    const prog = live || dayProgress(dayKey, date);
    const liveProg = prog && (!prog.dayIso || prog.dayIso === date) ? prog : null;
    if (!frags.length && !live) {
      records.push({
        dayKey, date, weekday: dayKey, care: true, recovery, fragments: [], careFragments: careFrags,
        rows: [], mainRounds: [], mainRoundsDone: 0, roundsPlanned: 0, light: null, lowestLight: null,
        countsForStreak: false, streakFreeze, dayComplete: false, hadPainStop: false, safetyStop: false,
        overridden: false, minutes: Math.round(careSecs / 60), unsaved: false,
        performances: { performed: 0, planned: 0 }, movements: { performed: 0, planned: 0 },
        xpByRounds: recovery ? XP_SHOWED_UP : 0,
        settledXp: 0, version: null, outcome: careOutcome
      });
      return;
    }
    const first = frags[0] || null, last = frags[frags.length - 1] || null;
    const version = frags.reduce((m, s) => Math.max(m, Number(s.outcomeVersion) || 0), 0) || (live ? OUTCOME_VERSION : null);
    const light = first ? (first.lightResult || first.light || (DAYS[dayKey] || {}).defaultLight || "green")
      : (live.lockedLight || live.light || (DAYS[dayKey] || {}).defaultLight || "green");
    const lowestLight = first ? lockedLightFromLog(frags) : light;
    const liveCap = live && Number.isFinite(Number(live.roundsCap)) ? Number(live.roundsCap) : Infinity;
    const roundsPlanned = first ? Math.min(dayRoundsPlanned(first), tierDropCap(frags, events))
      : Math.min(roundsForLight(light), liveCap);
    let expectedWork = frags.reduce((m, s) => Number.isFinite(s.expectedWork) ? Math.max(m, s.expectedWork) : m, 0) || null;
    const expectedByRound = {};
    frags.forEach(s => Object.entries(s.expectedByRound || {}).forEach(([r, n]) => {
      expectedByRound[r] = Math.max(Number(expectedByRound[r]) || 0, Number(n) || 0); }));
    if (!first) {
      const circuits = assembleCircuits(dayKey, light,
        roundsPlanned < roundsForLight(light) ? { mainRounds: roundsPlanned } : {});
      expectedWork = countExpectedWork(circuits);
      Object.assign(expectedByRound, countExpectedByRound(circuits));
    }
    const ebr = Object.keys(expectedByRound).length ? expectedByRound : null;
    const logRows = mergeLedgerRows(frags.reduce((a, s) => a.concat(s.ledger || []), []));
    const planned = plannedFor(dayKey, light, roundsPlanned);
    const rows = logRows.concat(bankedRowsFor(planned, logRows, liveProg, frags, ebr, version));
    const mainRounds = mainRoundReport(rows, ebr, version);
    /* A record with no main rows at all — a row written before the ledger, or
       restored from a cloud that never had one — keeps the engine's bare count,
       the way outcomeOf has always read it. Only where there are NO rows: the
       moment the ledger can speak, it is the authority. */
    const legacyRounds = frags.reduce((m, f) => Math.max(m, Number(f.roundsDone) || 0), 0);
    const roundsCounted = rows.some(r => r.block === "main")
      ? mainRounds.filter(r => r.counts).length
      : Math.min(legacyRounds, Number.isFinite(roundsPlanned) ? roundsPlanned : legacyRounds);
    const hadPainStop = frags.some(painRow);
    const safetyStop = !!(last && painRow(last));
    const oc = deriveSessionOutcome({
      ledger: rows, expectedWork, expectedByRound: ebr, bankedCredit: 0, safetyStop,
      explicitAbort: !!(last && last.endedEarly === true), sessionType: "main",
      outcomeVersion: version, completedFully: frags.some(s => s.completedFully === true)
    });
    const st = dayPlanState(dayKey, { rows, light, roundsCap: roundsPlanned, fragments: frags });
    const liveSecs = liveProg ? (Number(liveProg.activeSecs) || 0) : 0;
    const secs = frags.reduce((a, f) => a + (Number(f.durationSecs) || 0) + (Number(f.bankedSecs) || 0), 0) + liveSecs;
    /* Only an adult's own tap is an override. Rows from before v6 blamed one
       on every resume the locked light lowered; a FIRST sitting has no lock
       to be lowered by, so its stamp is trusted and a later sitting's is not. */
    const overridden = frags.some((f, i) => f.wasOverridden === true && (Number(f.outcomeVersion) >= 6 || i === 0));
    records.push({
      dayKey, date, weekday: dayKey, care: false, recovery, light, lowestLight, roundsPlanned,
      expectedWork, expectedByRound: ebr, version,
      fragments: frags, careFragments: careFrags, rows, mainRounds, mainRoundsDone: roundsCounted,
      minutes: Math.round(secs / 60),
      performances: { performed: st.performed, planned: st.planned },
      movements: { performed: st.movementsPerformed, planned: st.movements },
      plan: st,
      hadPainStop, safetyStop, overridden,
      countsForStreak: oc.countsForStreak,
      streakFreeze,
      /* A row with no expected size was written before the day carried one,
         so "every move the plan asked for" cannot be asked of it. It keeps the
         reading it was always given — the outcome's own complete flag — rather
         than being re-scored as unfinished forever. */
      dayComplete: expectedWork === null
        ? oc.completedFully
        : (oc.countsAsTraining && oc.wholePlanAttempted && roundsCounted === roundsPlanned
           && mainRounds.every(r => r.counts)),
      unsaved: !first,
      xpByRounds: dayPrice({ frags, careFrags, rows, safetyStop, expectedByRound: ebr, version, roundsPlanned }),
      settledXp: 0,
      outcome: oc
    });
  });
  /* What the DATE settles at, on every record of that date — the same number
     the journey is rebuilt from (settledDayXp prices v6 dates off these very
     records, and older dates off their stamps). */
  if (!opts.priceOnly) {
    const settled = settledXpByDate(sessions, { records });
    records.forEach(r => { r.settledXp = settled.get(r.date) || 0; });
  }
  return records.sort((a, b) => a.date.localeCompare(b.date) || a.dayKey.localeCompare(b.dayKey));
}

/* One day, by the weekday it was for and the date it was trained on. */
export function dayRecordFor(dayKey, isoDate = null, opts = {}) {
  const date = isoDate || todayISODate();
  return dayRecords(opts).find(r => r.dayKey === dayKey && r.date === date) || null;
}

/* ---- THE STREAK, SCHEDULE-AWARE ------------------------------------------

   The old rule forgave any gap of one or two calendar days, so a Mon/Wed/Fri
   kid kept the flame — and so did a kid who skipped Wednesday. The streak now
   knows the plan: a scheduled weekday with neither a counting day nor a
   finished-recovery freeze breaks the run. Sunday (`DAYS[k].spa`) is never a
   gap, today with nothing on it is not a gap yet, and a freeze day counts in
   the length. A record covers the calendar date it was trained on: a Monday
   catch-up done on Wednesday is Wednesday's training day here; "counts for
   Monday" is the week strip's business.

   Applied forward from STREAK_SCHEDULE_FROM. Dates before it keep the old
   two-day-gap reading, so the number she is standing on tonight does not drop
   because a rule changed underneath her. */
export const STREAK_SCHEDULE_FROM = "2026-09-18";
export const LEGACY_STREAK_MAX_GAP = 2;
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const shiftISO = (iso, d) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const dayGap = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / DAY_MS);
const weekdayOf = iso => WEEKDAY_KEYS[new Date(iso + "T12:00:00Z").getUTCDay()];

function streakMarks(records) {
  const marks = new Map();
  (records || []).forEach(r => {
    if (!r || !r.date) return;
    if (r.countsForStreak) marks.set(r.date, "count");
    else if (r.streakFreeze && !marks.has(r.date)) marks.set(r.date, "freeze");
  });
  return marks;
}
function allFrozenBetween(marks, fromISO, toISO) {
  const gap = dayGap(fromISO, toISO);
  if (gap < 1) return false;
  for (let i = 1; i < gap; i++) if (marks.get(shiftISO(fromISO, i)) !== "freeze") return false;
  return true;
}
const legacyHolds = (marks, fromISO, toISO) =>
  dayGap(fromISO, toISO) <= LEGACY_STREAK_MAX_GAP || allFrozenBetween(marks, fromISO, toISO);

/* One forward walk from the first record to today, under the old rule before
   the cutoff and the schedule rule from it, joined by the old rule's tolerance
   at the first counted day of the new regime. Returns the run she is standing
   on and the best run ever. */
function streakWalk(records, todayISO, days = DAYS) {
  const marks = streakMarks(records);
  const dates = [...marks.keys()].filter(d => d <= todayISO).sort();
  if (!dates.length) return { current: 0, longest: 0 };
  let run = 0, best = 0, lastCount = null, newHit = false;
  for (let d = dates[0], i = 0; d <= todayISO && i < 4000; d = shiftISO(d, 1), i++) {
    const mark = marks.get(d);
    if (d < STREAK_SCHEDULE_FROM) {
      if (mark === "count") {
        run = lastCount && legacyHolds(marks, lastCount, d) ? run + 1 : 1;
        lastCount = d;
      } else if (lastCount && !legacyHolds(marks, lastCount, d)) {
        run = 0; lastCount = null;
      }
    } else {
      if (!newHit && lastCount && (mark || d === todayISO) && !legacyHolds(marks, lastCount, d)) run = 0;
      if (mark) { run += 1; newHit = true; }
      else if ((days[weekdayOf(d)] || {}).spa || !days[weekdayOf(d)]) { /* never a gap */ }
      else if (d === todayISO) { /* not over yet */ }
      else run = 0;
    }
    if (run > best) best = run;
  }
  return { current: run, longest: best };
}
export function scheduleStreak(records, todayISO = todayISODate(), days = DAYS) {
  return streakWalk(records, todayISO, days).current;
}
export function longestScheduleStreak(records, todayISO = todayISODate(), days = DAYS) {
  return streakWalk(records, todayISO, days).longest;
}
