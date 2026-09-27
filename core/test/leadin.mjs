/* THE LEAD-IN — "Get on the bar" before a move that starts hanging.

   A pull-up's rest already carries the setup seconds (see needsSetup), but the
   move itself started counting the instant its name was said: rep one was
   being counted while she was still reaching for the bar. A move that says
   `leadInSeconds` gets that many seconds of get-ready AFTER its announcement
   and BEFORE its first rep or its work clock — and those seconds are not work.

   Sport-agnostic: nothing here names a move. The suite borrows one rep move
   and one timed move from whatever plan this core is under, gives each a
   five-second lead-in for the length of a run, and compares the run with the
   same run without it. The app's own suite (test/) proves which real moves
   carry the field. */
import { engine, data, svm, sscreen, store, runSession, setSpeechDelay, spoken } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const LEAD = 5;
const voiceOn = () => store.updateSettings({ coachSpeechOn: true, voiceStyle: "classic" });
const answerChecks = (sess) => {
  if (sess.phase === "formcheck") { engine.pickClean(); return true; }
  if (sess.phase === "repcheck") { engine.answerRepCheck("some"); return true; }
  return false;
};

/* A move that is not the first of its circuit (so Back has somewhere to go),
   not two-sided, and runs under a red light (one main round, a short run). */
function pick(pred) {
  for (const k of Object.keys(data.DAYS)) {
    if (data.DAYS[k].spa) continue;
    const cs = engine.assembleCircuits(k, "red", { gated: false });
    for (const c of cs) for (let i = 1; i < c.exercises.length; i++) {
      const ex = c.exercises[i];
      if (pred(ex) && !ex.eachSide && !ex.leadInSeconds
          && cs.flatMap(x => x.exercises).filter(e => e.name === ex.name).length === 1) return { day: k, ex };
    }
  }
  return null;
}
const repPick   = pick(e => e.byReps && e.prescription && !e.prescription.keepGoingSeconds && !e.prescription.repsHigh);
const timedPick = pick(e => !e.byReps && e.work > 0);
ok(repPick && timedPick, "the plan has a rep move and a timed move to borrow");

const withLeadIn = async (target, fn) => {
  target.ex.leadInSeconds = LEAD;
  try { return await fn(); } finally { delete target.ex.leadInSeconds; }
};

/* Watches one move through a run: when its lead-in was first on screen, when
   its work first was, and whatever the script asks for at the lead-in. */
async function watch(target, { onLeadIn, voice = false } = {}) {
  const name = target.ex.name;
  const seen = { firstTick: -1, firstPhase: null, leadAt: -1, workAt: -1, leadHtml: "", stepIdx: -1, stepsAfterBack: [] };
  let acted = false;
  const s = await runSession({ dayKey: target.day, light: "red", gateUnlocked: true, seed: voice ? voiceOn : undefined }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      const on = sess.currentEx && sess.currentEx.name === name;
      if (!on) { if (acted && seen.stepsAfterBack.length < 3) seen.stepsAfterBack.push(sess.stepIdx); return; }
      if (seen.firstTick < 0) { seen.firstTick = ms; seen.firstPhase = sess.phase; seen.stepIdx = sess.stepIdx; }
      if (sess.phase === "getready" && seen.leadAt < 0) {
        seen.leadAt = ms;
        try {
          seen.leadHtml = sscreen.sessionScreen(svm.buildSessionVM(
            { inSession: true, detailOverlay: false, detailEx: null, isWide: true }));
        } catch (e) { seen.leadHtml = "render failed: " + e.message; }
        if (onLeadIn && !acted) { acted = true; onLeadIn(sess); return; }
      }
      const working = target.ex.byReps ? sess.phase === "reps"
        : sess.phase === "work" && sess.timerMax === target.ex.work && sess.timerSecs < sess.timerMax;
      if (working && seen.workAt < 0) seen.workAt = ms;
    }
  });
  return { s, seen, row: s.ledger.find(l => l.name === name) };
}

/* ---- 1. A rep move: nothing is counted during the lead-in ---- */
{
  const base = await watch(repPick);
  const lead = await withLeadIn(repPick, () => watch(repPick));
  ok(base.seen.firstPhase === "reps", "without a lead-in the rep move starts counting at once (" + base.seen.firstPhase + ")");
  ok(lead.seen.firstPhase === "getready", "with one, the move opens on the get-ready screen (" + lead.seen.firstPhase + ")");
  ok(lead.seen.leadAt >= 0 && lead.seen.workAt - lead.seen.leadAt >= (LEAD - 1) * 1000,
     "and no rep is counted for the first " + LEAD + "s (reps began " + (lead.seen.workAt - lead.seen.leadAt) + " ms after the lead-in)");
  ok(/Get on the bar/.test(lead.seen.leadHtml), "the screen reads \"Get on the bar\" during the lead-in");
  ok(lead.row && base.row && lead.row.status === base.row.status && lead.row.status === "done",
     "the move is graded exactly as without the lead-in (" + (lead.row && lead.row.status) + ")");
  ok(lead.row.repsCounted === base.row.repsCounted && lead.row.repsCounted === lead.row.repsPlanned,
     "every rep is counted, same as before (" + lead.row.repsCounted + " of " + lead.row.repsPlanned + ")");
  ok(Math.abs(lead.row.actualSecs - base.row.actualSecs) <= 1,
     "and the lead-in is not charged as work (" + lead.row.actualSecs + "s vs " + base.row.actualSecs + "s)");
  // Observed on one-second ticks, so the edges are a tick wide.
  ok(lead.seen.workAt - lead.seen.leadAt <= (LEAD + 1) * 1000,
     "and the lead-in is " + LEAD + "s, not longer (" + (lead.seen.workAt - lead.seen.leadAt) + " ms)");
  ok(lead.s.elapsed > base.s.elapsed, "the session is longer by the lead-in (" + base.s.elapsed + "s → " + lead.s.elapsed + "s)");
}

/* ---- 2. A timed move: the work clock starts only after the lead-in ---- */
{
  const base = await watch(timedPick);
  const lead = await withLeadIn(timedPick, () => watch(timedPick));
  ok(base.seen.firstPhase === "work", "without a lead-in the timed move starts at once (" + base.seen.firstPhase + ")");
  ok(lead.seen.firstPhase === "getready", "with one, it opens on the get-ready screen (" + lead.seen.firstPhase + ")");
  ok(lead.seen.workAt - lead.seen.leadAt >= (LEAD - 1) * 1000,
     "and the work clock does not move for the first " + LEAD + "s (" + (lead.seen.workAt - lead.seen.leadAt) + " ms)");
  ok(/Get on the bar/.test(lead.seen.leadHtml), "the screen reads \"Get on the bar\" during the lead-in");
  ok(lead.row.plannedSecs === base.row.plannedSecs && lead.row.plannedSecs === timedPick.ex.work,
     "the planned work is the move's own work, not work plus lead-in (" + lead.row.plannedSecs + "s)");
  ok(Math.abs(lead.row.actualSecs - base.row.actualSecs) <= 1 && lead.row.status === base.row.status && lead.row.status === "done",
     "the recorded work and the grade are unchanged (" + lead.row.actualSecs + "s " + lead.row.status + ")");
}

/* ---- 3. Done during the lead-in starts the work; it does not end the move ---- */
{
  let tappedAt = -1;
  const r = await withLeadIn(repPick, () => watch(repPick, {
    onLeadIn: () => { tappedAt = Date.now(); engine.advance(); }
  }));
  ok(r.seen.leadAt >= 0, "Done was tapped during the lead-in");
  ok(r.seen.workAt >= 0 && r.seen.workAt - r.seen.leadAt <= 2000,
     "the reps started straight away (" + (r.seen.workAt - r.seen.leadAt) + " ms after the tap)");
  ok(r.row && r.row.status === "done" && r.row.repsCounted === r.row.repsPlanned,
     "and the move ran in full — the tap ended the wait, not the move (" + (r.row && r.row.status) + ", "
     + (r.row && r.row.repsCounted) + " of " + (r.row && r.row.repsPlanned) + ")");
  const t = await withLeadIn(timedPick, () => watch(timedPick, { onLeadIn: () => engine.advance() }));
  ok(t.seen.workAt >= 0 && t.seen.workAt - t.seen.leadAt <= 2000, "a timed move's clock starts straight away too");
  ok(t.row && t.row.status === "done" && t.row.actualSecs >= timedPick.ex.work - 1,
     "and runs its whole work (" + (t.row && t.row.actualSecs) + "s of " + timedPick.ex.work + "s, " + (t.row && t.row.status) + ")");
}

/* ---- 4. Skip, Back and STOP during the lead-in ---- */
{
  const sk = await withLeadIn(repPick, () => watch(repPick, { onLeadIn: () => engine.skipCurrentExercise() }));
  ok(sk.row && sk.row.status === "skipped", "Skip during the lead-in skips the move (" + (sk.row && sk.row.status) + ")");
  ok(sk.seen.workAt < 0, "and no rep of it is counted");
  ok(!sk.s.stopReason && sk.s.ledger.length > sk.s.ledger.indexOf(sk.row) + 1, "and the session carries on to the next move");

  let could = null;
  const bk = await withLeadIn(repPick, () => watch(repPick, {
    onLeadIn: () => { could = engine.canGoBack(); engine.goBackExercise(); }
  }));
  ok(could === true, "Back is offered during the lead-in");
  ok(bk.seen.stepsAfterBack[0] === bk.seen.stepIdx - 1, "and it goes back to the move before (step "
     + bk.seen.stepsAfterBack[0] + ", was " + bk.seen.stepIdx + ")");
  ok(bk.s.ledger.filter(l => l.name === repPick.ex.name).length === 1 && bk.row.status === "done",
     "then the move comes round again and is done once");

  const st = await withLeadIn(repPick, () => watch(repPick, { onLeadIn: () => engine.endFromStop("break") }));
  ok(!st.s.running && !st.row, "STOP during the lead-in ends the session with the move unrecorded");
}

/* ---- 5. What the coach says ---- */
{
  const lines = (target) => {
    const i = spoken.findIndex(t => t.includes(target.ex.name));
    return i < 0 ? [] : spoken.slice(i);
  };
  spoken.length = 0;
  await withLeadIn(repPick, () => watch(repPick, { voice: true }));
  let after = lines(repPick);
  let bar = after.findIndex(t => /Get on the bar\.$/.test(t));
  ok(bar >= 0, "the coach says \"Get on the bar.\" for a lead-in move: " + JSON.stringify(after.slice(0, 3)));
  ok(!after.slice(0, bar).some(t => t === "Go" || / Go\.$/.test(t)), "and never \"Go\" before it");
  ok(after.slice(bar + 1, bar + 3).includes("Go."), "then \"Go.\" when the count starts: " + JSON.stringify(after.slice(bar, bar + 3)));

  spoken.length = 0;
  await withLeadIn(timedPick, () => watch(timedPick, { voice: true }));
  after = lines(timedPick);
  bar = after.findIndex(t => /Get on the bar\.$/.test(t));
  ok(bar >= 0, "a timed lead-in move gets \"Get on the bar.\" too: " + JSON.stringify(after.slice(0, 3)));
  ok(!after.slice(0, bar + 3).some(t => /Three, two, one, go\.$/.test(t)), "not \"Three, two, one, go.\" followed by a wait");
  ok(after.slice(bar + 1, bar + 3).includes("Go."), "and \"Go.\" when the clock starts");

  // The same moves without the field: their lines are what they always were.
  spoken.length = 0;
  await watch(timedPick, { voice: true });
  after = lines(timedPick);
  // Up to the next rest: the day may hold a real lead-in move of its own later on.
  const nextRest = after.findIndex((t, i) => i > 0 && /^(Rest|Round|Block)\b/.test(t));
  const upToRest = nextRest < 0 ? after : after.slice(0, nextRest);
  ok(upToRest.length > 1 && !upToRest.some(t => /Get on the bar/.test(t)),
     "a move without a lead-in is never told to get on the bar: " + JSON.stringify(upToRest.slice(0, 4)));
  setSpeechDelay(0);
}

/* ---- 6. The session estimate carries the lead-in, once per occurrence ---- */
{
  const circuits = engine.assembleCircuits(repPick.day, "green", { gated: false });
  const occurrences = circuits.reduce((n, c) => {
    for (let r = 1; r <= c.rounds; r++) c.exercises.forEach(ex => {
      if (ex === repPick.ex && !(ex.rounds && r > ex.rounds)) n++;
    });
    return n;
  }, 0);
  ok(occurrences >= 1, "the borrowed move is in the green plan (" + occurrences + "×)");
  const without = engine.estimateSessionSecs(circuits);
  const withIt = await withLeadIn(repPick, async () => engine.estimateSessionSecs(circuits));
  ok(withIt - without === LEAD * occurrences,
     "estimateSessionSecs grows by exactly " + LEAD + "s per occurrence (" + (withIt - without) + " for " + occurrences + ")");
  ok(engine.refTime(repPick.ex) === (await withLeadIn(repPick, async () => engine.refTime(repPick.ex))),
     "the per-move work yardstick does not (the lead-in is not work)");
}

/* ---- 7. The move factory keeps the field, and only a real one ---- */
{
  const X = data.X;
  ok(X({ name: "A", work: 30, leadInSeconds: 5 }).leadInSeconds === 5, "X() keeps leadInSeconds");
  ok(X({ name: "A", repsDetail: "5 reps", leadInSeconds: 5 }).leadInSeconds === 5, "on a rep move too");
  ok(!("leadInSeconds" in X({ name: "A", work: 30 })), "and adds nothing to a move without it");
  ok(!X({ name: "A", work: 30, leadInSeconds: 0 }).leadInSeconds && !X({ name: "A", work: 30, leadInSeconds: "x" }).leadInSeconds,
     "a zero or nonsense lead-in is no lead-in");
}

console.log("✓ lead-in: " + passed + " checks passed");
process.exit(0);
