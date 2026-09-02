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
   reading, so her existing history is not re-scored underneath her. */
export const OUTCOME_VERSION = 1;

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

/* Legacy rows (no ledger at all) fall back to the per-move shape. */
function legacyHadWork(entry) {
  return ((entry && entry.perExercise) || []).some(p => p && !p.skipped);
}

/* How many main rounds were actually finished — a round counts only when every
   one of its rows is `done` AND all of its rows are actually there.

   "All the rows that exist are done" is trivially true of a round that was cut
   short: abort three moves into an eight-move round two and the ledger holds
   three done rows, which read as a finished round and paid like one. So the
   record carries `expectedByRound` (see countExpectedByRound in js/engine.js)
   and a round has to produce that many rows before it can complete.

   Records written before this — legacy rows, and rows restored from the cloud
   or a backup — have no expected count, so they keep the old reading rather than
   being re-scored underneath her. */
export function mainRoundsFromLedger(ledger, expectedByRound = null) {
  const rows = (ledger || []).filter(l => l && l.block === "main");
  if (!rows.length) return 0;
  const byRound = new Map();
  rows.forEach(l => {
    const r = l.round || 1;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push(l);
  });
  let done = 0;
  byRound.forEach((rs, r) => {
    if (!rs.every(l => l.status === "done")) return;
    const expected = expectedByRound ? Number(expectedByRound[r]) : NaN;
    if (Number.isFinite(expected) && rs.length < expected) return;   // rows missing
    done += 1;
  });
  return done;
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
    expectedByRound = null, roundsDone = null
  } = input;

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

  /* Two independent witnesses to the same fact, and we believe the smaller one.
     The LEDGER says which rounds have a full set of done rows; the ENGINE says
     which rounds its own loop walked to the end without aborting (saved as
     `roundsDone`). Either can be wrong on its own — the ledger can be short a
     row the engine never wrote, and `roundsDone` is a bare number nothing else
     can check — so a round is only counted when both agree it happened. */
  const ledgerRounds = mainRoundsFromLedger(rows, expectedByRound);
  const engineRounds = Number(roundsDone);
  const mainRoundsDone = Number.isFinite(engineRounds)
    ? Math.min(ledgerRounds, Math.max(0, engineRounds))
    : ledgerRounds;
  const roundsDisagree = Number.isFinite(engineRounds) && engineRounds !== ledgerRounds;

  // Completion is "every expected instance was DONE" — never "the loop ended".
  // Partial rows do not complete a session even though they are real work.
  const expected = Number.isFinite(expectedWork) ? expectedWork : null;
  const allRowsDone = rows.length > 0 && rows.every(l => l && l.status === "done");
  const completedFully = expected !== null
    ? (doneRows >= expected && rows.length >= expected && allRowsDone)
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

  return {
    state,
    meaningfulWork,
    completedFully: state === "complete",
    mainRoundsDone,
    // Surfaced rather than logged here: this module stays pure and
    // dependency-free (store.js imports IT), so the caller does the logging.
    roundsDisagree,
    countsAsTraining: isTraining,
    countsForStreak: isTraining,
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
    safetyStop: !!(entry.safetyStop || entry.pain),
    explicitAbort: entry.endedEarly === true,
    sessionType: entry.sessionType || (entry.spa ? "spa" : null),
    practice: !!entry.practice,
    outcomeVersion: entry.outcomeVersion,
    completedFully: entry.completedFully
  });
}
