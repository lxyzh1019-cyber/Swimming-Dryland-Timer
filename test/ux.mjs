/* ============================================================
   UX — what the screens SAY agrees with what the store PAYS.
   A recovery day has a cell of its own; adherence counts training
   days; the kid's log uses her words.
   ============================================================ */
import { store, outcome, tvm, pvm, gvm, data } from "./harness.mjs";
let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
import { edmontonWeekISODates, edmontonDayKey } from "../js/util.js";
import { WEEK_ORDER, DAYS } from "../js/data.js";

localStorage.clear(); store.migrate();
const week = edmontonWeekISODates();
const todayKey = edmontonDayKey();
const todayIdx = WEEK_ORDER.indexOf(todayKey);
// A full recovery menu on the first weekday of the week (or today, on a Monday).
const recDay = WEEK_ORDER[Math.max(0, Math.min(todayIdx, 0))];
const recoveryRow = { app: "swimming", dayKey: recDay, isoDate: week[recDay] + "T23:00:00.000Z",
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION, sessionType: "recovery",
  recovery: true, completedFully: true, roundsDone: 0, roundsPlanned: 0, expectedWork: 6, xpEarned: 90,
  ledger: Array.from({ length: 6 }, (_, i) => ({ block: "recovery", round: 1, name: "care " + i, status: "done", credit: 1 })) };
store.saveSession(recoveryRow);
const oc = outcome.outcomeOf(recoveryRow);
ok(oc.state === "recovery" && oc.streakFreeze, "the fixture is a full recovery menu");
const statuses = tvm.weekStatuses();
ok(statuses[recDay] === "recovery", "a finished weekday recovery has its own week-strip state, not 'missed': " + statuses[recDay]);
const today = tvm.buildTodayVM({ selectedDay: recDay, expanded: {} });
ok(today.week.find(d => d.key === recDay).icon === "❄️", "…drawn as ❄️");
ok(today.statChips[1].value.startsWith("1/7"), "…and it counts toward 'this week': " + today.statChips[1].value);
ok(/RECOVERY DONE/.test(today.dayView.badgeLabel) && today.dayView.ctaAction === "goExplore", "the day card says recovery is done and offers Explore");
ok(today.legend.some(l => l.label === "Recovery") && today.legend.find(l => l.label === "Partly done").icon !== today.legend.find(l => l.label === "Done").icon,
   "the legend names Recovery, and Done and Partly done no longer share a glyph");

/* adherence counts the days she was meant to train */
const g = gvm.buildGrownupVM({ grownupTab: "overview", gsScope: "week", isWide: true });
const expectScheduled = WEEK_ORDER.slice(0, todayIdx + 1).filter(k => !DAYS[k].spa).length;
ok(g.analytics.scheduled === expectScheduled, "week adherence denominator excludes the spa day: " + g.analytics.scheduled + " vs " + expectScheduled);
ok(g.analytics.consistency.cells.some(c => c.d === "❄️"), "the consistency grid shows the recovery cell");
ok(g.tabs.every(t => typeof t.active === "boolean") && g.tabs.filter(t => t.active).length === 1, "tabs carry a single active flag for aria-pressed");
ok(/ACWR|Needs 2 weeks/.test(JSON.stringify(g.analytics.acwr)), "the load ratio explains itself in words");

/* the kid's log speaks her language */
store.saveSession({ ...recoveryRow, dayKey: "tuesday", isoDate: week.tuesday + "T23:00:00.000Z", sessionType: "main", recovery: false, safetyStop: true, pain: true, completedFully: false, endedEarly: true, ledger: [{ block: "warmup", round: 1, name: "x", status: "done", credit: 1 }], expectedWork: 20 });
const labels = store.loadSessions().map(s => pvm.logEntryView(s).lightLabel);
ok(labels.includes("RECOVERY") && labels.includes("STOPPED FOR PAIN"), "log chips: " + labels.join(", "));
ok(!labels.some(l => /SAFETY STOP|ENDED EARLY|NOTHING LOGGED|MINI|TRY-IT/.test(l)), "no parent-language chips remain");
const rows = pvm.buildProgressVM({ progressScope: "4w", logScope: "week" }).periodStats.rows.map(r => r.label);
ok(!rows.some(l => /Completion status|Levels upgraded|Tough days/.test(l)), "the period table uses kid labels: " + rows.join(" · "));

/* severity has one name per level everywhere */
const names = data.SEVERITY_LEVELS.map(s => s.label);
ok(names.includes("Tired") && names.includes("Not right") && names.some(n => /Hurts/.test(n)), "severity labels: " + names.join(", "));

console.log("✓ ux passed (" + passed + " assertions)");
