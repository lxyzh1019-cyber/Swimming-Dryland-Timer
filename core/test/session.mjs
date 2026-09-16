/* SESSION SAFETY AND FAIRNESS — the moments where the app used to take
   something off her that she had not lost.

   Run against whichever app's content this core is under: nothing here names a
   move, so it holds for both. Voice ON with a SLOW synthesiser where the bug was
   a race with the coach's speech; voice OFF where it was not. */
import { engine, store, sport, data, util, tvm, gvm, svm, sscreen, tscreen, runSession, setSpeechDelay, speechInFlight, spoken, pinClock } from "./harness.mjs";
const base   = new URL("../", import.meta.url).href;
const layout = await import(base + "layout.js");
const plan   = await import(base + "plan.js");

/* RegExp.escape is not in Node 18, and a cue contains "." and "/" */
const escapeForRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    ok(/data-action="askSkip"/.test(html), name + ": and offers Skip this exercise in its place");
    /* The pain rule moved out of the far-left rail to under the buttons — in
       BOTH trees, which is the half that is easy to forget. */
    ok(/Sharp pain, pinching, or numbness/.test(html), name + ": the pain rule is on screen");
    /* Exactly one current row, and one scroller to centre it in. */
    ok(count(html, /data-ex-cur/g) === 1, name + ": exactly one row is marked current");
    ok(count(html, /data-ex-list/g) === 1, name + ": and exactly one list scroller to centre it in");
    /* The cue MOVED to the ring; it was not copied there. */
    ok(count(html, new RegExp(escapeForRe(snap.currentEx.cue), "g")) === 1,
       name + ": the coach tip appears exactly once — moved, not duplicated");
  }

  /* The picture is the clock's tenant, not its landlord: it goes when the
     column is too narrow to seat both, and the ⓘ still opens it. */
  ok(PHOTO.test(roomy), "a roomy screen shows the form photo");
  ok(!PHOTO.test(tight), "an upright iPad does not — its clock column is phone-sized");
  ok(!PHOTO.test(narrow), "and neither does a phone");
  ok(/data-action="openDetailCur"/.test(tight) && /data-action="openDetailCur"/.test(narrow),
     "but both still offer the ⓘ, which is where the photo went");

  /* The ring says which KIND of effort, and the rail can be collapsed. */
  ok(/TIMED SET|BY REPS/.test(roomy), "the ring names the kind of effort, not just 'not a rest'");
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

console.log("✓ session safety passed (" + passed + " assertions)");
