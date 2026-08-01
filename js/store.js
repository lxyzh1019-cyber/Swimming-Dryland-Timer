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
  // Default to effort/process praise (Dweck-aligned) rather than trait hype;
  // the louder "fun" persona stays available as an opt-in in Grown-up settings.
  voiceStyle: "encouraging",
  exerciseRestSeconds: 5,
  roundRestSeconds: 25,
  sectionRestSeconds: 30,   // NEW (block break; old app hardcoded 8s)
  secondsPerRep: 3,
  coachVoiceOn: true,       // NEW: design's 🎧 toggle gates ALL coach audio
  athleteName: "Jess",      // NEW: editable in Grown-up Settings
  prizePool: null,          // NEW: null = default PRIZE_POOL
  cloudMirror: true         // NEW: privacy — mirror completed sessions to Firestore
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

/* The athlete a record belongs to. Storage is still one bucket per browser, but
   the cloud mirror is shared, so every mirrored record is tagged and a restore
   only pulls back this athlete's own sessions. Records written before tagging
   existed belong to the original athlete — the mirror collection is literally
   named after her. */
export const LEGACY_ATHLETE = "Jess";
export function athleteId() {
  return String(settings.athleteName || LEGACY_ATHLETE).trim().toLowerCase();
}
export function belongsToAthlete(record) {
  const tag = record && record.athlete;
  if (!tag) return athleteId() === LEGACY_ATHLETE.toLowerCase();
  return String(tag).trim().toLowerCase() === athleteId();
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

/* Did this record earn the kid a day of training?
   Fully completed sessions always count. A session ENDED EARLY counts too, as
   long as real work happened (at least one non-skipped exercise) — the complete
   screen already promises "your progress is saved" and pays half XP, so the
   week strip and the streak must not then render the day as untouched.
   Records from before the flags existed are treated as done, matching the old
   app's `completedFully !== false` reading. */
export function countsAsTrained(s) {
  if (!s || s.practice) return false;
  if (s.completedFully) return true;
  if (s.completedFully === undefined && s.endedEarly === undefined) return true;
  return !!s.endedEarly && (s.perExercise || []).some(p => p && !p.skipped);
}
/* Trained, but not all the way through — rendered as a softer ✓. */
export function isPartialSession(s) { return countsAsTrained(s) && !s.completedFully; }

export function daysAgoCount(sessions, days) {
  const cutoff = Date.now() - days * DAY_MS;
  return sessions.filter(s => s.isoDate && new Date(s.isoDate).getTime() >= cutoff);
}
export function sumSecs(sessions) { return sessions.reduce((a, s) => a + (s.durationSecs || 0), 0); }

/* Streak "freeze": a single rest/missed day between active days does NOT break
   the run (a gap of 1 or 2 calendar days both continue it). This stops the
   streak from punishing a recovery day — which would otherwise pressure a kid
   to train while sore just to keep the flame, defeating the readiness system.
   ONE constant drives every streak rule: the gap between two active days, AND
   the gap between today and the most recent day. They used to disagree, so a
   Mon/Wed/Fri kid saw 🔥3 on Saturday and 🔥0 on Sunday — the same 2-day gap
   the freeze forgives everywhere else. */
export const STREAK_MAX_GAP = 2;

// Whole days between two Edmonton date strings (YYYY-MM-DD). Anchored at UTC
// noon so DST can never round a gap to the wrong integer.
function dayGap(fromISO, toISO) {
  return Math.round((new Date(toISO + "T12:00:00Z") - new Date(fromISO + "T12:00:00Z")) / DAY_MS);
}
// Unique active days, oldest first.
function activeDays(sessions) {
  return [...new Set(sessions.map(s => edmontonISO(s.isoDate)).filter(Boolean))].sort();
}

// Longest run of active days under the same freeze rule as currentStreak —
// otherwise "best" can read lower than the streak the kid is standing on.
export function longestStreak(sessions) {
  const days = activeDays(sessions);
  let best = 0, run = 0, prev = null;
  days.forEach(d => {
    const gap = prev ? dayGap(prev, d) : null;
    run = (gap !== null && gap >= 1 && gap <= STREAK_MAX_GAP) ? run + 1 : 1;
    prev = d; if (run > best) best = run;
  });
  return best;
}
// Current streak (Edmonton). Compares date STRINGS — Date objects here would
// mix UTC-parsed and local clocks and break the streak every morning.
export function currentStreak(sessions) {
  const days = activeDays(sessions);
  if (!days.length) return 0;
  const last = days[days.length - 1];
  // A rest day today is still inside the freeze — same gap rule as below.
  if (dayGap(last, todayISODate()) > STREAK_MAX_GAP) return 0;
  let streak = 1;
  let cur = last;
  for (let i = days.length - 2; i >= 0; i--) {
    const gap = dayGap(days[i], cur);
    if (gap >= 1 && gap <= STREAK_MAX_GAP) { streak++; cur = days[i]; } else break;
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

/* XP a stored record is worth. Prefers what was actually awarded at the time;
   falls back to the formula (halved for an ended-early session, matching
   finalize()) for records restored from the cloud or written before xpEarned
   existed. */
export function sessionXp(entry) {
  if (Number.isFinite(entry && entry.xpEarned)) return Math.max(0, entry.xpEarned);
  const full = xpForSession(entry || {});
  return entry && entry.completedFully === false ? Math.round(full / 2) : full;
}

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

/* Record that XP already granted through addXp() came from a session record
   (finalize, or the in-session quiz that patches xpEarned onto it). Keeps the
   reconcile baseline honest — without this, the next cloud restore would see
   the session log grow and award the same XP a second time. */
export function noteSessionXpAwarded(amount) {
  if (!amount) return;
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  j.sessionXp = (Number.isFinite(j.sessionXp) ? j.sessionXp : 0) + amount;
  saveJourney(j);
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

/* ============================================================
   RESTORE — merging a session history back in (from the Firestore
   mirror, or any other source). Local-first: nothing is ever
   overwritten, only missing records are added.
   ============================================================ */

/* Identity of a session record. isoDate is a full timestamp written once at
   finalize(), so it is unique per session in practice; dayKey guards the
   pathological case of two devices finalizing in the same millisecond. */
export function sessionKey(s) {
  return String(s && s.isoDate || "") + "|" + String(s && s.dayKey || "");
}

/* Fields that belong to the cloud copy, not to a local record. */
function stripCloudFields(doc) {
  const { id, createdAt, ...entry } = doc || {};
  return entry;
}

/* Add any incoming records the local log doesn't already have.
   Returns how many were added. */
export function mergeSessions(incoming) {
  const local = loadSessions();
  const seen = new Set(local.map(sessionKey));
  let added = 0;
  (incoming || []).forEach(doc => {
    const entry = stripCloudFields(doc);
    if (!entry.isoDate) return;
    const key = sessionKey(entry);
    if (seen.has(key)) return;
    seen.add(key);
    local.push(entry);
    added++;
  });
  if (added) {
    local.sort((a, b) => String(a.isoDate).localeCompare(String(b.isoDate)));
    writeStorage(LS_SESSIONS, local);
  }
  return added;
}

/* Keep the XP total consistent with the session log without double-counting
   quiz XP (which has no session record). The journey remembers how much of its
   XP came from sessions; when the log grows behind its back — a cloud restore —
   only the difference is awarded, and level-ups grant their prize draws as
   usual. First call just establishes the baseline and awards nothing.
   Returns the XP added. */
export function reconcileJourneyWithSessions() {
  const total = loadSessions().reduce((sum, s) => sum + sessionXp(s), 0);
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  if (!Number.isFinite(j.sessionXp)) {
    j.sessionXp = total;
    saveJourney(j);
    return 0;
  }
  const delta = total - j.sessionXp;
  if (delta <= 0) return 0;
  j.sessionXp = total;
  saveJourney(j);          // record the new baseline before awarding
  addXp(delta);            // re-reads the journey, so it keeps sessionXp
  return delta;
}

/* One-time idempotent seeding: if the journey key is absent, walk the
   existing session history and award XP retroactively — nothing the kid
   earned ever vanishes. */
export function migrate() {
  // merge any new default settings keys into the saved blob
  settings = loadSettings();
  saveSettings();
  if (loadJourney() == null) {
    const xp = loadSessions().reduce((sum, s) => sum + sessionXp(s), 0);
    saveJourney({ xp, prizesWon: [], pendingDraws: 0, seededAt: Date.now() });
  }
  // Establish the session-XP baseline BEFORE any cloud restore runs, so a
  // restore awards exactly the XP of the records it actually brings back.
  reconcileJourneyWithSessions();
}
