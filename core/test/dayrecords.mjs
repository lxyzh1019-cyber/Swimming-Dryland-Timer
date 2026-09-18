/* THE DAY RECORD — one authority, asked the questions every screen used to
   answer for itself.

   Each scenario drives the REAL engine on a movable wall clock (the calendar
   moves too, which a midnight crossing and a catch-up day need), then asks
   `dayRecords()` what the day was. Nothing here names a move, so it holds for
   both apps: every expected count is read off the plan the record was scored
   against. Screen-level assertions belong to the view-model suites.

   S1–S10 are the ten scenarios the prototype matched (scratchpad proof,
   2026-09-18); S11–S14 cover the three items it left unsettled and "start
   over". Run by `npm test`. */
import { engine, store, outcome, util, data } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const same = (a, b, msg) => ok(a === b, msg + " (got " + JSON.stringify(a) + ", wanted " + JSON.stringify(b) + ")");

/* ---- a wall clock the engine AND the calendar read ---------------------- */
const RealDate = Date;
const RT = { si: setInterval, ci: clearInterval, st: setTimeout, ct: clearTimeout };
let clock = null;
function clockAt(iso) {
  let now = new RealDate(iso).getTime(), id = 1;
  const timers = new Map();
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  globalThis.Date = FakeDate;
  globalThis.setInterval = (fn, ms) => { const k = id++; timers.set(k, { fn, ms, next: now + ms, repeat: true }); return k; };
  globalThis.setTimeout  = (fn, ms) => { const k = id++; timers.set(k, { fn, ms: ms || 0, next: now + (ms || 0), repeat: false }); return k; };
  globalThis.clearInterval = k => timers.delete(k);
  globalThis.clearTimeout = k => timers.delete(k);
  clock = {
    async advance(ms, step = 50) {
      for (let d = 0; d < ms; d += step) {
        now += step;
        [...timers.entries()].forEach(([k, t]) => {
          if (t.next > now) return;
          if (t.repeat) t.next = now + t.ms; else timers.delete(k);
          t.fn();
        });
        await new Promise(r => process.nextTick(r));
      }
    },
    set(iso) { now = new RealDate(iso).getTime(); },
    // The device died: nothing parked on it ever fires again.
    drop() { timers.clear(); },
    restore() {
      globalThis.Date = RealDate;
      Object.assign(globalThis, { setInterval: RT.si, clearInterval: RT.ci, setTimeout: RT.st, clearTimeout: RT.ct });
    }
  };
  return clock;
}
function fresh() {
  localStorage.clear(); store.migrate();
  store.updateSettings({ coachVoiceOn: false, exerciseRestSeconds: 3, roundRestSeconds: 10, sectionRestSeconds: 5, cloudMirror: false });
  store.saveGate({ unlocked: true, cleanWeeks: [] });
  engine.exitSession();
}
/* runSession's loop, on the movable clock. onTick may return "kill": the
   timers are dropped and the runner is left parked, exactly as an evicted app
   leaves it — no finalize, no row. */
async function drive(opts, onTick) {
  engine.exitSession();
  const run = engine.startSession(opts);
  let ms = 0;
  while (engine.sess.running && ms < 7200000) {
    await clock.advance(1000); ms += 1000;
    if (onTick && onTick(ms, engine.sess) === "kill") { clock.drop(); engine.exitSession(); return { killed: true }; }
  }
  await run;
  return { snap: { ...engine.sess } };
}
const clean = s => { if (s.phase === "formcheck") { engine.pickClean(); return true; } return false; };
const honest = (ms, s) => { clean(s); };
/* Every timed move cut at ~85 % of its clock, every rep move tapped Done one
   rep short — and the coach's question answered "some", which keeps the count. */
const beatShort = (ms, s) => {
  if (clean(s)) return;
  if (s.phase === "repcheck") { engine.answerRepCheck("some"); return; }
  if (s.phase === "work" && s.timerMax > 0 && !s.announceResolver && s.timerSecs > 0 && s.timerSecs <= Math.ceil(s.timerMax * 0.15)) engine.advance();
  else if (s.phase === "reps" && s.byRepsResolver && s.repsTarget > 1 && s.repsCounted === s.repsTarget - 1) engine.advance();
};
const stopAt = (rounds, reason) => { let done = false; return (ms, s) => {
  if (clean(s)) return;
  if (!done && s.roundsCompleted >= rounds && ["work", "reps"].includes(s.phase) && s.running) {
    done = true;
    if (reason) { engine.openStopOverlay(); engine.endFromStop(reason); } else engine.endEarly();
  }
}; };
const parked = s => ["rest", "sectionRest", "roundRest"].includes(s.phase)
  && !s.announceResolver && !s.byRepsResolver && !s.formResolver && !s.repCheckResolver;

/* ---- what the plan asks, read off the plan ------------------------------- */
const DAY = "monday";
const MON = "2026-09-14";
const T = { start: "2026-09-14T21:00:00Z", read: "2026-09-14T22:30:00Z" };   // Monday 15:00 → read 16:30 Edmonton
const greenPlan = () => engine.dayPlanState(DAY, { rows: [], light: "green" });
const FULL_ROUNDS = engine.roundsForLight("green");
const XP_FULL = store.XP_SHOWED_UP + store.XP_PER_ROUND * FULL_ROUNDS;
const loggedMinutes = () => Math.round(store.loadSessions().reduce((a, s) => a + (Number(s.durationSecs) || 0), 0) / 60);
const recordFor = (dayKey = DAY) => outcome.dayRecords().find(r => r.dayKey === dayKey && !r.care) || null;
const warmupSize = () => greenPlan().blocks.find(b => b.block === "warmup").planned;
ok(warmupSize() >= 3, "the plan has a warm-up block of at least three moves to bank");

/* One record, and the whole green day in it: rounds, both movement units,
   the streak, and XP settled by rounds. */
function expectFullDay(rec, label) {
  const plan = greenPlan();
  ok(rec, label + ": the day has a record");
  same(rec.weekday, DAY, label + ": filed under the weekday it was for");
  same(rec.dayComplete, true, label + ": reads complete");
  same(rec.mainRoundsDone, FULL_ROUNDS, label + ": every main round counted");
  same(rec.roundsPlanned, FULL_ROUNDS, label + ": against the day's own ask");
  same(rec.performances.performed + "/" + rec.performances.planned, plan.planned + "/" + plan.planned, label + ": every performance");
  same(rec.movements.performed + "/" + rec.movements.planned, plan.movements + "/" + plan.movements, label + ": every movement");
  same(rec.countsForStreak, true, label + ": a streak day");
  same(rec.xpByRounds, XP_FULL, label + ": priced as one full day");
  same(rec.settledXp, XP_FULL, label + ": and settled as one");
}

async function scenario(title, startIso, readIso, run, check) {
  fresh(); clockAt(startIso);
  const r = await run();
  clock.set(readIso);
  await check(r);
  clock.restore();
}

/* ============================================================
   S1 · honest full green day — the baseline every screen agrees on
   ============================================================ */
await scenario("S1", T.start, T.read, () => drive({ dayKey: DAY, light: "green" }, honest), (r) => {
  const rec = recordFor();
  expectFullDay(rec, "S1");
  same(rec.date, MON, "S1: dated the day it was trained");
  same(rec.minutes, loggedMinutes(), "S1: minutes are the logged seconds, rounded once");
  same(rec.hadPainStop, false, "S1: no pain stop");
  same(rec.overridden, false, "S1: no override");
  same(outcome.scheduleStreak(outcome.dayRecords(), util.todayISODate()), 1, "S1: the streak is one day");
  same(store.currentStreakOf(), 1, "S1: and the store's streak reads the same record");
  same(r.snap.xpEarned, XP_FULL, "S1: the finish screen was paid the whole day");
});

/* ============================================================
   S2 · every move a beat short — she finished the plan, so it is COMPLETE
   ============================================================ */
await scenario("S2", T.start, T.read, () => drive({ dayKey: DAY, light: "green" }, beatShort), () => {
  const rec = recordFor();
  ok(rec.rows.some(l => l.status === "partial"), "S2: the ledger really holds partial rows");
  ok(!rec.rows.some(l => l.status === "skipped"), "S2: and no skipped ones");
  expectFullDay(rec, "S2");
  same(rec.outcome.wholePlanAttempted, true, "S2: the day came in through the whole-plan door");
  same(rec.minutes, loggedMinutes(), "S2: minutes are the logged seconds");
  /* The per-move review rides on the record's plan: one row per planned
     performance, its verdict and the reason in her own units. */
  const moves = rec.plan.moves;
  same(moves.length, rec.performances.planned, "S2: one review row per planned performance");
  ok(moves.every(m => ["done", "partial", "skipped", "banked", "missing"].includes(m.status)), "S2: every row has one of the five verdicts");
  same(moves.filter(m => m.status === "partial").length, rec.rows.filter(l => l.status === "partial").length, "S2: the ½ rows are the ledger's partial rows");
  ok(moves.filter(m => m.status === "partial" && m.driver === "time").every(m =>
      m.got !== null && m.planned !== null && m.reason === m.got + "s of " + m.planned + "s — needs " + Math.ceil(m.planned * engine.DONE_WORK_FRACTION) + "s (80%) to count"),
    "S2: a timed ½ row quotes the 80% floor: " + JSON.stringify((moves.find(m => m.status === "partial" && m.driver === "time") || {}).reason));
  ok(moves.filter(m => m.status === "partial" && m.driver === "reps").every(m =>
      m.reason === m.got + " of " + m.planned + " reps — all " + m.planned + " to count"),
    "S2: a rep ½ row asks for all the reps: " + JSON.stringify((moves.find(m => m.status === "partial" && m.driver === "reps") || {}).reason));
  ok(moves.filter(m => m.status === "done").every(m => m.reason === ""), "S2: a finished move needs no reason");
});

/* ============================================================
   S3 · one skipped main move — the round does not count, the day is partial,
   and the round is paid the fraction she did
   ============================================================ */
await scenario("S3", T.start, T.read, async () => {
  let skipped = false;
  return drive({ dayKey: DAY, light: "green" }, (ms, s) => {
    if (clean(s)) return;
    if (!skipped && ["work", "reps"].includes(s.phase) && s.circuits[s.ci] && s.circuits[s.ci].block === "main" && s.round === 2) {
      skipped = true; engine.skipCurrentExercise();
    }
  });
}, () => {
  const rec = recordFor(), plan = greenPlan();
  same(rec.dayComplete, false, "S3: a skipped main move is not a complete day");
  same(rec.mainRoundsDone, FULL_ROUNDS - 1, "S3: round two does not count");
  const skippedRow = rec.plan.moves.find(m => m.status === "skipped");
  ok(skippedRow && skippedRow.round === 2 && skippedRow.block === "main", "S3: the review names the skipped main move in round two");
  ok(skippedRow.reason === "skipped" || skippedRow.reason === "under " + engine.MIN_EXERCISE_SECS + "s — counted as skipped",
    "S3: with a plain reason — Skip, or a tap under the floor (" + JSON.stringify(skippedRow.reason) + ")");
  same(rec.roundsPlanned, FULL_ROUNDS, "S3: of the three asked");
  same(rec.performances.performed, plan.planned - 1, "S3: one performance short");
  same(rec.movements.planned, plan.movements, "S3: the movement denominator is the plan's");
  same(rec.countsForStreak, true, "S3: still a streak day — 75% of the plan was done");
  const round2 = rec.mainRounds.find(x => x.round === 2);
  const priced = store.XP_SHOWED_UP + Math.round(store.XP_PER_ROUND * (FULL_ROUNDS - 1 + outcome.roundPayCredit(round2)));
  same(rec.xpByRounds, priced, "S3: the short round is paid the fraction she did");
  ok(rec.xpByRounds < XP_FULL && rec.xpByRounds > store.XP_SHOWED_UP + store.XP_PER_ROUND * (FULL_ROUNDS - 1),
     "S3: less than a full day, more than two rounds");
  same(rec.settledXp, rec.xpByRounds, "S3: and that is what settles");
});

/* ============================================================
   S4 · warm-up done, iPad dies, relaunch and finish — the warm-up is proof,
   by name, before and after the record is cleared
   ============================================================ */
await scenario("S4", T.start, T.read, async () => {
  const r1 = await drive({ dayKey: DAY, light: "green" }, (ms, s) => {
    clean(s);
    const p = store.loadDayProgress(DAY);
    if (p && (p.done || []).includes("warmup") && parked(s)) return "kill";
  });
  ok(r1.killed, "S4: the device died after the warm-up");
  same(store.loadSessions().length, 0, "S4: nothing was saved");
  const prog = store.loadDayProgress(DAY);
  same((prog.rows || []).filter(l => l.block === "warmup").length, warmupSize(), "S4: the record keeps every warm-up row by name");
  ok(Array.isArray(prog.moves.warmup) && prog.moves.warmup.length === warmupSize(), "S4: and the names beside the done list");
  ok(Number(prog.activeSecs) > 60, "S4: and the seconds the sitting ran (" + prog.activeSecs + ")");
  /* Before the relaunch, the day already reads off the record alone. (The
     block is marked done at the bottom of the runner's loop, after its last
     rest, so the parked moment may be one move into the next block.) */
  const bankedCount = prog.rows.length;
  const before = recordFor();
  ok(before && before.unsaved, "S4: a day with only a live record still has one");
  same(before.performances.performed, bankedCount, "S4: showing the moves she did");
  ok(before.performances.performed >= warmupSize(), "S4: the whole warm-up among them");
  ok(before.rows.every(l => l.banked && l.source === "record"), "S4: marked as banked from the record");
  const bankedReview = before.plan.moves.filter(m => m.status === "banked");
  same(bankedReview.length, bankedCount, "S4: the review shows the banked rows as ✓ (banked)");
  ok(bankedReview.every(m => m.reason === "done earlier today"), "S4: each saying it was done earlier today");
  ok(before.plan.moves.filter(m => m.status === "missing").every(m => m.reason === "not reached"), "S4: and the rest as not reached");
  same(before.xpByRounds, 0, "S4: and priced at nothing — a record is not a row");
  clock.set("2026-09-14T21:30:00Z");                 // she comes back 30 min later
  const r2 = await drive({ dayKey: DAY, light: "green" }, honest);
  return { ...r2, bankedCount };
}, (r) => {
  const rec = recordFor();
  expectFullDay(rec, "S4");
  const banked = rec.rows.filter(l => l.banked);
  same(banked.length, r.bankedCount, "S4: the crashed sitting's rows are banked proof");
  same(banked.filter(l => l.block === "warmup").length, warmupSize(), "S4: the whole warm-up among them");
  ok(banked.every(l => l.source === "row"), "S4: carried on the saved row now that the record is gone");
  same(store.loadDayProgress(DAY), null, "S4: the record was cleared by the complete save");
  const row = store.loadSessions()[0];
  same((row.bankedRows || []).length, r.bankedCount, "S4: the row stamps the banked rows by name");
  ok(row.bankedSecs > 60, "S4: and the crashed sitting's seconds (" + row.bankedSecs + ")");
  ok(rec.minutes >= loggedMinutes() + 1, "S4: which the day's minutes include (" + rec.minutes + " vs " + loggedMinutes() + " logged)");
  same(rec.minutes, Math.round((row.durationSecs + row.bankedSecs) / 60), "S4: rounded once");
  ok(!rec.plan.pace.graded || rec.plan.pace.graded <= rec.rows.length - banked.length, "S4: banked rows are not pace-graded");
  same(r.snap.xpEarned, XP_FULL, "S4: the finishing sitting was paid the day");
});

/* ============================================================
   S5 · two devices: one day, one record, however the ids fell
   ============================================================ */
await scenario("S5", T.start, T.read, async () => {
  await drive({ dayKey: DAY, light: "green" }, stopAt(1, null));
  store.clearDayProgress(DAY);                       // device two never had the record
  clock.set("2026-09-14T23:00:00Z");
  return drive({ dayKey: DAY, light: "green" }, honest);
}, () => {
  same(outcome.workoutInstances(store.loadSessions()).length, 2, "S5: the ids say two workouts");
  same(outcome.dayRecords().length, 1, "S5: the day record says one day");
  const rec = recordFor();
  expectFullDay(rec, "S5");
  same(rec.minutes, loggedMinutes(), "S5: minutes add across the devices");
  same(store.currentStreakOf(), 1, "S5: and the streak is earned");
});

/* ============================================================
   S6 · midnight crossing — the day is the one it BEGAN on
   ============================================================ */
await scenario("S6", "2026-09-15T05:40:00Z", "2026-09-15T06:25:00Z", async () => {
  let pausedAt = null;
  return drive({ dayKey: DAY, light: "green" }, (ms, s) => {
    clean(s);
    if (pausedAt === null && ms === 600000) { pausedAt = ms; engine.openStopOverlay(); }   // a 10-minute break
    if (pausedAt !== null && ms === pausedAt + 600000) engine.resumeFromStop();
  });
}, () => {
  same(util.edmontonDayKey(), "tuesday", "S6: it is Tuesday when the day is read");
  const rec = recordFor();
  expectFullDay(rec, "S6");
  same(rec.date, MON, "S6: dated Monday, the day it began");
  same(store.currentStreakOf(), 1, "S6: the streak counts Monday, and Tuesday is not over");
});

/* ============================================================
   S7 · Monday catch-up trained on Wednesday
   ============================================================ */
await scenario("S7", "2026-09-16T21:00:00Z", "2026-09-16T22:30:00Z",
  () => drive({ dayKey: DAY, light: "green" }, honest), () => {
  const rec = recordFor();
  expectFullDay(rec, "S7");
  same(rec.date, "2026-09-16", "S7: trained on Wednesday's date");
  same(rec.weekday, DAY, "S7: for Monday's card");
  same(store.currentStreakOf(), 1, "S7: the streak covers the date it was trained");
});

/* ============================================================
   S8 / S11 · pain stop after round one, come back and finish — a pain stop is
   one sitting's fact, and the finished day pays the whole day
   ============================================================ */
await scenario("S8", T.start, T.read, async () => {
  const r1 = await drive({ dayKey: DAY, light: "green" }, stopAt(1, "pain"));
  same(r1.snap.savedEntry && r1.snap.savedEntry.safetyStop, true, "S8: the first sitting is a safety stop");
  same(r1.snap.xpEarned, 0, "S8: and was paid nothing");
  const stopped = recordFor();
  same(stopped.safetyStop, true, "S8: the day, so far, ended in a pain stop");
  same(stopped.countsForStreak, false, "S8: and buys no streak day");
  same(stopped.xpByRounds, 0, "S8: nor any XP — a session stopped for pain pays nothing");
  clock.set("2026-09-14T22:00:00Z");
  return drive({ dayKey: DAY, light: "green" }, honest);
}, (r) => {
  const rec = recordFor();
  expectFullDay(rec, "S8");
  same(rec.hadPainStop, true, "S8: the pain stop is still on the record");
  same(rec.safetyStop, false, "S8: but the day did not end there");
  same(rec.minutes, loggedMinutes(), "S8: both sittings' minutes count");
  same(r.snap.xpEarned, XP_FULL, "S11: the finishing sitting is paid the whole day it made");
  same(store.settledTrainingXp(store.loadSessions()), XP_FULL, "S11: and the journey settles the day at " + XP_FULL);
  same(store.currentStreakOf(), 1, "S8: the streak is earned");
});

/* ============================================================
   S9 / S12 · green morning banks two rounds, red evening resume — the ask
   stays the day's, and two rounds pay two rounds
   ============================================================ */
await scenario("S9", T.start, T.read, async () => {
  const r1 = await drive({ dayKey: DAY, light: "green" }, stopAt(2, null));
  same(r1.snap.xpEarned, store.XP_SHOWED_UP + 2 * store.XP_PER_ROUND, "S9: the morning was paid its two rounds");
  clock.set("2026-09-15T01:00:00Z");                 // 19:00 Edmonton, body check now red
  return drive({ dayKey: DAY, light: "red", suggestedLight: "red" }, honest);
}, (r) => {
  const rec = recordFor(), plan = greenPlan();
  same(rec.light, "green", "S9: the day is the green day it was started as");
  same(rec.lowestLight, "red", "S9: with the red evening beside it");
  same(rec.roundsPlanned, FULL_ROUNDS, "S9: the ask is still three rounds — a lower light is not a tier drop");
  same(rec.mainRoundsDone, 2, "S9: two were done");
  same(rec.dayComplete, false, "S9: so the day is not complete");
  same(rec.performances.planned, plan.planned, "S9: the performance denominator is the green plan's");
  same(rec.movements.planned, plan.movements, "S9: and the movement denominator too");
  ok(rec.performances.performed < plan.planned, "S9: with the third round missing from the numerator");
  same(rec.overridden, false, "S9: nobody overrode anything");
  const two = store.XP_SHOWED_UP + 2 * store.XP_PER_ROUND;
  same(rec.xpByRounds, two, "S12: two rounds price at " + two);
  same(rec.settledXp, two, "S12: and the day settles there — the evening does not re-earn the show-up");
  same(r.snap.xpEarned, 0, "S12: the evening sitting, which added no round, was paid nothing more");
  /* Whether two rounds plus the evening's blocks clear the streak bar depends
     on the plan's block sizes — the swim plan clears it, the skate plan may
     not — so the assertion is the RULE, not a number: the chip says what the
     record says, and the record says what the dose bar says. */
  const ratio = rec.outcome.workRatio;
  same(rec.countsForStreak, ratio >= outcome.STREAK_WORK_FRACTION || rec.outcome.countsForStreak,
    "S9: the record's streak verdict follows the work bar (ratio " + (ratio == null ? "n/a" : ratio.toFixed(2)) + ")");
  same(store.currentStreakOf(), rec.countsForStreak ? 1 : 0, "S9: the streak chip agrees with the record");
});

/* ============================================================
   S10 · the schedule-aware streak
   ============================================================ */
function dayRow(date, dayKey, kind) {
  const care = kind === "freeze";
  const circuits = care ? engine.assembleRecoveryCircuit(dayKey) : engine.assembleCircuits(dayKey, "green");
  const ledger = [];
  circuits.forEach(c => { for (let r = 1; r <= c.rounds; r++) c.exercises.forEach(e => { if (e.rounds && r > e.rounds) return;
    ledger.push({ name: e.name, block: c.block, round: (c.roundBase || 1) + r - 1, status: "done", driver: "time", actualSecs: 30, plannedSecs: 30 }); }); });
  return { app: "x", dayKey, isoDate: date + "T20:00:00.000Z", dayIso: date, workoutInstanceId: "w-" + date,
    xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION, sessionType: care ? "recovery" : "main",
    lightResult: care ? "recovery" : "green", roundsDone: care ? 0 : 3, roundsPlanned: care ? 0 : 3, dayRoundsPlanned: care ? 0 : 3,
    expectedWork: engine.countExpectedWork(circuits), expectedByRound: engine.countExpectedByRound(circuits),
    completedFully: true, endedEarly: false, durationSecs: 1800, ledger };
}
const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const wdOf = iso => WD[new Date(iso + "T12:00:00Z").getUTCDay()];
ok(outcome.STREAK_SCHEDULE_FROM === "2026-09-18", "the schedule rule applies forward from release day");
ok(data.DAYS.sunday && data.DAYS.sunday.spa, "Sunday is the spa day the schedule never counts as a gap");
for (const [label, seeds, today, exp, why] of [
  ["A", [["2026-09-21", "count"], ["2026-09-22", "count"], ["2026-09-24", "count"]], "2026-09-24", 1,
    "Mon, Tue, skip Wed, Thu: the skipped Wednesday breaks the run"],
  ["B", [["2026-09-26", "count"], ["2026-09-28", "count"]], "2026-09-28", 2,
    "Sat, Sun spa, Mon: Sunday is never a gap"],
  ["C", [["2026-09-21", "count"], ["2026-09-22", "freeze"], ["2026-09-23", "count"]], "2026-09-23", 3,
    "Mon, recovery Tue, Wed: the freeze holds and counts in the length"],
  ["D", [["2026-09-21", "count"], ["2026-09-22", "count"]], "2026-09-23", 2,
    "Mon, Tue, today Wed untrained: today is not a gap yet"],
  ["E", [["2026-09-21", "count"], ["2026-09-22", "count"]], "2026-09-24", 0,
    "Mon, Tue, Wed missed, today Thu: a scheduled day missed ends it"],
  ["F", [["2026-09-14", "count"], ["2026-09-15", "count"], ["2026-09-17", "count"]], "2026-09-17", 3,
    "before the cutoff the old two-day grace still reads 3, so nothing she stands on drops"],
  ["G", [["2026-09-16", "count"], ["2026-09-17", "count"], ["2026-09-18", "count"], ["2026-09-21", "count"]], "2026-09-21", 1,
    "a run across the cutoff: Wed, Thu, Fri, then the scheduled Saturday missed under the new rule breaks it; Sun spa, Mon restarts"],
  ["H", [["2026-09-16", "count"], ["2026-09-17", "count"], ["2026-09-18", "count"], ["2026-09-19", "count"], ["2026-09-21", "count"]], "2026-09-21", 5,
    "and unbroken across it, the old days join the new"]
]) {
  fresh(); clockAt(today + "T22:00:00Z");
  const rows = seeds.map(([d, k]) => dayRow(d, wdOf(d), k));
  rows.forEach(r => store.saveSession(r));
  const recs = outcome.dayRecords({ sessions: rows, events: [], dayProgress: () => null });
  same(outcome.scheduleStreak(recs, today), exp, "S10 " + label + ": " + why);
  same(store.currentStreakOf(rows), exp, "S10 " + label + ": the store reads the same");
  same(store.currentStreakOf(), exp, "S10 " + label + ": with or without the rows handed in");
  ok(store.longestStreakOf(rows) >= exp, "S10 " + label + ": the longest run is never shorter than the current one");
  clock.restore();
}
{
  fresh(); clockAt("2026-09-28T22:00:00Z");
  const rows = [["2026-09-21", "count"], ["2026-09-22", "count"], ["2026-09-23", "count"], ["2026-09-28", "count"]]
    .map(([d, k]) => dayRow(d, wdOf(d), k));
  same(store.currentStreakOf(rows), 1, "S10: after a broken run the current streak restarts");
  same(store.longestStreakOf(rows), 3, "S10: and the longest remembers the three-day run");
  clock.restore();
}

/* ============================================================
   S13 · crash after a SKIPPED warm-up move, then four done — reconstructed by
   NAME, so the skipped one is the one offered back, and the minutes survive
   ============================================================ */
await scenario("S13", T.start, T.read, async () => {
  const target = Math.min(4, warmupSize() - 1);
  let skippedName = null, elapsedAtKill = 0;
  const r1 = await drive({ dayKey: DAY, light: "green" }, (ms, s) => {
    if (clean(s)) return;
    if (!skippedName && ["work", "reps"].includes(s.phase) && s.currentEx && s.circuits[s.ci] && s.circuits[s.ci].block === "warmup" && !s.announceResolver) {
      skippedName = s.currentEx.name; engine.skipCurrentExercise(); return;
    }
    const p = store.loadDayProgress(DAY);
    const banked = ((p && p.rows) || []).filter(l => l.block === "warmup").length;
    if (skippedName && banked >= target && parked(s)) { elapsedAtKill = engine.readClock(); return "kill"; }
  });
  ok(r1.killed && skippedName, "S13: the device died after a skipped warm-up move and " + target + " done ones");
  const prog = store.loadDayProgress(DAY);
  const bankedNames = prog.rows.filter(l => l.block === "warmup").map(l => l.name);
  same(bankedNames.length, target, "S13: the record holds exactly the done moves");
  ok(!bankedNames.includes(skippedName), "S13: and not the skipped one");
  ok(!(prog.done || []).includes("warmup"), "S13: the block is not retired");
  const offered = engine.planResume(DAY, "green").circuits.find(c => c.block === "warmup");
  ok(offered && offered.exercises.some(e => e.name === skippedName), "S13: the relaunch offers the skipped move back");
  ok(offered && !offered.exercises.some(e => bankedNames.includes(e.name)), "S13: and not the ones she did");
  clock.set("2026-09-14T21:20:00Z");
  const r2 = await drive({ dayKey: DAY, light: "green" }, honest);
  return { ...r2, skippedName, bankedNames, elapsedAtKill };
}, (r) => {
  const rec = recordFor();
  expectFullDay(rec, "S13");
  const row = store.loadSessions()[0];
  same((row.bankedRows || []).map(l => l.name).sort().join("|"), r.bankedNames.slice().sort().join("|"),
       "S13: the saved row names exactly the moves the crashed sitting banked");
  ok(row.ledger.some(l => l.name === r.skippedName && l.status === "done"), "S13: the skipped move was done in the second sitting");
  const banked = rec.rows.filter(l => l.banked).map(l => l.name).sort().join("|");
  same(banked, r.bankedNames.slice().sort().join("|"), "S13: the day record reconstructs the right names");
  ok(Math.abs(row.bankedSecs - r.elapsedAtKill) <= engine.HEARTBEAT_TICKS + 5,
     "S13: the crashed sitting's seconds are on the row (" + row.bankedSecs + " of " + r.elapsedAtKill + ")");
  same(rec.minutes, Math.round((row.durationSecs + row.bankedSecs) / 60), "S13: and in the day's minutes, rounded once");
  ok(rec.minutes > loggedMinutes(), "S13: which the log alone would have lost");
});

/* ============================================================
   S14 · "I need to start over" after the warm-up — the restart re-offers it
   ============================================================ */
await scenario("S14", T.start, T.read, async () => {
  let discarded = false;
  const r1 = await drive({ dayKey: DAY, light: "green" }, (ms, s) => {
    clean(s);
    const p = store.loadDayProgress(DAY);
    if (!discarded && p && (p.done || []).includes("warmup") && s.running) { discarded = true; engine.discardSession(); }
  });
  ok(discarded && r1.snap.discard === true, "S14: she started over after the warm-up");
  same(r1.snap.savedEntry, null, "S14: no row was written");
  same(r1.snap.saveFailed, false, "S14: and it is not called a failed save");
  same(store.loadSessions().length, 0, "S14: the log is empty");
  same(store.loadDayProgress(DAY), null, "S14: and the record is cleared");
  same(recordFor(), null, "S14: so the day has no record to show");
  const offered = engine.planResume(DAY, "green").circuits;
  ok(offered.some(c => c.block === "warmup") && offered.find(c => c.block === "warmup").exercises.length === warmupSize(),
     "S14: the restart offers the whole warm-up again");
  clock.set("2026-09-14T21:10:00Z");
  return drive({ dayKey: DAY, light: "green" }, honest);
}, (r) => {
  const rec = recordFor();
  expectFullDay(rec, "S14");
  ok(!rec.rows.some(l => l.banked), "S14: nothing from the discarded attempt was banked into the day");
  same(r.snap.xpEarned, XP_FULL, "S14: and the restart is paid the day");
});

/* "Start over" keeps what an EARLIER sitting already saved: the log, not the
   record, is what a resume subtracts first. */
await scenario("S14b", T.start, T.read, async () => {
  await drive({ dayKey: DAY, light: "green" }, stopAt(1, null));
  clock.set("2026-09-14T22:00:00Z");
  let discarded = false;
  await drive({ dayKey: DAY, light: "green" }, (ms, s) => {
    clean(s);
    if (!discarded && s.ledger.length >= 2 && s.running) { discarded = true; engine.discardSession(); }
  });
  return {};
}, () => {
  same(store.loadSessions().length, 1, "S14b: the morning row is still there");
  same(store.loadDayProgress(DAY), null, "S14b: the record is cleared");
  const plan = engine.planResume(DAY, "green");
  same(plan.bankedRounds, 1, "S14b: the morning's round is still banked, from the log");
  same(plan.mainOwed, FULL_ROUNDS - 1, "S14b: so the restart owes the rest of the day, not all of it");
  same(recordFor().mainRoundsDone, 1, "S14b: and the day record still shows the round");
});

/* ============================================================
   THE OVERRIDE FLAG — true only when an adult moved the light
   ============================================================ */
await scenario("override", T.start, T.read, async () => {
  const r1 = await drive({ dayKey: DAY, light: "red", suggestedLight: "red" }, stopAt(1, null));
  same(r1.snap.savedEntry.wasOverridden, false, "override: a red morning under a red check is no override");
  clock.set("2026-09-15T00:00:00Z");
  /* The evening check is GREEN and nobody touched it; the day's lock holds
     the workout at red. This used to be stamped as a grown-up override. */
  const r2 = await drive({ dayKey: DAY, light: "green", suggestedLight: "green" }, honest);
  same(r2.snap.light, "red", "override: the lock still holds the day at red");
  same(r2.snap.savedEntry.wasOverridden, false, "override: a resume the lock lowered is NOT an override");
  return {};
}, () => {
  same(recordFor().overridden, false, "override: the day record blames no one");
});
await scenario("override-real", T.start, T.read,
  () => drive({ dayKey: DAY, light: "green", suggestedLight: "red" }, honest), (r) => {
  same(r.snap.savedEntry.wasOverridden, true, "override: a green session started over a red check IS an override");
  same(recordFor().overridden, true, "override: and the day record says so");
});

/* ============================================================
   THE HEARTBEAT — the record's clock moves while the session runs
   ============================================================ */
await scenario("heartbeat", T.start, T.read, async () => {
  const seen = [];
  const r = await drive({ dayKey: DAY, light: "green" }, (ms, s) => {
    clean(s);
    const p = store.loadDayProgress(DAY);
    if (s.running && p && Number.isFinite(p.activeSecs)) seen.push([ms, p.activeSecs, p.sittingStartedAt]);
    if (ms > 400000 && s.running) engine.endEarly();
  });
  return { snap: r.snap, seen };
}, (r) => {
  ok(r.seen.length > 0, "heartbeat: the record carried activeSecs while the session ran");
  const starts = new Set(r.seen.map(x => x[2]));
  same(starts.size, 1, "heartbeat: one sittingStartedAt for one sitting");
  const lag = r.seen.map(([ms, secs]) => ms / 1000 - secs);
  ok(Math.max(...lag) <= engine.HEARTBEAT_TICKS + 2, "heartbeat: the record is never more than a heartbeat behind the clock (max lag " + Math.max(...lag) + "s)");
  const prog = store.loadDayProgress(DAY);
  same(prog.activeSecs, 0, "heartbeat: a saved row takes the seconds with it, so the record starts from zero");
  same(store.loadSessions()[0].bankedSecs, 0, "heartbeat: and a first sitting stamps no banked seconds");
});

console.log("✓ day records passed (" + passed + " assertions)");
