/* ============================================================
   PROGRESS view-model — the design's Progress screen fed by real
   data: swim_sessions_v2 history, swim_journey_v1 XP/prizes, and
   the same journey math the Today map uses (one story everywhere).
   ============================================================ */

import { LADDER, RANK_LORE, RANK_TEASE, fmtXp } from "../data.js";
import { sessionXp, levelFromXp, sessionRounds, sessionRoundsPlanned } from "../store.js";
import { loadSessions, loadJourney, currentStreak, redeemPrize, countsAsTrained, prizeUndoOpen } from "../store.js";
import { edmontonWeekISODates, edmontonISO, DAY_MS } from "../util.js";
import { buildJourney } from "./today.js";

const LIGHT_CHIP = {
  GREEN: "var(--mint-wash);color:var(--mint-ink)",
  YELLOW: "var(--sun-wash);color:var(--sun-ink)",
  RED: "color-mix(in srgb, var(--stop) 12%, #fff);color:var(--stop)",
  RECOVERY: "color-mix(in srgb, var(--grape) 14%, #fff);color:var(--grape)",
  MINI: "var(--aqua-wash);color:var(--aqua-ink)",
  "ENDED EARLY": "color-mix(in srgb, var(--coral) 14%, #fff);color:var(--coral)",
  "NOTHING LOGGED": "var(--surface-2);color:var(--ink-faint)",
  "SAFETY STOP": "color-mix(in srgb, var(--stop) 12%, #fff);color:var(--stop)"
};
const MOOD_EMOJI = { great: "😀", okay: "🙂", tired: "😴" };
const MOOD_LABEL = { great: "Great", okay: "Okay", tired: "Tired" };

export function logEntryView(s) {
  const d = new Date(s.isoDate);
  // A session she opened and skipped through reached the end, so it used to be
  // labelled with its traffic light — a GREEN badge on a day where nothing was
  // done. Name it for what it was.
  const noWork = !countsAsTrained(s);
  const lightLabel = s.safetyStop ? "SAFETY STOP"
    : noWork ? "NOTHING LOGGED"
    : s.pain || s.endedEarly ? "ENDED EARLY"
    : (s.mini || s.sessionType === "mini") ? "MINI"
    : (s.lightResult || s.light || "green").toUpperCase();
  const skips = (s.perExercise || []).filter(p => p.skipped).map(p => p.name);
  const note = [
    (s.clean || s.wobbly) ? ("Form: " + (s.clean || 0) + " clean · " + (s.wobbly || 0) + " wobbly") : "",
    skips.length ? ("Skipped: " + skips.join(", ")) : "",
    s.wentWell ? ("Went well: " + s.wentWell) : "",
    s.nextTime ? ("Next time: " + s.nextTime) : ""
  ].filter(Boolean).join(" · ");
  const rawMins = (s.durationSecs || 0) / 60;
  return {
    // An unanswered mood is not "Okay" — the app was inventing a reflection
    // she never gave, in the one place a parent looks to see how she felt.
    moodEmoji: MOOD_EMOJI[s.mood] || "·",
    moodLabel: MOOD_LABEL[s.mood] || "not answered",
    dayTitle: s.dayTitle || s.dayKey || "Session",
    dateStr: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Edmonton" }),
    // A session abandoned in seconds read as "1 min" of training.
    duration: rawMins < 1 ? "under a min" : Math.round(rawMins) + " min",
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
  const sessions = loadSessions();
  const journeyStore = loadJourney() || { xp: 0, prizesWon: [] };
  const j = buildJourney();
  const curRank = LADDER.find(r => r.name === j.rankName) || {};

  const level = {
    levelNum: j.level, rankName: j.rankName, rankIcon: curRank.icon || "🌊",
    nextRank: j.nextRankName, atSummit: j.atSummit,
    xp: fmtXp(journeyStore.xp || 0), xpToNext: j.xpToNextRank, levelPct: j.levelPct
  };

  // Ocean Story — future ranks stay locked as mystery cards.
  const oceanStory = LADDER.map(r => {
    const lore = RANK_LORE[r.name] || {};
    const isCurrent = r.name === j.rankName;
    const isDone = !isCurrent && r.level <= j.level;
    const isLocked = r.level > j.level;
    const base = "width:342px;flex-shrink:0;border-radius:var(--radius-xl);padding:18px;display:flex;flex-direction:column;box-sizing:border-box;scroll-snap-align:start;";
    return {
      locked: isLocked, unlocked: !isLocked,
      icon: isLocked ? "🔒" : r.icon, name: isLocked ? "? ? ?" : r.name,
      chapter: isLocked ? ("Unlocks at Level " + r.level) : (lore.chapter || ""),
      story: isLocked ? (RANK_TEASE[r.name] || "A new sea friend is waiting further along your journey…") : (lore.story || ""),
      swim: isLocked ? "" : (lore.swim || ""), fact: isLocked ? "" : (lore.fact || ""),
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
  // Only training minutes. Try-it rows, safety stops and GO-and-quit records
  // all used to land in this chart as if they were sessions.
  const trained = sessions.filter(countsAsTrained);
  const minsByIso = {};
  trained.forEach(s => {
    const key = edmontonISO(s.isoDate);
    minsByIso[key] = (minsByIso[key] || 0) + Math.round((s.durationSecs || 0) / 60);
  });
  const wk = order.map(k => ({ short: shorts[k], mins: minsByIso[isoDates[k]] || 0 }));
  const wkMax = Math.max(...wk.map(d => d.mins), 1);
  const todayIdx = order.indexOf(new Date().toLocaleString("en-US", { timeZone: "America/Edmonton", weekday: "long" }).toLowerCase());
  const analyticsWeek = wk.map((d, i) => ({
    short: d.short,
    barStyle: "width:100%;height:" + Math.max(6, Math.round((d.mins / wkMax) * 100)) + "%;background:" + (i === todayIdx ? "var(--sun)" : "var(--aqua)") + ";border-radius:6px 6px 0 0;transition:height 0.4s;"
      + (d.mins === 0 ? "opacity:0.35;" : "")
  }));

  const weekSessions = trained.filter(s => Object.values(isoDates).includes(edmontonISO(s.isoDate)));
  const streak = currentStreak(trained);
  const avgMins = weekSessions.length ? Math.round(weekSessions.reduce((a, s) => a + (s.durationSecs || 0), 0) / weekSessions.length / 60) : 0;

  // Milestones — real, honest chips (only what's actually been earned).
  const chip = (bg, ink) => "background:" + bg + ";color:" + ink + ";border-radius:var(--radius-pill);padding:8px 14px;font-weight:900;font-size:13px;";
  const milestones = [];
  if (streak > 1) milestones.push({ icon: "🔥", label: streak + "-day streak", style: chip("var(--coral-wash)", "var(--coral-ink)") });
  if (j.level > 1 || trained.length) milestones.push({ icon: "🌊", label: "Reached " + j.rankName, style: chip("var(--sun-wash)", "var(--sun-ink)") });
  if (trained.length) milestones.push({ icon: "🏊", label: trained.length + " session" + (trained.length === 1 ? "" : "s"), style: chip("var(--aqua-wash)", "var(--aqua-ink)") });
  if ((journeyStore.xp || 0) > 0) milestones.push({ icon: "💯", label: fmtXp(journeyStore.xp) + " XP earned", style: chip("var(--mint-wash)", "var(--mint-ink)") });
  if (!milestones.length) milestones.push({ icon: "🌱", label: "Your first splash is one GO away!", style: chip("var(--aqua-wash)", "var(--aqua-ink)") });

  // Training log — newest first; Week scope = this week's entries (min 4 recent).
  // Try-it rows (only legacy histories still hold any) were never training and
  // have no place in her log of it.
  const allLog = sessions.filter(s => !s.practice).slice().reverse().map(logEntryView);
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
  const inRange = s => { const k = edmontonISO(s.isoDate); return k >= range.from && k <= range.to; };
  // Everything on this board answers for TRAINING. A try-it row, a safety stop
  // and a GO-and-quit are not training, and counting them dragged every
  // average on the board toward a session that never happened.
  const pSessions = sessions.filter(s => inRange(s) && countsAsTrained(s));
  const pDone = pSessions.filter(s => s.completedFully);
  const days = isoSpan(range.from, range.to);
  const weeks = Math.max(1, days.length / 7);

  const pMins = Math.round(pSessions.reduce((a, s) => a + (s.durationSecs || 0), 0) / 60);
  // roundsDone is what she actually finished now, so a partial contributes the
  // rounds it really did instead of being left out of the total entirely.
  const pRounds = pSessions.reduce((a, s) => a + sessionRounds(s), 0);
  const pPartial = pSessions.length - pDone.length;
  // What those days actually asked for — green 3, yellow 2, red 1, mini 1 —
  // rather than three apiece regardless of the light.
  const pPlannedRounds = pSessions.reduce((a, s) => a + sessionRoundsPlanned(s), 0);
  const pXp = pSessions.reduce((a, s) => a + sessionXp(s), 0);
  const xpNow = journeyStore.xp || 0;
  // Levels gained inside the window, from the training XP it actually banked.
  const pLevels = Math.max(0, levelFromXp(xpNow).level - levelFromXp(Math.max(0, xpNow - pXp)).level);
  const pForm = pSessions.reduce((a, s) => {
    const fc = (s.formChecks || []);
    if (fc.length) { a.asked += fc.length; a.clean += fc.filter(f => f.clean).length; }
    else { a.asked += (s.clean || 0) + (s.wobbly || 0); a.clean += (s.clean || 0); }
    return a;
  }, { asked: 0, clean: 0 });
  const pMoods = { great: 0, okay: 0, tired: 0 };
  pSessions.forEach(s => { if (pMoods[s.mood] != null) pMoods[s.mood] += 1; });
  const pMoodUnanswered = pSessions.filter(s => pMoods[s.mood] == null).length;
  const topMood = Object.entries(pMoods).sort((a, b) => b[1] - a[1])[0];
  const pTough = pSessions.filter(s => ["yellow", "red"].includes(s.lightResult || s.light));
  const pToughDone = pTough.filter(s => s.completedFully).length;

  const per = (n, d, unit) => d > 0 ? (Math.round((n / d) * 10) / 10) + " " + unit : "—";
  const periodStats = {
    periodKey,
    tabs: PROGRESS_PERIODS.map(p => ({ ...p, style:
      "min-height:36px;border:none;border-radius:var(--radius-pill);cursor:pointer;font-weight:900;font-size:12px;padding:0 15px;font-family:inherit;"
      + (p.key === periodKey ? "background:var(--aqua);color:#fff;" : "background:transparent;color:var(--ink-soft);") })),
    rangeLabel: pSessions.length
      ? new Date(range.from + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" })
        + " – " + new Date(range.to + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" })
      : "Nothing logged in this window yet",
    hasData: pSessions.length > 0,
    rows: [
      { label: "Sessions finished", total: String(pDone.length), avg: per(pDone.length, weeks, "/ week") },
      { label: "Completion status", total: pDone.length + " of " + pSessions.length,
        avg: pSessions.length ? Math.round((pDone.length / pSessions.length) * 100) + "%" : "—" },
      { label: "Time", total: pMins >= 60 ? Math.floor(pMins / 60) + "h " + (pMins % 60) + "m" : pMins + "m",
        avg: per(pMins, pSessions.length, "min / session") },
      { label: "Main rounds", total: pRounds + " of " + pPlannedRounds + (pPartial ? "  (" + pPartial + " partial)" : ""),
        avg: per(pRounds, pSessions.length, "/ session") },
      { label: "XP earned", total: fmtXp(pXp), avg: per(pXp, pSessions.length, "/ session") },
      { label: "Levels upgraded", total: "+" + pLevels,
        avg: pLevels ? "one every " + per(pSessions.length, pLevels, "sessions") : "—" },
      { label: "Clean form", total: pForm.asked ? pForm.clean + " of " + pForm.asked : "—",
        avg: pForm.asked ? Math.round((pForm.clean / pForm.asked) * 100) + "%" : "—" },
      { label: "How I felt", total: "😀" + pMoods.great + "  🙂" + pMoods.okay + "  😴" + pMoods.tired
        + (pMoodUnanswered ? "  · " + pMoodUnanswered + " not answered" : ""),
        avg: topMood && topMood[1] ? "mostly " + MOOD_EMOJI[topMood[0]] : "—" },
      { label: "Tough days finished", total: String(pToughDone),
        avg: pSessions.length ? Math.round((pToughDone / pSessions.length) * 100) + "% of sessions" : "—" }
    ],
    // One bar per day: a good run and a dead patch are both obvious at a glance.
    xpByDay: (() => {
      const byIso = {};
      pSessions.forEach(s => { const k = edmontonISO(s.isoDate); byIso[k] = (byIso[k] || 0) + sessionXp(s); });
      const max = Math.max(...days.map(d => byIso[d] || 0), 1);
      return days.map(d => ({
        iso: d, xp: byIso[d] || 0,
        barStyle: "flex:1;min-width:2px;height:" + Math.max(2, Math.round(((byIso[d] || 0) / max) * 46)) + "px;border-radius:2px 2px 0 0;background:"
          + ((byIso[d] || 0) > 0 ? "var(--aqua)" : "var(--hairline)") + ";"
      }));
    })(),
    xpFirstLabel: new Date(range.from + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" }),
    xpLastLabel: new Date(range.to + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" })
  };

  return {
    periodStats,
    level, oceanStory, analyticsWeek, milestones,
    logItems, logScopeTabs, hasLog: allLog.length > 0,
    prizesWon, hasPrizes: prizesWon.length > 0,
    dayStreakVal: String(streak),
    sessionsVal: String(weekSessions.length),
    sessionsLabel: weekSessions.length + " session" + (weekSessions.length === 1 ? "" : "s"),
    minAvgVal: String(avgMins)
  };
}

/* Ids are strings now (older wallets hold numbers); redeemPrize compares as
   strings, so pass the data-arg through untouched — Number() turned the new
   ids into NaN and quietly redeemed nothing. */
export function toggleRedeem(id) { redeemPrize(id); }
