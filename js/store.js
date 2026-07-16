/* ============================================================
   STORE — localStorage persistence, settings, session log,
   events, journey (XP/levels/prizes) and one-time migration.
   Local-first; Firestore mirroring happens in the engine.
   ============================================================ */

import { DAY_MS, mondayOfThisWeek, todayISODate, edmontonISO } from "./util.js";
import { PRIZE_POOL, levelCost } from "./data.js";

/* ---- keys (unchanged from the old app unless noted) ---- */
export const SETTINGS_KEY     = "swimTrainingSettingsV2";
export const PROGRESS_KEY     = "swimTrainingProgressV2";
export const SKIP_HISTORY_KEY = "swimTrainingSkipHistoryV2";
export const ENGAGE_KEY       = "swimEngagementPickV2";
export const LS_READINESS     = "swim_readiness";      // v2 schema (4-Q + body map)
export const LS_DAYPROG       = "swim_day_progress";
export const LS_LEARNING      = "swim_learning_records";
export const LS_LADDER        = "swim_ladder_rungs";
export const LS_QUIZ          = "swim_quiz_v1";
export const LS_GATE          = "swim_gate_state";
export const LS_SESSIONS      = "swim_sessions_v2";
export const LS_TRACKER       = "swim_tracker_v2";
export const LS_EVENTS        = "swim_events_v1";
export const LS_PRLOG         = "swim_pr_log";
export const LS_JOURNEY       = "swim_journey_v1";     // NEW: xp / level / prizes

const SKIP_RETENTION_MS  = 7 * 24 * 60 * 60 * 1000;
const EVENT_RETENTION_MS = 120 * 24 * 60 * 60 * 1000; // 120 days
const EVENT_CAP = 1500;

export function readStorage(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---- settings ---- */
export const DEFAULT_SETTINGS = {
  voiceStyle: "fun",
  exerciseRestSeconds: 5,
  roundRestSeconds: 25,
  sectionRestSeconds: 30,   // NEW (block break; old app hardcoded 8s)
  secondsPerRep: 3,
  coachVoiceOn: true,       // NEW: design's 🎧 toggle gates ALL coach audio
  athleteName: "Jess",      // NEW: editable in Grown-up Settings
  prizePool: null           // NEW: null = default PRIZE_POOL
};

export let settings = loadSettings();

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readStorage(SETTINGS_KEY, {}) };
}
export function saveSettings() {
  writeStorage(SETTINGS_KEY, settings);
}
export function updateSettings(patch) {
  Object.assign(settings, patch);
  saveSettings();
}
export function activePrizePool() {
  const pool = settings.prizePool;
  return Array.isArray(pool) && pool.length ? pool : PRIZE_POOL;
}

export const MIN_REST = 3;
export function configuredExerciseRest() {
  const v = Number(settings.exerciseRestSeconds);
  return Math.min(120, Math.max(MIN_REST, Number.isFinite(v) ? Math.round(v) : DEFAULT_SETTINGS.exerciseRestSeconds));
}
export function configuredRoundRest() {
  const v = Number(settings.roundRestSeconds);
  return Math.min(180, Math.max(10, Number.isFinite(v) ? Math.round(v) : DEFAULT_SETTINGS.roundRestSeconds));
}
export function configuredSectionRest() {
  const v = Number(settings.sectionRestSeconds);
  return Math.min(90, Math.max(5, Number.isFinite(v) ? Math.round(v) : DEFAULT_SETTINGS.sectionRestSeconds));
}

/* ---- sessions log (source of truth for streaks/progress/analytics) ---- */
export function loadSessions() { return readStorage(LS_SESSIONS, []); }
export function saveSession(entry) {
  const all = loadSessions();
  all.push(entry);
  writeStorage(LS_SESSIONS, all);
}
/* Patch the most recent session record (mood / reflection / pr live
   alongside lightResult — closes the readiness→outcome gap). */
export function patchLastSession(patch) {
  const all = loadSessions();
  if (!all.length) return;
  all[all.length - 1] = { ...all[all.length - 1], ...patch };
  writeStorage(LS_SESSIONS, all);
}
export function thisWeekSessions() {
  const monday = mondayOfThisWeek();
  return loadSessions().filter(s => new Date(s.isoDate) >= monday);
}

export function daysAgoCount(sessions, days) {
  const cutoff = Date.now() - days * DAY_MS;
  return sessions.filter(s => s.isoDate && new Date(s.isoDate).getTime() >= cutoff);
}
export function sumSecs(sessions) { return sessions.reduce((a, s) => a + (s.durationSecs || 0), 0); }

// Longest run of consecutive calendar days with ≥1 completed session.
export function longestStreak(sessions) {
  const days = [...new Set(sessions.map(s => edmontonISO(s.isoDate)).filter(Boolean))].sort();
  let best = 0, run = 0, prev = null;
  days.forEach(d => {
    if (prev && Math.round((new Date(d) - new Date(prev)) / DAY_MS) === 1) run++;
    else run = 1;
    prev = d; if (run > best) best = run;
  });
  return best;
}
// Current streak anchored to today/yesterday (Edmonton). Compares date
// STRINGS — Date objects here would mix UTC-parsed and local clocks and
// break the streak every morning.
export function currentStreak(sessions) {
  const days = [...new Set(sessions.map(s => edmontonISO(s.isoDate)).filter(Boolean))].sort();
  if (!days.length) return 0;
  const today = todayISODate();
  const y = new Date(today + "T12:00:00Z");
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  const last = days[days.length - 1];
  if (last !== today && last !== yesterday) return 0;
  let streak = 1;
  let cur = new Date(last + "T12:00:00Z");
  for (let i = days.length - 2; i >= 0; i--) {
    const prev = new Date(days[i] + "T12:00:00Z");
    if (Math.round((cur - prev) / DAY_MS) === 1) { streak++; cur = prev; } else break;
  }
  return streak;
}

/* ---- skip history ---- */
function pruneSkipHistory(items) {
  const cutoff = Date.now() - SKIP_RETENTION_MS;
  return (items || []).filter(item => item.createdAt >= cutoff);
}
export function loadSkipHistory() {
  const cleaned = pruneSkipHistory(readStorage(SKIP_HISTORY_KEY, []));
  writeStorage(SKIP_HISTORY_KEY, cleaned);
  return cleaned;
}
export function addSkipRecord(record) {
  const all = pruneSkipHistory(readStorage(SKIP_HISTORY_KEY, []));
  all.push(record);
  writeStorage(SKIP_HISTORY_KEY, all);
}

/* ---- analytics event stream ---- */
export function loadEvents() { return readStorage(LS_EVENTS, []); }
// Lightweight behavioural instrumentation. Never throws, never blocks a session.
export function logEvent(type, data) {
  try {
    const cutoff = Date.now() - EVENT_RETENTION_MS;
    let all = loadEvents().filter(e => (e.t || 0) >= cutoff);
    all.push({ t: Date.now(), iso: new Date().toISOString(), type, ...(data || {}) });
    if (all.length > EVENT_CAP) all = all.slice(all.length - EVENT_CAP);
    writeStorage(LS_EVENTS, all);
  } catch {}
}

/* ---- readiness (v2: 4-Q + body map) ---- */
export function loadReadiness() {
  const r = readStorage(LS_READINESS, null);
  return r && r.version === 2 ? r : null;   // old 8-Q payloads are ignored
}
export function saveReadiness(check) {
  writeStorage(LS_READINESS, { version: 2, when: Date.now(), ...check });
}

/* ---- day progress (same-day resume; No-Debt: partials never carry over) ---- */
function dayProgressKey(dayKey) { return `${dayKey}|${todayISODate()}`; }
export function loadDayProgress(dayKey) {
  const all = readStorage(LS_DAYPROG, {});
  return all[dayProgressKey(dayKey)] || null;
}
export function saveDayProgress(dayKey, p) {
  const all = readStorage(LS_DAYPROG, {});
  const today = todayISODate();
  Object.keys(all).forEach(k => { if (!k.endsWith("|" + today)) delete all[k]; });
  all[dayProgressKey(dayKey)] = p;
  writeStorage(LS_DAYPROG, all);
}
export function clearDayProgress(dayKey) {
  const all = readStorage(LS_DAYPROG, {});
  delete all[dayProgressKey(dayKey)];
  writeStorage(LS_DAYPROG, all);
}

/* ---- valgus gate ---- */
export function loadGate() { return readStorage(LS_GATE, { unlocked: false, cleanCount: 0 }); }
export function saveGate(g) { writeStorage(LS_GATE, g); }
export function gateLocked() { return !loadGate().unlocked; }

/* ---- Independence Ladder ---- */
export function loadLadderRungs() { return readStorage(LS_LADDER, {}); }
export function saveLadderRungs(r) { writeStorage(LS_LADDER, r); }

/* ---- learning records + quiz ---- */
export function loadLearning() { return readStorage(LS_LEARNING, []); }
export function saveLearning(l) { writeStorage(LS_LEARNING, l); }
export function loadQuiz() { return readStorage(LS_QUIZ, { items: {}, results: [], streak: 0 }); }
export function saveQuiz(q) { writeStorage(LS_QUIZ, q); }

/* ---- PR log ---- */
export function loadPrLog() { return readStorage(LS_PRLOG, []); }
export function addPrLog(entry) {
  const all = loadPrLog();
  all.push(entry);
  writeStorage(LS_PRLOG, all.slice(-60));
}

/* ---- 4-week tracker (PR board) ---- */
export function loadTracker() {
  const raw = readStorage(LS_TRACKER, {});
  return {
    _startISO: raw._startISO,
    week1: raw.week1 || {}, week2: raw.week2 || {},
    week3: raw.week3 || {}, week4: raw.week4 || {}
  };
}
export function saveTracker(t) { writeStorage(LS_TRACKER, t); }
export function getCurrentTrackerWeek() {
  const t = loadTracker();
  if (!t._startISO) {
    t._startISO = new Date().toISOString();
    saveTracker(t);
  }
  const start = new Date(t._startISO);
  const days = Math.floor((new Date() - start) / DAY_MS);
  return Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
}

/* ---- weekly engagement pick (Peer Challenge / Role Flip) ---- */
export function weekKeyFor(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const diff = dow === 0 ? 1 : 1 - dow;  // upcoming/this Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
export function activeEngagement(date) {
  const all = readStorage(ENGAGE_KEY, {});
  return all[weekKeyFor(date || new Date())] || null;
}
export function setEngagementPick(systemKey) {
  const all = readStorage(ENGAGE_KEY, {});
  const monday = new Date();
  monday.setDate(monday.getDate() + 1);   // picking on Sunday applies to the coming week
  all[weekKeyFor(monday)] = systemKey;
  writeStorage(ENGAGE_KEY, all);
}

/* ============================================================
   JOURNEY — XP, level, rank, prizes. New with the Splash UI.
   XP rules (design spec): session complete = moves×10 + 40
   (spa = 0); quiz: +25 per correct, +10 per attempted question.
   ============================================================ */

export function loadJourney() {
  return readStorage(LS_JOURNEY, null);
}
export function saveJourney(j) { writeStorage(LS_JOURNEY, j); }

export function xpForSession(entry) {
  if (entry.sessionType === "spa" || entry.session === "spa" || entry.spa) return 0;
  const moves = (entry.perExercise && entry.perExercise.length) ||
                entry.movesDone || entry.moves || 6;
  return moves * 10 + 40;
}

/* Level for a cumulative XP total, plus progress into the current level. */
export function levelFromXp(xp) {
  let level = 1, rem = xp;
  while (rem >= levelCost(level)) { rem -= levelCost(level); level++; }
  return { level, xpIntoLevel: rem, nextCost: levelCost(level) };
}

/* Add XP; returns { journey, leveledUp, levelsGained }. */
export function addXp(amount) {
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  const before = levelFromXp(j.xp).level;
  j.xp = Math.max(0, (j.xp || 0) + amount);
  const after = levelFromXp(j.xp).level;
  const gained = Math.max(0, after - before);
  if (gained > 0) j.pendingDraws = (j.pendingDraws || 0) + gained;
  saveJourney(j);
  return { journey: j, leveledUp: gained > 0, levelsGained: gained };
}

export function pendingDrawCount() {
  const j = loadJourney();
  return j ? Math.max(0, j.pendingDraws || 0) : 0;
}

export function addPrize(prize) {
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  j.prizesWon = [{ ...prize, date: todayISODate(), redeemed: false, id: Date.now() }, ...(j.prizesWon || [])];
  j.pendingDraws = Math.max(0, (j.pendingDraws || 0) - 1);
  saveJourney(j);
  return j;
}
export function redeemPrize(id) {
  const j = loadJourney();
  if (!j) return null;
  j.prizesWon = (j.prizesWon || []).map(p => p.id === id ? { ...p, redeemed: !p.redeemed } : p);
  saveJourney(j);
  return j;
}

/* One-time idempotent seeding: if the journey key is absent, walk the
   existing session history and award XP retroactively — nothing the kid
   earned ever vanishes. */
export function migrate() {
  // merge any new default settings keys into the saved blob
  settings = loadSettings();
  saveSettings();
  if (loadJourney() == null) {
    const xp = loadSessions().reduce((sum, s) => sum + xpForSession(s), 0);
    saveJourney({ xp, prizesWon: [], pendingDraws: 0, seededAt: Date.now() });
  }
}
