/* ============================================================
   TIMING — the session with a coach that takes TIME to speak.
   Every other suite stubs speech to finish instantly, which is
   exactly why the announcement bugs lived so long: the lead-in
   charged as work, a Done tap during it thrown away, a second tap
   skipping the rest that followed. Here each spoken line takes
   three fake seconds.
   ============================================================ */
import { store, engine, data, svm, runSession } from "./harness.mjs";
import { newReadinessFlow, answerQuestion, setZoneSev, resetBodyCheck, mayStartFromReadiness, buildReadinessVM } from "../js/vm/readiness.js";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

/* A voice that starts at once and ends three seconds later on the FAKE clock —
   audio.js reaches for the global setTimeout at call time, which runSession
   has replaced. */
const SPEECH_MS = 3000;
globalThis.window.speechSynthesis.speak = (u) => {
  if (u && u.onstart) u.onstart();
  setTimeout(() => { if (u && u.onend) u.onend(); }, SPEECH_MS);
};
const voiceOn = () => store.updateSettings({ coachSpeechOn: true, coachVoiceOn: true, voiceStyle: "encouraging", audioSplitDone: true });

/* --- spoken dose --- */
const rep = data.X({ name: "Band Row", driver: "reps", dose: "8–10", block: "main" });
ok(engine.spokenDose(rep) === "8 to 10 reps", "a rep range is spoken as a range: " + engine.spokenDose(rep));
const side = data.X({ name: "Single-Arm Row", driver: "reps", dose: "8/side", block: "main" });
ok(engine.spokenDose(side) === "8 reps each side", "per-side reps say so: " + engine.spokenDose(side));
const sets = data.X({ name: "Hollow", driver: "reps", dose: "2×6", block: "main" });
ok(engine.spokenDose(sets) === "2 sets of 6 reps", "sets are spoken: " + engine.spokenDose(sets));
const timed = data.X({ name: "Plank", work: 40, dose: "40s", block: "main" });
ok(engine.spokenDose(timed) === "40 seconds", "a timed move says its seconds: " + engine.spokenDose(timed));
const each = data.X({ name: "Side Plank", work: 40, dose: "20s/side", block: "main", eachSide: true });
ok(engine.spokenDose(each) === "20 seconds each side", "each-side time is halved and said: " + engine.spokenDose(each));

/* --- 1. the lead-in is not charged as work, and Done during it starts the clock --- */
{
  let announced = null, tapped = false, phaseAfterTap = null, sawAnnounceExMs = null;
  const s = await runSession({ dayKey: "monday", light: "green", gateUnlocked: true, seed: voiceOn, limitMs: 3600000 }, {
    onTick: (ms, sess) => {
      if (sess.phase === "formcheck") engine.pickClean();
      if (sess.phase === "announce" && sess.currentEx && !sess.currentEx.byReps) {
        if (announced == null) { announced = sess.currentEx.name; sawAnnounceExMs = sess.exMs; }
        else if (announced !== sess.currentEx.name && !tapped) { tapped = sess.currentEx.name; engine.advance(); }
      }
      if (tapped && phaseAfterTap == null && sess.currentEx && sess.currentEx.name === tapped && sess.phase !== "announce") phaseAfterTap = { phase: sess.phase, ms };
      if (tapped && sess.ledger.some(r => r.name === tapped) && !sess.abort) engine.endEarly();
    }
  });
  ok(announced != null, "a timed move was announced in its own phase");
  ok(sawAnnounceExMs === 0, "nothing is charged to the move while the coach is speaking: " + sawAnnounceExMs);
  const row = s.ledger.find(r => r.name === announced);
  ok(row && row.actualSecs <= row.plannedSecs + 1, `a move done in full is recorded at its planned length, not plus the speech: ${row && row.actualSecs}/${row && row.plannedSecs}`);
  ok(tapped && phaseAfterTap && phaseAfterTap.phase === "work", "a Done tap during the announcement starts the clock: " + JSON.stringify(phaseAfterTap));
  const tappedRow = s.ledger.find(r => r.name === tapped);
  ok(tappedRow && tappedRow.status !== "skipped", "and the move is still hers to do — not skipped by the tap");
}

/* --- 2. a double tap ends one phase, not the rest that follows --- */
{
  let target = null, tappedAt = null, restSeen = 0, restEndedAt = null;
  await runSession({ dayKey: "monday", light: "green", gateUnlocked: true, seed: voiceOn, limitMs: 3600000 }, {
    onTick: (ms, sess) => {
      if (sess.phase === "formcheck") engine.pickClean();
      if (target == null && sess.phase === "work" && sess.currentEx && !sess.currentEx.eachSide && sess.timerSecs > 5) {
        target = sess.currentEx.name; tappedAt = ms;
        engine.advance();
        setTimeout(() => engine.advance(), 200);   // the second tap, 200 ms later
      }
      if (target && sess.phase === "rest" && sess.currentEx && sess.currentEx.name === target) restSeen++;
      if (target && restSeen && restEndedAt == null && sess.phase !== "rest" && sess.phase !== "formcheck") restEndedAt = ms;
      if (restEndedAt != null && !sess.abort) engine.endEarly();
    }
  });
  ok(target != null, "a timed move was double-tapped");
  ok(restSeen >= 2, "the rest after it still ran (seen on " + restSeen + " ticks) — the second tap did not skip it");
}

/* --- 3. the two exits from the STOP overlay --- */
{
  const stopped = await runSession({ dayKey: "monday", light: "green", gateUnlocked: true, limitMs: 3600000 }, {
    onTick: (ms, sess) => {
      if (sess.phase === "formcheck") engine.pickClean();
      if (sess.ledger.length >= 2 && !sess.stopOverlay && !sess.abort) { engine.openStopOverlay(); engine.endFromStopNoPain(); }
    }
  });
  ok(stopped.endedEarly === true && stopped.painFlag === false, "'I need to stop — nothing hurts' ends early without a pain flag");
  ok(stopped.savedEntry && stopped.savedEntry.safetyStop === false, "the record is not a safety stop");
  ok(stopped.xpEarned > 0, "and the work done is paid: " + stopped.xpEarned);

  const pain = await runSession({ dayKey: "monday", light: "green", gateUnlocked: true, limitMs: 3600000 }, {
    onTick: (ms, sess) => {
      if (sess.phase === "formcheck") engine.pickClean();
      if (sess.ledger.length >= 2 && !sess.stopOverlay && !sess.abort) { engine.openStopOverlay(); engine.endFromStop(); }
    }
  });
  ok(pain.painFlag === true && pain.xpEarned === 0, "'Stop — something hurts' is still the pain path: 0 XP");
}

/* --- 4. explore has no stop overlay --- */
{
  localStorage.clear(); store.migrate();
  engine.exitSession();
  const run = engine.startSession({ dayKey: "monday", mode: "explore" });
  engine.openStopOverlay();
  ok(engine.sess.stopOverlay === false && engine.sess.painFlag === false, "STOP does nothing in explore");
  engine.endEarly(); await run; engine.exitSession();
}

/* --- 5. a full reset forgets stray keys --- */
engine.sess.strayFlag = true;
engine.exitSession();
ok(!("strayFlag" in engine.sess), "exitSession deletes keys a run left behind");
ok(engine.sess.savedEntry === null, "and blankSession no longer carries duplicate keys (savedEntry starts null)");

/* --- 6. the round label on a resumed day --- */
Object.assign(engine.sess, { running: true, phase: "work", ci: 0, ei: 0, round: 3, dayRoundsPlanned: 3, bankedRounds: 1,
  circuits: [{ block: "main", name: "Main Circuit", rounds: 2, roundBase: 2, exercises: [{ name: "Dead Bug", dose: "8", byReps: true }] }],
  currentEx: { name: "Dead Bug", dose: "8", byReps: true }, exStatus: {}, ledger: [] });
const vm = svm.buildSessionVM({ isWide: true });
ok(vm.roundLabelText === "Round 3 of 3", "a resumed day labels the day's rounds, not the sitting's: " + vm.roundLabelText);
ok(vm.roundDots.length === 3 && /var\(--aqua\)/.test(vm.roundDots[2].style), "and the last dot is the active one");
engine.exitSession();

/* --- 7. retry cannot clear a severity-3 report, and no marks is not a dead end --- */
{
  const r = newReadinessFlow("monday");
  ["q_sleep", "q_light", "q_ready"].forEach(id => answerQuestion(r, id, "yes"));
  answerQuestion(r, "q_pain", "no");
  setZoneSev(r, 4, 3);
  ok(!mayStartFromReadiness(r), "a severity-3 knee needs a grown-up");
  resetBodyCheck(r);
  ok(!mayStartFromReadiness(r), "…and still does after 'retry' cleared the marks");
  setZoneSev(r, 4, 3); setZoneSev(r, 4, 0);
  ok(!mayStartFromReadiness(r), "…and after the mark is removed by hand");
  const v = buildReadinessVM(r, true);
  ok(v.showInlineBodyResult === true, "with every mark removed the result card is still shown");
  const fresh = newReadinessFlow("monday");
  ["q_sleep", "q_light", "q_ready"].forEach(id => answerQuestion(fresh, id, "yes"));
  answerQuestion(fresh, "q_pain", "no");
  setZoneSev(fresh, 2, 2);
  ok(mayStartFromReadiness(fresh), "a tired shoulder alone never needed one");
}

console.log("✓ timing passed (" + passed + " assertions)");
