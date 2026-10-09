/* BACK KEEPS WHAT IS DONE — "◀ Back" is for redoing one move, not the walk.

   Going back used to undo everything from the target step on: every move she
   had finished after it lost its row, came off the day's progress record, and
   had to be done again. The rule now:

     · Going back keeps the results of the moves she passed. After the redone
       move the runner skips every step that already has a DONE result and
       returns to where she was; a partial or skipped step is walked again.
     · A done result is never downgraded: Skip or an early Done on a move she
       went back to does not turn its done into skipped or partial.

   (Back from an unfinished move still restarts it — leadin.mjs section 4.)
   Cases f and g: going back over the end of a round and block, and going
   back twice from a rest.

   Sport-agnostic: nothing here names a move. The suite borrows three moves in
   a row from a main circuit of whatever plan this core is under.

   Every check is collected rather than thrown, so one run gives the full count
   of what is wrong, case by case. */
import { engine, data, store, outcome, svm, runSession } from "./harness.mjs";

const failures = [];
let passed = 0;
let caseLabel = "";
const check = (cond, msg) => {
  if (cond) { passed++; return; }
  failures.push("[" + caseLabel + "] " + msg);
};
const answerChecks = (sess) => {
  if (sess.phase === "formcheck") { engine.pickClean(); return true; }
  if (sess.phase === "repcheck") { engine.answerRepCheck("some"); return true; }
  return false;
};
const LIGHT = "red";
const plain = (e) => e && !e.eachSide && !e.leadInSeconds;

/* Three consecutive moves of a main circuit: A timed and long enough to be cut
   short (so an early Done is partial), B and C plain, all unique in the day. */
function pick() {
  for (const k of Object.keys(data.DAYS)) {
    if (data.DAYS[k].spa) continue;
    const cs = engine.assembleCircuits(k, LIGHT, { gated: false });
    const names = cs.flatMap(x => x.exercises).map(e => e.name);
    const unique = (e) => names.filter(n => n === e.name).length === 1;
    for (const c of cs) {
      if (c.block !== "main") continue;
      for (let i = 0; i + 2 < c.exercises.length; i++) {
        const [A, B, C] = c.exercises.slice(i, i + 3);
        if (!A.byReps && Number(A.work) >= 15 && [A, B, C].every(e => plain(e) && unique(e)))
          return { day: k, A, B, C, rounds: c.rounds };
      }
    }
  }
  return null;
}
const P = pick();
caseLabel = "setup";
check(!!P, "the plan has a main circuit with a timed move followed by two plain moves");
if (!P) { report(); }

const on = (sess, ex) => !!sess.currentEx && sess.currentEx.name === ex.name;
const working = (sess, ex) => on(sess, ex) && (ex.byReps ? sess.phase === "reps"
  : sess.phase === "work" && sess.timerMax === Number(ex.work) && sess.timerSecs < sess.timerMax);
const workedFor = (sess) => sess.timerMax - sess.timerSecs;
const movingOn = (sess, ex) => on(sess, ex) && ["work", "reps", "sideswitch"].includes(sess.phase);
const rowsOf = (ledger, ex) => (ledger || []).filter(l => l.block === "main" && l.name === ex.name);
const mergedStatus = (ledger, ex) => {
  const r = outcome.mergeLedgerRows(ledger || []).find(l => l.block === "main" && l.name === ex.name);
  return r ? r.status : null;
};
const progress0 = (day) => store.loadDayProgress(day) || { moves: {}, rows: [] };
const progress = () => progress0(P.day);
const banked = (prog, ex) => ((prog.moves || {}).main || []).includes(ex.name);
const progRowDone = (prog, ex) => (prog.rows || []).some(r => r.block === "main" && r.name === ex.name && r.status === "done");
const recordFor = () => outcome.dayRecords().filter(r => r.dayKey === P.day && !r.care).pop() || null;
const planStatus = (rec, ex) => {
  const m = rec && rec.plan && (rec.plan.moves || []).find(x => x.block === "main" && x.name === ex.name && Number(x.round || 1) === 1);
  return m ? m.status : null;
};
const exStatusOf = (s, ex) => {
  const c = (s.circuits || []).findIndex(x => x.block === "main" && x.exercises.some(e => e.name === ex.name));
  if (c < 0) return null;
  return s.exStatus[c + "-" + s.circuits[c].exercises.findIndex(e => e.name === ex.name)];
};
const guarded = async (label, fn) => {
  caseLabel = label;
  try { await fn(); } catch (e) { failures.push("[" + label + "] threw: " + (e && e.stack || e)); }
  engine.exitSession();
};

/* The script shared by (a) and (e): cut A short, finish B, then from C go back
   to B and from B back to A. `onBackAtA` runs on the first tick A is current
   again; the result says what was seen. */
async function cutAThenBackTwice({ onBackAtA, wipe = true } = {}) {
  const seen = { stage: 0, snapAtA: null, afterA: null, cutRow: null };
  const s = await runSession({ dayKey: P.day, light: LIGHT, gateUnlocked: true, wipe }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (seen.stage === 0 && working(sess, P.A) && workedFor(sess) >= 6) { engine.advance(); seen.stage = 1; return; }
      if (seen.stage === 1 && working(sess, P.C)) { engine.goBackExercise(); seen.stage = 2; return; }
      if (seen.stage === 2 && working(sess, P.B)) { engine.goBackExercise(); seen.stage = 3; return; }
      if (seen.stage === 3 && on(sess, P.A)) {
        seen.stage = 4;
        seen.snapAtA = JSON.parse(JSON.stringify(progress()));
        if (onBackAtA) onBackAtA(sess);
        return;
      }
      if (seen.stage === 4 && !on(sess, P.A)) { seen.stage = 5; seen.afterA = sess.currentEx ? sess.currentEx.name : null; }
    }
  });
  return { s, seen };
}

/* ---- a) Back over a finished move keeps it; the walk returns to where she was ---- */
await guarded("a", async () => {
  const { s, seen } = await cutAThenBackTwice();
  check(seen.stage >= 4, "setup: Done early on A, then Back from C to B and from B to A all happened (stage " + seen.stage + ")");
  const ledgerAtA = seen.snapAtA || { moves: {}, rows: [] };
  check(banked(ledgerAtA, P.B), "when Back lands on A, B is still banked on the day's progress record ("
    + JSON.stringify((ledgerAtA.moves || {}).main || []) + ")");
  check(progRowDone(ledgerAtA, P.B), "and the progress record still holds B's done row");
  check(seen.afterA === P.C.name, "after A is redone the runner goes straight to C, where she was (went to "
    + seen.afterA + ")");
  check(mergedStatus(s.ledger, P.A) === "done", "A ends done (" + mergedStatus(s.ledger, P.A) + ")");
  check(mergedStatus(s.ledger, P.B) === "done", "B ends done (" + mergedStatus(s.ledger, P.B) + ")");
  const bRows = rowsOf(s.ledger, P.B);
  check(bRows.length >= 1 && bRows.every(r => r.status === "done"),
    "B's rows are never downgraded: " + JSON.stringify(bRows.map(r => r.status)));
  check(rowsOf(s.ledger, P.B).length === 1, "B is not walked a second time (" + bRows.length + " rows)");
  const rec = recordFor();
  check(planStatus(rec, P.A) === "done" && planStatus(rec, P.B) === "done",
    "the day record has A and B done (" + planStatus(rec, P.A) + ", " + planStatus(rec, P.B) + ")");
});

/* ---- b) and c) A done result is never downgraded by Skip or an early Done ---- */
async function backToDoneA(label, act) {
  await guarded(label, async () => {
    const seen = { stage: 0 };
    const s = await runSession({ dayKey: P.day, light: LIGHT, gateUnlocked: true }, {
      onTick: (ms, sess) => {
        if (answerChecks(sess)) return;
        if (seen.stage === 0 && working(sess, P.B)) {
          seen.aBefore = mergedStatus(sess.ledger, P.A);
          engine.goBackExercise(); seen.stage = 1; return;
        }
        if (seen.stage === 1 && working(sess, P.A) && workedFor(sess) >= 4) { act(); seen.stage = 2; return; }
        // The day's progress record is read as she leaves A — a finished day
        // clears it, so the end of the session is too late to look.
        if (seen.stage === 2 && !working(sess, P.A) && !seen.snap) seen.snap = JSON.parse(JSON.stringify(progress()));
      }
    });
    check(seen.stage === 2 && seen.aBefore === "done",
      "setup: A ran in full (" + seen.aBefore + "), then Back from B to A and the tap on A happened (stage " + seen.stage + ")");
    check(mergedStatus(s.ledger, P.A) === "done", "A's merged row stays done (" + mergedStatus(s.ledger, P.A) + ")");
    if (P.rounds === 1) check(exStatusOf(s, P.A) === "done", "A's status on the list stays done (" + exStatusOf(s, P.A) + ")");
    const snap = seen.snap || { moves: {}, rows: [] };
    check(banked(snap, P.A), "A stays banked on the day's progress record as she leaves it ("
      + JSON.stringify((snap.moves || {}).main || []) + ")");
    check(progRowDone(snap, P.A), "and the progress record still holds A's done row");
    const rec = recordFor();
    check(planStatus(rec, P.A) === "done", "the day record keeps A done (" + planStatus(rec, P.A) + ")");
  });
}
await backToDoneA("b", () => engine.skipCurrentExercise());
await backToDoneA("c", () => engine.advance());

/* ---- f) Back over the end of a round and block: the bookkeeping waits for the rows ----
   X then Y close main (one round under red). X is skipped, so the round has
   not counted; from the rest after Y she goes back to Y, then from Y to X,
   and redoes X in full. Y is done, so the walk returns over it — and only
   then is the round closed: it counts, main is recorded done, no round_short. */
function pickEnd() {
  for (const k of Object.keys(data.DAYS)) {
    if (data.DAYS[k].spa) continue;
    const cs = engine.assembleCircuits(k, LIGHT, { gated: false });
    const names = cs.flatMap(x => x.exercises).map(e => e.name);
    const unique = (e) => names.filter(n => n === e.name).length === 1;
    const mi = cs.findIndex(c => c.block === "main");
    const c = cs[mi];
    if (mi < 0 || mi === cs.length - 1 || c.rounds !== 1 || c.exercises.length < 2) continue;
    const [X, Y] = c.exercises.slice(-2);
    // Y may be two-sided: it only has to be on the move list as done.
    if (plain(X) && Y && !Y.leadInSeconds && [X, Y].every(unique)) return { day: k, X, Y };
  }
  return null;
}
await guarded("f", async () => {
  const E = pickEnd();
  check(!!E, "setup: a plan whose one-round main ends on a plain move and one with no lead-in, with a block after it");
  if (!E) return;
  const RESTS = ["rest", "roundRest", "sectionRest"];
  const seen = { stage: 0, walkedY: false, snap: null, shortBefore: null };
  const shorts = () => store.loadEvents().filter(e => e.type === "round_short").length;
  const s = await runSession({ dayKey: E.day, light: LIGHT, gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (seen.shortBefore === null) seen.shortBefore = shorts();
      if (seen.stage === 0 && working(sess, E.X)) { engine.skipCurrentExercise(); seen.stage = 1; return; }
      if (seen.stage === 1 && on(sess, E.Y) && RESTS.includes(sess.phase) && engine.canGoBack()) { engine.goBackExercise(); seen.stage = 2; return; }
      if (seen.stage === 2 && movingOn(sess, E.Y)) { engine.goBackExercise(); seen.stage = 3; return; }
      if (seen.stage === 3 && working(sess, E.X)) { seen.stage = 4; return; }
      if (seen.stage === 4) {
        if (movingOn(sess, E.Y)) seen.walkedY = true;
        const c = sess.circuits[sess.ci];
        if (c && c.block !== "main" && (sess.phase === "work" || sess.phase === "reps")) {
          seen.snap = JSON.parse(JSON.stringify(progress0(E.day)));
          seen.shortAfter = shorts();
          seen.stage = 5;
        }
      }
    }
  });
  check(seen.stage === 5, "setup: X skipped, Back from the rest after Y, Back from Y to X, X redone, next block reached (stage " + seen.stage + ")");
  check(mergedStatus(s.ledger, E.X) === "done", "X ends done (" + mergedStatus(s.ledger, E.X) + ")");
  const yRows = rowsOf(s.ledger, E.Y);
  check(yRows.length === 1 && yRows[0].status === "done", "Y keeps its one done row: " + JSON.stringify(yRows.map(r => r.status)));
  check(!seen.walkedY, "Y is not walked again after the redo");
  check(seen.shortAfter === seen.shortBefore, "no round_short is logged for the round (" + seen.shortBefore + " → " + seen.shortAfter + ")");
  const snap = seen.snap || {};
  check((snap.done || []).includes("main"), "main is recorded done on the day's progress record ("
    + JSON.stringify(snap.done || []) + ", rounds " + snap.mainRoundsCompleted + ")");
  check(s.roundsCompleted === 1, "the round counts once (" + s.roundsCompleted + ")");
});

/* ---- g) Back from a rest, then Back again: the move she had finished stays done ----
   From the rest after B she goes back to B, then from B to A. After A the walk
   returns past B — she had finished it — and goes on to C. */
await guarded("g", async () => {
  const seen = { stage: 0, walkedB: false, after: null };
  const RESTS = ["rest", "roundRest", "sectionRest"];
  const s = await runSession({ dayKey: P.day, light: LIGHT, gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (seen.stage === 0 && on(sess, P.B) && RESTS.includes(sess.phase) && engine.canGoBack()) { engine.goBackExercise(); seen.stage = 1; return; }
      if (seen.stage === 1 && working(sess, P.B)) { engine.goBackExercise(); seen.stage = 2; return; }
      if (seen.stage === 2 && working(sess, P.A)) { seen.stage = 3; return; }
      if (seen.stage === 3) {
        if (working(sess, P.B)) seen.walkedB = true;
        if ((sess.phase === "work" || sess.phase === "reps") && !on(sess, P.A) && !on(sess, P.B)) {
          seen.after = sess.currentEx.name; seen.stage = 4;
        }
      }
    }
  });
  check(seen.stage === 4, "setup: Back from the rest after B, Back from B to A, A redone (stage " + seen.stage + ")");
  check(!seen.walkedB, "B is not walked a third time");
  check(seen.after === P.C.name, "after A the walk goes on to C (" + seen.after + ")");
  const bRows = rowsOf(s.ledger, P.B);
  check(bRows.length === 1 && bRows[0].status === "done", "B keeps its one done row: " + JSON.stringify(bRows.map(r => r.status)));
  if (P.rounds === 1) check(exStatusOf(s, P.B) === "done", "B's status on the list stays done (" + exStatusOf(s, P.B) + ")");
});

/* ---- e) A stop after Back, then a resume: B's done result is still there ---- */
await guarded("e", async () => {
  const first = await cutAThenBackTwice({ onBackAtA: () => engine.endEarly() });
  check(first.seen.stage >= 4, "setup: the two Backs happened and the sitting was stopped on A (stage " + first.seen.stage + ")");
  const stopped = recordFor();
  check(planStatus(stopped, P.B) === "done", "the stopped sitting's day record has B done (" + planStatus(stopped, P.B) + ")");
  check(banked(progress(), P.B), "and B is banked for the resume");
  engine.exitSession();

  let pillB = null, walkedB = false, fv = null;
  const s = await runSession({ dayKey: P.day, light: LIGHT, gateUnlocked: true, wipe: false }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (on(sess, P.B)) walkedB = true;
      if (pillB === null && (sess.phase === "work" || sess.phase === "reps")) {
        const vm = svm.buildSessionVM({ inSession: true, detailOverlay: false, detailEx: null, isWide: true });
        const row = (vm.sessionExList || []).find(r => r.isEx && r.name === P.B.name);
        pillB = row ? row.statusIcon : "(not listed)";
      }
    }
  });
  check(pillB === "✓", "on the resume B's pill reads done (" + JSON.stringify(pillB) + ")");
  check(!walkedB, "the resume does not walk B again");
  fv = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
  check(!(fv.notFull || []).some(r => r.name === P.B.name),
    "the finish screen's short list does not name B: " + JSON.stringify((fv.notFull || []).map(r => r.name)));
  const rec = recordFor();
  const owed = rec && rec.plan ? outcome.shortRoundsByMoveFromPlan(rec.plan.moves || []) : new Map();
  const g = owed.get("main|" + P.B.name);
  check(!g || !g.short.length, "and the day record owes nothing for B: " + JSON.stringify(g && g.short));
  check(planStatus(rec, P.B) === "done", "the day record has B done after the resume (" + planStatus(rec, P.B) + ")");
  void s;
});

report();

function report() {
  if (!failures.length) {
    console.log("✓ back: " + passed + " checks passed");
    process.exit(0);
  }
  const byCase = {};
  failures.forEach(f => { const k = f.slice(1, f.indexOf("]")); byCase[k] = (byCase[k] || 0) + 1; });
  console.error(failures.map(f => "FAIL: " + f).join("\n"));
  console.error("FAIL: back: " + failures.length + " failing checks ("
    + Object.entries(byCase).map(([k, n]) => k + ": " + n).join(", ") + "), " + passed + " passed");
  process.exit(1);
}
