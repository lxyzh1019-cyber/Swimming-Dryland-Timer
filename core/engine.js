/* ============================================================
   SESSION ENGINE — port of the old app's async/await runner
   (speak-then-count sequencing, eachSide side-switch, intent
   word, clean-check, skip/pause/stop, valgus earn-back). The old
   DOM setters are replaced by mutations of the exported `sess`
   view-state + notify() callbacks:
     notify("phase") → full session-screen re-render
     notify("tick")  → targeted per-second DOM writes only
   ============================================================ */

import { deriveSessionOutcome, mainRoundsFromLedger, mainRoundReport, OUTCOME_VERSION,
         mergeLedgerRows, logicalRowId, workoutDate, paceReport } from "./outcome.js";
import { DAYS, BLOCK_ORDER, BLOCK_LABEL, LIGHT_ROUNDS, LIGHT_SESSION_POLICY, SIDE_SWITCH_BUFFER, INTENT_WORDS, MICRO_LOOP, BREATH_REHEARSAL, MANTRA,
         exWork, exRepsDetail, exPrescription, prescriptionSegments, repSeconds,
         needsSetup, SETUP_SECONDS,
         VALGUS_FLOOR, VALGUS_PROGRESSIONS } from "./data.js";
import { settings, configuredExerciseRest, configuredRoundRest, configuredSectionRest, saveSession, logEvent,
         loadDayProgress, saveDayProgress, clearDayProgress, gateLocked, creditValgusWeek, addSkipRecord,
         addXp, pendingDrawCount, claimSessionXp, athleteId, noteSessionXpAwarded, patchSession, sessionKey,
         XP_VERSION, flaggedMoves, isAbnormalCheck, stampReadinessOutcome, loadSessions } from "./store.js";
import { spokenDose } from "./plan.js";
import { speak, speakIfIdle, speakAndWait, interruptSpeech, cancelSpeech, nextEncouragement, beep, endBeep, playCue, ensureAudio, voiceOn, speakSafety } from "./audio.js";
import { APP_ID, DAY_LOAD_FIELD, FEATURES } from "./sport.js";
import { recoveryDoseSecs, refTime, edmontonISO, todayISODate, plural } from "./util.js";

// Moves that deserve a longer "get ready" lead-in before they start. Kept in
// sync with the names that actually appear in the 2026.2 content (js/data.js);
// stale entries were pruned so the lead-time branch fires when it should.
const HARD_EXERCISES = new Set([
  "Box Jump", "Box Jump-Down", "Bosu Squat", "Drop-and-Stick",
  "Clean Pull-Ups", "Scap Pull-Up + Dead Hang"
]);

/* Seconds added to the break BEFORE a move that has to be set up — a band
   anchored, a bar reached, a rope untangled. See needsSetup in js/data.js.
   Applied to every break that precedes the move (the opening lead-in, the rest
   between exercises, the round break and the block break) so she gets the same
   time to get ready wherever in the workout it falls, and counted in
   estimateSessionSecs so the day's "about N min" stays honest. */
function setupSecs(ex) { return needsSetup(ex) ? SETUP_SECONDS : 0; }

/* ---- session view-state (the single source the UI renders from) ---- */
export const sess = blankSession();

function blankSession() {
  return {
    running: false, paused: false, pauseReasons: [], pauseCount: 0,
    abort: false, skipExercise: false, forceDone: false, forceDoneAt: 0,
    byRepsResolver: null, intentResolver: null, microResolver: null,
    announceResolver: null, lastTapAt: 0,
    savedEntry: false, saveFailed: false,
    currentEx: null, skipped: [], perExercise: [], justSkipped: false,
    phase: "greeting",           // greeting|getready|work|reps|sideswitch|rest|roundRest|sectionRest|intent|microloop|breath|done
    circuits: [], ci: 0, ei: 0, round: 1, exDone: 0,
    /* WHAT THE SIDE LIST SHOWS, which is not what the runner walks. A resume
       runs the REMAINDER; the list shows the WHOLE DAY, with her own history
       on it, because the coloured pill beside each move is how she finds where
       she is picking up. `priorRows` is today's merged ledger from earlier
       sittings, which is where those colours come from. Both equal the
       runner's own view on a first sitting, in explore and in care. */
    listCircuits: [], priorRows: [],
    timerSecs: 0, timerMax: 0, urgent: false,
    exElapsed: 0, elapsed: 0, pausedSecs: 0, plannedSecs: 0, expectedWork: 0,
    clockAt: 0, activeMs: 0, pausedMs: 0, exMs: 0,
    upNextName: "", upNextDose: "", restCue: "",
    stopOverlay: false, confirmEnd: false, painFlag: false,
    discard: false, stopReason: null, confirmRestart: false,
    pendingCleanCheck: false, cleanCount: 0, wobblyCount: 0, lastWobbly: false,
    checkKind: null, landings: {}, wobblyStreak: 0, tierDropped: 0,
    spotChecks: [], spotAsked: {}, cleanCheckMove: null, formChecks: [], formResolver: null,
    intentWord: null, microLoop: null,
    exStatus: {},                // "ci-ei" -> done|partial|skipped
    // The completion ledger: one row per exercise per round, holding what was
    // actually done. Rounds, XP and every report derive from it.
    // `roundsBanked` is how many of `roundsCompleted` have already been written
    // into the day's progress record — see bankMainRounds.
    // Credit for moves finished EARLIER TODAY, carried in so a resumed sitting is
    // judged against the whole day rather than its own leftovers.
    bankedCredit: 0, dayExpectedWork: 0, dayPlannedSecs: 0,
    // `roundsCounted` is which rounds have already been committed, keyed
    // "ci:absoluteRound" — a round is committed the instant its last row lands,
    // and the check runs again at the bottom of the loop, so it has to be
    // idempotent. See commitRoundIfDone.
    ledger: [], roundsCompleted: 0, roundsBanked: 0, roundsCounted: {},
    // `roundsPlanned` is what THIS SITTING owes; `dayRoundsPlanned` is what the
    // DAY asked for, and `bankedRounds` is how much of it was already trained
    // before this sitting started. A resume needs all three — see
    // dayRoundsPlanned in js/store.js.
    roundsPlanned: 0, dayRoundsPlanned: 0, bankedRounds: 0,
    /* WHICH WORKOUT THIS IS — not which sitting. A day trained in two goes is
       one workout with two records, and until this existed nothing could say
       so: records were told apart by `isoDate|dayKey` and resume was keyed on
       the weekday, so a partial and the sitting that finished it were two
       unrelated rows. Reports counted them as two sessions and XP paid them as
       two. Minted when a plan starts, carried on the day's progress record, and
       written onto every session row and event the workout produces. */
    workoutInstanceId: null,
    savedOutcome: null,
    blocksCompleted: 0, expectedByRound: {},
    repsCounted: 0, repsTarget: 0, repNow: 0, segmentsDone: 0, segmentsPlanned: 0,
    sideLabel: "", segmentLabel: "",
    /* Live coach state. The engine has always known all of this; it just never
       said it out loud anywhere she could see. Speech may announce it, but the
       VISUAL state is the source of truth — a device with no installed voice
       has to be able to follow the whole session from the screen. */
    currentSet: 0, totalSets: 0,
    currentSide: 0, totalSides: 0,
    currentDirection: 0, totalDirections: 0,
    repInSegment: 0, repsInSegment: 0,
    currentSegment: 0, totalSegments: 0,
    // "normal" | "recovery". Mini is gone as a thing that can be STARTED — the
    // traffic light is the one dial that shortens a session now — but records
    // written when it existed are still read everywhere they are reported.
    mode: "normal",
    /* THE RUNNER'S POSITION, as a flat index. The workout is walked as one
       ordered list of steps (see buildSteps) rather than three nested loops,
       which is what lets "back a move" exist at all: `stepIdx` is where she is,
       `backTo` is where she asked to return to, and the ledger holds exactly one
       row per step already walked, so rewinding is a truncation. */
    stepIdx: 0, totalSteps: 0, backTo: null, steps: [],
    /* EXPLORE — the same screen with nothing counting down and nothing saved.
       `holdResolver` is how a move ends in explore: not a clock, a tap, and
       `jumpTo` is the step a tap on the LIST asked for. */
    explore: false, holdResolver: null, jumpTo: null,
    dayKey: null, light: "green", practice: false, spa: false, recovery: false,
    endedEarly: false, xpEarned: 0, leveledUp: false,
    mood: null, wentWell: null, nextTime: null, quizPick: null, quizXp: 0,
    /* Every key the runner ever writes is declared HERE, because exitSession
       resets with Object.assign and an assign cannot remove what it does not
       mention. `quizCapped` leaking into the next session is what made a fresh
       finish screen say "that's today's quiz XP maxed out" about a quiz she
       had not taken yet. (`savedEntry` and `saveFailed` were also declared
       twice in this literal, once as null and once as false, so the "nothing
       saved" sentinel had two spellings.) */
    quizCapped: false, saySafetyStop: false,
    suggestedLight: null, readinessDetail: null, dayIso: null,
    savedKey: null, fsId: null
  };
}

let notify = () => {};
export function onSessionUpdate(fn) { notify = fn; }

/* ---- circuits assembly (2026.2 block model) ---- */
/* The day the recovery menu lives on. A weekday that resolves to Recovery
   borrows THIS content — it does not invent a lighter version of its own
   workout, because "a lighter workout" is exactly what a body reporting pain
   should not be handed. */
export const RECOVERY_SOURCE_DAY = "sunday";

/* Recovery is its own kind of session: the existing Sunday menu, one pass, no
   main circuit, no prep, no finisher. Split out of assembleCircuits so a
   weekday resolving to Recovery reaches the same content by the same path. */
export function assembleRecoveryCircuit(dayKey) {
  const day = DAYS[dayKey] || {};
  const src = (day.recovery && day.recovery.length) ? day : (DAYS[RECOVERY_SOURCE_DAY] || {});
  const menu = (src.recovery || []).map(r => {
    const { secs, eachSide } = recoveryDoseSecs(r.dose);
    return { name: r.name, block: "recovery", driver: "time", work: secs,
      dose: r.dose, cue: r.why, eachSide, rest: 3 };
  });
  const exercises = menu.concat(src.recoveryHolds || []);
  if (!exercises.length) return [];
  return [{ name: "Recovery", block: "recovery", rounds: 1, exercises }];
}

/* Rounds a light asks for. Recovery asks for ZERO, and zero has to survive:
   the old `Math.max(1, LIGHT_ROUNDS[light] || 1)` turned it into one, which is
   how a Recovery day launched warm-up, coordination, a main circuit, prep, a
   finisher and skill work at a body that had just reported pain. */
export function roundsForLight(light) {
  const n = LIGHT_ROUNDS[light];
  return Number.isFinite(n) ? n : 1;
}

/* Which of two lights asks for LESS. Recovery is the lightest dose there is —
   no training rounds at all — and green the heaviest. Used to hold a workout to
   the light it started under while still letting a later, worse body check
   shorten what is left of it (see startSession). */
export const LIGHT_ORDER = ["recovery", "red", "yellow", "green"];
/* JUMP-FATIGUE TIER-DROP (pure). Two wobbly landings in a row remove the
   highest remaining main round — never the one in progress. Only a sport with
   a landing rule asks for landings at all (see FEATURES.landingCheck). */
export function tierDroppedRounds(currentRounds, wobblyStreak, roundInProgress) {
  if (wobblyStreak >= 2 && currentRounds > roundInProgress) {
    return Math.max(roundInProgress, currentRounds - 1);
  }
  return currentRounds;
}

/* Apply a tier-drop mid-run. The circuit's rounds shrink, the steps of the
   dropped round are taken out of the walk, and — because the day now asks for
   fewer rounds — the cap is written to the day's progress record so a resume
   cannot ask the round back, and the owed-work totals are re-derived from the
   shortened plan. XP, the finish screen and Today then agree on what was owed. */
function applyTierDrop(circuit, rounds, steps, s, moveName, round) {
  circuit.rounds = rounds;
  for (let k = steps.length - 1; k > s; k--) {
    if (steps[k].circuit === circuit && steps[k].r > rounds) steps.splice(k, 1);
  }
  sess.totalSteps = steps.length;
  sess.tierDropped = (sess.tierDropped || 0) + 1;
  sess.wobblyStreak = 0;
  sess.roundsPlanned = rounds;
  sess.dayRoundsPlanned = Math.min(sess.dayRoundsPlanned, (sess.bankedRounds || 0) + rounds);
  const prog = readDayProgress();
  prog.roundsCap = sess.dayRoundsPlanned;
  saveDayProgress(sess.dayKey, prog);
  sess.dayExpectedWork = countExpectedWork(assembleCircuits(sess.dayKey, sess.light, { mainRounds: sess.dayRoundsPlanned }));
  sess.expectedWork = Math.max(sess.dayExpectedWork, countExpectedWork(sess.circuits));
  sess.expectedByRound = countExpectedByRound(sess.circuits);
  logEvent("tier_drop", { move: moveName, round, rounds: sess.dayRoundsPlanned });
}

/* lowerLight where either side may be missing — two sources for the same fact,
   and a fact only one of them holds is still the fact. */
export function lowerOrNull(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return lowerLight(a, b);
}

export function lowerLight(a, b) {
  const ia = LIGHT_ORDER.indexOf(a), ib = LIGHT_ORDER.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia <= ib ? a : b;
}

export function assembleCircuits(dayKey, light, opts = {}) {
  const day = DAYS[dayKey];
  if (!day) return [];
  // Sunday is recovery by design; any other day becomes recovery when the
  // readiness check says so.
  if (day.spa || light === "recovery") return assembleRecoveryCircuit(dayKey);
  /* Normally the light sets the main rounds. A RESUME overrides it with what is
     still owed, so a day already part-trained asks for the remainder instead of
     the whole thing again — see startSession. */
  const rounds = Number.isFinite(opts.mainRounds)
    ? Math.max(0, opts.mainRounds) : roundsForLight(light);
  const skipBlocks = opts.skip || [];
  /* A resume drops the moves already banked today (see bankMove), by name.
     `mainPartialRound` is the subset banked inside a main round that never
     finished — main is the one block whose remainder is a RAGGED ROUND rather
     than a shorter block, so it is handled separately below. */
  const skipMoves = opts.skipMoves || {};
  const mainPartial = opts.mainPartialRound || [];
  /* HOW MANY MAIN ROUNDS OF THE DAY ARE ALREADY BEHIND US.

     A resume's rounds are rounds 2 and 3 of the day, not rounds 1 and 2 of a
     new one, and the ledger has to say so. Without this offset the second
     sitting wrote rows that COLLIDED with the first sitting's: a green day
     finished across two goes held twelve rows under "round 1" and no round 3 at
     all, so the reports read 2 of 3 while the finish screen — which counts the
     day's banked rounds separately — read 3 of 3. Worse, a move skipped in the
     evening was then blamed on the round she had finished before lunch.

     See startSession, which passes the rounds bankMainRounds has already put on
     disk. Zero for a first sitting, which is why nothing about a single-sitting
     day moves. */
  const roundOffset = Math.max(0, Number(opts.roundOffset) || 0);
  const circuits = [];
  /* The light decides which blocks run, not just how many main rounds. One
     policy object drives assembly, and everything downstream — the duration
     estimate, the preview, expected work, completion — is derived from the
     circuits this returns, so none of them can disagree with it. */
  const policy = LIGHT_SESSION_POLICY[light] || LIGHT_SESSION_POLICY.green;
  const order = BLOCK_ORDER.filter(bk => policy.blocks.includes(bk));
  order.forEach(bk => {
    if (skipBlocks.includes(bk)) return;
    let exs = (day.blocks[bk] || []).slice();
    // Standing rule: jump rope hidden on double-session days.
    if (bk === "warmup" && day[DAY_LOAD_FIELD] === "double") {
      exs = exs.filter(ex => !/jump rope/i.test(ex.name));
    }
    // A locked gate now actually gates. The app has always DISPLAYED a
    // locked/unlocked valgus state and nothing ever read it, so a jump
    // progression would have run whatever the grown-up had set. Locked means
    // every jump stays at Drop-and-Stick, exactly as the Grown-up Zone says.
    if (opts.gated !== false && gateLocked() && exs.some(ex => VALGUS_PROGRESSIONS.includes(ex.name))) {
      // The floor is looked for in this block, then this day's main, then
      // anywhere in the week: a jump day that never lists the floor itself
      // used to lose every jump behind a locked gate instead of keeping one.
      const floor = exs.find(ex => ex.name === VALGUS_FLOOR)
        || (day.blocks.main || []).find(ex => ex.name === VALGUS_FLOOR)
        || Object.values(DAYS).flatMap(d => Object.values(d.blocks || {}).flat()).find(ex => ex && ex.name === VALGUS_FLOOR);
      exs = exs.filter(ex => !VALGUS_PROGRESSIONS.includes(ex.name));
      if (floor && !exs.includes(floor)) exs.push(floor);
    }
    /* Moves finished earlier today are not asked for again. A block that empties
       out entirely falls through the length check below and is simply not run,
       which is the same outcome as having its name on the done list. */
    if (bk !== "main" && (skipMoves[bk] || []).length) {
      const banked = skipMoves[bk];
      exs = exs.filter(ex => !banked.includes(ex.name));
    }
    if (!exs.length) return;
    if (bk === "main" && rounds <= 0 && !mainPartial.length) return;   // nothing owed
    if (bk === "main") {
      /* THE RAGGED ROUND.

         A main round interrupted halfway is neither finished nor untouched, so
         the resume runs what is LEFT of it as a round of its own, and only then
         the full rounds still owed. Two circuits, and neither may call its first
         round "round 1" when the day already has rounds behind it: `roundBase`
         numbers each circuit's rounds from `roundOffset` above, so the ledger,
         commitRoundIfDone and countExpectedByRound all agree on which round of
         THE DAY a row belongs to — across sittings, not just within one.

         That numbering is what keeps the round-completion proof honest. The
         remainder circuit declares its OWN expected size, so finishing those
         moves credits the interrupted round exactly once — and a remainder
         round cut short again still cannot pass for a finished one. */
      const remainder = exs.filter(ex => !mainPartial.includes(ex.name));
      const ragged = !!(mainPartial.length && remainder.length);
      /* The interrupted round is ONE OF THE ROUNDS STILL OWED, not an extra one
         in front of them. `rounds` is the remainder the caller computed from
         the day's plan, and finishing the ragged round finishes the first of
         them — so the full rounds that follow are one fewer. Counting it as
         extra ran a green day for four main rounds and printed "4 of 3". */
      const fullRounds = Math.max(0, rounds - (ragged ? 1 : 0));
      // Both numbered from where the day actually is.
      const base = roundOffset + (ragged ? 2 : 1);
      if (ragged) {
        circuits.push({ name: BLOCK_LABEL[bk], block: bk, rounds: 1,
                        roundBase: roundOffset + 1, partialRound: true,
                        exercises: remainder });
      }
      if (fullRounds > 0) {
        circuits.push({ name: BLOCK_LABEL[bk], block: bk, rounds: fullRounds,
                        roundBase: base, exercises: exs });
      }
    } else {
      circuits.push({ name: BLOCK_LABEL[bk], block: bk, rounds: 1,
                      roundBase: 1, exercises: exs });
    }
    if (bk === "main" && policy.blocks.includes("prep")
        && day.prepMenu && day.prepMenu.length && !skipBlocks.includes("prep")) {
      circuits.push({ name: BLOCK_LABEL.prep, block: "prep", rounds: 1,
                      roundBase: 1, exercises: day.prepMenu });
    }
  });
  return circuits;
}

/* ---- form spot-checks -----------------------------------------------------
   The clean/wobbly self-check used to fire after EVERY main and prep exercise —
   a dozen taps a session. Tap fatigue makes the answers meaningless, and those
   answers are the app's only read on technique.

   So the app picks 2–3 moves at random at the start of the run and asks about
   those alone. She doesn't know which are watched, so the only way to score
   well is to do every move properly — and each prompt now gets a considered
   answer instead of a reflex tap. */
export const SPOT_CHECK_MIN = 2;
export const SPOT_CHECK_MAX = 3;

export function pickSpotChecks(circuits, rnd = Math.random, flagged = null) {
  const names = [];
  (circuits || []).forEach(c => {
    if (c.block !== "main" && c.block !== "prep") return;
    (c.exercises || []).forEach(ex => { if (ex && ex.name && !names.includes(ex.name)) names.push(ex.name); });
  });
  if (!names.length) return [];
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // A move a grown-up verified as FAILING goes to the front of the queue: it is
  // the one the app most needs a fresh read on, and re-teaching it is the point.
  const flags = flagged || flaggedMoves();
  const priority = shuffle(names.filter(n => flags.includes(n)));
  const rest = shuffle(names.filter(n => !flags.includes(n)));
  const want = SPOT_CHECK_MIN + Math.floor(rnd() * (SPOT_CHECK_MAX - SPOT_CHECK_MIN + 1));
  return [...priority, ...rest].slice(0, Math.min(want, names.length));
}

/* How many exercise-round instances the session asks for. This is the yardstick
   completion is measured against: a session that ended early leaves rows
   MISSING from the ledger, and missing rows are not a completed session however
   cleanly the loop exited. */
/* Which round of the DAY a circuit's local round `r` is. One place, because the
   ledger, the completion check and the expected-count map all have to agree. */
export function roundNumber(circuit, r) {
  const base = Number(circuit && circuit.roundBase);
  return (Number.isFinite(base) ? base : 1) + r - 1;
}

export function countExpectedWork(circuits) {
  let n = 0;
  (circuits || []).forEach(c => {
    for (let r = 1; r <= c.rounds; r++) {
      c.exercises.forEach(ex => { if (!(ex.rounds && r > ex.rounds)) n++; });
    }
  });
  return n;
}

/* How many MAIN-circuit rows each main round was supposed to produce, as
   { "1": 8, "2": 8, "3": 8 }.

   Without this a completed round is unprovable from the saved record.
   `mainRoundsFromLedger` used to call a round done when every row it could SEE
   was done — but a session aborted three moves into round two leaves five rows
   simply missing, and "all of the rows that exist are done" is trivially true of
   three rows out of eight. The record now carries what each round asked for, so
   a round completes only when the ledger holds that many done rows.

   Built with the same `ex.rounds && r > ex.rounds` rule as countExpectedWork and
   the runner itself, so the expected count and the rows the runner writes cannot
   drift apart. */
export function countExpectedByRound(circuits) {
  const out = {};
  (circuits || []).forEach(c => {
    if (c.block !== "main") return;
    for (let r = 1; r <= c.rounds; r++) {
      let n = 0;
      c.exercises.forEach(ex => { if (!(ex.rounds && r > ex.rounds)) n++; });
      // The ABSOLUTE round, so a resume's remainder round and the full rounds
      // that follow it do not both claim round 1 — see roundBase in
      // assembleCircuits. The remainder therefore declares its own smaller size,
      // which is exactly what lets it prove itself finished.
      const abs = roundNumber(c, r);
      out[abs] = (out[abs] || 0) + n;
    }
  });
  return out;
}

/* Estimated session length in seconds (rep-based ≈ secondsPerRep × reps). */
export function estimateSessionSecs(circuits) {
  let total = 0;
  const exRest = configuredExerciseRest();
  const roundRest = configuredRoundRest();
  circuits.forEach(c => {
    for (let r = 1; r <= c.rounds; r++) {
      let exInRound = 0;
      c.exercises.forEach(ex => {
        if (ex.rounds && r > ex.rounds) return;
        exInRound++;
        // Every setup move is preceded by some break, and the runner lengthens
        // that break by exactly this much — see setupSecs.
        total += setupSecs(ex);
        if (ex.byReps) {
          // Straight from the prescription: every rep of every segment, plus a
          // reset between segments. The old guess re-derived reps from the
          // display string with the same regex that never matched.
          const p = exPrescription(ex);
          total += p.totalReps * repSeconds(p, settings.secondsPerRep || 3)
                 + Math.max(0, p.segments - 1) * SIDE_SWITCH_BUFFER;
        } else {
          total += exWork(ex) + (ex.eachSide ? SIDE_SWITCH_BUFFER : 0);
        }
      });
      total += exRest * Math.max(0, exInRound - 1);
      if (r < c.rounds) total += roundRest;
    }
  });
  total += Math.max(0, circuits.length - 1) * configuredSectionRest();
  return Math.round(total);
}

/* Planning-estimate per exercise — re-exported from util so session VM imports
   (import { refTime } from "../engine.js") keep working from one definition. */
export { refTime };

/* ---- primitives (ported: abort/skip aware, pause-respecting) ---- */

function countdown(seconds, opts = {}) {
  // Timestamp-based: remaining is derived from a real deadline, so a throttled
  // background tab (or a slow tick) can't make the clock drift — it self-corrects
  // to wall-clock time. While paused the deadline is pushed forward so no time
  // is lost. Per-second side effects (beeps/onTick/notify) fire once per whole
  // second actually crossed.
  return new Promise(resolve => {
    sess.timerSecs = seconds; sess.timerMax = seconds; sess.urgent = false;
    notify("tick");
    const started = Date.now();
    const since = Math.min(started, Number(opts.since) || started);
    let deadline = started + seconds * 1000;
    let lastWhole = seconds;
    const id = setInterval(() => {
      if (sess.abort)        { clearInterval(id); resolve("abort"); return; }
      if (sess.backTo != null) { clearInterval(id); resolve("back"); return; }
      // Honor a Done-tap only if it landed AFTER this countdown began — a stale
      // flag from the previous phase must not skip a freshly-started one. A
      // REST passes `since`, the moment its phase began: a Skip Rest tap while
      // the coach is still saying "Rest. Next: …" is a decision about this
      // rest, and used to be dropped as stale because the clock had not
      // started yet. Work never passes it — a tap in the beat after a move's
      // announcement is "go", not "done". A countdown SHE ended resolves
      // "cut", not "done": a rest she skipped is not a rest that ran out, and
      // the caller has to know which (see the rest phase, where "done" earns
      // a "Go" and "cut" earns the move's name).
      if (sess.forceDone && sess.forceDoneAt >= since) { sess.forceDone = false; clearInterval(id); endBeep(); resolve("cut"); return; }
      if (sess.forceDone && sess.forceDoneAt < since) sess.forceDone = false;   // drop the stale flag
      if (sess.skipExercise) { clearInterval(id); resolve("skip");  return; }
      if (sess.paused) { deadline = Date.now() + lastWhole * 1000; return; }

      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining === lastWhole) return;   // still inside the same whole second
      lastWhole = remaining;
      sess.timerSecs = remaining;
      sess.urgent = remaining <= 3 && remaining > 0;
      if (opts.onTick) opts.onTick(remaining);
      if (remaining <= 3 && remaining > 0) beep(remaining === 1 ? 880 : 440, 0.1);
      else if (remaining > 3) playCue(sess.phase === "work" ? "tickSoft" : "tickRest");
      if (remaining <= 0) { endBeep(); notify("tick"); clearInterval(id); resolve("done"); return; }
      notify("tick");
    }, 200);
  });
}

function sleep(ms) {
  return new Promise(resolve => {
    const started = Date.now();
    let elapsed = 0, last = started;
    const id = setInterval(() => {
      if (sess.abort)        { clearInterval(id); resolve("abort"); return; }
      if (sess.backTo != null) { clearInterval(id); resolve("back"); return; }
      if (sess.forceDone && sess.forceDoneAt >= started) { sess.forceDone = false; clearInterval(id); resolve("done"); return; }
      if (sess.forceDone && sess.forceDoneAt < started) sess.forceDone = false;
      if (sess.skipExercise) { clearInterval(id); resolve("skip");  return; }
      const now = Date.now();
      // Accumulate only unpaused time — a pause mid-sleep must not swallow the
      // remainder when resumed (raw now-start would already exceed ms).
      if (!sess.paused) elapsed += now - last;
      last = now;
      if (elapsed >= ms) { clearInterval(id); resolve("done"); }
    }, 100);
  });
}

/* ---- reps: a real state machine over the structured prescription ----------
   This used to read the DISPLAY string with a regex that never matched, so
   every rep exercise counted to 10 once and none of them ever switched sides.
   The count, the cadence, the sets and the sides now all come from
   ex.prescription (parsed in data.js), and the exercise is walked as an
   ordered list of segments — one per set × side × direction — with a reset
   between each.

   Done at any point ENDS THE EXERCISE. Whether that counts as finished is not
   decided here: the caller compares repsCounted against the target. */

const CADENCE_PATTERN = /\d+s\s+(?:up|open|raise)/i;
export function screenRepsDetail(ex) {
  const detail = exRepsDetail(ex) || ex.dose;
  if (!(ex.byReps && CADENCE_PATTERN.test(ex.repsDetail || ""))) return detail;
  const m = detail.match(/^(\d+\s+reps?)/i);
  return m ? m[1] : detail.replace(/·.*$/, "").trim();
}

/* Wait `ms` of UNPAUSED time, bailing the moment the exercise is over. */
function repSleep(ms, stopped) {
  return new Promise(resolve => {
    const started = Date.now();
    let elapsed = 0, last = started;
    const id = setInterval(() => {
      if (stopped() || sess.abort || sess.skipExercise || sess.backTo != null) { clearInterval(id); resolve("interrupt"); return; }
      const now = Date.now();
      if (!sess.paused) elapsed += now - last;
      last = now;
      if (elapsed >= ms) { clearInterval(id); resolve("done"); }
    }, 50);
  });
}

/* One rep, spoken and beeped. Tempo reps get their phase words ("Up / Hold /
   Down"); plain reps get the number. Counting continues with the voice off —
   the beeps and the clock still have to be right.

   A REP IS COUNTED WHEN IT HAS BEEN PERFORMED, not when it is called. The count
   used to be incremented at the top, so the number was really "reps started":
   stop during the eighth of eight and the ledger recorded eight, which is a rep
   she was interrupted in the middle of, credited in full. `repsCounted` is what
   grades the move (repsCounted >= repsTarget is `done`) and what pro-rates a
   partial one, so an over-count paid for work that did not happen.

   `sess.repNow` is the rep she is IN, which is what the screen wants; the two
   were the same field and could not both be right. */
async function runOneRep(ex, p, n, stopped) {
  sess.repNow = n;
  notify("tick");
  const counted = (r) => {
    if (r !== "interrupt") { sess.repsCounted += 1; notify("tick"); }
    return r;
  };
  if (!p.tempo) {
    // Pace on the CLOCK, with speech layered on top — never on how long the
    // voice happens to take. A device with no installed voices (or speech
    // blocked before the first tap) resolves speakAndWait instantly, and a
    // whole set then flew past in milliseconds and was recorded as skipped.
    // A rep also isn't a rep if it takes 200ms.
    const started = Date.now();
    if (voiceOn()) await speakAndWait(String(n));
    else beep(660, 0.08);
    const target = Math.max(1, settings.secondsPerRep || 3) * 1000;
    const left = target - (Date.now() - started);
    if (left > 0) return counted(await repSleep(left, stopped));
    return counted(stopped() ? "interrupt" : "done");
  }
  const words = ex.tempoWords || ["Up", "Hold", "Down"];
  const freqs = [660, 880, 440];
  for (let i = 0; i < p.tempo.length; i++) {
    const secs = p.tempo[i];
    if (secs <= 0) continue;
    if (stopped()) return "interrupt";
    while (sess.paused && !stopped()) { if (await repSleep(200, stopped) === "interrupt") return "interrupt"; }
    if (stopped()) return "interrupt";
    if (voiceOn()) speak(i === 0 ? `${n}. ${words[i]}` : words[i]);
    beep(freqs[i], 0.1);
    for (let s = 0; s < secs; s++) {
      if (await repSleep(1000, stopped) === "interrupt") return "interrupt";
      if (s < secs - 1) beep(freqs[i], 0.06);
    }
  }
  return counted("done");
}

/* The reset between two segments. Done here means "skip the wait", not "end
   the exercise" — advance() routes it to the countdown, not the resolver. */
async function segmentBreak(seg) {
  setPhase("sideswitch");
  /* Stamped before the line is spoken, like the rests: she is switching sides
     while the coach says so, and a tap then means "I'm round, go". Without it
     the countdown only honoured a tap made after IT started, so a tap during
     the line — or in the beat after it — was thrown away as stale and the five
     seconds ran on. Every side, direction and set of every rep move passes
     through here. */
  const switchSince = Date.now();
  const line = seg.transition === "side"      ? "Nice. Switch sides — five to reset."
             : seg.transition === "direction" ? "Nice. Other direction — five to reset."
             :                                  "Nice. Next set — five to reset.";
  await speakAndWait(line);
  return countdown(SIDE_SWITCH_BUFFER, { since: switchSince });
}

/* A prescribed range ("2–3 clean reps", "8–10/side") counts the LOW number —
   the reps she can always make cleanly — and then offers the extra rather
   than demanding it. She takes them and taps Done, or the offer times out. */
async function offerExtraReps(p, stopped) {
  const extra = p.repsHigh - p.reps;
  if (extra <= 0) return;
  if (voiceOn()) await speakAndWait(`That's ${p.reps}. ${extra === 1 ? "One more" : `Up to ${extra} more`} if they're still clean — then tap Done.`);
  const window = extra * (settings.secondsPerRep || 3) * 1000 + 3000;
  await repSleep(window, stopped);
}

async function runPrescribedReps(ex) {
  const p = exPrescription(ex);
  const segments = prescriptionSegments(p);
  sess.repsTarget = p.totalReps;
  sess.repsCounted = 0;
  sess.repNow = 0;
  sess.segmentsPlanned = segments.length;
  sess.segmentsDone = 0;
  sess.segmentLabel = "";
  sess.totalSets = p.sets; sess.totalSides = p.sides; sess.totalDirections = p.dirs;
  sess.totalSegments = segments.length; sess.currentSegment = 0;
  sess.currentSet = 0; sess.currentSide = 0; sess.currentDirection = 0;
  sess.repInSegment = 0; sess.repsInSegment = 0;

  let stopped = false;
  const isStopped = () => stopped;

  // One resolver for the whole exercise: Done, Skip or abort at any point in
  // any segment ends it, and the work loop resolves the same promise when it
  // runs out of segments.
  const finished = new Promise(resolve => {
    const watchdog = setInterval(() => {
      if (sess.abort || sess.skipExercise || sess.backTo != null) {
        clearInterval(watchdog);
        const r = sess.byRepsResolver;
        if (r) { sess.byRepsResolver = null; r(sess.abort ? "abort" : sess.backTo != null ? "back" : "skip"); }
      }
    }, 200);
    sess.byRepsResolver = (result) => {
      clearInterval(watchdog);
      stopped = true;
      sess.byRepsResolver = null;
      cancelSpeech();
      resolve(result);
    };
  });

  const workLoop = (async () => {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (stopped) return;
      if (i > 0) {
        const br = await segmentBreak(seg);
        if (br === "abort" || br === "skip" || br === "back" || stopped) return;
      }
      sess.segmentLabel = seg.label;
      sess.sideLabel = seg.label;
      sess.currentSegment = i + 1;
      sess.currentSet = seg.set; sess.currentSide = seg.side; sess.currentDirection = seg.dir;
      sess.repInSegment = 0; sess.repsInSegment = seg.reps;
      setPhase("reps");
      if (seg.label && voiceOn()) await speakAndWait(seg.label.replace(/^\w/, c => c.toUpperCase()) + ".");
      for (let n = 1; n <= seg.reps; n++) {
        if (stopped) return;
        sess.repInSegment = n;
        if (await runOneRep(ex, p, n, isStopped) === "interrupt") return;
      }
      sess.segmentsDone += 1;
    }
    if (stopped) return;
    if (p.repsHigh) await offerExtraReps(p, isStopped);
    // Ran to the end under its own power.
    if (!stopped && sess.byRepsResolver) sess.byRepsResolver("complete");
  })();

  const result = await finished;
  stopped = true;
  await workLoop;
  sess.sideLabel = "";
  sess.segmentLabel = "";
  sess.currentSet = 0; sess.totalSets = 0;
  sess.currentSide = 0; sess.totalSides = 0;
  sess.currentDirection = 0; sess.totalDirections = 0;
  sess.repInSegment = 0; sess.repsInSegment = 0;
  sess.currentSegment = 0; sess.totalSegments = 0;
  return result;
}

/* ---- elapsed clock -------------------------------------------------------
   This used to be `sess.elapsed += 1` once per setInterval tick. Browsers
   throttle background timers hard — a phone that locks, or a tab she switches
   away from, fires that interval a fraction as often — so a real session came
   back recorded as a few minutes. The same counter drove `exElapsed`, which
   decides done/partial/skipped, so throttling could also mark work she actually
   did as skipped.

   Time is derived from wall-clock timestamps now. The interval only redraws;
   it is not the authority on anything. Paused spans are excluded, so reading
   the instructions or watching a demo never inflates the recorded duration. */
let elapsedInterval = null;

function syncClock(now = Date.now()) {
  if (!sess.clockAt) return;
  const delta = Math.max(0, now - sess.clockAt);
  sess.clockAt = now;
  if (!sess.running) return;
  if (sess.paused) {
    sess.pausedMs += delta;
  } else {
    sess.activeMs += delta;
    // The per-exercise clock only runs while she is actually working.
    if (sess.phase === "reps" || sess.phase === "work") sess.exMs += delta;
  }
  sess.elapsed = Math.round(sess.activeMs / 1000);
  sess.pausedSecs = Math.round(sess.pausedMs / 1000);
  sess.exElapsed = Math.round(sess.exMs / 1000);
}
/* Every reader of the clock calls this first, so a value is never stale by a
   whole tick — and never short by however long the tab was in the background. */
export function readClock() { syncClock(); return sess.elapsed; }
export function resetExerciseClock() { syncClock(); sess.exMs = 0; sess.exElapsed = 0; }

function startElapsed() {
  syncClock();
  sess.elapsed = 0; sess.pausedSecs = 0;
  sess.activeMs = 0; sess.pausedMs = 0; sess.exMs = 0;
  sess.clockAt = Date.now();
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    if (!sess.running) return;
    syncClock();
    notify("tick");
  }, 1000);
}
function stopElapsed() {
  syncClock();
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
}

/* ---- helpers ---- */
function setPhase(phase) {
  sess.phase = phase;
  // A pending "Skip this exercise?" ask belongs to the phase it was raised in.
  // Left standing, a countdown that expires mid-ask would point the confirm at
  // whatever came next — so every transition clears it.
  sess.confirmSkip = false;
  notify("phase");
}

/* Two Done taps this close together are one double tap, and the second half
   of it is not a decision about whatever phase the first half started. The old
   guard was a 1200 ms flag that self-cleared, which is the wrong shape: it let
   the second tap ride into a rest that had already begun and cut it short. */
export const DONE_GUARD_MS = 300;

/* "Dead Bug. 8 reps per side. Back flat, exhale on extend. Three, two, one,
   go." The dose used to be missing: she heard the name and a countdown and had
   to look at the screen to learn whether it was eight reps or thirty seconds —
   which is exactly the moment she is meant to be looking at her own body. */
function openingLine(ex, tail) {
  const dose = spokenDose(ex);
  return ex.name + "." + (dose ? " " + dose + "." : "") + (ex.reset ? " " + ex.reset : "") + " " + tail;
}

/* The move's announcement — "Dead Bug. Three, two, one, go." — spoken and
   waited for, but hers to cut short: a tap during it means "I know this one,
   go", and the clock starts at once. It used to be un-interruptible, so a tap
   during the three or four seconds of speech did nothing at all (reps) or
   expired before the countdown began (timed work). The clock is also charged
   only from the end of the announcement, not from the start of the phase: the
   speech was being counted as work she had done. */
async function announce(msg) {
  let cut = false;
  const skipped = new Promise(resolve => {
    sess.announceResolver = () => { cut = true; resolve(); };
  });
  // The screen repaints on phase changes, and an announcement is not one — so
  // the ring went on saying "Done" while a tap meant "go". Both edges are
  // announced, because the button's label is read off this resolver.
  notify("phase");
  await Promise.race([speakAndWait(msg), skipped]);
  sess.announceResolver = null;
  notify("phase");
  if (cut) cancelSpeech();
  // Whether she cut it short, so a caller can drop the beat that follows.
  return cut;
}

/* What comes after the step she is on — read off the step list, which is
   the one authority on the order (see buildSteps). */
function setUpNext(nextStep) {
  const nx = nextStep ? nextStep.ex : null;
  sess.upNextName = nx ? nx.name : "";
  sess.upNextDose = nx ? (nx.dose || "") : "";
}

/* ---- the completion ledger -------------------------------------------------
   Everything downstream — rounds trained, XP, skip analysis, the valgus gate,
   the parent reports — used to be inferred from "the loop reached the end".
   It reads from these rows instead: one per exercise per round, saying what
   was actually done. */
export const MIN_EXERCISE_SECS = 3;       // under this it wasn't done, it was tapped

/* How much of a timed dose has to be there before it counts as DONE.
   This was half, which meant a thirty-second hold abandoned at fifteen seconds
   was recorded as done and paid for a full round. Rep work has always demanded
   the whole prescribed rep count, so timed work was the lax half of the pair.
   The work under the bar is not lost — it is saved as `partial`, which is real
   work everywhere the outcome authority reads it. */
export const DONE_WORK_FRACTION = 0.8;

/* The timed rule on its own, pure and exported so the boundary can be checked
   directly instead of inferred from a whole simulated session. */
export function timedExerciseStatus(actualSecs, plannedSecs) {
  if (actualSecs < MIN_EXERCISE_SECS) return "skipped";
  return plannedSecs > 0 && actualSecs < plannedSecs * DONE_WORK_FRACTION ? "partial" : "done";
}

function exerciseStatus(ex, wasSkipped, actualSecs, plannedSecs) {
  if (wasSkipped) return "skipped";
  // Rep work is judged on REPS, timed work on TIME. Judging reps by the clock
  // marked a fully counted set as skipped whenever the voice ran fast.
  if (ex.byReps) {
    // An instant Done tap is not an exercise. Counting zero reps was never
    // enough on its own: tapping through fires after the FIRST rep is counted,
    // which used to land as `partial` — and partial is real work now, so the
    // tap-through would have paid. A set also has to have taken real time.
    if (!sess.repsCounted || actualSecs < MIN_EXERCISE_SECS) return "skipped";
    return sess.repsCounted >= sess.repsTarget ? "done" : "partial";
  }
  return timedExerciseStatus(actualSecs, plannedSecs);
}

function recordExercise(ex, circuit, ci, ei, r, wasSkipped) {
  const plannedSecs = ex.byReps ? 0 : exWork(ex);
  syncClock();
  const actualSecs = sess.exElapsed;
  const row = {
    name: ex.name,
    /* THE CIRCUIT THE RUNNER ACTUALLY RAN IT IN, not the block the move is
       authored under. Several prep moves are authored `block: "main"` (see
       prepMenu in js/data.js — they are main-block movements borrowed as
       movement prep), and `ex.block || circuit.block` let that authoring
       decide the LEDGER. Two consequences, both silent:

         · mainRoundReport filters on `block === "main"`, so every prep row
           landed inside main round one — inflating its row count and averaging
           prep's credit into a round prep is not part of. A short prep could
           fail a round she trained, and a good prep could launder a short one.

         · bankMove banks by `row.block` and deliberately never banks prep, so
           prep rows banked themselves into the main partial-round list — which
           is what a resume reads to decide a main round was interrupted.

       The circuit is what the plan asked for and what recordBlockDone,
       commitRoundIfDone and the round numbering all already use. */
    block: circuit.block,
    ci, ei, round: r,
    driver: ex.driver || (ex.byReps ? "reps" : "time"),
    dose: ex.dose || ex.repsDetail || "",
    gate: ex.gate || null,
    plannedSecs, actualSecs,
    repsPlanned: ex.byReps ? sess.repsTarget : 0,
    repsCounted: ex.byReps ? sess.repsCounted : 0,
    segmentsPlanned: ex.byReps ? sess.segmentsPlanned : (ex.eachSide ? 2 : 1),
    segmentsDone: ex.byReps ? sess.segmentsDone : 0,
    status: exerciseStatus(ex, wasSkipped, actualSecs, plannedSecs),
    at: Date.now()
  };
  sess.ledger.push(row);
  sess.repsCounted = 0; sess.repsTarget = 0; sess.repNow = 0;
  sess.segmentsDone = 0; sess.segmentsPlanned = 0;
  return row;
}

/* COMMIT A MAIN ROUND THE MOMENT ITS LAST ROW LANDS.

   This used to run only at the bottom of the round loop in runSession — after
   the intent-word prompt, after the round-rest speech, after the rest countdown.
   Every one of those awaits can abort, and each abort path returns straight into
   finalize(), so a round she had already finished was thrown away because she
   stopped during the breather that followed it. That is a round of real work
   deleted by the app's own bookkeeping order, and with `roundsDone` feeding both
   the finish screen and the XP price, it was deleted from what she was paid too.

   So the round is committed here, off the LEDGER, as soon as the ledger can
   prove it — before any prompt, any speech and any rest. Nothing between the
   last rep and the next round can cost her the one she just did.

   Idempotent: the caller at the bottom of the loop is kept as a safety net for
   the ragged-round shapes (a move capped by `ex.rounds` means the last exercise
   of a round is not always the last INDEX of the circuit), so this may be called
   twice for the same round and must count it once.

   The rule itself is mainRoundReport's, in js/outcome.js — the one authority —
   so the number the engine banks live and the number the saved record reports
   cannot drift apart. That drift is exactly what min() used to paper over. */
function commitRoundIfDone(ci, round) {
  if (sess.roundsCounted[ci + ":" + round]) return;
  const rows = sess.ledger.filter(l => l.ci === ci && l.round === round);
  if (!rows.length) return;
  const r = mainRoundReport(rows, sess.expectedByRound, OUTCOME_VERSION)
    .find(x => x.round === round);
  if (!r || !r.counts) return;
  sess.roundsCounted[ci + ":" + round] = true;
  sess.roundsCompleted += 1;
  bankMainRounds();
}

/* Why a round did NOT count, said out loud into the event log at the moment it
   closes. A "0 of 3" with no reason attached is what sent a parent hunting
   through an exported ledger; the app knows the answer and can simply say it. */
function logRoundShort(ci, round) {
  if (sess.roundsCounted[ci + ":" + round]) return;
  const rows = sess.ledger.filter(l => l.ci === ci && l.round === round);
  if (!rows.length) return;
  const r = mainRoundReport(rows, sess.expectedByRound, OUTCOME_VERSION)
    .find(x => x.round === round);
  if (!r || r.counts) return;
  logEvent("round_short", {
    round, ratio: Math.round(r.ratio * 100) / 100, missing: r.missing,
    skipped: r.skipped, blockedBy: r.blockedBy ? r.blockedBy.name : null
  });
}
/* A block counts as TRAINED if at least one move in it was really done. This is
   the display counter's question ("how many blocks did she get into today") and
   nothing else may use it to decide a block is FINISHED — see blockFullyDone. */
function blockHadWork(ci) {
  return sess.ledger.some(l => l.ci === ci && l.status === "done");
}

/* A block is FINISHED when every row it was supposed to produce is there and
   every one of them is done.

   "At least one move was done" used to be the whole test, and recordBlockDone
   then put the block on the day's done list and DELETED its move-by-move
   record. So skipping one warm-up move retired the entire warm-up: come back
   later and the whole block was skipped as already finished, the skipped move
   included. The one move she owed was the one move she could never be given
   again.

   Counted against the circuit's own plan rather than the rows that happen to
   exist, for the same reason countExpectedByRound exists: a block abandoned
   three moves in leaves the rest simply missing, and "every row I can see is
   done" is trivially true of three rows out of eight.

   Main is not asked this question. Its size is set by the light, so its
   progress is a count of rounds — see bankMainRounds. */
function blockFullyDone(ci) {
  const c = sess.circuits[ci];
  if (!c) return false;
  const expected = countExpectedWork([c]);
  const rows = sess.ledger.filter(l => l.ci === ci);
  if (rows.length < expected) return false;
  return rows.every(l => l.status === "done");
}

/* Aggregate the ledger to the per-move shape the reports already read. A move
   is `skipped` only if it was skipped EVERY round it came up. */
export function perExerciseFromLedger(ledger) {
  const byName = new Map();
  (ledger || []).forEach(l => {
    const cur = byName.get(l.name);
    if (!cur) {
      byName.set(l.name, {
        name: l.name, block: l.block, driver: l.driver, dose: l.dose, gate: l.gate,
        rounds: 1, done: l.status === "done" ? 1 : 0,
        partial: l.status === "partial" ? 1 : 0,
        skippedRounds: l.status === "skipped" ? 1 : 0,
        skipped: l.status === "skipped"
      });
      return;
    }
    cur.rounds += 1;
    if (l.status === "done") cur.done += 1;
    else if (l.status === "partial") cur.partial += 1;
    else cur.skippedRounds += 1;
    cur.skipped = cur.skippedRounds === cur.rounds;
  });
  return [...byName.values()];
}

/* Recovery and Spa are CARE, not training, and they share the weekday's key.
   A Monday Recovery therefore used to read, rewrite and finally CLEAR the very
   same `monday|<date>` day-progress record a half-finished Monday workout had
   left behind: it pushed a "recovery" block into her done list, stamped
   `light: "recovery"` over the green she had actually trained under, and then
   the end-of-run clearDayProgress threw the finished warm-up away. Reporting
   soreness honestly cost her the work she had already done.

   Day progress belongs to the TRAINING day. A care session must not read it,
   write it, or clear it — which also means an interrupted Recovery simply
   starts again from the top of the recovery menu, and that is fine: it is a
   short pass, and inventing a second progress namespace would be a second
   thing to get wrong. */
function isCareSession(s = sess) { return !!(s.recovery || s.spa); }

/* Nothing may touch the training day's progress record from a run that is not
   the training day: a try-it run is a rehearsal, and care is not the day at all
   (see isCareSession above). Both guards used to live only in recordBlockDone;
   they are shared now that rounds are banked from inside the round loop too. */
function ownsDayProgress() {
  return !sess.explore && !isCareSession();
}

/* A workout's identity. Random rather than derived from the date, because two
   devices offline on the same day must not mint the SAME id for two different
   workouts — that is the mirror image of the bug this closes, and it would
   silently merge work that never belonged together. */
export function newWorkoutInstanceId() {
  return "w-" + Date.now().toString(36) + "-" +
         Math.random().toString(36).slice(2, 10);
}

function readDayProgress() {
  const prog = loadDayProgress(sess.dayKey)
    || { done: [], light: sess.light, mainRoundsCompleted: 0 };
  // All three added after the record already existed on devices, so they are
  // filled in on read rather than migrated.
  if (!prog.moves) prog.moves = {};
  if (!prog.partials) prog.partials = {};   // moves she tapped Done on early
  if (!Number.isFinite(Number(prog.bankedCredit))) prog.bankedCredit = 0;
  // Every write goes through here, so this is the one place the id has to be
  // stamped for a resume to be able to read it back.
  if (sess.workoutInstanceId) prog.workoutInstanceId = sess.workoutInstanceId;
  if (sess.dayIso) prog.dayIso = sess.dayIso;
  /* And the light this workout is being trained under, so the resume cannot
     quietly run it under a bigger one. Written once and then only ever lowered:
     startSession has already resolved a later, worse check into sess.light, so
     taking the lower of the two here is the same decision recorded rather than
     a second one. */
  prog.lockedLight = prog.lockedLight
    ? lowerLight(prog.lockedLight, sess.light) : sess.light;
  return prog;
}

/* A FINISHED MOVE IS FINISHED, AND IS NEVER ASKED FOR TWICE.

   Rounds were banked as they landed (see bankMainRounds below), but everything
   else was banked only when its whole BLOCK finished — which is past the early
   return an interrupted session takes. Stop four moves into an eight-move
   warm-up and all four came back on the next attempt.

   Moves are recorded by NAME, not by position: the same block assembles
   differently depending on the valgus gate and on whether the day is a double
   double day (see assembleCircuits), so an index would come back pointing at a
   different move.

   Only a `done` row banks. A `partial` row is real work everywhere else in the
   app and is paid for as work — but it is not a finished move, and banking it
   would mean the move never actually gets done. It is offered again, and earns
   its credit again, so nothing is paid for twice.

   `bankedCredit` counts the rows banked today. Every banked row is `done`, and a
   done row is worth exactly 1 to the streak (see streakCredit in js/outcome.js),
   so the count IS the credit — which is what lets a second sitting be judged
   against the whole day instead of against its own leftovers. */
function bankMove(row) {
  if (!ownsDayProgress()) return;
  if (!row) return;
  /* A RECORD EXISTS THE MOMENT SHE ATTEMPTS A MOVE, not the moment she finishes
     one. This returned here unless the row was `done`, so an evening where she
     went through the whole workout a beat short of every clock — every row
     `partial`, which is real work that saves and pays — wrote NO day-progress
     record at all. The day then had nothing to resume from, and the card, which
     was reading that record, had nothing to say about a workout she had just
     spent half an hour on. The locked light, the workout id, the day the bout
     began and the rounds behind her all went with it.

     A partial move is still NOT banked: it is not finished, it is offered
     again, and it earns its credit again — the rule below is unchanged. What
     changes is that attempting it is enough to open the record. */
  if (row.status !== "done" && row.status !== "partial") return;
  const block = row.block;
  /* PREP IS THE ONE BLOCK DELIBERATELY NOT BANKED, and not because it is
     unimportant — it is the movement prep that runs immediately before main.
     Banking it would send a resumed session straight into main rounds cold,
     which is the opposite of what it is for. So it is re-run in full every
     sitting and earns its credit fresh each time.

     The day's ask counts prep once, so two sittings can between them produce a
     little more credit than the day asked for. That only ever rounds in her
     favour on a day she actually trained twice, and the ratio is compared, not
     displayed, so nothing reads as over 100%. */
  if (!block || block === "prep") return;
  const prog = readDayProgress();
  if (row.status === "done") {
    const list = prog.moves[block] || (prog.moves[block] = []);
    // A resume must not re-bank a name, or pay for it twice. The light write
    // below still has to happen, so this no longer returns out of the function.
    if (!list.includes(row.name)) {
      list.push(row.name);
      prog.bankedCredit = Number(prog.bankedCredit) + 1;
      // Finishing it properly retires the "cut short" mark.
      if (prog.partials[block]) {
        prog.partials[block] = prog.partials[block].filter(n => n !== row.name);
      }
    }
  }
  /* A MOVE SHE TAPPED DONE ON IS A MOVE SHE HAS BEEN THROUGH.

     "Finish remaining moves" used to hand back the whole workout from move one
     to a kid who had walked the entire warm-up a beat early: every row landed
     `partial`, nothing banked, and the resume could not tell that evening from
     one where she had never started at all.

     A partial is remembered by NAME now, in its own list, so the resume does
     not ask for it again and the session list can show it amber — "you cut
     this one short" is a different thing to say than "you finished it" or "you
     never got to it", and the pill beside each move is how she finds where she
     is picking up.

     Its own list, and not `moves`, because the two answer different questions:
     `moves` is what has been FINISHED and is what `bankedCredit`, the streak
     and the XP are priced off, and none of those may move because of this.
     Only what the next sitting is OFFERED changes — and she can ask for them
     back from the day card (see redoPartials in planResume).

     Main is the exception: its unit is the round, not the move (see
     bankMainRounds and mainRoundReport), so a round that fell short is re-run
     whole and its moves are never marked here. */
  else if (row.status === "partial" && block !== "main"
           && !(prog.moves[block] || []).includes(row.name)) {
    const cut = prog.partials[block] || (prog.partials[block] = []);
    if (!cut.includes(row.name)) cut.push(row.name);
  }
  prog.light = sess.light;
  saveDayProgress(sess.dayKey, prog);
}

/* The mirror of bankMove, for "back a move". A row the ledger no longer holds
   must not stay banked on disk, or the resume would hand her a move she then
   chose to redo — and, if she skips it the second time, never ask for it again.
   Only a banked name comes off, and the credit that went on with it. */
function unbankMove(row) {
  if (!ownsDayProgress()) return;
  if (!row) return;
  const block = row.block;
  if (!block || block === "prep") return;
  const prog = readDayProgress();
  const list = prog.moves[block] || [];
  const cut = prog.partials[block] || [];
  // A partial is remembered too now (see bankMove), so backing over one has to
  // forget it as well — or the resume would never ask for a move she went back
  // to redo, and a skip the second time would retire it for good.
  const wasDone = list.includes(row.name);
  const wasCut = cut.includes(row.name);
  if (!wasDone && !wasCut) return;
  if (wasDone) {
    prog.moves[block] = list.filter(n => n !== row.name);
    prog.bankedCredit = Math.max(0, Number(prog.bankedCredit) - 1);
  }
  if (wasCut) prog.partials[block] = cut.filter(n => n !== row.name);
  saveDayProgress(sess.dayKey, prog);
}

/* MAIN is the one block whose SIZE depends on the light, so "done" is not a
   yes-or-no about the block — it is a count of rounds. Storing the bare name
   meant a Red day's single round retired Main outright: come back under Green
   and the block holding Green's three rounds was skipped as already finished,
   leaving a session with no main set in it at all. So the rounds are banked, and
   the name is written only once the light's own count has actually been met.

   The banking used to happen once, at the END of the main block — which is past
   every early return in the runner. Stop a green session after a clean round one
   and the record said `mainRoundsCompleted: 0`, so coming back made her do that
   round again. A finished round is finished the moment it finishes; it is written
   then, and `roundsBanked` remembers how much of `roundsCompleted` is already on
   disk so a later flush can never pay for the same round twice. */
function bankMainRounds() {
  if (!ownsDayProgress()) return;
  const gained = (sess.roundsCompleted || 0) - (sess.roundsBanked || 0);
  if (gained <= 0) return;
  const prog = readDayProgress();
  prog.mainRoundsCompleted = (Number(prog.mainRoundsCompleted) || 0) + gained;
  /* The round's moves are covered by the round count now. Leaving them on the
     list would drop them from the NEXT round too — a banked name is a name the
     resume does not ask for, and a finished round does not excuse round three. */
  prog.moves.main = [];
  prog.partials.main = [];
  prog.light = sess.light;
  sess.roundsBanked = sess.roundsCompleted;
  saveDayProgress(sess.dayKey, prog);
}

function recordBlockDone(blockKey, ci) {
  if (!blockKey || blockKey === "prep") return;
  if (!ownsDayProgress()) return;
  // Not "some work happened" — every row the block asked for, done. A block with
  // one move outstanding stays off the done list, and keeps its per-move record
  // so the resume asks for exactly that move and nothing else.
  if (blockKey !== "main" && !blockFullyDone(ci)) return;
  if (!blockHadWork(ci)) return;   // skipping everything doesn't finish a block
  if (blockKey === "main") {
    bankMainRounds();              // flushes whatever the round loop has not
    const banked = readDayProgress();
    if ((Number(banked.mainRoundsCompleted) || 0) < roundsForLight(sess.light)) {
      banked.light = sess.light;
      saveDayProgress(sess.dayKey, banked);
      return;
    }
  }
  const prog = readDayProgress();
  if (!prog.done.includes(blockKey)) prog.done.push(blockKey);
  // The block is on the done list now, so its move-by-move record is redundant.
  delete prog.moves[blockKey];
  prog.light = sess.light;
  saveDayProgress(sess.dayKey, prog);
}

/* ---- intent word / micro-loop prompts (UI resolves via resolvers) ---- */
/* The clean/wobbly self-check used to be set as a flag and then abandoned: the
   engine dropped straight into the rest countdown without waiting, so the
   question appeared over a clock that was already running out, a later spot-check
   move could overwrite the one she was still looking at, and a check on the very
   LAST exercise never appeared at all — there is no rest after it.

   It is an explicit phase now. Rest does not begin until she has answered or
   skipped. Skipping records no verdict, so it can never become valgus credit. */
function formCheckPrompt(moveName, kind = "form") {
  return new Promise(resolve => {
    sess.cleanCheckMove = moveName;
    sess.checkKind = kind;
    sess.pendingCleanCheck = true;
    setPhase("formcheck");
    speakIfIdle(kind === "landing"
      ? "Landing check. Clean and frozen, or a bit wobbly?"
      : "How did that feel — clean, or wobbly?");
    const finish = (result) => {
      clearInterval(watchdog); clearTimeout(timeout);
      sess.formResolver = null;
      sess.pendingCleanCheck = false;
      sess.checkKind = null;
      resolve(result);
    };
    const watchdog = setInterval(() => { if (sess.abort) finish("abort"); }, 200);
    // A walked-away session must not hang here forever. Timing out is a SKIP:
    // no verdict is recorded, so an unanswered check never becomes credit.
    const timeout = setTimeout(() => { sess.cleanCheckMove = null; finish("done"); }, FORM_CHECK_TIMEOUT_MS);
    sess.formResolver = (verdict) => {
      if (verdict === null) sess.cleanCheckMove = null;   // skipped: no verdict
      else recordFormCheck(verdict);
      finish(sess.abort ? "abort" : "done");
    };
  });
}
export const FORM_CHECK_TIMEOUT_MS = 30000;

function intentWordPrompt() {
  return new Promise(resolve => {
    setPhase("intent");
    speakIfIdle("After round one — pick one word to fix what you felt. Say it out loud.");
    const watchdog = setInterval(() => {
      if (sess.abort) { clearInterval(watchdog); clearTimeout(timeout); sess.intentResolver = null; resolve("abort"); }
    }, 200);
    const timeout = setTimeout(() => { clearInterval(watchdog); sess.intentResolver = null; resolve("done"); }, 20000);
    // resolver(null) = dismissed (Done button / session end) — no word recorded
    sess.intentResolver = (word) => {
      clearInterval(watchdog); clearTimeout(timeout);
      sess.intentResolver = null;
      if (!word) { resolve(sess.abort ? "abort" : "done"); return; }
      sess.intentWord = word;
      speakIfIdle(word + "! Carry it into the next rounds.");
      setTimeout(() => resolve("done"), 700);
    };
  });
}

function microLoopPrompt() {
  return new Promise(resolve => {
    setPhase("microloop");
    speakIfIdle(MICRO_LOOP.q);
    const watchdog = setInterval(() => {
      if (sess.abort) { clearInterval(watchdog); clearTimeout(timeout); sess.microResolver = null; resolve(); }
    }, 200);
    const timeout = setTimeout(() => { clearInterval(watchdog); sess.microResolver = null; resolve(); }, 15000);
    sess.microResolver = (answer) => {
      clearInterval(watchdog); clearTimeout(timeout);
      sess.microResolver = null;
      if (answer == null) { resolve(); return; }   // dismissed without answering
      const ok = answer === MICRO_LOOP.a;
      sess.microLoop = { answer, correct: ok };
      speakIfIdle(ok ? "Yes — the hips!" : "It's the hips.");
      notify("phase");
      setTimeout(resolve, 900);
    };
  });
}

/* ---- the step list ---------------------------------------------------------
   The workout as ONE ORDERED LIST of exercise-rounds, in exactly the order the
   old ci → r → ei loops walked it and with the same `ex.rounds` cap. The runner
   walks this list by index, which is what makes "back a move" a plain
   decrement, and it is what lets the ledger be read positionally: every step
   that is reached records exactly one row, so `sess.ledger[i]` is `steps[i]`
   and rewinding is a truncation. */
export function buildSteps(circuits) {
  const steps = [];
  (circuits || []).forEach((circuit, ci) => {
    for (let r = 1; r <= circuit.rounds; r++) {
      circuit.exercises.forEach((ex, ei) => {
        if (ex.rounds && r > ex.rounds) return;
        steps.push({ s: steps.length, ci, r, ei, ex, circuit, absRound: roundNumber(circuit, r) });
      });
    }
  });
  return steps;
}

/* WHAT A DAY STILL OWES, as circuits — the one answer the runner and the Today
   card both have to give. Until this existed the card counted five fixed blocks
   and offered "Finish remaining moves" for blocks a Red day never asked for,
   and the runner, asked to start that, assembled nothing and went quiet.

   Resolves the light exactly as a start does: a spa day is recovery, a locked
   light on the day's progress record can only ever LOWER the one asked for
   (see startSession), and a care session reads no progress at all. */
/* ============================================================
   WHAT THE DAY HAS ACTUALLY DONE, ASKED OF THE TRAINING LOG

   THE STORES, AND WHICH ONE ANSWERS WHAT.

   There are two, they are both right, and reading them as if they were
   interchangeable is the single defect behind almost everything this change
   repairs.

     · The TRAINING LOG (js/store.js, `sessions_v2`) is permanent, mirrored to
       the cloud, and in every backup. It is merged across every sitting of a
       day. It is what XP, the streak, the week strip and every report are
       derived from. It cannot know about a sitting that is still running,
       because a row is only written at finalize().

     · The DAY-PROGRESS record (LS_DAYPROG) is local, never mirrored, expires at
       midnight and is deleted when the day completes. It is written LIVE, move
       by move. Its one irreplaceable job is crash safety: if the tablet sleeps
       in the middle of round two, the log holds nothing and this holds
       everything up to the last finished move.

   The Today card was reading the SECOND one to tell a child what she had done.
   So "+360 XP earned" (from the log, which had merged both her sittings and
   could prove three main rounds) sat directly above "Still open: Warm-up,
   Coordination, Main Circuit, Skate-Skill" (from a record that had expired, or
   had never been written because nothing she did that evening cleared the
   `done` floor). Two true sentences from two different sources, printed side by
   side, contradicting each other on the one screen she reads.

   So: THE LOG IS THE REPORTING AUTHORITY. The day-progress record may only ever
   subtract work from the next plan — never put a claim on a screen. This
   function is the log's answer, and planResume below now starts from it.

   Only TODAY's fragments count, which is the No-Debt rule stated directly
   rather than borrowed from a cache's expiry: a partial never carries into a
   new day. Dated by workoutDate, so a bout that crossed midnight belongs to the
   day it began — the same key the XP budget uses. */
export function dayFragmentsFromLog(dayKey, isoDate = null) {
  const iso = isoDate || todayISODate();
  return loadSessions().filter(s => s && !s.practice && s.dayKey === dayKey
    && s.sessionType !== "recovery" && s.sessionType !== "spa"
    && workoutDate([s]) === iso);
}

/* The light the day is LOCKED to, recovered from the log rather than trusted
   from the local cache. `lockedLight` was only ever "the lowest light any
   sitting ran under", and every sitting saves its own `lightResult`, so the
   fact was always in the log — it simply had nowhere to be read from. */
export function lockedLightFromLog(frags) {
  return (frags || []).reduce((lo, s) => {
    const l = s.lightResult || s.light || null;
    if (!l) return lo;
    return lo ? lowerLight(lo, l) : l;
  }, null);
}

/* And the day's round cap after a tier drop, likewise: `dayRoundsPlanned` is
   saved on every row (see finalize), and the cap is the smallest one the day
   ever declared. */
export function roundsCapFromLog(frags) {
  let cap = Infinity;
  (frags || []).forEach(s => {
    const n = Number(s && s.dayRoundsPlanned);
    if (Number.isFinite(n) && n > 0) cap = Math.min(cap, n);
  });
  return cap;
}

/* THE ONE READING every screen asks for: the day's plan, and what the merged
   ledger can prove about it, side by side.

   `planned` counts PERFORMANCES — a main move in round two is a different unit
   of work from the same move in round one, which is exactly how expectedWork
   and the streak already count. `movements` counts DISTINCT movements, once
   each however many rounds they run, which is what the day card has always
   shown a kid. Both are returned, named for what they are, because the card
   used to print one of them beside a minute total computed from the other. */
export function dayPlanState(dayKey, opts = {}) {
  const frags = opts.fragments || dayFragmentsFromLog(dayKey, opts.isoDate || null);
  const day = DAYS[dayKey] || {};
  const fallbackLight = day.spa ? "recovery" : (day.defaultLight || "green");
  /* The light the day was actually TRAINED under, not the weekday's default.
     planStats has always priced every card as green, so a Red day — a third the
     size — was shown the green plan's minutes and move count and then told it
     had skipped the difference. */
  const light = lockedLightFromLog(frags) || fallbackLight;
  const cap = roundsCapFromLog(frags);
  const rounds = Math.min(roundsForLight(light), cap);
  const circuits = assembleCircuits(dayKey, light,
    Number.isFinite(rounds) && rounds < roundsForLight(light) ? { mainRounds: rounds } : {});

  const rows = mergeLedgerRows(frags.reduce((a, s) => a.concat(s.ledger || []), []));
  const byId = new Map();
  rows.forEach(r => byId.set(logicalRowId(r), r));

  const blocks = [];
  const owed = [];
  let planned = 0, done = 0, performed = 0;
  const seen = new Set(), didMove = new Set(), touched = new Set();
  circuits.forEach(c => {
    const base = Number.isFinite(Number(c.roundBase)) ? Number(c.roundBase) : 1;
    let bPlanned = 0, bDone = 0, bPerformed = 0, bSkipped = 0, bSecs = 0;
    for (let r = 1; r <= c.rounds; r++) {
      c.exercises.forEach(ex => {
        if (ex.rounds && r > ex.rounds) return;
        const round = base + r - 1;
        const id = logicalRowId({ block: c.block, round, name: ex.name });
        const row = byId.get(id);
        planned++; bPlanned++; bSecs += refTime(ex);
        seen.add(ex.name);
        /* PERFORMED is not the same question as DONE, and the card needs both.
           `done` is the engine's verdict against its 80% floor and is what the
           resume and the round rule turn on. `performed` is simply "she was
           there for it" — which is the unit the streak now rewards, and the
           only honest thing to put beside a Skipped count. Without it a day
           where every move came in a beat short read "0 of 28 movements" next
           to a flame it had genuinely earned. */
        if (row && row.status !== "skipped") { performed++; bPerformed++; touched.add(ex.name); }
        if (row && row.status === "done") { done++; bDone++; didMove.add(ex.name); }
        else {
          if (row && row.status === "skipped") bSkipped++;
          owed.push({ block: c.block, circuit: c.name, round, name: ex.name, ex });
        }
      });
    }
    blocks.push({
      block: c.block, name: c.name, rounds: c.rounds,
      perRound: c.exercises.length,
      planned: bPlanned, done: bDone, performed: bPerformed, skipped: bSkipped,
      mins: Math.max(1, Math.round(bSecs / 60))
    });
  });

  return {
    light, circuits, blocks, owed, rows,
    planned, done, performed,
    movements: seen.size,
    movementsDone: didMove.size,
    movementsPerformed: touched.size,
    pace: paceReport(rows),
    hasRecord: frags.length > 0,
    fragments: frags
  };
}

export function planResume(dayKey, light = "green", opts = {}) {
  /* `redoPartials` is her own answer to the moves she cut short. They are not
     offered again by default (see bankMove), and the day card says so with a
     button that turns this on — so "not asked for again" is never the app
     deciding she is finished with a move she knows she rushed. */
  const redoPartials = !!opts.redoPartials;
  const day = DAYS[dayKey] || {};
  const resolvedLight = day.spa ? "recovery" : light;
  const care = !!day.spa || resolvedLight === "recovery";
  const prog = care ? null : loadDayProgress(dayKey);
  /* THE LOG FIRST, THE RECORD AS A SUPPLEMENT.

     This used to read the day-progress record and nothing else, so everything
     the record could not see was offered to her again: a day whose work was
     already saved but whose record had expired, been cleared on completion, or
     never been written at all (bankMove banks only `done` rows) came back as
     the WHOLE workout, from move one, under a button that said "Finish
     remaining moves".

     So what the day owes starts from the training log, which is permanent and
     merged across every sitting. The record is still read, and still matters —
     it is the only thing that knows about a sitting that never reached
     finalize(), which is what a crash mid-round leaves behind. But it can only
     ever SUBTRACT work from the plan, never add a claim: every value below
     takes whichever source proves MORE work done, so neither can lose what the
     other saw. See dayPlanState above for why the two stores exist at all. */
  const logFrags = care ? [] : dayFragmentsFromLog(dayKey);
  const logRows = mergeLedgerRows(logFrags.reduce((a, r) => a.concat(r.ledger || []), []));
  const logDone = logRows.filter(r => r && r.status === "done");
  /* What the next sitting does not ask for: every move she finished, plus —
     unless she asked for them back — the ones she tapped Done on early. Main is
     never in the second set: its unit is the round, not the move, so a short
     round is re-run whole (see bankMove, and mainRoundReport in js/outcome.js
     for what makes a round count). `logDone` stays the `done`-only set, because
     the main-round arithmetic below is priced off finished work alone. */
  const logBankable = redoPartials ? logDone : logRows.filter(r => r &&
    (r.status === "done" || (r.status === "partial" && r.block !== "main")));
  const logRounds = care ? 0 : mainRoundsFromLedger(logRows, null, OUTCOME_VERSION);

  const lockedLight = lowerOrNull(prog && prog.lockedLight, lockedLightFromLog(logFrags));
  const finalLight = lockedLight ? lowerLight(lockedLight, resolvedLight) : resolvedLight;

  const bankedRounds = Math.max((prog && Number(prog.mainRoundsCompleted)) || 0, logRounds || 0);

  /* Moves finished today, by block, from both sources. The log's are keyed on
     the block the runner actually ran them in (see recordExercise), which is
     the same key bankMove writes, so the two sets are directly unionable. */
  const bankedMoves = {};
  Object.entries((prog && prog.moves) || {}).forEach(([b, list]) => {
    bankedMoves[b] = [...(list || [])];
  });
  if (!redoPartials) {
    Object.entries((prog && prog.partials) || {}).forEach(([b, list]) => {
      if (b === "main") return;
      const into = bankedMoves[b] || (bankedMoves[b] = []);
      (list || []).forEach(n => { if (!into.includes(n)) into.push(n); });
    });
  }
  logBankable.forEach(r => {
    const b = r.block;
    if (!b || b === "prep") return;          // prep is re-run every sitting, by design
    // A main move only counts as banked once its whole round is behind us;
    // `mainPartialRound` below handles the round still in progress.
    if (b === "main" && Number(r.round) <= bankedRounds) return;
    if (!bankedMoves[b]) bankedMoves[b] = [];
    if (!bankedMoves[b].includes(r.name)) bankedMoves[b].push(r.name);
  });

  /* Blocks fully retired: the record's list, plus any block the log can prove
     every planned instance of. Computed against the day's own ask under the
     final light, never against the weekday's default. */
  const skipBlocks = [...((prog && prog.done) || [])];
  if (!care) {
    const st = dayPlanState(dayKey, { fragments: logFrags });
    st.blocks.forEach(b => {
      if (b.block === "prep" || b.block === "main") return;
      if (b.planned > 0 && b.done >= b.planned && !skipBlocks.includes(b.block)) skipBlocks.push(b.block);
    });
  }

  // A tier-drop earlier today lowered what the day asks for; like the locked
  // light, the cap is only ever written downward.
  const roundsCap = Math.min(
    prog && Number.isFinite(Number(prog.roundsCap)) ? Number(prog.roundsCap) : Infinity,
    roundsCapFromLog(logFrags));
  const mainOwed = care ? 0 : Math.max(0, Math.min(roundsForLight(finalLight), roundsCap) - bankedRounds);
  const circuits = care
    ? assembleCircuits(dayKey, finalLight, { skip: [] })
    : assembleCircuits(dayKey, finalLight, {
        skip: skipBlocks.filter(b => !(b === "main" && mainOwed > 0)),
        mainRounds: mainOwed,
        skipMoves: bankedMoves,
        mainPartialRound: bankedMoves.main || [],
        // Rounds already on disk, so this sitting's rows are numbered as rounds
        // OF THE DAY and cannot collide with the earlier sitting's.
        roundOffset: bankedRounds
      });
  /* The log rows go back with the plan because the session screen needs them:
     the list shows the WHOLE day with her history on it, and these are where
     the colour beside each move comes from. See startSession. */
  return { circuits, prog, logRows, light: finalLight, care, mainOwed,
           bankedRounds, bankedMoves, roundsCap };
}

/* ---- back a move -----------------------------------------------------------
   Where "◀ Back" would take her from the phase she is in. During a move it is
   the move before; during the breather after one, it is that move again. There
   is no target during the lead-in or a prompt. */
function backTarget() {
  if (!sess.running) return null;
  if (sess.explore) return sess.stepIdx > 0 ? sess.stepIdx - 1 : null;
  const ph = sess.phase;
  if (ph === "work" || ph === "reps" || ph === "sideswitch") return sess.stepIdx - 1;
  if (ph === "rest" || ph === "roundRest" || ph === "sectionRest" || ph === "formcheck") return sess.stepIdx;
  return null;
}

/* Back is offered only where it can be honoured IN MEMORY. A committed main
   round has been written to the day's progress record, and a finished block
   has retired its move list from that record; undoing either means rewriting
   what a resume reads, which is the kind of bookkeeping this app has been
   burned by before. So a round that counted, or a block that closed, is behind
   her for good — and the button says so by not being there. */
export function canGoBack() {
  const t = backTarget();
  if (t == null || t < 0) return false;
  if (sess.explore) return true;
  const st = sess.steps && sess.steps[t];
  if (!st) return false;
  if (st.ci !== sess.ci) return false;
  if (sess.roundsCounted[st.ci + ":" + st.absRound]) return false;
  return true;
}

/* Undo everything from step `target` on, so the loop can walk it again.
   Every reached step wrote exactly one ledger row, in order, so the rows to
   drop are the tail. Skips are tagged with the step they happened on. */
function rewindTo(target) {
  const dropped = sess.ledger.slice(target);
  sess.ledger.length = Math.min(sess.ledger.length, target);
  dropped.forEach(unbankMove);
  sess.exDone = sess.ledger.length;
  sess.skipped = (sess.skipped || []).filter(e => !(Number.isFinite(e.step) && e.step >= target));
  // Replay the per-key status from the rows that remain.
  sess.exStatus = {};
  sess.ledger.forEach(row => {
    const c = sess.circuits[row.ci] || {};
    const key = row.ci + "-" + row.ei;
    const r = row.round - (Number.isFinite(Number(c.roundBase)) ? Number(c.roundBase) : 1) + 1;
    sess.exStatus[key] = row.status === "skipped" ? "skipped"
      : r === c.rounds ? row.status : sess.exStatus[key];
  });
  sess.backTo = null;
  sess.skipExercise = false; sess.justSkipped = false; sess.forceDone = false;
  sess.confirmSkip = false; sess.sideLabel = "";
  return target;
}
const wentBack = () => sess.backTo != null;

/* ============================================================
   MAIN RUNNER
   ============================================================ */
export async function startSession({ dayKey, light = "green", mode = null, suggestedLight = null, readiness = null, redoPartials = false }) {
  if (sess.running) return;
  const day = DAYS[dayKey];
  if (!day) return;
  // Explore: the same screen, nothing counting down, nothing saved. Its own
  // small runner, so not one branch of the real one has to know about it.
  if (mode === "explore") return runExplore(dayKey);
  ensureAudio();

  // Recovery is an explicit MODE, not a light with zero rounds — the whole
  // point of the check is that a sore day gets recovery rather than a shortened
  // workout, because "a shortened workout" is still a workout.
  const resolvedLight = day.spa ? "recovery" : light;
  // Sunday is recovery because the CALENDAR says so, not because anyone
  // overrode the check — so there is no override to record on a spa day.
  const resolvedSuggestion = day.spa ? "recovery" : (suggestedLight || resolvedLight);
  const isRecovery = resolvedLight === "recovery";
  const sessionMode = isRecovery ? "recovery" : (mode || "normal");
  /* THE LIGHT A WORKOUT STARTS UNDER IS THE LIGHT IT FINISHES UNDER.

     The day's progress record has carried the light all along and nothing read
     it back, so a resume simply took whatever the newest check said. A Red
     workout picked up in the evening under Green grew from one main round to
     three, and with it the completion denominator, the streak bar and the XP
     ceiling of a day that was already part-trained — the plan moving underneath
     her, mid-workout, with no one saying so.

     A later check may still LOWER it: if her body has more to say between two
     sittings, that is the whole point of the traffic light and shortening the
     rest of the day is always allowed. Raising it is not, because a bigger plan
     is a different workout — start one, deliberately, and it gets its own
     identity and its own denominator.

     Care never reads or locks anything: a recovery pass is not the training
     day's work, which is the same reason it never touches its progress record.
     Only a locked light already on disk can hold: a first sitting has nothing
     to lock, so nothing about a single-sitting day moves.

     All of that — and the same-day resume that skips what is already banked —
     is planResume's, so the Today card can ask the identical question. */
  const plan = planResume(dayKey, resolvedLight, { redoPartials });
  const prog = plan.prog;
  Object.assign(sess, blankSession(), {
    running: true, dayKey, mode: sessionMode,
    practice: false,
    light: plan.light,
    // What the readiness check produced, before any grown-up moved it. Kept so
    // readiness analytics can read the body's answer and executed-load
    // analytics can read what was actually trained.
    suggestedLight: resolvedSuggestion,
    recovery: isRecovery,
    spa: !!day.spa,
    /* The body check behind this session, carried onto the record so the zones
       she marked travel with the training log instead of being overwritten by
       tomorrow's check. Only an ABNORMAL check is carried: an all-green one adds
       nothing a grown-up would read, and this record is mirrored to a shared
       cloud collection, so it is the one shape not worth putting on the wire. */
    readinessDetail: readiness && isAbnormalCheck(readiness) ? {
      readinessAnswers: { ...(readiness.answers || {}) },
      zoneSev: { ...(readiness.zoneSev || {}) },
      severity: readiness.severity ?? null,
      resultSource: readiness.resultSource || null
    } : null
  });
  /* What actually RAN, back onto the check that suggested it — plan.light, not
     the light this sitting was started with. A Red morning picked up in the
     evening under a Green check runs Red (planResume holds a workout at the
     light it started under), and stamping `resolvedLight` told the readiness
     log the day finished Green and blamed a grown-up for an override nobody
     made. */
  stampReadinessOutcome(plan.light, resolvedSuggestion !== plan.light);

  const bankedRounds = plan.bankedRounds;
  const mainOwed = plan.mainOwed;
  /* Moves finished earlier today, and the credit they were worth. Both come off
     the day's record rather than being recounted from the session log, because
     the record is what the banking wrote and it is per-day by construction. */
  sess.bankedCredit = isCareSession() ? 0 : (Number(prog && prog.bankedCredit) || 0);
  /* A resume continues the SAME workout; anything else starts a new one. Care
     never joins the training day's workout — it is not that day's work, which
     is the same reason it never touches its progress record. */
  sess.workoutInstanceId = (!isCareSession() && prog && prog.workoutInstanceId)
    ? prog.workoutInstanceId
    : newWorkoutInstanceId();
  /* The date the WORKOUT started on, for the XP day budget: a bout resumed
     after midnight is the same day's work and shares that day's cap (see
     dayXpKey in js/store.js). */
  sess.dayIso = (!isCareSession() && prog && prog.workoutInstanceId === sess.workoutInstanceId && prog.dayIso)
    ? prog.dayIso
    : edmontonISO(new Date());
  sess.circuits = plan.circuits;
  /* NOTHING LEFT TO RUN. This return happens BEFORE THE FIRST AWAIT, and
     js/main.js relies on that: it reads `sess.running` straight after calling
     this and steps back to Today rather than leaving a dead session screen up.
     Keep it synchronous. */
  if (!sess.circuits.length) { sess.running = false; return; }
  // A provisional value only: the day's own figure replaces it below, once the
  // light and the round cap are resolved. The clock on screen reads this.
  sess.plannedSecs = estimateSessionSecs(sess.circuits) + 8;
  /* THE ASK IS THE DAY'S, NOT THIS SITTING'S.

     A resume used to be priced against its own remainder, so the smaller the
     leftover the easier the streak bar was to clear: finish a couple of moves in
     the evening on a barely-started day and 75% of two moves bought the day. Now
     the plan stays the whole day's, and the credit already banked today is
     carried in beside it (see bankedCredit in js/outcome.js) — so a day finished
     across two sittings still reads complete, and a two-move sitting on a
     barely-started day reads exactly as short as it is. */
  const dayRounds = Math.min(roundsForLight(sess.light), plan.roundsCap == null ? Infinity : plan.roundsCap);
  /* THE WHOLE DAY, assembled once. Three things want it — what the day asked
     for, how long the day was meant to take, and the list she reads — and it
     used to be built twice and kept by neither. */
  const dayCircuits = assembleCircuits(dayKey, sess.light,
    Number.isFinite(dayRounds) && dayRounds < roundsForLight(sess.light) ? { mainRounds: dayRounds } : {});
  sess.dayExpectedWork = countExpectedWork(dayCircuits);
  sess.expectedWork = isCareSession()
    ? countExpectedWork(sess.circuits)
    : Math.max(sess.dayExpectedWork, countExpectedWork(sess.circuits));
  /* AND THE MINUTES ARE THE DAY'S TOO, for exactly the reason above.

     `plannedSecs` was set from `sess.circuits` — the REMAINDER a resume was
     handed — so a day trained in two goes saved two rows each claiming the
     plan was the ten minutes that sitting had left. The Progress table's
     "Planned" row reads that field, and a thirty-three minute day that took
     two sittings reported a plan of eleven minutes. Same defect expectedWork
     had, same fix: take the day's, and never let a remainder shrink it. */
  sess.dayPlannedSecs = isCareSession() ? estimateSessionSecs(sess.circuits)
    : estimateSessionSecs(dayCircuits);
  /* WHAT THE LIST SHOWS IS THE DAY, NOT THIS SITTING.

     A resume runs the remainder, and the side list rendered exactly that: a
     short stub of leftovers with every status pill blank. Nothing on the screen
     said what she had already done, what she had cut short, or where in the day
     she was picking up — which is the one question the list exists to answer.

     So the list is the whole day, and `priorRows` is this day's merged ledger
     from earlier sittings, which is where each move's colour comes from. The
     runner is untouched: it still walks `circuits`, the remainder, in order.
     Care is its own short thing and is not the training day's work at all, so
     there it stays the runner's own view. */
  sess.listCircuits = isCareSession() ? sess.circuits : dayCircuits;
  sess.priorRows = isCareSession() ? [] : (plan.logRows || []);
  sess.plannedSecs = Math.max(sess.dayPlannedSecs, estimateSessionSecs(sess.circuits)) + 8;
  sess.roundsPlanned = (sess.spa || sess.recovery) ? 0 : mainOwed;
  /* WHAT THE DAY ASKED FOR, and how much of it was already done.

     `mainOwed` above is a REMAINDER, and it was the only rounds number anything
     kept: `bankedRounds` was a local that died with this function, so by the
     time a screen wanted to report the day, the day's own plan could not be
     recovered. It cannot be re-read later either — bankMainRounds adds to
     prog.mainRoundsCompleted as each round lands, and a completed run calls
     clearDayProgress — so the value is captured here, at the one moment it is
     still the head start rather than the running total.

     That is how a green day trained in two goes came to say "2 of 2 main
     rounds" on the finish screen, next to XP and a streak that were both
     judging all three. The record already carries day-wide expectedWork and
     bankedCredit for exactly this reason; rounds were the omission. */
  sess.dayRoundsPlanned = (sess.spa || sess.recovery) ? 0 : dayRounds;
  sess.bankedRounds = isCareSession() ? 0 : bankedRounds;
  // Computed here rather than at finalize, because the LIVE round check and the
  // saved record must be judged against the same expected counts. Deriving it
  // twice is how the engine and the ledger came to disagree in the first place.
  sess.expectedByRound = countExpectedByRound(sess.circuits);
  sess.spotChecks = pickSpotChecks(sess.circuits);

  logEvent("session_start", { day: dayKey, light: sess.light, mode: sessionMode,
                              workout: sess.workoutInstanceId });

  const circuits = sess.circuits;
  const dayMantra = day.mantra || MANTRA;
  const lightLabel = { green: "GREEN, 3 rounds", yellow: "YELLOW, 2 rounds",
    red: "RED, 1 round", recovery: "recovery only" }[sess.light] || "";
  const firstEx = circuits[0].exercises[0].name;

  /* THE OPENING IS HERS TO CUT. The mantra, the light and the first move's
     name ran as an un-interruptible speakAndWait: eleven to thirteen seconds
     with a real voice, during which the Done ring and every other control sat
     on screen doing nothing at all. A kid who has heard the mantra fifty times
     could not get past it, and "the start button does nothing" is exactly how
     that reads. Spoken through announce(), a tap means "I know this one, go" —
     the same thing it means on every move. */
  setPhase("greeting");
  playCue("work");
  const greetCut = await announce(sess.spa || sess.recovery
    ? (sess.spa ? "Spa Sunday. Easy recovery, slow and gentle."
       : "Recovery today. No workout — just easy, gentle care. Well done for checking in honestly.")
    : "Say it out loud with me, loud and proud: " + dayMantra + " " +
      "Your light today is " + lightLabel + ". Starting with " + firstEx + ".");
  // The beat after the greeting is there to let it land. She just said she
  // doesn't need it.
  const r1 = await sleep(greetCut ? 150 : 1500);
  if (r1 === "abort") return finalize(false);

  sess.skipExercise = false;
  startElapsed();

  setPhase("getready");
  /* Stamped BEFORE the lead-in is spoken, so a tap during the line — or in the
     beat between it and the clock — is a decision about this lead-in and not a
     stale flag to be thrown away. The line itself goes through announce() for
     the same reason the move names do. */
  const leadSince = Date.now();
  const firstLead = 5 + setupSecs(circuits[0].exercises[0]);
  await announce(firstLead > 5
    ? `${firstLead} seconds to the first block — grab what you need for ${firstEx}.`
    : "Five seconds to the first block.");
  const rGo = await countdown(firstLead, { since: leadSince });
  if (rGo === "abort") return finalize(false);

  let preAnnounced = false;

  /* The workout, as one list. Round and block boundaries are where the NEXT
     step changes round or circuit — the same moments the nested loops closed
     their braces — so every hook fires exactly where it used to. */
  const steps = buildSteps(circuits);
  sess.steps = steps;
  sess.totalSteps = steps.length;

  for (let s = 0; s < steps.length; s++) {
    const st = steps[s];
    const { ci, r, ei, ex, circuit, absRound } = st;
    let next = steps[s + 1] || null;
    let isLastOfRound = !next || next.ci !== ci || next.r !== r;
    let isLastOfBlock = !next || next.ci !== ci;

    sess.stepIdx = s;
    sess.skipExercise = false;
    sess.currentEx = ex;
    // The round of the DAY, not of this circuit — a resume's remainder round
    // is round two, and both the ledger and the screen have to say so.
    sess.ci = ci; sess.ei = ei; sess.round = absRound;
    resetExerciseClock();
    setUpNext(next);

    /* "◀ Back" can land during any await below — a countdown, a rep, or a
       spoken line that cannot itself return "back". One check, after each. */
    const back = () => { s = rewindTo(sess.backTo) - 1; preAnnounced = false; };

    // ---------- WORK ----------
    const work = ex.byReps ? 0 : exWork(ex);
    playCue("work");
    if (ex.byReps) {
      setPhase("reps");
      if (!preAnnounced) await announce(openingLine(ex, "Go."));
      preAnnounced = false;
      if (sess.abort) return finalize(false);
      if (wentBack()) { back(); continue; }
      resetExerciseClock();
      const result = await runPrescribedReps(ex);
      if (result === "abort") return finalize(false);
      if (result === "back" || wentBack()) { back(); continue; }
    } else {
      sess.timerSecs = work; sess.timerMax = work;
      setPhase("work");
      if (!preAnnounced) await announce(openingLine(ex, "Three, two, one, go."));
      preAnnounced = false;
      if (sess.abort) return finalize(false);
      if (wentBack()) { back(); continue; }
      resetExerciseClock();

      if (ex.eachSide) {
        const half = Math.floor(work / 2);
        sess.sideLabel = `${half}s first side`;
        const r3 = await countdown(half);
        if (r3 === "abort") return finalize(false);
        if (r3 === "back") { back(); continue; }
        if (r3 !== "skip") {
          setPhase("sideswitch");
          // Same as segmentBreak: the tap belongs to the switch, not to the
          // clock that starts once the coach has finished saying so.
          const switchSince = Date.now();
          await speakAndWait("Nice. Switch sides — five to reset.");
          if (sess.abort) return finalize(false);
          if (wentBack()) { back(); continue; }
          const r4 = await countdown(SIDE_SWITCH_BUFFER, { since: switchSince });
          if (r4 === "abort") return finalize(false);
          if (r4 === "back") { back(); continue; }
          if (r4 !== "skip") {
            sess.sideLabel = `${half}s second side`;
            setPhase("work");
            await announce(ex.name + " second side. Three, two, one, go.");
            if (sess.abort) return finalize(false);
            if (wentBack()) { back(); continue; }
            const r5 = await countdown(half);
            if (r5 === "abort") return finalize(false);
            if (r5 === "back") { back(); continue; }
          }
        }
        sess.sideLabel = "";
      } else {
        const r6 = await countdown(work);
        if (r6 === "abort") return finalize(false);
        if (r6 === "back") { back(); continue; }
      }
    }

    const key = ci + "-" + ei;
    // Clear the skip flag BEFORE the rest phase — leaving it set makes the
    // rest countdown resolve "skip" instantly, so a skipped exercise used
    // to also swallow its rest (and the justSkipped minimum below).
    const wasSkipped = sess.skipExercise;
    sess.skipExercise = false;
    sess.exDone += 1;

    // ---------- LEDGER ----------
    // What ACTUALLY happened, one row per exercise per round. The old code
    // wrote perExercise only when r === 1, so a move skipped in round two
    // or three left no trace at all, and it inferred "done" from reaching
    // the end of the loop — so tapping Done instantly on everything still
    // produced a fully completed session.
    const row = recordExercise(ex, circuit, ci, ei, absRound, wasSkipped);
    // Banked NOW, not when the block ends — an interrupted session must keep
    // every move it actually finished. See bankMove.
    bankMove(row);
    // And the ROUND is committed now too, for the same reason one move down:
    // everything between here and the next round — the form check below, the
    // round-rest speech, the rest itself — can abort, and each abort used to
    // discard a round she had already finished. See commitRoundIfDone.
    if (circuit.block === "main") commitRoundIfDone(ci, absRound);
    sess.exStatus[key] = row.status === "skipped" ? "skipped"
      : r === circuit.rounds ? row.status : sess.exStatus[key];

    /* LANDING CHECK. A sport with a landing rule grades every gated jump before
       the rest starts — clean and frozen, or a bit wobbly. Two wobbly in a row
       drop the highest remaining main round, never the one in progress, and
       the plan is lowered with it (applyTierDrop). A graded jump is never also
       spot-checked. Off unless the app turns it on: see FEATURES.landingCheck. */
    if (FEATURES.landingCheck && ex.gate === "valgus" && row.status !== "skipped" && !sess.pendingCleanCheck) {
      sess.spotAsked[ex.name] = true;
      const lg = await formCheckPrompt(ex.name, "landing");
      if (lg === "abort") return finalize(false);
      if (wentBack()) { back(); continue; }
      if (circuit.block === "main") {
        const dropped = tierDroppedRounds(circuit.rounds, sess.wobblyStreak, r);
        if (dropped < circuit.rounds) {
          applyTierDrop(circuit, dropped, steps, s, ex.name, r);
          next = steps[s + 1] || null;
          isLastOfRound = !next || next.ci !== ci || next.r !== r;
          isLastOfBlock = !next || next.ci !== ci;
          setUpNext(next);
          await speakAndWait("Two wobbly landings in a row — let's drop a round. Quality over quantity.");
          if (sess.abort) return finalize(false);
        }
      }
    }

    // Self-check only the moves this run is watching (see pickSpotChecks),
    // and only the first time each one comes round — main runs 2–3 rounds.
    // A pending check is never overwritten by the next move: it is awaited
    // here and resolved before the loop can reach another one.
    if ((circuit.block === "main" || circuit.block === "prep") && row.status === "done"
        && sess.spotChecks.includes(ex.name) && !sess.spotAsked[ex.name]
        && !sess.pendingCleanCheck) {
      sess.spotAsked[ex.name] = true;
      const fc = await formCheckPrompt(ex.name);
      if (fc === "abort") return finalize(false);
      if (wentBack()) { back(); continue; }
    }

    // ---------- REST ----------
    const isFinalEx = !next;

    if (!isFinalEx) {
      const upcomingEx = next.ex;
      const isLastCircuit = ci === circuits.length - 1;
      const isRoundBreak = isLastOfRound && r < circuit.rounds;
      const isBlockBreak = isLastOfRound && r === circuit.rounds && !isLastCircuit;

      if (isRoundBreak) {
        if (circuit.block === "main" && r === 1 && !sess.intentWord && !sess.spa && !sess.recovery) {
          const iw = await intentWordPrompt();
          if (iw === "abort") return finalize(false);
        }
        playCue("rest");
        setPhase("roundRest");
        const restSince = Date.now();   // a Skip Rest tap from here on counts
        const roundProgress = `Round ${r} done! You've got ${circuit.rounds - r} more to crush!`;
        await speakAndWait(roundProgress);
        if (sess.abort) return finalize(false);
        if (wentBack()) { back(); continue; }
        if (voiceOn()) speakIfIdle("Did that feel different from the first round? Just ask yourself.");
        const leadTime = upcomingEx && HARD_EXERCISES.has(upcomingEx.name) ? 8 : 5;
        const result = await countdown(configuredRoundRest() + setupSecs(upcomingEx), {
          since: restSince,
          onTick: (rem) => {
            if (rem === leadTime && upcomingEx) {
              speakIfIdle("Get ready for " + upcomingEx.name + (upcomingEx.reset ? ". " + upcomingEx.reset : ""));
            }
          }
        });
        if (result === "abort") return finalize(false);
        if (result === "back") { back(); continue; }
        if (result !== "skip" && voiceOn()) await speakAndWait(nextEncouragement());
        if (sess.abort) return finalize(false);
        if (wentBack()) { back(); continue; }
      } else if (isBlockBreak) {
        playCue("rest");
        setPhase("sectionRest");
        const restSince = Date.now();   // a Skip Rest tap from here on counts
        await speakAndWait(`Block done! Next up: ${circuits[ci + 1].name}.`);
        if (sess.abort) return finalize(false);
        if (wentBack()) { back(); continue; }
        const result = await countdown(configuredSectionRest() + setupSecs(upcomingEx), {
          since: restSince,
          onTick: (rem) => {
            if (rem === 4 && upcomingEx) {
              speakIfIdle("Get ready for " + upcomingEx.name + (upcomingEx.reset ? ". " + upcomingEx.reset : ""));
            }
          }
        });
        if (result === "abort") return finalize(false);
        if (result === "back") { back(); continue; }
      } else {
        let restDuration = configuredExerciseRest();
        if (sess.justSkipped) restDuration = Math.max(restDuration, 4);
        sess.justSkipped = false;
        // The gear comes out of the rest, not out of her working time.
        const setup = setupSecs(upcomingEx);
        restDuration += setup;
        playCue("rest");
        sess.restCue = setup && upcomingEx ? `Get set up: ${upcomingEx.name}`
          : upcomingEx && upcomingEx.reset ? `Next: ${upcomingEx.reset}` : "Breathe and reset.";
        setPhase("rest");
        const restSince = Date.now();   // a Skip Rest tap from here on counts
        const nextName = upcomingEx ? upcomingEx.name : "";
        if (voiceOn()) await speakAndWait(nextName
          ? (setup ? `Rest. Next: ${nextName} — get it set up.` : `Rest. Next: ${nextName}.`)
          : "Rest.");
        if (sess.abort) return finalize(false);
        if (wentBack()) { back(); continue; }
        let said = {};
        const result = await countdown(restDuration, {
          since: restSince,
          onTick: (rem) => {
            if (rem >= 1 && rem <= 3 && !said[rem]) { said[rem] = true; speak(String(rem)); }
          }
        });
        if (result === "abort") return finalize(false);
        if (result === "back") { back(); continue; }
        // A rest that RAN OUT has already said "Rest. Next: <move>" and counted
        // down, so "Go" is all that is left to say. A rest she cut short with
        // Skip Rest used to take the same branch, which marked the next move as
        // announced and skipped its name — she heard "Go" and nothing else. A
        // cut rest gets the move's full announcement.
        if (result === "done") { speak("Go"); preAnnounced = true; }
      }
    }

    // "Rounds" means MAIN rounds trained. Every one-round block used to add
    // to this same counter, so the finish screen showed a green day as 8.
    //
    // The round has normally been committed already, as its last row landed.
    // This is the safety net for the ragged shapes: a move capped by
    // `ex.rounds` means the last exercise of a round is not always the last
    // INDEX of the circuit, so "its last row" is not a position we can trust.
    // commitRoundIfDone counts a round once however often it is asked.
    if (isLastOfRound && circuit.block === "main") {
      commitRoundIfDone(ci, absRound);
      logRoundShort(ci, absRound);
    }
    if (isLastOfBlock) {
      if (blockHadWork(ci)) sess.blocksCompleted += 1;
      recordBlockDone(circuit.block, ci);
    }
  }

  // Skill-block extras: micro-loop Q&A + breath rehearsal. These are TRAINING
  // drills, so no care session runs them — not Spa Sunday, and not a weekday
  // that resolved to Recovery because her body reported pain. The old `!sess.spa`
  // guard let a sore Monday be handed a breath rehearsal anyway.
  if (!isCareSession()) {
    await microLoopPrompt();
    if (sess.abort) return finalize(false);
    setPhase("breath");
    await speakAndWait("Breath rehearsal. Exhale face down, hum, turn, quick sip, turn back.");
    await sleep(1500);
    if (sess.abort) return finalize(false);
  }

  finalize(true);
  // A CARE session is not the day — finishing a Recovery pass must leave a
  // half-trained Monday exactly as it found it.
  if (!isCareSession()) clearProgressIfReplaced();
}

/* ============================================================
   EXPLORE — the same screen, nothing counting down, nothing saved.

   "Let me look at the moves" is not a workout, and it used to be handed a
   whole different screen: a list, with a popup that opened off the bottom of
   the page. The ask is the timer she already knows — photo, ring, the list
   down the side, Next / Back / Skip — with the clock simply not running. So
   this walks the day's moves once each (prep included) and waits for a tap on
   every one of them. No body check, no rest, no ledger, no XP, no day
   progress: the only things that move are the screen and her.
   ============================================================ */
function holdUntilTap() {
  return new Promise(resolve => {
    sess.holdResolver = (r) => { sess.holdResolver = null; resolve(r); };
  });
}

async function runExplore(dayKey) {
  const day = DAYS[dayKey] || {};
  const light = day.spa ? "recovery" : "green";
  // Every move once. The valgus gate still applies: a locked gate means
  // Drop-and-Stick is the jump she is allowed to see.
  const circuits = assembleCircuits(dayKey, light, { mainRounds: 1 })
    .map(c => ({ ...c, rounds: 1, roundBase: 1 }));
  if (!circuits.length) { sess.running = false; return; }
  Object.assign(sess, blankSession(), {
    running: true, explore: true, mode: "explore", dayKey, light,
    spa: !!day.spa, recovery: light === "recovery", circuits,
    // Explore runs the whole day already, so the list and the runner agree.
    listCircuits: circuits,
    expectedByRound: {}
  });
  const steps = buildSteps(circuits);
  sess.steps = steps;
  sess.totalSteps = steps.length;
  sess.plannedSecs = estimateSessionSecs(circuits);

  for (let s = 0; s < steps.length; s++) {
    const st = steps[s];
    const { ci, ei, ex } = st;
    sess.stepIdx = s;
    sess.currentEx = ex;
    sess.ci = ci; sess.ei = ei; sess.round = 1;
    setUpNext(steps[s + 1] || null);
    sess.sideLabel = ex.eachSide ? "each side" : "";
    if (ex.byReps) {
      const p = exPrescription(ex);
      sess.repsTarget = p.totalReps; sess.repsCounted = 0; sess.repNow = 0;
      sess.timerSecs = 0; sess.timerMax = 0;
      setPhase("reps");
    } else {
      const work = exWork(ex);
      sess.timerSecs = work; sess.timerMax = work;
      setPhase("work");
    }
    const r = await holdUntilTap();
    if (r === "abort") {
      // No setPhase here: the caller blanks `sess` on the same tick, and this
      // continuation lands a microtask later.
      sess.running = false; sess.abort = false;
      return;
    }
    const key = ci + "-" + ei;
    /* A TAP ON THE LIST. Looking at one move should not mean tapping through
       everything in front of it, so the list is the navigation: the tap says
       which step, and the walk simply resumes there. The move she was standing
       on gets no verdict — she left it, she did not finish or skip it. */
    if (r === "jump") {
      const t = sess.jumpTo; sess.jumpTo = null;
      if (Number.isFinite(t)) s = t - 1;
      continue;
    }
    if (r === "back") {
      if (s > 0) { delete sess.exStatus[(steps[s - 1].ci) + "-" + steps[s - 1].ei]; s -= 2; }
      else s -= 1;
      sess.exDone = Object.keys(sess.exStatus).length;
      continue;
    }
    sess.exStatus[key] = r === "skip" ? "skipped" : "done";
    /* HOW MANY SHE HAS LOOKED AT, not how far down the list she is. Once the
       list can be tapped, the step index says nothing about progress — she can
       be on the last move having seen two. The bar counts verdicts. */
    sess.exDone = Object.keys(sess.exStatus).length;
  }
  sess.running = false;
  setPhase("done");
}

/* THE RECORD IS WRITTEN BEFORE THE RESUME IT REPLACES IS THROWN AWAY.

   clearDayProgress used to run on the line ABOVE finalize(true) — and finalize
   is where saveSession happens, and saveSession returns false when storage
   refuses the write. So a full quota at the end of a long session deleted the
   only resumable copy and then failed to write the record that was supposed to
   replace it. The work existed in neither place. A child cannot be asked to
   notice that; the app has to be the one that does not throw the last copy
   away before the new one has landed.

   Two conditions, both required:

     · the save actually reached storage (a `false` from writeStorage is not a
       saved session, whatever the loop did), and
     · the day has nothing left owed — every block of its plan retired and every
       main round the light asks for banked.

   The second condition is deliberately the DAY's ledger and not this sitting's
   outcome score. A resume is judged against the whole day's ask while its own
   ledger holds only the second half, so a genuinely finished day can score
   `partial` on the sitting that finished it — and clearing on the score would
   then keep a record with nothing in it to come back to, while a day that
   really does have moves outstanding is the case that matters. What decides it
   is the only question worth asking: is there anything here she could resume?

   Everything else keeps the progress record. Keeping one costs a resume prompt
   she can decline; clearing one costs work she already did. */
function nothingLeftOwed() {
  const prog = loadDayProgress(sess.dayKey);
  if (!prog) return true;                       // nothing there to come back to
  if ((Number(prog.mainRoundsCompleted) || 0) < roundsForLight(sess.light)) return false;
  const done = new Set(prog.done || []);
  // The day's WHOLE plan, not the remainder this sitting was handed.
  return assembleCircuits(sess.dayKey, sess.light, {})
    .map(c => c.block)
    .filter(b => b && b !== "prep")             // prep is never recorded — see recordBlockDone
    .every(b => done.has(b));
}

function clearProgressIfReplaced() {
  if (!ownsDayProgress()) return;
  if (!sess.savedEntry) {
    logEvent("progress_kept", { day: sess.dayKey, reason: "save_failed" });
    return;
  }
  /* Either proof is enough that there is nothing to come back to, and requiring
     both is what leaves a stale record behind. nothingLeftOwed() re-derives the
     day's block list at finalize time, so if the valgus gate unlocked mid-run
     the list can name a block that was never actually offered — and the record
     would then never clear, handing her a resume prompt for a day she finished.
     A saved outcome of `complete` settles it on its own. */
  const savedComplete = !!(sess.savedOutcome && sess.savedOutcome.state === "complete");
  if (!savedComplete && !nothingLeftOwed()) {
    logEvent("progress_kept", {
      day: sess.dayKey,
      reason: (sess.savedOutcome && sess.savedOutcome.state) || "partial"
    });
    return;
  }
  clearDayProgress(sess.dayKey);
}

/* ============================================================
   FINALIZATION — ended-early sessions are now RECORDED
   ("your progress is saved"), with endedEarly + pain flags.
   ============================================================ */
export function finalize(completed) {
  sess.running = false;
  sess.paused = false;
  sess.pauseReasons = [];
  sess.abort = false;
  sess.stopOverlay = false;
  sess.confirmEnd = false;
  cancelSpeech();
  stopElapsed();
  // Now that everything else has been silenced, the one line that must be
  // heard. See endEarly.
  if (sess.saySafetyStop) { sess.saySafetyStop = false; speakSafety("Session stopped."); }

  syncClock();
  const elapsedSecs = sess.elapsed;
  const day = DAYS[sess.dayKey] || {};
  sess.endedEarly = !completed;

  // A pain stop is a safety event, not a short workout. It used to pay half a
  // session's XP and feed the streak, which rewards stopping the same way it
  // rewards training — exactly backwards.
  const safetyStop = !!sess.painFlag;

  const entry = {
    app: APP_ID,
    athlete: athleteId(),      // the cloud mirror is shared; a restore filters on this
    dayKey: sess.dayKey,
    dayTitle: day.title || sess.dayKey,
    /* WHICH WORKOUT this record is a fragment of. A day trained in two goes
       writes two rows carrying the same id, and every report aggregates on it
       before counting anything — see workoutInstances in js/outcome.js. */
    workoutInstanceId: sess.workoutInstanceId || null,
    isoDate: new Date().toISOString(),
    dayIso: sess.dayIso || null,       // the day the workout STARTED — its XP budget
    durationSecs: elapsedSecs,
    session: "morning",
    planVersion: "2026.2",
    xpVersion: XP_VERSION,     // marks a row whose XP counted the rounds trained
    sessionType: sess.recovery && !sess.spa ? "recovery" : sess.spa ? "spa" : "main",
    lightResult: sess.light,
    suggestedLight: sess.suggestedLight || sess.light,
    wasOverridden: (sess.suggestedLight || sess.light) !== sess.light,   // a grown-up moved it
    ...(sess.readinessDetail || {}),   // zones + answers, abnormal checks only
    // What was actually trained, and what the day asked for — two different
    // numbers. Storing only the planned one is what paid 150% for one day.
    roundsDone: (sess.spa || sess.recovery) ? 0 : sess.roundsCompleted,
    roundsPlanned: sess.roundsPlanned,
    // The day's own ask, and what it had already been paid in rounds — so a
    // resumed sitting can be reported against the day rather than against its
    // own leftovers. See dayRoundsPlanned in js/store.js.
    dayRoundsPlanned: (sess.spa || sess.recovery) ? 0 : sess.dayRoundsPlanned,
    bankedRounds: (sess.spa || sess.recovery) ? 0 : (sess.bankedRounds || 0),
    blocksCompleted: sess.blocksCompleted,
    safetyStop,
    ledger: sess.ledger || [],
    perExercise: perExerciseFromLedger(sess.ledger),
    microLoop: sess.microLoop || null,
    intentWord: sess.intentWord || null,
    prSentinel: (sess.spa || sess.recovery) ? null : day.prSentinel || null,
    skippedCount: sess.skipped.length,
    pauseCount: sess.pauseCount || 0,
    pausedSecs: sess.pausedSecs,
    plannedSecs: sess.plannedSecs,
    // The DAY's planned minutes, for a reader that has to report the day rather
    // than the sitting — see dayPlannedSecs above.
    dayPlannedSecs: sess.dayPlannedSecs || sess.plannedSecs,
    clean: sess.cleanCount, wobbly: sess.wobblyCount,
    formChecks: sess.formChecks || [],       // per-move verdicts from this run's spot-checks
    // Only a sport with a landing rule writes these; the row shape elsewhere is unchanged.
    ...(FEATURES.landingCheck ? { landings: sess.landings || {}, tierDropped: sess.tierDropped || 0 } : {}),
    light: sess.light,
    pain: safetyStop,
    endedEarly: !completed,
    // The loop reaching its end is NOT the same as the work being done. The
    // record now carries what the session ASKED FOR (expectedWork) plus the
    // version marker that lets partial work count, and every reader derives
    // completion from the ledger through js/outcome.js.
    expectedWork: sess.expectedWork || 0,
    // What each main round asked for, so a completed round is provable from the
    // record alone — including a record that arrives back from the cloud or a
    // backup file, where the engine that ran it is long gone.
    expectedByRound: sess.expectedByRound || countExpectedByRound(sess.circuits),
    // What the day had already been paid before this sitting started. Saved on
    // the row so the record scores the same tomorrow, and after a cloud restore,
    // as it did on the finish screen tonight.
    bankedCredit: (sess.spa || sess.recovery) ? 0 : (sess.bankedCredit || 0),
    outcomeVersion: OUTCOME_VERSION,
    completedFully: !!completed
  };
  // WHY each main round did or did not count, saved with the row. A grown-up
  // asking "she did three rounds, why does it say zero" should be able to read
  // the answer off the record — or the CSV export — without reconstructing it
  // from the raw ledger. Derived, never authoritative: every reader still scores
  // the ledger itself through js/outcome.js.
  entry.roundReport = mainRoundReport(entry.ledger, entry.expectedByRound, OUTCOME_VERSION);
  const finalOutcome = deriveSessionOutcome({
    ledger: entry.ledger, expectedWork: entry.expectedWork,
    expectedByRound: entry.expectedByRound, roundsDone: entry.roundsDone,
    bankedCredit: entry.bankedCredit,
    safetyStop, explicitAbort: !completed, sessionType: entry.sessionType,
    outcomeVersion: OUTCOME_VERSION, completedFully: !!completed
  });
  entry.completedFully = finalOutcome.state === "complete";
  // Surfaced so the caller can decide what to do with the day's progress record
  // from what was actually SAVED, rather than from the loop having reached its
  // end. See clearProgressIfReplaced.
  sess.savedOutcome = finalOutcome;
  // The engine's own round count and the ledger's disagreeing means one of them
  // is wrong about what happened. The LEDGER is what gets reported now (see
  // deriveSessionOutcome), and the engine commits its rounds under that same
  // rule, so the two should agree exactly — a disagreement is a defect to look
  // at, not a number to split the difference on.
  if (finalOutcome.roundsDisagree) {
    logEvent("rounds_disagree", {
      day: sess.dayKey, engine: entry.roundsDone,
      ledger: mainRoundsFromLedger(entry.ledger, entry.expectedByRound, OUTCOME_VERSION)
    });
  }
  sess.perExercise = entry.perExercise;
  /* "I need to start over" throws the attempt away: no row, so no XP, no
     streak day, no prize — every one of which already keys off `saved`, so
     the discard rides the same path a failed write does rather than needing
     its own branch through eighty lines of settlement. */
  const saved = sess.discard ? false : saveSession(entry);
  // The RECORD, not a boolean. The finish screen has to say what the saved row
  // says — read back through outcomeOf, the same authority the parent reports
  // will use tomorrow — and it cannot do that from a `true`.
  sess.savedEntry = saved ? entry : null;
  // ...with one difference: a discard is a CHOICE, not a failed write. Saying
  // "we couldn't save that" to a kid who asked to start over is a lie that
  // reads like a bug.
  sess.saveFailed = !saved && !sess.discard;
  sess.savedKey = saved ? sessionKey(entry) : null;
  logEvent(completed ? "session_complete" : "session_abort", {
    day: sess.dayKey, durationSecs: elapsedSecs,
    skipped: sess.skipped.length, pauses: sess.pauseCount || 0,
    pain: !!sess.painFlag, discarded: !!sess.discard
  });

  // Valgus earn-back. This used to tick up whenever Drop-and-Stick merely
  // wasn't skipped, while the Grown-up screen promised "5/5 clean ×2 weeks".
  // It now needs the move actually DONE and self-checked CLEAN, and it banks
  // the WEEK rather than a bare count, so two sessions on one afternoon can't
  // unlock a gate that is supposed to take two weeks.
  if (completed) creditValgusWeek(entry);
  if (sess.skipped.length) {
    addSkipRecord({
      createdAt: Date.now(),
      sessionDate: new Date().toISOString(),
      sessionType: sess.spa ? "spa" : "main",
      skippedItems: sess.skipped
    });
  }

  // XP is paid for rounds actually trained, capped so one training day can
  // never pay more than the day's own plan however many partial-and-resume
  // attempts it takes. A safety stop pays nothing, and nothing is ever paid
  // for a session that failed to save — XP with no record behind it is how a
  // total drifts away from the history that is supposed to explain it.
  sess.xpEarned = (!saved || safetyStop) ? 0 : claimSessionXp(entry);
  /* Stamp what was ACTUALLY paid — including nothing. sessionXp() reads this
     field in preference to re-pricing the row, and rebuildJourneyXp sums
     sessionXp on every boot, so a record left unstamped is re-priced at FULL
     value the next time the app opens. A day's cap that granted zero was
     therefore handed straight back at the next launch. */
  if (saved) {
    entry.xpEarned = sess.xpEarned;   // the cloud copy must carry it too
    patchSession(sess.savedKey, { xpEarned: sess.xpEarned });
  }
  if (sess.xpEarned > 0) {
    const { leveledUp } = addXp(sess.xpEarned);
    // Only celebrate a level-up that actually owes a prize, so the button can
    // never be a dead tap (openPrizeDraw refuses when nothing is pending).
    sess.leveledUp = leveledUp && pendingDrawCount() > 0;
    noteSessionXpAwarded(sess.xpEarned);
  }

  // Cloud mirror — keep the doc ID so mood/reflection can patch it later.
  // Opt-out via Grown-up settings (privacy): when off, data stays on-device only.
  if (settings.cloudMirror !== false) {
    /* Imported HERE, not at the top of this file. The service worker states
       that core/firebase.js is never precached because it is only ever pulled
       in when the mirror is used (core/sw-core.js) — but a static import made
       it part of every boot, so an offline launch after a release had bumped
       the cache could fail to load the engine at all: a blank page, the one
       thing the worker exists to prevent. The failure is swallowed for the
       same reason every other mirror call swallows it — an offline device
       keeps its session locally and the next boot sync carries it up. */
    import("./firebase.js")
      .then(m => m.fsAddSession(entry))
      .then(id => { sess.fsId = id; flushCloudPatch(id); })
      .catch(() => {});
    // XP moved, so the shared journey did too — publish it rather than making
    // the other device wait until it is next opened.
    import("./sync.js").then(m => m.publishJourney()).catch(() => {});
  }

  if (completed) {
    playCue("done");
    speak("Training complete. Fantastic effort.");
  }
  setPhase("done");
}

/* ============================================================
   CONTROLS (called from the UI action layer)
   ============================================================ */
/* ---- pause transitions ----------------------------------------------------
   The clock is timestamp-driven, so the ONE thing every pause and resume must
   do is call syncClock() before it flips the flag: that closes the span at the
   exact moment of the tap and files it in the right bucket. Four places entered
   a pause and only one of them did — the stop overlay and the resume out of it
   set `sess.paused` bare, so up to a second of real work landed in `pausedMs`
   (or a second of reading landed in `activeMs`) on every stop she opened.

   The other half of the problem was that the instructions card, the video link
   and the stop overlay all borrowed the USER's pause: each one announced
   "Paused." out loud and added to `pauseCount`, so the parent report counted
   reading a move description as her stopping for a breather.

   So a pause now has a REASON, and the reasons are a set. A session paused for
   two reasons at once — she paused, then opened the instructions — resumes only
   when both are gone, which is what stops closing a card from restarting a
   clock she deliberately stopped. Only "user" is audible and only "user"
   counts. */
export const PAUSE_USER = "user";

/* THE PAGE GOING AWAY IS NOT A CHILD DOING BURPEES.

   Every timer in here runs on a wall-clock deadline, and nothing listened for
   the page going away. Safari suspends a backgrounded tab and freezes a locked
   screen, so locking the iPad thirty seconds into a forty-second hold and
   coming back a minute later handed her the whole minute as work performed —
   recorded done, paid for, and counted toward a round she was not there for.
   The one thing the app must never do is credit work a child did not do.

   So the workout pauses itself the moment the page is hidden, under its own
   reason so it is told apart from a deliberate tap: coming back needs an
   explicit Resume, which is also the only honest thing to show someone who has
   just returned to a screen and cannot know where the clock got to. Speech is
   cancelled with it, because a cue that resumes on return is a cue for a phase
   that has already gone.

   Registered once, at module load, and never removed: the guard has to be live
   for every session, not only the one that installed it. When nothing is
   running it does nothing. */
export const PAUSE_HIDDEN = "hidden";

function onPageHidden() {
  if (!sess.running) return;
  const hidden = typeof document !== "undefined" && document
    ? (document.hidden === true || document.visibilityState === "hidden")
    : true;
  if (!hidden) return;
  pauseSession(PAUSE_HIDDEN);
  // A countdown or a tempo cue queued behind a suspended page comes back late
  // and lands on the wrong exercise. Nothing spoken survives the trip.
  cancelSpeech();
}

/* `pagehide` as well as `visibilitychange`: iOS fires pagehide for the cases
   where a tab is frozen outright, and firing both only pauses twice, which the
   reason set already makes a no-op. */
if (typeof document !== "undefined" && document && document.addEventListener) {
  document.addEventListener("visibilitychange", onPageHidden);
  document.addEventListener("pagehide", onPageHidden);
}
if (typeof window !== "undefined" && window && window.addEventListener) {
  window.addEventListener("pagehide", onPageHidden);
}

function pauseReasons() {
  if (!Array.isArray(sess.pauseReasons)) sess.pauseReasons = [];
  return sess.pauseReasons;
}

export function pauseSession(reason = PAUSE_USER) {
  // Nothing is counting in explore, so there is nothing to stop. Reading the
  // instructions there must not put a "Resume my workout" button on a screen
  // with no workout behind it.
  if (!sess.running || sess.explore) return;
  syncClock();                       // close the span at the moment of the tap
  const reasons = pauseReasons();
  // A pause set directly on `sess` (or carried over from before this ran) is
  // still a pause somebody wants: keep it, so closing an overlay can't undo it.
  if (sess.paused && !reasons.length) reasons.push(PAUSE_USER);
  if (!reasons.includes(reason)) reasons.push(reason);
  const wasPaused = sess.paused;
  sess.paused = true;
  if (wasPaused) { notify("phase"); return; }
  if (reason === PAUSE_USER) sess.pauseCount = (sess.pauseCount || 0) + 1;
  logEvent("pause", { reason, ex: sess.currentEx ? sess.currentEx.name : null });
  if (reason === PAUSE_USER) interruptSpeech("Paused.");
  notify("phase");
}

export function resumeSession(reason = PAUSE_USER) {
  if (!sess.running) return;
  syncClock();                       // close the paused span at the same instant
  const reasons = pauseReasons();
  const i = reasons.indexOf(reason);
  if (i >= 0) reasons.splice(i, 1);
  if (reasons.length) { notify("phase"); return; }   // something else still holds it
  if (!sess.paused) { notify("phase"); return; }
  sess.paused = false;
  logEvent("resume", { reason, ex: sess.currentEx ? sess.currentEx.name : null });
  if (reason === PAUSE_USER) interruptSpeech("Resuming.");
  notify("phase");
}

/* The Pause button. Everything else names its own reason.

   Resuming releases the BACKGROUNDING hold as well as her own, because the
   button she comes back to is this one and there is no second control she could
   be expected to know about. Without that, a workout the app paused for her
   while the iPad was locked could not be restarted from the workout screen at
   all — the reason set would still be holding it, and the app would look
   broken to a ten-year-old who had done nothing wrong.

   RESUME MEANS RESUME — every hold, not the two this button happened to name.
   An overlay hold ("instructions", "video") used to be left in place, on the
   reasoning that its overlay is still open in front of her. Two of those holds
   outlive their overlay: the ✕ on the move card closes the card and keeps the
   hold, and "Watch the move" takes its hold with no overlay on screen at all.
   In both cases the only control that released it went away with the card, so
   every later tap of this button did nothing, Done walked on to the next phase
   with the clock still stopped, and the session could only be ended — the
   defect the owner reported. This button is the one Resume on the workout
   screen; it has to mean it however many reasons are stacked behind it. */
export function togglePause() {
  if (sess.paused) {
    [...pauseReasons()].forEach(r => resumeSession(r));
    resumeSession(PAUSE_USER);
  } else pauseSession(PAUSE_USER);
}

/* Was the workout stopped BY the app rather than by her? The screen needs to
   say so: "you paused this" and "the iPad went to sleep, and I stopped the
   clock so nothing was counted while you were away" are different messages,
   and only the second explains a timer that is not where she left it. */
export function pausedByBackground() {
  return !!sess.paused && (sess.pauseReasons || []).includes(PAUSE_HIDDEN);
}

export function advance() {
  // Tap the ring / Done: finishes a reps exercise early, ends a timed exercise
  // early (counts as done, not skipped), skips the current rest, or dismisses
  // an in-session prompt.
  if (sess.explore) { if (sess.holdResolver) sess.holdResolver("done"); return; }
  // The clean-check is its own phase, and Done there used to fall through to
  // nothing: the button sat on screen and did nothing for up to thirty
  // seconds. Done during the question means "move on" — no verdict recorded.
  if (sess.phase === "formcheck") { skipFormCheck(); return; }
  // The tail of a double tap, not a decision about this phase — see DONE_GUARD_MS.
  const now = Date.now();
  if (now - (sess.lastTapAt || 0) < DONE_GUARD_MS) return;
  sess.lastTapAt = now;
  // "I know this one — go": cut the announcement and start the clock.
  if (sess.announceResolver) { sess.announceResolver(); return; }
  if (sess.phase === "reps" && sess.byRepsResolver) { sess.byRepsResolver("done"); return; }
  if (sess.phase === "intent" && sess.intentResolver) { sess.intentResolver(null); return; }
  if (sess.phase === "microloop" && sess.microResolver) { sess.microResolver(null); return; }
  if (["work", "rest", "roundRest", "sectionRest", "sideswitch", "getready", "greeting", "breath"].includes(sess.phase)) {
    /* THE TAP WAITS FOR THE CLOCK, because the clock is what she is tapping at.
       A rest stamps `since` at the moment its phase begins (see the rest
       phases below) precisely so a tap during "Rest. Next: ..." counts — but
       the flag the countdown reads used to be wiped 1.2 s later, and with a
       real voice the announcement runs 1.5-4 s before the countdown that would
       have read it even starts. Every such tap was silently dropped: Done and
       Skip Rest did nothing exactly when a kid uses them most, at the top of
       the rest. Nothing needs a timer to expire this flag — the next countdown
       or sleep either consumes it (its `since` is older than the tap) or clears
       it as stale (its `since` is newer), which is what keeps a tap during a
       move's announcement meaning "go" rather than "done". */
    sess.forceDone = true;   // the next countdown/sleep that can honour it, will
    sess.forceDoneAt = Date.now();
  }
}

/* A TAP ON A MOVE IN THE LIST — explore only.

   A real session's ledger is one row per step, written in order, and
   countExpectedByRound counts a row that never arrived as a round she did not
   finish. Jumping the cursor there would quietly cost her the round, so in a
   real session the list stays what it has always been: something to read. The
   pill beside each move is what it says, and the runner walks in order. */
export function jumpToExercise(ci, ei) {
  if (!sess.explore || !sess.running) return;
  const target = (sess.steps || []).findIndex(st => st.ci === ci && st.ei === ei);
  if (target < 0 || target === sess.stepIdx) return;
  // Only when the walk is actually parked on a tap. Between one move and the
  // next there is no resolver, and recording a jump nobody will read would
  // leave it to fire against whichever move happened to come up.
  if (!sess.holdResolver) return;
  sess.jumpTo = target;
  sess.holdResolver("jump");
}

export function skipCurrentExercise() {
  if (sess.explore) { if (sess.holdResolver) sess.holdResolver("skip"); return; }
  // During rests and prompts no exercise is underway — Skip there means
  // "skip the wait", not "log the exercise that just finished as skipped".
  if (!["work", "reps", "sideswitch"].includes(sess.phase)) { advance(); return; }
  if (sess.currentEx) {
    // Tagged with the step, so "back a move" can take the skip off the list
    // when she goes back and does it after all.
    sess.skipped.push({ name: sess.currentEx.name, round: `R${sess.round}`, at: Date.now(), step: sess.stepIdx });
    logEvent("skip", { ex: sess.currentEx.name, block: sess.currentEx.block || null });
  }
  sess.skipExercise = true;
  sess.justSkipped = true;
  if (sess.byRepsResolver) sess.byRepsResolver("skip");
  interruptSpeech("Okay, skipping — you've got the next one.");
}

/* "◀ Back a move". During a move: the move before it. During the breather
   after one: that move again. The runner sees `backTo` at its next await (a
   countdown, a rep, or the end of a spoken line) and rewinds — see rewindTo.
   canGoBack() says where it is offered; this refuses anywhere else, so a
   stale button can never rewind across a committed round. */
export function goBackExercise() {
  if (sess.explore) { if (sess.holdResolver) sess.holdResolver("back"); return; }
  if (!canGoBack()) return;
  sess.backTo = backTarget();
  sess.confirmSkip = false;
  cancelSpeech();
  if (sess.byRepsResolver) sess.byRepsResolver("back");
  if (sess.formResolver) sess.formResolver(null);
  notify("phase");
}

export function openStopOverlay() {
  sess.stopOverlay = true;
  cancelSpeech();
  pauseSession("stop");
  notify("phase");
}
export function resumeFromStop() {
  sess.stopOverlay = false;
  resumeSession("stop");
  notify("phase");
}
/* The red STOP asks WHY before it ends anything. "Something hurts" is a safety
   stop: the record says so, nothing is paid, and the day does not count. "I
   just need to stop" is an ordinary early end — paid for the rounds she
   trained, streak judged by the normal rule. Every red STOP used to be a pain
   stop, so a bathroom break or a doorbell cost her the whole day's XP and the
   streak day with it. With no reason given it is still the safe reading. */
export const STOP_REASONS = ["pain", "break", "restart"];
/* Start over: end this attempt and keep NONE of it. Separate from endFromStop
   because the other two reasons record what she did and this one deliberately
   does not. The caller relaunches the day once the runner has unwound. */
export function discardSession() {
  sess.stopOverlay = false;
  sess.confirmRestart = false;
  sess.painFlag = false;
  sess.stopReason = "restart";
  sess.discard = true;
  logEvent("stop", { reason: "restart", hurt: false, ex: sess.currentEx ? sess.currentEx.name : null });
  endEarly();
}
/* Three reasons, two consequences. Only "hurt" withholds the day; "break" (no
   time) and "restart" (starting the session over) are ordinary early ends and
   are paid for the rounds she trained.

   The flag stays a DENY-LIST, not `reason === "pain"`: an unknown or missing
   reason must still read as a pain stop, which is the safe reading and the
   reason the parameter defaults to "pain". Only the two reasons we have
   deliberately decided are harmless clear it.

   The log keeps the reason SHE picked, not the flag. It used to write back
   `painFlag ? "pain" : "break"`, so a third reason could never be told apart
   from the second one in the record however many buttons the screen grew. */
export function endFromStop(reason = "pain") {
  sess.stopOverlay = false;
  sess.painFlag = reason !== "break" && reason !== "restart";
  sess.stopReason = STOP_REASONS.includes(reason) ? reason : "pain";
  logEvent("stop", { reason: sess.stopReason, hurt: sess.painFlag, ex: sess.currentEx ? sess.currentEx.name : null });
  endEarly();
}
export function endEarly() {
  sess.confirmEnd = false;
  if (sess.explore) {
    // Nothing was recorded, so nothing is "stopped" — no safety line, no record.
    sess.abort = true;
    if (sess.holdResolver) sess.holdResolver("abort");
    return;
  }
  sess.abort = true;
  if (sess.byRepsResolver) sess.byRepsResolver("abort");
  if (sess.intentResolver) sess.intentResolver(null);
  if (sess.microResolver) sess.microResolver(null);
  if (sess.formResolver) sess.formResolver(null);
  /* A stop confirmation is a SAFETY line: it is spoken even with the coach
     muted, because "I stopped because it hurt" is the one thing she must hear
     acknowledged.

     It is spoken ONCE, and nothing may follow it — which is why it is not
     spoken HERE. Saying it here put it in the queue a moment before the runner
     reached its next await, saw the abort and called finalize, whose first act
     is cancelSpeech(): the app killed its own safety cue on every stop, and no
     test could see it because the harness stubs speech to instant. It is
     raised as a request instead, and finalize speaks it once the cancelling is
     done. */
  sess.saySafetyStop = true;
}

export function pickIntentWord(word) { if (sess.intentResolver) sess.intentResolver(word); }
export function answerMicroLoop(answer) { if (sess.microResolver) sess.microResolver(answer); }
function recordFormCheck(clean) {
  if (sess.cleanCheckMove) sess.formChecks.push({ name: sess.cleanCheckMove, clean });
  sess.cleanCheckMove = null;
}
/* A landing check is a form check with a memory: each grade is kept per move
   for the grown-up watch-list, and a run of wobbly ones drives the tier-drop. */
function noteLanding(clean) {
  if (sess.checkKind !== "landing" || !sess.cleanCheckMove) return;
  const rec = sess.landings[sess.cleanCheckMove] || { clean: 0, wobbly: 0 };
  if (clean) { rec.clean += 1; sess.wobblyStreak = 0; }
  else { rec.wobbly += 1; sess.wobblyStreak = (sess.wobblyStreak || 0) + 1; }
  sess.landings[sess.cleanCheckMove] = rec;
}
export function pickClean() {
  if (!sess.pendingCleanCheck) return;
  noteLanding(true);
  sess.cleanCount += 1; sess.lastWobbly = false;
  if (sess.formResolver) sess.formResolver(true);
  else { recordFormCheck(true); sess.pendingCleanCheck = false; }
  notify("phase");
}
export function pickWobbly() {
  if (!sess.pendingCleanCheck) return;
  noteLanding(false);
  sess.wobblyCount += 1; sess.lastWobbly = true;
  if (sess.formResolver) sess.formResolver(false);
  else { recordFormCheck(false); sess.pendingCleanCheck = false; }
  notify("phase");
}
/* "Skip check" — no verdict, no clean count, no valgus credit. Not answering is
   not the same as answering "clean", and only a real Clean may unlock a gate. */
export function skipFormCheck() {
  if (!sess.pendingCleanCheck) return;
  if (sess.formResolver) sess.formResolver(null);
  else { sess.cleanCheckMove = null; sess.pendingCleanCheck = false; }
  notify("phase");
}

/* ---- cloud patches that can't arrive too early ----------------------------
   fsAddSession resolves with the doc ID some time AFTER the finish screen is
   already on-screen. A quick mood tap therefore had no ID to patch and the
   cloud copy simply never got it. Patches made before the ID lands are held
   and flushed the moment it does. */
let _pendingCloudPatch = null;

export function mirrorSessionPatch(patch) {
  if (settings.cloudMirror === false || !patch) return;
  // Offline, or with the module evicted, this rejects — and an unhandled
  // rejection from a mood tap is noise in a console a parent might be reading.
  if (sess.fsId) { import("./firebase.js").then(m => m.fsUpdateSession(sess.fsId, patch)).catch(() => {}); return; }
  _pendingCloudPatch = { ...(_pendingCloudPatch || {}), ...patch };
}

function flushCloudPatch(id) {
  if (!id || !_pendingCloudPatch) return;
  const patch = _pendingCloudPatch;
  _pendingCloudPatch = null;
  import("./firebase.js").then(m => m.fsUpdateSession(id, patch)).catch(() => {});
}

/* Complete-screen interactions: patch the saved record + Firestore mirror. */
export function setMood(key, emoji) {
  sess.mood = key;
  if (sess.savedEntry) {
    patchSession(sess.savedKey, { mood: key });
    mirrorSessionPatch({ mood: key });
  }
  notify("phase");
}
export function setReflect(field, label) {
  sess[field] = sess[field] === label ? null : label;
  if (sess.savedEntry) {
    const patch = field === "wentWell" ? { wentWell: sess.wentWell } : { nextTime: sess.nextTime };
    patchSession(sess.savedKey, patch);
    mirrorSessionPatch(patch);
  }
  notify("phase");
}
export function setQuizPick(i) { sess.quizPick = i; notify("phase"); }

/* Full reset before Today re-renders (guards double-running timers). */
export function exitSession() {
  // Tell the runner to stand down BEFORE the state it is walking is replaced:
  // a loop still parked on a countdown would otherwise wake up and keep
  // stepping through the fresh, empty session object.
  sess.abort = true;
  if (sess.byRepsResolver) sess.byRepsResolver("abort");
  if (sess.intentResolver) sess.intentResolver(null);
  if (sess.microResolver) sess.microResolver(null);
  if (sess.formResolver) sess.formResolver(null);
  if (sess.holdResolver) sess.holdResolver("abort");
  stopElapsed();
  cancelSpeech();
  _pendingCloudPatch = null;
  Object.assign(sess, blankSession());
}
