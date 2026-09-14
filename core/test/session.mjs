/* SESSION SAFETY AND FAIRNESS — the moments where the app used to take
   something off her that she had not lost.

   Run against whichever app's content this core is under: nothing here names a
   move, so it holds for both. Voice ON with a SLOW synthesiser where the bug was
   a race with the coach's speech; voice OFF where it was not. */
import { engine, store, sport, data, tvm, gvm, runSession, setSpeechDelay, speechInFlight, spoken, pinClock } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const voiceOn = () => store.updateSettings({ coachSpeechOn: true, voiceStyle: "classic" });
const answerChecks = (sess) => { if (sess.phase === "formcheck") { engine.pickClean(); return true; } return false; };

/* Any day with at least one timed move and one rep move in it. */
const dayWith = (pred) => Object.keys(data.DAYS).find(k => !data.DAYS[k].spa
  && Object.values(data.DAYS[k].blocks || {}).flat().some(pred));
const timedDay = dayWith(e => !e.byReps && e.work > 0);
const repsDay  = dayWith(e => e.byReps);
ok(timedDay && repsDay, "the plan has timed and rep moves to test on");

/* ---- 1. A Done tap during the move's announcement is a decision, not noise ----
   The coach takes three or four seconds to say "Dead Bug. Three, two, one, go."
   A tap in that window used to do nothing (reps: no resolver yet) or expire
   before the countdown began (timed: the 1200 ms flag). It now cuts the
   announcement and starts the move. */
setSpeechDelay(3000);
{
  let cutAt = -1, counting = -1, cutMove = null;
  const s = await runSession({ dayKey: timedDay, light: "red", gateUnlocked: true, seed: voiceOn }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (cutAt < 0 && sess.phase === "work" && sess.announceResolver && !sess.currentEx.byReps) {
        cutAt = ms; cutMove = sess.currentEx.name; engine.advance(); return;
      }
      if (cutAt >= 0 && counting < 0 && sess.phase === "work" && sess.currentEx && sess.currentEx.name === cutMove
          && sess.timerSecs < sess.timerMax) counting = ms;
    }
  });
  ok(cutAt > 0, "a timed move was being announced and Done was tapped during the announcement (" + cutMove + ")");
  ok(counting > 0 && counting - cutAt <= 2000, "the tap cut the announcement short and the clock started at once (counting " + (counting - cutAt) + " ms later)");
  const row = s.ledger.find(l => l.name === cutMove);
  ok(row && row.status === "done", "the move then ran to its end and reads done — the tap ended the announcement, not the move");
  ok(row.actualSecs <= row.plannedSecs + 1, "and the seconds the coach spent talking were not charged as work (" + row.actualSecs + "s of " + row.plannedSecs + "s planned)");
}
{
  let cutAt = -1, cutMove = null, resolverSeen = false;
  const s = await runSession({ dayKey: repsDay, light: "red", gateUnlocked: true, seed: voiceOn }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (cutAt < 0 && sess.phase === "reps" && sess.announceResolver) { cutAt = ms; cutMove = sess.currentEx.name; engine.advance(); return; }
      if (cutAt >= 0 && sess.currentEx && sess.currentEx.name === cutMove && sess.byRepsResolver) resolverSeen = true;
    }
  });
  ok(cutAt > 0, "a rep move was being announced and Done was tapped during the announcement (" + cutMove + ")");
  ok(resolverSeen, "the reps started counting right after the tap");
  const row = s.ledger.find(l => l.name === cutMove);
  ok(row && row.status === "done" && row.repsCounted === row.repsPlanned,
     "every rep was still counted — the tap did not end the set with nothing done (" + row.repsCounted + " of " + row.repsPlanned + ")");
}

/* ---- 2. Skip Rest still announces the next move ----
   A rest that RAN OUT has already said "Rest. Next: <move>", so "Go" is all
   that is left. A rest she cut short used to take the same branch, so she heard
   "Go" and never the name of what she was about to do. */
{
  let skippedAt = -1, spokenBefore = 0, nextName = "";
  await runSession({ dayKey: timedDay, light: "red", gateUnlocked: true, seed: voiceOn }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      // in the beat between the coach's "Rest. Next: …" and the clock, which is where a real tap lands
      if (skippedAt < 0 && sess.phase === "rest" && !speechInFlight() && sess.upNextName) {
        skippedAt = ms; nextName = sess.upNextName; spokenBefore = spoken.length; engine.advance();
      }
    }
  });
  ok(skippedAt > 0, "a rest was skipped while its countdown was running, with " + JSON.stringify(nextName) + " up next");
  const after = spoken.slice(spokenBefore);
  const named = after.findIndex(t => t.startsWith(nextName + "."));
  ok(named >= 0, "the next move was announced by name after the skipped rest: " + JSON.stringify(after.slice(0, 2)));
  ok(!after.slice(0, named).includes("Go"), "and not with the bare \"Go\" a finished rest earns");
}
setSpeechDelay(0);

/* ---- 3. A double tap is one tap ----
   Done on the last rep resolved the set, the rest began at once (voice off), and
   the second half of the double tap — 100 ms later — skipped the rest. */
{
  let tappedAt = -1, restTicks = 0, tappedMove = null;
  await runSession({ dayKey: repsDay, light: "red", gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (tappedAt < 0 && sess.phase === "reps" && sess.byRepsResolver && sess.repsCounted > 0) {
        tappedAt = ms; tappedMove = sess.currentEx.name;
        engine.advance();
        setTimeout(() => engine.advance(), 100);   // the second half of a double tap
        return;
      }
      if (tappedAt >= 0 && ms <= tappedAt + 3000 && sess.phase === "rest") restTicks++;
    }
  });
  ok(tappedAt > 0, "Done was double-tapped on a rep move (" + tappedMove + ")");
  ok(restTicks >= 2, "the rest that followed still ran — the second tap did not skip it (" + restTicks + " rest ticks)");
  ok(engine.DONE_GUARD_MS >= 250 && engine.DONE_GUARD_MS <= 400, "the double-tap window is a human one, not a second");
}

/* ---- 4. The red STOP asks why ----
   Every red STOP used to be a pain stop: nothing paid, no streak day. A
   bathroom break cost the same as an injury. */
const greenDay = timedDay;
const stopInRoundTwo = (reason) => ({
  onTick: (ms, sess) => {
    if (answerChecks(sess)) return;
    if (sess.roundsCompleted >= 1 && ["work", "reps"].includes(sess.phase) && sess.running) {
      engine.openStopOverlay();
      engine.endFromStop(reason);
    }
  }
});
{
  const s = await runSession({ dayKey: greenDay, light: "green", gateUnlocked: true }, stopInRoundTwo("break"));
  const e = s.savedEntry;
  ok(e && s.roundsCompleted === 1, "she stopped in round two with one main round trained (" + s.roundsCompleted + ")");
  ok(!s.painFlag && !e.safetyStop, "\"I'm fine, just stopping\" is not a safety stop");
  ok(store.outcomeOf(e).state === "partial", "the day reads partial, not safety-stop: " + store.outcomeOf(e).state);
  ok(e.xpEarned >= store.SESSION_XP[1] && e.xpEarned < store.SESSION_XP[3], "and it pays for the round she trained (" + e.xpEarned + " XP)");
  ok(store.loadEvents().some(ev => ev.type === "stop" && ev.reason === "break"), "the grown-up log says it was a break");
}
{
  const s = await runSession({ dayKey: greenDay, light: "green", gateUnlocked: true }, stopInRoundTwo("pain"));
  const e = s.savedEntry;
  ok(s.painFlag && e.safetyStop, "\"Something hurts\" is a safety stop");
  ok(store.outcomeOf(e).state === "safety-stop" && e.xpEarned === 0, "it pays nothing and reads as a safety stop, as before");
  ok(store.loadEvents().some(ev => ev.type === "stop" && ev.reason === "pain"), "and the log says pain");
}
{
  const s = await runSession({ dayKey: greenDay, light: "green", gateUnlocked: true }, stopInRoundTwo(undefined));
  ok(s.painFlag && s.savedEntry.safetyStop, "a STOP with no reason given is still read the safe way");
}

/* ---- 5. A weekday that resolved to Recovery is a rest day, not a missed one ----
   Reporting soreness honestly turned the day's chip into "CATCH UP". */
{
  const unpin = pinClock("2026-09-17T18:00:00Z");   // a Thursday, noon in Edmonton
  const s = await runSession({ dayKey: "wednesday", light: "recovery", gateUnlocked: true });
  ok(s.mode === "recovery" && store.outcomeOf(s.savedEntry).state === "recovery", "Wednesday ran as a recovery pass and the record says so");
  const strip = tvm.weekStatuses();
  ok(strip.wednesday === "rest", "the week strip shows Wednesday as a rest day, not \"missed\": " + strip.wednesday);
  ok(strip.tuesday === "missed", "a weekday with nothing at all still reads missed: " + strip.tuesday);
  unpin();
}

/* ---- 6. ACWR counts training, over the textbook windows ----
   Recovery passes and safety stops are care and safety, not load; the windows
   are 7 and 28 days ending now, not 8 and 29 ÷ 4. */
{
  localStorage.clear(); store.migrate();
  const now = Date.now(), DAY = 86400000;
  const row = (daysAgo, o) => ({
    app: sport.APP_ID, dayKey: "monday", dayTitle: "Mon", xpVersion: store.XP_VERSION, sessionType: "main",
    lightResult: "green", isoDate: new Date(now - daysAgo * DAY).toISOString(), completedFully: true,
    roundsDone: 3, roundsPlanned: 3, xpEarned: 360, durationSecs: 1800, ...o
  });
  // 30 training minutes every 4 days across 4 weeks, plus care and a pain stop this week
  const trainingDays = [25, 21, 17, 13, 9, 5, 1];
  trainingDays.forEach(d => store.saveSession(row(d, {})));
  store.saveSession(row(2, { sessionType: "recovery", roundsDone: 0, roundsPlanned: 0, xpEarned: 0, durationSecs: 2400 }));
  store.saveSession(row(3, { safetyStop: true, pain: true, completedFully: false, roundsDone: 0, xpEarned: 0, durationSecs: 2400 }));
  const a = gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics", isWide: true }).analytics.acwr;
  // acute: the 30-minute sessions inside the last 7 days; chronic: those inside 28 days, ÷ 4
  const acuteMins = trainingDays.filter(d => d < 7).length * 30;
  const chronicWeekly = trainingDays.filter(d => d < 28).length * 30 / 4;
  const expected = (acuteMins / chronicWeekly).toFixed(2);
  ok(a.value === expected, "ACWR is training minutes only, 7 days over a 28-day weekly average: " + a.value + " (expected " + expected + ")");
  ok(/Recovery and safety stops are left out/.test(a.note), "and says so");
  const notYet = (() => { localStorage.clear(); store.migrate(); [1, 5, 9].forEach(d => store.saveSession(row(d, {})));
    return gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics", isWide: true }).analytics.acwr; })();
  ok(notYet.value === "—" && /2 weeks/.test(notYet.label), "under two weeks of history it says what it is waiting for: " + notYet.label);
}

console.log("✓ session safety passed (" + passed + " assertions)");
