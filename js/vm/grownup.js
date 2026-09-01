/* ============================================================
   GROWN-UP view-model — 5 tabs (Overview / Analytics / Library /
   Settings / Coaching). Every number is computed from real data
   (swim_sessions_v2, swim_events_v1, swim_quiz_v1, trackers);
   thin history gets honest empty/partial states, never mock data.
   ============================================================ */

import { DAYS, WEEK_ORDER, DAY_SHORT, STANDING_RULES, ENGAGEMENT_SYSTEMS, TOP7, PRIZE_POOL, BLOCK_LABEL, videoSearchUrl, fmtXp } from "../data.js";
import { settings, loadSessions, loadEvents, loadQuiz, loadGate, GATE_WEEKS_REQUIRED, loadLadderRungs, loadTracker, getCurrentTrackerWeek, activeEngagement, activePrizePool, profileList, activeProfileId, quizBankStatus, quizPaidToday, quizXpToday, QXP_DAILY_CAP, lastWalletTrim, loadJourney, levelFromXp, countsAsTrained as countsAsTrainedLocal, outcomeOf,
         sessionRounds as sessionRoundsDone, sessionRoundsPlanned,
         monthKeyOf, formVerdicts, latestFormVerdicts } from "../store.js";
import { edmontonWeekISODates, edmontonDayKey, edmontonISO, fmtHHMM, exercisePhotoUrl, DAY_MS } from "../util.js";
import { sessionEffort, effortSummary } from "../effort.js";

const LIGHT_COLORS = { green: "var(--mint)", yellow: "var(--sun)", red: "var(--stop)", recovery: "var(--grape)" };
const MOOD_EMOJI = { great: "😀", okay: "🙂", tired: "😴" };
const LIGHT_BEFORE = { green: "😀", yellow: "🙂", red: "😮‍💨", recovery: "😴" };
const MOOD_RANK = { "😀": 3, "🙂": 2, "😮‍💨": 1, "😴": 1 };

function scopeFilter(scope) {
  const now = Date.now();
  if (scope === "week") {
    const isoDates = Object.values(edmontonWeekISODates());
    return s => isoDates.includes(edmontonISO(s.isoDate));
  }
  if (scope === "month") return s => now - new Date(s.isoDate).getTime() < 30 * DAY_MS;
  return () => true;
}
function scopeDays(scope, sessions) {
  if (scope === "week") {
    const todayIdx = WEEK_ORDER.indexOf(edmontonDayKey());
    return todayIdx + 1;
  }
  if (scope === "month") return 30;
  if (!sessions.length) return 1;
  return Math.max(1, Math.round((Date.now() - new Date(sessions[0].isoDate).getTime()) / DAY_MS) + 1);
}

const alertRow = (tone) => "display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:12px;margin-top:8px;background:" + (tone === "stop" ? "color-mix(in srgb, var(--stop) 9%, #fff)" : "var(--sun-wash)") + ";";

export function buildGrownupVM(state) {
  const scope = state.gsScope || "week";
  const scopeLabel = { week: "This week", month: "Last 30 days", all: "All-time" }[scope];
  // Try-it rows exist only to carry a pain stop to this screen. They are not
  // training, so they stay out of every training number — but they must still
  // reach Safety & Flags below.
  const allRows = loadSessions();
  const all = allRows.filter(s => !s.practice);
  const sessions = all.filter(scopeFilter(scope));
  const safetyRows = allRows.filter(scopeFilter(scope));
  const events = loadEvents();
  const eventInScope = e => scopeFilter(scope)({ isoDate: e.iso });

  const dstr = iso => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Edmonton" });
  const mins = s => Math.round((s.durationSecs || 0) / 60);

  /* ---- tabs / scope chrome ---- */
  const gu = state.grownupTab || "overview";
  const tabStyle = (active) => "flex-shrink:0;padding:8px 14px;border:none;border-radius:var(--radius-pill);font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;"
    + (active ? "background:var(--aqua);color:white;" : "background:transparent;color:var(--ink-soft);");
  const scopeTabStyle = (v) => "flex:1;min-height:36px;border:none;border-radius:var(--radius-pill);cursor:pointer;font-weight:900;font-size:12px;letter-spacing:0.03em;padding:0 14px;font-family:inherit;"
    + (scope === v ? "background:var(--aqua);color:#fff;box-shadow:0 2px 6px rgba(6,182,212,0.35);" : "background:transparent;color:var(--ink-soft);");

  /* ---- safety & flags ---- */
  const stops = safetyRows.filter(s => s.pain);
  const stopEvents = stops.map(s => ({
    date: dstr(s.isoDate), move: s.dayTitle || s.dayKey,
    note: "Stopped for pain after " + mins(s) + " min — check in before the next session."
  }));
  const earlyEnds = sessions.filter(s => s.endedEarly && !s.pain);
  const yellowRed = sessions.filter(s => ["yellow", "red"].includes(s.lightResult));
  const flags = [
    ...stops.map(s => ({ icon: "🛑", rowStyle: alertRow("stop"), text: "Stopped for pain during “" + (s.dayTitle || "session") + "” (" + dstr(s.isoDate) + ")." })),
    ...(earlyEnds.length ? [{ icon: "⏱", rowStyle: alertRow("sun"), text: earlyEnds.length + " session" + (earlyEnds.length === 1 ? "" : "s") + " ended early — " + earlyEnds.map(s => dstr(s.isoDate)).join(", ") + "." }] : []),
    ...(yellowRed.length ? [{ icon: "💛", rowStyle: alertRow("sun"), text: yellowRed.length + " yellow/red-light day" + (yellowRed.length === 1 ? "" : "s") + " — she felt tired or sore; rounds were capped." }] : [])
  ];
  const guAlerts = flags.length ? flags : [{ icon: "✅", rowStyle: alertRow("sun"), text: "Nothing to flag " + scopeLabel.toLowerCase() + " — sessions ran clean." }];

  /* ---- headline stats ---- */
  // Headline stats answer for TRAINING. Recovery days, safety stops and
  // GO-and-quit rows used to land in the minute totals and the average as if
  // they were workouts, which is how "avg session" drifted below any session
  // she actually did.
  const trainingRows = sessions.filter(s => outcomeOf(s).countsAsTraining);
  const done = sessions.filter(s => outcomeOf(s).state === "complete");
  const days = scopeDays(scope, all);
  const scheduled = scope === "week" ? days : Math.round(days);   // plan trains daily (Sun = recovery)
  const totalMins = trainingRows.reduce((a, s) => a + mins(s), 0);
  // Adherence is "how many of the days she was meant to train did she train",
  // so it counts DAYS, not records. Counting records let two attempts at one
  // Tuesday read as two days of adherence — and pushed the figure over 100%
  // often enough that it had to be clamped.
  const trainedDaySet = new Set(sessions.filter(countsAsTrainedLocal).map(s => edmontonISO(s.isoDate)));
  const adherence = Math.min(100, Math.round((trainedDaySet.size / Math.max(1, scheduled)) * 100));
  const avgMins = trainingRows.length ? Math.round(totalMins / trainingRows.length) : 0;

  /* ---- readiness → completion ---- */
  const readinessOutcome = ["green", "yellow", "red", "recovery"].map(light => {
    const ss = sessions.filter(s => (s.lightResult || s.light) === light);
    const completed = ss.filter(s => outcomeOf(s).state === "complete").length;
    if (!ss.length) return null;
    return {
      light: light[0].toUpperCase() + light.slice(1), color: LIGHT_COLORS[light],
      sessions: ss.length, completed,
      note: completed === ss.length ? "Every " + light + "-light session finished — the call matched the day."
        : (ss.length - completed) + " of " + ss.length + " didn’t finish — worth a look at how " + light + " days are loaded.",
      dotStyle: "width:12px;height:12px;border-radius:50%;flex-shrink:0;background:" + LIGHT_COLORS[light] + ";",
      barStyle: "height:100%;border-radius:6px;background:" + LIGHT_COLORS[light] + ";width:" + Math.round((completed / ss.length) * 100) + "%;",
      ratio: completed + "/" + ss.length + " finished"
    };
  }).filter(Boolean);

  /* ---- consistency cells ---- */
  // A day is only coloured in if something was actually trained on it. A GO
  // followed immediately by a stop — or a run where every move was skipped —
  // used to paint the day as a partial training day.
  const byIso = {};
  all.forEach(s => {
    if (!countsAsTrainedLocal(s)) return;
    const k = edmontonISO(s.isoDate);
    const st = (outcomeOf(s).state === "complete" && !s.mini && s.sessionType !== "mini") ? "done" : "partial";
    if (byIso[k] !== "done") byIso[k] = st;
  });
  let consistency;
  if (scope === "week") {
    const isoDates = edmontonWeekISODates();
    const todayIdx = WEEK_ORDER.indexOf(edmontonDayKey());
    consistency = {
      subtitle: "This week, day by day.", showDows: false, cols: 7,
      cells: WEEK_ORDER.map((k, i) => {
        const st = byIso[isoDates[k]] || (i > todayIdx ? "future" : (DAYS[k].spa ? "rest" : (i === todayIdx ? "future" : "missed")));
        return { s: st, label: DAY_SHORT[k] };
      })
    };
  } else if (scope === "month") {
    const n = 28;
    const cells = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY_MS);
      const iso = edmontonISO(d);
      const dow = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Edmonton" }).toLowerCase();
      cells.push({ s: byIso[iso] || (DAYS[dow] && DAYS[dow].spa ? "rest" : "missed"), label: String(Number(iso.slice(8))) });
    }
    consistency = { subtitle: "Last 28 days (newest bottom-right).", showDows: true, cols: 7, cells };
  } else {
    // All-time used to be hardcoded to the same 28 days as Month, so the toggle
    // did nothing here. One cell per WEEK back to her first session instead,
    // shaded by how much of that week she trained.
    const firstT = all.length ? new Date(all[0].isoDate).getTime() : Date.now();
    const weeksBack = Math.min(52, Math.max(1, Math.ceil((Date.now() - firstT) / (7 * DAY_MS))));
    const cells = [];
    for (let w = weeksBack - 1; w >= 0; w--) {
      const end = Date.now() - w * 7 * DAY_MS;
      let trained = 0, possible = 0;
      for (let d = 6; d >= 0; d--) {
        const day = new Date(end - d * DAY_MS);
        if (day.getTime() < firstT - DAY_MS) continue;
        const iso = edmontonISO(day);
        const dow = day.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Edmonton" }).toLowerCase();
        if (DAYS[dow] && DAYS[dow].spa) continue;
        possible++;
        if (byIso[iso]) trained++;
      }
      const pct = possible ? trained / possible : 0;
      cells.push({ s: pct >= 0.8 ? "done" : pct >= 0.4 ? "partial" : possible ? "missed" : "rest",
                   label: String(trained) });
    }
    consistency = { subtitle: "One cell per week since her first session (" + weeksBack + " weeks) — the number is days trained.",
                    showDows: false, cols: Math.min(13, Math.max(6, Math.ceil(cells.length / 4))), cells };
  }
  const consistencyView = (() => {
    const legend = [
      { c: "var(--mint)", label: "Done" }, { c: "var(--sun)", label: "Partial" },
      { c: "var(--grape-wash)", label: "Rest day" }, { c: "color-mix(in srgb, var(--coral) 14%, #fff)", label: "Missed" }];
    return {
      subtitle: consistency.subtitle, showDows: consistency.showDows, legend,
      gridStyle: "display:grid;grid-template-columns:repeat(" + consistency.cols + ",1fr);gap:5px;",
      cells: consistency.cells.map(cell => ({
        d: cell.s === "rest" ? "🌙" : cell.label,
        cellStyle: "height:" + (consistency.showDows ? "30px" : "46px") + ";border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:" + (consistency.showDows ? "11px" : "13px") + ";font-weight:900;"
          + (cell.s === "done" ? "background:var(--mint);color:#fff;"
          : cell.s === "partial" ? "background:var(--sun);color:var(--sun-ink);"
          : cell.s === "rest" ? "background:var(--grape-wash);color:var(--grape-ink);font-size:12px;"
          : cell.s === "missed" ? "background:color-mix(in srgb, var(--coral) 14%, #fff);color:var(--coral);"
          : "background:var(--surface-2);color:var(--ink-faint);opacity:0.55;")
      }))
    };
  })();

  /* ---- load trend ---- */
  const minsBetween = (from, to) => all.filter(s => { const t = new Date(s.isoDate).getTime(); return t >= from && t < to; }).reduce((a, s) => a + mins(s), 0);
  let loadBars, loadTitle, loadSubtitle, prevTotal;
  const now = Date.now();
  if (scope === "week") {
    const isoDates = edmontonWeekISODates();
    loadBars = WEEK_ORDER.map(k => {
      const iso = isoDates[k];
      const t0 = new Date(iso + "T00:00:00").getTime();
      return { k: DAY_SHORT[k], mins: minsBetween(t0, t0 + DAY_MS), prev: minsBetween(t0 - 7 * DAY_MS, t0 - 6 * DAY_MS) };
    });
    loadTitle = "Load trend · daily"; loadSubtitle = "Minutes per day, this week vs last week (ghost bars).";
    prevTotal = loadBars.reduce((a, b) => a + (b.prev || 0), 0);
  } else {
    // All-time used to cap at 8 weeks, which made it look like Month. Span her
    // real history instead (capped so the chart stays readable).
    const firstT = all.length ? new Date(all[0].isoDate).getTime() : now;
    const weeks = scope === "month" ? 4
      : Math.min(26, Math.max(4, Math.ceil((now - firstT) / (7 * DAY_MS))));
    loadBars = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const to = now - i * 7 * DAY_MS;
      loadBars.push({ k: "W−" + i, mins: minsBetween(to - 7 * DAY_MS, to), prev: minsBetween(to - 14 * DAY_MS, to - 7 * DAY_MS) });
    }
    loadTitle = "Load trend · weekly"; loadSubtitle = "Minutes per week (ghost = the week before).";
    prevTotal = minsBetween(now - (weeks * 2) * 7 * DAY_MS, now - weeks * 7 * DAY_MS);
  }
  const loadHeadline = (() => {
    const total = loadBars.reduce((a, b) => a + b.mins, 0);
    const d = prevTotal != null ? total - prevTotal : null;
    return {
      total, unit: "min", hasDelta: d != null && prevTotal > 0,
      deltaLabel: d == null ? "" : ((d >= 0 ? "▲ +" : "▼ −") + Math.abs(d) + " vs previous period"),
      deltaStyle: "font-size:12px;font-weight:900;border-radius:var(--radius-pill);padding:4px 11px;white-space:nowrap;"
        + (d == null ? "background:var(--surface-2);color:var(--ink-faint);" : d >= 0 ? "background:var(--mint-wash);color:var(--mint-ink);" : "background:color-mix(in srgb, var(--coral) 12%, #fff);color:var(--coral);")
    };
  })();
  const loadMax = Math.max(...loadBars.map(x => Math.max(x.mins, x.prev || 0)), 1);
  const loadTrend = loadBars.map((w, i) => ({
    ...w, minsLabel: w.mins > 0 ? w.mins : "—",
    ghostStyle: "width:9px;height:" + Math.max(3, Math.round(((w.prev || 0) / loadMax) * 92)) + "px;border-radius:5px 5px 0 0;background:var(--aqua);opacity:0.22;" + ((w.prev || 0) === 0 ? "visibility:hidden;" : ""),
    barStyle: "width:9px;height:" + Math.max(3, Math.round((w.mins / loadMax) * 92)) + "px;border-radius:5px 5px 0 0;background:" + (i === loadBars.length - 1 ? "var(--sun)" : "var(--aqua)") + ";" + (w.mins === 0 ? "opacity:0.3;" : "")
  }));

  /* ---- ACWR (acute:chronic workload ratio) — kept from the old Coach Insights ---- */
  const acute = minsBetween(now - 7 * DAY_MS, now + DAY_MS);
  const chronicWeekly = minsBetween(now - 28 * DAY_MS, now + DAY_MS) / 4;
  // A ratio over a near-empty chronic window reads as a scary spike — require
  // ~2 weeks of history before showing a number.
  const oldestT = all.length ? new Date(all[0].isoDate).getTime() : now;
  const acwr = (chronicWeekly > 0 && now - oldestT >= 14 * DAY_MS) ? acute / chronicWeekly : null;
  const acwrView = acwr == null
    ? { value: "—", label: "Needs ~4 weeks of history", color: "var(--ink-faint)", note: "The acute:chronic workload ratio compares this week's minutes to the 4-week average. It fills in as history builds." }
    : {
      value: acwr.toFixed(2),
      label: acwr < 0.8 ? "Undertraining zone" : acwr <= 1.3 ? "Sweet spot (0.8–1.3)" : acwr <= 1.5 ? "Caution — ramping fast" : "High spike — back off",
      color: acwr >= 0.8 && acwr <= 1.3 ? "var(--mint-ink)" : acwr <= 1.5 ? "var(--sun-ink)" : "var(--stop)",
      note: "This week: " + Math.round(acute) + " min vs " + Math.round(chronicWeekly) + " min/week 4-week average. 0.8–1.3 is the safe growth band."
    };

  /* ---- pace (planned vs actual, last 5 sessions in scope) ---- */
  const paceRows = sessions.slice(-5).map(s => {
    const planned = Math.max(1, Math.round((s.plannedSecs || 0) / 60)) || mins(s);
    const actual = mins(s);
    const pct = Math.min(100, Math.round((actual / Math.max(1, planned)) * 100));
    return {
      label: dstr(s.isoDate).split(",")[0], planned, actual,
      valueLabel: actual + " / " + planned + " min",
      fillStyle: "width:" + pct + "%;height:100%;border-radius:8px;background:" + (actual > planned ? "var(--sun)" : "var(--aqua)") + ";"
    };
  });
  const paceNote = paceRows.length ? "Roughly on plan is the goal — big overruns mean the plan is too long; big underruns mean rushing." : "No sessions " + scopeLabel.toLowerCase() + " yet.";

  /* ---- pauses ---- */
  const pauseEvents = events.filter(e => e.type === "pause" && eventInScope(e));
  const exBlock = (() => {
    const map = {};
    Object.values(DAYS).forEach(day => Object.values(day.blocks || {}).flat().concat(day.prepMenu || []).forEach(ex => { map[ex.name] = ex.block; }));
    return map;
  })();
  const pauseByBlock = {};
  pauseEvents.forEach(e => {
    const b = BLOCK_LABEL[exBlock[e.ex]] || "Other";
    pauseByBlock[b] = (pauseByBlock[b] || 0) + 1;
  });
  const pauses = {
    total: sessions.reduce((a, s) => a + (s.pauseCount || 0), 0),
    where: Object.entries(pauseByBlock).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, count]) => ({
      label, count,
      barStyle: "height:8px;border-radius:8px;background:var(--coral);opacity:0.7;width:" + Math.min(100, count * 8) + "px;min-width:12px;"
    })),
    note: pauseEvents.length ? "Clusters in one block usually mean that block runs too hot — scale it, don't push through." : "Few or no pauses — pacing looks comfortable."
  };

  /* ---- skipped moves + skips by block ---- */
  const skipCounts = {};
  sessions.forEach(s => (s.perExercise || []).filter(p => p.skipped).forEach(p => {
    skipCounts[p.name] = skipCounts[p.name] || { count: 0, block: BLOCK_LABEL[p.block] || p.block || "" };
    skipCounts[p.name].count += 1;
  }));
  const skippedMoves = Object.entries(skipCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([name, v]) => ({
    name, block: v.block, count: v.count,
    barStyle: "height:8px;border-radius:8px;background:var(--grape);opacity:0.8;width:" + Math.min(120, v.count * 10) + "px;min-width:12px;"
  }));
  const skipsByBlock = {};
  Object.values(skipCounts).forEach(v => { skipsByBlock[v.block] = (skipsByBlock[v.block] || 0) + v.count; });
  const skips = Object.entries(skipsByBlock).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({
    label, count,
    barStyle: "height:8px;border-radius:8px;background:var(--grape);width:" + Math.min(100, count * 14) + "px;min-width:14px;"
  }));

  /* ---- form quality ---- */
  const clean = sessions.reduce((a, s) => a + (s.clean || 0), 0);
  const wobbly = sessions.reduce((a, s) => a + (s.wobbly || 0), 0);
  const formCleanPct = clean + wobbly ? Math.round((clean / (clean + wobbly)) * 100) : null;
  const formTrend = sessions.filter(s => (s.clean || 0) + (s.wobbly || 0) > 0).slice(-8).map((s, i, arr) => {
    const pct = Math.round((s.clean / (s.clean + s.wobbly)) * 100);
    return { k: dstr(s.isoDate).split(",")[0], pct, pctLabel: pct + "%",
      barStyle: "width:100%;height:" + Math.max(6, Math.round(((pct - 60) / 40) * 80)) + "px;border-radius:6px 6px 0 0;background:" + (i === arr.length - 1 ? "var(--mint)" : "color-mix(in srgb, var(--mint) 55%, #fff)") + ";" };
  });

  /* ---- rounds ---- */
  // Rounds actually finished against the rounds each day actually ASKED FOR.
  // "Planned" was three per session whatever the traffic light said, so every
  // yellow, red, mini and recovery day was scored against a plan it never had.
  const roundsDone = sessions.reduce((a, s) => a + sessionRoundsDone(s), 0);
  const roundsPlanned = sessions.reduce((a, s) => a + sessionRoundsPlanned(s), 0);
  const rounds = { done: roundsDone, planned: Math.max(roundsPlanned, roundsDone), practice: 0,
    note: "Planned = the rounds each day actually asked for — green 3, yellow 2, red 1, mini 1." };

  /* ---- mood before → after ---- */
  const moodRows = sessions.filter(s => s.mood).slice(-6).map(s => {
    const before = LIGHT_BEFORE[s.lightResult || "green"] || "🙂";
    const after = MOOD_EMOJI[s.mood] || "🙂";
    const up = MOOD_RANK[after] > MOOD_RANK[before], same = MOOD_RANK[after] === MOOD_RANK[before];
    return { day: dstr(s.isoDate).split(",")[0], before, after, up, same,
      arrowColor: up ? "var(--mint)" : same ? "var(--ink-faint)" : "var(--coral)", arrow: up ? "↗" : same ? "→" : "↘" };
  });
  const moodUpPct = moodRows.length ? Math.round((moodRows.filter(m => m.up || m.same).length / moodRows.length) * 100) : 0;

  /* ---- by weekday / by topic ---- */
  let byWeekday = null, byTopic = null;
  if (scope === "week") {
    const isoDates = edmontonWeekISODates();
    // The best attempt that day, not the first one found. A GO-and-quit at
    // breakfast used to hide the full session she did after school.
    const rank = x => (outcomeOf(x).state === "complete" ? 2 : 0) + (countsAsTrainedLocal(x) ? 1 : 0);
    byWeekday = WEEK_ORDER.map(k => {
      const sameDay = all.filter(x => edmontonISO(x.isoDate) === isoDates[k]);
      const s = sameDay.sort((a, b) => rank(b) - rank(a) || (b.durationSecs || 0) - (a.durationSecs || 0))[0];
      return {
        k: DAY_SHORT[k], topic: DAYS[k].theme || DAYS[k].title,
        mood: s && s.mood ? MOOD_EMOJI[s.mood] : "·",
        done: !!(s && outcomeOf(s).state === "complete"), mins: s ? mins(s) : 0,
        rowBg: s && outcomeOf(s).state === "complete" ? "var(--surface)" : "var(--surface-2)",
        statusChip: s && outcomeOf(s).state === "complete" ? "✓ " + mins(s) + "m" : (s ? "partial" : "—"),
        statusStyle: "font-size:11px;font-weight:900;border-radius:var(--radius-pill);padding:3px 9px;white-space:nowrap;" + (s && outcomeOf(s).state === "complete" ? "background:var(--mint-wash);color:var(--mint-ink);" : s ? "background:var(--sun-wash);color:var(--sun-ink);" : "background:var(--surface-2);color:var(--ink-faint);")
      };
    });
  } else {
    const topics = {};
    sessions.forEach(s => {
      const t = (DAYS[s.dayKey] && DAYS[s.dayKey].theme) || s.dayTitle || "Other";
      topics[t] = topics[t] || { done: 0, planned: 0, moods: [] };
      topics[t].planned += 1;
      if (outcomeOf(s).state === "complete") topics[t].done += 1;
      if (s.mood) topics[t].moods.push(MOOD_EMOJI[s.mood]);
    });
    byTopic = Object.entries(topics).map(([k, v]) => ({
      k, done: v.done, planned: v.planned,
      mood: v.moods[v.moods.length - 1] || "·",
      pct: Math.round((v.done / Math.max(1, v.planned)) * 100),
      ratio: v.done + "/" + v.planned,
      barStyle: "height:10px;border-radius:10px;background:" + ((v.done / Math.max(1, v.planned)) >= 0.75 ? "var(--mint)" : (v.done / Math.max(1, v.planned)) >= 0.5 ? "var(--sun)" : "var(--coral)") + ";width:" + Math.round((v.done / Math.max(1, v.planned)) * 100) + "%;"
    }));
  }

  /* ---- quiz trend ---- */
  const quiz = loadQuiz();
  // The quiz trend ignored the scope entirely — always the last 6 runs.
  const quizInScope = (quiz.results || []).filter(r => {
    if (scope === "all") return true;
    if (!r || !r.t) return true;
    return scopeFilter(scope)({ isoDate: new Date(r.t).toISOString() });
  });
  const quizTrend = quizInScope.slice(-6).map((r, i, arr) => {
    const pct = Math.round((r.score / Math.max(1, r.total)) * 100);
    return { k: "Q" + (i + 1), pctLabel: pct + "%",
      barStyle: "width:100%;height:" + Math.max(6, Math.round(pct * 0.8)) + "px;border-radius:6px 6px 0 0;background:" + (i === arr.length - 1 ? "var(--grape)" : "color-mix(in srgb, var(--grape) 45%, #fff)") + ";" };
  });
  // Quiz XP is capped and finite by design — show how much of it is spent so a
  // grown-up can see at a glance whether XP is coming from training or tapping.
  const qBank = quizBankStatus(quiz);
  const quizBudget = {
    mastered: qBank.mastered, total: qBank.total,
    xpSpent: fmtXp(qBank.xpTotal - qBank.xpLeft), xpTotal: fmtXp(qBank.xpTotal),
    paidToday: quizPaidToday(quiz),
    todayXp: quizXpToday(quiz), dailyCap: QXP_DAILY_CAP,
    barStyle: "height:10px;border-radius:10px;background:var(--grape);width:" + Math.round((qBank.mastered / Math.max(1, qBank.total)) * 100) + "%;",
    note: "Quiz XP is capped at " + fmtXp(qBank.xpTotal) + " for the whole program (" + qBank.total
      + " questions, paid once each), at " + QXP_DAILY_CAP + " XP a day (one new question), and at one paying deck per day. "
      + "Replays are free practice worth 0 XP. "
      + (qBank.left ? qBank.left + " questions still hold XP." : "All questions are mastered — the quiz pays nothing further.")
  };

  /* ---- indicator board -----------------------------------------------------
     One place where every number answers to the SAME window, each as a total
     and an average. Before this the toggle really only moved Safety & Flags,
     and the rest was scattered across cards at different time scales. */
  const effort = effortSummary(sessions);
  const trainedDays = trainedDaySet.size;
  const availableDays = Math.max(trainedDays, scopeDays(scope, all));
  const boardRounds = sessions.reduce((a, s) => a + sessionRoundsDone(s), 0);
  const boardXp = sessions.reduce((a, s) => a + (s.xpEarned || 0), 0);
  const moodCount = { great: 0, okay: 0, tired: 0 };
  sessions.forEach(s => { if (moodCount[s.mood] != null) moodCount[s.mood] += 1; });
  const levelsUp = (() => {
    const j = loadJourney() || { xp: 0 };
    const inWindow = sessions.reduce((a, s) => a + (s.xpEarned || 0), 0);
    return Math.max(0, levelFromXp(j.xp || 0).level - levelFromXp(Math.max(0, (j.xp || 0) - inWindow)).level);
  })();
  const verifiedAll = latestFormVerdicts();
  const verified = Object.values(verifiedAll).reduce((a, v) => {
    a.asked += 1; if (v.pass) a.pass += 1; return a;
  }, { asked: 0, pass: 0 });
  const avg1 = (n, d, unit) => d > 0 ? (Math.round((n / d) * 10) / 10) + (unit ? " " + unit : "") : "—";

  const indicators = [
    { label: "Days trained",   total: trainedDays + " of " + availableDays, avg: availableDays ? Math.round((trainedDays / availableDays) * 100) + "%" : "—" },
    { label: "Total time",     total: totalMins >= 60 ? Math.floor(totalMins / 60) + "h " + (totalMins % 60) + "m" : totalMins + "m", avg: avg1(totalMins, sessions.length, "min / session") },
    { label: "Effort level",   total: effort.avg == null ? "—" : String(effort.avg), avg: effort.band },
    { label: "Rounds",         total: String(boardRounds), avg: avg1(boardRounds, done.length, "/ session") },
    { label: "Safety",         total: (stops.length ? stops.length + " stop" + (stops.length === 1 ? "" : "s") : "no stops") + (earlyEnds.length ? " · " + earlyEnds.length + " early" : ""), avg: stops.length ? "needs a conversation" : "clean" },
    { label: "Completed",      total: done.length + " of " + sessions.length, avg: sessions.length ? Math.round((done.length / sessions.length) * 100) + "%" : "—" },
    // Average from the SAME rows as the total — moodUpPct is the last-6 trend
    // used by the mood card, and quoting it here made the two columns disagree.
    { label: "How she felt",   total: "😀" + moodCount.great + "  🙂" + moodCount.okay + "  😴" + moodCount.tired,
      avg: (() => { const t = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];
                    return t && t[1] ? "mostly " + MOOD_EMOJI[t[0]] : "—"; })() },
    { label: "Levels upgraded", total: "+" + levelsUp, avg: levelsUp ? "one every " + avg1(sessions.length, levelsUp, "sessions") : "—" },
    { label: "Form · she says", total: effort.formAsked ? effort.formClean + " of " + effort.formAsked : "—", avg: effort.formPct == null ? "—" : effort.formPct + "% clean" },
    { label: "Form · you verified", total: verified.asked ? verified.pass + " of " + verified.asked : "not checked yet", avg: verified.asked ? Math.round((verified.pass / verified.asked) * 100) + "% ✓" : "—" },
    { label: "XP earned",      total: fmtXp(boardXp), avg: avg1(boardXp, sessions.length, "/ session") }
  ];
  // The gap between what she reports and what you verified is the number that
  // answers "is she really doing it right" — call it out when both exist.
  const formGap = (effort.formPct != null && verified.asked)
    ? Math.round((verified.pass / verified.asked) * 100) - effort.formPct : null;

  const isSheTrying = {
    avg: effort.avg, band: effort.band, sessions: effort.sessions,
    lines: effort.lines,
    formGap,
    gapNote: formGap == null ? "" : formGap <= -15
      ? "She reports her form cleaner than you've verified it — worth watching the moves below."
      : "Her self-checks and your verification agree.",
    trend: effort.trend.map((v, i, arr) => ({
      v, barStyle: "width:100%;height:" + Math.max(6, Math.round((v / 100) * 70)) + "px;border-radius:5px 5px 0 0;background:"
        + (i === arr.length - 1 ? "var(--aqua)" : "color-mix(in srgb, var(--aqua) 45%, #fff)") + ";"
    })),
    hasTrend: effort.trend.length > 1,
    note: "Effort is scored on what she controls — finishing the day's own target, showing up on a hard day, not skipping, not rushing, and the random form spot-checks. A pain stop never costs her anything."
  };

  const periodCovered = (() => {
    if (!all.length) return "No sessions recorded yet.";
    const firstT = scope === "all" ? new Date(all[0].isoDate).getTime() : Date.now() - scopeDays(scope, all) * DAY_MS;
    const f = new Date(Math.max(firstT, new Date(all[0].isoDate).getTime()));
    return scopeLabel + " · " + dstr(f.toISOString()).replace(/^\w+, /, "") + " – "
      + dstr(new Date().toISOString()).replace(/^\w+, /, "") + " · " + sessions.length + " session" + (sessions.length === 1 ? "" : "s");
  })();

  /* ---- coach narrative (one honest story per scope) ---- */
  const read = !sessions.length
    ? "No sessions recorded " + scopeLabel.toLowerCase() + " yet — the story starts with the first GO."
    : `${done.length} of ${sessions.length} sessions finished (${adherence}% adherence vs. scheduled). ` +
      (stops.length ? `⚠️ ${stops.length} pain stop${stops.length === 1 ? "" : "s"} — that conversation comes first. ` : "") +
      (formCleanPct != null ? `Form self-checks run ${formCleanPct}% clean. ` : "") +
      (skippedMoves.length ? `Most-skipped: ${skippedMoves[0].name}.` : "Nothing gets skipped consistently.");
  const suggest = stops.length
    ? "Book a check-in about the pain stop before the next session; keep the next day yellow-capped regardless of the readiness answer."
    : skippedMoves.length
    ? `“${skippedMoves[0].name}” keeps getting skipped — scale it down or move it earlier in the block while she's fresh.`
    : formCleanPct != null && formCleanPct < 75
    ? "Wobbly reps are creeping in — drop one round before dropping quality, and re-anchor the Parent Echo rule."
    : "Keep the current load — it's landing. Consider re-enabling progressive overload if the next two weeks stay green.";

  /* ---- monthly parent form check ------------------------------------------
     Her self-report can be confidently wrong: she says a move was clean, it
     failed the written criteria, and nothing catches it. The criteria already
     exist per move (parentWatch / redFlag); this puts them in your hand while
     you watch her, on a handful of moves a month rather than all forty. */
  const fcMonth = state.formCheckMonth || monthKeyOf();
  const fcVerdicts = formVerdicts(fcMonth);
  const fcLatest = latestFormVerdicts();

  // What she has claimed per move, from the random spot-checks.
  const selfByMove = {};
  all.forEach(s => (s.formChecks || []).forEach(f => {
    const m = selfByMove[f.name] || { asked: 0, clean: 0 };
    m.asked += 1; if (f.clean) m.clean += 1;
    selfByMove[f.name] = m;
  }));
  const usedByMove = {};
  all.forEach(s => (s.perExercise || []).forEach(p => {
    if (p && p.name) usedByMove[p.name] = (usedByMove[p.name] || 0) + 1;
  }));

  const moveMeta = {};
  Object.values(DAYS).forEach(day => {
    Object.values(day.blocks || {}).flat().concat(day.prepMenu || []).forEach(ex => {
      if (ex && ex.name && !moveMeta[ex.name]) moveMeta[ex.name] = ex;
    });
  });

  /* Priority: what failed last time, then the key moves, then whatever she uses
     most and claims near-perfect but has never been verified. */
  const fcCandidates = Object.keys(moveMeta).map(name => {
    const self = selfByMove[name] || { asked: 0, clean: 0 };
    const selfPct = self.asked ? Math.round((self.clean / self.asked) * 100) : null;
    const last = fcLatest[name] || null;
    const used = usedByMove[name] || 0;
    let score = used;
    let why = used + " session" + (used === 1 ? "" : "s");
    if (last && last.pass === false) { score += 1000; why = "failed your last check — re-check it"; }
    else if (TOP7.includes(name)) { score += 300; why = "one of the 7 key moves · " + why; }
    if (selfPct === 100 && !last) { score += 200; why = "she reports 100% clean, never verified · " + why; }
    if (last && last.pass === true) score -= 400;                 // recently confirmed, deprioritise
    return {
      name, score, why,
      watch: moveMeta[name].parentWatch || "",
      fix: moveMeta[name].redFlag || "",
      cue: moveMeta[name].cue || "",
      selfLabel: selfPct == null ? "no self-checks yet" : "she reports " + selfPct + "% clean (" + self.asked + ")",
      verdict: fcVerdicts[name] ? (fcVerdicts[name].pass ? "pass" : "fail") : null,
      lastVerdict: last ? { pass: last.pass, month: last.month } : null
    };
  }).filter(c => c.watch);                                        // only moves with written criteria

  const fcQueue = fcCandidates.slice().sort((a, b) => b.score - a.score).slice(0, 5);
  const fcDone = Object.keys(fcVerdicts).length;
  const fcPassed = Object.values(fcVerdicts).filter(v => v.pass).length;
  const fcSelfPct = (() => {
    const t = Object.values(selfByMove).reduce((a, m) => { a.asked += m.asked; a.clean += m.clean; return a; }, { asked: 0, clean: 0 });
    return t.asked ? Math.round((t.clean / t.asked) * 100) : null;
  })();
  const fcVerifiedPct = fcDone ? Math.round((fcPassed / fcDone) * 100) : null;

  const formCheck = {
    month: fcMonth,
    monthLabel: new Date(fcMonth + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Edmonton" }),
    prevMonth: (() => { const d = new Date(fcMonth + "-15T12:00:00Z"); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })(),
    nextMonth: (() => { const d = new Date(fcMonth + "-15T12:00:00Z"); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })(),
    atCurrentMonth: fcMonth >= monthKeyOf(),
    queue: fcQueue.map(c => ({
      ...c,
      cardStyle: "border:2px solid " + (c.verdict === "pass" ? "var(--mint)" : c.verdict === "fail" ? "var(--coral)" : "var(--hairline)")
        + ";background:" + (c.verdict === "pass" ? "var(--mint-wash)" : c.verdict === "fail" ? "color-mix(in srgb, var(--coral) 10%, #fff)" : "var(--surface)")
        + ";border-radius:var(--radius-lg);padding:15px 16px;display:flex;flex-direction:column;gap:9px;",
      passStyle: "flex:1;min-height:46px;border-radius:var(--radius-pill);border:2px solid var(--mint);cursor:pointer;font-weight:900;font-size:14px;font-family:inherit;"
        + (c.verdict === "pass" ? "background:var(--mint);color:#fff;" : "background:transparent;color:var(--mint-ink);"),
      failStyle: "flex:1;min-height:46px;border-radius:var(--radius-pill);border:2px solid var(--coral);cursor:pointer;font-weight:900;font-size:14px;font-family:inherit;"
        + (c.verdict === "fail" ? "background:var(--coral);color:#fff;" : "background:transparent;color:var(--coral);")
    })),
    doneCount: fcDone, total: fcQueue.length,
    selfPct: fcSelfPct, verifiedPct: fcVerifiedPct,
    gap: (fcSelfPct != null && fcVerifiedPct != null) ? fcVerifiedPct - fcSelfPct : null,
    headline: fcVerifiedPct == null
      ? "Nothing verified this month yet — watch her do these and mark what you actually see."
      : fcSelfPct != null && fcVerifiedPct < fcSelfPct - 15
        ? "She reports " + fcSelfPct + "% clean; you verified " + fcVerifiedPct + "%. That gap is the thing to work on."
        : "She reports " + fcSelfPct + "% clean and you verified " + fcVerifiedPct + "% — the self-checks are holding up.",
    flagged: Object.keys(fcLatest).filter(m => fcLatest[m].pass === false),
    note: "A failed move resets what her self-checks claimed for it and goes to the front of the next run's random spot-checks. This is a conversation tool — it is deliberately not wired to XP or prizes."
  };

  /* ---- library ---- */
  const seen = {};
  const libraryList = [];
  Object.values(DAYS).forEach(day => {
    Object.values(day.blocks || {}).flat().concat(day.prepMenu || [], day.recovery || []).forEach(ex => {
      if (!ex || !ex.name || seen[ex.name]) return; seen[ex.name] = true;
      libraryList.push({
        name: ex.name, dose: ex.dose || "", cue: ex.cue || "",
        parentWatch: ex.parentWatch || "", fix: ex.redFlag || "", swim: ex.swimTransfer || "",
        photoUrl: exercisePhotoUrl(ex.name, "Demo"),
        videoUrl: videoSearchUrl(ex)
      });
    });
  });

  /* ---- settings ---- */
  const onTrack = (on, onColor) => "width:38px;height:22px;border-radius:11px;display:inline-flex;align-items:center;padding:2px;flex-shrink:0;background:" + (on ? onColor : "var(--hairline)") + ";border:none;cursor:pointer;";
  const onKnob = (on) => "width:18px;height:18px;border-radius:50%;background:#fff;display:block;transition:transform 0.15s;transform:translateX(" + (on ? "16px" : "0") + ");";
  const voiceStyleOpts = ["fun", "classic", "encouraging", "quiet"].map(v => ({
    key: v, label: v[0].toUpperCase() + v.slice(1),
    style: "padding:9px 16px;border-radius:var(--radius-pill);border:2px solid " + ((settings.voiceStyle || "fun") === v ? "var(--aqua)" : "var(--hairline)") + ";background:" + ((settings.voiceStyle || "fun") === v ? "var(--aqua-wash)" : "var(--surface)") + ";color:" + ((settings.voiceStyle || "fun") === v ? "var(--aqua-ink)" : "var(--ink-soft)") + ";font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;"
  }));

  /* ---- coaching tab ---- */
  const gate = loadGate();
  const rungs = loadLadderRungs();
  const ladderRows = TOP7.map(name => ({ name, level: rungs[name] || 1 }));
  const tracker = loadTracker();
  const trackerWeek = getCurrentTrackerWeek();
  const prFields = WEEK_ORDER.filter(k => DAYS[k].prSentinel).map(k => ({
    key: "pr_" + k, label: DAY_SHORT[k] + " · " + DAYS[k].prSentinel
  }));
  const engagement = activeEngagement();

  return {
    scopeLabel,
    guTab: gu,
    tabs: [
      { key: "overview", label: "Overview", style: tabStyle(gu === "overview") },
      { key: "analytics", label: "Analytics", style: tabStyle(gu === "analytics") },
      { key: "coaching", label: "Coaching", style: tabStyle(gu === "coaching") },
      { key: "formcheck", label: "Form Check", style: tabStyle(gu === "formcheck") },
      { key: "library", label: "Move Library", style: tabStyle(gu === "library") },
      { key: "settings", label: "Settings", style: tabStyle(gu === "settings") }
    ],
    scopeTabs: [
      { key: "week", label: "Week", style: scopeTabStyle("week") },
      { key: "month", label: "Month", style: scopeTabStyle("month") },
      { key: "all", label: "All-time", style: scopeTabStyle("all") }
    ],
    guStatsGrid: "display:grid;grid-template-columns:" + (state.isWide ? "repeat(4,1fr)" : "1fr 1fr") + ";gap:12px;",
    grid2: "display:grid;grid-template-columns:" + (state.isWide ? "1fr 1fr" : "1fr") + ";gap:14px;",
    libGrid: "display:grid;grid-template-columns:" + (state.isWide ? "repeat(2,1fr)" : "1fr") + ";gap:14px;",

    analytics: {
      indicators, isSheTrying, periodCovered,
      flags: flags.length ? flags : null,
      hasStops: stopEvents.length > 0, noStops: stopEvents.length === 0, stopEvents,
      adherence, sessions: done.length, scheduled, avgMins, totalMins,
      readinessOutcome, hasReadiness: readinessOutcome.length > 0,
      consistency: consistencyView,
      loadTitle, loadSubtitle, loadHeadline, loadTrend,
      acwr: acwrView,
      pace: { rows: paceRows, note: paceNote },
      pauses,
      hasSkippedMoves: skippedMoves.length > 0, noSkippedMoves: skippedMoves.length === 0, skippedMoves, skips,
      formCleanPct, form: { clean, wobbly }, hasForm: clean + wobbly > 0, formTrend,
      formSubtitle: "Share of self-checked reps marked clean, per session.",
      rounds, roundsDonePct: Math.round((rounds.done / Math.max(1, rounds.planned)) * 100),
      mood: moodRows, hasMood: moodRows.length > 0, moodUpPct,
      byWeekday, byTopic,
      quizTrend, hasQuiz: quizTrend.length > 0, quizBudget,
      quizSubtitle: "Quiz Deck score per run.",
      read, suggest
    },
    guAlerts,
    formCheck,
    standingRules: STANDING_RULES,
    libraryList,
    settingsName: settings.athleteName || "Jess",
    profiles: profileList().map(p => ({
      id: p.id, name: p.name, active: p.id === activeProfileId(),
      style: "min-height:40px;border-radius:var(--radius-pill);cursor:pointer;font-weight:900;font-size:14px;padding:0 16px;font-family:inherit;border:2px solid "
        + (p.id === activeProfileId() ? "var(--aqua);background:var(--aqua);color:#fff;" : "var(--hairline);background:var(--surface-2);color:var(--ink);")
    })),
    multiProfile: profileList().length > 1,
    backupNote: state.backupNote || "", backupNoteOk: !!state.backupNoteOk,
    settingsExRest: settings.exerciseRestSeconds, settingsRndRest: settings.roundRestSeconds, settingsSecRest: settings.sectionRestSeconds,
    stepperBtn: "width:44px;height:44px;border-radius:50%;background:var(--surface-2);border:2px solid var(--hairline);font-size:22px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;",
    voiceStyleOpts,
    coachVoiceOn: settings.coachVoiceOn !== false,
    coachTrack: onTrack(settings.coachVoiceOn !== false, "var(--mint)"), coachKnob: onKnob(settings.coachVoiceOn !== false),
    practiceMode: !!state.practiceMode,
    practiceTrack: onTrack(!!state.practiceMode, "var(--grape)"), practiceKnob: onKnob(!!state.practiceMode),
    practiceHint: state.practiceMode
      ? "On — this run won't be saved or counted, and try-it turns itself off when the run ends."
      : "Off — sessions count toward streaks & progress.",
    prizePool: activePrizePool(),
    isDefaultPool: !(Array.isArray(settings.prizePool) && settings.prizePool.length),
    // A wallet trim removes prizes she can see, so it is never silent.
    walletRepairNote: state.walletRepairNote || "",
    pendingRestore: state.pendingRestore
      ? { from: state.pendingRestore.from, to: state.pendingRestore.to }
      : null,
    walletTrimNote: (() => {
      const t = lastWalletTrim();
      if (!t || !t.count) return "";
      return "🎁 " + t.count + " extra prize" + (t.count === 1 ? "" : "s") + " removed on "
        + new Date(t.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Edmonton" })
        + " — the wallet held more than her levels had earned. Prizes she'd already used were kept.";
    })(),

    coaching: {
      gate, gateLabel: gate.unlocked ? "UNLOCKED — jumps allowed beyond Drop-and-Stick" : "LOCKED — all jumps stay at Drop-and-Stick",
      // Says what is actually counted, and counts what it says. The number used
      // to tick up whenever Drop-and-Stick merely wasn't skipped — no clean
      // self-check, no separate weeks, nothing the sentence promised.
      gateProgress: (gate.cleanWeeks || []).length + " of " + GATE_WEEKS_REQUIRED
        + " weeks with a clean Drop-and-Stick logged"
        + (gate.unlocked ? "" : " — a week counts when she does the move AND self-checks it clean, and a grown-up hasn't flagged it."),
      ladderRows, trackerWeek, tracker, prFields,
      engagement, engagementSystems: ENGAGEMENT_SYSTEMS
    }
  };
}

/* CSV export — weekly summary ported from the old Coach Insights. */
export function exportCsv() {
  const rows = [["date", "day", "title", "type", "light", "minutes", "completedFully", "endedEarly", "pain", "skips", "pauses", "clean", "wobbly", "mood", "intentWord", "xpEarned"]];
  loadSessions().forEach(s => {
    rows.push([
      edmontonISO(s.isoDate), s.dayKey || "", s.dayTitle || "", s.sessionType || "",
      s.lightResult || "", Math.round((s.durationSecs || 0) / 60),
      s.completedFully ? 1 : 0, s.endedEarly ? 1 : 0, s.pain ? 1 : 0,
      s.skippedCount || 0, s.pauseCount || 0, s.clean || 0, s.wobbly || 0,
      s.mood || "", s.intentWord || "", s.xpEarned || 0
    ]);
  });
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `swim-dryland-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
