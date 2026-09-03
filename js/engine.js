/* ============================================================
   SESSION ENGINE — port of the old app's async/await runner
   (speak-then-count sequencing, eachSide side-switch, intent
   word, clean-check, skip/pause/stop, valgus earn-back). The old
   DOM setters are replaced by mutations of the exported `sess`
   view-state + notify() callbacks:
     notify("phase") → full session-screen re-render
     notify("tick")  → targeted per-second DOM writes only
   ============================================================ */

import { deriveSessionOutcome, mainRoundsFromLedger, mainRoundReport, OUTCOME_VERSION } from "./outcome.js";
import { DAYS, BLOCK_ORDER, BLOCK_LABEL, LIGHT_ROUNDS, LIGHT_SESSION_POLICY, SIDE_SWITCH_BUFFER, INTENT_WORDS, MICRO_LOOP, BREATH_REHEARSAL, MANTRA,
         exWork, exRepsDetail, exPrescription, prescriptionSegments, repSeconds,
         VALGUS_FLOOR, VALGUS_PROGRESSIONS } from "./data.js";
import { settings, configuredExerciseRest, configuredRoundRest, configuredSectionRest, saveSession, logEvent,
         loadDayProgress, saveDayProgress, clearDayProgress, gateLocked, creditValgusWeek, addSkipRecord,
         addXp, pendingDrawCount, claimSessionXp, athleteId, noteSessionXpAwarded, patchSession, sessionKey,
         XP_VERSION, flaggedMoves, isAbnormalCheck, stampReadinessOutcome } from "./store.js";
import { speak, speakIfIdle, speakAndWait, interruptSpeech, cancelSpeech, nextEncouragement, beep, endBeep, playCue, ensureAudio, voiceOn, speakSafety } from "./audio.js";
import { fsAddSession } from "./firebase.js";
import { recoveryDoseSecs, refTime } from "./util.js";

// Moves that deserve a longer "get ready" lead-in before they start. Kept in
// sync with the names that actually appear in the 2026.2 content (js/data.js);
// stale entries were pruned so the lead-time branch fires when it should.
const HARD_EXERCISES = new Set([
  "Box Jump", "Box Jump-Down", "Bosu Squat", "Drop-and-Stick",
  "Clean Pull-Ups", "Scap Pull-Up + Dead Hang"
]);

/* ---- session view-state (the single source the UI renders from) ---- */
export const sess = blankSession();

function blankSession() {
  return {
    running: false, paused: false, pauseReasons: [], pauseCount: 0,
    abort: false, skipExercise: false, forceDone: false, forceDoneAt: 0,
    byRepsResolver: null, intentResolver: null, microResolver: null,
    currentEx: null, skipped: [], perExercise: [], justSkipped: false,
    phase: "greeting",           // greeting|getready|work|reps|sideswitch|rest|roundRest|sectionRest|intent|microloop|breath|done
    circuits: [], ci: 0, ei: 0, round: 1, exDone: 0,
    timerSecs: 0, timerMax: 0, urgent: false,
    exElapsed: 0, elapsed: 0, pausedSecs: 0, plannedSecs: 0, expectedWork: 0,
    clockAt: 0, activeMs: 0, pausedMs: 0, exMs: 0,
    upNextName: "", upNextDose: "", restCue: "",
    stopOverlay: false, confirmEnd: false, painFlag: false,
    pendingCleanCheck: false, cleanCount: 0, wobblyCount: 0, lastWobbly: false,
    spotChecks: [], spotAsked: {}, cleanCheckMove: null, formChecks: [], formResolver: null,
    intentWord: null, microLoop: null,
    exStatus: {},                // "ci-ei" -> done|partial|skipped
    // The completion ledger: one row per exercise per round, holding what was
    // actually done. Rounds, XP and every report derive from it.
    // `roundsBanked` is how many of `roundsCompleted` have already been written
    // into the day's progress record — see bankMainRounds.
    // Credit for moves finished EARLIER TODAY, carried in so a resumed sitting is
    // judged against the whole day rather than its own leftovers.
    bankedCredit: 0, dayExpectedWork: 0,
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
    savedEntry: null, savedOutcome: null, saveFailed: false,
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
    dayKey: null, light: "green", practice: false, spa: false, recovery: false,
    endedEarly: false, xpEarned: 0, leveledUp: false,
    mood: null, wentWell: null, nextTime: null, quizPick: null, quizXp: 0,
    savedEntry: false, saveFailed: false, savedKey: null, fsId: null
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
   finisher and swim-skill work at a body that had just reported pain. */
export function roundsForLight(light) {
  const n = LIGHT_ROUNDS[light];
  return Number.isFinite(n) ? n : 1;
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
    // Standing rule: jump rope hidden on double-pool days.
    if (bk === "warmup" && day.poolLoad === "double") {
      exs = exs.filter(ex => !/jump rope/i.test(ex.name));
    }
    // A locked gate now actually gates. The app has always DISPLAYED a
    // locked/unlocked valgus state and nothing ever read it, so a jump
    // progression would have run whatever the grown-up had set. Locked means
    // every jump stays at Drop-and-Stick, exactly as the Grown-up Zone says.
    if (opts.gated !== false && gateLocked() && exs.some(ex => VALGUS_PROGRESSIONS.includes(ex.name))) {
      const floor = exs.find(ex => ex.name === VALGUS_FLOOR)
        || (day.blocks.main || []).find(ex => ex.name === VALGUS_FLOOR);
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
         the full rounds still owed. Two circuits, and they must not both call
         their first round "round 1": `roundBase` numbers each circuit's rounds
         from where the day actually is, so the ledger, commitRoundIfDone and
         countExpectedByRound all agree on which round a row belongs to.

         That numbering is what keeps the round-completion proof honest. The
         remainder circuit declares its OWN expected size, so finishing those
         moves credits the interrupted round exactly once — and a remainder
         round cut short again still cannot pass for a finished one. */
      const remainder = exs.filter(ex => !mainPartial.includes(ex.name));
      const base = mainPartial.length && remainder.length ? 2 : 1;
      if (mainPartial.length && remainder.length) {
        circuits.push({ name: BLOCK_LABEL[bk], block: bk, rounds: 1,
                        roundBase: 1, partialRound: true, exercises: remainder });
      }
      if (rounds > 0) {
        circuits.push({ name: BLOCK_LABEL[bk], block: bk, rounds,
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
    let deadline = started + seconds * 1000;
    let lastWhole = seconds;
    const id = setInterval(() => {
      if (sess.abort)        { clearInterval(id); resolve("abort"); return; }
      // Honor a Done-tap only if it landed AFTER this countdown began — a stale
      // flag from the previous phase must not skip a freshly-started one.
      if (sess.forceDone && sess.forceDoneAt >= started) { sess.forceDone = false; clearInterval(id); endBeep(); resolve("done"); return; }
      if (sess.forceDone && sess.forceDoneAt < started) sess.forceDone = false;   // drop the stale flag
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
      if (stopped() || sess.abort || sess.skipExercise) { clearInterval(id); resolve("interrupt"); return; }
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
  const line = seg.transition === "side"      ? "Nice. Switch sides — five to reset."
             : seg.transition === "direction" ? "Nice. Other direction — five to reset."
             :                                  "Nice. Next set — five to reset.";
  await speakAndWait(line);
  return countdown(SIDE_SWITCH_BUFFER);
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
      if (sess.abort || sess.skipExercise) {
        clearInterval(watchdog);
        const r = sess.byRepsResolver;
        if (r) { sess.byRepsResolver = null; r(sess.abort ? "abort" : "skip"); }
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
        if (br === "abort" || br === "skip" || stopped) return;
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
function nextExercise(circuits, ci, r, ei) {
  const circuit = circuits[ci];
  for (let j = ei + 1; j < circuit.exercises.length; j++) {
    if (!(circuit.exercises[j].rounds && r > circuit.exercises[j].rounds)) return circuit.exercises[j];
  }
  if (r + 1 <= circuit.rounds) {
    for (let j = 0; j < circuit.exercises.length; j++) {
      if (!(circuit.exercises[j].rounds && (r + 1) > circuit.exercises[j].rounds)) return circuit.exercises[j];
    }
  }
  if (ci + 1 < circuits.length) return circuits[ci + 1].exercises[0];
  return null;
}

function setPhase(phase) {
  sess.phase = phase;
  notify("phase");
}

function setUpNext(circuits, ci, r, ei) {
  const nx = nextExercise(circuits, ci, r, ei);
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
    block: ex.block || circuit.block,
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
  return sess.mode !== "tryit" && !isCareSession();
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
  if (!Number.isFinite(Number(prog.bankedCredit))) prog.bankedCredit = 0;
  // Every write goes through here, so this is the one place the id has to be
  // stamped for a resume to be able to read it back.
  if (sess.workoutInstanceId) prog.workoutInstanceId = sess.workoutInstanceId;
  return prog;
}

/* A FINISHED MOVE IS FINISHED, AND IS NEVER ASKED FOR TWICE.

   Rounds were banked as they landed (see bankMainRounds below), but everything
   else was banked only when its whole BLOCK finished — which is past the early
   return an interrupted session takes. Stop four moves into an eight-move
   warm-up and all four came back on the next attempt.

   Moves are recorded by NAME, not by position: the same block assembles
   differently depending on the valgus gate and on whether the day is a double
   pool day (see assembleCircuits), so an index would come back pointing at a
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
  if (!row || row.status !== "done") return;
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
  const list = prog.moves[block] || (prog.moves[block] = []);
  if (list.includes(row.name)) return;      // a resume must not re-bank a name
  list.push(row.name);
  prog.bankedCredit = Number(prog.bankedCredit) + 1;
  prog.light = sess.light;
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
function formCheckPrompt(moveName) {
  return new Promise(resolve => {
    sess.cleanCheckMove = moveName;
    sess.pendingCleanCheck = true;
    setPhase("formcheck");
    speakIfIdle("How did that feel — clean, or wobbly?");
    const finish = (result) => {
      clearInterval(watchdog); clearTimeout(timeout);
      sess.formResolver = null;
      sess.pendingCleanCheck = false;
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

/* ============================================================
   MAIN RUNNER
   ============================================================ */
export async function startSession({ dayKey, light = "green", mode = null, suggestedLight = null, readiness = null }) {
  if (sess.running) return;
  // Try-It never reaches the engine any more — it is a browse screen with no
  // timer, no rounds and no record (see js/vm/tryit.js). Refuse it here so a
  // stale caller can't quietly start a real, recorded workout in "test" mode.
  if (mode === "tryit") return;
  ensureAudio();
  const day = DAYS[dayKey];
  if (!day) return;

  // Recovery is an explicit MODE, not a light with zero rounds — the whole
  // point of the check is that a sore day gets recovery rather than a shortened
  // workout, because "a shortened workout" is still a workout.
  const resolvedLight = day.spa ? "recovery" : light;
  // Sunday is recovery because the CALENDAR says so, not because anyone
  // overrode the check — so there is no override to record on a spa day.
  const resolvedSuggestion = day.spa ? "recovery" : (suggestedLight || resolvedLight);
  const isRecovery = resolvedLight === "recovery";
  const sessionMode = isRecovery ? "recovery" : (mode || "normal");
  Object.assign(sess, blankSession(), {
    running: true, dayKey, mode: sessionMode,
    practice: false,
    light: resolvedLight,
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
  // What actually ran, back onto the check that suggested it.
  stampReadinessOutcome(resolvedLight, resolvedSuggestion !== resolvedLight);

  // Same-day resume: blocks already completed today are skipped. A care session
  // does not even READ the training day's progress — see isCareSession.
  const prog = isCareSession() ? null : loadDayProgress(dayKey);
  const skipBlocks = (prog && prog.done) || [];
  /* Main resumes by ROUNDS, never by name. A finished-block list cannot say that
     one round of a Red day is banked while a Green day still wants two more, so
     a raised light dropped Main outright and ran a session with no main set. */
  const bankedRounds = (prog && Number(prog.mainRoundsCompleted)) || 0;
  const mainOwed = Math.max(0, roundsForLight(sess.light) - bankedRounds);
  /* Moves finished earlier today, and the credit they were worth. Both come off
     the day's record rather than being recounted from the session log, because
     the record is what the banking wrote and it is per-day by construction. */
  const bankedMoves = (prog && prog.moves) || {};
  sess.bankedCredit = isCareSession() ? 0 : (Number(prog && prog.bankedCredit) || 0);
  /* A resume continues the SAME workout; anything else starts a new one. Care
     never joins the training day's workout — it is not that day's work, which
     is the same reason it never touches its progress record. */
  sess.workoutInstanceId = (!isCareSession() && prog && prog.workoutInstanceId)
    ? prog.workoutInstanceId
    : newWorkoutInstanceId();
  sess.circuits = isCareSession()
    ? assembleCircuits(dayKey, sess.light, { skip: [] })
    : assembleCircuits(dayKey, sess.light, {
        skip: skipBlocks.filter(b => !(b === "main" && mainOwed > 0)),
        mainRounds: mainOwed,
        skipMoves: bankedMoves,
        mainPartialRound: bankedMoves.main || []
      });
  if (!sess.circuits.length) { sess.running = false; return; }
  sess.plannedSecs = estimateSessionSecs(sess.circuits) + 8;
  /* THE ASK IS THE DAY'S, NOT THIS SITTING'S.

     A resume used to be priced against its own remainder, so the smaller the
     leftover the easier the streak bar was to clear: finish a couple of moves in
     the evening on a barely-started day and 75% of two moves bought the day. Now
     the plan stays the whole day's, and the credit already banked today is
     carried in beside it (see bankedCredit in js/outcome.js) — so a day finished
     across two sittings still reads complete, and a two-move sitting on a
     barely-started day reads exactly as short as it is. */
  sess.dayExpectedWork = countExpectedWork(assembleCircuits(dayKey, sess.light, {}));
  sess.expectedWork = isCareSession()
    ? countExpectedWork(sess.circuits)
    : Math.max(sess.dayExpectedWork, countExpectedWork(sess.circuits));
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
  sess.dayRoundsPlanned = (sess.spa || sess.recovery) ? 0 : roundsForLight(sess.light);
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

  setPhase("greeting");
  playCue("work");
  if (sess.spa || sess.recovery) {
    await speakAndWait(sess.spa ? "Spa Sunday. Easy recovery, slow and gentle."
      : "Recovery today. No workout — just easy, gentle care. Well done for checking in honestly.");
  } else {
    await speakAndWait("Say it out loud with me, loud and proud: " + dayMantra + " " +
      "Your light today is " + lightLabel + ". Starting with " + firstEx + ".");
  }
  const r1 = await sleep(1500);
  if (r1 === "abort") return finalize(false);

  sess.skipExercise = false;
  startElapsed();

  setPhase("getready");
  await speakAndWait("Five seconds to the first block.");
  const rGo = await countdown(5);
  if (rGo === "abort") return finalize(false);

  let preAnnounced = false;

  for (let ci = 0; ci < circuits.length; ci++) {
    const circuit = circuits[ci];

    for (let r = 1; r <= circuit.rounds; r++) {
      for (let ei = 0; ei < circuit.exercises.length; ei++) {
        const ex = circuit.exercises[ei];
        if (ex.rounds && r > ex.rounds) continue;
        sess.skipExercise = false;
        sess.currentEx = ex;
        // The round of the DAY, not of this circuit — a resume's remainder round
        // is round two, and both the ledger and the screen have to say so.
        const absRound = roundNumber(circuit, r);
        sess.ci = ci; sess.ei = ei; sess.round = absRound;
        resetExerciseClock();
        setUpNext(circuits, ci, r, ei);

        // ---------- WORK ----------
        const work = ex.byReps ? 0 : exWork(ex);
        playCue("work");
        if (ex.byReps) {
          setPhase("reps");
          if (!preAnnounced) await speakAndWait(ex.name + "." + (ex.reset ? " " + ex.reset : "") + " Go.");
          preAnnounced = false;
          const result = await runPrescribedReps(ex);
          if (result === "abort") return finalize(false);
        } else {
          sess.timerSecs = work; sess.timerMax = work;
          setPhase("work");
          if (!preAnnounced) await speakAndWait(ex.name + "." + (ex.reset ? " " + ex.reset : "") + " Three, two, one, go.");
          preAnnounced = false;

          if (ex.eachSide) {
            const half = Math.floor(work / 2);
            sess.sideLabel = `${half}s first side`;
            const r3 = await countdown(half);
            if (r3 === "abort") return finalize(false);
            if (r3 !== "skip") {
              setPhase("sideswitch");
              await speakAndWait("Nice. Switch sides — five to reset.");
              const r4 = await countdown(SIDE_SWITCH_BUFFER);
              if (r4 === "abort") return finalize(false);
              if (r4 !== "skip") {
                sess.sideLabel = `${half}s second side`;
                setPhase("work");
                await speakAndWait(ex.name + " second side. Three, two, one, go.");
                const r5 = await countdown(half);
                if (r5 === "abort") return finalize(false);
              }
            }
            sess.sideLabel = "";
          } else {
            const r6 = await countdown(work);
            if (r6 === "abort") return finalize(false);
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
        }

        // ---------- REST ----------
        const isFinalEx =
          ci === circuits.length - 1 &&
          r === circuit.rounds &&
          ei === circuit.exercises.length - 1;

        if (!isFinalEx) {
          const upcomingEx = nextExercise(circuits, ci, r, ei);
          const isLastOfRound = ei === circuit.exercises.length - 1;
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
            const roundProgress = `Round ${r} done! You've got ${circuit.rounds - r} more to crush!`;
            await speakAndWait(roundProgress);
            if (voiceOn()) speakIfIdle("Did that feel different from the first round? Just ask yourself.");
            const leadTime = upcomingEx && HARD_EXERCISES.has(upcomingEx.name) ? 8 : 5;
            const result = await countdown(configuredRoundRest(), {
              onTick: (rem) => {
                if (rem === leadTime && upcomingEx) {
                  speakIfIdle("Get ready for " + upcomingEx.name + (upcomingEx.reset ? ". " + upcomingEx.reset : ""));
                }
              }
            });
            if (result === "abort") return finalize(false);
            if (result !== "skip" && voiceOn()) await speakAndWait(nextEncouragement());
          } else if (isBlockBreak) {
            playCue("rest");
            setPhase("sectionRest");
            await speakAndWait(`Block done! Next up: ${circuits[ci + 1].name}.`);
            const result = await countdown(configuredSectionRest(), {
              onTick: (rem) => {
                if (rem === 4 && upcomingEx) {
                  speakIfIdle("Get ready for " + upcomingEx.name + (upcomingEx.reset ? ". " + upcomingEx.reset : ""));
                }
              }
            });
            if (result === "abort") return finalize(false);
          } else {
            let restDuration = configuredExerciseRest();
            if (sess.justSkipped) restDuration = Math.max(restDuration, 4);
            sess.justSkipped = false;
            playCue("rest");
            sess.restCue = upcomingEx && upcomingEx.reset ? `Next: ${upcomingEx.reset}` : "Breathe and reset.";
            setPhase("rest");
            const nextName = upcomingEx ? upcomingEx.name : "";
            if (voiceOn()) await speakAndWait(nextName ? `Rest. Next: ${nextName}.` : "Rest.");
            let said = {};
            const result = await countdown(restDuration, {
              onTick: (rem) => {
                if (rem >= 1 && rem <= 3 && !said[rem]) { said[rem] = true; speak(String(rem)); }
              }
            });
            if (result === "abort") return finalize(false);
            if (result !== "skip") { speak("Go"); preAnnounced = true; }
          }
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
      if (circuit.block === "main") {
        const abs = roundNumber(circuit, r);
        commitRoundIfDone(ci, abs);
        logRoundShort(ci, abs);
      }
    }
    if (blockHadWork(ci)) sess.blocksCompleted += 1;
    recordBlockDone(circuit.block, ci);
  }

  // Swim-skill extras: micro-loop Q&A + breath rehearsal. These are TRAINING
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
  if (!nothingLeftOwed()) {
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

  syncClock();
  const elapsedSecs = sess.elapsed;
  const day = DAYS[sess.dayKey] || {};
  sess.endedEarly = !completed;

  // A pain stop is a safety event, not a short workout. It used to pay half a
  // session's XP and feed the streak, which rewards stopping the same way it
  // rewards training — exactly backwards.
  const safetyStop = !!sess.painFlag;

  const entry = {
    app: "swimming",
    athlete: athleteId(),      // the cloud mirror is shared; a restore filters on this
    dayKey: sess.dayKey,
    dayTitle: day.title || sess.dayKey,
    /* WHICH WORKOUT this record is a fragment of. A day trained in two goes
       writes two rows carrying the same id, and every report aggregates on it
       before counting anything — see workoutInstances in js/outcome.js. */
    workoutInstanceId: sess.workoutInstanceId || null,
    isoDate: new Date().toISOString(),
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
    clean: sess.cleanCount, wobbly: sess.wobblyCount,
    formChecks: sess.formChecks || [],       // per-move verdicts from this run's spot-checks
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
  const saved = saveSession(entry);
  // The RECORD, not a boolean. The finish screen has to say what the saved row
  // says — read back through outcomeOf, the same authority the parent reports
  // will use tomorrow — and it cannot do that from a `true`.
  sess.savedEntry = saved ? entry : null;
  sess.saveFailed = !saved;   // the complete screen must not claim a save that didn't happen
  sess.savedKey = saved ? sessionKey(entry) : null;
  logEvent(completed ? "session_complete" : "session_abort", {
    day: sess.dayKey, durationSecs: elapsedSecs,
    skipped: sess.skipped.length, pauses: sess.pauseCount || 0,
    pain: !!sess.painFlag
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
    fsAddSession(entry).then(id => { sess.fsId = id; flushCloudPatch(id); });
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
  if (!sess.running) return;
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

   Overlay holds ("instructions", "video") are deliberately NOT released here:
   their overlay is still open in front of her, and closing it is what says she
   is done reading. */
export function togglePause() {
  if (sess.paused) {
    resumeSession(PAUSE_HIDDEN);
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
  if (sess.phase === "reps" && sess.byRepsResolver) { sess.byRepsResolver("done"); return; }
  if (sess.phase === "intent" && sess.intentResolver) { sess.intentResolver(null); return; }
  if (sess.phase === "microloop" && sess.microResolver) { sess.microResolver(null); return; }
  if (["work", "rest", "roundRest", "sectionRest", "sideswitch", "getready", "greeting", "breath"].includes(sess.phase)) {
    sess.forceDone = true;   // running countdown/sleep resolves as "done" within 1s
    sess.forceDoneAt = Date.now();
    setTimeout(() => { sess.forceDone = false; }, 1200);
  }
}

export function skipCurrentExercise() {
  // During rests and prompts no exercise is underway — Skip there means
  // "skip the wait", not "log the exercise that just finished as skipped".
  if (!["work", "reps", "sideswitch"].includes(sess.phase)) { advance(); return; }
  if (sess.currentEx) {
    sess.skipped.push({ name: sess.currentEx.name, round: `R${sess.round}`, at: Date.now() });
    logEvent("skip", { ex: sess.currentEx.name, block: sess.currentEx.block || null });
  }
  sess.skipExercise = true;
  sess.justSkipped = true;
  if (sess.byRepsResolver) sess.byRepsResolver("skip");
  interruptSpeech("Okay, skipping — you've got the next one.");
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
export function endFromStop() {
  sess.stopOverlay = false;
  sess.painFlag = true;
  endEarly();
}
export function endEarly() {
  sess.confirmEnd = false;
  sess.abort = true;
  if (sess.byRepsResolver) sess.byRepsResolver("abort");
  if (sess.intentResolver) sess.intentResolver(null);
  if (sess.microResolver) sess.microResolver(null);
  if (sess.formResolver) sess.formResolver(null);
  // A stop confirmation is a SAFETY line: it is spoken even with the coach
  // muted, because "I stopped because it hurt" is the one thing she must hear
  // acknowledged.
  //
  // It is spoken ONCE, by speakSafety, and nothing may follow it. The line used
  // to be repeated through interruptSpeech, whose speech.cancel() killed the
  // safety utterance a moment after it started — so with the coach voice ON the
  // one cue that must never be lost was the one cue that was. speakSafety
  // already cancels whatever was mid-sentence before it speaks.
  speakSafety("Session stopped.");
}

export function pickIntentWord(word) { if (sess.intentResolver) sess.intentResolver(word); }
export function answerMicroLoop(answer) { if (sess.microResolver) sess.microResolver(answer); }
function recordFormCheck(clean) {
  if (sess.cleanCheckMove) sess.formChecks.push({ name: sess.cleanCheckMove, clean });
  sess.cleanCheckMove = null;
}
export function pickClean() {
  if (!sess.pendingCleanCheck) return;
  sess.cleanCount += 1; sess.lastWobbly = false;
  if (sess.formResolver) sess.formResolver(true);
  else { recordFormCheck(true); sess.pendingCleanCheck = false; }
  notify("phase");
}
export function pickWobbly() {
  if (!sess.pendingCleanCheck) return;
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
  if (sess.fsId) { import("./firebase.js").then(m => m.fsUpdateSession(sess.fsId, patch)); return; }
  _pendingCloudPatch = { ...(_pendingCloudPatch || {}), ...patch };
}

function flushCloudPatch(id) {
  if (!id || !_pendingCloudPatch) return;
  const patch = _pendingCloudPatch;
  _pendingCloudPatch = null;
  import("./firebase.js").then(m => m.fsUpdateSession(id, patch));
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
  stopElapsed();
  cancelSpeech();
  _pendingCloudPatch = null;
  Object.assign(sess, blankSession());
}
