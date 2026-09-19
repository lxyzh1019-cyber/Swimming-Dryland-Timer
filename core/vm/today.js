/* ============================================================
   TODAY view-model — port of the design prototype's renderVals
   Today slice, fed by real data: DAYS content, session
   history, journey XP, and live Edmonton dates.
   ============================================================ */

import { DAYS, WEEK_ORDER, DAY_SHORT, DAY_LONG, LADDER, RANK_LORE, BLOCK_META, BLOCK_LABEL, levelCost, fmtXp, overloadWeek } from "../data.js";
import { SKILL_BLOCK, ATHLETE_DEFAULT, COPY, EMOJI } from "../sport.js";
import { settings, loadSessions, loadJourney, levelFromXp } from "../store.js";
/* STREAK_WORK_FRACTION is imported, not re-typed. This file used to carry a
   bare 0.75 beside the bar it was describing — the same class of mistake as
   the XP formula it once kept its own copy of, which is why the card and the
   ladder disagreed about one session.

   EVERY DAY-LEVEL FACT ON THIS SCREEN IS READ OFF THE DAY RECORD (dayRecords
   in js/outcome.js). This file used to rebuild the day from raw session rows
   four different ways — the strip by weekday, the chip by finish date, the
   card's XP by start date, the streak from workouts — and so the same Monday
   could read done, partly done, +450 and 🔥0 on one screen. Nothing here may
   re-derive completion, rounds, minutes, XP or the streak from a session row. */
import { dayRecords, scheduleStreak, STREAK_WORK_FRACTION, moveReviewLegend } from "../outcome.js";
import { edmontonDayKey, edmontonWeekDates, edmontonWeekISODates, todayISODate, plural } from "../util.js";
import { assembleCircuits, estimateSessionSecs, planResume, dayPlanState } from "../engine.js";

/* Whole-plan stats for a day card.

   This counted five named blocks and summed their bare work time ONCE — so it
   left out the prepMenu moves the session actually inserts, ignored that the
   main block runs 2–3 rounds, and ignored every rest. It is built from the
   same circuits the runner assembles and the same estimate the session screen
   shows, so the card and the workout can no longer disagree about the day. */
/* A bare symbol like ⚡ (U+26A1) has no variation selector, so a browser is free
   to draw it as monochrome TEXT — which, inside the white circle these icons sit
   in, is a blank circle. Asking for emoji presentation costs one character and
   removes the whole class. Only the legacy symbol block needs it; anything above
   U+1F000 is emoji-only already. */
export function emojiPresentation(ch) {
  if (!ch) return ch;
  const pts = [...ch];
  if (pts.length !== 1) return ch;
  const cp = pts[0].codePointAt(0);
  return cp < 0x1F000 ? ch + "\uFE0F" : ch;
}

export function planStats(dayKey, light = null) {
  const key = typeof dayKey === "string" ? dayKey : null;
  const day = key ? DAYS[key] : dayKey;
  if (!day) return { mins: 0, moves: 0 };
  const resolvedKey = key || Object.keys(DAYS).find(k => DAYS[k] === day);
  if (!resolvedKey) return { mins: 0, moves: 0 };
  /* THE LIGHT IT WAS TRAINED AT, when the caller knows it. This only ever asked
     for the weekday's default, so every card was priced as a green day: a Red
     session — a third of the size — was shown green's minutes and movement
     count, and then told it had skipped the difference. */
  const circuits = assembleCircuits(resolvedKey,
    day.spa ? "recovery" : (light || day.defaultLight || "green"));
  if (!circuits.length) return { mins: 0, moves: 0 };
  // Distinct movements she will meet, counted once however many rounds they run.
  const moves = new Set(circuits.flatMap(c => c.exercises.map(ex => ex.name))).size;
  return { mins: Math.max(1, Math.round(estimateSessionSecs(circuits) / 60)), moves };
}

/* Real per-day status for the current week, derived from the day records:
   done / partial (trained but not complete) / today / missed / upcoming / rest. */

/* This week's day records (Mon–Sun, Edmonton). The record's DATE — the day
   the work started — decides which week it belongs to; the chip it lands on
   is the weekday it was FOR (dayKey), so a Monday catch-up trained on
   Wednesday ticks Monday, and a Sunday-night session never drifts into next
   week's strip. Shared so the strip, the chips and the card cannot disagree. */
export function currentWeekRecords(records = dayRecords()) {
  const weekIsoSet = new Set(Object.values(edmontonWeekISODates()));
  return records.filter(r => r && weekIsoSet.has(r.date));
}
const isMini = r => (r.fragments || []).some(s => s && (s.mini || s.sessionType === "mini"));
/* A day she trained: a training record with real work on it. A GO-and-quit,
   a pain stop the day ended on, and a care-only day are not. */
export const isTrainingRecord = r => !!r && !r.care && !!(r.outcome && r.outcome.countsAsTraining);
/* Whole-day complete, as the record says. A MINI is a defined subset, never
   the whole day's plan, and still cannot tick a day off. */
export const recordIsDone = r => isTrainingRecord(r) && r.dayComplete === true && !isMini(r);
const recordIsRest = r => !!r && (r.careFragments || []).length > 0;

export function weekStatuses(records = dayRecords()) {
  const todayKey = edmontonDayKey();
  const week = currentWeekRecords(records);
  /* done ⇔ the record's own verdict. The strip used to demand every move at
     80% of its clock while the streak and the XP forgave a beat-early tap, so
     a day she walked all the way through read "partly done" under a flame it
     had earned. There is one verdict now and this is a view of it. */
  const doneKeys = new Set(week.filter(recordIsDone).map(r => r.dayKey).filter(Boolean));
  const partialKeys = new Set(week.filter(r => isTrainingRecord(r) && !recordIsDone(r)).map(r => r.dayKey).filter(Boolean));
  /* A weekday whose light came out Recovery, and whose recovery pass she
     finished, is a rest day she earned by reporting honestly — the same thing
     Sunday is. It is not training, so it never reads as trained, and it used
     to fall through to "missed" and a CATCH UP badge: the app told her she had
     skipped the day it had itself told her not to train. */
  const restKeys = new Set(week.filter(recordIsRest).map(r => r.dayKey).filter(Boolean));
  const todayIdx = WEEK_ORDER.indexOf(todayKey);
  const out = {};
  WEEK_ORDER.forEach((k, i) => {
    if (doneKeys.has(k)) out[k] = "done";
    else if (partialKeys.has(k)) out[k] = "partial";
    else if (restKeys.has(k) && k !== todayKey) out[k] = "rest";
    else if (k === todayKey) out[k] = "today";
    else if (i < todayIdx) out[k] = DAYS[k].spa ? "rest" : "missed";
    else out[k] = DAYS[k].spa ? "rest" : "future";
  });
  return out;
}

/* The one record a day card answers for: this week's record for that weekday.
   Where the week holds more than one (a catch-up and the day itself), the one
   she trained outranks care, and a finished one outranks the rest. */
export function recordForDay(dayKey, records = dayRecords()) {
  return currentWeekRecords(records).filter(r => r.dayKey === dayKey)
    .sort((a, b) => (Number(isTrainingRecord(b)) - Number(isTrainingRecord(a)))
      || (Number(!!b.dayComplete) - Number(!!a.dayComplete))
      || String(b.date).localeCompare(String(a.date)))[0] || null;
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

  /* One source for a rank's chapter: the lore card that teaches it. A map
     that listed the first ten ranks by name sent every rank past the tenth
     back to chapter 1 on the journey card. */
  const chapterOf = name => String(((RANK_LORE[name] || {}).chapter) || "").toUpperCase();
  const chapter = chapterOf(currentRank.name) || chapterOf(LADDER[0].name);

  return {
    // At the summit there is no next rank. Naming the current rank as the
    // "next" one would tell a kid who already holds the top rank that they're
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
  const todayIso = todayISODate();
  /* ONE READ OF THE DAY RECORDS, handed to everything below. The strip, the
     chips and the card are three views of the same list. */
  const records = dayRecords();
  const statuses = weekStatuses(records);
  const weekRecords = currentWeekRecords(records);
  const weekDates = edmontonWeekDates();
  const sessions = loadSessions();
  const selectedKey = state.selectedDay || todayKey;

  /* "This week N/7": every day that has ARRIVED and was done, partly done, or
     a finished recovery. A recovery weekday counts — it is a day she showed up
     for and did what the check asked — and the chip could never read 7/7
     while the one honest answer to a sore body was the one that did not count.
     (Today itself reads "today" until it is finished, which is why the record
     is asked for as well as the status.) The denominator stays 7 because the
     strip above it has seven cells and 7/7 is the number she is chasing. Only
     THIS WEEK's records, by the date they were trained: a Wednesday recovery
     pass six weeks ago used to add a Wednesday to every week after it. */
  const todayIdx = WEEK_ORDER.indexOf(todayKey);
  const recoveredKeys = new Set(weekRecords.filter(recordIsRest).map(r => r.dayKey));
  const weekDoneCount = WEEK_ORDER.filter((k, i) => i <= todayIdx && (
    statuses[k] === "done" || statuses[k] === "partial" ||
    statuses[k] === "rest" || recoveredKeys.has(k))).length;
  // Counted once so the number and the word under it cannot disagree — this
  // rendered "1 sessions" for as long as it has existed.
  const trainedDays = records.filter(isTrainingRecord).length;
  const statChips = [
    /* The streak is the schedule-aware walk over the SAME records the strip
       is drawn from (scheduleStreak in js/outcome.js — what store.currentStreakOf
       delegates to), so the chip and the ticks above it cannot disagree. */
    { icon: "🔥", value: String(scheduleStreak(records, todayIso)), label: "day streak", color: "var(--ink)" },
    { icon: "✅", value: weekDoneCount + "/7", label: "this week", color: "var(--mint-ink)" },
    /* Days she has TRAINED, counted once each — one day record per day. This
       was `sessions.length`: every stored row, try-it rehearsals and GO-and-
       quits included, and a resumed day twice. */
    { icon: EMOJI.sport, value: String(trainedDays), label: plural(trainedDays, "session").replace(/^\d+\s*/, ""), color: "var(--sea)" }
  ];
  const journey = buildJourney();

  const selDayFull = DAYS[selectedKey] || {};
  /* THE PANEL UNDER "REVIEW WHAT YOU DID" SHOWS WHAT SHE DID.

     It was built from DAYS[day].blocks — the authored plan — so under that
     heading it listed what she had been ASKED to do, with the same numbers
     whether she had done all of it or none of it. Three consequences, and all
     three were on screen at once in the report that started this:

       · It walked a fixed list of five block names that has no `prep` entry, so
         the two Prep moves vanished from the panel while the header above kept
         counting them. That is the whole of "17 moves" over a panel summing to
         15 — exactly the two Prep moves, nothing subtler.

       · It showed Main once, at its per-round size, so a block that runs three
         rounds read "4 moves · 3 min" next to a header minute total that had
         counted all three. 17 moves can never take 27 minutes.

       · It priced every day as the weekday's DEFAULT light, so a Red day — a
         third the size — was shown the green plan and then told it had skipped
         the difference.

     So it is the DAY RECORD's plan: the circuits under the light the day was
     actually started under, with what the merged ledger — banked proof
     included — can prove about each planned performance. A Monday catch-up
     trained on Wednesday is this week's Monday record, so Monday's card shows
     its actuals; the old date-of-the-weekday lookup showed it nothing. */
  const record = recordForDay(selectedKey, records);
  const showActuals = !!(record && record.plan);
  const planState = showActuals ? record.plan : dayPlanState(selectedKey, { fragments: [] });
  /* The pill beside each performance, in the finish screen's own glyphs. */
  const REVIEW_PILL = {
    done:    { icon: "✓", bg: "var(--mint)", ink: "#fff" },
    banked:  { icon: "✓", bg: "var(--mint)", ink: "#fff" },
    partial: { icon: "½", bg: "var(--sun)", ink: "var(--sun-ink)" },
    skipped: { icon: "⏭", bg: "var(--coral)", ink: "#fff" },
    missing: { icon: "—", bg: "rgba(255,255,255,0.28)", ink: "#fff" }
  };
  const reviewRows = (b) => !showActuals ? [] : (planState.moves || [])
    .filter(m => m.block === b.block && m.circuit === b.name)
    .map(m => {
      const pill = REVIEW_PILL[m.status] || REVIEW_PILL.missing;
      const doseLabel = m.got === null || m.planned === null ? ""
        : m.driver === "reps" ? m.got + " of " + m.planned + " reps"
        : m.got + "s of " + m.planned + "s";
      return {
        name: m.name, round: m.round, roundLabel: b.rounds > 1 ? "R" + m.round : "",
        status: m.status, icon: pill.icon, doseLabel, reason: m.reason || "",
        pillStyle: "width:22px;height:22px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;background:" + pill.bg + ";color:" + pill.ink + ";"
      };
    });
  const blocks = planState.blocks.map(b => {
    const circuit = planState.circuits.find(c => c.block === b.block && c.name === b.name);
    const exs = (circuit && circuit.exercises) || [];
    if (!exs.length) return null;
    const open = !!state.expanded[b.block];
    const meta = BLOCK_META[b.block] || {};
    return {
      key: b.block, icon: emojiPresentation(meta.emoji) || "•",
      // The skill block is named by the app that owns it, never by the core.
      name: b.block === SKILL_BLOCK ? COPY.skillBlockLabel : (BLOCK_LABEL[b.block] || b.name),
      count: b.planned,
      /* Rounds said out loud, because it is the only thing that makes the
         block's share of the day's minutes add up for someone reading it. */
      countLabel: b.rounds > 1
        ? plural(b.perRound, "move") + " × " + b.rounds + " rounds"
        : plural(b.perRound, "move"),
      /* PERFORMED, for the same reason the header counts performed: a block she
         went through a beat short of every clock is not a block she skipped,
         and labelling it "skipped · 0 of 5" under a headline saying she did all
         eighteen movements was the card arguing with itself. The tick is still
         reserved for a block actually FINISHED; how short the rest fell is the
         review's job, move by move. */
      doneLabel: showActuals ? b.performed + " of " + b.planned : "",
      mins: b.mins,
      isBlockDone: showActuals && b.planned > 0 && b.done >= b.planned,
      isBlockSkipped: showActuals && b.performed === 0,
      moves: exs.map(e => ({
        text: e.name + " · " + e.dose, cue: e.cue,
        transfer: e.transfer || ""
      })),
      /* THE PER-MOVE REVIEW: what counted and why, one line each, for a day
         with a record. See moveReviewReason in js/outcome.js. */
      review: reviewRows(b),
      rot: open ? 180 : 0,
      bodyStyle: open
        ? "padding:2px 15px 13px 56px;"
        : "max-height:0;overflow:hidden;padding:0 15px 0 56px;"
    };
  }).filter(Boolean).map((b, i) => ({
    ...b, rowBg: i % 2 === 0 ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.12)"
  }));
  const reviewLegend = showActuals ? moveReviewLegend() : "";

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
  const fullDay = DAYS[selectedKey];
  // One computed number, not the authored timeLo/timeHi. Those were written
  // against a runner that counted 10 reps for every prescription, so the card
  // promised 18–22 minutes for work the session screen then estimated at 30.
  const stats = planStats(selectedKey, showActuals ? planState.light : null);
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
      mins: stats.mins, movesLabel: plural(stats.moves, "distinct movement"),
      showChips: true, isActive: true, showCta: true, showSettings: true, ctaAction: "goSession"
    };
    dayView = { ...base, ctaLabel: isSpaDay ? "Start Recovery" : "Let's go!", ctaIcon: isSpaDay ? "🧘" : "▶️" };
    if (isSpaDay) { dayView.isRest = true; dayView.isActive = true;
      dayView.recoveryItems = (fullDay.recovery || []).slice(0, 3).map(r => ({ text: r.name + (r.dose ? " · " + r.dose : "") })); }
  } else if (status === "done") {
    /* WHAT THE RUNNER WOULD ACTUALLY RUN, asked of the runner's own function —
       the card must never name work the engine will not offer, nor stay silent
       about work it will. planResume starts from the log and uses the
       day-progress record only to subtract a sitting the log has not seen, so
       the two cannot drift.

       And only for a record dated TODAY. A partial never carries into a new
       day (the No-Debt rule, js/store.js), so yesterday's leftovers are not
       resumable however much the log remembers about them. A Monday catch-up
       trained today IS today's record, so its leftovers are today's to finish. */
    const isToday = !!record && record.date === todayIso;
    const resumeCircuits = isToday
      ? planResume(selectedKey, planState.light).circuits.filter(c => c.block !== "prep")
      : [];
    const remaining = [...new Set(resumeCircuits.map(c => c.name))];
    /* The MOVES she has left, not just the blocks they live in: "Still open:
       Warm-Up" reads like another whole session, while "Still to do: Wall
       Slides, Dead Bug" reads like the ten minutes it actually is. Taken from
       the circuits the resume would run, capped so the line stays a line. */
    const owedMoves = [...new Set(resumeCircuits.flatMap(c => c.exercises.map(e => e.name)))];
    const skippedLabel = owedMoves.length && owedMoves.length <= 3 ? owedMoves.join(", ") : "";
    /* The headline's question — is the plan finished — read off the record, so
       it is still answerable tomorrow when nothing is resumable any more. */
    const allDone = showActuals
      ? planState.owed.filter(o => o.block !== "prep").length === 0
      : !isPartial;
    /* WHETHER THERE IS ANYTHING TO COME BACK TO decides the button, and it is a
       question about the DAY, not about the copy. `allDone` above still reads
       "is the plan finished" for the headline; this reads "would GO have
       anything to run", and the two part company on a day whose leftovers are
       no longer today's to finish — the No-Debt rule. */
    const resumable = resumeCircuits.length > 0;
    const remainingLabel = remaining.join(", ");
    /* THE MOVES SHE CUT SHORT, and the offer to have them back.

       A move she tapped Done on before its clock ran out is not asked for
       again — otherwise a rushed warm-up handed her the whole workout from move
       one under a button that said "Finish remaining moves" (see bankMove in
       js/engine.js). But "not asked for again" must never be the app deciding
       she is finished with a move she knows she rushed, so the card says how
       many there are and offers them back. Asked of the same function the
       engine will ask, WHENEVER today's record holds a cut-short move — it
       used to be asked only when something else was still owed, which hid the
       offer exactly when everything left was a move she cut short. */
    const redoCircuits = isToday
      ? planResume(selectedKey, planState.light, { redoPartials: true })
          .circuits.filter(c => c.block !== "prep")
      : [];
    const redoMoves = [...new Set(redoCircuits.flatMap(c => c.exercises.map(e => e.name)))]
      .filter(n => !owedMoves.includes(n));
    const partialSkipLabel = redoMoves.length
      ? plural(redoMoves.length, "move") + " you cut short "
        + (resumable
            ? (redoMoves.length === 1 ? "isn\u2019t" : "aren\u2019t") + " included"
            : "can be done again today")
      : "";
    /* Minutes she actually trained, beside the minutes the day asked for —
       the record's, summed in seconds and rounded once. */
    const actualMins = record ? record.minutes : 0;
    /* XP is the DAY's, SETTLED — the record's settledXp, the same number the
       journey is rebuilt from. Not the last sitting's stamp, and not the
       sittings added up: that read "+450 XP earned" for a 360 XP day. */
    const earnedXp = record ? (Number(record.settledXp) || 0) : 0;
    /* DID THIS DAY ACTUALLY EARN THE STREAK? The record's own answer, the same
       one the strip and the flame chip are drawn from. This card once said
       "counts toward your streak" for ANY partial day while the chip refused
       to move — the app contradicting itself to a ten-year-old about the one
       number she cares about. */
    const streakEarned = !!(record && record.countsForStreak);
    /* SAID IN MOVES, NOT IN PERCENTAGE POINTS OF A PLAN. A ten-year-old has no
       unit for "21% more of the plan"; she has a unit for a move. The outcome
       reports what the ratio was measured against, so this can convert. */
    const dayAsk = record && record.outcome ? Number(record.outcome.expectedWork) : 0;
    const workRatio = record && record.outcome ? record.outcome.workRatio : null;
    const movesShort = Number.isFinite(workRatio) && dayAsk > 0
      ? Math.max(1, Math.ceil((STREAK_WORK_FRACTION - workRatio) * dayAsk - 1e-9))
      : 0;

    /* WHAT THE XP ACTUALLY BOUGHT. "+360 XP earned" reads as "everything is
       done" to anyone who has not read the XP rules, which is everyone, and it
       sat directly above a line saying nothing was. It is the price of the main
       ROUNDS she finished — say so, and the two sentences stop fighting. */
    const dayRounds = record ? (Number(record.mainRoundsDone) || 0) : 0;
    const roundsAsked = record ? (Number(record.roundsPlanned) || 0) : 0;
    const xpNote = (!earnedXp || isSpaDay) ? ""
      : dayRounds > 0
        ? "+" + earnedXp + " XP is for the " + plural(dayRounds, "main round") + " you finished."
        : "+" + earnedXp + " XP for showing up.";

    /* HOW WELL IT WAS HELD, as opposed to how much of it there was. The
       record's plan grades the merged day, banked rows left out. */
    const dayPace = planState.pace;
    const paceShort = (dayPace && dayPace.shortCount) || 0;
    const paceWorst = dayPace && dayPace.worst;
    const paceNote = !paceShort ? ""
      : plural(paceShort, "move") + " came in short today"
        + (paceWorst && paceWorst.name && Number.isFinite(paceWorst.ratio)
            ? " — " + paceWorst.name + " at " + Math.round(paceWorst.ratio * 100) + "% of its hold." : ".");
    const timeLabel = showActuals && actualMins
      ? actualMins + " of " + stats.mins + " min"
      : stats.mins + " min";
    const mv = showActuals ? record.movements : null;
    const pf = showActuals ? record.performances : null;
    dayView = {
      badgeLabel: shortU + (isPartial ? " · PARTLY DONE ✓" : " · COMPLETED ✓"),
      title: fullDay.title,
      mins: stats.mins, minsLabel: timeLabel,
      /* BOTH UNITS, EACH NAMED. "Movements" are distinct moves, counted once
         however many rounds they run; "performances" are every planned
         instance, a main move once per round. The card printed one of them
         beside a Progress row that printed the other under the same word. */
      movesLabel: (showActuals
        ? mv.performed + " of " + mv.planned + " movements · " + pf.performed + " of " + pf.planned + " performances"
        : plural(planState.movements, "distinct movement")),
      roundsLabel: (showActuals && !isSpaDay && roundsAsked > 0)
        ? dayRounds + " of " + plural(roundsAsked, "main round") : "",
      earnedXpLabel: isSpaDay || !earnedXp ? "" : "+" + earnedXp + " XP earned",
      xpNote,
      paceBand: (dayPace && dayPace.band) || "",
      paceNote,
      showChips: true, isDone: true,
      doneHeadline: isSpaDay ? "Nice reset — recovery complete!"
        : isPartial ? "You showed up — that counts!"
        : (allDone ? "Nice work — you crushed this one!" : "You got through most of it!"),
      doneSub: isSpaDay ? "No XP today — rest is part of the plan."
        : isPartial ? ((streakEarned
            ? "This day counts toward your streak."
            : "Your work is saved" + (movesShort
                ? " — " + plural(movesShort, "more finished move") + " would have earned the streak."
                : ", but this one didn't earn a streak day."))
          /* WHAT IS LEFT, BY NAME, and only while it is still today's to
             finish. A skipped move is never banked, so it comes back the
             moment she does — but only for the rest of the training day (the
             No-Debt rule, js/store.js). */
          + (!resumable ? ""
             : skippedLabel ? " Still to do: " + skippedLabel + " — finish today and it's a full day."
             : remainingLabel ? " Still open: " + remainingLabel + " — finish today and it's a full day."
             : " Every block for today's light is done."))
        : (allDone ? "Every block is checked off. Want extra reps?"
           : resumable ? ("You skipped " + remainingLabel + " — finish up for XP.")
           : "Every round you finished is banked."),
      showCta: true,
      ctaLabel: isSpaDay ? "Do it again" : (resumable ? "Finish remaining moves" : "Look at the moves"),
      ctaIcon: isSpaDay ? "🧘" : (resumable ? "▶️" : "🧪"),
      ctaVariant: (isSpaDay || !resumable) ? "secondary" : "primary",
      ctaSubtext: isSpaDay ? "Doesn't change progress" : (resumable ? "" : "The workout screen, nothing counting down, nothing recorded"),
      ctaAction: (isSpaDay || !resumable) ? "goExplore" : "goSession",
      // Offered whenever today's record holds a move she cut short — with or
      // without anything else left to add it to.
      partialSkipLabel: !isSpaDay ? partialSkipLabel : "",
      showSettings: false
    };
  } else if (status === "missed") {
    // "You still got the warm-up in" was printed on EVERY missed day, whether
    // or not she had done a single thing. A consolation that isn't true is
    // worse than none: it tells her the app isn't really watching.
    const warmupDone = !!(record && (record.rows || [])
      .some(l => l && l.block === "warmup" && l.status === "done"));
    dayView = { badgeLabel: shortU + " · CATCH UP", title: fullDay.title, mins: stats.mins, movesLabel: plural(stats.moves, "distinct movement"), showChips: true, isMissed: true, showCta: true, ctaLabel: "Catch Up Now", ctaIcon: "↺", showSettings: false, ctaAction: "goSession",
      missedSub: warmupDone
        ? "You still got the warm-up in — every streak has bumps."
        : "Every streak has bumps. Pick it back up whenever you're ready." };
  } else if (status === "rest") {
    const recov = (fullDay && fullDay.recovery) || [];
    dayView = {
      badgeLabel: shortU + " · RECOVERY DAY", title: fullDay.title,
      mins: stats.mins, movesLabel: plural(stats.moves, "distinct movement"),
      showChips: true, isRest: true, showCta: true,
      ctaLabel: "Start Recovery", ctaIcon: "🧘", ctaAction: "goSession",
      showSettings: false,
      recoveryItems: recov.slice(0, 3).map(r => ({ text: r.name + (r.dose ? " · " + r.dose : "") }))
    };
  } else {
    const hasPlan = stats.moves > 0;
    if (hasPlan) {
      dayView = {
        badgeLabel: shortU + " · UPCOMING", title: fullDay.title, mins: stats.mins, movesLabel: plural(stats.moves, "distinct movement"),
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
  // Why the last GO did not open a session, if it did not. Cleared by the next
  // GO / Explore / day change (see js/main.js).
  dayView.startNote = state.startNote || "";

  /* ---- try-it control ------------------------------------------------------
     This used to be a bare underlined text link, ~16px tall, in the bottom-right
     corner, and only on a "today" card. It read as fine print, the tap target
     was a third of the app's own 44px minimum, and most day states didn't show
     it at all. It is a real button now, in the start stack, on every card you
     can launch a run from. */
  const canLaunch = !!(dayView.isActive || dayView.isDone || dayView.isMissed || dayView.isPreview);
  /* Looking at the moves is its own button, straight to the list. It used to be
     a MODE: a grown-up armed a setting, which re-pointed the GO button at the
     move list until something disarmed it again. Arming a mode to read an
     instruction is a lot of machinery for "what does this one look like?", and
     while it was armed the real GO button was not where she left it. */
  /* ONE Explore button, never two. A finished day's CTA already IS Explore —
     "🧪 Look at the moves", and "🧘 Do it again" on a spa day — and this
     rendered a second "🧪 Explore the moves" directly underneath it. */
  dayView.showExplore = canLaunch && dayView.ctaAction !== "goExplore";
  if (dayView.isActive && !dayView.ctaSubtext) dayView.ctaSubtext = (dayView.movesLabel || "") + " · about " + (dayView.mins || "?") + " min · that’s the whole thing — no surprises.";
  dayView.showBlocksList = !!(dayView.isActive || dayView.isDone || dayView.isPreview || dayView.isMissed) && !isSpaDay;
  dayView.blocksHint = dayView.isDone ? "REVIEW WHAT YOU DID 👀" : dayView.isPreview ? "PEEK AT WHAT'S COMING 👀" : dayView.isMissed ? "READY WHEN YOU ARE — PEEK INSIDE 👀" : "TAP A BLOCK TO PEEK INSIDE 👀";
  dayView.showFocus = !!(dayView.isActive || dayView.isPreview) && !isSpaDay;
  dayView.ctaButtonStyle = dayView.ctaVariant === "secondary"
    ? "width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:rgba(255,255,255,0.16);color:#fff;border:2px solid rgba(255,255,255,0.55);border-radius:var(--radius-pill);padding:14px;font-family:var(--font-display);font-weight:600;font-size:18px;cursor:pointer;"
    : "width:100%;display:flex;align-items:center;justify-content:center;gap:12px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:18px;font-family:var(--font-display);font-weight:600;font-size:24px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);";

  const coachIconBtnStyle = "width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;font-size:15px;display:flex;align-items:center;justify-content:center;"
    + (settings.coachVoiceOn ? "background:#fff;color:var(--aqua-deep);" : "background:rgba(255,255,255,0.18);color:#fff;");
  const practiceLinkLabel = "🧪 Explore the moves";
  const practiceHintLine = "The workout screen at your own pace — nothing counts down, nothing is recorded.";
  const practiceBtnStyle = "width:100%;min-height:48px;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:var(--radius-pill);cursor:pointer;font-family:inherit;font-weight:900;font-size:14px;padding:0 18px;"
    + "background:rgba(255,255,255,0.14);color:#fff;border:2px solid rgba(255,255,255,0.45);";

  // Echo-back: her own last "next time" promise, remembered on the day card.
  const lastSaid = sessions.slice().reverse().map(h => h.nextTime).find(Boolean);
  const echoLine = lastSaid ? ("Last time you said: “" + lastSaid + "” — let’s do it!") : "2–3 clean reps beat lots of sloppy ones.";

  // "Friday · July 10 · Week 6" (training week from the overload anchor)
  const now = new Date();
  const dateLine = now.toLocaleDateString("en-US", { timeZone: "America/Edmonton", weekday: "long" })
    + " · " + now.toLocaleDateString("en-US", { timeZone: "America/Edmonton", month: "long", day: "numeric" })
    + " · Week " + overloadWeek();

  const weather = state.weather || { icon: "☀️", temp: "–", caption: COPY.weatherCaption };

  const railNav = (active) => ({
    iconWrap: active ? "width:52px;height:52px;border-radius:18px;background:var(--aqua-wash);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 2px var(--aqua-light);" : "width:52px;height:52px;display:flex;align-items:center;justify-content:center;opacity:0.55;",
    labelColor: active ? "var(--aqua-ink)" : "var(--ink-soft)",
    tabIconWrap: "width:46px;height:30px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;" + (active ? "background:var(--aqua-wash);box-shadow:inset 0 0 0 2px var(--aqua-light);" : ""),
    dotStyle: active ? "width:6px;height:6px;border-radius:50%;background:var(--aqua);" : "width:6px;height:6px;border-radius:50%;background:transparent;"
  });

  return {
    tightColumn: !!state.tightColumn,
    athleteName: settings.athleteName || ATHLETE_DEFAULT,
    dateLine, statChips, journey, blocks, reviewLegend, week, legend, dayView,
    gearLabel, focusCue, coachIconBtnStyle, practiceLinkLabel, practiceHintLine, practiceBtnStyle,
    echoLine, weather,
    selectedKey, todayKey,
    railToday: railNav(state.nav === "today"),
    railProgress: railNav(state.nav === "progress"),
    railGrownup: railNav(state.nav === "grownup")
  };
}
