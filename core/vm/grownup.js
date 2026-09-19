/* ============================================================
   GROWN-UP view-model — 5 tabs (Overview / Analytics / Library /
   Settings / Coaching). Every number is computed from real data
   (sessions, events, quiz, trackers);
   thin history gets honest empty/partial states, never mock data.

   EVERY DAY-LEVEL FACT ON THIS SCREEN IS A VIEW OF THE DAY RECORD (dayRecords
   in js/outcome.js): completed and partial counts, adherence, days trained,
   the consistency grid, the light reports, the override log, rounds, minutes,
   the load trend, ACWR, the pace rows and the CSV. This file used to rebuild
   the day from raw session rows with its own date key (the finish stamp), its
   own grouping (the device-local workout id), its own minute rounding and its
   own "month" (30 days here, 28 days there) — which is how the same Monday
   read "missed" on the grid, 3 of 5 rounds on the tile and 31 minutes beside
   Progress's 30. Per-move and per-sitting facts (form checks, pauses, moods,
   skipped moves) are still read off the sittings the record carries.
   ============================================================ */

import { DAYS, WEEK_ORDER, DAY_SHORT, STANDING_RULES, ENGAGEMENT_SYSTEMS, TOP7, PRIZE_POOL, BLOCK_LABEL, BODY_ZONES, videoSearchUrl, fmtXp, doseLines } from "../data.js";
import { redeemedPrizesForReview } from "../store.js";
import { ATHLETE_DEFAULT, CSV_FILE_PREFIX } from "../sport.js";
import { gateUnlocked, GATE_REASON } from "../gate.js";
import { passkeySupported, hasPasskey } from "../passkey.js";
import { settings, loadSessions, loadEvents, loadQuiz, loadGate, GATE_WEEKS_REQUIRED, GATE_MOVE, loadLadderRungs, loadTracker, getCurrentTrackerWeek, activeEngagement, activePrizePool, profileList, activeProfileId, quizBankStatus, quizPaidToday, quizXpToday, QXP_DAILY_CAP, QXP_TODAY, lastWalletTrim, loadJourney, levelFromXp,
         monthKeyOf, formVerdicts, latestFormVerdicts, loadReadinessLog } from "../store.js";
import { dayRecords, workoutDate } from "../outcome.js";
import { estimateSessionSecs } from "../engine.js";
import { edmontonWeekISODates, edmontonDayKey, edmontonISO, todayISODate, exercisePhotoUrl } from "../util.js";
import { effortSummary, EFFORT_CAVEAT } from "../effort.js";
import { isTrainingRecord } from "./today.js";

const LIGHT_COLORS = { green: "var(--mint)", yellow: "var(--sun)", red: "var(--stop)", recovery: "var(--grape)" };

/* TWO DIFFERENT QUESTIONS, and they were being answered with one field.

   `light` on the record is what the day RAN (its first sitting's light).
   The body's own answer is `suggestedLight` on that sitting. They differ
   exactly when a grown-up overrode the check — which is the one case worth
   reading about. Records written before suggestedLight existed fall back to
   the executed light, which is what they were read as before. */
const firstSitting = (r) => (r.fragments || [])[0] || (r.careFragments || [])[0] || {};
const ranLight  = (r) => r.light || (r.recovery ? "recovery" : (firstSitting(r).lightResult || "green"));
const bodyLight = (r) => firstSitting(r).suggestedLight || ranLight(r);
// How much work each light lets through, so "a grown-up raised it" is decidable.
const LIGHT_RANK = { recovery: 0, red: 1, yellow: 2, green: 3 };
/* The sitting an adult actually moved the light on — the same test the day
   record applies when it sets `overridden`. */
const overrideSitting = (r) => (r.fragments || []).find((f, i) =>
  f && f.wasOverridden === true && (Number(f.outcomeVersion) >= 6 || i === 0)) || null;
const MOOD_EMOJI = { great: "😀", okay: "🙂", tired: "😴" };
const LIGHT_BEFORE = { green: "😀", yellow: "🙂", red: "😮‍💨", recovery: "😴" };
const MOOD_RANK = { "😀": 3, "🙂": 2, "😮‍💨": 1, "😴": 1 };
const isMini = r => (r.fragments || []).some(s => s && (s.mini || s.sessionType === "mini"));

/* ---- calendar arithmetic on ISO dates, so nothing here touches a clock ---- */
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const shiftISO = (iso, d) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const dayGap = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
const weekdayOf = iso => WEEKDAY_KEYS[new Date(iso + "T12:00:00Z").getUTCDay()];
const isoRange = (from, to) => { const out = []; for (let d = from; d <= to && out.length < 4000; d = shiftISO(d, 1)) out.push(d); return out; };
const isSpaDate = iso => { const day = DAYS[weekdayOf(iso)]; return !day || !!day.spa; };
/* ONE DENOMINATOR: the days the plan asked her to train — every date in the
   window through today whose weekday is not the spa day. Today, Progress and
   this screen all divide by it. */
const scheduledDays = (from, to) => isoRange(from, to).filter(d => !isSpaDate(d)).length;
const dstr = iso => new Date(String(iso).slice(0, 10) + "T12:00:00Z")
  .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const alertRow = (tone) => "display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:12px;margin-top:8px;background:" + (tone === "stop" ? "color-mix(in srgb, var(--stop) 9%, #fff)" : "var(--sun-wash)") + ";";

export function buildGrownupVM(state) {
  const scope = state.gsScope || "week";
  /* ONE "MONTH" EVERYWHERE: the calendar month, the same window Progress
     uses. It was 30 days on the tiles, 28 in the grid and 4 trailing weeks in
     the chart. */
  const scopeLabel = { week: "This week", month: "This month", all: "All-time" }[scope];
  const todayIso = todayISODate();
  const weekIsos = edmontonWeekISODates();
  const records = dayRecords();
  const firstDate = records.length ? records[0].date : todayIso;
  const scopeFrom = scope === "week" ? weekIsos.monday
    : scope === "month" ? todayIso.slice(0, 8) + "01"
    : firstDate;
  const inScope = iso => !!iso && iso >= scopeFrom && iso <= todayIso;
  const scopeRecords = records.filter(r => inScope(r.date));
  const trainingRecs = scopeRecords.filter(isTrainingRecord);
  const done = trainingRecs.filter(r => r.dayComplete);
  /* The sittings behind those records, for per-sitting facts — form checks,
     pauses, moods, skipped moves, the effort score. Not for anything the
     record already settles. */
  const sessions = scopeRecords.reduce((a, r) => a.concat(r.fragments || [], r.careFragments || []), []);
  // Try-it rows exist only to carry a pain stop to this screen. They are not
  // training and never reach the day records — but they must still reach
  // Safety & Flags below, so they are read off the raw log by their own date.
  const allRows = loadSessions();
  const all = allRows.filter(s => !s.practice);
  const safetyRows = allRows.filter(s => inScope(workoutDate([s])));
  const events = loadEvents();
  const eventInScope = e => inScope(edmontonISO(new Date(e.iso || e.t || 0)));
  const mins = r => Number(r.minutes) || 0;

  /* ---- tabs / scope chrome ---- */
  const gu = state.grownupTab || "overview";
  const tabStyle = (active) => "flex-shrink:0;padding:8px 14px;border:none;border-radius:var(--radius-pill);font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;"
    + (active ? "background:var(--aqua);color:white;" : "background:transparent;color:var(--ink-soft);");
  const scopeTabStyle = (v) => "flex:1;min-height:36px;border:none;border-radius:var(--radius-pill);cursor:pointer;font-weight:900;font-size:12px;letter-spacing:0.03em;padding:0 14px;font-family:inherit;"
    + (scope === v ? "background:var(--aqua);color:#fff;box-shadow:0 2px 6px rgba(6,182,212,0.35);" : "background:transparent;color:var(--ink-soft);");

  /* ---- safety & flags ---- */
  const stops = safetyRows.filter(s => s.pain);
  const stopEvents = stops.map(s => ({
    date: dstr(workoutDate([s])), move: s.dayTitle || s.dayKey,
    note: "Stopped for pain after " + Math.round((Number(s.durationSecs) || 0) / 60) + " min — check in before the next session."
  }));
  // Ended early = the DAY did not reach complete (and did not end in a pain
  // stop, which is its own flag). The record's verdict, not a row's flag.
  const earlyEnds = trainingRecs.filter(r => !r.dayComplete && !r.safetyStop);
  // Filtered on the body's light, this catches every day a grown-up moved —
  // a body that reported Red and was sent out Green flags here.
  const yellowRed = scopeRecords.filter(r => ["yellow", "red"].includes(bodyLight(r)));
  /* Where the two disagree, named. This is the override log a grown-up needs:
     not that an override happened, but which way it went and what came of it.
     ONLY `record.overridden` — an adult's own tap. A resume the locked light
     lowered used to be logged here as "green → red · Lowered below the body
     check", corrupting the one log a parent reads for real overrides. */
  const overrideRows = scopeRecords.filter(r => r.overridden).map(r => {
    const f = overrideSitting(r) || firstSitting(r);
    const from = f.suggestedLight || ranLight(r), to = f.lightResult || ranLight(r);
    const raised = (LIGHT_RANK[to] ?? 0) > (LIGHT_RANK[from] ?? 0);
    return {
      date: dstr(r.date), from, to, raised,
      fromColor: LIGHT_COLORS[from], toColor: LIGHT_COLORS[to],
      finished: !!r.dayComplete,
      note: (raised ? "Raised above the body check" : "Lowered below the body check")
        + " — " + (r.dayComplete ? "the day finished." : "the day did not finish.")
    };
  });
  const raised = overrideRows.filter(o => o.raised);
  /* HOW WELL THE DOSES WERE HELD, for the person who was not in the room.

     The engine has always known that a thirty-second hold ended at twelve
     seconds is not a thirty-second hold — it files the row as `partial` — and
     nothing has ever said so out loud to a grown-up. A whole session of moves
     at forty percent of their time reads, everywhere else, exactly like a
     session she completed. So it is a flag: not a failure, and not something
     that costs her XP or a streak day, but the thing worth a quiet word before
     the next session. Bands and wording are paceReport's, in js/outcome.js,
     read off the day record's plan so the kid's screen and this one cannot
     describe the same evening differently. */
  const paceDays = trainingRecs.map(r => ({ rec: r, pace: r.plan && r.plan.pace }))
    .filter(x => x.pace && x.pace.shortCount > 0);
  const shortMoveCount = paceDays.reduce((a, x) => a + x.pace.shortCount, 0);
  const paceWorstDay = paceDays.reduce((w, x) =>
    !w || x.pace.counts.red > w.pace.counts.red ? x : w, null);

  const flags = [
    ...stops.map(s => ({ icon: "🛑", rowStyle: alertRow("stop"), text: "Stopped for pain during “" + (s.dayTitle || "session") + "” (" + dstr(workoutDate([s])) + ")." })),
    ...(shortMoveCount ? [{
      icon: paceWorstDay && paceWorstDay.pace.counts.red ? "⚠️" : "🟡",
      rowStyle: alertRow(paceWorstDay && paceWorstDay.pace.counts.red ? "stop" : "sun"),
      text: shortMoveCount + " move" + (shortMoveCount === 1 ? "" : "s") + " came in under three quarters of their dose"
        + (paceWorstDay && paceWorstDay.pace.worst && paceWorstDay.pace.worst.name
            ? " — worst was " + paceWorstDay.pace.worst.name
              + " at " + Math.round((paceWorstDay.pace.worst.ratio || 0) * 100) + "% on " + dstr(paceWorstDay.rec.date)
            : "")
        + ". Still real training and still paid — worth watching, not correcting mid-set."
    }] : []),
    ...(earlyEnds.length ? [{ icon: "⏱", rowStyle: alertRow("sun"), text: earlyEnds.length + " day" + (earlyEnds.length === 1 ? "" : "s") + " ended early — " + earlyEnds.map(r => dstr(r.date)).join(", ") + "." }] : []),
    ...(yellowRed.length ? [{ icon: "💛", rowStyle: alertRow("sun"), text: yellowRed.length + " yellow/red-light day" + (yellowRed.length === 1 ? "" : "s") + " — her body check asked for a lighter session." }] : []),
    ...(raised.length ? [{ icon: "🔓", rowStyle: alertRow("sun"), text: raised.length + " day" + (raised.length === 1 ? "" : "s") + " where a grown-up raised the light above the body check — " + raised.map(o => o.from + "→" + o.to + " (" + o.date + ")").join(", ") + "." }] : [])
  ];
  const guAlerts = flags.length ? flags : [{ icon: "✅", rowStyle: alertRow("sun"), text: "Nothing to flag " + scopeLabel.toLowerCase() + " — sessions ran clean." }];

  /* ---- headline stats ---- */
  /* ONE DEFINITION OF MINUTES: the training records' `minutes` — every
     sitting's seconds plus what a crashed sitting banked, summed and rounded
     once. Recovery passes and days that ended in a pain stop are care and
     safety, not load, and are left out here, in the Load trend and in ACWR
     alike (each says so). */
  const totalMins = trainingRecs.reduce((a, r) => a + mins(r), 0);
  const trainedDates = new Set(trainingRecs.map(r => r.date));
  const trainedDays = trainedDates.size;
  /* ADHERENCE: of the days the plan asked for, how many did she keep — a day
     she trained, or a day her body check sent to recovery and she did the
     recovery. Scheduled days are the window's dates through today, Sunday
     excluded; a finished recovery weekday counts as kept, because the app
     told her not to train it. Today and Progress divide by the same rule. */
  const keptDates = new Set(scopeRecords.filter(r => isTrainingRecord(r) || r.recovery).map(r => r.date));
  const scheduled = Math.max(1, scheduledDays(scopeFrom, todayIso));
  const adherence = Math.min(100, Math.round((keptDates.size / scheduled) * 100));
  const avgMins = trainingRecs.length ? Math.round(totalMins / trainingRecs.length) : 0;

  /* ---- two light reports, because there are two questions ----
     "Did the body check read the day right?" is answered by the SUGGESTED
     light. "What load did she actually train?" is answered by the light that
     RAN. One field was doing both jobs and therefore neither. Asked of DAYS:
     a day resumed under the same light is one day of that load. */
  const lightReport = (pick, noteFor) => ["green", "yellow", "red", "recovery"].map(light => {
    const ss = scopeRecords.filter(r => pick(r) === light);
    if (!ss.length) return null;
    const completed = ss.filter(r => isTrainingRecord(r) ? r.dayComplete : !!r.streakFreeze).length;
    return {
      light: light[0].toUpperCase() + light.slice(1), color: LIGHT_COLORS[light],
      sessions: ss.length, completed,
      note: noteFor(light, completed, ss.length),
      dotStyle: "width:12px;height:12px;border-radius:50%;flex-shrink:0;background:" + LIGHT_COLORS[light] + ";",
      barStyle: "height:100%;border-radius:6px;background:" + LIGHT_COLORS[light] + ";width:" + Math.round((completed / ss.length) * 100) + "%;",
      ratio: completed + "/" + ss.length + " finished"
    };
  }).filter(Boolean);

  const readinessOutcome = lightReport(bodyLight, (light, fin, total) =>
    fin === total ? "Every day her body called " + light + " finished — the check read the day right."
      : (total - fin) + " of " + total + " didn’t finish — the " + light + " call may be reading the day too lightly.");

  const loadOutcome = lightReport(ranLight, (light, fin, total) =>
    fin === total ? "Every " + light + " day finished — that load is landing well."
      : (total - fin) + " of " + total + " didn’t finish — worth a look at how " + light + " days are loaded.");

  /* ---- body map, over time ----
     The check used to be one overwritten record, so "left shoulder, three days
     running" was not a thing anyone could see. The log makes it countable. */
  const zoneCounts = new Map();
  loadReadinessLog().forEach(r => {
    Object.entries(r.zoneSev || {}).forEach(([n, sev]) => {
      const key = Number(n);
      const cur = zoneCounts.get(key) || { n: key, times: 0, worst: 0, last: 0 };
      cur.times += 1;
      cur.worst = Math.max(cur.worst, Number(sev) || 0);
      cur.last = Math.max(cur.last, r.at || 0);
      zoneCounts.set(key, cur);
    });
  });
  const SEV_WORD = { 2: "tired", 3: "not right", 4: "pain" };
  const bodyMapTrend = [...zoneCounts.values()]
    .sort((a, b) => b.times - a.times || b.worst - a.worst)
    .slice(0, 6)
    .map(z => ({
      label: (BODY_ZONES.find(b => b.n === z.n) || {}).label || ("Zone " + z.n),
      times: z.times,
      worst: SEV_WORD[z.worst] || "marked",
      last: dstr(edmontonISO(new Date(z.last))),
      note: z.times + " check" + (z.times === 1 ? "" : "s") + " · worst: " + (SEV_WORD[z.worst] || "marked"),
      dotStyle: "width:10px;height:10px;border-radius:50%;flex-shrink:0;background:"
        + (z.worst >= 4 ? "var(--stop)" : z.worst >= 3 ? "var(--coral)" : "var(--sun)") + ";"
    }));

  /* ---- consistency cells ---- */
  /* One colour per DATE off the day record: done ⇔ the record is complete,
     partial ⇔ she trained but the day is not complete, rest ⇔ her check sent
     her to recovery and she did it. A GO-and-quit stays blank. Same reading as
     the week strip and the streak, so the grid can never paint "missed" over a
     day the kid's screen ticks. */
  const byIso = {};
  records.forEach(r => {
    const st = isTrainingRecord(r) ? (r.dayComplete && !isMini(r) ? "done" : "partial")
      : r.recovery ? "rest" : null;
    if (!st) return;
    const cur = byIso[r.date];
    if (cur === "done" || (cur === "partial" && st === "rest")) return;
    byIso[r.date] = st;
  });
  let consistency;
  if (scope === "week") {
    const todayIdx = WEEK_ORDER.indexOf(edmontonDayKey());
    consistency = {
      subtitle: "This week, day by day.", showDows: false, cols: 7,
      cells: WEEK_ORDER.map((k, i) => {
        const st = byIso[weekIsos[k]] || (i > todayIdx ? "future" : (DAYS[k].spa ? "rest" : (i === todayIdx ? "future" : "missed")));
        return { s: st, label: DAY_SHORT[k] };
      })
    };
  } else if (scope === "month") {
    // The calendar month, one cell per day; days still to come say so.
    const monthEnd = shiftISO(shiftISO(scopeFrom, 31).slice(0, 8) + "01", -1);
    const cells = isoRange(scopeFrom, monthEnd).map(iso => ({
      s: byIso[iso] || (iso > todayIso ? "future" : isSpaDate(iso) ? "rest" : "missed"),
      label: String(Number(iso.slice(8)))
    }));
    consistency = { subtitle: "This month, day by day (the 1st top-left).", showDows: true, cols: 7, cells };
  } else {
    // All-time used to be hardcoded to the same 28 days as Month, so the toggle
    // did nothing here. One cell per WEEK back to her first record instead,
    // shaded by how much of that week she trained.
    const weeksBack = Math.min(52, Math.max(1, Math.ceil((dayGap(firstDate, todayIso) + 1) / 7)));
    const cells = [];
    for (let w = weeksBack - 1; w >= 0; w--) {
      const end = shiftISO(todayIso, -w * 7);
      let trained = 0, possible = 0;
      for (let d = 6; d >= 0; d--) {
        const iso = shiftISO(end, -d);
        if (iso < firstDate || iso > todayIso) continue;
        if (isSpaDate(iso)) continue;
        possible++;
        if (byIso[iso] && byIso[iso] !== "rest") trained++;
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

  /* ---- load trend ----
     THE SAME MINUTES AS "TOTAL TIME": training records only, by the date the
     work started. The chart under the tile used to include recovery and pain
     stops that the tile excluded, so the two never added up. */
  const trainingMinsOn = new Map();
  records.filter(isTrainingRecord).forEach(r => trainingMinsOn.set(r.date, (trainingMinsOn.get(r.date) || 0) + mins(r)));
  const minsBetween = (from, to) => isoRange(from, to).reduce((a, d) => a + (trainingMinsOn.get(d) || 0), 0);
  let loadBars, loadTitle, loadSubtitle, prevTotal;
  if (scope === "week") {
    loadBars = WEEK_ORDER.map(k => {
      const iso = weekIsos[k];
      return { k: DAY_SHORT[k], mins: minsBetween(iso, iso), prev: minsBetween(shiftISO(iso, -7), shiftISO(iso, -7)) };
    });
    loadTitle = "Load trend · daily"; loadSubtitle = "Training minutes per day, this week vs last week (ghost bars). Recovery and pain stops are left out — the same minutes as Total time.";
    prevTotal = loadBars.reduce((a, b) => a + (b.prev || 0), 0);
  } else if (scope === "month") {
    // The calendar month in seven-day chunks from the 1st; ghost = the same
    // chunk of the month before.
    const prevFrom = shiftISO(scopeFrom, -1).slice(0, 8) + "01";
    loadBars = [];
    for (let start = scopeFrom, i = 1; start <= todayIso; start = shiftISO(start, 7), i++) {
      const end = shiftISO(start, 6);
      const pStart = shiftISO(prevFrom, (i - 1) * 7), pEnd = shiftISO(pStart, 6);
      loadBars.push({ k: "W" + i, mins: minsBetween(start, end), prev: minsBetween(pStart, pEnd) });
    }
    loadTitle = "Load trend · weekly"; loadSubtitle = "Training minutes per week of this month (ghost = the month before). Recovery and pain stops are left out — the same minutes as Total time.";
    prevTotal = minsBetween(prevFrom, shiftISO(scopeFrom, -1));
  } else {
    // All-time used to cap at 8 weeks, which made it look like Month. Span her
    // real history instead (capped so the chart stays readable).
    const weeks = Math.min(26, Math.max(4, Math.ceil((dayGap(firstDate, todayIso) + 1) / 7)));
    loadBars = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const to = shiftISO(todayIso, -i * 7), from = shiftISO(to, -6);
      loadBars.push({ k: "W−" + i, mins: minsBetween(from, to), prev: minsBetween(shiftISO(from, -7), shiftISO(to, -7)) });
    }
    loadTitle = "Load trend · weekly"; loadSubtitle = "Training minutes per week (ghost = the week before). Recovery and pain stops are left out — the same minutes as Total time.";
    prevTotal = minsBetween(shiftISO(todayIso, -(weeks * 2) * 7 + 1), shiftISO(todayIso, -weeks * 7));
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

  /* ---- ACWR (acute:chronic workload ratio) — kept from the old Coach Insights ----
     The same training minutes as Total time and the Load trend: a recovery
     pass and a pain stop are care and safety, not load, and counting them made
     a sore week look like a hard one. The windows are the textbook 7 and 28
     days ending today. */
  const acute = minsBetween(shiftISO(todayIso, -6), todayIso);
  const chronicWeekly = minsBetween(shiftISO(todayIso, -27), todayIso) / 4;
  // A ratio over a near-empty chronic window reads as a scary spike — require
  // 2 weeks of history before showing a number. The OLDEST record, wherever
  // it sits: a cloud restore can merge rows in any order.
  const oldestTraining = records.find(isTrainingRecord);
  const acwr = (chronicWeekly > 0 && oldestTraining && dayGap(oldestTraining.date, todayIso) >= 14) ? acute / chronicWeekly : null;
  const acwrView = acwr == null
    ? { value: "—", label: "Needs 2 weeks of history", color: "var(--ink-faint)", note: "The acute:chronic workload ratio compares the last 7 days' training minutes to the 28-day weekly average. It fills in after two weeks of history." }
    : {
      value: acwr.toFixed(2),
      label: acwr < 0.8 ? "Undertraining zone" : acwr <= 1.3 ? "Sweet spot (0.8–1.3)" : acwr <= 1.5 ? "Caution — ramping fast" : "High spike — back off",
      color: acwr >= 0.8 && acwr <= 1.3 ? "var(--mint-ink)" : acwr <= 1.5 ? "var(--sun-ink)" : "var(--stop)",
      note: "Last 7 days: " + Math.round(acute) + " min of training vs " + Math.round(chronicWeekly) + " min/week over 28 days. Recovery and safety stops are left out — the same training minutes as Total time and the Load trend. 0.8–1.3 is the safe growth band."
    };

  /* ---- pace (planned vs actual, last 5 days in scope) ----
     Planned is the DAY's ask — the estimate of the record's own plan under the
     light it was started under, the same estimate the day card prints — and
     actual is the record's minutes. A resumed day is one row, not two. */
  const paceRows = trainingRecs.slice(-5).map(r => {
    const planned = Math.max(1, Math.round(estimateSessionSecs((r.plan && r.plan.circuits) || []) / 60)) || mins(r);
    const actual = mins(r);
    const pct = Math.min(100, Math.round((actual / Math.max(1, planned)) * 100));
    return {
      label: dstr(r.date).split(",")[0], planned, actual,
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
  // One bar per DAY, its sittings' self-checks added together.
  const formOf = r => (r.fragments || []).reduce((a, f) => ({ clean: a.clean + (f.clean || 0), wobbly: a.wobbly + (f.wobbly || 0) }), { clean: 0, wobbly: 0 });
  const formTrend = trainingRecs.map(r => ({ r, f: formOf(r) })).filter(x => x.f.clean + x.f.wobbly > 0).slice(-8).map((x, i, arr) => {
    const pct = Math.round((x.f.clean / (x.f.clean + x.f.wobbly)) * 100);
    return { k: dstr(x.r.date).split(",")[0], pct, pctLabel: pct + "%",
      barStyle: "width:100%;height:" + Math.max(6, Math.round(((pct - 60) / 40) * 80)) + "px;border-radius:6px 6px 0 0;background:" + (i === arr.length - 1 ? "var(--mint)" : "color-mix(in srgb, var(--mint) 55%, #fff)") + ";" };
  });

  /* ---- rounds ---- */
  // The record's rounds: finished against what each day actually ASKED FOR —
  // green 3, yellow 2, red 1 — counted once per day however many sittings it
  // took. A day that ended in a pain stop is not a training day here.
  const roundsDone = trainingRecs.reduce((a, r) => a + (Number(r.mainRoundsDone) || 0), 0);
  const roundsPlanned = trainingRecs.reduce((a, r) => a + (Number(r.roundsPlanned) || 0), 0);
  const rounds = { done: roundsDone, planned: Math.max(roundsPlanned, roundsDone), practice: 0,
    note: "Planned = the rounds each day actually asked for — green 3, yellow 2, red 1, mini 1 — as stamped on the day's record." };

  /* ---- mood before → after ---- */
  // One answer per DAY: she is asked how it felt once, at the end. Counting
  // both fragments of a resumed day made a single "tired" into two.
  const moodOf = r => (r.fragments || []).map(f => f.mood).filter(Boolean).pop() || null;
  const moodRows = scopeRecords.filter(r => moodOf(r)).slice(-6).map(r => {
    const before = LIGHT_BEFORE[ranLight(r)] || "🙂";
    const after = MOOD_EMOJI[moodOf(r)] || "🙂";
    const up = MOOD_RANK[after] > MOOD_RANK[before], same = MOOD_RANK[after] === MOOD_RANK[before];
    return { day: dstr(r.date).split(",")[0], before, after, up, same,
      arrowColor: up ? "var(--mint)" : same ? "var(--ink-faint)" : "var(--coral)", arrow: up ? "↗" : same ? "→" : "↘" };
  });
  const moodUpPct = moodRows.length ? Math.round((moodRows.filter(m => m.up || m.same).length / moodRows.length) * 100) : 0;

  /* ---- by weekday / by topic ---- */
  let byWeekday = null, byTopic = null;
  if (scope === "week") {
    /* The day's record on each DATE of the week. A date can hold two records
       (a catch-up for another weekday and a recovery pass, say); the one she
       trained wins, and a finished one outranks the rest. */
    const rank = r => (isTrainingRecord(r) ? 2 : 0) + (r.dayComplete ? 1 : 0);
    byWeekday = WEEK_ORDER.map(k => {
      const r = records.filter(x => x.date === weekIsos[k]).sort((a, b) => rank(b) - rank(a) || mins(b) - mins(a))[0];
      const finished = !!(r && isTrainingRecord(r) && r.dayComplete);
      const shown = !!(r && (isTrainingRecord(r) || r.recovery));
      const wMins = shown ? mins(r) : 0;
      const wMood = r && moodOf(r);
      return {
        k: DAY_SHORT[k], topic: DAYS[k].theme || DAYS[k].title,
        mood: wMood ? MOOD_EMOJI[wMood] : "·",
        done: finished, mins: wMins,
        rowBg: finished ? "var(--surface)" : "var(--surface-2)",
        statusChip: finished ? "✓ " + wMins + "m" : (shown ? (isTrainingRecord(r) ? "partial" : "recovery") : "—"),
        statusStyle: "font-size:11px;font-weight:900;border-radius:var(--radius-pill);padding:3px 9px;white-space:nowrap;" + (finished ? "background:var(--mint-wash);color:var(--mint-ink);" : shown ? "background:var(--sun-wash);color:var(--sun-ink);" : "background:var(--surface-2);color:var(--ink-faint);")
      };
    });
  } else {
    const topics = {};
    scopeRecords.forEach(r => {
      const t = (DAYS[r.dayKey] && DAYS[r.dayKey].theme) || firstSitting(r).dayTitle || "Other";
      topics[t] = topics[t] || { done: 0, planned: 0, moods: [] };
      topics[t].planned += 1;
      if (isTrainingRecord(r) && r.dayComplete) topics[t].done += 1;
      const m = moodOf(r);
      if (m) topics[t].moods.push(MOOD_EMOJI[m]);
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
    return inScope(edmontonISO(new Date(r.t)));
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
      + " questions — the Quiz Deck's and the Coach's Quiz's, paid once each), at " + QXP_DAILY_CAP + " XP a day (one new question), and at one paying deck per day. "
      + "Replays are free practice worth 0 XP. "
      + "One card a day is drawn from the session she just trained; it pays " + QXP_TODAY
      + " XP at most, inside the same daily cap, and is not part of the fixed bank. "
      + (qBank.left ? qBank.left + " questions still hold XP." : "All questions are mastered — the quiz pays nothing further.")
  };

  /* ---- indicator board -----------------------------------------------------
     One place where every number answers to the SAME window, each as a total
     and an average — and to the same day records as every other screen. */
  const effort = effortSummary(sessions);
  const availableDays = Math.max(trainedDays, scheduled);
  const boardRounds = roundsDone;
  /* SETTLED, per DATE: `settledXp` is what the date settles at, stamped on
     every record of that date, so it is summed once per date. */
  const xpOn = new Map();
  scopeRecords.forEach(r => { if (!r.unsaved) xpOn.set(r.date, Number(r.settledXp) || 0); });
  const boardXp = [...xpOn.values()].reduce((a, v) => a + v, 0);
  // One answer per day, same as the mood card above.
  const moodCount = { great: 0, okay: 0, tired: 0 };
  scopeRecords.forEach(r => { const m = moodOf(r); if (moodCount[m] != null) moodCount[m] += 1; });
  const levelsUp = (() => {
    const j = loadJourney() || { xp: 0 };
    return Math.max(0, levelFromXp(j.xp || 0).level - levelFromXp(Math.max(0, (j.xp || 0) - boardXp)).level);
  })();
  const verifiedAll = latestFormVerdicts();
  const verified = Object.values(verifiedAll).reduce((a, v) => {
    a.asked += 1; if (v.pass) a.pass += 1; return a;
  }, { asked: 0, pass: 0 });
  const avg1 = (n, d, unit) => d > 0 ? (Math.round((n / d) * 10) / 10) + (unit ? " " + unit : "") : "—";

  const indicators = [
    { label: "Days trained",   total: trainedDays + " of " + availableDays, avg: availableDays ? Math.round((trainedDays / availableDays) * 100) + "%" : "—" },
    { label: "Total time",     total: totalMins >= 60 ? Math.floor(totalMins / 60) + "h " + (totalMins % 60) + "m" : totalMins + "m", avg: avg1(totalMins, trainingRecs.length, "min / session") },
    // Labelled for what it is on the row itself, so the number is never read as
    // a measurement of the child by someone skimming the table.
    { label: "Effort level (rough)", total: effort.avg == null ? "—" : String(effort.avg), avg: effort.band },
    { label: "Rounds",         total: String(boardRounds), avg: avg1(boardRounds, done.length, "/ session") },
    { label: "Safety",         total: (stops.length ? stops.length + " stop" + (stops.length === 1 ? "" : "s") : "no stops") + (earlyEnds.length ? " · " + earlyEnds.length + " early" : ""), avg: stops.length ? "needs a conversation" : "clean" },
    { label: "Completed",      total: done.length + " of " + trainingRecs.length, avg: trainingRecs.length ? Math.round((done.length / trainingRecs.length) * 100) + "%" : "—" },
    // Average from the SAME rows as the total — moodUpPct is the last-6 trend
    // used by the mood card, and quoting it here made the two columns disagree.
    { label: "How she felt",   total: "😀" + moodCount.great + "  🙂" + moodCount.okay + "  😴" + moodCount.tired,
      avg: (() => { const t = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];
                    return t && t[1] ? "mostly " + MOOD_EMOJI[t[0]] : "—"; })() },
    { label: "Levels upgraded", total: "+" + levelsUp, avg: levelsUp ? "one every " + avg1(trainingRecs.length, levelsUp, "sessions") : "—" },
    { label: "Form · she says", total: effort.formAsked ? effort.formClean + " of " + effort.formAsked : "—", avg: effort.formPct == null ? "—" : effort.formPct + "% clean" },
    { label: "Form · you verified", total: verified.asked ? verified.pass + " of " + verified.asked : "not checked yet", avg: verified.asked ? Math.round((verified.pass / verified.asked) * 100) + "% ✓" : "—" },
    { label: "XP earned",      total: fmtXp(boardXp), avg: avg1(boardXp, trainingRecs.length, "/ session") }
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
    note: "Effort is scored on what she controls — finishing the day's own target, showing up on a hard day, not skipping, not rushing, and the random form spot-checks. A pain stop never costs her anything.",
    /* Shown with the number, not tucked away: the weights behind it were chosen
       rather than validated against anything, so the components below are the
       real content and the score is a rough summary of them. Nothing in the app
       reads it to make a decision, and neither should a parent. */
    caveat: EFFORT_CAVEAT
  };

  const periodCovered = (() => {
    if (!records.length) return "No sessions recorded yet.";
    const from = scopeFrom < firstDate ? firstDate : scopeFrom;
    return scopeLabel + " · " + dstr(from).replace(/^\w+, /, "") + " – "
      + dstr(todayIso).replace(/^\w+, /, "") + " · " + trainingRecs.length + " training session" + (trainingRecs.length === 1 ? "" : "s");
  })();

  // The trained-record count the narrative below quotes.
  const trainingRows = trainingRecs;

  /* ---- coach narrative (one honest story per scope) ---- */
  const read = !scopeRecords.length
    ? "No sessions recorded " + scopeLabel.toLowerCase() + " yet — the story starts with the first GO."
    : `${done.length} of ${trainingRows.length} training sessions finished (${adherence}% adherence vs. scheduled). ` +
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
        name: ex.name, dose: ex.byReps ? doseLines(ex).full : (ex.dose || ""), cue: ex.cue || "",
        parentWatch: ex.parentWatch || "", fix: ex.redFlag || "", transfer: ex.transfer || "",
        photoUrl: exercisePhotoUrl(ex.name, "Demo"),
        /* Not one "- Demo Image" file exists in either app, and this card had
           no fallback — so every card in the library showed the placeholder.
           The session's detail overlay has always chained Demo → Timer; the
           library asks for the same chain. */
        photoFallbackUrl: exercisePhotoUrl(ex.name, "Timer"),
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
  /* Speed, not style. Two options and no slider: this is a setting a grown-up
     changes once, and "Slow / Normal" is a decision they can make by ear. */
  const voiceSpeedOpts = [["slow", "Slow"], ["normal", "Normal"]].map(([v, label]) => {
    const on = (settings.voiceSpeed || "slow") === v;
    return { key: v, label,
      style: "padding:9px 16px;border-radius:var(--radius-pill);border:2px solid " + (on ? "var(--aqua)" : "var(--hairline)") + ";background:" + (on ? "var(--aqua-wash)" : "var(--surface)") + ";color:" + (on ? "var(--aqua-ink)" : "var(--ink-soft)") + ";font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;" };
  });

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
      loadOutcome, hasLoadReport: loadOutcome.length > 0,
      overrideRows, hasOverrides: overrideRows.length > 0,
      bodyMapTrend, hasBodyMap: bodyMapTrend.length > 0,
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
    settingsName: settings.athleteName || ATHLETE_DEFAULT,
    profiles: profileList().map(p => ({
      id: p.id, name: p.name, active: p.id === activeProfileId(),
      style: "min-height:40px;border-radius:var(--radius-pill);cursor:pointer;font-weight:900;font-size:14px;padding:0 16px;font-family:inherit;border:2px solid "
        + (p.id === activeProfileId() ? "var(--aqua);background:var(--aqua);color:#fff;" : "var(--hairline);background:var(--surface-2);color:var(--ink);")
    })),
    multiProfile: profileList().length > 1,
    backupNote: state.backupNote || "", backupNoteOk: !!state.backupNoteOk,
    settingsExRest: settings.exerciseRestSeconds, settingsRndRest: settings.roundRestSeconds, settingsSecRest: settings.sectionRestSeconds,
    stepperBtn: "width:44px;height:44px;border-radius:50%;background:var(--surface-2);border:2px solid var(--hairline);font-size:22px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;",
    voiceStyleOpts, voiceSpeedOpts,
    // Three switches, not one. The old single 🎧 toggle silenced the timer
    // beeps and the safety cues along with the coach's chatter.
    coachVoiceOn: settings.coachSpeechOn !== false,
    coachTrack: onTrack(settings.coachSpeechOn !== false, "var(--mint)"), coachKnob: onKnob(settings.coachSpeechOn !== false),
    timerSoundsOn: settings.timerSoundsOn !== false,
    timerTrack: onTrack(settings.timerSoundsOn !== false, "var(--aqua)"), timerKnob: onKnob(settings.timerSoundsOn !== false),
    safetyVoiceOn: settings.safetyVoiceOn !== false,
    safetyTrack: onTrack(settings.safetyVoiceOn !== false, "var(--coral)"), safetyKnob: onKnob(settings.safetyVoiceOn !== false),
    prizePool: activePrizePool(),
    isDefaultPool: !(Array.isArray(settings.prizePool) && settings.prizePool.length),
    /* A wallet trim removes prizes she can see, so it is never silent — and
       neither is the amnesty, which runs itself on boot and hands thirteen
       prizes back. A wallet that changes behind a child's back with no
       explanation is what produced the problem it repairs. */
    walletRepairNote: state.walletRepairNote
      || ((loadJourney() || {}).prizeAmnesty || {}).note
      || "",
    // The grown-up gate, and the redeemed prizes it protects.
    gateAsk: state.gateAsk || null,
    gateError: state.gateError || "",
    gateReason: GATE_REASON[state.gateAsk] || "",
    grownupUnlocked: gateUnlocked(),
    /* The passkey row in Settings. A PIN with no passkey behind it has no reset
       at all, so the state of this is something a parent has to be able to see
       rather than find out the day they forget the PIN. */
    passkeySupported: passkeySupported(),
    hasPasskey: hasPasskey(),
    passkeyLine: !passkeySupported()
      ? "This browser has no passkey support. The PIN works, but a forgotten PIN cannot be reset here — write it down."
      : hasPasskey()
        ? "A passkey is set up on this device. If the PIN is ever forgotten, this is how you get back in."
        : "No passkey yet. Set one up — without it a forgotten PIN cannot be reset, and the only way back would be restoring a backup.",
    passkeyNote: state.passkeyNote || "",
    passkeyNoteOk: !!state.passkeyNoteOk,
    prizeReviewOpen: !!state.prizeReviewOpen,
    redeemedPrizes: (state.prizeReviewOpen ? redeemedPrizesForReview() : []).map(p => ({
      id: p.id, label: p.label,
      dateLine: "Earned " + (p.date || "—") + (p.repairOf ? " · restored copy" : "")
    })),
    noRedeemedPrizes: state.prizeReviewOpen && redeemedPrizesForReview().length === 0,
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
      gate, gateLabel: gate.unlocked ? "UNLOCKED — jumps allowed beyond " + GATE_MOVE : "LOCKED — all jumps stay at " + GATE_MOVE,
      // Says what is actually counted, and counts what it says. The number used
      // to tick up whenever the floor move merely wasn't skipped — no clean
      // self-check, no separate weeks, nothing the sentence promised. (It also
      // named a swim move to a skater: see GATE_MOVE in core/store.js.)
      gateProgress: (gate.cleanWeeks || []).length + " of " + GATE_WEEKS_REQUIRED
        + " weeks with a clean " + GATE_MOVE + " logged"
        + (gate.unlocked ? "" : " — a week counts when she does the move AND self-checks it clean, and a grown-up hasn't flagged it."),
      ladderRows, trackerWeek, tracker, prFields,
      engagement, engagementSystems: ENGAGEMENT_SYSTEMS
    }
  };
}

/* CSV export — one line per DAY RECORD.

   It was one line per sitting with the workout's verdict beside it, and every
   total taken off the file still had to know which rows to add. The day is
   the unit everywhere else now, so it is the unit here: the record's date
   (the day the work started), its verdict, its rounds, both movement units,
   its minutes summed once, and how many sittings it took. */
export function exportCsv() {
  const rows = [["date", "day", "title", "light", "lowestLight", "minutes", "sittings", "outcome", "dayComplete",
                 "countsForStreak", "streakFreeze", "roundsDone", "roundsPlanned", "performancesDone", "performancesPlanned",
                 "movementsDone", "movementsPlanned", "hadPainStop", "safetyStop", "overridden",
                 "skips", "pauses", "clean", "wobbly", "mood", "intentWord", "xp", "roundsShort"]];
  dayRecords().forEach(r => {
    const frags = (r.fragments || []).concat(r.careFragments || []);
    const last = frags[frags.length - 1] || {};
    const outcome = r.safetyStop ? "safety-stop"
      : isTrainingRecord(r) ? (r.dayComplete ? "complete" : "partial")
      : (r.care || r.recovery) ? "recovery" : "none";
    rows.push([
      r.date, r.dayKey || "", last.dayTitle || (DAYS[r.dayKey] || {}).title || "",
      r.light || (r.recovery ? "recovery" : ""), r.lowestLight || "",
      Number(r.minutes) || 0, frags.length, outcome, r.dayComplete ? 1 : 0,
      r.countsForStreak ? 1 : 0, r.streakFreeze ? 1 : 0,
      Number(r.mainRoundsDone) || 0, Number(r.roundsPlanned) || 0,
      (r.performances || {}).performed || 0, (r.performances || {}).planned || 0,
      (r.movements || {}).performed || 0, (r.movements || {}).planned || 0,
      r.hadPainStop ? 1 : 0, r.safetyStop ? 1 : 0, r.overridden ? 1 : 0,
      (r.rows || []).filter(l => l && l.status === "skipped").length,
      frags.reduce((a, f) => a + (Number(f.pauseCount) || 0), 0),
      frags.reduce((a, f) => a + (Number(f.clean) || 0), 0),
      frags.reduce((a, f) => a + (Number(f.wobbly) || 0), 0),
      frags.map(f => f.mood).filter(Boolean).pop() || "",
      frags.map(f => f.intentWord).filter(Boolean).pop() || "",
      r.unsaved ? 0 : (Number(r.settledXp) || 0),
      // WHY a round did not count, so "she did three rounds and it says one" is
      // answerable from the export instead of from the raw ledger.
      (r.mainRounds || []).filter(x => !x.counts)
        .map(x => "R" + x.round + ":" + (x.missing ? "stopped partway"
          : x.skipped.length ? "skipped " + x.skipped[0]
          : x.blockedBy ? "short on " + x.blockedBy.name
          : "short")).join("; ")
    ]);
  });
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${CSV_FILE_PREFIX}${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
