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

import { util, store, engine, outcome, svm, tvm, pvm, gvm, gscreen,
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
same(rowOf("Time").total, "30m", "minutes still add across the sittings — they are additive facts");

const gv = gvm.buildGrownupVM({ gsScope: "week", grownupTab: "analytics" });
const indOf = label => gv.analytics.indicators.find(r => r.label === label);
same(indOf("Completed").total, "1 of 1", "the Grown-up board counts the workout, not the sittings");
same(indOf("XP earned").total, "360", "and the settled XP");
same(gv.analytics.avgMins, 30, "the average duration is the workout's, not half of it");

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
   6. THE SERVICE WORKER CLEANS UP AFTER ITSELF AND NOBODY ELSE
   ============================================================ */

const swSrc = await (await import("node:fs/promises")).readFile(
  new URL("../sw.js", import.meta.url), "utf8");
ok(/CACHE_PREFIX/.test(swSrc) && /k\.startsWith\(CACHE_PREFIX\)/.test(swSrc),
  "activation deletes only this app's own caches — Cache Storage is per ORIGIN, "
  + "and on GitHub Pages a neighbour's cache is not this worker's to delete");

console.log("✓ invariants passed (" + passed + " assertions)");
