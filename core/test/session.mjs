/* SESSION SAFETY AND FAIRNESS — the moments where the app used to take
   something off her that she had not lost.

   Run against whichever app's content this core is under: nothing here names a
   move, so it holds for both. Voice ON with a SLOW synthesiser where the bug was
   a race with the coach's speech; voice OFF where it was not. */
import { engine, store, sport, data, util, tvm, gvm, svm, sscreen, tscreen, runSession, setSpeechDelay, speechInFlight, spoken, pinClock } from "./harness.mjs";
const base   = new URL("../", import.meta.url).href;
const layout = await import(base + "layout.js");
const plan   = await import(base + "plan.js");
const outcome = await import(base + "outcome.js");

/* RegExp.escape is not in Node 18, and a cue contains "." and "/" */
const escapeForRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const voiceOn = () => store.updateSettings({ coachSpeechOn: true, voiceStyle: "classic" });
/* Answers the prompts a run can park on. The rep question is answered "Some"
   — the coach's count, which is exactly what every tap here recorded before
   the question existed — so nothing below changes meaning by being asked. */
const answerChecks = (sess) => {
  if (sess.phase === "formcheck") { engine.pickClean(); return true; }
  if (sess.phase === "repcheck") { engine.answerRepCheck("some"); return true; }
  return false;
};

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

/* ---- 2b. A TAP WHILE THE COACH IS STILL TALKING THROUGH THE REST ----------
   The rest stamps `since` at the top of its phase precisely so a tap during
   "Rest. Next: …" counts. The flag that tap set was wiped 1.2 s later, and
   with a real voice the line runs several seconds before the countdown that
   would have read it even begins — so the tap was dropped and the rest ran its
   full length. Done and Skip Rest did nothing exactly when a kid uses them:
   the moment the rest starts. */
{
  let tapAt = -1, leftAt = -1, hi = 0, lo = Infinity;
  await runSession({ dayKey: timedDay, light: "red", gateUnlocked: true, seed: voiceOn }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (tapAt < 0 && sess.phase === "rest" && speechInFlight()) { tapAt = ms; engine.advance(); return; }
      if (tapAt < 0 || leftAt >= 0) return;
      // Only THIS rest, and only once its clock is the thing on screen: before
      // the coach finishes, sess.timerSecs still holds the move that just ended.
      if (sess.phase !== "rest") { leftAt = ms; return; }
      if (!speechInFlight()) { hi = Math.max(hi, sess.timerSecs); lo = Math.min(lo, sess.timerSecs); }
    }
  });
  ok(tapAt > 0, "Done was tapped while the coach was still saying \"Rest. Next: …\"");
  ok(leftAt > 0, "the rest ended");
  ok(lo === Infinity || lo >= hi - 1,
     "and it ended without counting down — the tap was honoured the moment the clock could read it ("
     + (lo === Infinity ? "the countdown never got a tick in" : lo + "s left of " + hi + "s") + ")");
}

/* ---- 2b2. THE SIDE SWITCH IS A REST TOO -----------------------------------
   Every side, direction and set of a rep move passes through a five-second
   reset announced by the coach. Its countdown was the last one that did not
   stamp when its phase began, so a tap during "Nice. Switch sides — five to
   reset." was dropped and the five seconds ran on. */
{
  let tapAt = -1, leftAt = -1, hi = 0, lo = Infinity;
  await runSession({ dayKey: repsDay, light: "red", gateUnlocked: true, seed: voiceOn }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (tapAt < 0 && sess.phase === "sideswitch" && speechInFlight()) { tapAt = ms; engine.advance(); return; }
      if (tapAt < 0 || leftAt >= 0) return;
      if (sess.phase !== "sideswitch") { leftAt = ms; return; }
      if (!speechInFlight()) { hi = Math.max(hi, sess.timerSecs); lo = Math.min(lo, sess.timerSecs); }
    }
  });
  if (tapAt > 0) {
    ok(leftAt > 0, "the side switch ended after a tap during its line");
    ok(lo === Infinity || lo >= hi - 1,
       "and it ended without counting down ("
       + (lo === Infinity ? "the reset never got a tick in" : lo + "s left of " + hi + "s") + ")");
  } else {
    ok(true, "no per-side rep move in this plan to switch sides on — nothing to prove here");
  }
}

/* ---- 2c. THE OPENING IS HERS TO CUT --------------------------------------
   The mantra, the light and the first move's name ran un-interruptible: with a
   real voice that is eleven seconds of the Done ring on screen doing nothing.
   A tap means "I know this one, go", the same as on every move. */
{
  let tapAt = -1, leftAt = -1;
  await runSession({ dayKey: timedDay, light: "red", gateUnlocked: true, seed: voiceOn }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (tapAt < 0 && sess.phase === "greeting" && speechInFlight()) { tapAt = ms; engine.advance(); return; }
      if (tapAt >= 0 && leftAt < 0 && sess.phase !== "greeting") leftAt = ms;
    }
  });
  ok(tapAt >= 0, "Done was tapped during the opening");
  ok(leftAt > 0 && leftAt - tapAt < 1500,
     "and the workout moved on at once instead of waiting the greeting out (" + (leftAt - tapAt) + " ms)");
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
      // A beat longer than the rest itself: Done before the count finished
      // now asks "Did you get all N?", and answerChecks answers it a tick later.
      if (tappedAt >= 0 && ms <= tappedAt + 4000 && sess.phase === "rest") restTicks++;
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

/* ============================================================
   TIMER SCREEN — the layout rule, the spoken dose, and the three
   ways a session can be stopped.

   These exist because each one is a place where the obvious
   implementation is wrong in a way no rendered markup shows.
   ============================================================ */
{
  /* ---- the breakpoint ----------------------------------------------------
     It used to be `w >= 900 && w > h`: every iPad held UPRIGHT fell through to
     the phone layout. The rule is asserted as a table because the risk is not
     that tablets fail — it is that phones quietly start passing. */
  for (const [label, w, h, wide, tablet, tight] of [
    ["iPad mini upright",      744, 1133, true,  true,  true],
    ["iPad 10.2 upright",      810, 1080, true,  true,  true],
    ["iPad Air upright",       820, 1180, true,  true,  true],
    ["iPad Pro 11 upright",    834, 1194, true,  true,  true],
    ["iPad Pro 12.9 upright", 1024, 1366, true,  true,  false],
    ["iPad 10.2 landscape",   1080,  810, true,  true,  false],
    ["iPad Pro 12.9 landscape",1366,1024, true,  false, false],
    ["iPhone 15 portrait",     393,  852, false, false, false],
    ["iPhone Max portrait",    430,  932, false, false, false],
    ["iPhone landscape",       932,  430, true,  true,  false],
    ["laptop",                1440,  900, true,  false, false],
    ["short laptop",          1512,  780, true,  false, false]
  ]) {
    const r = layout.layoutFor(w, h);
    ok(r.isWide === wide && r.isTablet === tablet && r.tightColumn === tight,
       `${label} ${w}×${h}: wide=${r.isWide} tablet=${r.isTablet} tight=${r.tightColumn}`);
  }

  /* ---- the spoken dose ---------------------------------------------------
     The screen's `dose` is written to be READ ("2×8/side") and is nonsense out
     loud. The one that matters: a two-sided TIMED move splits `work` in half
     per side, so saying the whole number would ask for twice the work. */
  const said = (ex) => plan.spokenDose(ex);
  ok(said({ work: 30 }) === "30 seconds", "a timed move says its seconds");
  ok(said({ work: 60 }) === "1 minute", "sixty seconds is a minute, not sixty seconds");
  ok(said({ work: 75 }) === "1 minute 15 seconds", "and 75 is not '75 seconds'");
  ok(said({ work: 60, eachSide: true }) === "30 seconds per side",
     "a two-sided timed move says the HALF — the side is half the work: " + said({ work: 60, eachSide: true }));
  ok(said({ byReps: true, repsDetail: "8/side" }) === "8 reps per side", "reps per side");
  ok(said({ byReps: true, repsDetail: "2×8/side" }) === "2 sets of 8 per side", "sets of reps per side");
  ok(said({ byReps: true, repsDetail: "10" }) === "10 reps", "plain reps");
  ok(said({ byReps: true, repsDetail: "" }) === "", "an unreadable dose is silent, not wrong");
  ok(said(null) === "", "and no move at all is silent");

  /* ---- what the coach actually says -------------------------------------- */
  localStorage.clear(); store.migrate(); voiceOn();
  spoken.length = 0;
  await runSession({ dayKey: timedDay, light: "green", gateUnlocked: true, limitMs: 240000 },
    { onTick: (ms, s) => { answerChecks(s); if (ms > 120000) engine.endFromStop("break"); } });
  const opening = spoken.find(l => /Three, two, one, go\.$/.test(l));
  ok(opening && /\d/.test(opening),
     "the opening announcement carries the dose, not just the name: " + opening);

  /* ---- three reasons, two consequences -----------------------------------
     painFlag is a DENY-list on purpose: an unknown or missing reason must
     still read as a pain stop. A third reason that silently read as "pain"
     would have cost her the day's XP and the streak. */
  const stopWith = (reason) => {
    engine.exitSession();
    Object.assign(engine.sess, { running: true, currentEx: { name: "x" }, explore: false });
    if (reason === undefined) engine.endFromStop(); else engine.endFromStop(reason);
    return { hurt: engine.sess.painFlag, why: engine.sess.stopReason };
  };
  ok(stopWith("pain").hurt === true, "'something hurts' is a safety stop");
  ok(stopWith("break").hurt === false, "'no time' is an ordinary early end");
  const r = stopWith("restart");
  ok(r.hurt === false && r.why === "restart",
     "'start over' is not a pain stop, and is recorded as itself — not collapsed into 'break'");
  ok(stopWith(undefined).hurt === true, "NO reason given still reads as pain — the safe reading");
  ok(stopWith("nonsense").hurt === true && stopWith("nonsense").why === "pain",
     "and so does a reason we do not recognise");

  /* ---- starting over keeps nothing ---------------------------------------- */
  localStorage.clear(); store.migrate();
  const before = store.loadSessions().length;
  await runSession({ dayKey: timedDay, light: "green", gateUnlocked: true, limitMs: 240000 },
    { onTick: (ms, s) => { answerChecks(s); if (ms === 60000) engine.discardSession(); } });
  ok(store.loadSessions().length === before, "a discarded attempt writes no row at all");
  ok(engine.sess.xpEarned === 0, "and pays no XP");
  ok(engine.sess.saveFailed === false,
     "and is NOT reported as a failed save — she chose it, nothing went wrong");
  ok(engine.sess.stopReason === "restart", "the record knows why it was discarded");

  /* A stale discard flag must not bin the NEXT workout too. */
  localStorage.clear(); store.migrate();
  engine.sess.discard = true;
  await runSession({ dayKey: timedDay, light: "green", gateUnlocked: true, limitMs: 240000 },
    { onTick: (ms, s) => { answerChecks(s); if (ms > 120000) engine.endFromStop("break"); } });
  ok(store.loadSessions().length === 1, "a discard does not leak into the session after it");
}


/* ---- THE SHAPE OF THE SCREEN ---------------------------------------------

   Behaviour is asserted above; this asserts what is actually DRAWN, at each of
   the three layouts. Every one of these is something the change either added
   or removed, and none of them is visible from the engine. */
{
  let snap = null;
  await runSession({ dayKey: timedDay, light: "green", gateUnlocked: true }, {
    onTick: (ms, sx) => {
      answerChecks(sx);
      const ex = engine.sess.currentEx;
      if (!snap && ["work", "reps"].includes(sx.phase) && ex && ex.cue && ex.parentWatch)
        snap = { ...engine.sess, circuits: engine.sess.circuits };
    },
    limitMs: 1800000
  });
  ok(snap, "found a mid-session moment on a move with both a cue and a watch-for");

  const draw = (st) => {
    engine.exitSession(); Object.assign(engine.sess, snap);
    return sscreen.sessionScreen(svm.buildSessionVM(
      { inSession: true, detailOverlay: false, detailEx: null, ...st }));
  };
  const count = (h, re) => (h.match(re) || []).length;
  const roomy  = draw({ isWide: true,  isTablet: false, tightColumn: false });
  const tight  = draw({ isWide: true,  isTablet: true,  tightColumn: true  });
  const narrow = draw({ isWide: false, isTablet: false, tightColumn: false });
  const PHOTO = /linear-gradient\(165deg,var\(--aqua-wash\)/;

  for (const [name, html] of [["roomy", roomy], ["tight", tight], ["narrow", narrow]]) {
    /* End session was a strict subset of STOP and is gone; Skip took its slot. */
    ok(!/data-action="askEnd"/.test(html) && !/data-action="confirmEndEarly"/.test(html),
       name + ": the screen no longer offers End session, which STOP already did");
    ok(/data-action="askSkip"/.test(html), name + ": and offers Skip this move in its place");
    /* The pain rule moved out of the far-left rail to under the buttons — in
       BOTH trees, which is the half that is easy to forget. */
    ok(/Sharp pain, pinching, or numbness/.test(html), name + ": the pain rule is on screen");
    /* Exactly one current row, and one scroller to centre it in. */
    ok(count(html, /data-ex-cur/g) === 1, name + ": exactly one row is marked current");
    ok(count(html, /data-ex-list/g) === 1, name + ": and exactly one list scroller to centre it in");
    /* The cue MOVED to the ring; it was not copied there. */
    ok(count(html, new RegExp(escapeForRe(snap.currentEx.cue), "g")) === 1,
       name + ": the coach tip appears exactly once — moved, not duplicated");
    /* The per-move "Elapsed" pace bar is gone: its planned time was reps × 3 s
       and it filled before the coach's count did, so a full set read as ½.
       The one planned time still printed says what it is. */
    ok(!/id="s-ex-fill"/.test(html) && !/>Elapsed</.test(html),
       name + ": there is no per-move Elapsed bar under the ring");
    ok(/~\d+ min · estimate/.test(html),
       name + ": and the session-time line calls its planned minutes an estimate");
  }

  /* The picture is the clock's tenant, not its landlord: it goes when the
     column is too narrow to seat both, and the ⓘ still opens it. */
  ok(PHOTO.test(roomy), "a roomy screen shows the form photo");
  ok(!PHOTO.test(tight), "an upright iPad does not — its clock column is phone-sized");
  ok(!PHOTO.test(narrow), "and neither does a phone");
  ok(/data-action="openDetailCur"/.test(tight) && /data-action="openDetailCur"/.test(narrow),
     "but both still offer the ⓘ, which is where the photo went");

  /* The ring says which KIND of effort, and the rail can be collapsed. */
  ok(/\bTIMED\b|BY REPS/.test(roomy), "the ring names the kind of effort, not just 'not a rest'");
  ok(!/TIMED SET/.test(roomy), "and does not call it a SET — a set is the prescription unit, counted in the coach strip");
  ok(/data-action="toggleRail"/.test(roomy) && !/data-action="toggleRail"/.test(narrow),
     "the rail collapses where there is a rail, and not on a phone");
}

/* ---- THE PILL IS WHERE SHE PICKS UP -------------------------------------

   A resume runs the REMAINDER, and the side list used to render exactly that:
   a short stub of leftovers with every status pill blank. Nothing on the screen
   said what she had already done, what she had cut short, or where in the day
   she was starting again — which is the one question the list exists to answer.

   The list is the whole day now, and each move's pill is coloured from today's
   merged ledger. */
{
  const dayKey = timedDay;
  store.updateSettings({ coachSpeechOn: false });
  setSpeechDelay(0);
  /* A first sitting that ends part-way, with one move cut short in it. */
  let cut = null, stop = false;
  await runSession({ dayKey, light: "red", gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      /* Cut the SECOND warm-up move short: past MIN_EXERCISE_SECS so it lands
         `partial` rather than skipped, and not the first move, so the resume
         does not simply reopen on it. */
      if (!cut && (sess.phase === "work" || sess.phase === "reps")
          && sess.currentEx && sess.exElapsed >= 6
          && sess.currentEx.block === "warmup" && sess.ledger.length >= 1) {
        cut = sess.currentEx.name; engine.advance(); return;
      }
      if (cut && !stop && sess.ledger.some(l => l.name === cut) && sess.running) {
        stop = true; engine.endEarly();
      }
    }
  });
  const firstRows = (store.loadSessions().pop() || {}).ledger || [];
  ok(firstRows.length > 0, "the first sitting left rows in the log");
  engine.exitSession();

  /* And the resume that follows it. Read the list at the moment it opens. */
  let listAtStart = null, legendAtStart = "";
  await runSession({ dayKey, light: "red", gateUnlocked: true, wipe: false, limitMs: 120000 }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (!listAtStart && sess.running && sess.currentEx
          && (sess.phase === "work" || sess.phase === "reps")) {
        const vm = svm.buildSessionVM({ railOpen: true });
        listAtStart = vm.sessionExList;
        legendAtStart = vm.exListLegend;
        engine.endEarly();
      }
    }
  });
  ok(listAtStart, "the resumed session builds a list");
  const listed = listAtStart.filter(r => r.isEx).map(r => r.name);
  const ran = (engine.sess.circuits || []).flatMap(c => c.exercises.map(e => e.name));
  ok(listed.length > ran.length,
     "which is the WHOLE day, not just the remainder this sitting runs");
  firstRows.forEach(r => {
    ok(listed.includes(r.name), "every move she already went through is on it: " + r.name);
  });
  /* Each one carries its own verdict, in its own colour — done and cut-short
     used to share a tick, and a move she never reached looked the same as one
     she had finished. */
  const rowFor = (n) => listAtStart.find(r => r.isEx && r.name === n);
  const doneRow = firstRows.find(r => r.status === "done");
  if (doneRow) {
    const d = rowFor(doneRow.name);
    ok(d && /var\(--mint\)/.test(d.numStyle) && d.statusIcon === "✓",
       "a move she finished reads done, in mint");
  }
  const cutRow = firstRows.find(r => r.status === "partial");
  ok(cutRow, "the first sitting really did leave a move cut short");
  const c = rowFor(cutRow.name);
  ok(c && /var\(--sun\)/.test(c.numStyle) && c.statusIcon === "½",
     "a move she cut short says so, in its own colour and its own glyph");
  const untouched = listAtStart.find(r => r.isEx && !firstRows.some(l => l.name === r.name) && !r.isCur);
  ok(untouched && /var\(--surface-2\)/.test(untouched.numStyle) && !untouched.statusIcon,
     "and a move she has not reached yet is plainly blank");
  ok(listAtStart.filter(r => r.isEx && r.isCur).length === 1,
     "exactly one move is marked as the one she is standing on");
  ok(/picking up/.test(legendAtStart || ""),
     "and the colours are explained, once, above the list");
  /* The list is NOT the runner. Nothing about what she is asked to do moved. */
  ok(!ran.some(n => (firstRows.filter(l => l.status === "done").map(l => l.name)).includes(n)),
     "a move she finished is still never handed back to her");
  engine.exitSession();
}

/* ---- A MOVE SHE TAPPED DONE ON IS NOT HANDED BACK TO HER -----------------

   A move ended before DONE_WORK_FRACTION of its clock is `partial`: real work,
   and not a finished move. It was offered again on the next sitting, which is
   right in principle and wrong in practice — a kid who taps Done a beat early
   on every warm-up move banks nothing, and "Finish remaining moves" hands her
   the whole workout from move one.

   So a partial is remembered by name now, in its own list, and the next sitting
   does not ask for it. Nothing about what it is WORTH moved: the streak, the XP
   and `bankedCredit` still read `done` and nothing else. And she can have them
   back — the day card offers it, and redoPartials is what the button sets. */
{
  localStorage.clear(); store.migrate();
  store.updateSettings({ coachSpeechOn: false });
  setSpeechDelay(0);
  /* Today's own weekday, so the DAY CARD can be read as well — a resume is only
     ever offered for today (the No-Debt rule). */
  const dayKey = util.edmontonDayKey();
  let cut = null, stop = false;
  await runSession({ dayKey, light: "red", gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (!cut && (sess.phase === "work" || sess.phase === "reps") && sess.currentEx
          && sess.exElapsed >= 6 && sess.currentEx.block === "warmup" && sess.ledger.length >= 1) {
        cut = sess.currentEx.name; engine.advance(); return;
      }
      if (cut && !stop && sess.ledger.some(l => l.name === cut) && sess.running) {
        stop = true; engine.endEarly();
      }
    }
  });
  engine.exitSession();
  const prog = store.loadDayProgress(dayKey) || { moves: {}, partials: {} };
  const cutRow = ((store.loadSessions().pop() || {}).ledger || [])
    .find(l => l.status === "partial");
  ok(cutRow, "the sitting left a move cut short");
  ok(!(prog.moves[cutRow.block] || []).includes(cutRow.name),
     "a move she cut short is still not a FINISHED move");
  ok((prog.partials[cutRow.block] || []).includes(cutRow.name),
     "but it is remembered, by name, in its own list");
  const banked = Object.values(prog.moves).reduce((n, l) => n + (l || []).length, 0);
  ok(Number(prog.bankedCredit) === banked,
     "and it earns no credit: the streak and the XP read `done` only, as before");

  const held = engine.planResume(dayKey, "red");
  const heldMoves = held.circuits.flatMap(c => c.exercises.map(e => e.name));
  ok(!heldMoves.includes(cutRow.name),
     "so the next sitting does not hand it back to her unasked");
  const redo = engine.planResume(dayKey, "red", { redoPartials: true });
  ok(redo.circuits.flatMap(c => c.exercises.map(e => e.name)).includes(cutRow.name),
     "and \"+ Add them back\" on the day card is how she asks for it");
  /* MAIN IS THE EXCEPTION, and deliberately so: its unit is the ROUND, not the
     move, so a round that fell short is re-run whole. Marking its moves would
     empty the ragged-round remainder and renumber rows straight onto the ones
     already in the log. */
  ok(!(prog.partials.main || []).length, "main's moves are never marked this way");

  /* AND THE CARD SAYS SO, rather than quietly deciding for her. */
  const cardVm = tvm.buildTodayVM({ selectedDay: dayKey, expanded: {}, isWide: true });
  if (cardVm.dayView.showCta && cardVm.dayView.ctaAction === "goSession") {
    ok(/cut short/.test(cardVm.dayView.partialSkipLabel || ""),
       "the day card names the moves it is holding back");
    ok(/data-action="goSessionRedo"/.test(tscreen.todayWide(cardVm)),
       "and offers a button that asks for them back");
  }
  localStorage.clear(); store.migrate();
}

/* ---- ONE WAY INTO EXPLORE, ON A DAY SHE HAS FINISHED ---------------------
   A finished day's own button already IS explore — "Look at the moves", or
   "Do it again" on a spa day — and the card printed a second "Explore the
   moves" immediately underneath it. */
{
  localStorage.clear(); store.migrate();
  engine.exitSession();
  const doneKey = util.edmontonDayKey();
  await runSession({ dayKey: doneKey, light: "green", gateUnlocked: true },
                   { onTick: (ms, sess) => { answerChecks(sess); } });
  engine.exitSession();
  const vm = tvm.buildTodayVM({ selectedDay: doneKey, expanded: {}, isWide: true });
  ok(vm.dayView.isDone || vm.dayView.isRest, "the card reads as a finished day");
  const hits = (tscreen.todayWide(vm).match(/data-action="goExplore"/g) || []).length;
  ok(hits === 1, "which offers exactly one explore button, not the two it used to stack");
  if (vm.dayView.ctaAction === "goExplore") {
    ok(vm.dayView.showExplore === false,
       "the secondary button stands down when the card's own button is already explore");
  }
  /* And a day with work still in it keeps BOTH, because they are two different
     offers: finish what is left, or go and look at the moves. */
  const openVm = tvm.buildTodayVM({ selectedDay: timedDay === doneKey ? repsDay : timedDay,
                                    expanded: {}, isWide: true });
  if (openVm.dayView.showExplore) {
    ok(openVm.dayView.ctaAction !== "goExplore",
       "while a day she can still train keeps its own start button");
  }
  localStorage.clear(); store.migrate();
}

/* ---- DONE BEFORE THE COUNT FINISHED ASKS, ONCE ----------------------------

   A rep move is graded on the coach's spoken count, and the coach is slower
   than a kid who knows the move. She finished her eight while the coach was on
   five, tapped Done, and the ledger said five of eight — partial — for a set
   she did in full. Nothing asked her. Now something does: "Did you get all
   8?" with All of them / Almost / Some, and the answer is what is recorded.
   A Done after the count finished is what it always was. */
{
  store.updateSettings({ coachSpeechOn: false });
  setSpeechDelay(0);
  const vmNow = () => svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null });

  /* Tap Done part-way through the count, answer `answer`, and return the row. */
  const cutAndAnswer = async (answer, seed) => {
    let tapped = null, card = null, html = "", asked = false, spokenBefore = 0;
    const s = await runSession({ dayKey: repsDay, light: "red", gateUnlocked: true, seed }, {
      onTick: (ms, sess) => {
        if (sess.phase === "formcheck") { engine.pickClean(); return; }
        if (!tapped && sess.phase === "reps" && sess.byRepsResolver
            && sess.repsCounted >= 1 && sess.repsCounted < sess.repsTarget) {
          tapped = { name: sess.currentEx.name, coach: sess.repsCounted, target: sess.repsTarget };
          spokenBefore = spoken.length;
          engine.advance();
          return;
        }
        if (tapped && sess.phase === "repcheck") {
          asked = true;
          if (!card) { card = vmNow(); html = sscreen.sessionScreen(card); }
          engine.answerRepCheck(answer);
          return;
        }
        if (tapped && sess.ledger.some(l => l.name === tapped.name) && sess.running) engine.endEarly();
      }
    });
    const row = s.ledger.find(l => l.name === tapped.name);
    return { tapped, asked, card, html, row, said: spoken.slice(spokenBefore) };
  };

  /* "All of them" — the whole set, done. */
  const all = await cutAndAnswer("all", voiceOn);
  ok(all.tapped && all.tapped.coach < all.tapped.target,
     "Done was tapped at " + all.tapped.coach + " of " + all.tapped.target + " on " + all.tapped.name);
  ok(all.asked && all.card && all.card.isRepCheck, "and the question came up in the ring's place");
  /* Both numbers, not just the target: the ring never showed her the total,
     so a bare "Did you get all 32?" arrived out of nowhere at the one moment
     it decides what is recorded. */
  ok(/^You counted \d+ of \d+\. Did you finish the rest\?$/.test(all.card.repCheckQuestion),
     "asking with the count she is at AND the one she is aiming for: " + all.card.repCheckQuestion);
  ok(all.card.repCheckQuestion.includes(" of " + all.tapped.target + "."),
     "and the target is the move's whole dose: " + all.card.repCheckQuestion);
  ok(all.card.repCheckRule === "All " + all.tapped.target + " counts the move.",
     "with the rule in one line: " + all.card.repCheckRule);
  ok((all.html.match(/data-action="answerRepCheck"/g) || []).length === 3
     && /All of them/.test(all.html) && /Almost/.test(all.html) && /Some</.test(all.html),
     "three answers, and no others");
  ok(!/id="s-timer-text"/.test(all.html), "the count is paused — the rep ring is gone while she answers");
  ok(!/data-action="askSkip"/.test(all.html), "and Skip is not offered over a question, as on any prompt");
  ok(all.said.some(t => /You counted \d+ of \d+\. Did you finish the rest\?/.test(t)),
     "the coach asks it out loud with both numbers, the way the card does");
  ok(all.row && all.row.status === "done" && all.row.repsCounted === all.tapped.target,
     "\"All of them\" records the full count and the move reads done (" + all.row.repsCounted + " of " + all.row.repsPlanned + ")");

  /* "Some" — the coach's count, as before. */
  const some = await cutAndAnswer("some");
  ok(some.asked, "the question came up again");
  ok(some.row && some.row.status === "partial" && some.row.repsCounted === some.tapped.coach,
     "\"Some\" keeps the coach's count and the move reads partial (" + some.row.repsCounted + " of " + some.row.repsPlanned + ")");

  /* "Almost" — the coach's count plus half of what was left, at least one. */
  const almost = await cutAndAnswer("almost");
  const c = almost.tapped.coach, t = almost.tapped.target;
  const want = Math.min(t, Math.max(c + 1, c + Math.floor((t - c) / 2)));
  ok(almost.row && almost.row.repsCounted === want,
     "\"Almost\" records the coach's " + c + " plus half the rest: " + almost.row.repsCounted + " of " + t);
  ok(almost.row.status === (want >= t ? "done" : "partial"), "and is graded on that number");

  /* Done ON the card keeps the coach's count — it is not a fourth answer. */
  {
    let tapped = null, dismissedAt = -1, card = null;
    const s = await runSession({ dayKey: repsDay, light: "red", gateUnlocked: true }, {
      onTick: (ms, sess) => {
        if (sess.phase === "formcheck") { engine.pickClean(); return; }
        if (!tapped && sess.phase === "reps" && sess.byRepsResolver
            && sess.repsCounted >= 1 && sess.repsCounted < sess.repsTarget) {
          tapped = { name: sess.currentEx.name, coach: sess.repsCounted }; engine.advance(); return;
        }
        if (tapped && sess.phase === "repcheck") {
          card = card || vmNow();
          if (dismissedAt < 0) { dismissedAt = ms; engine.advance(); }
          return;
        }
        if (tapped && sess.ledger.some(l => l.name === tapped.name) && sess.running) engine.endEarly();
      }
    });
    const row = s.ledger.find(l => l.name === tapped.name);
    ok(card && /coach's count/i.test(card.doneLabel), "the Done button says what it does on the card: " + card.doneLabel);
    ok(row && row.repsCounted === tapped.coach, "and doing it keeps the coach's count (" + row.repsCounted + ")");
  }

  /* Done AFTER the count finished: no question. The only moment a finished
     count is still on screen is the extra-reps offer of a ranged move. */
  const rangedDay = dayWith(e => e.byReps && (data.exPrescription(e).repsHigh || 0) > data.exPrescription(e).reps);
  if (rangedDay) {
    let tapped = null, asked = false;
    const s = await runSession({ dayKey: rangedDay, light: "red", gateUnlocked: true }, {
      onTick: (ms, sess) => {
        if (sess.phase === "formcheck") { engine.pickClean(); return; }
        if (!tapped && sess.phase === "reps" && sess.byRepsResolver && sess.repsCounted >= sess.repsTarget) {
          tapped = { name: sess.currentEx.name }; engine.advance(); return;
        }
        if (tapped && sess.phase === "repcheck") asked = true;
        if (tapped && sess.ledger.some(l => l.name === tapped.name) && sess.running) engine.endEarly();
      }
    });
    ok(tapped, "Done was tapped with the count already complete (" + tapped.name + ")");
    ok(!asked, "and nothing was asked");
    const row = s.ledger.find(l => l.name === tapped.name);
    ok(row && row.status === "done" && row.repsCounted === row.repsPlanned, "the move reads done, as it always did");
  } else {
    ok(true, "no ranged rep move in this plan — nothing to prove about the extra-reps offer");
  }
  engine.exitSession();
}

/* ---- THE ROUND DOTS SHOW ROUNDS THAT COUNTED -----------------------------

   The dots were drawn off the round NUMBER: every earlier round green whether
   or not it counted, the current one always in the accent, and once main
   ended the finisher's own "round 1" reset the line — so after three of three
   she saw one green. Green is the day's counted rounds now, the accent is the
   round she is in, and once main is behind her the line says so. */
{
  store.updateSettings({ coachSpeechOn: false });
  setSpeechDelay(0);
  const vmNow = () => svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null });
  const paint = (dots) => dots.map(d => /var\(--mint\)/.test(d.style) ? "mint"
    : /var\(--aqua\)/.test(d.style) ? "accent" : "hollow");
  let warm = null, second = null, after = null;
  await runSession({ dayKey: timedDay, light: "green", gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (!["work", "reps"].includes(sess.phase) || !sess.currentEx) return;
      const block = (sess.circuits[sess.ci] || {}).block;
      if (!warm && block === "warmup") warm = vmNow();
      if (!second && block === "main" && sess.round === 2) second = vmNow();
      const mains = sess.circuits.map((c, i) => c.block === "main" ? i : -1).filter(i => i >= 0);
      if (!after && block !== "main" && mains.length && mains.every(i => i < sess.ci)) after = vmNow();
    }
  });
  ok(warm && warm.roundLine === "" && warm.roundDots.length === 0, "the warm-up carries no round line at all");
  ok(second, "the run reached round two of main");
  ok(/Round 2 of 3/.test(second.roundLine), "in round two the line says so: " + second.roundLine);
  ok(paint(second.roundDots).join(",") === "mint,accent,hollow",
     "and the dots read counted, in progress, to come: " + paint(second.roundDots).join(","));
  ok(after, "the run went on past the main block");
  ok(after.roundLine === "Main · 3 of 3 done", "after main the line gives main's verdict: " + after.roundLine);
  ok(paint(after.roundDots).join(",") === "mint,mint,mint",
     "with every counted round green: " + paint(after.roundDots).join(","));
  engine.exitSession();
}

/* ---- THE LIST IS THIS ROUND, AND THE ROUND IS THE TITLE'S ------------------

   The bug this is here for: a main move finished PERFECTLY in round 1 of 3
   showed a ½ — the list was grading every move across all its rounds, so
   "1 of 3 rounds done" came out as "cut short", under a legend that says
   exactly that, for the whole of rounds 1 and 2. Beside it sat a second mark,
   a pace dot, which read the same row as 100% and painted itself green. One
   row, two marks, disagreeing, and neither one true.

   A move row answers one question now — how did THIS move go in THIS round —
   and the round belongs to the block title. */
{
  const seenPerRound = new Map();
  const mainNames = ((data.DAYS[repsDay].blocks || {}).main || []).map(e => e.name);
  let midRoundOne = null, roundTwoOpening = null, html = null;
  await runSession({ dayKey: repsDay, light: "green", gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (!sess.currentEx || sess.currentEx.block !== "main") return;
      const vm = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
      const rows = (vm.sessionExList || []).filter(r => r.isEx);
      const done = sess.ledger.filter(l => l.block === "main" && l.round === sess.round);
      /* The first look INSIDE each round, before anything in it has been done.
         Counted over the MAIN moves only: a finished warm-up keeps its ticks,
         because it is not the block whose rounds are turning over. */
      if (!seenPerRound.has(sess.round) && !done.length) {
        seenPerRound.set(sess.round, rows.filter(r => !r.isCur && r.statusIcon && mainNames.includes(r.name)).length);
      }
      if (!midRoundOne && sess.round === 1 && done.length >= 3) midRoundOne = { vm, rows, done };
      if (!roundTwoOpening && sess.round === 2) roundTwoOpening = { vm, rows };
      if (!html && sess.round === 2) html = sscreen.sessionScreen(vm);
    }
  });

  ok(midRoundOne, "the run got several moves into round one of main");
  /* A row is written the instant a move ends, while she is still standing on
     it — and standing on a move outranks its history, by design. So the check
     is on the moves she has moved PAST. */
  const curName = (midRoundOne.rows.find(r => r.isCur) || {}).name;
  const ledgerDone = midRoundOne.done.filter(l => l.status === "done" && l.name !== curName).map(l => l.name);
  ok(ledgerDone.length >= 2, "and the ledger really did record them done: " + ledgerDone.length);
  ledgerDone.forEach(name => {
    const row = midRoundOne.rows.find(r => r.name === name && !r.isCur);
    ok(row && row.statusIcon === "✓",
       "a move done in full in round one reads done, not cut short: " + name + " -> " + (row && row.statusIcon));
  });
  ok(midRoundOne.rows.every(r => r.paceDotStyle === undefined),
     "there is no second mark on the row to disagree with the first");

  ok(roundTwoOpening, "the run reached round two");
  ok(seenPerRound.get(2) === 0,
     "and round two opens with every mark cleared, because a round is a fresh one: "
     + seenPerRound.get(2) + " marks left over");

  /* THE RULE, AS A TEST. Round is a block-title word; nothing on a move row
     may say it, and nothing may quietly count rounds at her either. */
  ok(html, "the session screen rendered mid-round");
  ok((html.match(/Round 2 of 3/g) || []).length === 1,
     "the round is named exactly once on the whole screen, not three times over");
  ok(!/\bx3\b|×3/.test(html), "and no static round figure is left sitting on the list");
  const moveRows = (roundTwoOpening.rows || []);
  ok(moveRows.length > 0 && moveRows.every(r => !/round/i.test(r.name) && !/\d+\s*of\s*\d+/.test(r.name)),
     "no move row names a round or counts them");
  engine.exitSession();
}

/* ---- WHAT IS OWED IS ONE LIST, AND REDOING IT CLEARS IT --------------------

   "+ Add them back" re-ran the move but filed it under the NEXT unbanked round
   number, so the redo never matched the row it was meant to improve: rows are
   keyed block|round|name, and the ½ stood for ever however many times she went
   back for it. The end report and the redo read the same merged rows now, so
   what the report offers is what the redo runs — and once it is run, the offer
   stops being made. */
{
  /* Named off the plan, never off one app's content: this core runs under both. */
  const mainOf = (k) => ((data.DAYS[k].blocks || {}).main || []);
  const redoDay = Object.keys(data.DAYS).find(k => !data.DAYS[k].spa
    && mainOf(k).some(e => !e.byReps && Number(e.work) >= 20));
  ok(redoDay, "the plan has a day with a timed main move long enough to cut short");
  const MOVE = mainOf(redoDay).find(e => !e.byReps && Number(e.work) >= 20).name;
  const lastSettled = () => {
    const recs = outcome.dayRecords();
    return recs.length ? recs[recs.length - 1].settledXp : null;
  };
  const answerOnly = { onTick: (ms, sess) => { answerChecks(sess); } };

  // What the day pays when it is trained straight through, for comparison.
  await runSession({ dayKey: redoDay, light: "green", gateUnlocked: true }, answerOnly);
  const cleanXp = lastSettled();
  ok(cleanXp > 0, "a clean run of the day pays something to compare against: " + cleanXp);
  engine.exitSession();

  const short = (sess) => sess.phase === "work" && sess.currentEx && sess.currentEx.name === MOVE
    && sess.round === 1 && sess.timerMax - sess.timerSecs >= 5 && sess.timerSecs > 10;
  await runSession({ dayKey: redoDay, light: "green", gateUnlocked: true }, {
    onTick: (ms, sess) => { if (answerChecks(sess)) return; if (short(sess)) engine.advance(); }
  });
  const rowsAfterOne = store.loadSessions().flatMap(r => r.ledger || []);
  const owed = outcome.shortRoundsFor(rowsAfterOne, "main", MOVE);
  ok(owed.length === 1 && owed[0].round === 1 && owed[0].status === "partial",
     "round one is what is owed, and it is named: " + JSON.stringify(owed));
  const fvOwed = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
  ok(!fvOwed.allInFull && fvOwed.notFull.some(r => r.name === MOVE && /round 1 short/.test(r.label)),
     "the finish screen says so in the same words: " + JSON.stringify(fvOwed.notFull));
  ok(fvOwed.notFull.length < mainOf(redoDay).length,
     "and lists nothing she finished — it is an exception list, not a receipt");

  const offeredAs = [];
  await runSession({ dayKey: redoDay, light: "green", gateUnlocked: true, wipe: false, redoPartials: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (sess.currentEx && sess.currentEx.name === MOVE && !offeredAs.includes(sess.round)) offeredAs.push(sess.round);
    }
  });
  ok(offeredAs.length === 1 && offeredAs[0] === 1,
     "the redo offers ROUND ONE back, under its own number, not the next free one: " + JSON.stringify(offeredAs));
  const rowsAfterRedo = store.loadSessions().flatMap(r => r.ledger || []);
  ok(outcome.shortRoundsFor(rowsAfterRedo, "main", MOVE).length === 0,
     "so the merged record upgrades it and nothing is owed any more");
  const fvClear = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
  ok(fvClear.allInFull && fvClear.notFull.length === 0,
     "and the finish screen has nothing left to list");
  ok(lastSettled() === cleanXp,
     "the day pays what a day trained straight through pays — a redone round is not paid twice: "
     + lastSettled() + " vs " + cleanXp);
  engine.exitSession();
}

/* ---- ONE WORD PER THING, AND THE SCREEN PROVES IT ------------------------

   The app called the same thing two names in a dozen places, and two of them
   contradicted each other at the same second: the coach SAID "Block done!"
   while the screen said "Section Done!"; the badge said "Main Circuit" while
   the progress label under it said "Main"; the list legend said "½ cut short"
   while the move review's legend said "½ short"; and the coach strip claimed
   "LEFT SIDE" when nothing in the app knows which side she started on.

   The root of it was duplicated label maps — a second copy of a name is a
   second answer waiting to disagree. This guard is the point of the whole
   exercise: it fails the moment a retired word comes back, so the audit stays
   done instead of being re-derived the next time two screens drift. */
{
  const RETIRED = [
    [/\bCircuit\b/, "Circuit — the repeating unit is a Round, and the block is Main"],
    [/\bSection\b/i, "Section — the coach says Block, so the screen says Block"],
    /* The coach strip may not INVENT a side — it does not know which one she
       started on. Content that names a side (a physio said the right ankle is
       the stiff one) is a different thing and is allowed; this bans the strip's
       uppercase form only. */
    [/(?:SET|REP) \d+ OF \d+[^<]*(?:LEFT|RIGHT) SIDE|>\s*(?:LEFT|RIGHT) SIDE\s*</,
     "an uppercase LEFT/RIGHT SIDE on the coach strip — the runner only knows first and second"],
    [/TIMED SET/, "TIMED SET — a set is the prescription unit, counted elsewhere"],
    [/\bworkout\b/i, "workout — this is a session"],
    [/\bexercises?\b/i, "exercise — the kid-facing word is move"],
    /* "press" is an instruction word, but Pallof Press is a MOVE. Move names
       come from the plan and are not ours to police, so they are struck out
       before matching — otherwise this guard fails on content the moment a
       snapshot happens to include that move. */
    [/\bpress\b/i, "press — every other instruction says tap"],
    [/½ cut short/, "two legends for one glyph"],
    /* Two units with near-identical names, printed one line apart. They are
       now "moves" and "times done" — both facts, neither in jargon. */
    [/\bmovements?\b/i, "movement — the unit she reads is a move"],
    [/\bperformances?\b/i, "performance — the unit she reads is \"times done\""],
  ];
  /* A status enum rendered raw into something she can read. `moveReview` used
     to fall through to it, so an aria-label read "Round 2 — partial". */
  const ENUM_IN_LABEL = /(?:title|aria-label)="[^"]*\b(?:partial|banked|missing)\b[^"]*"/;

  /* Asset paths are not copy: assets/exercises/<name>.webp is a filename on
     disk, not a word she reads. Strip src/href before matching. */
  const moveNames = Object.values(data.DAYS)
    .flatMap(d => Object.values(d.blocks || {}).flat().concat(d.prepMenu || [], d.recovery || []))
    .map(e => e && e.name).filter(Boolean);
  const copyOnly = (html) => moveNames.reduce(
    (t, n) => t.split(n).join(" "),
    String(html).replace(/(?:src|href|data-fallback)="[^"]*"/g, ""));
  const screens = [];
  await runSession({ dayKey: repsDay, light: "green", gateUnlocked: true }, {
    onTick: (ms, sess) => {
      if (answerChecks(sess)) return;
      if (ms % 30000) return;
      const vm = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
      screens.push(["session", copyOnly(sscreen.sessionScreen(vm))]);
    }
  });
  const fin = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
  screens.push(["finish", copyOnly(sscreen.sessionScreen(fin))]);
  const tv = tvm.buildTodayVM({ selectedDay: repsDay, expanded: { main: true, warmup: true } });
  screens.push(["today", copyOnly(tscreen.todayWide({ ...tv, blocks: tv.blocks.map(b => ({ ...b, bodyStyle: "" })) }))]);

  ok(screens.length > 3, "rendered the session, the finish screen and the day card (" + screens.length + " snapshots)");
  RETIRED.forEach(([re, why]) => {
    const hit = screens.find(([, html]) => re.test(html));
    ok(!hit, "no screen says " + why + (hit ? " — found on the " + hit[0] + " screen" : ""));
  });
  const leak = screens.find(([, html]) => ENUM_IN_LABEL.test(html));
  ok(!leak, "no title or aria-label renders a raw status enum"
     + (leak ? " — on the " + leak[0] + " screen: " + (leak[1].match(ENUM_IN_LABEL) || [])[0] : ""));

  /* And the round is named where it cannot be hidden. The exercise list is a
     rail she can collapse; a round that only said its name there went with it. */
  const anyVm = svm.buildSessionVM({ isWide: true, expanded: {}, detailEx: {} });
  const railless = sscreen.sessionScreen({ ...anyVm, sessionExList: [], railOpen: false, isWide: true });
  ok(!/Round \d+ of \d+/.test(sscreen.sessionScreen({ ...anyVm, sessionExList: [] }))
     || /Round \d+ of \d+/.test(railless),
     "the round survives with no exercise list at all — it lives beside the timer");
  engine.exitSession();
}

/* ---- ONE DOSE, SAID THE SAME WAY BY THE SCREEN AND THE COACH ---------------

   Band Ankle 4-Way is {reps:8, dirs:4} — thirty-two reps. The ring showed the
   string somebody typed, "8/dir"; the coach read a different string and said
   "8 reps"; and the count the runner walked was a third thing neither of them
   consulted. A kid who did eight and tapped Done was then asked "Did you get
   all 32?" — a number she had never been shown — and answering yes banked
   thirty-two of thirty-two for a quarter of the move.

   The prescription is described once now, and both voices format those parts.
   These assertions are about the two of them agreeing, not about wording for
   its own sake. */
{
  const P = (pr) => ({ byReps: true, prescription: plan.normalizePrescription(pr) });
  const rows = [
    [{ reps: 8, dirs: 4 },                          "8 × 4 ways",            "32 reps in total"],
    [{ reps: 8, dirs: 2 },                          "8 × 2 ways",            "16 reps in total"],
    [{ reps: 3, sides: 2, dirs: 2, sideWord: "arm" }, "3 × 2 ways, each arm", "12 reps in total"],
    [{ reps: 8, sides: 2, dirs: 2, sideWord: "leg" }, "8 × 2 ways, each leg", "32 reps in total"],
    [{ sets: 2, reps: 8, sides: 2 },                "8 each side",           "32 reps in total"],
    [{ reps: 8, repsHigh: 10, sides: 2 },           "8–10 each side",        "16–20 reps in total"],
    [{ reps: 8, sideReps: [8, 10], sides: 2 },      "8 then 10",             "18 reps in total"],
    [{ reps: 2, repsHigh: 3 },                      "2–3",                   ""],
    [{ reps: 12 },                                  "12",                    ""]
  ];
  rows.forEach(([pr, big, sub]) => {
    const d = plan.doseLines(P(pr));
    ok(d.big === big, "the ring says " + JSON.stringify(big) + ", got " + JSON.stringify(d.big));
    ok(d.sub === sub, "and the line under it says " + JSON.stringify(sub) + ", got " + JSON.stringify(d.sub));
  });

  /* The ring is a fixed circle. A dose that needs a sentence gets one BELOW
     it, never inside it. */
  rows.forEach(([pr]) => ok(plan.doseLines(P(pr)).big.length <= 22,
    "no ring string is longer than the ring: " + plan.doseLines(P(pr)).big));

  /* THE WHOLE POINT: the screen and the coach must not name different numbers. */
  rows.forEach(([pr]) => {
    const ex = P(pr), d = plan.doseLines(ex), said = plan.spokenDose(ex);
    const total = String(ex.prescription.totalReps);
    if (ex.prescription.segments > 1 && d.sub.includes(total)) {
      ok(said.includes(total) || !/in total/.test(said),
         "the coach does not contradict the screen's total (" + total + "): " + said);
    }
    ok(!/\d+\s*\/\s*(dir|side|leg|arm)/.test(d.big + d.sub + d.full),
       "and no derived string still carries a raw /dir or /side: " + d.short);
  });

  const bandAnkle = P({ reps: 8, dirs: 4 });
  ok(plan.spokenDose(bandAnkle) === "8 reps in each of 4 directions, 32 in total",
     "the coach says the whole dose for a four-way move: " + plan.spokenDose(bandAnkle));

  /* A note is for reading. It must reach the sentence and nothing else — not
     the ring, not a list row, and never the coach. */
  const noted = { ...P({ reps: 8 }), note: "dowel on the back" };
  const nd = plan.doseLines(noted);
  ok(nd.full.includes("dowel on the back"), "a note reaches the long form: " + nd.full);
  ok(!nd.big.includes("dowel") && !nd.short.includes("dowel"), "but not the ring or a list row");
  ok(!plan.spokenDose(noted).includes("dowel"), "and the coach never reads it out");

  /* The four oldest fixtures carry no prescription at all. They still get the
     reading they always had — content exists whose repsDetail is prose and
     could never be parsed, and it must keep working. */
  ok(plan.spokenDose({ byReps: true, repsDetail: "8/side" }) === "8 reps per side", "legacy: reps per side");
  ok(plan.spokenDose({ byReps: true, repsDetail: "2×8/side" }) === "2 sets of 8 per side", "legacy: sets per side");
  ok(plan.spokenDose({ byReps: true, repsDetail: "10" }) === "10 reps", "legacy: plain reps");
  ok(plan.spokenDose({ byReps: true, repsDetail: "" }) === "", "legacy: an unreadable dose stays silent");

  /* A DIRECTION COUNT MUST BE STATED. */
  let threw = "";
  try { plan.parsePrescription("8/dir"); } catch (e) { threw = e.message; }
  ok(/does not say how many directions/.test(threw), "a bare /dir fails at load: " + threw);
  ok(plan.parsePrescription("8/4-way").dirs === 4, "and a stated count is read: 8/4-way is four");

  /* An asymmetric dose is walked, not averaged. */
  const rock = plan.normalizePrescription({ reps: 8, sideReps: [8, 10], sides: 2 });
  ok(rock.totalReps === 18, "eight on one side and ten on the other is eighteen, not sixteen");
  ok(plan.prescriptionSegments(rock).map(g => g.reps).join(",") === "8,10",
     "and the runner counts to each of them in turn");

  /* NAMED SIDES SURVIVE. The runner never invents a side, but where the
     content states one -- a physio found the right ankle stiffer -- the
     screen, the coach and the running order must all say so. */
  const named = plan.normalizePrescription({ reps: 8, sideReps: [8, 10], sides: 2, sideNames: ["left", "right"] });
  const namedEx = { byReps: true, prescription: named };
  ok(plan.doseLines(namedEx).big === "8 left, 10 right", "a named side is on the ring: " + plan.doseLines(namedEx).big);
  ok(/left/.test(plan.spokenDose(namedEx)) && /right/.test(plan.spokenDose(namedEx)),
     "and the coach says it too: " + plan.spokenDose(namedEx));
  ok(plan.prescriptionSegments(named).map(g => g.label).join(" -> ").includes("left side"),
     "and she does the stated side first");

  /* THE SWEEP THAT A SPOT-CHECK MISSED. Deriving the dose from the structure
     once dropped every approximation marker in both apps -- "at most 5 a
     side" silently became "do 5" on a landing drill. Assert it over the whole
     plan, not over a chosen row. */
  const MARK = /[~\u2264]|\d\s*\+/;
  let swept = 0;
  for (const day of Object.values(data.DAYS)) {
    const moves = Object.values(day.blocks || {}).flat().concat(day.prepMenu || [], day.recovery || []);
    for (const e of moves) {
      if (!e || !e.byReps) continue;
      /* Either place the marker can live: still in the authored string, or
         moved into the structure as `approx`. Both must reach the ring. */
      const written = e.repsDetail || e.dose || "";
      const structural = (plan.exPrescription(e) || {}).approx || "";
      const wantedMark = structural
        || (/\u2264/.test(written) ? "\u2264" : /~/.test(written) ? "~" : MARK.test(written) ? "+" : "");
      if (!wantedMark) continue;
      swept++;
      const big = plan.doseLines(e).big;
      ok(big.includes(wantedMark),
         e.name + ": the dose keeps its " + wantedMark + ", got \"" + big + "\"");
    }
  }
  ok(swept > 0, "the sweep found approximate doses to check (" + swept + ")");
}

console.log("✓ session safety passed (" + passed + " assertions)");
