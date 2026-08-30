/* ============================================================
   SESSION ENGINE — port of the old app's async/await runner
   (speak-then-count sequencing, eachSide side-switch, intent
   word, clean-check, skip/pause/stop, valgus earn-back). The old
   DOM setters are replaced by mutations of the exported `sess`
   view-state + notify() callbacks:
     notify("phase") → full session-screen re-render
     notify("tick")  → targeted per-second DOM writes only
   ============================================================ */

import { DAYS, BLOCK_ORDER, BLOCK_LABEL, LIGHT_ROUNDS, SIDE_SWITCH_BUFFER, INTENT_WORDS, MICRO_LOOP, BREATH_REHEARSAL, MANTRA, exWork, exRepsDetail } from "./data.js";
import { settings, configuredExerciseRest, configuredRoundRest, configuredSectionRest, saveSession, logEvent, loadDayProgress, saveDayProgress, clearDayProgress, loadGate, saveGate, addSkipRecord, addXp, pendingDrawCount, xpForSession, athleteId, noteSessionXpAwarded, patchSession, sessionKey, XP_VERSION, clearTryIt } from "./store.js";
import { speak, speakIfIdle, speakAndWait, interruptSpeech, cancelSpeech, nextEncouragement, beep, endBeep, playCue, ensureAudio, voiceOn } from "./audio.js";
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
    running: false, paused: false, abort: false, skipExercise: false, forceDone: false, forceDoneAt: 0,
    byRepsResolver: null, intentResolver: null, microResolver: null,
    currentEx: null, skipped: [], perExercise: [], justSkipped: false,
    phase: "greeting",           // greeting|getready|work|reps|sideswitch|rest|roundRest|sectionRest|intent|microloop|breath|done
    circuits: [], ci: 0, ei: 0, round: 1, exDone: 0,
    timerSecs: 0, timerMax: 0, urgent: false,
    exElapsed: 0, elapsed: 0, pausedSecs: 0, plannedSecs: 0,
    upNextName: "", upNextDose: "", restCue: "",
    stopOverlay: false, confirmEnd: false, painFlag: false,
    pendingCleanCheck: false, cleanCount: 0, wobblyCount: 0, lastWobbly: false,
    intentWord: null, microLoop: null,
    exStatus: {},                // "ci-ei" -> done|skipped
    roundsCompleted: 0, sideLabel: "",
    dayKey: null, light: "green", practice: false, mini: false, spa: false,
    endedEarly: false, xpEarned: 0, leveledUp: false,
    mood: null, wentWell: null, nextTime: null, quizPick: null, quizXp: 0,
    savedEntry: false, saveFailed: false, savedKey: null, fsId: null
  };
}

let notify = () => {};
export function onSessionUpdate(fn) { notify = fn; }

/* ---- circuits assembly (2026.2 block model) ---- */
export function assembleCircuits(dayKey, light, opts = {}) {
  const day = DAYS[dayKey];
  if (!day) return [];
  if (day.spa) {
    const menu = (day.recovery || []).map(r => {
      const { secs, eachSide } = recoveryDoseSecs(r.dose);
      return { name: r.name, block: "recovery", driver: "time", work: secs,
        dose: r.dose, cue: r.why, eachSide, rest: 3 };
    });
    return [{ name: "Recovery", block: "recovery", rounds: 1,
      exercises: menu.concat(day.recoveryHolds || []) }];
  }
  const rounds = Math.max(1, LIGHT_ROUNDS[light] || 1);
  const skipBlocks = opts.skip || [];
  const circuits = [];
  const order = opts.mini ? ["warmup", "main"] : BLOCK_ORDER;
  order.forEach(bk => {
    if (skipBlocks.includes(bk)) return;
    let exs = (day.blocks[bk] || []).slice();
    // Standing rule: jump rope hidden on double-pool days.
    if (bk === "warmup" && day.poolLoad === "double") {
      exs = exs.filter(ex => !/jump rope/i.test(ex.name));
    }
    if (!exs.length) return;
    circuits.push({ name: BLOCK_LABEL[bk], block: bk,
      rounds: bk === "main" && !opts.mini ? rounds : 1, exercises: exs });
    if (bk === "main" && !opts.mini && day.prepMenu && day.prepMenu.length && !skipBlocks.includes("prep")) {
      circuits.push({ name: BLOCK_LABEL.prep, block: "prep", rounds: 1, exercises: day.prepMenu });
    }
  });
  return circuits;
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
          const m = (ex.repsDetail || "").match(/(\d+)\s*(?:reps?|steps?|alternating)/i)
                 || (ex.repsDetail || "").match(/(\d+)/);
          const reps = m ? parseInt(m[1], 10) : 10;
          const detail = ex.repsDetail || "";
          const multiplier = /each direction/i.test(detail) ? 4 : (/each side|per side|\/side/i.test(detail) ? 2 : 1);
          total += reps * (settings.secondsPerRep || 3) * multiplier;
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

/* ---- reps voice intelligence (ported) ---- */

const TEMPO_PATTERN = /(\d)-(\d)-(\d)/;
function repCount(ex, fallback) {
  const m = (ex.repsDetail || "").match(/(\d+)\s*reps?/i);
  return m ? parseInt(m[1]) : fallback;
}
function getExercisePattern(ex) {
  const m = (ex.repsDetail || "").match(TEMPO_PATTERN);
  if (m) {
    return { count: repCount(ex, 10), phases: [
      { word: "Up",   secs: parseInt(m[1]), freq: 660 },
      { word: "Hold", secs: parseInt(m[2]), freq: 880 },
      { word: "Down", secs: parseInt(m[3]), freq: 440 }
    ]};
  }
  const name = ex.name;
  if (/glute bridge/i.test(name)) return { count: 12, phases: [
    { word: "Up", secs: 2, freq: 660 }, { word: "Hold", secs: 1, freq: 880 }, { word: "Down", secs: 2, freq: 440 } ]};
  if (/dead bug/i.test(name)) return { count: 10, phases: [
    { word: "Extend", secs: 2, freq: 660 }, { word: "Return", secs: 2, freq: 440 } ]};
  if (/bird dog/i.test(name)) return { count: 10, phases: [
    { word: "Extend", secs: 1, freq: 660 }, { word: "Hold", secs: 5, freq: 880 }, { word: "Return", secs: 1, freq: 440 } ]};
  return null;
}
function buildVoiceCues(ex) {
  const repMatch = (ex.repsDetail || "").match(/(\d+)\s*reps?/i);
  const count = repMatch ? parseInt(repMatch[1]) : 10;
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

const CADENCE_PATTERN = /\d+s\s+(?:up|open|raise)/i;
export function screenRepsDetail(ex) {
  const detail = exRepsDetail(ex) || ex.dose;
  if (!(ex.byReps && CADENCE_PATTERN.test(ex.repsDetail || ""))) return detail;
  const m = detail.match(/^(\d+\s+reps?)/i);
  return m ? m[1] : detail.replace(/·.*$/, "").trim();
}

async function runTempoLoop(ex, pattern, isDone) {
  const phaseDefs = pattern.phases;
  async function tempoSleep(ms) {
    const start = Date.now();
    let pausedMs = 0;
    while (true) {
      if (isDone() || sess.abort || sess.skipExercise) return "interrupt";
      if (sess.paused) { pausedMs += 100; }
      else if (Date.now() - start - pausedMs >= ms) return "done";
      await new Promise(r => setTimeout(r, 100));
    }
  }
  for (let i = 1; i <= pattern.count; i++) {
    for (let p = 0; p < phaseDefs.length; p++) {
      const ph = phaseDefs[p];
      if (ph.secs <= 0) continue;
      if (isDone()) return;
      while (sess.paused && !isDone()) { await new Promise(r => setTimeout(r, 200)); }
      if (isDone()) return;
      speak(p === 0 ? `${i}. ${ph.word}` : ph.word);
      beep(ph.freq, 0.1);
      for (let s = 1; s < ph.secs; s++) {
        if (await tempoSleep(1000) === "interrupt") return;
        beep(ph.freq, 0.08);
      }
      if (await tempoSleep(1000) === "interrupt") return;
    }
  }
}

async function runRepsWithVoice(ex) {
  const pattern = getExercisePattern(ex);
  const cues = pattern ? null : buildVoiceCues(ex);
  let cueDone = false;

  const donePromise = new Promise(resolve => {
    const watchdog = setInterval(() => {
      if (sess.abort || sess.skipExercise) {
        clearInterval(watchdog);
        const r = sess.byRepsResolver;
        if (r) { sess.byRepsResolver = null; r(sess.abort ? "abort" : "skip"); }
      }
    }, 200);
    sess.byRepsResolver = (result) => {
      clearInterval(watchdog);
      cueDone = true;
      sess.byRepsResolver = null;
      cancelSpeech();   // in-flight speech resolves fast after DONE
      resolve(result);
    };
  });

  const voiceLoop = !voiceOn() ? Promise.resolve()
    : pattern
    ? runTempoLoop(ex, pattern, () => cueDone)
    : (async () => {
        for (const cue of cues) {
          if (cueDone) break;
          while (sess.paused && !cueDone) { await new Promise(r => setTimeout(r, 200)); }
          if (cueDone) break;
          await speakAndWait(cue);
          if (cueDone) break;
        }
      })();

  const result = await donePromise;
  cueDone = true;
  await voiceLoop;
  return result;
}

/* ---- elapsed clock ---- */
let elapsedInterval = null;
function startElapsed() {
  sess.elapsed = 0; sess.pausedSecs = 0;
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    if (!sess.running) return;
    if (sess.paused) { sess.pausedSecs += 1; return; }
    sess.elapsed += 1;
    if (sess.phase === "reps" || sess.phase === "work") sess.exElapsed += 1;
    notify("tick");
  }, 1000);
}
function stopElapsed() {
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

function recordBlockDone(blockKey) {
  if (!blockKey || blockKey === "prep" || sess.practice) return;
  const prog = loadDayProgress(sess.dayKey) || { done: [], light: sess.light };
  if (!prog.done.includes(blockKey)) prog.done.push(blockKey);
  prog.light = sess.light;
  saveDayProgress(sess.dayKey, prog);
}

/* ---- intent word / micro-loop prompts (UI resolves via resolvers) ---- */
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
export async function startSession({ dayKey, light = "green", practice = false, mini = false }) {
  if (sess.running) return;
  ensureAudio();
  const day = DAYS[dayKey];
  if (!day) return;

  Object.assign(sess, blankSession(), {
    running: true, dayKey, practice, mini,
    light: day.spa ? "recovery" : light,
    spa: !!day.spa
  });

  // Same-day resume: blocks already completed today are skipped.
  const prog = practice ? null : loadDayProgress(dayKey);
  const skipBlocks = (prog && prog.done) || [];
  sess.circuits = assembleCircuits(dayKey, sess.light, { mini, skip: sess.spa ? [] : skipBlocks });
  if (!sess.circuits.length) { sess.running = false; return; }
  sess.plannedSecs = estimateSessionSecs(sess.circuits) + 8;

  if (!practice) logEvent("session_start", { day: dayKey, light: sess.light });

  const circuits = sess.circuits;
  const dayMantra = day.mantra || MANTRA;
  const lightLabel = { green: "GREEN, 3 rounds", yellow: "YELLOW, 2 rounds",
    red: "RED, 1 round", recovery: "recovery only" }[sess.light] || "";
  const firstEx = circuits[0].exercises[0].name;

  setPhase("greeting");
  playCue("work");
  if (sess.spa) {
    await speakAndWait("Spa Sunday. Easy recovery, slow and gentle.");
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
        sess.ci = ci; sess.ei = ei; sess.round = r;
        sess.exElapsed = 0;
        setUpNext(circuits, ci, r, ei);

        // ---------- WORK ----------
        const work = ex.byReps ? 0 : exWork(ex);
        playCue("work");
        if (ex.byReps) {
          setPhase("reps");
          if (!preAnnounced) await speakAndWait(ex.name + "." + (ex.reset ? " " + ex.reset : "") + " Go.");
          preAnnounced = false;
          const result = await runRepsWithVoice(ex);
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
        if (wasSkipped) sess.exStatus[key] = "skipped";
        else if (r === circuit.rounds) sess.exStatus[key] = "done";
        if (r === 1) {
          sess.perExercise.push({
            name: ex.name,
            block: ex.block || circuit.block,
            driver: ex.driver || (ex.byReps ? "reps" : "time"),
            dose: ex.dose || ex.repsDetail || "",
            gate: ex.gate || null,
            skipped: !!wasSkipped
          });
        }
        // Design's clean/wobbly self-check after main-block work, answered during rest.
        if ((circuit.block === "main" || circuit.block === "prep") && !wasSkipped) {
          sess.pendingCleanCheck = true;
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
            if (circuit.block === "main" && r === 1 && !sess.intentWord && !sess.spa) {
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
            sess.roundsCompleted += 1;
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
      if (r === circuit.rounds && circuit.rounds > 1) sess.roundsCompleted += 1;
    }
    if (circuit.rounds === 1) sess.roundsCompleted += 1;
    recordBlockDone(circuit.block);
  }

  // Swim-skill extras: micro-loop Q&A + breath rehearsal (skipped on spa days)
  if (!sess.spa) {
    await microLoopPrompt();
    if (sess.abort) return finalize(false);
    setPhase("breath");
    await speakAndWait("Breath rehearsal. Exhale face down, hum, turn, quick sip, turn back.");
    await sleep(1500);
    if (sess.abort) return finalize(false);
  }

  if (!sess.practice) clearDayProgress(sess.dayKey);
  finalize(true);
}

/* ============================================================
   FINALIZATION — ended-early sessions are now RECORDED
   ("your progress is saved"), with endedEarly + pain flags.
   ============================================================ */
export function finalize(completed) {
  sess.running = false;
  sess.paused = false;
  sess.abort = false;
  sess.stopOverlay = false;
  sess.confirmEnd = false;
  cancelSpeech();
  stopElapsed();

  const elapsedSecs = sess.elapsed;
  const day = DAYS[sess.dayKey] || {};
  sess.endedEarly = !completed;

  if (sess.practice) {
    // Pain is the one thing that escapes the try-it sandbox. A stop she reported
    // is real whether or not the run counted, and it used to vanish entirely —
    // never reaching the grown-up's Safety & Flags. This writes a safety-only
    // row: flagged practice, so countsAsTrained() and sessionXp() both ignore
    // it, and no streak, XP or completion comes with it.
    if (sess.painFlag) {
      saveSession({
        app: "swimming", athlete: athleteId(), practice: true,
        dayKey: sess.dayKey, dayTitle: day.title || sess.dayKey,
        isoDate: new Date().toISOString(), durationSecs: elapsedSecs,
        sessionType: "try-it", pain: true, endedEarly: true, completedFully: false,
        safetyOnly: true
      });
      logEvent("pain_stop_tryit", { day: sess.dayKey });
    }
    clearTryIt();                 // one run, then the mode disarms itself
    if (completed) speak("Practice run complete. Nothing recorded. You know the movements now.");
    playCue("done");
    setPhase("done");
    return;
  }

  const entry = {
    app: "swimming",
    athlete: athleteId(),      // the cloud mirror is shared; a restore filters on this
    dayKey: sess.dayKey,
    dayTitle: day.title || sess.dayKey,
    isoDate: new Date().toISOString(),
    durationSecs: elapsedSecs,
    session: "morning",
    planVersion: "2026.2",
    xpVersion: XP_VERSION,     // marks a row whose XP counted the rounds trained
    sessionType: sess.spa ? "spa" : "main",
    lightResult: sess.spa ? "recovery" : sess.light,
    roundsDone: sess.spa ? 0 : Math.max(1, LIGHT_ROUNDS[sess.light] || 1),
    perExercise: sess.perExercise || [],
    microLoop: sess.microLoop || null,
    intentWord: sess.intentWord || null,
    prSentinel: sess.spa ? null : day.prSentinel || null,
    skippedCount: sess.skipped.length,
    pauseCount: sess.pauseCount || 0,
    pausedSecs: sess.pausedSecs,
    plannedSecs: sess.plannedSecs,
    clean: sess.cleanCount, wobbly: sess.wobblyCount,
    light: sess.light, mini: sess.mini,
    pain: !!sess.painFlag,
    endedEarly: !completed,
    completedFully: !!completed
  };
  const saved = saveSession(entry);
  sess.savedEntry = saved;
  sess.saveFailed = !saved;   // the complete screen must not claim a save that didn't happen
  sess.savedKey = saved ? sessionKey(entry) : null;
  logEvent(completed ? "session_complete" : "session_abort", {
    day: sess.dayKey, durationSecs: elapsedSecs,
    skipped: sess.skipped.length, pauses: sess.pauseCount || 0,
    pain: !!sess.painFlag
  });

  // Valgus earn-back: a clean (non-skipped) Drop-and-Stick session counts toward unlock.
  if (completed && (sess.perExercise || []).some(p => p.name === "Drop-and-Stick" && !p.skipped)) {
    const g = loadGate();
    g.cleanCount = (g.cleanCount || 0) + 1;
    saveGate(g);
  }
  if (sess.skipped.length) {
    addSkipRecord({
      createdAt: Date.now(),
      sessionDate: new Date().toISOString(),
      sessionType: sess.spa ? "spa" : "main",
      skippedItems: sess.skipped
    });
  }

  // XP: full completion earns move XP; ended-early earns half; spa earns none.
  const fullXp = xpForSession(entry);
  sess.xpEarned = completed ? fullXp : Math.round(fullXp / 2);
  if (sess.xpEarned > 0) {
    const { leveledUp } = addXp(sess.xpEarned);
    // Only celebrate a level-up that actually owes a prize, so the button can
    // never be a dead tap (openPrizeDraw refuses when nothing is pending).
    sess.leveledUp = leveledUp && pendingDrawCount() > 0;
    noteSessionXpAwarded(sess.xpEarned);
    patchSession(sess.savedKey, { xpEarned: sess.xpEarned });
  }

  // Cloud mirror — keep the doc ID so mood/reflection can patch it later.
  // Opt-out via Grown-up settings (privacy): when off, data stays on-device only.
  if (settings.cloudMirror !== false) fsAddSession(entry).then(id => { sess.fsId = id; });

  if (completed) {
    playCue("done");
    speak("Training complete. Fantastic effort.");
  }
  setPhase("done");
}

/* ============================================================
   CONTROLS (called from the UI action layer)
   ============================================================ */
export function togglePause() {
  sess.paused = !sess.paused;
  if (sess.paused) sess.pauseCount = (sess.pauseCount || 0) + 1;
  if (!sess.practice) logEvent(sess.paused ? "pause" : "resume", { ex: sess.currentEx ? sess.currentEx.name : null });
  interruptSpeech(sess.paused ? "Paused." : "Resuming.");
  notify("phase");
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
    if (!sess.practice) logEvent("skip", { ex: sess.currentEx.name, block: sess.currentEx.block || null });
  }
  sess.skipExercise = true;
  sess.justSkipped = true;
  if (sess.byRepsResolver) sess.byRepsResolver("skip");
  interruptSpeech("Okay, skipping — you've got the next one.");
}

export function openStopOverlay() {
  sess.stopOverlay = true;
  sess.paused = true;
  cancelSpeech();
  notify("phase");
}
export function resumeFromStop() {
  sess.stopOverlay = false;
  sess.paused = false;
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
  interruptSpeech("Session stopped.");
}

export function pickIntentWord(word) { if (sess.intentResolver) sess.intentResolver(word); }
export function answerMicroLoop(answer) { if (sess.microResolver) sess.microResolver(answer); }
export function pickClean() { sess.pendingCleanCheck = false; sess.cleanCount += 1; sess.lastWobbly = false; notify("phase"); }
export function pickWobbly() { sess.pendingCleanCheck = false; sess.wobblyCount += 1; sess.lastWobbly = true; notify("phase"); }

/* Complete-screen interactions: patch the saved record + Firestore mirror. */
export function setMood(key, emoji) {
  sess.mood = key;
  if (!sess.practice && sess.savedEntry) {
    patchSession(sess.savedKey, { mood: key });
    if (sess.fsId) import("./firebase.js").then(m => m.fsUpdateSession(sess.fsId, { mood: key }));
  }
  notify("phase");
}
export function setReflect(field, label) {
  sess[field] = sess[field] === label ? null : label;
  if (!sess.practice && sess.savedEntry) {
    const patch = field === "wentWell" ? { wentWell: sess.wentWell } : { nextTime: sess.nextTime };
    patchSession(sess.savedKey, patch);
    if (sess.fsId) import("./firebase.js").then(m => m.fsUpdateSession(sess.fsId, patch));
  }
  notify("phase");
}
export function setQuizPick(i) { sess.quizPick = i; notify("phase"); }

/* Full reset before Today re-renders (guards double-running timers). */
export function exitSession() {
  stopElapsed();
  cancelSpeech();
  Object.assign(sess, blankSession());
}
