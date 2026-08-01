/* ============================================================
   SESSION view-model — derives the design's session-screen
   values from the engine's `sess` view-state.
   ============================================================ */

import { sess, refTime, screenRepsDetail } from "../engine.js";
import { DAYS, CHEERS, INTENT_WORDS, MICRO_LOOP, BREATH_REHEARSAL, exWork, videoSearchUrl } from "../data.js";
import { fmtMMSS, exercisePhotoUrl } from "../util.js";
import { loadSessions } from "../store.js";

const MOOD_DEFS = [
  { key: "great", emoji: "😀", label: "Great" },
  { key: "okay",  emoji: "🙂", label: "Okay" },
  { key: "tired", emoji: "😴", label: "Tired" }
];
// Acknowledge the reported mood instead of silently recording it — especially a
// tired day, which deserves a caring, regulation-modeling response.
const MOOD_ACK = {
  great: "Love that energy! 💙 Remember this feeling.",
  okay:  "Showing up on an okay day still counts. Nice.",
  tired: "Thanks for telling me — tired is real. Rest well, drink water, and tell a grown-up if it sticks around. 💙"
};
const REFLECT_WELL = ["My breathing", "Strong holds", "Clean form", "Staying focused"];
const REFLECT_NEXT = ["Slow down", "Breathe out loud", "Point my toes", "Keep core tight"];

// Coach's Quiz — connects today's land work to the pool.
const QUIZ = [
  { q: "Why do we practice Superman holds on land?", why: "A strong Superman hold = a strong streamline off every wall.", opts: [
    { t: "To get better at flying", ok: false },
    { t: "To build a long, tight streamline for push-offs", ok: true },
    { t: "To make our arms tired", ok: false } ] },
  { q: "Squats make your legs stronger. Where does that power show up in the pool?", why: "Every start and turn is a jump — leg power is pool speed.", opts: [
    { t: "Faster starts and turns off the block and wall", ok: true },
    { t: "Comfier goggles", ok: false },
    { t: "Louder splashing", ok: false } ] },
  { q: "Why does Coach say “slow and clean beats fast and sloppy”?", why: "Your body learns the shape you practice — so practice the good one.", opts: [
    { t: "Because slow is easier", ok: false },
    { t: "Clean shapes on land become clean strokes in the water", ok: true },
    { t: "So the timer lasts longer", ok: false } ] },
  { q: "Why do we brace our core (like a strong tube) during land work?", why: "A braced core stops your middle from bending, so your push and pull don't leak power.", opts: [
    { t: "So you can hold your breath longer", ok: false },
    { t: "A stiff middle sends leg and arm power straight down the pool", ok: true },
    { t: "To look tough", ok: false } ] },
  { q: "Balance moves (like Single-Leg Balance) — what do they build for swimming?", why: "Steady hips and ankles keep your body straight and long instead of wobbling and slowing down.", opts: [
    { t: "A stable, straight body line that glides instead of wobbles", ok: true },
    { t: "Bigger splashes", ok: false },
    { t: "Faster blinking", ok: false } ] },
  { q: "Why do we point our toes in kicking-shape drills on land?", why: "Pointed toes make your foot a longer paddle, so each kick pushes more water.", opts: [
    { t: "It looks like ballet", ok: false },
    { t: "Pointed feet act like paddles — more push per kick", ok: true },
    { t: "It keeps your socks on", ok: false } ] }
];

/* The day's Coach's Quiz question. Rotates as the training log grows (not fixed
   per weekday), so the completion quiz stays fresh instead of repeating. Both
   this VM and main.js call it with the same dayKey during the done screen, so
   the displayed question and the XP-awarding question always match. */
export function sessionQuizFor(dayKey) {
  const n = (dayKey ? String(dayKey).length : 0) + loadSessions().length;
  return QUIZ[n % QUIZ.length];
}

export function buildSessionVM(state) {
  const circuits = sess.circuits || [];
  const circuit = circuits[sess.ci] || { exercises: [], rounds: 1, name: "", block: "main" };
  const ex = sess.currentEx || {};
  const phase = sess.phase;

  const sessionDone = phase === "done";
  const isResting = phase === "rest" || phase === "roundRest" || phase === "sectionRest";
  const isPrompt = phase === "intent" || phase === "microloop" || phase === "breath";
  const isBigRest = phase === "roundRest" || phase === "sectionRest";
  const timerIsReps = phase === "reps";
  const timerIsTime = !timerIsReps && !isPrompt;

  const bzMap = { warmup: "warmup", coordination: "work", main: "work", prep: "work", finisher: "rest", swimskill: "rest", recovery: "rest" };
  const pzMap = { work: bzMap[circuit.block] || "work", rest: "rest", roundRest: "evening", sectionRest: "evening", sideswitch: "rest", getready: "warmup", greeting: "warmup", breath: "rest" };
  const timerZoneType = pzMap[phase] || "work";
  const timerZone = ({ work: "WORK", rest: "REST", roundRest: "ROUND REST", sectionRest: "SECTION REST",
    sideswitch: "SWITCH", getready: "READY", greeting: "READY", breath: "BREATHE" })[phase] || "WORK";
  const timerUrgent = sess.urgent && phase !== "roundRest" && phase !== "sectionRest";

  const bvMap = { warmup: "sun", coordination: "sun", main: "aqua", prep: "grape", finisher: "mint", swimskill: "sea", recovery: "grape" };
  const blockBadgeVariant = bvMap[circuit.block] || "aqua";
  const blockLabel = ({ warmup: "Warm-Up 🔥", coordination: "Coordination ⚡", main: "Main Circuit 💪",
    prep: "Prep Pair 🎯", finisher: "Finisher 🏁", swimskill: "Swim-Skill 🏊", recovery: "Recovery ❄️" })[circuit.block] || circuit.name || "";
  const roundLabelText = circuit.block === "main" && circuit.rounds > 1 ? ("Round " + sess.round + " of " + circuit.rounds) : "";

  const stageTitle =
    phase === "greeting" ? "Ready?" :
    phase === "getready" ? "Get ready…" :
    phase === "sideswitch" ? "Switch sides" :
    phase === "sectionRest" ? "Section Done! 🎉" :
    phase === "roundRest" ? "Round Done! 💪" :
    phase === "rest" ? "Quick Rest" :
    phase === "breath" ? "Breath rehearsal" :
    (ex.name || "");

  const curExDose = timerIsReps ? (screenRepsDetail(ex) || ex.dose || "") : (sess.sideLabel || ex.dose || "");
  const curPlanned = refTime(ex);
  const curActual = timerIsReps ? sess.exElapsed : Math.max(0, (sess.timerMax || 0) - (sess.timerSecs || 0));
  const exOver = curActual > curPlanned + 2;
  const paceColor = exOver ? "var(--sun-ink)" : "var(--aqua)";

  // Per-section progress + whole-session pacing. exDone counts every
  // completed exercise in every round, so the bar actually reaches 100%
  // (exStatus keys are per-exercise and top out below rounds × exercises).
  const totalExCount = circuits.reduce((acc, c) => acc + c.exercises.length * c.rounds, 0);
  const doneCount = sess.exDone || 0;
  const secNames = { warmup: "Warm-Up", coordination: "Coordination", main: "Main", prep: "Prep", finisher: "Finisher", swimskill: "Swim-Skill", recovery: "Recovery" };
  const progressLabel = (secNames[circuit.block] || "") + " · " + Math.min(sess.ei + 1, circuit.exercises.length) + " of " + circuit.exercises.length;
  const sessionTimePct = Math.min(100, Math.round(sess.elapsed / Math.max(1, sess.plannedSecs) * 100));
  const roundLine = (circuit.rounds || 1) > 1 ? ((circuit.name || "") + " · Round " + sess.round + " of " + circuit.rounds) : "";
  const roundDots = (circuit.rounds || 1) > 1 ? Array.from({ length: circuit.rounds }, (_, i) => ({
    style: "width:10px;height:10px;border-radius:50%;flex-shrink:0;" + (i < sess.round - 1 ? "background:var(--mint);" : (i === sess.round - 1 ? "background:var(--aqua);" : "background:var(--surface-2);border:1.5px solid var(--hairline);box-sizing:border-box;"))
  })) : [];

  // Exercise timeline (left pane list)
  const BLOCK_COLORS = { warmup: "var(--coral)", coordination: "var(--sun-ink)", main: "var(--sea)", prep: "var(--grape)", finisher: "var(--mint-ink)", swimskill: "var(--aqua-ink)", recovery: "var(--grape)" };
  const sessionExList = [];
  circuits.forEach((c, ci) => {
    sessionExList.push({ isHeader: true, name: c.name + (c.rounds > 1 ? ` ×${c.rounds}` : ""), color: BLOCK_COLORS[c.block] || "var(--ink-soft)" });
    c.exercises.forEach((e, ei) => {
      const st = sess.exStatus[ci + "-" + ei];
      const isCur = sess.running && ci === sess.ci && ei === sess.ei && !sessionDone;
      sessionExList.push({
        isEx: true, num: ei + 1, name: e.name, ci, ei,
        cardStyle: "display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:12px;margin:2px 0;box-sizing:border-box;"
          + (isCur ? "background:var(--aqua-wash);box-shadow:inset 0 0 0 2px var(--aqua-light);" : ""),
        numStyle: "width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;"
          + (st === "done" ? "background:var(--mint);color:#fff;" : isCur ? "background:var(--aqua);color:#fff;" : "background:var(--surface-2);color:var(--ink-soft);"),
        nameStyle: "flex:1;min-width:0;font-weight:800;color:" + (st === "done" ? "var(--ink-faint);text-decoration:line-through;" : isCur ? "var(--ink);" : "var(--ink-soft);"),
        statusIcon: st === "done" ? "✓" : st === "skipped" ? "⏭" : isCur ? "▶" : "",
        secColor: st === "done" ? "var(--mint)" : isCur ? "var(--aqua)" : "var(--ink-faint)"
      });
    });
  });

  const de = state.detailEx || {};
  const day = DAYS[sess.dayKey] || {};

  const moodOpts = MOOD_DEFS.map(m => ({
    ...m,
    style: "display:flex;flex-direction:column;align-items:center;gap:5px;min-width:76px;padding:12px 14px;border-radius:16px;cursor:pointer;border:3px solid;background:var(--surface);font-family:inherit;"
      + (sess.mood === m.key ? "border-color:var(--mint);background:#fff;box-shadow:0 4px 0 var(--mint-deep);" : "border-color:var(--hairline);")
  }));
  const rChip = (sel) => "padding:9px 14px;border-radius:var(--radius-pill);border:2px solid " + (sel ? "var(--aqua)" : "var(--hairline)") + ";background:" + (sel ? "var(--aqua-wash)" : "var(--surface)") + ";color:" + (sel ? "var(--aqua-ink)" : "var(--ink-soft)") + ";font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;";
  const reflectWellOpts = REFLECT_WELL.map(t => ({ label: t, style: rChip(sess.wentWell === t) }));
  const reflectNextOpts = REFLECT_NEXT.map(t => ({ label: t, style: rChip(sess.nextTime === t) }));

  const QZ = sessionQuizFor(sess.dayKey);
  const quizAnswered = sess.quizPick != null;
  const quizOpts = QZ.opts.map((o, i) => ({
    label: o.t, idx: i,
    prefix: quizAnswered ? (o.ok ? "✓" : (sess.quizPick === i ? "✕" : "")) : String.fromCharCode(65 + i),
    style: "display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:12px 16px;border-radius:16px;border:3px solid;cursor:pointer;font-weight:800;font-size:15px;font-family:inherit;box-sizing:border-box;"
      + (!quizAnswered ? "border-color:var(--hairline);background:var(--surface);color:var(--ink);"
        : o.ok ? "border-color:var(--mint);background:var(--mint-wash);color:var(--mint-ink);"
        : sess.quizPick === i ? "border-color:var(--coral);background:color-mix(in srgb, var(--coral) 12%, #fff);color:var(--coral);"
        : "border-color:var(--hairline);background:var(--surface);color:var(--ink-faint);")
  }));
  const quizCorrect = quizAnswered && !!(QZ.opts[sess.quizPick] && QZ.opts[sess.quizPick].ok);

  return {
    isWide: state.isWide, isNarrow: !state.isWide,
    sessionDone, sessionInProgress: !sessionDone,
    stopOverlay: sess.stopOverlay, confirmEnd: sess.confirmEnd, notConfirmingEnd: !sess.confirmEnd,
    detailOverlay: state.detailOverlay,
    detailName: de.name || "", detailDose: de.dose || "", detailCue: de.cue || "",
    detailWatchFor: de.parentWatch || "", detailFix: de.redFlag || de.fix || "",
    detailSwim: de.swimTransfer || "",
    detailPhotoUrl: exercisePhotoUrl(de.name, "Demo"),
    detailVideoUrl: videoSearchUrl(de),

    sessionDayTitle: day.title || "",
    elapsedDisplay: fmtMMSS(sess.elapsed),
    sessionPlannedDisplay: Math.max(1, Math.round(sess.plannedSecs / 60)) + " min",
    sessionTimePct, roundLine, roundDots,
    progressLabel, progressValue: Math.min(doneCount, Math.max(1, totalExCount)), progressMax: Math.max(1, totalExCount),
    sessionExList,

    timerIsTime, timerIsReps, isPrompt, phase,
    timerDisplay: fmtMMSS(sess.timerSecs || 0),
    timerZone, timerZoneType, timerUrgent,
    timerProgress: sess.timerMax > 0 ? Math.max(0, sess.timerSecs / sess.timerMax) : 1,
    timerIsPaused: sess.paused, timerNotPaused: !sess.paused,
    isResting, notResting: !isResting && !isPrompt, isBigRest,
    stageTitle, blockBadgeVariant, blockLabel, roundLabelText,
    curExName: ex.name || "", curExDose,
    curExCue: isResting ? sess.restCue : (ex.cue || ""),
    curExWatchFor: ex.parentWatch || "", curExFix: ex.redFlag || "",
    curExSwim: ex.swimTransfer || "",
    curExPhotoUrl: exercisePhotoUrl(ex.name || "rest", "Timer"),
    exActualDisplay: fmtMMSS(curActual), exPlannedDisplay: fmtMMSS(curPlanned),
    exPacePct: Math.round((curPlanned > 0 ? Math.min(1, curActual / curPlanned) : 0) * 100),
    paceColor, overNudge: !!(exOver && timerIsReps),
    upNextName: sess.upNextName, upNextDose: sess.upNextDose,
    cheerMsg: CHEERS[(sess.roundsCompleted || 0) % CHEERS.length],
    showCleanCheck: !!sess.pendingCleanCheck && isResting,
    wobblyBanner: !!sess.lastWobbly && !isResting && !isPrompt,
    doneLabel: isResting ? "⏭ Skip Rest" : (timerIsReps ? "✓ Done — Next" : "✓ Done — Next"),

    // prompts
    intentWords: INTENT_WORDS, microQ: MICRO_LOOP.q, microOpts: ["the hips", "the arms", "the knees"],
    microAnswered: !!sess.microLoop, microCorrectAnswer: MICRO_LOOP.a,
    microPicked: sess.microLoop ? sess.microLoop.answer : null,
    breathText: BREATH_REHEARSAL,

    // complete screen
    practice: sess.practice, endedEarly: sess.endedEarly, painFlag: sess.painFlag,
    saveFailed: !!sess.saveFailed,
    sessionMantra: day.mantra || "",
    sessionMinutes: Math.round(sess.elapsed / 60),
    roundsCompleted: sess.roundsCompleted || 0,
    xpEarned: sess.xpEarned, leveledUp: sess.leveledUp,
    moodOpts, moodAck: sess.mood ? MOOD_ACK[sess.mood] : "", showReflection: sessionDone && !!sess.mood, reflectWellOpts, reflectNextOpts,
    quizQuestion: QZ.q, quizOpts, quizAnswered, quizWhy: QZ.why,
    quizFeedback: quizCorrect ? "Nailed it! +25 XP ⭐" : "Good try! The best answer is highlighted — now you know it. +10 XP for thinking 💭",
    quizFeedbackColor: quizCorrect ? "var(--mint-ink)" : "var(--coral)"
  };
}
