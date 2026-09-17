/* ============================================================
   INVARIANTS — the properties, not the implementations.

   Every other test in this repo asserts that a particular function returns a
   particular number. That is how a whole class of defect got here anyway: the
   fix was tested where it was made, and nothing ever asked whether the four
   screens that answer for the same workout AGREE.

   They did not. A green day trained in two sittings, on one device, with no
   cloud involved:

     the finish screen  3 of 3 main rounds        the reports  2 of 3
     the journey        360 XP                    Today        +450 XP earned
     Progress           "2" ...directly above ... "1 session"

   So the questions here are asked of the app, not of a module, and the answers
   have to match. A test that fails here is the app contradicting itself to a
   ten-year-old, which is the failure that matters.

   Run by `npm test`.
   ============================================================ */

import { data, util, store, engine, outcome, svm, tvm, pvm, gvm, gscreen, overlays,
         runSession, answerChecks } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const same = (a, b, msg) => ok(a === b, msg + " (got " + JSON.stringify(a) + ", wanted " + JSON.stringify(b) + ")");

/* ============================================================
   1. ONE GREEN DAY, TWO SITTINGS, ONE ANSWER EVERYWHERE
   ============================================================ */

/* Sitting one: a clean first main round, then she stops. */
const first = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.roundsCompleted >= 1 && sess.running) engine.endEarly();
  }
});
const frag1 = first.savedEntry;
ok(frag1, "the first sitting saved a record");
const carried = JSON.parse(JSON.stringify(store.loadDayProgress("tuesday")));
same(Number(carried.mainRoundsCompleted), 1, "and banked exactly the round it finished");

/* Sitting two: she comes back and finishes the day. */
const second = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", carried) }, answerChecks());
const frag2 = second.savedEntry;
ok(frag2, "the second sitting saved a record");
ok(frag1 !== frag2, "and the two sittings are two records — the harness used to hand back one twice");
same(frag2.workoutInstanceId, frag1.workoutInstanceId, "both fragments belong to one workout");

/* --- the rounds are the day's, and no two sittings claim the same one --- */
const roundsIn = f => [...new Set((f.ledger || []).filter(l => l.block === "main").map(l => l.round))].sort();
same(JSON.stringify(roundsIn(frag1)), "[1]", "sitting one trained round one");
same(JSON.stringify(roundsIn(frag2)), "[2,3]", "sitting two trained rounds TWO AND THREE, not one and two");

const workout = outcome.workoutInstances([frag1, frag2])[0];
same(outcome.workoutInstances([frag1, frag2]).length, 1, "two fragments are one workout");
same(workout.outcome.mainRoundsDone, 3, "the workout did three main rounds");
same(workout.outcome.state, "complete", "and reads complete");
ok(workout.outcome.countsForStreak, "and earns its streak day");

/* --- and the finish screen says the same thing the reports will --- */
const finishVM = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
same(finishVM.roundsLine, "3 of 3 main rounds",
  "the finish screen and the reports agree about the rounds — they used to say 3 of 3 and 2 of 3");

/* --- put the day in the log and ask every screen --- */
const today = util.edmontonDayKey();
localStorage.clear(); store.migrate();
[frag1, frag2].forEach((f, i) => store.saveSession({ ...f, dayKey: today,
  isoDate: new Date(Date.now() - (1 - i) * 3600000).toISOString() }));
store.rebuildJourneyXp();

const journeyXp = (store.loadJourney() || {}).xp;
same(journeyXp, 360, "one green day is worth 360 XP");

const tv = tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: true });
same(tv.dayView.earnedXpLabel, "+360 XP earned",
  "Today quotes what the day was actually paid — it used to add the two stamps and print 450");
same(tv.statChips[0].value, "1", "Today's streak chip counts the day once");
same(tv.statChips[2].value, "1", "and calls a day trained in two goes one session");

const pv = pvm.buildProgressVM({ progressScope: "4w", logScope: "week" });
same(pv.sessionsVal, "1", "Progress's session number is a workout count");
same(pv.sessionsLabel, "1 session", "and its label says the same thing the number does");
const rowOf = label => pv.periodStats.rows.find(r => r.label === label);
same(rowOf("XP earned").total, "360", "Progress reports the settled XP, not the sum of the stamps");
same(rowOf("Main rounds").total, "3 of 3", "and all three main rounds");
same(rowOf("Completion status").total, "1 of 1", "and one workout, finished");
/* Derived from the two fragments, not written down as a constant: the point is
   that the minutes ADD, and pinning the sum meant any change to rest lengths
   (setup time for band and pull-up moves, say) failed this as if the additivity
   had broken. */
const bothMins = Math.round((frag1.durationSecs + frag2.durationSecs) / 60);
same(rowOf("Time").total, bothMins + "m", "minutes still add across the sittings — they are additive facts");

const gv = gvm.buildGrownupVM({ gsScope: "week", grownupTab: "analytics" });
const indOf = label => gv.analytics.indicators.find(r => r.label === label);
same(indOf("Completed").total, "1 of 1", "the Grown-up board counts the workout, not the sittings");
same(indOf("XP earned").total, "360", "and the settled XP");
same(gv.analytics.avgMins, bothMins, "the average duration is the workout's, not half of it");

/* THE INVARIANT ITSELF: no two screens may disagree about this day. */
const xpEverywhere = [
  journeyXp,
  Number(tv.dayView.earnedXpLabel.replace(/[^0-9]/g, "")),
  Number(rowOf("XP earned").total.replace(/[^0-9]/g, "")),
  Number(indOf("XP earned").total.replace(/[^0-9]/g, ""))
];
ok(new Set(xpEverywhere).size === 1,
  "every screen reports the same XP for the same day (" + xpEverywhere.join(" / ") + ")");
const sessionsEverywhere = [Number(tv.statChips[2].value), Number(pv.sessionsVal), 1];
ok(new Set(sessionsEverywhere).size === 1,
  "every screen counts the same number of sessions (" + sessionsEverywhere.join(" / ") + ")");

/* ============================================================
   2. A MOVE IS PAID FOR ONCE, HOWEVER OFTEN IT IS ATTEMPTED
   ============================================================ */

const halfRow = { block: "warmup", round: 1, name: "Arm Circles", status: "partial",
                  driver: "time", actualSecs: 15, plannedSecs: 30 };
const sixTries = Array.from({ length: 6 }, (_, i) => ({
  workoutInstanceId: "farm", isoDate: `2026-09-01T0${i}:00:00.000Z`, dayKey: "monday",
  outcomeVersion: outcome.OUTCOME_VERSION, expectedWork: 4, ledger: [{ ...halfRow }]
}));
const farmed = outcome.workoutInstances(sixTries)[0];
ok(farmed.outcome.workRatio <= 0.5 / 4 + 1e-9,
  "one half-done move attempted six times is worth half a move (" + farmed.outcome.workRatio + ")");
ok(!farmed.outcome.countsForStreak,
  "so it cannot buy a streak day — six goes at one move used to clear the 75% bar");

/* A retry that goes BETTER is credited at its best, not its first. */
const tryThenDo = [
  { workoutInstanceId: "retry", isoDate: "2026-09-02T01:00:00.000Z", dayKey: "monday",
    outcomeVersion: outcome.OUTCOME_VERSION, expectedWork: 1,
    ledger: [{ block: "warmup", round: 1, name: "Arm Circles", status: "skipped" }] },
  { workoutInstanceId: "retry", isoDate: "2026-09-02T02:00:00.000Z", dayKey: "monday",
    outcomeVersion: outcome.OUTCOME_VERSION, expectedWork: 1,
    ledger: [{ block: "warmup", round: 1, name: "Arm Circles", status: "done" }] }
];
same(outcome.workoutInstances(tryThenDo)[0].outcome.state, "complete",
  "a move skipped in the morning and done after school reads as done");

/* ============================================================
   3. THE STREAK IS THE SAME NUMBER WHEREVER IT IS ASKED
   ============================================================ */

function dayOf(iso, rows, expected) {
  return { workoutInstanceId: "w" + iso + Math.random(), isoDate: iso, dayKey: "monday",
           lightResult: "green", outcomeVersion: outcome.OUTCOME_VERSION, xpVersion: 5,
           roundsPlanned: 3, expectedWork: expected, durationSecs: 900, ledger: rows };
}
const doneRow = n => ({ block: "warmup", round: 1, name: n, status: "done",
                        driver: "time", actualSecs: 30, plannedSecs: 30 });

/* A day split across two sittings that only clears the bar TOGETHER. */
const nowIso = new Date().toISOString();
const splitA = { ...dayOf(nowIso, [doneRow("a")], 4), workoutInstanceId: "split" };
const splitB = { ...dayOf(nowIso, [doneRow("b"), doneRow("c")], 4), workoutInstanceId: "split" };
localStorage.clear(); store.migrate();
[splitA, splitB].forEach(r => store.saveSession(r));
const rows = store.loadSessions();
ok(outcome.workoutInstances(rows)[0].outcome.countsForStreak,
  "three of four moves across two sittings clears the bar as one workout");
same(store.currentStreakOf(rows), 1,
  "and the streak counter agrees — it used to judge each sitting alone and show 0");
same(tvm.buildTodayVM({ selectedDay: util.edmontonDayKey(), expanded: {}, isWide: true }).statChips[0].value,
  "1", "as does the chip the kid actually reads");
same(pvm.buildProgressVM({ progressScope: "4w", logScope: "week" }).dayStreakVal,
  "1", "as does Progress");

/* 74% earns nothing, anywhere. */
localStorage.clear(); store.migrate();
store.saveSession(dayOf(nowIso, [doneRow("a"), doneRow("b"), doneRow("c")], 5));
same(store.currentStreakOf(store.loadSessions()), 0,
  "three of five is under the bar and earns no streak day");

/* ============================================================
   4. A RESUME MAY NOT RAISE THE LIGHT OR GROW THE PLAN
   ============================================================ */

const redRun = await runSession({ dayKey: "tuesday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.roundsCompleted >= 1 && sess.running) engine.endEarly();
  }
});
same(redRun.light, "red", "a red day runs red");
const redProg = JSON.parse(JSON.stringify(store.loadDayProgress("tuesday")));
same(redProg.lockedLight, "red", "and the day's progress remembers the light it was trained under");

const resumedGreen = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", redProg) }, answerChecks());
same(resumedGreen.light, "red",
  "resuming it under Green keeps it RED — the plan may not grow underneath her mid-workout");
same(resumedGreen.dayRoundsPlanned, 1, "so the day still asks for one main round, not three");

/* A later check may still LOWER it: a body with more to say shortens the rest. */
const greenRun = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.roundsCompleted >= 1 && sess.running) engine.endEarly();
  }
});
const greenProg = JSON.parse(JSON.stringify(store.loadDayProgress("tuesday")));
same(greenProg.lockedLight, "green", "a green day locks green");
const resumedRed = await runSession({ dayKey: "tuesday", light: "red", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", greenProg) }, answerChecks());
same(resumedRed.light, "red", "and a worse check on the way back still shortens what is left");
same(engine.lowerLight("green", "recovery"), "recovery", "recovery is the lightest dose there is");
same(engine.lowerLight("red", "yellow"), "red", "and the lower of two lights wins in either order");
same(engine.lowerLight("yellow", "red"), "red", "in either order");

/* ============================================================
   5. STORED TEXT IS TEXT, WHEREVER IT CAME FROM

   Firestore is unauthenticated by an explicit owner decision (see
   firestore.rules), and a backup is a file anyone can hand the app. So a
   record can carry markup in every string it holds, and the screens that
   render it must produce a literal, inert string.
   ============================================================ */

const HOSTILE = '<img src=x onerror="alert(1)">';
localStorage.clear(); store.migrate();
store.saveSession({
  isoDate: nowIso, dayKey: "monday", dayTitle: HOSTILE, sessionType: HOSTILE,
  lightResult: "green", suggestedLight: "red", durationSecs: 900, pain: true,
  mood: "great", intentWord: HOSTILE, wentWell: HOSTILE, nextTime: HOSTILE,
  outcomeVersion: outcome.OUTCOME_VERSION, xpVersion: 5, expectedWork: 2,
  roundsDone: 1, roundsPlanned: 3, endedEarly: true,
  ledger: [{ block: "main", round: 1, name: HOSTILE, status: "skipped" }],
  perExercise: [{ name: HOSTILE, skipped: true }],
  formChecks: [{ name: HOSTILE, clean: false }]
});
/* The screen is asked directly, with the real view-model behind it: the
   escaping lives in the renderer, and unlocking the gate is a different test's
   subject. Every tab, because the hostile string reaches several of them. */
const painted = ["overview", "analytics", "formcheck", "coaching", "library", "settings"]
  .map(tab => gscreen.grownupScreen({
    ...gvm.buildGrownupVM({ gsScope: "all", grownupTab: tab, isWide: true }),
    grownupUnlocked: true
  })).join("\n");
ok(painted.includes("&lt;img src=x"),
  "a hostile session title reaches the Grown-up Zone as literal text");
ok(!painted.includes(HOSTILE),
  "and the raw string appears nowhere — it used to go straight into innerHTML");
ok(!/<img\s+src=x/i.test(painted),
  "so it can never become an element");
/* Its quotes are escaped too, which is what stops it breaking OUT of an
   attribute it was interpolated into. (`onerror` on its own is not the test:
   the move library legitimately uses one for its photo fallback.) */
ok(!/onerror="alert/i.test(painted), "with no live handler anywhere in the markup");

/* ============================================================
   6. HER HISTORY IS NOT RE-SCORED UNDERNEATH HER

   Every rule in js/outcome.js is gated on the version that introduced it, so a
   record is read by the rules it was written under. The row merge needs that
   gate more than any of them: before v4 a resume numbered its main rounds from
   one again, so the second sitting's round-two rows were SAVED as round one and
   share a logical id with the first sitting's. Merging those collapses two real
   rounds into one — and a green day already on the device drops from complete
   to partial and loses the streak day she is standing on.

   This is what a corpus diff against the pre-fix tree caught, and what this
   keeps caught.
   ============================================================ */

const collided = v => [
  { workoutInstanceId: "hist" + v, isoDate: "2026-08-02T12:00:00.000Z", dayKey: "monday",
    outcomeVersion: v, expectedWork: 4, expectedByRound: { 1: 2, 2: 2 }, endedEarly: true,
    ledger: [doneRow("a"), doneRow("b")].map(r => ({ ...r, block: "main" })) },
  // Written by the old engine: round TWO's rows, saved as round one.
  { workoutInstanceId: "hist" + v, isoDate: "2026-08-02T19:00:00.000Z", dayKey: "monday",
    outcomeVersion: v, expectedWork: 4, expectedByRound: { 1: 2 }, completedFully: true,
    ledger: [doneRow("a"), doneRow("b")].map(r => ({ ...r, block: "main" })) }
];
same(outcome.workoutInstances(collided(3))[0].outcome.state, "complete",
  "a pre-v4 record keeps the reading it was written under — four rows, four asked for");
same(outcome.workoutInstances(collided(3))[0].outcome.countsForStreak, true,
  "so the streak day she is standing on survives the fix that follows it");
same(outcome.workoutInstances(collided(outcome.OUTCOME_VERSION))[0].outcome.state, "partial",
  "while a record written since the numbering was fixed is merged per planned move");
ok(outcome.OUTCOME_VERSION >= 4,
  "and the version that gates it is stamped on everything written from now on");

/* ============================================================
   7. THE SERVICE WORKER CLEANS UP AFTER ITSELF AND NOBODY ELSE
   ============================================================ */

const swSrc = await (await import("node:fs/promises")).readFile(
  new URL("../sw-core.js", import.meta.url), "utf8");
ok(/CACHE_PREFIX/.test(swSrc) && /k\.startsWith\(CACHE_PREFIX\)/.test(swSrc),
  "activation deletes only this app's own caches — Cache Storage is per ORIGIN, "
  + "and on GitHub Pages a neighbour's cache is not this worker's to delete");

/* ============================================================
   8. A WORKOUT BELONGS TO THE DAY IT BEGAN — EVERYWHERE

   The XP budget has keyed off `dayIso` since a bout that crossed midnight could
   draw two days' budgets. The streak asked a different question — the finish
   stamp — so a Monday session finalized at 00:10 was FILED under Tuesday, and
   training Monday night and Tuesday night gave two workouts on one date. The
   Set of streak dates kept one. The child had trained two days running and was
   shown 🔥 1.

   Two readings of one fact is the defect; this asserts there is one. */
{
  localStorage.clear(); store.migrate();
  const dayOf = (dayKey, iso, dayIso, id) => ({
    app: "x", dayKey, isoDate: iso, dayIso, workoutInstanceId: id,
    xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
    sessionType: "main", lightResult: "green", roundsDone: 1, roundsPlanned: 1,
    expectedWork: 2, completedFully: true, durationSecs: 900,
    ledger: [{ name: "a", block: "warmup", round: 1, status: "done" },
             { name: "b", block: "warmup", round: 1, status: "done" }]
  });
  // Monday's bout ran past midnight; Tuesday's was an ordinary evening.
  const mon = dayOf("monday", "2026-09-15T06:10:00.000Z", "2026-09-14", "w-mon");
  const tue = dayOf("tuesday", "2026-09-15T23:00:00.000Z", "2026-09-15", "w-tue");
  same(store.dayXpKey(mon), outcome.workoutInstances([mon])[0].date,
    "the date the XP is charged to and the date the streak counts are the same date");
  same(outcome.workoutInstances([mon])[0].date, "2026-09-14",
    "and it is the day the workout BEGAN, not the day it was saved");
  [mon, tue].forEach(r => store.saveSession(r));
  same(outcome.streakDatesOf(store.loadSessions()).size, 2,
    "two nights of training are two streak days, even when one crossed midnight");
  localStorage.clear(); store.migrate();
}

/* ============================================================
   9. THE CARD NEVER PROMISES A RESUME THE ENGINE WILL NOT RUN

   The label was chosen from the session LOG (which remembers a partial day
   forever) while the work came from the day-progress record (which lives for
   one calendar day). When they disagreed the button lied: "Finish remaining
   moves" opened the whole workout at move one.
   ============================================================ */
{
  localStorage.clear(); store.migrate();
  const dayKey = util.edmontonDayKey();
  const circuits = engine.assembleCircuits(dayKey, "green");
  const ledger = [];
  circuits.forEach(c => { for (let r = 1; r <= c.rounds; r++) c.exercises.forEach(e => {
    if (e.rounds && r > e.rounds) return;
    ledger.push({ name: e.name, block: c.block, round: (c.roundBase ? c.roundBase + r - 1 : r),
      status: "partial", driver: "time", actualSecs: 9, plannedSecs: 30 });
  }); });
  store.saveSession({ app: "x", dayKey, isoDate: new Date().toISOString(),
    dayIso: util.todayISODate(), workoutInstanceId: "w-short",
    xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
    sessionType: "main", lightResult: "green", roundsDone: 0, roundsPlanned: 3,
    dayRoundsPlanned: 3, expectedWork: engine.countExpectedWork(circuits),
    expectedByRound: engine.countExpectedByRound(circuits),
    completedFully: false, endedEarly: true, durationSecs: 400, plannedSecs: 1600, ledger });

  const card = tvm.buildTodayVM({ selectedDay: dayKey, expanded: {}, isWide: true }).dayView;
  const owed = engine.planResume(dayKey, "green").circuits.length;
  ok(/Finish remaining/.test(card.ctaLabel || "") === (owed > 0),
    "the button offers to finish exactly when the engine has something to run");

  /* And the numbers on the same card agree with each other. The header counted
     distinct movements, the panel under "REVIEW WHAT YOU DID" walked a fixed
     list of block names with no `prep` in it, and the plan itself asks for main
     once per ROUND — three numbers, three sources, printed together. */
  const vm = tvm.buildTodayVM({ selectedDay: dayKey, expanded: {}, isWide: true });
  const st = engine.dayPlanState(dayKey);
  same(vm.blocks.reduce((a, b) => a + b.count, 0), st.planned,
    "the panel adds up to everything the day asks for, prep and every round included");
  same(vm.blocks.some(b => b.key === "prep"), st.blocks.some(b => b.block === "prep"),
    "and it shows the prep block exactly when the day has one");
  localStorage.clear(); store.migrate();
}

/* ============================================================
   10. PACE IS A REPORT, NOT A VERDICT

   The bands exist so a grown-up can see a twelve-second version of a
   thirty-second hold. They must never quietly become a second way to lose XP or
   a streak day — a kid punished twice for one tired evening would be the app
   turning a coaching note into a penalty.
   ============================================================ */
{
  const rows = (secs) => Array.from({ length: 4 }, (_, i) => ({
    name: "m" + i, block: "main", round: 1, status: "partial",
    driver: "time", actualSecs: secs, plannedSecs: 30 }));
  const at = (secs) => outcome.deriveSessionOutcome({
    ledger: rows(secs), expectedWork: 4, outcomeVersion: outcome.OUTCOME_VERSION,
    sessionType: "main", roundsDone: 1 });
  same(outcome.bandOf(0.90), "green", "ninety percent is a pass");
  same(outcome.bandOf(0.8999), "amber", "and a hair under it is not");
  same(outcome.bandOf(0.75), "amber", "three quarters is 'almost'");
  same(outcome.bandOf(0.7499), "yellow", "just under is 'short'");
  same(outcome.bandOf(0.50), "yellow", "half is still 'short'");
  same(outcome.bandOf(0.4999), "red", "and under half is 'very short'");
  same(outcome.paceBand({ status: "done" }), "green",
    "a finished move with no measurable dose is a pass, not an unknown");
  same(outcome.paceBand({ status: "partial", driver: "time", actualSecs: 10, plannedSecs: 0 }), null,
    "but a partial with no denominator is UNGRADED — never a green we cannot prove");
  same(outcome.paceBand({ status: "skipped" }), null, "and a skip is not a short move");
  same(at(27).pace.band, "green", "four full-ish holds band green");
  same(at(9).pace.band, "red", "and four nine-second holds band red");
  /* The clean statement of "reported, never charged for": a FINISHED move is
     worth one whole unit and is deliberately not re-measured against its clock
     (see streakCredit — the engine's 80% floor is what decides `done`, and
     pro-rating a done row would move that floor without saying so). So two
     sessions of finished moves, one nine seconds into every thirty and one
     twenty-seven, differ in BAND and in nothing else. If pace ever leaks into
     the price or the flame, this is the assertion that catches it.

     (A `partial` row is a different story and always has been: the round rule
     already pays a short round the fraction it produced. That is the dose rule
     from the XP section of the README, not this band.) */
  const doneRows = (secs) => Array.from({ length: 4 }, (_, i) => ({
    name: "m" + i, block: "main", round: 1, status: "done",
    driver: "time", actualSecs: secs, plannedSecs: 30 }));
  const asRow = (secs) => ({ app: "x", dayKey: "monday", isoDate: new Date().toISOString(),
    xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION, sessionType: "main",
    lightResult: "green", roundsDone: 1, roundsPlanned: 1, dayRoundsPlanned: 1,
    expectedWork: 4, expectedByRound: { 1: 4 }, completedFully: true, ledger: doneRows(secs) });
  same(outcome.outcomeOf(asRow(9)).pace.band, "red", "nine seconds of every thirty bands red");
  same(outcome.outcomeOf(asRow(27)).pace.band, "green", "twenty-seven bands green");
  same(store.xpForSession(asRow(9)), store.xpForSession(asRow(27)),
    "and the two are worth exactly the same XP — pace is reported, never charged for");
  same(store.countsForStreak(asRow(9)), store.countsForStreak(asRow(27)),
    "and both earn the same streak day — a band is a coaching note, not a penalty");
}

/* ============================================================
   11. A RESTORED SESSION IS WORTH WHAT IT EARNED

   `claimSessionXp` pays for the rounds finished; the fallback used for a record
   with no `xpEarned` stamp still halved an ended-early session "matching
   finalize()", which finalize stopped doing. A row only ever arrives without
   that stamp from a CLOUD RESTORE or a backup import — so the same session was
   worth 360 on the tablet and 180 once it came home.
   ============================================================ */
{
  const row = { app: "x", dayKey: "monday", isoDate: new Date().toISOString(),
    xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
    sessionType: "main", lightResult: "green", roundsDone: 3, roundsPlanned: 3,
    expectedWork: 4, expectedByRound: { 1: 2, 2: 2 },
    completedFully: false, endedEarly: true,
    ledger: [{ name: "a", block: "main", round: 1, status: "done" },
             { name: "b", block: "main", round: 1, status: "done" },
             { name: "a", block: "main", round: 2, status: "done" },
             { name: "b", block: "main", round: 2, status: "done" }] };
  same(store.sessionXp(row), store.xpForSession(row),
    "a row restored without its xpEarned stamp is worth exactly what it earned");
  same(store.sessionXp({ ...row, xpEarned: 270 }), 270,
    "and a row that carries the stamp is still worth the stamp");
}

/* ============================================================
   12. THE MINUTES ON THE RECORD ARE THE DAY'S, NOT THE SITTING'S

   `plannedSecs` was computed from the circuits the sitting was handed, and a
   resume is handed only the remainder — so a day trained in two goes saved two
   rows each claiming the plan was the ten minutes that sitting had left. The
   Progress table's "Planned" column reads that field. `expectedWork` had the
   identical defect and was fixed years of commits ago; this is the same fix for
   the clock. ============================================================ */
{
  localStorage.clear(); store.migrate();
  const dayKey = util.edmontonDayKey();
  // A sitting handed only part of the day: a block and a round already banked.
  store.saveDayProgress(dayKey, { done: ["warmup"], moves: {}, mainRoundsCompleted: 1,
    bankedCredit: 4, lockedLight: "green", light: "green" });
  await runSession({ dayKey, light: "green", gateUnlocked: true }, {
    onTick: (ms, sess) => { if (sess.phase === "formcheck") engine.pickClean(); }
  });
  const row = store.loadSessions()[0];
  /* Measured AFTER the run, because runSession shortens the configured rests and
     estimateSessionSecs reads them — comparing against a figure taken under the
     app's defaults would be comparing two different days. */
  const whole = engine.estimateSessionSecs(engine.assembleCircuits(dayKey, "green"));
  const remainder = engine.estimateSessionSecs(engine.planResume(dayKey, "green").circuits);
  ok(remainder < whole,
    "the sitting really was handed a remainder (" + remainder + "s of " + whole + "s)");
  same(Number(row.dayPlannedSecs), whole,
    "and it still records the DAY's planned minutes, not the remainder's");
  localStorage.clear(); store.migrate();
}

/* ============================================================
   13. THE TIMELINE SAYS HOW WELL, NOT JUST WHETHER

   Every finished move got the same tick, so a thirty-second hold let go at
   twelve looked exactly like one held the whole way on the list she watches
   while she trains. The dot is that difference, and it must never become a
   status of its own. ============================================================ */
{
  localStorage.clear(); store.migrate();
  const dayKey = util.edmontonDayKey();
  let cut = 0;
  await runSession({ dayKey, light: "red", gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (sess.phase === "formcheck") { engine.pickClean(); return; }
      if (sess.phase === "work" && sess.exElapsed >= 3 && cut < 2 && sess.timerSecs > 4) {
        cut++; engine.advance();
      }
    }
  });
  const list = (svm.buildSessionVM({ detailEx: {}, isWide: true }).sessionExList || []).filter(x => x.isEx);
  ok(list.length > 0, "the timeline has moves on it");
  ok(list.every(x => !x.paceDotStyle || /background:var\(--(mint|sun|coral|stop)\)/.test(x.paceDotStyle)),
    "every pace dot is one of the four bands and nothing else");
  ok(list.every(x => !x.paceDotStyle || x.paceTitle),
    "and every dot carries words, so it is not colour-only");
  localStorage.clear(); store.migrate();
}

/* ============================================================
   N. THE QUESTIONS THIS APP ASKS ARE ANSWERABLE IN THIS APP

   These run in BOTH apps, which is the point. The micro-loop's three options
   were hardcoded in shared core as the swimmer's three, so the skater was
   asked "Where does a clean landing freeze?" and offered "the hips / the arms
   / the knees" — her right answer was never on screen and every attempt scored
   wrong. And the pain question, moved last in one app so the other three
   always get asked, was still first in the other. Both are properties of a
   question set, so both are asserted here rather than in one app's smoke file.
   ============================================================ */
{
  const ml = data.MICRO_LOOP;
  ok(Array.isArray(ml.opts) && ml.opts.length >= 2, "the micro-loop offers options to choose from");
  ok(ml.opts.includes(ml.a), "the micro-loop's correct answer is one of the options it offers");
  ok(ml.opts.filter(o => o === ml.a).length === 1, "and it appears exactly once, so there is one right answer");
  ok(!!ml.yes && !!ml.no && ml.yes !== ml.no, "the coach has a distinct reply for right and for wrong");
  ok(ml.no.toLowerCase().includes(String(ml.a).toLowerCase().split(" ").slice(-1)[0]),
    "and the wrong-answer reply names THIS app's answer, not the other app's");

  const qs = data.READINESS_QS;
  ok(qs[qs.length - 1].id === "q_pain",
    "the pain question is asked LAST, so the other three always get asked");
  ok(qs.filter(q => q.isPain).length === 1, "exactly one question routes to the body map");
  ok(qs.filter(q => !q.isPain).length === 3, "and three general questions remain to score the light");

  const vm = svm.buildSessionVM({ detailEx: {}, isWide: true });
  ok((vm.microOpts || []).includes(ml.a), "the session screen offers the answer the engine grades against");
}

/* ============================================================
   N+1. A QUESTION HAS EXACTLY ONE ANSWER SHE COULD PICK

   The kids' verdict on the questions was that they were too general. Two
   separate causes, and both are properties of a generated card rather than of
   any one function:

   Wrong answers on a Quiz Deck card are drawn from OTHER moves' text, and that
   text was the grown-up's — nearly all of it the same sentence. "Smaller
   range.", "Reach shorter, slow down.", "Slow down, reduce reach." Three of
   those on one card is a coin flip; worse, more than one is genuinely right, so
   the app could mark a right answer wrong. Four skating moves shared a
   watch-out word for word.

   And on the Coach's Quiz every wrong answer was a joke — "Comfier goggles",
   "Louder toe picks" — so the only real sentence was always the right one and
   the card could be solved without knowing anything.

   So: generate a lot of cards and assert the properties. This is the check that
   found both problems, run for keeps.
   ============================================================ */
{
  const shape = t => String(t || "").toLowerCase().replace(/[^a-z ]/g, " ")
    .split(/\s+/).filter(w => w.length > 2).sort().join(" ");
  const lead = t => String(t || "").toLowerCase().split(/[,.\/;:]/)[0].trim();

  localStorage.clear(); store.migrate();
  let cards = 0, sameText = 0, sameLead = 0, noAnswer = 0, twoAnswers = 0, lengthTell = 0;
  for (let i = 0; i < 60; i++) {
    overlays.buildQuizDeck(8).qs.forEach(q => {
      cards++;
      const right = q.opts.filter(o => o.ok);
      if (!right.length) noAnswer++;
      if (right.length > 1) twoAnswers++;
      if (!right.length) return;
      const correct = right[0].t;
      q.opts.filter(o => !o.ok).forEach(o => {
        if (shape(correct) === shape(o.t)) sameText++;
        if (lead(correct) && lead(correct) === lead(o.t)) sameLead++;
      });
    });
  }
  ok(cards > 100, "the deck generates cards to check (" + cards + ")");
  same(noAnswer, 0, "every card has an answer that is right");
  same(twoAnswers, 0, "and only one of them");
  same(sameText, 0, "no card offers the same answer twice in different words");
  same(sameLead, 0, "and no card offers two answers that open with the same advice");

  // Length is a tell. A few cues carry programming and safety notes as well as
  // the cue — "Dizzy >30-45s -> STOP", "[free/back/fly]" — and next to two short
  // phrases the long one is obviously the real answer. KID_COACHING.cue is the
  // short form for the card; this keeps a future edit from undoing it.
  const longCue = store.movePool().filter(m => m.cue && m.cue.length > 60);
  same(longCue.length, 0,
    "no quiz cue is long enough to give itself away" +
    (longCue.length ? " (" + longCue.map(m => m.name).join(", ") + ")" : ""));
  const longAnswer = store.movePool().filter(m => m.watch && m.watch.length > 80)
    .concat(store.movePool().filter(m => m.fix && m.fix.length > 80));
  same(longAnswer.length, 0, "and no watch-out or fix is either");

  // The Coach's Quiz and the training principles are authored, so check the
  // authored shape directly: one right answer, no dangling prerequisite, and no
  // wrong answer so much shorter than the right one that length gives it away.
  const authored = svm.coachQuizPool();
  ok(new Set(authored.map(q => q.ledgerKey)).size === authored.length,
    "every question the end-of-session card can ask has its own ledger key, so none is paid for twice");
  const ids = new Set(data.SESSION_QUIZ.map(q => q.id));
  const pids = new Set(data.TRAINING_QS.map(q => q.id));
  authored.forEach(q => {
    ok(q.opts.filter(o => o.ok).length === 1, "“" + q.q + "” has exactly one right answer");
    ok(q.opts.length >= 3, "“" + q.q + "” offers a real choice");
    const right = q.opts.find(o => o.ok).t;
    q.opts.filter(o => !o.ok).forEach(o => {
      if (o.t.length * 2 < right.length) lengthTell++;
    });
  });
  same(lengthTell, 0, "no wrong answer is so much shorter than the right one that length gives it away");
  data.SESSION_QUIZ.forEach(q => ok(!q.after || ids.has(q.after),
    "every Coach's Quiz prerequisite names a question that exists"));
  data.TRAINING_QS.forEach(q => ok(!q.after || pids.has(q.after),
    "every training-principle prerequisite names a question that exists"));
  ok(new Set(data.SESSION_QUIZ.map(q => q.id)).size === data.SESSION_QUIZ.length,
    "Coach's Quiz ids are unique, so the XP ledger can key on them");
  ok(data.SESSION_QUIZ.length >= 12,
    "the Coach's Quiz is big enough not to come round again within a fortnight");

  // The principles must actually REACH her. Left to the draw they were four
  // entries in a bank of eighty-nine, so the thing the app most wants her to
  // understand was the thing she was least likely to be asked. One deck slot is
  // reserved for one, and they are in the automatic end-of-session rotation too.
  localStorage.clear(); store.migrate();
  let deckMissingPrinciple = 0;
  for (let i = 0; i < 40; i++) {
    if (!overlays.buildQuizDeck(8).qs.some(q => q.kind === "principle")) deckMissingPrinciple++;
  }
  same(deckMissingPrinciple, 0, "every Quiz Deck carries a training principle");
  const kinds = {};
  data.TRAINING_QS.forEach(q => { kinds[q.kind] = (kinds[q.kind] || 0) + 1; });
  ok(kinds.attitude >= 3 && kinds.efficiency >= 3 && kinds.results >= 3,
    "attitude, efficiency and repetition are all covered in depth");
  ok(data.TRAINING_QS.some(q => /same movement|same move|same shape/i.test(q.why)),
    "and the same-movement principle is stated in what the card teaches back");

  // ...and it must actually not come round again. Rotating the whole bank by
  // session count moved the index by one per session, so a question she had
  // already got right came back within the week while a dozen she had never
  // seen waited their turn.
  localStorage.clear(); store.migrate();
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const asked = [];
  for (let i = 0; i < 12; i++) {
    const q = svm.sessionQuizFor(days[i % 7]);
    asked.push(q.id);
    const z = store.loadQuiz();
    // Its OWN key: a training principle is asked both here and in the Quiz
    // Deck, and keys by topic rather than by where it was asked.
    z.qLedger[q.ledgerKey] = { attempted: true, mastered: true };
    store.saveQuiz(z);
    store.saveSession({ app: "x", isoDate: new Date().toISOString(), dayKey: days[i % 7], ledger: [] });
  }
  same(new Set(asked).size, asked.length,
    "the Coach's Quiz asks something new every session until she has learned them all");
  ok(asked.some(id => data.TRAINING_QS.some(q => q.id === id)),
    "and the training principles are in that automatic rotation, not only in the deck she has to open");
  localStorage.clear(); store.migrate();

  // Coverage. Before the kid wording existed only 17 of 55 moves carried a
  // watch-out or a fix at all, so an 8-card deck was nearly all "which cue
  // belongs to which move" — name-matching, not understanding.
  const pool = store.movePool();
  const withWatch = pool.filter(m => m.watch).length;
  const withFix = pool.filter(m => m.fix).length;
  ok(withWatch >= pool.length * 0.6,
    "most moves carry a watch-out (" + withWatch + " of " + pool.length + ")");
  ok(withFix >= pool.length * 0.6,
    "and most carry a fix (" + withFix + " of " + pool.length + ")");
}

/* ============================================================
   N+2. THE HARDER TIER WAITS UNTIL SHE HAS EARNED IT

   Both athletes are the same age, so age cannot separate an easier question
   from a harder one — what she has already shown she knows can. A tier-2
   question ("that felt wrong, so what do you change?") is unfair before the
   tier-1 question it builds on is mastered, and stays out of the bank until it
   is. Nothing to configure, and it moves at her pace.
   ============================================================ */
{
  localStorage.clear(); store.migrate();
  const bank = store.questionBank();
  const locked = store.unlockedBank(bank, store.loadQuiz());
  ok(locked.length < bank.length, "on a fresh device the harder tier is not dealt yet");
  ok(locked.every(([topic, kind]) => store.questionTier(topic, kind) === 1
      || !store.questionPrereq(topic, kind)),
    "and nothing dealt has an unmet prerequisite");

  const gated = bank.find(([t, k]) => store.questionPrereq(t, k));
  ok(!!gated, "there is a question that waits on another");
  const quiz = store.loadQuiz();
  quiz.qLedger[store.questionPrereq(gated[0], gated[1])] = { attempted: true, mastered: true };
  store.saveQuiz(quiz);
  const after = store.unlockedBank(bank, store.loadQuiz());
  ok(after.length > locked.length, "mastering the tier-1 question opens the tier-2 one");
  ok(after.some(([t, k]) => t.name === gated[0].name && k === gated[1]),
    "and the one it opens is the one that was waiting");

  // Nothing may be locked behind a prerequisite that is not itself askable —
  // it could never be mastered, so the question would be unreachable for good
  // while its XP still counted toward the ceiling the grown-up screen shows.
  const keys = new Set(bank.map(([t, k]) => store.quizQuestionKey(t.name, k)));
  const unreachable = bank.filter(([t, k]) => {
    const pre = store.questionPrereq(t, k);
    return pre && !keys.has(pre);
  });
  same(unreachable.length, 0, "every question can eventually be unlocked");

  // The whole bank is still the whole bank: the mastery count and the lifetime
  // XP ceiling are promises that must not move when a tier unlocks.
  same(store.questionBank().length, bank.length, "the bank itself does not grow when a tier opens");
  localStorage.clear(); store.migrate();
}

/* ============================================================
   N+3. ONE CARD IS ABOUT TODAY

   Every other question in the deck is a fact about the plan, true whether or
   not she trained — which is the whole reason the set read as general. This one
   is built from the session she just finished, and it pays by the day rather
   than through the lifetime ledger, because a question that renews daily would
   otherwise make "quiz XP is finite" untrue.
   ============================================================ */
{
  localStorage.clear(); store.migrate();
  ok(!overlays.buildQuizDeck(8).qs.some(q => q.kind === "today"),
    "with nothing trained there is nothing to ask about today");

  await runSession({ dayKey: "tuesday", light: "yellow", gateUnlocked: true }, {
    onTick: (ms, sess) => { if (sess.phase === "formcheck") engine.pickWobbly(); }
  });

  const deck = overlays.buildQuizDeck(8);
  const todayCard = deck.qs.find(q => q.kind === "today");
  ok(!!todayCard, "after a session the deck opens with a card about that session");
  same(deck.qs[0].kind, "today", "and it is dealt first, so it is never crowded out");
  ok(todayCard.opts.filter(o => o.ok).length === 1, "the today card has exactly one right answer");

  const last = store.loadSessions().slice(-1)[0];
  const namesToday = todayCard.prompt.includes("wobbly")
    || todayCard.prompt.includes(String(last.roundsPlanned))
    || todayCard.prompt.includes(String(last.roundsDone))
    || (last.intentWord && todayCard.prompt.includes(last.intentWord));
  ok(namesToday, "and it names something from the session she actually trained");

  // It is not a move, so it must not file itself under one, and it must not be
  // priced through the ledger that makes lifetime quiz XP finite.
  const before = store.quizBankStatus();
  const qd = overlays.buildQuizDeck(8);
  qd.qs.forEach((qq, i) => { qd.idx = i; overlays.answerQuizDeck(qd, qq.opts.findIndex(o => o.ok)); });
  overlays.finishQuizDeck(qd);
  ok(!(store.loadQuiz().items || {}).Today, "the today card files no mastery row under a move nobody trains");
  same(store.quizBankStatus().total, before.total, "and it never joins the finite bank");

  // A second deck the same day pays nothing for it, so it cannot be farmed.
  const q2 = store.loadQuiz();
  const xpBefore = q2.dayXp || 0;
  const res = store.payTodayQuestion(true);
  same(res.xp, 0, "today's card pays once a day and no more");
  same(store.loadQuiz().dayXp || 0, xpBefore, "and a repeat costs the day's ceiling nothing");
  localStorage.clear(); store.migrate();
}

console.log("✓ invariants passed (" + passed + " assertions)");
