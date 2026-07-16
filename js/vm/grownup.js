/* ============================================================
   GROWN-UP view-model — 5 tabs (Overview / Analytics / Library /
   Settings / Coaching). Every number is computed from real data
   (swim_sessions_v2, swim_events_v1, swim_quiz_v1, trackers);
   thin history gets honest empty/partial states, never mock data.
   ============================================================ */

import { DAYS, WEEK_ORDER, DAY_SHORT, STANDING_RULES, ENGAGEMENT_SYSTEMS, TOP7, PRIZE_POOL, BLOCK_LABEL, videoSearchUrl } from "../data.js";
import { settings, loadSessions, loadEvents, loadQuiz, loadGate, loadLadderRungs, loadTracker, getCurrentTrackerWeek, activeEngagement, activePrizePool } from "../store.js";
import { edmontonWeekISODates, edmontonDayKey, edmontonISO, fmtHHMM, exercisePhotoUrl, DAY_MS } from "../util.js";

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
  const all = loadSessions();
  const sessions = all.filter(scopeFilter(scope));
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
  const stops = sessions.filter(s => s.pain);
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
  const done = sessions.filter(s => s.completedFully);
  const days = scopeDays(scope, all);
  const scheduled = scope === "week" ? days : Math.round(days);   // plan trains daily (Sun = recovery)
  const totalMins = sessions.reduce((a, s) => a + mins(s), 0);
  const adherence = Math.min(100, Math.round((done.length / Math.max(1, scheduled)) * 100));
  const avgMins = sessions.length ? Math.round(totalMins / sessions.length) : 0;

  /* ---- readiness → completion ---- */
  const readinessOutcome = ["green", "yellow", "red", "recovery"].map(light => {
    const ss = sessions.filter(s => (s.lightResult || s.light) === light);
    const completed = ss.filter(s => s.completedFully).length;
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
  const byIso = {};
  all.forEach(s => {
    const k = edmontonISO(s.isoDate);
    const st = s.completedFully ? "done" : "partial";
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
  } else {
    const n = 28;
    const cells = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY_MS);
      const iso = edmontonISO(d);
      const dow = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Edmonton" }).toLowerCase();
      cells.push({ s: byIso[iso] || (DAYS[dow] && DAYS[dow].spa ? "rest" : "missed"), label: String(Number(iso.slice(8))) });
    }
    consistency = { subtitle: "Last 28 days (newest bottom-right).", showDows: true, cols: 7, cells };
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
    const weeks = scope === "month" ? 4 : 8;
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
  const roundsDone = sessions.reduce((a, s) => a + (s.roundsDone || 0), 0);
  const roundsPlanned = sessions.filter(s => s.sessionType !== "spa").length * 3;
  const rounds = { done: roundsDone, planned: Math.max(roundsPlanned, roundsDone), practice: 0,
    note: "Planned = 3 main rounds per training day; yellow/red days cap lower by design." };

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
    byWeekday = WEEK_ORDER.map(k => {
      const s = all.find(x => edmontonISO(x.isoDate) === isoDates[k]);
      return {
        k: DAY_SHORT[k], topic: DAYS[k].theme || DAYS[k].title,
        mood: s && s.mood ? MOOD_EMOJI[s.mood] : "·",
        done: !!(s && s.completedFully), mins: s ? mins(s) : 0,
        rowBg: s && s.completedFully ? "var(--surface)" : "var(--surface-2)",
        statusChip: s && s.completedFully ? "✓ " + mins(s) + "m" : (s ? "partial" : "—"),
        statusStyle: "font-size:11px;font-weight:900;border-radius:var(--radius-pill);padding:3px 9px;white-space:nowrap;" + (s && s.completedFully ? "background:var(--mint-wash);color:var(--mint-ink);" : s ? "background:var(--sun-wash);color:var(--sun-ink);" : "background:var(--surface-2);color:var(--ink-faint);")
      };
    });
  } else {
    const topics = {};
    sessions.forEach(s => {
      const t = (DAYS[s.dayKey] && DAYS[s.dayKey].theme) || s.dayTitle || "Other";
      topics[t] = topics[t] || { done: 0, planned: 0, moods: [] };
      topics[t].planned += 1;
      if (s.completedFully) topics[t].done += 1;
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
  const quizTrend = (quiz.results || []).slice(-6).map((r, i, arr) => {
    const pct = Math.round((r.score / Math.max(1, r.total)) * 100);
    return { k: "Q" + (i + 1), pctLabel: pct + "%",
      barStyle: "width:100%;height:" + Math.max(6, Math.round(pct * 0.8)) + "px;border-radius:6px 6px 0 0;background:" + (i === arr.length - 1 ? "var(--grape)" : "color-mix(in srgb, var(--grape) 45%, #fff)") + ";" };
  });

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
      quizTrend, hasQuiz: quizTrend.length > 0,
      quizSubtitle: "Quiz Deck score per run.",
      read, suggest
    },
    guAlerts,
    standingRules: STANDING_RULES,
    libraryList,
    settingsName: settings.athleteName || "Jess",
    settingsExRest: settings.exerciseRestSeconds, settingsRndRest: settings.roundRestSeconds, settingsSecRest: settings.sectionRestSeconds,
    stepperBtn: "width:44px;height:44px;border-radius:50%;background:var(--surface-2);border:2px solid var(--hairline);font-size:22px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;",
    voiceStyleOpts,
    coachVoiceOn: settings.coachVoiceOn !== false,
    coachTrack: onTrack(settings.coachVoiceOn !== false, "var(--mint)"), coachKnob: onKnob(settings.coachVoiceOn !== false),
    practiceMode: !!state.practiceMode,
    practiceTrack: onTrack(!!state.practiceMode, "var(--grape)"), practiceKnob: onKnob(!!state.practiceMode),
    practiceHint: state.practiceMode ? "On — runs won't be saved or counted. Great for trying it out." : "Off — sessions count toward streaks & progress.",
    prizePool: activePrizePool(),
    isDefaultPool: !(Array.isArray(settings.prizePool) && settings.prizePool.length),

    coaching: {
      gate, gateLabel: gate.unlocked ? "UNLOCKED — jumps allowed beyond Drop-and-Stick" : "LOCKED — all jumps stay at Drop-and-Stick",
      gateProgress: (gate.cleanCount || 0) + " clean Drop-and-Stick sessions logged (needs 5/5 clean ×2 weeks)",
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
