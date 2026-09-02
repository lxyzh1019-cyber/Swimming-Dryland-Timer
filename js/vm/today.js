/* ============================================================
   TODAY view-model — port of the design prototype's renderVals
   Today slice, fed by real data: DAYS content, swim_sessions_v2
   history, swim_journey_v1 XP, and live Edmonton dates.
   ============================================================ */

import { DAYS, WEEK_ORDER, DAY_SHORT, DAY_LONG, LADDER, levelCost, fmtXp, overloadWeek } from "../data.js";
import { settings, loadSessions, loadJourney, levelFromXp, currentStreak, loadDayProgress, countsAsTrained, sessionXp, outcomeOf } from "../store.js";
import { edmontonDayKey, edmontonWeekDates, edmontonWeekISODates, edmontonISO, plural, refTime } from "../util.js";
import { assembleCircuits, estimateSessionSecs } from "../engine.js";

/* Whole-plan stats for a day card.

   This counted five named blocks and summed their bare work time ONCE — so it
   left out the prepMenu moves the session actually inserts, ignored that the
   main block runs 2–3 rounds, and ignored every rest. It is built from the
   same circuits the runner assembles and the same estimate the session screen
   shows, so the card and the workout can no longer disagree about the day. */
export function planStats(dayKey) {
  const key = typeof dayKey === "string" ? dayKey : null;
  const day = key ? DAYS[key] : dayKey;
  if (!day) return { mins: 0, moves: 0 };
  const resolvedKey = key || Object.keys(DAYS).find(k => DAYS[k] === day);
  if (!resolvedKey) return { mins: 0, moves: 0 };
  const circuits = assembleCircuits(resolvedKey, day.spa ? "recovery" : (day.defaultLight || "green"));
  if (!circuits.length) return { mins: 0, moves: 0 };
  // Distinct movements she will meet, counted once however many rounds they run.
  const moves = new Set(circuits.flatMap(c => c.exercises.map(ex => ex.name))).size;
  return { mins: Math.max(1, Math.round(estimateSessionSecs(circuits) / 60)), moves };
}

/* Real per-day status for the current week, derived from the session log:
   done / partial (trained but ended early) / today / missed / upcoming / rest. */

/* This week's records (Mon–Sun, Edmonton). Shared so the week strip, the stat
   chips and the day card can't disagree about what happened. */
export function currentWeekSessions() {
  const weekIsoSet = new Set(Object.values(edmontonWeekISODates()));
  return loadSessions().filter(s => weekIsoSet.has(edmontonISO(s.isoDate)));
}

export function weekStatuses() {
  const todayKey = edmontonDayKey();
  // This week's sessions, bucketed by the day they were FOR (dayKey) — so a
  // Monday catch-up done on Wednesday checks off Monday, matching the CTA
  // copy ("starting now still counts for Monday"), and an evening session
  // never drifts onto tomorrow's card.
  const sessions = currentWeekSessions();
  // A day is checked off when the kid actually trained it — fully completed, or
  // ended early after real work (countsAsTrained). Ending early used to leave the
  // day looking untouched even though the complete screen said "progress saved"
  // and paid half XP; it now shows a softer ✓ so the app stops contradicting
  // itself. A GO-then-quit with nothing done still reads as "catch up".
  const trained = sessions.filter(countsAsTrained);
  // A MINI is a defined subset, never the whole day's plan — a completed mini
  // used to tick the day off entirely and clear what was left of it.
  // "Complete" is the one authority's answer, not the engine's loop flag.
  const isWholeDay = s => outcomeOf(s).state === "complete" && !s.mini && s.sessionType !== "mini";
  const doneKeys = new Set(trained.filter(isWholeDay).map(s => s.dayKey).filter(Boolean));
  const partialKeys = new Set(trained.filter(s => !isWholeDay(s)).map(s => s.dayKey).filter(Boolean));
  const todayIdx = WEEK_ORDER.indexOf(todayKey);
  const out = {};
  WEEK_ORDER.forEach((k, i) => {
    if (doneKeys.has(k)) out[k] = "done";
    else if (partialKeys.has(k)) out[k] = "partial";
    else if (k === todayKey) out[k] = "today";
    else if (i < todayIdx) out[k] = DAYS[k].spa ? "rest" : "missed";
    else out[k] = DAYS[k].spa ? "rest" : "future";
  });
  return out;
}

/* ---- Journey map (port of _buildJourney, real XP) ---- */
let _scrolledOnce = false;
export function journeyPathScrollIntoView(rootEl) {
  const el = rootEl.querySelector("[data-journey-rail]");
  if (el && !_scrolledOnce) {
    _scrolledOnce = true;
    requestAnimationFrame(() => {
      const cur = el.querySelector('[data-way="current"]');
      if (cur) el.scrollTop = Math.max(0, cur.offsetTop - el.clientHeight / 2 + cur.offsetHeight / 2);
    });
  }
}

export function buildJourney() {
  const j = loadJourney() || { xp: 0 };
  const { level, xpIntoLevel: into, nextCost: need } = levelFromXp(j.xp || 0);
  const xpToNextLevel = Math.max(0, need - into);
  const levelPct = Math.min(100, Math.round((into / need) * 100));
  const ladder = LADDER;
  let curIdx = 0;
  ladder.forEach((r, i) => { if (r.level <= level) curIdx = i; });
  const currentRank = ladder[curIdx];
  const nextRank = ladder[curIdx + 1];
  let xpToNextRank = xpToNextLevel;
  if (nextRank) { for (let L = level + 1; L < nextRank.level; L++) xpToNextRank += levelCost(L); }
  const doneRanks = ladder.slice(0, curIdx);

  const waypoints = [];
  if (nextRank) {
    waypoints.push({
      stateAttr: "next", rankLevel: nextRank.level, habitat: nextRank.habitat, name: nextRank.name,
      caption: fmtXp(xpToNextRank) + " XP →",
      showIcon: true, showCheck: false, showAvatar: false, icon: nextRank.icon, circleR: 22,
      circleStyle: "width:44px;height:44px;border-radius:50%;border:2px dashed rgba(255,255,255,0.65);display:flex;align-items:center;justify-content:center;font-size:18px;opacity:0.8;background:rgba(20,59,74,0.2);",
      nameStyle: "font-family:var(--font-display);font-weight:600;font-size:15px;color:rgba(255,255,255,0.85);text-shadow:0 1px 4px rgba(10,30,40,0.6);",
      captionStyle: "font-size:11px;font-weight:800;color:rgba(255,255,255,0.7);text-shadow:0 1px 4px rgba(10,30,40,0.6);"
    });
  }
  waypoints.push({
    stateAttr: "current", rankLevel: currentRank.level, habitat: currentRank.habitat, name: currentRank.name,
    caption: "YOU ARE HERE",
    showIcon: false, showCheck: false, showAvatar: true, icon: currentRank.icon, circleR: 30,
    circleStyle: "width:60px;height:60px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 5px rgba(255,255,255,0.25),0 4px 10px rgba(10,30,40,0.35);overflow:hidden;animation:mapPulse 2.6s ease-in-out infinite;background:var(--aqua-deep);",
    nameStyle: "font-family:var(--font-display);font-weight:600;font-size:18px;color:#fff;text-shadow:0 1px 4px rgba(10,30,40,0.6);",
    captionStyle: "font-size:11px;font-weight:900;letter-spacing:0.07em;color:var(--sun);text-shadow:0 1px 4px rgba(10,30,40,0.6);"
  });
  doneRanks.slice().reverse().forEach(r => {
    waypoints.push({
      stateAttr: "done", rankLevel: r.level, habitat: r.habitat, name: r.name, caption: "",
      showIcon: false, showCheck: true, showAvatar: false, icon: r.icon, circleR: 16,
      circleStyle: "width:32px;height:32px;border-radius:50%;background:var(--mint);color:#fff;border:2px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;box-shadow:0 2px 6px rgba(10,30,40,0.3);",
      nameStyle: "font-family:var(--font-display);font-weight:600;font-size:13px;color:rgba(255,255,255,0.9);text-shadow:0 1px 4px rgba(10,30,40,0.6);",
      captionStyle: ""
    });
  });

  // Fixed S-curve layout (top = deep/future, bottom = sandy shore/start); see the
  // design handoff for the geometry rationale. BEND is shared by path + pips.
  const ROW_H = 62, TOP_PAD = 16, BOTTOM_PAD = 12, LABEL_GAP = 10;
  const BEND = 0.85;
  const n = waypoints.length;
  waypoints.forEach((wp, i) => {
    wp.cx = i % 2 === 0 ? 80 : 20;
    wp.cy = TOP_PAD + i * ROW_H + ROW_H / 2;
    wp.circleStyle = wp.circleStyle + "position:absolute;left:" + wp.cx + "%;top:" + wp.cy + "px;transform:translate(-50%,-50%);z-index:2;flex-shrink:0;display:flex;align-items:center;justify-content:center;";
    const onRight = wp.cx > 50;
    wp.labelPosStyle = "position:absolute;top:" + wp.cy + "px;display:flex;flex-direction:column;white-space:nowrap;z-index:2;line-height:1.25;"
      + (onRight
        ? "left:calc(" + wp.cx + "% - " + (wp.circleR + LABEL_GAP) + "px);transform:translate(-100%,-50%);align-items:flex-end;text-align:right;"
        : "left:calc(" + wp.cx + "% + " + (wp.circleR + LABEL_GAP) + "px);transform:translateY(-50%);align-items:flex-start;text-align:left;");
  });
  const pathHeight = TOP_PAD + n * ROW_H + BOTTOM_PAD;

  const ctrlYs = (p0, p1) => {
    const dy = p1.cy - p0.cy;
    return { c1y: p0.cy + dy * BEND, c2y: p1.cy - dy * BEND };
  };
  const bezierAt = (p0, p1, t) => {
    const { c1y, c2y } = ctrlYs(p0, p1);
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.cx + 3 * mt * mt * t * p0.cx + 3 * mt * t * t * p1.cx + t * t * t * p1.cx,
      y: mt * mt * mt * p0.cy + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p1.cy
    };
  };

  const PIP_D = 13;
  const levelPips = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const upper = waypoints[i], lower = waypoints[i + 1];
    const span = upper.rankLevel - lower.rankLevel;
    for (let L = lower.rankLevel + 1; L < upper.rankLevel; L++) {
      const t = (L - lower.rankLevel) / span;
      const pt = bezierAt(lower, upper, t);
      levelPips.push({
        style: "position:absolute;left:" + pt.x + "%;top:" + pt.y + "px;transform:translate(-50%,-50%);width:" + PIP_D + "px;height:" + PIP_D + "px;border-radius:50%;z-index:1;background:"
          + (level >= L ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)") + ";"
      });
    }
  }

  const habitats = waypoints.map(wp => ({
    style: "position:absolute;left:" + (wp.cx > 50 ? 12 : 88) + "%;top:" + wp.cy + "px;transform:translate(-50%,-50%);width:58px;height:" + Math.round(ROW_H * 0.9) + "px;border-radius:50%;background:" + wp.habitat + ";opacity:0.13;filter:blur(14px);z-index:0;"
  }));

  const bottomToTop = waypoints.slice().reverse();
  const curBTIdx = bottomToTop.findIndex(w => w.stateAttr === "current");
  const solidPts = bottomToTop.slice(0, curBTIdx + 1);
  const dashedPts = bottomToTop.slice(curBTIdx);

  const curvePath = (pts) => {
    if (pts.length < 2) return "";
    let d = "M " + pts[0].cx + " " + pts[0].cy;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const { c1y, c2y } = ctrlYs(p0, p1);
      d += " C " + p0.cx + " " + c1y + ", " + p1.cx + " " + c2y + ", " + p1.cx + " " + p1.cy;
    }
    return d;
  };

  const chapter = ({
    "Seahorse": "CHAPTER 1 · THE SHALLOWS", "Sea Turtle": "CHAPTER 1 · THE SHALLOWS",
    "Penguin": "CHAPTER 2 · THE OPEN WATER", "Sea Otter": "CHAPTER 2 · THE OPEN WATER",
    "Stingray": "CHAPTER 3 · THE DEEP REEF", "Dolphin": "CHAPTER 3 · THE DEEP REEF",
    "Shark": "CHAPTER 4 · THE BLUE", "Orca": "CHAPTER 4 · THE BLUE",
    "Sailfish": "CHAPTER 5 · THE CHAMPIONSHIP CURRENT", "Marlin": "CHAPTER 5 · THE CHAMPIONSHIP CURRENT"
  })[currentRank.name] || "CHAPTER 1 · THE SHALLOWS";

  return {
    // At the summit there is no next rank. Naming the current rank as the
    // "next" one would tell a kid who already IS Ocean Legend that they're
    // still chasing it.
    level, rankName: currentRank.name, atSummit: !nextRank,
    nextRankName: nextRank ? nextRank.name : null,
    xpToNextRank: fmtXp(xpToNextRank), levelPct, waypoints, levelPips, habitats,
    pathHeight, solidPathD: curvePath(solidPts), dashedPathD: curvePath(dashedPts),
    chapter, xp: j.xp || 0
  };
}

const STATUS = {
  done:     { bg: "var(--mint-wash)",  border: "transparent", icon: "✓", iconBg: "var(--mint)", iconColor: "#fff", label: "var(--ink-soft)" },
  today:    { bg: "var(--sun-wash)",   border: "var(--sun)",  icon: "⭐", iconBg: "var(--sun)",  iconColor: "#fff", label: "var(--sun-ink)" },
  // Reframed from a red ✕ (shame) to a gentle amber "catch up" nudge — a wall of
  // red X's discourages a kid; a forward-looking prompt invites them back.
  missed:   { bg: "var(--sun-wash)", border: "transparent", icon: "↺", iconBg: "var(--sun)", iconColor: "#fff", label: "var(--sun-ink)" },
  // Trained, but ended early — a real ✓, visually softer than a full one.
  partial:  { bg: "var(--mint-wash)", border: "transparent", icon: "✓", iconBg: "color-mix(in srgb, var(--mint) 55%, #fff)", iconColor: "#fff", label: "var(--ink-soft)" },
  upcoming: { bg: "var(--aqua-wash)",  border: "transparent", icon: "📋", iconBg: "transparent", iconColor: "var(--aqua-ink)", label: "var(--aqua-ink)" }
};

export function buildTodayVM(state) {
  const todayKey = edmontonDayKey();
  const statuses = weekStatuses();
  const weekDates = edmontonWeekDates();
  const sessions = loadSessions();
  const selectedKey = state.selectedDay || todayKey;

  const weekDoneCount = WEEK_ORDER.filter(k => statuses[k] === "done" || statuses[k] === "partial").length;
  const statChips = [
    { icon: "🔥", value: String(currentStreak(sessions.filter(countsAsTrained))), label: "day streak", color: "var(--ink)" },
    { icon: "✅", value: weekDoneCount + "/7", label: "this week", color: "var(--mint-ink)" },
    { icon: "🏊", value: String(sessions.length), label: "sessions", color: "var(--sea)" }
  ];
  const journey = buildJourney();

  const _BLOCK_DEFS = [
    { key: "warmup", icon: "🎯", label: "Warm-Up" },
    { key: "coordination", icon: "⚡", label: "Coordination" },
    { key: "main", icon: "💪", label: "Main" },
    { key: "finisher", icon: "🏁", label: "Finisher" },
    { key: "swimskill", icon: "🏊", label: "Swim-Skill" }
  ];
  const selDayFull = DAYS[selectedKey] || {};
  const selDayBlocksRaw = selDayFull.blocks || {};
  const dayProg = loadDayProgress(selectedKey);   // same-day resume: blocks already done today
  const doneBlocks = (dayProg && dayProg.done) || [];
  const blocks = _BLOCK_DEFS.map(bd => {
    const exs = selDayBlocksRaw[bd.key] || [];
    if (!exs.length) return null;
    const open = !!state.expanded[bd.key];
    const blockMins = Math.max(1, Math.round(exs.reduce((a, e) => a + refTime(e), 0) / 60));
    return {
      key: bd.key, icon: bd.icon, name: bd.label, count: exs.length,
      countLabel: plural(exs.length, "move"), mins: blockMins,
      isBlockDone: doneBlocks.includes(bd.key),
      moves: exs.map(e => ({
        text: e.name + " · " + e.dose, cue: e.cue,
        swimTransfer: e.swimTransfer || ""
      })),
      rot: open ? 180 : 0,
      bodyStyle: open
        ? "padding:2px 15px 13px 56px;"
        : "max-height:0;overflow:hidden;padding:0 15px 0 56px;"
    };
  }).filter(Boolean).map((b, i) => ({
    ...b, rowBg: i % 2 === 0 ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.12)"
  }));

  const gearLabel = (selDayFull.equipment || []).slice(0, 3).join(", ");
  // The day's PR sentinel doubles as the focus cue — it's the one thing to watch today.
  const focusCue = selDayFull.prSentinel || selDayFull.theme || "";

  const week = WEEK_ORDER.map(key => {
    const rawStatus = statuses[key];
    const effStatus = (rawStatus === "future" || rawStatus === "rest") ? "upcoming" : rawStatus;
    const s = STATUS[effStatus];
    const iconWrap = s.iconBg === "transparent"
      ? "width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:18px;color:" + (s.iconColor || "var(--ink-soft)") + ";margin:5px 0;"
      : "width:30px;height:30px;border-radius:50%;background:" + s.iconBg + ";color:" + s.iconColor + ";display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;margin:5px 0;";
    const selected = key === selectedKey;
    return {
      key, short: DAY_SHORT[key], date: String(weekDates[key]), icon: s.icon, iconWrap,
      labelColor: s.label,
      cellStyle: "display:flex;flex-direction:column;align-items:center;padding:9px 4px;border-radius:16px;background:none;cursor:pointer;font-family:inherit;width:100%;background:" + s.bg + ";border:2px solid " + s.border + ";"
        + (selected ? "box-shadow:0 0 0 3px var(--ink);" : "")
    };
  });

  const legendCircle = (bg) => "display:inline-flex;width:20px;height:20px;border-radius:50%;align-items:center;justify-content:center;font-size:11px;font-weight:900;background:" + bg + ";color:#fff;";
  const legend = [
    { icon: "✓", iconStyle: legendCircle("var(--mint)"), label: "Done" },
    { icon: "⭐", iconStyle: legendCircle("var(--sun)") + "font-size:10px;", label: "Today" },
    { icon: "✓", iconStyle: legendCircle("color-mix(in srgb, var(--mint) 55%, #fff)"), label: "Partly done" },
    { icon: "📋", iconStyle: "font-size:14px;", label: "Upcoming" },
    { icon: "↺", iconStyle: legendCircle("var(--sun)"), label: "Catch up" }
  ];

  // ---- Right-pane day view ----
  const practiceMode = state.practiceMode;
  const fullDay = DAYS[selectedKey];
  // One computed number, not the authored timeLo/timeHi. Those were written
  // against a runner that counted 10 reps for every prescription, so the card
  // promised 18–22 minutes for work the session screen then estimated at 30.
  const stats = planStats(selectedKey);
  const isSpaDay = !!(fullDay && fullDay.spa);
  let status = statuses[selectedKey];
  if (status === "rest" || status === "future") status = isSpaDay ? "rest" : "future";
  // A partly-done day shares the "done" card, with copy that names what's left.
  const isPartial = status === "partial";
  if (isPartial) status = "done";
  const shortU = DAY_SHORT[selectedKey].toUpperCase();
  const tag = (fullDay && fullDay.tag) || "";
  let dayView;

  if (status === "today") {
    const base = {
      badgeLabel: "TODAY" + (tag ? " · " + tag : ""), title: fullDay.title,
      mins: stats.mins, movesLabel: plural(stats.moves, "move"),
      showChips: true, isActive: true, showCta: true, showSettings: true, ctaAction: "goSession"
    };
    dayView = practiceMode
      ? { ...base, ctaLabel: "Start Try-It Run", ctaIcon: "🧪" }
      : { ...base, ctaLabel: isSpaDay ? "Start Recovery" : "Let's go!", ctaIcon: isSpaDay ? "🧘" : "▶️" };
    if (isSpaDay) { dayView.isRest = true; dayView.isActive = true;
      dayView.recoveryItems = (fullDay.recovery || []).slice(0, 3).map(r => ({ text: r.name + (r.dose ? " · " + r.dose : "") })); }
  } else if (status === "done") {
    const remaining = blocks.filter(b => !b.isBlockDone).map(b => b.name);
    // An ended-early day is never "all done", even once its per-block record has
    // aged out (day progress only survives the calendar day it was written).
    const allDone = !isPartial && (remaining.length === 0 || !doneBlocks.length);
    const remainingLabel = remaining.join(", ");
    // Read what the session ACTUALLY earned instead of recomputing it here.
    // This line used to carry its own copy of the XP formula (moves × 10 + 40),
    // so once a session started paying a flat rate for its rounds, the day card
    // and the ladder disagreed about the same session — the card said +220
    // while the journey banked 360.
    const dayRecord = currentWeekSessions()
      .filter(s => s.dayKey === selectedKey && countsAsTrained(s)).pop();
    const earnedXp = dayRecord ? sessionXp(dayRecord) : 0;
    dayView = {
      badgeLabel: shortU + (isPartial ? " · PARTLY DONE ✓" : " · COMPLETED ✓"),
      title: fullDay.title, mins: stats.mins, movesLabel: plural(stats.moves, "move"),
      earnedXpLabel: isSpaDay || !earnedXp ? "" : "+" + earnedXp + " XP earned",
      showChips: true, isDone: true,
      doneHeadline: isSpaDay ? "Nice reset — recovery complete!"
        : isPartial ? "You showed up — that counts!"
        : (allDone ? "Nice work — you crushed this one!" : "You got through most of it!"),
      doneSub: isSpaDay ? "No XP today — rest is part of the plan."
        // Per-block records only survive the calendar day they were written, so
        // name what's left only when we actually still know.
        : isPartial ? ("This day counts toward your streak." + (doneBlocks.length && remainingLabel ? " Still open: " + remainingLabel + "." : ""))
        : (allDone ? "Every block is checked off. Want extra reps?" : ("You skipped " + remainingLabel + " — finish up for XP.")),
      showCta: true,
      ctaLabel: isSpaDay ? "Do it again" : (allDone ? "Look at the moves" : "Finish remaining moves"),
      ctaIcon: isSpaDay ? "🧘" : (allDone ? "🧪" : "▶️"),
      ctaVariant: (isSpaDay || allDone) ? "secondary" : "primary",
      ctaSubtext: isSpaDay ? "Doesn't change progress" : (allDone ? "Just look at the moves — nothing is recorded" : ""),
      ctaAction: (isSpaDay || allDone) ? "goTryIt" : "goSession",
      showSettings: false
    };
  } else if (status === "missed") {
    // "You still got the warm-up in" was printed on EVERY missed day, whether
    // or not she had done a single thing. A consolation that isn't true is
    // worse than none: it tells her the app isn't really watching.
    const missedIso = edmontonWeekISODates()[selectedKey];
    const missedRecord = loadSessions()
      .filter(s => s.dayKey === selectedKey && edmontonISO(s.isoDate) === missedIso).pop();
    const warmupDone = !!(missedRecord && (missedRecord.ledger || [])
      .some(l => l && l.block === "warmup" && l.status === "done"));
    dayView = { badgeLabel: shortU + " · CATCH UP", title: fullDay.title, mins: stats.mins, movesLabel: plural(stats.moves, "move"), showChips: true, isMissed: true, showCta: true, ctaLabel: "Catch Up Now", ctaIcon: "↺", showSettings: false, ctaAction: "goSession",
      missedSub: warmupDone
        ? "You still got the warm-up in — every streak has bumps."
        : "Every streak has bumps. Pick it back up whenever you're ready." };
  } else if (status === "rest") {
    const recov = (fullDay && fullDay.recovery) || [];
    dayView = {
      badgeLabel: shortU + " · RECOVERY DAY", title: fullDay.title,
      mins: stats.mins, movesLabel: plural(stats.moves, "move"),
      showChips: true, isRest: true, showCta: true,
      ctaLabel: "Start Recovery", ctaIcon: "🧘", ctaAction: "goSession",
      showSettings: false,
      recoveryItems: recov.slice(0, 3).map(r => ({ text: r.name + (r.dose ? " · " + r.dose : "") }))
    };
  } else {
    const hasPlan = stats.moves > 0;
    if (hasPlan) {
      dayView = {
        badgeLabel: shortU + " · UPCOMING", title: fullDay.title, mins: stats.mins, movesLabel: plural(stats.moves, "move"),
        showChips: true, isPreview: true, showCta: true, ctaVariant: "secondary",
        ctaLabel: "Start Early", ctaIcon: "▶️",
        ctaSubtext: "Can’t wait? Starting now still counts for " + DAY_LONG[selectedKey] + ".",
        ctaAction: "goSession", showSettings: false
      };
    } else {
      dayView = { badgeLabel: shortU + " · LOCKED", title: fullDay.title, showChips: false, isFuture: true, showCta: false, showSettings: false,
        futureHeadline: "Unlocks " + DAY_LONG[selectedKey] };
    }
  }

  dayView.showBackToToday = selectedKey !== todayKey;

  /* ---- try-it control ------------------------------------------------------
     This used to be a bare underlined text link, ~16px tall, in the bottom-right
     corner, and only on a "today" card. It read as fine print, the tap target
     was a third of the app's own 44px minimum, and most day states didn't show
     it at all. It is a real button now, in the start stack, on every card you
     can launch a run from. */
  const canLaunch = !!(dayView.isActive || dayView.isDone || dayView.isMissed || dayView.isPreview);
  dayView.showTryIt = canLaunch;
  // The badge belongs on every launchable card too: with try-it armed, "Finish
  // remaining moves" runs as a test, and nothing on screen used to say so.
  dayView.showTryBadge = canLaunch && practiceMode;
  // ...and so does the button label, so what you're about to start is never
  // ambiguous. With Try-It armed the button opens the move list, not a workout.
  if (canLaunch && practiceMode && dayView.ctaAction === "goSession") {
    dayView.ctaAction = "goTryIt";
    dayView.ctaLabel = "Look at the moves";
    dayView.ctaIcon = "🧪";
    dayView.ctaSubtext = "Try-it — instructions and videos only, no timer.";
  }
  if (dayView.isActive && !dayView.ctaSubtext) dayView.ctaSubtext = (dayView.movesLabel || "") + " · about " + (dayView.mins || "?") + " min · that’s the whole thing — no surprises.";
  dayView.showBlocksList = !!(dayView.isActive || dayView.isDone || dayView.isPreview || dayView.isMissed) && !isSpaDay;
  dayView.blocksHint = dayView.isDone ? "REVIEW WHAT YOU DID 👀" : dayView.isPreview ? "PEEK AT WHAT'S COMING 👀" : dayView.isMissed ? "READY WHEN YOU ARE — PEEK INSIDE 👀" : "TAP A BLOCK TO PEEK INSIDE 👀";
  dayView.showFocus = !!(dayView.isActive || dayView.isPreview) && !isSpaDay;
  dayView.ctaButtonStyle = dayView.ctaVariant === "secondary"
    ? "width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:rgba(255,255,255,0.16);color:#fff;border:2px solid rgba(255,255,255,0.55);border-radius:var(--radius-pill);padding:14px;font-family:var(--font-display);font-weight:600;font-size:18px;cursor:pointer;"
    : "width:100%;display:flex;align-items:center;justify-content:center;gap:12px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:18px;font-family:var(--font-display);font-weight:600;font-size:24px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);";

  const coachIconBtnStyle = "width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;font-size:15px;display:flex;align-items:center;justify-content:center;"
    + (settings.coachVoiceOn ? "background:#fff;color:var(--aqua-deep);" : "background:rgba(255,255,255,0.18);color:#fff;");
  const practiceLinkLabel = practiceMode ? "Try-it mode is ON" : "🧪 Try-it mode";
  const practiceHintLine = practiceMode
    ? "GO opens the move list — instructions and videos, no timer."
    : "Look at the moves without starting a workout.";
  const practiceBtnStyle = "width:100%;min-height:48px;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:var(--radius-pill);cursor:pointer;font-family:inherit;font-weight:900;font-size:14px;padding:0 18px;"
    + (practiceMode
      ? "background:#fff;color:var(--aqua-deep);border:2px solid #fff;"
      : "background:rgba(255,255,255,0.14);color:#fff;border:2px solid rgba(255,255,255,0.45);");

  // Echo-back: her own last "next time" promise, remembered on the day card.
  const lastSaid = sessions.slice().reverse().map(h => h.nextTime).find(Boolean);
  const echoLine = lastSaid ? ("Last time you said: “" + lastSaid + "” — let’s do it!") : "2–3 clean reps beat lots of sloppy ones.";

  // "Friday · July 10 · Week 6" (training week from the overload anchor)
  const now = new Date();
  const dateLine = now.toLocaleDateString("en-US", { timeZone: "America/Edmonton", weekday: "long" })
    + " · " + now.toLocaleDateString("en-US", { timeZone: "America/Edmonton", month: "long", day: "numeric" })
    + " · Week " + overloadWeek();

  const weather = state.weather || { icon: "☀️", temp: "–", caption: "Pool day!" };

  const railNav = (active) => ({
    iconWrap: active ? "width:52px;height:52px;border-radius:18px;background:var(--aqua-wash);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 2px var(--aqua-light);" : "width:52px;height:52px;display:flex;align-items:center;justify-content:center;opacity:0.55;",
    labelColor: active ? "var(--aqua-ink)" : "var(--ink-soft)",
    tabIconWrap: "width:46px;height:30px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;" + (active ? "background:var(--aqua-wash);box-shadow:inset 0 0 0 2px var(--aqua-light);" : ""),
    dotStyle: active ? "width:6px;height:6px;border-radius:50%;background:var(--aqua);" : "width:6px;height:6px;border-radius:50%;background:transparent;"
  });

  return {
    athleteName: settings.athleteName || "Jess",
    dateLine, statChips, journey, blocks, week, legend, dayView,
    gearLabel, focusCue, coachIconBtnStyle, practiceLinkLabel, practiceHintLine, practiceBtnStyle,
    practiceMode, echoLine, weather,
    selectedKey, todayKey,
    railToday: railNav(state.nav === "today"),
    railProgress: railNav(state.nav === "progress"),
    railGrownup: railNav(state.nav === "grownup")
  };
}
