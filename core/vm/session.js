/* ============================================================
   SESSION view-model — derives the design's session-screen
   values from the engine's `sess` view-state.
   ============================================================ */

import { sess, refTime, screenRepsDetail, pausedByBackground, canGoBack } from "../engine.js";
import { DAYS, CHEERS, INTENT_WORDS, MICRO_LOOP, BREATH_REHEARSAL, BLOCK_META, SESSION_QUIZ,
         REFLECT_WELL, REFLECT_NEXT, exWork, videoSearchUrl } from "../data.js";
import { SKILL_BLOCK, COPY } from "../sport.js";
import { fmtMMSS, exercisePhotoUrl, photoSources, plural } from "../util.js";
import { loadSessions } from "../store.js";
import { deriveSessionOutcome, outcomeOf, OUTCOME_VERSION, STREAK_WORK_FRACTION, paceBand } from "../outcome.js";

/* What changes at the end of this segment — named before she gets there, so the
   switch is never a surprise she hears about only if the voice is on. */
function coachNext(sess) {
  if (!sess.totalSegments || sess.currentSegment >= sess.totalSegments) return "";
  if (sess.currentSide < sess.totalSides) return "NEXT: SWITCH SIDES";
  if (sess.currentDirection < sess.totalDirections) return "NEXT: OTHER DIRECTION";
  if (sess.currentSet < sess.totalSets) return "NEXT: SET " + (sess.currentSet + 1);
  return "";
}

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
/* REFLECT_WELL and REFLECT_NEXT used to be hardcoded here, in shared core, with
   swimming words — so the skater was offered "Point my toes" and "Breathe out
   loud". They come from each app's own data.js now. */


/* The day's Coach's Quiz question. Rotates as the training log grows (not fixed
   per weekday), so the completion quiz stays fresh instead of repeating. Both
   this VM and main.js call it with the same dayKey during the done screen, so
   the displayed question and the XP-awarding question always match. */
export function sessionQuizFor(dayKey) {
  const n = (dayKey ? String(dayKey).length : 0) + loadSessions().length;
  return SESSION_QUIZ[n % SESSION_QUIZ.length];
}

export function buildSessionVM(state) {
  const circuits = sess.circuits || [];
  const circuit = circuits[sess.ci] || { exercises: [], rounds: 1, name: "", block: "main" };
  const ex = sess.currentEx || {};
  const phase = sess.phase;

  const sessionDone = phase === "done";
  const explore = !!sess.explore;
  /* The finish screen reads THE SAVED RECORD. Not `endedEarly === false`, which
     only ever meant "the loop reached its end" and therefore called a Recovery
     pass, and a session of nothing but skips, a completed workout. The record is
     what the week strip, the streak and the parent reports will be built from
     tomorrow, so it is what she is told about tonight.

     While the session is still running there is no saved row yet, so the same
     authority is asked about the live ledger instead. */
  const liveOutcome = sess.savedEntry
    ? outcomeOf(sess.savedEntry)
    : deriveSessionOutcome({
        ledger: sess.ledger || [],
        expectedWork: Number.isFinite(sess.expectedWork) ? sess.expectedWork : null,
        // The finish screen has to agree with the row that gets saved: on a
        // resume both are judged against the whole day, credit included.
        bankedCredit: sess.bankedCredit || 0,
        // The live screen has to be judged by the same evidence the saved row
        // will be: which rounds each asked for, and what the engine thinks it
        // counted. Without these the running screen scored a round the record
        // then scored differently.
        expectedByRound: sess.expectedByRound || null,
        roundsDone: Number.isFinite(sess.roundsCompleted) ? sess.roundsCompleted : null,
        safetyStop: !!sess.painFlag,
        explicitAbort: sess.endedEarly === true,
        sessionType: sess.mode === "recovery" ? "recovery" : sess.spa ? "spa" : null,
        outcomeVersion: OUTCOME_VERSION,
        completedFully: !sess.endedEarly
      });

  /* The one value the finish screen switches on. Six states, in priority order:
     a failed save outranks everything (nothing was recorded, so nothing may be
     claimed), then safety, then care, then what the ledger can actually prove. */
  const completionState = explore ? "explore" : sess.saveFailed ? "save-failed" : liveOutcome.state;

  /* A partial is not one outcome, it is two: the day that cleared the streak
     bar and the day that did not. Both were shown the same words — "part of the
     way, and it counts" — which is true of the work and silent about the thing
     she actually wants to know. The numbers to say which have been computed all
     along (js/outcome.js surfaces workRatio precisely so a screen can say how
     far short it fell) and were read by nobody. */
  const streakEarned = !!liveOutcome.countsForStreak;
  const streakFrozen = !!liveOutcome.streakFreeze;
  const ratio = Number(liveOutcome.workRatio);
  const streakShortBy = Number.isFinite(ratio)
    ? Math.max(1, Math.round((STREAK_WORK_FRACTION - ratio) * (sess.expectedWork || 0)))
    : null;
  const completionKey = explore ? "explore" : completionState === "partial"
    ? (streakEarned ? "partial-streak" : "partial-short")
    : completionState === "recovery"
    ? (streakFrozen ? "recovery-held" : "recovery-short")
    : completionState;
  const roundsDone = Math.max(0, Number(liveOutcome.mainRoundsDone) || 0);

  /* HOW FAR SHE GOT, AND WHAT IS LEFT — in numbers, on the screen.

     Every partial day got one fixed sentence. The two numbers a kid actually
     wants ("how close was I?" and "what did I miss?") were computed for the
     streak and shown to nobody, so "part of the way" covered both a day three
     moves short and a day half done. */
  const donePercent = Number.isFinite(ratio)
    ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : null;
  const skippedRows = (sess.ledger || []).filter(l => l && l.status === "skipped");
  const skippedCount = skippedRows.length;
  const skippedNames = [...new Set(skippedRows.map(l => l.name).filter(Boolean))];
  const skippedPhrase = skippedCount
    ? (skippedNames.length && skippedNames.length <= 3
        ? plural(skippedCount, "move") + " got skipped (" + skippedNames.join(", ") + ")"
        : plural(skippedCount, "move") + " got skipped")
    : "";
  /* THE SECOND CHANCE, SAID OUT LOUD AND ONLY WHILE IT IS TRUE.

     A skipped move is never banked (see bankMove in js/engine.js), so it is
     offered again the moment she comes back — for the rest of today. That has
     always worked and was never mentioned anywhere, so the one thing she could
     do about a short day was the one thing the screen never told her. It is
     today's offer only: a partial does not carry into a new training day (the
     No-Debt rule, js/store.js), and promising otherwise would be a promise the
     next morning breaks. */
  const comeBackLine = "Everything you did is saved, so you can come back later today and finish the rest — that would make it a full day.";
  const partialNote = donePercent === null ? null
    : streakEarned
      ? `You got ${donePercent}% of today done${skippedPhrase ? ", and " + skippedPhrase : ""}. Your streak keeps going — today counts. 🔥 ` + comeBackLine
      : `You got ${donePercent}% of today done${skippedPhrase ? ", and " + skippedPhrase : ""}. Everything you DID do is saved — the moves, the minutes and the XP for them. Today didn't reach the streak${Number.isFinite(streakShortBy) && streakShortBy > 0 ? ` — about ${plural(streakShortBy, "more move")} would do it` : ""}. Come back later today and finish the rest; it still counts for today. 💛`;
  const completionNote = completionState === "partial" ? partialNote : null;

  /* HOW WELL SHE HELD IT, which is a different question from how much of it
     there was, and one the finish screen has never asked. A thirty-second hold
     let go at twelve seconds and one held the whole way both left the screen
     saying "done". The bands come off the same ledger everything else here
     reads — see paceReport in js/outcome.js — and they change no XP and no
     streak day: this is a coaching line, not a verdict. */
  const pace = liveOutcome.pace || null;
  const paceCounts = pace ? pace.counts : null;
  const paceNote = !pace || !pace.graded ? null
    : pace.shortCount === 0
      ? (paceCounts.amber
          ? `Every move was there. ${plural(paceCounts.green, "hold")} full, ${paceCounts.amber} nearly — good, steady work.`
          : "Every move held its full time. That's the whole dose. 💪")
      : `${plural(pace.shortCount, "move")} came in short today`
        + (pace.worst && pace.worst.name && Number.isFinite(pace.worst.ratio)
            ? ` — ${pace.worst.name} at ${Math.round(pace.worst.ratio * 100)}% of its hold.` : ".")
        + " Holding the whole time is what makes it count in the water.";

  /* A DAY SHE CAME BACK AND FINISHED reads differently from one done in a
     single go, and should: coming back is the harder thing. bankedCredit is
     only ever above zero on a resumed sitting. */
  const finishedAResume = completionState === "complete" && (Number(sess.bankedCredit) || 0) > 0;

  /* THE DAY'S ROUNDS, not this sitting's.

     A day can be trained in two goes, and this line was the only thing on the
     finish screen that did not know it: the numerator counted this sitting's
     ledger and the denominator was `roundsPlanned`, the rounds this sitting had
     LEFT to do. So a green day resumed after one banked round read "2 of 2 main
     rounds" — beside XP, a streak and a "today counts" headline all judging the
     full three, and with the round she trained before lunch nowhere on the
     screen at all.

     The engine now carries the head start and the day's own ask (see
     startSession), so the line can say what every other number here is saying.
     On a first sitting bankedRounds is 0 and dayRoundsPlanned IS roundsPlanned,
     which is why nothing about a single-sitting day moves. */
  const dayRoundsDone = Math.max(0, Number(sess.bankedRounds) || 0) + roundsDone;
  const dayRoundsAsked = Math.max(0, Number(sess.dayRoundsPlanned) || 0);

  /* One line per main round that did not count, naming the move that cost it.
     Deliberately factual and never scolding: she is told what happened and what
     "counting" means, not that she failed. A round short of ROWS is a round she
     did not reach, which is a different sentence from a round she trained short. */
  const roundShortNotes = (liveOutcome.roundReport || [])
    .filter(r => !r.counts)
    .map(r => {
      if (r.skipped.length) return `Round ${r.round} wasn't a full round — ${r.skipped[0]} got skipped.`;
      if (r.missing > 0)    return `Round ${r.round} wasn't a full round — you stopped partway through it.`;
      const b = r.blockedBy;
      if (!b || !Number.isFinite(Number(b.planned)) || Number(b.planned) <= 0)
        return `Round ${r.round} wasn't a full round — it was a bit short.`;
      const got = Math.round(Number(b.got) || 0), planned = Math.round(Number(b.planned));
      return b.driver === "reps"
        ? `Round ${r.round} wasn't a full round — ${b.name} was ${got} of ${planned} reps.`
        : `Round ${r.round} wasn't a full round — ${b.name} was ${got}s of ${planned}s.`;
    });

  const isResting = phase === "rest" || phase === "roundRest" || phase === "sectionRest";
  const isPrompt = phase === "intent" || phase === "microloop" || phase === "breath" || phase === "formcheck";
  // The clean-check is asked ABOUT a move, so the move stays on screen — the
  // photo and the ring's spot hold the question, not the breath card.
  const isFormCheck = phase === "formcheck";
  // A move is only skippable while it is underway. Elsewhere Done already says
  // "skip rest", and a "Skip this exercise? It won't count." over a breather
  // was a question about a move that had already been recorded.
  const canSkipExercise = phase === "work" || phase === "reps" || phase === "sideswitch";
  const isBigRest = phase === "roundRest" || phase === "sectionRest";
  const timerIsReps = phase === "reps";
  const timerIsTime = !timerIsReps && !isPrompt;

  const bzMap = { warmup: "warmup", coordination: "work", main: "work", prep: "work", finisher: "rest", [SKILL_BLOCK]: "rest", recovery: "rest" };
  const pzMap = { work: bzMap[circuit.block] || "work", rest: "rest", roundRest: "evening", sectionRest: "evening", sideswitch: "rest", getready: "warmup", greeting: "warmup", breath: "rest" };
  const timerZoneType = pzMap[phase] || "work";
  /* "WORK" only said "not a rest". It never said which KIND of work, which is
     the thing she needs: a clock she has to outlast, or a count she has to
     finish. The rep ring says BY REPS, so the timed one says TIMED SET —
     "session" is already the whole workout here (Session time, End session)
     and would collide. */
  const timerZone = ({ work: "TIMED SET", rest: "REST", roundRest: "ROUND REST", sectionRest: "SECTION REST",
    sideswitch: "SWITCH", getready: "READY", greeting: "READY", breath: "BREATHE" })[phase] || "TIMED SET";
  const timerUrgent = sess.urgent && phase !== "roundRest" && phase !== "sectionRest";

  const bvMap = { warmup: "sun", coordination: "sun", main: "aqua", prep: "grape", finisher: "mint", [SKILL_BLOCK]: "sea", recovery: "grape" };
  const blockBadgeVariant = bvMap[circuit.block] || "aqua";
  const blockLabel = ({ warmup: "Warm-Up 🔥", coordination: "Coordination ⚡", main: "Main Circuit 💪",
    prep: "Prep Pair 🎯", finisher: "Finisher 🏁", [SKILL_BLOCK]: COPY.skillBlockLabel + " " + BLOCK_META[SKILL_BLOCK].emoji, recovery: "Recovery ❄️" })[circuit.block] || circuit.name || "";
  /* THE ROUND NUMBER AND THE ROUND COUNT MUST BE ABOUT THE SAME THING.
     sess.round is the round of the DAY (a resume's first round is round two);
     circuit.rounds is only what THIS SITTING owes. Put together they read
     "Round 3 of 2" on a resumed day, and the dots below indexed off the same
     mismatch, so the last round had no active dot at all. The day's own ask is
     what every other number on this screen uses (see dayRoundsAsked). */
  const roundsShown = Math.max(Number(sess.dayRoundsPlanned) || 0, circuit.rounds || 0);
  const roundLabelText = circuit.block === "main" && roundsShown > 1 ? ("Round " + sess.round + " of " + roundsShown) : "";

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
  /* Counted the way the steps were BUILT (see buildSteps): a move capped to
     fewer rounds than its circuit contributes only the rounds it actually
     runs, so the denominator matches the exDone that climbs toward it. It used
     to assume every move ran every round, and the bar could never fill on a
     day that capped one. */
  const totalExCount = circuits.reduce((acc, c) =>
    acc + c.exercises.reduce((n, ex) => n + Math.min(c.rounds, Number(ex.rounds) || c.rounds), 0), 0);
  const doneCount = sess.exDone || 0;
  const secNames = { warmup: "Warm-Up", coordination: "Coordination", main: "Main", prep: "Prep", finisher: "Finisher", [SKILL_BLOCK]: COPY.skillBlockLabel, recovery: "Recovery" };
  const progressLabel = (secNames[circuit.block] || "") + " · " + Math.min(sess.ei + 1, circuit.exercises.length) + " of " + circuit.exercises.length;
  const sessionTimePct = Math.min(100, Math.round(sess.elapsed / Math.max(1, sess.plannedSecs) * 100));
  const roundLine = (roundsShown || 1) > 1 ? ((circuit.name || "") + " · Round " + sess.round + " of " + roundsShown) : "";
  const roundDots = (roundsShown || 1) > 1 ? Array.from({ length: roundsShown }, (_, i) => ({
    style: "width:10px;height:10px;border-radius:50%;flex-shrink:0;" + (i < sess.round - 1 ? "background:var(--mint);" : (i === sess.round - 1 ? "background:var(--aqua);" : "background:var(--surface-2);border:1.5px solid var(--hairline);box-sizing:border-box;"))
  })) : [];

  // Exercise timeline (left pane list)
  const BLOCK_COLORS = { warmup: "var(--coral)", coordination: "var(--sun-ink)", main: "var(--sea)", prep: "var(--grape)", finisher: "var(--mint-ink)", [SKILL_BLOCK]: "var(--aqua-ink)", recovery: "var(--grape)" };
  /* HOW WELL EACH FINISHED MOVE WAS HELD, on the list she is already looking at.

     The timeline showed a tick for every move that ended, and a twelve-second
     version of a thirty-second hold got the same tick as the real thing. The
     ledger has always known the difference. The dot beside the tick is that
     difference, in the same four colours the finish screen and the Grown-up
     Zone use, so nobody has to learn a second vocabulary. Nothing here changes
     a status: a `done` move is still done, still paid, still a streak unit.
     Only the colour says how close it was. */
  const PACE_DOT = { green: "var(--mint)", amber: "var(--sun)", yellow: "var(--coral)", red: "var(--stop)" };

  /* ---- THE LIST IS THE DAY, AND THE PILL IS WHERE SHE PICKS UP -------------

     The list used to render `sess.circuits` — what THIS SITTING runs. On a
     resume that is the remainder, so a day half-trained showed a short stub of
     leftovers with every pill blank: nothing on screen said what she had
     already done, what she had cut short, or where in the day she was picking
     up, which is the one question the list exists to answer. The engine now
     hands over `listCircuits` (the whole day) and `priorRows` (today's merged
     ledger from the earlier sittings) so it can say all three.

     Rows are keyed `block|name`, because the list has always collapsed rounds —
     a main circuit prints its moves once under a "×3" header — and that key is
     the one thing a day row and a live ledger row can both be matched on. The
     old `ci-ei` index cannot: `listCircuits` and `circuits` are different
     arrays on a resume, where a main block is two circuits to the day's one. */
  const listCircuits = (sess.listCircuits && sess.listCircuits.length)
    ? sess.listCircuits : circuits;
  const moveKey = (block, name) => block + "|" + name;

  const historyRows = (sess.priorRows || []).concat(sess.ledger || []);
  /* How every round of each move landed. A move reads `done` only once every
     round the day asked for is done; one skip anywhere makes it skipped, and
     anything short of that with work in it is a move she cut short. */
  const seenByMove = new Map();
  historyRows.forEach(l => {
    if (!l || !l.block || !l.name) return;
    const k = moveKey(l.block, l.name);
    const cur = seenByMove.get(k) || { done: 0, partial: 0, skipped: 0 };
    if (l.status === "done") cur.done += 1;
    else if (l.status === "skipped") cur.skipped += 1;
    else if (l.status === "partial") cur.partial += 1;
    seenByMove.set(k, cur);
  });
  const paceByMove = new Map();
  historyRows.forEach(l => {
    if (!l || l.status === "skipped" || !l.block || !l.name) return;
    const band = paceBand(l);
    if (!band) return;
    // The most recent attempt is the one worth showing: latest wins.
    paceByMove.set(moveKey(l.block, l.name), band);
  });

  // Where she is standing, named rather than indexed — for the same reason.
  const curKey = (sess.running && !sessionDone && circuit && circuit.exercises[sess.ei])
    ? moveKey(circuit.block, circuit.exercises[sess.ei].name) : null;

  /* Five states, in the four colours the finish screen and the Grown-up Zone
     already use, so nobody has to learn a second vocabulary. Standing on a move
     outranks its history: she has to be able to find herself first. */
  const PILL = {
    done:    { bg: "var(--mint)",      ink: "#fff",            icon: "✓", sec: "var(--mint)" },
    partial: { bg: "var(--sun)",       ink: "var(--sun-ink)",  icon: "½", sec: "var(--sun-deep)" },
    skipped: { bg: "var(--coral)",     ink: "#fff",            icon: "⏭", sec: "var(--coral)" },
    current: { bg: "var(--aqua)",      ink: "#fff",            icon: "▶", sec: "var(--aqua)" },
    pending: { bg: "var(--surface-2)", ink: "var(--ink-soft)", icon: "",  sec: "var(--ink-faint)" }
  };
  const NAME_INK = {
    done: "var(--ink-faint);text-decoration:line-through;",
    partial: "var(--ink-soft);", skipped: "var(--ink-faint);",
    current: "var(--ink);", pending: "var(--ink-soft);"
  };

  let sawHistory = false;
  const sessionExList = [];
  listCircuits.forEach((c, ci) => {
    sessionExList.push({ isHeader: true, name: c.name + (c.rounds > 1 ? ` ×${c.rounds}` : ""), color: BLOCK_COLORS[c.block] || "var(--ink-soft)" });
    c.exercises.forEach((e, ei) => {
      const k = moveKey(c.block, e.name);
      const isCur = !!curKey && k === curKey;
      /* Explore writes no ledger at all — nothing there is recorded, which is
         the whole point of it — so its own in-memory verdicts answer instead. */
      let st;
      if (explore) {
        st = sess.exStatus[ci + "-" + ei];
      } else {
        const seen = seenByMove.get(k);
        // What this move was asked for: its own round cap where it has one.
        const asked = Math.min(c.rounds, Number(e.rounds) > 0 ? Number(e.rounds) : c.rounds);
        if (seen) {
          st = seen.skipped ? "skipped"
            : seen.done >= asked ? "done"
            : (seen.done || seen.partial) ? "partial" : undefined;
        }
      }
      if (st) sawHistory = true;
      const state = isCur ? "current" : st === "done" ? "done"
        : st === "partial" ? "partial" : st === "skipped" ? "skipped" : "pending";
      const pill = PILL[state];
      sessionExList.push({
        isEx: true, num: ei + 1, name: e.name, ci, ei, isCur,
        /* Tapping a move is navigation, and navigation is explore's alone: a
           real session's ledger is one row per step, written in order, and a
           row that never arrives is a round she did not finish. */
        jumpAction: explore && sess.running && !sessionDone && !isCur,
        cardStyle: "display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:12px;margin:2px 0;box-sizing:border-box;"
          + (isCur ? "background:var(--aqua-wash);box-shadow:inset 0 0 0 2px var(--aqua-light);" : ""),
        numStyle: "width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;"
          + "background:" + pill.bg + ";color:" + pill.ink + ";",
        nameStyle: "flex:1;min-width:0;font-weight:800;color:" + NAME_INK[state],
        statusIcon: pill.icon,
        paceDotStyle: paceByMove.has(k)
          ? "width:8px;height:8px;border-radius:50%;flex-shrink:0;background:" + PACE_DOT[paceByMove.get(k)] + ";"
          : "",
        paceTitle: paceByMove.has(k)
          ? { green: "Held the full time", amber: "Almost the full time",
              yellow: "Short of the full time", red: "Well short of the full time" }[paceByMove.get(k)]
          : "",
        secColor: pill.sec
      });
    });
  });
  /* What the colours mean, said once and only where there is history to read.
     Done and cut-short shared a glyph before this. */
  const exListLegend = (!explore && sawHistory)
    ? "✓ done · ½ cut short · ⏭ skipped — you’re picking up at ▶"
    : "";


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
  // The XP line quotes what was ACTUALLY banked (main.js prices the answer off
  // the quiz ledger, so a question already learned pays nothing). Promising
  // "+25 XP" for a repeat and then not paying it is how a kid learns to
  // distrust the numbers.
  const quizXp = sess.quizXp || 0;
  const quizXpLine = quizXp ? " +" + quizXp + " XP"
    : sess.quizCapped ? " That’s today’s quiz XP maxed out — this one still counts tomorrow."
    : quizAnswered ? " You already learned this one — no XP, but it’s still true."
    : "";
  const quizFeedback = quizCorrect
    ? "Nailed it!" + quizXpLine + (quizXp ? " ⭐" : "")
    : "Good try! The best answer is highlighted — now you know it." + quizXpLine + (quizXp ? " 💭" : "");

  return {
    isWide: state.isWide, isNarrow: !state.isWide, isTablet: !!state.isTablet, tightColumn: !!state.tightColumn,
    watchOpen: !!state.watchOpen,
    sessionDone, sessionInProgress: !sessionDone,
    stopOverlay: sess.stopOverlay,
    confirmSkip: !!sess.confirmSkip,
    detailOverlay: state.detailOverlay,
    detailName: de.name || "", detailDose: de.dose || "", detailCue: de.cue || "",
    detailWatchFor: de.parentWatch || "", detailFix: de.redFlag || de.fix || "",
    detailTransfer: de.transfer || "",
    // The repo holds 39 "- Timer Image.png" files and zero "- Demo Image.png",
    // so asking for a demo photo guaranteed the placeholder on every move.
    detailPhotoUrl: exercisePhotoUrl(de.name, "Demo"),
    detailPhotoFallbackUrl: exercisePhotoUrl(de.name, "Timer"),
    // Demo first, the timer photo as its stand-in, each as WebP before PNG.
    detailPhotoSources: [...photoSources(exercisePhotoUrl(de.name, "Demo")), ...photoSources(exercisePhotoUrl(de.name, "Timer"))],
    detailVideoUrl: videoSearchUrl(de),
    // Opening instructions PAUSES the run, and closing them asks for an
    // explicit Resume — the countdown is timestamp-based, so it used to keep
    // running (and finish the exercise) while she was reading or on YouTube.
    detailShowResume: sess.running && sess.paused && !explore,

    /* ---- explore: the same screen with nothing counting down --------------
       One flag, read by the screen to drop the controls that only mean
       something when a clock is running: pause, stop, the session time, the
       end-early confirm. */
    explore,
    exploreBanner: explore ? "🧪 EXPLORE — just looking. Tap Next, or tap any move in the list to jump straight to it. Nothing counts down and nothing is recorded." : "",
    showClock: !explore,
    showPause: !explore, showStop: !explore,
    // "◀ Back a move" — only where the engine can honour it (see canGoBack).
    canGoBack: canGoBack(),
    canSkipExercise,
    isFormCheck,
    checkKind: sess.checkKind || "form",
    formCheckTitle: sess.checkKind === "landing" ? "Landing check" : "How did that feel?",
    checkCleanLabel: sess.checkKind === "landing" ? "🧊 Clean & frozen" : "✓ Clean",
    checkWobblyLabel: sess.checkKind === "landing" ? "〰️ A bit wobbly" : "😅 Wobbly",
    checkNote: sess.checkKind === "landing"
      ? "2 wobbly in a row = we drop a round. Quality over quantity."
      : "Answer below — or just move on.",

    sessionDayTitle: day.title || "",
    elapsedDisplay: fmtMMSS(sess.elapsed),
    paceNote,
    paceBand: (pace && pace.band) || "",
    paceCounts,
    sessionPlannedDisplay: Math.max(1, Math.round(sess.plannedSecs / 60)) + " min",
    sessionTimePct, roundLine, roundDots,
    progressLabel, progressValue: Math.min(doneCount, Math.max(1, totalExCount)), progressMax: Math.max(1, totalExCount),
    sessionExList, exListLegend,

    timerIsTime, timerIsReps, isPrompt, phase,
    timerDisplay: fmtMMSS(sess.timerSecs || 0),
    timerZone, timerZoneType, timerUrgent,
    /* The side is live on TIMED two-sided moves too (engine sets sideLabel to
       "15s first side"), but it only ever reached the small italic dose line —
       the LEFT/RIGHT chips are gated on phase === "reps". The ring label can
       carry it at the same size as the phase word. */
    timerSideWord: (sess.totalSides > 1 && /first side/i.test(sess.sideLabel || "")) ? "FIRST SIDE"
      : (sess.totalSides > 1 && /second side/i.test(sess.sideLabel || "")) ? "SECOND SIDE" : "",
    railOpen: state.railOpen !== false,
    confirmRestart: !!sess.confirmRestart,
    restartExercises: sess.exDone || 0,
    restartRounds: sess.roundsCompleted || 0,
    timerProgress: sess.timerMax > 0 ? Math.max(0, sess.timerSecs / sess.timerMax) : 1,
    timerIsPaused: sess.paused, timerNotPaused: !sess.paused,
    // Paused BY the app, because the page went away — see PAUSE_HIDDEN in
    // js/engine.js. Worth its own line on the screen: the clock is not where
    // she left it, and she is owed the reason.
    pausedByBackground: pausedByBackground(),
    isResting, notResting: !isResting && !isPrompt, isBigRest,
    // Only offer the instructions when there is actually a move to describe.
    // During the lead-in there is no current exercise, so the old ⓘ button
    // rendered there and did nothing at all when tapped.
    canOpenDetail: !!sess.currentEx && !isResting && (!isPrompt || isFormCheck),
    stageTitle, blockBadgeVariant, blockLabel, roundLabelText,
    curExName: ex.name || "", curExDose,
    curExCue: isResting ? sess.restCue : (ex.cue || ""),
    curExWatchFor: ex.parentWatch || "", curExFix: ex.redFlag || "",
    curExTransfer: ex.transfer || "",
    curExPhotoUrl: exercisePhotoUrl(ex.name || "rest", "Timer"),
    curExPhotoSources: photoSources(exercisePhotoUrl(ex.name || "rest", "Timer")),
    exActualDisplay: fmtMMSS(curActual), exPlannedDisplay: fmtMMSS(curPlanned),
    exPacePct: Math.round((curPlanned > 0 ? Math.min(1, curActual / curPlanned) : 0) * 100),
    paceColor, overNudge: !!(exOver && timerIsReps),
    upNextName: sess.upNextName, upNextDose: sess.upNextDose,

    /* ---- live coach state -------------------------------------------------
       SET 1 OF 2 · LEFT SIDE · REP 5 OF 8 · NEXT: SWITCH SIDES. The engine has
       always tracked every one of these; nothing ever showed them, so a session
       run with the voice off (or on a device with no installed voice) gave her
       no way to know which set or which side she was on. */
    coachSetLine: sess.totalSets > 1 ? `SET ${sess.currentSet} OF ${sess.totalSets}` : "",
    coachSideLine: sess.totalSides > 1
      ? (sess.currentSide === 1 ? "LEFT SIDE" : "RIGHT SIDE") : "",
    coachDirectionLine: sess.totalDirections > 1
      ? `DIRECTION ${sess.currentDirection} OF ${sess.totalDirections}` : "",
    coachRepLine: sess.repsInSegment > 0 ? `REP ${sess.repInSegment} OF ${sess.repsInSegment}` : "",
    coachNextLine: coachNext(sess),
    showCoachState: phase === "reps" && sess.totalSegments > 0,
    coachSegmentLine: sess.totalSegments > 1
      ? `${sess.currentSegment} of ${sess.totalSegments}` : "",
    cheerMsg: CHEERS[(sess.roundsCompleted || 0) % CHEERS.length],
    // Its own phase, not something rendered over a rest clock that is already
    // running down. Naming the move matters: two or three are watched per run
    // and she has to know which one she is answering for.
    showCleanCheck: phase === "formcheck" && !!sess.pendingCleanCheck,
    cleanCheckMove: sess.cleanCheckMove || "",
    cleanCheckQuestion: sess.checkKind === "landing"
      ? (sess.cleanCheckMove ? sess.cleanCheckMove + " — " : "") + "how did those landings freeze?"
      : sess.cleanCheckMove
        ? "Were your " + sess.cleanCheckMove + " reps clean?"
        : "Were your reps clean?",
    wobblyBanner: !!sess.lastWobbly && !isResting && !isPrompt,
    /* THE BUTTON SAYS WHAT THE TAP WILL DO. While the coach is announcing a
       move, a tap means "I know this one, go" and starts the clock — it does
       not end the move. The button said "✓ Done — Next" throughout, so the
       first tap looked like it had been ignored and the second one, landing on
       a move that had only just started, looked like it had skipped something.
       Same button, same action, honest label. */
    doneLabel: explore ? "Next move ▶"
      : isResting ? "⏭ Skip Rest"
      : isFormCheck ? "Move on →"
      : sess.announceResolver ? "▶ Go"
      : "✓ Done — Next",

    // prompts
    intentWords: INTENT_WORDS, microQ: MICRO_LOOP.q, microOpts: MICRO_LOOP.opts,
    microAnswered: !!sess.microLoop, microCorrectAnswer: MICRO_LOOP.a,
    microPicked: sess.microLoop ? sess.microLoop.answer : null,
    breathText: BREATH_REHEARSAL,

    // complete screen
    endedEarly: sess.endedEarly, painFlag: sess.painFlag,
    /* Six mutually exclusive states, each with its own words. The screen may
       switch on THIS and on nothing else — `endedEarly === false` is not proof
       that anything was finished. */
    completionState,
    // What the finish screen actually switches on — the state, split where a
    // single state hides an answer she is owed.
    completionKey,
    // Set only where the screen should say something the static row cannot —
    // the percentage, the skipped moves, and today's second chance.
    completionNote,
    donePercent, skippedCount, skippedNames,
    finishedAResume,
    streakEarned, streakFrozen, streakShortBy,
    isComplete:   completionState === "complete",
    isPartial:    completionState === "partial",
    isRecovery:   completionState === "recovery",
    isSafetyStop: completionState === "safety-stop",
    noWorkDone:   completionState === "none",
    saveFailed: completionState === "save-failed",
    sessionMantra: day.mantra || "",
    sessionMinutes: Math.round(sess.elapsed / 60),
    /* THE LEDGER'S COUNT, not the engine's. This line used to read
       `sess.roundsCompleted` — the raw counter, incremented at the bottom of the
       round loop after the round rest — so a session interrupted during a
       breather printed "0 of 3 main rounds" under thirty-four minutes of work.
       It is the outcome authority's number now, the same one the XP is priced
       on and the parent report will show tomorrow. */
    roundsCompleted: dayRoundsDone,
    // "N of M main rounds", not a count of every block plus every round added
    // into one number and labelled "rounds". A care session trains no rounds at
    // all, so it says nothing rather than "0 of 0".
    showRoundsLine: completionState !== "recovery" && !explore,
    roundsLine: `${dayRoundsDone} of ${dayRoundsAsked} main round${dayRoundsAsked === 1 ? "" : "s"}`,
    /* And WHY a round did not count, in her own words, one line each. A bare
       zero next to a session she remembers finishing is the thing that sent a
       grown-up digging through an exported ledger — the app knew which move fell
       short the whole time and simply never said. */
    roundShortNotes,
    xpEarned: sess.xpEarned, leveledUp: sess.leveledUp,
    /* MOOD, REFLECTION AND THE QUIZ ONLY EXIST IF THERE IS A RECORD TO PUT
       THEM ON.

       All three write through patchSession, which finds the row by its key —
       and when the save failed there IS no row. So the controls rendered, took
       her taps, acknowledged them on screen, and dropped every one: the quiz
       could not pay its XP either. Asking a kid how it felt and then losing the
       answer is worse than not asking, and it happens exactly when she is
       already being told something went wrong.

       A failed save shows what to do about it instead — see the recovery block
       on the finish screen. */
    showCompletionExtras: sessionDone && completionState !== "save-failed" && !explore,
    moodOpts, moodAck: sess.mood ? MOOD_ACK[sess.mood] : "",
    showReflection: sessionDone && completionState !== "save-failed" && !!sess.mood,
    reflectWellOpts, reflectNextOpts,
    quizQuestion: QZ.q, quizOpts, quizAnswered, quizWhy: QZ.why,
    quizFeedback,
    quizFeedbackColor: quizCorrect ? "var(--mint-ink)" : "var(--coral)"
  };
}

/* Keep the move she is ON in the middle of the exercise list.

   renderSession() replaces the whole screen on every phase change, so the
   list came back scrolled to the top every time and the current move walked
   off the bottom as the session ran. The journey map solved this already
   (journeyPathScrollIntoView in vm/today.js); this is the same three lines
   WITHOUT its run-once latch, because here it has to happen again at every
   phase. Assigning scrollTop is instant, so there is no motion to reduce. */
export function sessionListScrollIntoView(rootEl) {
  const el = rootEl && rootEl.querySelector("[data-ex-list]");
  if (!el) return;
  const put = () => {
    const cur = el.querySelector("[data-ex-cur]");
    if (cur) el.scrollTop = Math.max(0, cur.offsetTop - el.clientHeight / 2 + cur.offsetHeight / 2);
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(put); else put();
}
