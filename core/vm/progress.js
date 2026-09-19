/* ============================================================
   PROGRESS view-model — the design's Progress screen fed by real
   data: session history, journey XP/prizes, and
   the same journey math the Today map uses (one story everywhere).
   ============================================================ */

import { LADDER, RANK_LORE, RANK_TEASE, DAYS, DAY_SHORT, fmtXp } from "../data.js";
import { COPY, EMOJI, LORE_TRANSFER_FIELD } from "../sport.js";
import { levelFromXp, loadJourney, redeemPrize, prizeUndoOpen, pendingDrawCount } from "../store.js";
/* EVERY DAY-LEVEL FACT ON THIS SCREEN IS A VIEW OF THE DAY RECORD (dayRecords
   in js/outcome.js): the week table, the period board, the training log and
   the streak. This file used to file sessions under the date they FINISHED,
   round each sitting to minutes before summing, keep only the first workout
   on a date, and score rounds per sitting in one place and per day in another
   — which is how a ragged round read 3/3 in the table and "2 of 3" beneath it. */
import { dayRecords, scheduleStreak } from "../outcome.js";
import { estimateSessionSecs } from "../engine.js";
import { edmontonWeekISODates, edmontonISO, todayISODate, DAY_MS } from "../util.js";
import { buildJourney, isTrainingRecord } from "./today.js";

/* Every label logEntryView can produce has a chip here; "TRY-IT" fell through
   to the green one, so a try-it row was painted as a full green day. */
const LIGHT_CHIP = {
  GREEN: "var(--mint-wash);color:var(--mint-ink)",
  YELLOW: "var(--sun-wash);color:var(--sun-ink)",
  RED: "color-mix(in srgb, var(--stop) 12%, #fff);color:var(--stop)",
  RECOVERY: "color-mix(in srgb, var(--grape) 14%, #fff);color:var(--grape)",
  MINI: "var(--aqua-wash);color:var(--aqua-ink)",
  "ENDED EARLY": "color-mix(in srgb, var(--coral) 14%, #fff);color:var(--coral)",
  "NOTHING LOGGED": "var(--surface-2);color:var(--ink-faint)",
  "PAIN STOP": "color-mix(in srgb, var(--stop) 12%, #fff);color:var(--stop)",
  "TRY-IT": "var(--aqua-wash);color:var(--aqua-ink)"
};
const MOOD_EMOJI = { great: "😀", okay: "🙂", tired: "😴" };
const MOOD_LABEL = { great: "Great", okay: "Okay", tired: "Tired" };

/* ONE ROW PER DAY RECORD, not per sitting. A day trained in two goes is one
   entry saying "2 sittings"; the label is the record's verdict — the same one
   the week strip ticks — so the log can never call a day ENDED EARLY that the
   strip calls done. A pain stop is the day's label only when the day ENDED
   there; a day she came back from and finished carries a small "paused for
   pain" note instead, because that is what happened. */
const isMini = r => (r.fragments || []).some(s => s && (s.mini || s.sessionType === "mini"));
export function logEntryView(r) {
  const frags = (r.fragments || []).concat(r.careFragments || []);
  const last = frags[frags.length - 1] || {};
  const d = new Date(String(r.date) + "T12:00:00Z");
  const training = isTrainingRecord(r);
  const lightLabel = r.safetyStop ? "PAIN STOP"
    : (r.care || !frags.some(f => f.sessionType !== "recovery" && f.sessionType !== "spa")) ? "RECOVERY"
    : !training ? "NOTHING LOGGED"
    : isMini(r) ? "MINI"
    : !r.dayComplete ? "ENDED EARLY"
    : String(r.light || "green").toUpperCase();
  const clean = frags.reduce((a, f) => a + (Number(f.clean) || 0), 0);
  const wobbly = frags.reduce((a, f) => a + (Number(f.wobbly) || 0), 0);
  const skips = [...new Set((r.rows || []).filter(l => l && l.status === "skipped").map(l => l.name).filter(Boolean))];
  const wentWell = frags.map(f => f.wentWell).filter(Boolean).pop();
  const nextTime = frags.map(f => f.nextTime).filter(Boolean).pop();
  const mood = frags.map(f => f.mood).filter(Boolean).pop();
  const sittings = frags.length;
  const note = [
    (clean || wobbly) ? ("Form: " + clean + " clean · " + wobbly + " wobbly") : "",
    skips.length ? ("Skipped: " + skips.join(", ")) : "",
    wentWell ? ("Went well: " + wentWell) : "",
    nextTime ? ("Next time: " + nextTime) : ""
  ].filter(Boolean).join(" · ");
  const rawMins = Number(r.minutes) || 0;
  return {
    // An unanswered mood is not "Okay" — the app was inventing a reflection
    // she never gave, in the one place a parent looks to see how she felt.
    moodEmoji: MOOD_EMOJI[mood] || "·",
    moodLabel: MOOD_LABEL[mood] || "not answered",
    dayTitle: last.dayTitle || (DAYS[r.dayKey] || {}).title || r.dayKey || "Session",
    dateStr: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
    // A session abandoned in seconds read as "1 min" of training.
    duration: rawMins < 1 ? "under a min" : rawMins + " min",
    sittings, sittingsLabel: sittings > 1 ? sittings + " sittings" : "",
    // She stopped for pain and came back: said, not hidden and not the verdict.
    painNote: r.hadPainStop && !r.safetyStop ? "paused for pain" : "",
    lightLabel, note,
    lightChipStyle: "font-size:10px;font-weight:900;letter-spacing:0.04em;border-radius:var(--radius-pill);padding:4px 9px;white-space:nowrap;background:" + (LIGHT_CHIP[lightLabel] || LIGHT_CHIP.GREEN) + ";"
  };
}

/* ---- period windows -------------------------------------------------------
   The screen only ever showed "this week", so a month of work was invisible.
   Three windows, all in Edmonton dates so a late-evening session lands on the
   day she actually trained. */
export const PROGRESS_PERIODS = [
  { key: "4w",      label: "Last 4 weeks" },
  { key: "month",   label: "This month" },
  { key: "quarter", label: "This quarter" }
];

export function periodRange(key, now = new Date()) {
  const todayIso = edmontonISO(now);
  if (key === "month")   return { from: todayIso.slice(0, 8) + "01", to: todayIso };
  if (key === "quarter") {
    const m = Number(todayIso.slice(5, 7));
    const qStart = String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0");
    return { from: todayIso.slice(0, 5) + qStart + "-01", to: todayIso };
  }
  return { from: edmontonISO(new Date(now.getTime() - 27 * DAY_MS)), to: todayIso };   // trailing 28 days
}

function isoSpan(from, to) {
  const out = [];
  for (let d = new Date(from + "T12:00:00Z"); edmontonISO(d) <= to; d = new Date(d.getTime() + DAY_MS)) {
    out.push(edmontonISO(d));
    if (out.length > 400) break;
  }
  return out;
}

export function buildProgressVM(state) {
  const records = dayRecords();
  const todayIso = todayISODate();
  const journeyStore = loadJourney() || { xp: 0, prizesWon: [] };
  const j = buildJourney();
  const curRank = LADDER.find(r => r.name === j.rankName) || {};

  const level = {
    levelNum: j.level, rankName: j.rankName, rankIcon: curRank.icon || EMOJI.world,
    nextRank: j.nextRankName, atSummit: j.atSummit,
    xp: fmtXp(journeyStore.xp || 0), xpToNext: j.xpToNextRank, levelPct: j.levelPct
  };

  // Rank story — future ranks stay locked as mystery cards.
  const rankStory = LADDER.map(r => {
    const lore = RANK_LORE[r.name] || {};
    const isCurrent = r.name === j.rankName;
    const isDone = !isCurrent && r.level <= j.level;
    const isLocked = r.level > j.level;
    const base = "width:342px;flex-shrink:0;border-radius:var(--radius-xl);padding:18px;display:flex;flex-direction:column;box-sizing:border-box;scroll-snap-align:start;";
    return {
      locked: isLocked, unlocked: !isLocked,
      icon: isLocked ? "🔒" : r.icon, name: isLocked ? "? ? ?" : r.name,
      chapter: isLocked ? ("Unlocks at Level " + r.level) : (lore.chapter || ""),
      story: isLocked ? (RANK_TEASE[r.name] || COPY.storyLockedTease) : (lore.story || ""),
      transfer: isLocked ? "" : (lore[LORE_TRANSFER_FIELD] || ""), fact: isLocked ? "" : (lore.fact || ""),
      iconBubbleStyle: "width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;"
        + (isCurrent ? "background:var(--aqua);" : isDone ? "background:var(--mint-wash);" : "background:var(--surface-2);"),
      cardStyle: base + (isCurrent
        ? "background:var(--aqua-wash);border:3px solid var(--aqua);box-shadow:var(--shadow-lift);"
        : isDone ? "background:var(--surface);border:2px solid var(--mint);box-shadow:var(--shadow-soft);"
        : "background:var(--surface-2);border:2px dashed var(--hairline);"),
      badge: isCurrent ? "YOU ARE HERE" : isDone ? "✓ UNLOCKED · LVL " + r.level : "LVL " + r.level,
      badgeStyle: "font-size:10px;font-weight:900;letter-spacing:0.05em;border-radius:var(--radius-pill);padding:4px 10px;white-space:nowrap;"
        + (isCurrent ? "background:var(--aqua);color:#fff;" : isDone ? "background:var(--mint-wash);color:var(--mint-ink);" : "background:var(--surface-2);color:var(--ink-soft);")
    };
  });

  // Actual minutes per day this week — one story with the kid's week strip.
  const isoDates = edmontonWeekISODates();
  const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const shorts = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
  const todayIdx = order.indexOf(new Date().toLocaleString("en-US", { timeZone: "America/Edmonton", weekday: "long" }).toLowerCase());

  /* ============================================================
     THE WEEK, DAY BY DAY

     The card showed seven bars and a streak number and nothing else, so "🔥 2"
     could sit beside two full-height bars with no way to see why a third day
     had not counted, or how long any of them actually took against what they
     asked for.

     ONE array feeds both the bars and the columns underneath, and every cell
     is a field on the DAY RECORD for that DATE — the date the work started,
     so a Monday catch-up trained on Wednesday sits in Wednesday's column and
     says "for Mon" — never re-derived here. Rounds are the record's
     `mainRoundsDone` of `roundsPlanned`, minutes are summed in seconds and
     rounded once, "ended early" is the record's own verdict, and the flame is
     `countsForStreak` on the same record the streak chip is walked from.

     The bar's COLOUR says how well the day went rather than which day is
     today — height has always been how long she trained. A day that has not
     happened is not a zero; it says so. ============================================================ */
  /* The record a DATE answers for. Where a date holds two (a catch-up and a
     recovery pass, say), the one she trained wins. */
  const recordOn = iso => records.filter(r => r.date === iso)
    .sort((a, b) => (Number(isTrainingRecord(b)) - Number(isTrainingRecord(a)))
      || (Number(!!b.dayComplete) - Number(!!a.dayComplete)))[0] || null;
  const BAND_COLOR = { green: "var(--mint)", amber: "var(--sun)", yellow: "var(--coral)", red: "var(--stop)" };
  const weekDays = order.map((k, i) => {
    const iso = isoDates[k];
    const rec = recordOn(iso);
    const arrived = i <= todayIdx;
    const isSpa = !!(DAYS[k] && DAYS[k].spa);
    const training = isTrainingRecord(rec);
    // Care only: a recovery pass with no training on the date.
    const care = !!rec && !training && (rec.careFragments || []).length > 0;
    const shown = training || care;
    const st = training ? rec.plan : null;
    const mins = shown ? (Number(rec.minutes) || 0) : 0;
    const band = training && st && st.pace ? st.pace.band : null;
    const color = care ? "var(--grape)" : band ? BAND_COLOR[band] : "var(--hairline)";
    const forShort = training && rec.dayKey !== k ? (DAY_SHORT[rec.dayKey] || rec.dayKey) : "";
    return {
      key: k, short: shorts[k], iso, arrived, isSpa, care,
      isToday: i === todayIdx,
      hasWork: shown,
      // A catch-up trained on this date names the weekday it was FOR.
      forShort, forLabel: forShort ? "for " + forShort : "",
      mins,
      minsLabel: shown ? mins + "m" : "—",
      barColor: color,   // the bar itself is sized once every column's minutes are known, below
      // "—" rather than 0: a Thursday that has not happened has not failed.
      /* The DAY's ask in minutes: the estimate of the record's own plan under
         the light it was started under — the same estimate the day card
         prints — never the sitting's remainder. */
      plannedLabel: training && st ? Math.max(1, Math.round(estimateSessionSecs(st.circuits) / 60)) + "m"
        : isSpa && !arrived ? "spa" : "—",
      /* Both units, each under its own name: performances are every planned
         instance (a main move once per round), movements are distinct moves. */
      performancesLabel: care ? "care" : training ? rec.performances.performed + "/" + rec.performances.planned : "—",
      movementsLabel: care ? "care" : training ? rec.movements.performed + "/" + rec.movements.planned : "—",
      skippedLabel: care ? "—" : training ? String((rec.rows || []).filter(r => r && r.status === "skipped").length) : "—",
      roundsLabel: care ? "n/a" : training ? rec.mainRoundsDone + "/" + rec.roundsPlanned : "—",
      earlyLabel: care ? "—" : training ? (rec.dayComplete ? "No" : "Yes") : "—",
      paceLabel: care ? "Care" : band ? { green: "Full", amber: "Almost", yellow: "Short", red: "Very short" }[band] : "—",
      paceBand: care ? "care" : band || "",
      streakMark: rec && rec.countsForStreak ? "🔥" : rec && rec.streakFreeze ? "❄️" : shown ? "—" : ""
    };
  });
  const wkMax = Math.max(...weekDays.map(d => d.mins), 1);
  weekDays.forEach((d, i) => {
    d.barStyle = "width:100%;height:" + Math.max(4, Math.round((d.mins / wkMax) * 100)) + "%;background:" + d.barColor
      + ";border-radius:5px 5px 0 0;transition:height 0.4s;"
      + (i === todayIdx ? "box-shadow:0 0 0 2px var(--ink);" : "");
  });

  const analyticsWeek = weekDays;

  const weekIsoSet = new Set(Object.values(isoDates));
  const trainedRecords = records.filter(isTrainingRecord);
  const weekTrained = trainedRecords.filter(r => weekIsoSet.has(r.date));
  // The schedule-aware streak, walked over the same records the flames above
  // are drawn from (what store.currentStreakOf delegates to).
  const streak = scheduleStreak(records, todayIso);
  /* Per DAY — a day finished in two goes is one day of thirty minutes, not
     two of fifteen. */
  const avgMins = weekTrained.length
    ? Math.round(weekTrained.reduce((a, r) => a + (Number(r.minutes) || 0), 0) / weekTrained.length)
    : 0;

  // Milestones — real, honest chips (only what's actually been earned).
  const chip = (bg, ink) => "background:" + bg + ";color:" + ink + ";border-radius:var(--radius-pill);padding:8px 14px;font-weight:900;font-size:13px;";
  const milestones = [];
  if (streak > 1) milestones.push({ icon: "🔥", label: streak + "-day streak", style: chip("var(--coral-wash)", "var(--coral-ink)") });
  if (j.level > 1 || trainedRecords.length) milestones.push({ icon: EMOJI.world, label: "Reached " + j.rankName, style: chip("var(--sun-wash)", "var(--sun-ink)") });
  // Days, not records: a day she came back to finish is one session.
  const trainedWorkouts = trainedRecords.length;
  if (trainedWorkouts) milestones.push({ icon: EMOJI.sport, label: trainedWorkouts + " session" + (trainedWorkouts === 1 ? "" : "s"), style: chip("var(--aqua-wash)", "var(--aqua-ink)") });
  if ((journeyStore.xp || 0) > 0) milestones.push({ icon: "💯", label: fmtXp(journeyStore.xp) + " XP earned", style: chip("var(--mint-wash)", "var(--mint-ink)") });
  if (!milestones.length) milestones.push({ icon: "🌱", label: COPY.firstMilestone, style: chip("var(--aqua-wash)", "var(--aqua-ink)") });

  // Training log — newest first; Week scope = this week's entries (min 4 recent).
  // One row per DAY RECORD (a resumed day is one entry, "2 sittings"); try-it
  // rows never reach the records at all. Days with only a live, unsaved
  // record are not in the log yet — the log is what was saved.
  const allLog = records.filter(r => !r.unsaved).slice().reverse().map(logEntryView);
  const logScope = state.logScope || "week";
  const logItems = logScope === "week" ? allLog.slice(0, 4) : allLog;
  const logScopeTab = (v) => "min-height:32px;border:none;border-radius:var(--radius-pill);cursor:pointer;font-weight:900;font-size:12px;padding:0 14px;font-family:inherit;"
    + (logScope === v ? "background:var(--aqua);color:#fff;" : "background:transparent;color:var(--ink-soft);");
  const logScopeTabs = [
    { label: "Recent", key: "week", style: logScopeTab("week") },
    { label: "All", key: "month", style: logScopeTab("month") }
  ];

  // Prize wallet
  // Redeeming is one-way; for five minutes after the tap it can still be undone,
  // then the button retires to a plain "used" label that does nothing.
  const prizesWon = (journeyStore.prizesWon || []).map(pz => {
    const canUndo = prizeUndoOpen(pz);
    const spent = pz.redeemed && !canUndo;
    return {
      ...pz, canUndo, spent,
      cardStyle: "display:flex;align-items:center;gap:10px;background:" + (pz.redeemed ? "var(--surface-2)" : "var(--surface)") + ";border:2px" + (pz.redeemed ? " dashed var(--hairline)" : " solid var(--sun)") + ";border-radius:16px;padding:10px 12px;" + (pz.redeemed ? "opacity:0.65;" : ""),
      redeemLabel: canUndo ? "✓ Used · undo" : pz.redeemed ? "✓ Used" : "Redeem",
      redeemBtnStyle: "flex-shrink:0;min-height:32px;border-radius:var(--radius-pill);border:none;cursor:" + (spent ? "default" : "pointer") + ";font-weight:900;font-size:12px;padding:0 12px;font-family:inherit;"
        + (canUndo ? "background:var(--surface);color:var(--ink-soft);border:1.5px solid var(--hairline);"
          : pz.redeemed ? "background:transparent;color:var(--ink-faint);"
          : "background:var(--sun);color:var(--sun-ink);")
    };
  });

  /* ---- period stats: every category as a TOTAL and an AVERAGE ---- */
  const periodKey = state.progressScope || "4w";
  const range = periodRange(periodKey);
  const inRange = r => r.date >= range.from && r.date <= range.to;
  /* Everything on this board answers for TRAINING DAYS, off the day record —
     one per day, so a day trained in two goes is one session with one
     duration, one round count and one verdict. A try-it row, a safety stop
     and a GO-and-quit are not training, and counting them dragged every
     average on the board toward a session that never happened. */
  const pRecords = trainedRecords.filter(inRange);
  const pDone = pRecords.filter(r => r.dayComplete);
  const pCount = pRecords.length;
  const days = isoSpan(range.from, range.to);
  const weeks = Math.max(1, days.length / 7);

  const pMins = pRecords.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
  // The record's rounds: what she actually finished, against what each day
  // actually asked for — green 3, yellow 2, red 1 — counted once per day.
  const pRounds = pRecords.reduce((a, r) => a + (Number(r.mainRoundsDone) || 0), 0);
  const pPartial = pCount - pDone.length;
  const pPlannedRounds = pRecords.reduce((a, r) => a + (Number(r.roundsPlanned) || 0), 0);
  /* SETTLED, per DATE: `settledXp` is what the date settles at, stamped on
     every record of that date, so it is summed once per date. */
  const xpOn = new Map();
  records.filter(inRange).forEach(r => { if (!r.unsaved) xpOn.set(r.date, Number(r.settledXp) || 0); });
  const pXp = [...xpOn.values()].reduce((a, v) => a + v, 0);
  const xpNow = journeyStore.xp || 0;
  // Levels gained inside the window, from the training XP it actually banked.
  const pLevels = Math.max(0, levelFromXp(xpNow).level - levelFromXp(Math.max(0, xpNow - pXp)).level);
  const pFrags = pRecords.reduce((a, r) => a.concat(r.fragments || []), []);
  const pForm = pFrags.reduce((a, s) => {
    const fc = (s.formChecks || []);
    if (fc.length) { a.asked += fc.length; a.clean += fc.filter(f => f.clean).length; }
    else { a.asked += (s.clean || 0) + (s.wobbly || 0); a.clean += (s.clean || 0); }
    return a;
  }, { asked: 0, clean: 0 });
  /* One answer per day: she is asked how it felt once, at the end. Counting
     both fragments of a resumed day made a single "tired" into two. */
  const pMoodOf = r => ((r.fragments || []).map(f => f.mood).filter(Boolean).pop() || null);
  const pMoods = { great: 0, okay: 0, tired: 0 };
  pRecords.forEach(r => { const m = pMoodOf(r); if (pMoods[m] != null) pMoods[m] += 1; });
  const pMoodUnanswered = pRecords.filter(r => pMoods[pMoodOf(r)] == null).length;
  const topMood = Object.entries(pMoods).sort((a, b) => b[1] - a[1])[0];
  const pTough = pRecords.filter(r => ["yellow", "red"].includes(r.light));
  const pToughDone = pTough.filter(r => r.dayComplete).length;

  const per = (n, d, unit) => d > 0 ? (Math.round((n / d) * 10) / 10) + " " + unit : "—";
  const periodStats = {
    periodKey,
    tabs: PROGRESS_PERIODS.map(p => ({ ...p, style:
      "min-height:36px;border:none;border-radius:var(--radius-pill);cursor:pointer;font-weight:900;font-size:12px;padding:0 15px;font-family:inherit;"
      + (p.key === periodKey ? "background:var(--aqua);color:#fff;" : "background:transparent;color:var(--ink-soft);") })),
    rangeLabel: pCount
      ? new Date(range.from + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" })
        + " – " + new Date(range.to + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" })
      : "Nothing logged in this window yet",
    hasData: pCount > 0,
    rows: [
      { label: "Sessions finished", total: String(pDone.length), avg: per(pDone.length, weeks, "/ week") },
      { label: "Completion status", total: pDone.length + " of " + pCount,
        avg: pCount ? Math.round((pDone.length / pCount) * 100) + "%" : "—" },
      { label: "Time", total: pMins >= 60 ? Math.floor(pMins / 60) + "h " + (pMins % 60) + "m" : pMins + "m",
        avg: per(pMins, pCount, "min / session") },
      { label: "Main rounds", total: pRounds + " of " + pPlannedRounds + (pPartial ? "  (" + pPartial + " partial)" : ""),
        avg: per(pRounds, pCount, "/ session") },
      { label: "XP earned", total: fmtXp(pXp), avg: per(pXp, pCount, "/ session") },
      { label: "Levels upgraded", total: "+" + pLevels,
        avg: pLevels ? "one every " + per(pCount, pLevels, "sessions") : "—" },
      { label: "Clean form", total: pForm.asked ? pForm.clean + " of " + pForm.asked : "—",
        avg: pForm.asked ? Math.round((pForm.clean / pForm.asked) * 100) + "%" : "—" },
      { label: "How I felt", total: "😀" + pMoods.great + "  🙂" + pMoods.okay + "  😴" + pMoods.tired
        + (pMoodUnanswered ? "  · " + pMoodUnanswered + " not answered" : ""),
        avg: topMood && topMood[1] ? "mostly " + MOOD_EMOJI[topMood[0]] : "—" },
      { label: "Tough days finished", total: String(pToughDone),
        avg: pCount ? Math.round((pToughDone / pCount) * 100) + "% of sessions" : "—" }
    ],
    // One bar per day: a good run and a dead patch are both obvious at a glance.
    xpByDay: (() => {
      // Same settled authority as the row above, so a bar can never stand
      // taller than the day it draws was actually paid.
      const byIso = xpOn;
      const max = Math.max(...days.map(d => byIso.get(d) || 0), 1);
      return days.map(d => ({
        iso: d, xp: byIso.get(d) || 0,
        barStyle: "flex:1;min-width:2px;height:" + Math.max(2, Math.round(((byIso.get(d) || 0) / max) * 46)) + "px;border-radius:2px 2px 0 0;background:"
          + ((byIso.get(d) || 0) > 0 ? "var(--aqua)" : "var(--hairline)") + ";"
      }));
    })(),
    xpFirstLabel: new Date(range.from + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" }),
    xpLastLabel: new Date(range.to + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" })
  };

  return {
    periodStats,
    level, rankStory, analyticsWeek, weekDays, milestones,
    logItems, logScopeTabs, hasLog: allLog.length > 0,
    prizesWon, hasPrizes: prizesWon.length > 0,
    /* A draw she is owed gets a real button here. The prize overlay tells her
       to "pick it up from Progress later" when a draw has to wait for sync;
       this is where it is picked up. */
    pendingDraws: pendingDrawCount(),
    pendingDrawLabel: pendingDrawCount() > 1 ? "🎁 " + pendingDrawCount() + " prize draws waiting — pick one!" : "🎁 A prize draw is waiting — pick your envelope!",
    dayStreakVal: String(streak),
    /* The number and the word under it are the same fact. This tile printed a
       raw record count beside a workout-counted label, so a day trained in two
       goes rendered "2" directly above "1 session". */
    sessionsVal: String(weekTrained.length),
    sessionsLabel: weekTrained.length + " session" + (weekTrained.length === 1 ? "" : "s"),
    minAvgVal: String(avgMins)
  };
}

/* Ids are strings now (older wallets hold numbers); redeemPrize compares as
   strings, so pass the data-arg through untouched — Number() turned the new
   ids into NaN and quietly redeemed nothing. */
export function toggleRedeem(id) { redeemPrize(id); }
