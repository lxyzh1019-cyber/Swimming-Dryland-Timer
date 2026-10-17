/* RULES ROUND (Oct 2026): LEFT/RIGHT sides, recovery how-to tips, the half-rest
   lock (D14), No-Debt — only today's card trains (D13), and the valgus gate
   rule (D15). Nothing here names a sport, so it holds for both apps. */
import { engine, store, data, svm, sscreen, tvm, runSession } from "./harness.mjs";
import { sideNameOf, prescriptionSegments, normalizePrescription } from "../plan.js";
import { FEATURES } from "../sport.js";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

// 1. Rep moves: left first, named by side word.
const legs = normalizePrescription({ reps: 6, sides: 2, sideWord: "leg" });
ok(sideNameOf(legs, 1) === "left leg" && sideNameOf(legs, 2) === "right leg", "rep sides are left leg, then right leg");
ok(prescriptionSegments(legs).map(s => s.sideName).join(",") === "left leg,right leg", "segments carry the side name");

// 2. Timed per-side moves: the ring says LEFT SIDE, then RIGHT SIDE.
{
  const words = new Set(), said = [];
  await runSession({ dayKey: "sunday", light: "recovery", seed: () => store.updateSettings({ coachSpeechOn: true, voiceStyle: "classic" }) }, { onTick: (ms, s) => {
    if (s.phase === "tightcheck") engine.answerTight("loose");
    if (s.phase === "repcheck") engine.answerRepCheck("all");
    if (s.phase === "work" && s.currentEx && s.currentEx.eachSide) words.add(svm.buildSessionVM({ isWide: true }).timerSideWord);
    if (s.phase === "work" && s.currentEx && s.currentEx.eachSide) { const v = svm.buildSessionVM({ isWide: true }); const h = sscreen.sessionScreen(v); const m = h.match(/data-side-big[^>]*>([^<]+)</); if (m) words.add("BIG:" + m[1]); }
    if (s.phase === "work" && s.currentEx && s.currentEx.eachSide && s.announceResolver) words.add("ANN:" + svm.buildSessionVM({ isWide: true }).timerSideWord);
  } });
  ok(words.has("LEFT SIDE") && words.has("RIGHT SIDE"), "the ring names LEFT SIDE and RIGHT SIDE on a timed per-side move");
  ok(!words.has("FIRST SIDE") && !words.has("SECOND SIDE"), "and never FIRST / SECOND");
  ok(words.has("BIG:LEFT") && words.has("BIG:RIGHT"), "the ring shows a big LEFT, then a big RIGHT");
  const ann = [...words].filter(w => w.startsWith("ANN:"));
  ok(ann.length > 0 && ann.every(w => w !== "ANN:"), "the side shows in the ring while the coach is announcing it");
}

// 3. Recovery tips are how-to cues, not planning notes.
const rec = engine.assembleRecoveryCircuit("sunday")[0].exercises;
ok(rec.filter(e => /lands here|Power days|absorption|down-regulated|volume/i.test(e.cue || "")).length === 0,
   "no recovery COACH TIP is a planning note");

// 4. D14: the first half of a rest can't be skipped.
{
  let lockedTap = false, openTap = false, talkLabel = "", restEnd = 0, tapAt = 0;
  await runSession({ dayKey: "monday", light: "red" }, { onTick: (ms, s) => {
    if (s.phase === "formcheck") engine.pickClean();
    if (s.phase === "repcheck") engine.answerRepCheck("all");
    if (s.phase === "rest" && s.timerMax > 4) {
      const vm = svm.buildSessionVM({ isWide: true });
      if (engine.restLockedSecs() === Infinity && !talkLabel) talkLabel = vm.doneLabel;
      if (engine.restLockedSecs() > 0 && !lockedTap) { lockedTap = vm.doneLocked && /^Resting… \d+$/.test(vm.doneLabel); }
      if (engine.restLockedSecs() === 0 && !openTap) { openTap = vm.doneLabel === "⏭ I'm ready" && !vm.doneLocked; }
    }
  } });
  ok(lockedTap, "the first half of a rest shows Resting… N and is locked");
  ok(openTap, "after half-way it opens as ⏭ I'm ready");
  ok(talkLabel === "" || talkLabel === "Resting…", "while the coach is still talking the button says Resting… with no made-up number");
}

// 5. D13: only today's card trains — a missed or coming day offers no GO.
{
  store.migrate();
  const days = data.WEEK_ORDER.filter(k => !data.DAYS[k].spa);
  let goOther = 0;
  days.forEach(k => {
    const dv = tvm.buildTodayVM({ selectedDay: k, expanded: {}, isWide: true }).dayView;
    if ((dv.isMissed || dv.isPreview) && dv.showCta && dv.ctaAction === "goSession") goOther++;
  });
  ok(goOther === 0, "no missed or coming day offers a GO");
}

// 6. D15: the gate opens only after 2 weeks in a row of >= 5 landings, all clean.
if (FEATURES.valgusGate !== false) {
  localStorage.clear(); store.migrate();
  const L = (iso, clean, wobbly = 0) => store.creditValgusWeek({ isoDate: iso, landings: { [store.GATE_MOVE]: { clean, wobbly } } });
  ok(L("2026-05-05T10:00:00.000Z", 5).unlocked === false, "one clean week is not an unlock");
  ok(L("2026-05-12T10:00:00.000Z", 5, 1).unlocked === false, "a wobbly landing spoils the second week");
  ok(L("2026-05-19T10:00:00.000Z", 5).unlocked === false, "a spoiled week breaks the run");
  ok(L("2026-05-26T10:00:00.000Z", 6).unlocked === true, "2 clean weeks in a row open it");
}
ok(typeof store.GATE_LANDINGS_PER_WEEK === "number" && store.GATE_LANDINGS_PER_WEEK === 5, "a week needs 5 graded landings");

console.log("✓ rules round passed (" + passed + " assertions)");
