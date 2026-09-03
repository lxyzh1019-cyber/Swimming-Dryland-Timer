/* ============================================================
   ONE SESSION-OUTCOME AUTHORITY

   "Did she train, how much, and does it pay?" used to be answered
   independently in the engine, the store, four view-models and the effort
   score — and they disagreed. The engine's `completedFully` meant only "the
   loop reached the end", so skipping every move still read as a finished
   session; meanwhile a session of 7-of-8 reps on every move read as NOTHING,
   because only a `done` ledger row counted as work.

   This module is the single answer. It is pure and dependency-free so the
   store, the view-models and the tests can all import it without a cycle.
   Nothing else may re-derive completion.
   ============================================================ */

/* Records written from this version carry `outcomeVersion`, which is what lets
   partial work count as work. Rows written before it keep the old done-only
   reading, so her existing history is not re-scored underneath her.

   v1 let partial rows count as work at all. v2 added the streak dose bar. v3
   judges a MAIN ROUND on its dose rather than demanding every move be perfect —
   see mainRoundReport below. Each step is gated on the version that introduced
   it, so a record is always read by the rules it was written under. */
export const OUTCOME_VERSION = 3;

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
     · the round's mean credit is at least ROUND_DOSE_FRACTION.

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
    const counts = doseJudged
      ? (missing === 0 && !skipped.length && ratio >= ROUND_DOSE_FRACTION)
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

export function mainRoundsFromLedger(ledger, expectedByRound = null, outcomeVersion = null) {
  return mainRoundReport(ledger, expectedByRound, outcomeVersion)
    .filter(r => r.counts).length;
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
  let countsForStreak;
  if (!streakJudged || workRatio === null) {
    countsForStreak = isTraining;                   // the old reading, unchanged
  } else if (state === "recovery") {
    countsForStreak = false;                        // care freezes, never counts
  } else if (isTraining) {
    countsForStreak = workRatio >= STREAK_WORK_FRACTION;
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
