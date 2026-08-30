/* ============================================================
   STORE — localStorage persistence, settings, session log,
   events, journey (XP/levels/prizes) and one-time migration.
   Local-first; Firestore mirroring happens in the engine.
   ============================================================ */

import { DAY_MS, todayISODate, edmontonISO, edmontonWeekISODates } from "./util.js";
import { DAYS, PRIZE_POOL, levelCost, LADDER, RANK_LORE } from "./data.js";

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
export const LS_FORMCHECK     = "swim_form_check_v1";  // NEW: parent-verified form

const SKIP_RETENTION_MS  = 7 * 24 * 60 * 60 * 1000;
const EVENT_RETENTION_MS = 120 * 24 * 60 * 60 * 1000; // 120 days
const EVENT_CAP = 1500;

/* ============================================================
   PROFILES — one storage namespace per kid.

   Every key above is a BASE name. The first athlete keeps the bare
   keys, so nothing that already exists on a device moves or is
   orphaned; each additional athlete gets "<key>::<profileId>".
   The profile registry itself is never namespaced.
   ============================================================ */
export const PROFILES_KEY = "swim_profiles_v1";
export const LEGACY_PROFILE_ID = "legacy";

function readRaw(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeRaw(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { reportStorageError(key, e); return false; }
}

/* Registry: { active, list: [{ id, name }] }. Absent on an existing device —
   synthesized from whatever athlete name is already in settings. */
export function loadProfiles() {
  const p = readRaw(PROFILES_KEY, null);
  if (p && Array.isArray(p.list) && p.list.length) {
    const active = p.list.some(x => x.id === p.active) ? p.active : p.list[0].id;
    return { active, list: p.list };
  }
  // Literal rather than DEFAULT_SETTINGS: this runs at module init, before the
  // settings block below has been evaluated.
  const name = (readRaw(SETTINGS_KEY, {}) || {}).athleteName || "Jess";
  return { active: LEGACY_PROFILE_ID, list: [{ id: LEGACY_PROFILE_ID, name }] };
}
let _profiles = loadProfiles();

export function profileList() { return _profiles.list.slice(); }
export function activeProfileId() { return _profiles.active; }
export function activeProfile() {
  return _profiles.list.find(p => p.id === _profiles.active) || _profiles.list[0];
}

/* Storage key for the active profile (or an explicit one). */
function nsKey(key, profileId) {
  const id = profileId || _profiles.active;
  return id === LEGACY_PROFILE_ID ? key : key + "::" + id;
}

export function addProfile(name) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20)
    + "-" + Date.now().toString(36).slice(-4);
  _profiles = { active: _profiles.active, list: [..._profiles.list, { id, name: clean }] };
  writeRaw(PROFILES_KEY, _profiles);
  // Seed the new athlete's settings so the greeting is right from the first paint.
  writeRaw(nsKey(SETTINGS_KEY, id), { ...DEFAULT_SETTINGS, athleteName: clean });
  return id;
}
/* Switching swaps every storage namespace at once. Callers reload the page
   afterwards — module-level caches (settings, the session engine) all read
   from the old namespace otherwise. */
export function switchProfile(id) {
  if (!_profiles.list.some(p => p.id === id)) return false;
  _profiles = { ..._profiles, active: id };
  return writeRaw(PROFILES_KEY, _profiles);
}
export function renameProfile(id, name) {
  const clean = String(name || "").trim();
  if (!clean) return false;
  _profiles = { ..._profiles, list: _profiles.list.map(p => p.id === id ? { ...p, name: clean } : p) };
  return writeRaw(PROFILES_KEY, _profiles);
}

/* ============================================================
   READ / WRITE — namespaced, and loud when a write fails.
   ============================================================ */

/* A full localStorage is silent by default: setItem throws, the old empty
   catch dropped it, and the app happily said "Training complete" over a
   session that was never recorded. Now a failed write frees the expendable
   analytics blobs, retries once, and — if it still fails — tells the app so a
   grown-up sees a banner instead of losing work invisibly. */
const EXPENDABLE_KEYS = [LS_EVENTS, SKIP_HISTORY_KEY, LS_PRLOG];
let _storageErrorHandler = null;
let _lastStorageError = null;
export function onStorageError(fn) { _storageErrorHandler = fn; }
export function lastStorageError() { return _lastStorageError; }

function reportStorageError(key, error) {
  _lastStorageError = { key, message: String(error && error.message || error), at: Date.now() };
  console.error("Storage write failed:", key, error);
  try { if (_storageErrorHandler) _storageErrorHandler(_lastStorageError); } catch {}
}

/* Drop analytics-only keys to make room. Never touches sessions, XP or prizes.
   Returns true only if something was actually removed. */
function freeSpace(protectKey) {
  let freed = false;
  EXPENDABLE_KEYS.forEach(base => {
    if (base === protectKey) return;
    const k = nsKey(base);
    try {
      if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); freed = true; }
    } catch {}
  });
  return freed;
}

export function readStorage(key, fallback) {
  return readRaw(nsKey(key), fallback);
}
/* Returns whether the value actually reached storage. */
export function writeStorage(key, value) {
  const k = nsKey(key);
  let str;
  try { str = JSON.stringify(value); }
  catch (e) { reportStorageError(key, e); return false; }
  try { localStorage.setItem(k, str); return true; }
  catch (e) {
    if (freeSpace(key)) {
      try { localStorage.setItem(k, str); return true; } catch { /* still full */ }
    }
    reportStorageError(key, e);
    return false;
  }
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
  cloudMirror: true,        // NEW: privacy — mirror completed sessions to Firestore
  tryItArmed: false,        // NEW: try-it mode, armed for ONE run (see below)
  tryItArmedAt: 0
};

/* ---- try-it mode ----------------------------------------------------------
   A try-it run is for testing a movement and is deliberately never recorded.
   The flag used to live only in memory, which failed in both directions: a
   reload silently disarmed it (so a run meant as a demo was recorded for real),
   and nothing ever cleared it (so one forgotten arm threw away every session
   after it — she trains, finishes, and her streak doesn't move).

   So it is persisted AND one-shot: armed here, cleared the moment a run ends,
   and expired after two hours if it was armed and never used. */
export const TRY_IT_EXPIRY_MS = 2 * 60 * 60 * 1000;

export function tryItArmed() {
  if (!settings.tryItArmed) return false;
  const at = settings.tryItArmedAt || 0;
  if (at && Date.now() - at > TRY_IT_EXPIRY_MS) { clearTryIt(); return false; }
  return true;
}
export function setTryIt(on) {
  updateSettings(on ? { tryItArmed: true, tryItArmedAt: Date.now() }
                    : { tryItArmed: false, tryItArmedAt: 0 });
  return !!on;
}
export function clearTryIt() {
  if (!settings.tryItArmed && !settings.tryItArmedAt) return false;
  updateSettings({ tryItArmed: false, tryItArmedAt: 0 });
  return true;
}

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
  // Untagged records predate profiles; they belong to the athlete who was here
  // first — the one still on the bare storage keys.
  if (!tag) return activeProfileId() === LEGACY_PROFILE_ID;
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
/* Returns whether the record actually reached storage — a full quota must not
   look like a saved session. */
export function saveSession(entry) {
  const all = loadSessions();
  all.push(entry);
  return writeStorage(LS_SESSIONS, all);
}
/* Patch a specific session record (mood / reflection / pr live alongside
   lightResult — closes the readiness→outcome gap). Identified by sessionKey
   rather than array position: "the last one" is the wrong record as soon as a
   second session lands in between, which two kids on one device manage easily. */
export function patchSession(key, patch) {
  const all = loadSessions();
  if (!all.length) return false;
  const found = key ? all.findIndex(s => sessionKey(s) === key) : -1;
  const idx = found >= 0 ? found : all.length - 1;
  all[idx] = { ...all[idx], ...patch };
  return writeStorage(LS_SESSIONS, all);
}
export function patchLastSession(patch) { return patchSession(null, patch); }

export function thisWeekSessions() {
  // Edmonton's Mon–Sun week, like every other calendar grouping in the app.
  const weekIsoSet = new Set(Object.values(edmontonWeekISODates()));
  return loadSessions().filter(s => weekIsoSet.has(edmontonISO(s.isoDate)));
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

/* ---- day progress (same-day resume; No-Debt: partials never carry over) ----
   The No-Debt rule drops a partial when a NEW training day starts — but the
   calendar date alone can't tell those apart: a session begun at 23:40 and
   resumed at 00:10 is one bout, and keying purely on today's date threw the
   finished blocks away at midnight. A partial therefore also survives while
   it's still this fresh, whatever the date says. */
const DAY_PROGRESS_GRACE_MS = 6 * 60 * 60 * 1000;
function dayProgressKey(dayKey) { return `${dayKey}|${todayISODate()}`; }
function isFreshProgress(p, now) {
  return !!(p && p.savedAt && now - p.savedAt <= DAY_PROGRESS_GRACE_MS);
}
export function loadDayProgress(dayKey) {
  const all = readStorage(LS_DAYPROG, {});
  const exact = all[dayProgressKey(dayKey)];
  if (exact) return exact;
  const now = Date.now();
  let carried = null;
  Object.keys(all).forEach(k => {
    if (k.startsWith(dayKey + "|") && isFreshProgress(all[k], now)) carried = all[k];
  });
  return carried;
}
export function saveDayProgress(dayKey, p) {
  const all = readStorage(LS_DAYPROG, {});
  const today = todayISODate();
  const now = Date.now();
  Object.keys(all).forEach(k => {
    if (!k.endsWith("|" + today) && !isFreshProgress(all[k], now)) delete all[k];
  });
  all[dayProgressKey(dayKey)] = { ...p, savedAt: now };
  writeStorage(LS_DAYPROG, all);
}
export function clearDayProgress(dayKey) {
  const all = readStorage(LS_DAYPROG, {});
  // Every date bucket for this day — a bout that crossed midnight has two.
  Object.keys(all).forEach(k => { if (k.startsWith(dayKey + "|")) delete all[k]; });
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

/* Quiz blob. `items` is the per-MOVE mastery record the grown-up analytics
   reads. `qLedger` is the per-QUESTION XP ledger added alongside it: a move
   can be asked three ways (cue / watch-out / fix), so per-move records cannot
   tell "knows the cue" from "knows the fix" and are too coarse to price XP.
   `lastPaidISO` marks the day's one XP-paying deck. Old blobs are normalized
   on read, so existing mastery history survives untouched. */
export function loadQuiz() {
  const q = readStorage(LS_QUIZ, null) || {};
  return {
    items: q.items || {},
    results: q.results || [],
    streak: q.streak || 0,
    qLedger: q.qLedger || {},
    lastPaidISO: q.lastPaidISO || null,
    dayISO: q.dayISO || null,
    dayXp: q.dayXp || 0
  };
}
export function saveQuiz(q) { writeStorage(LS_QUIZ, q); }

/* ---- quiz XP economy ----------------------------------------------------
   XP pays for LEARNING, not for repetition. Three rules together:

   1. One paying deck per calendar day (`lastPaidISO`). Every later deck the
      same day is free practice worth 0 XP — still fully playable, and it never
      touches the ledger, so practising can't spend tomorrow's budget.
   2. Each QUESTION pays at most once, ever: +5 the first time it is attempted,
      +25 the first time it is answered correctly. A question first seen and
      missed still pays its +25 later, when it is finally learned. The two
      together are exactly one day's budget, so a brand-new question answered
      right pays in full in one go.
   3. A daily ceiling (`QXP_DAILY_CAP`) across ALL quiz XP — the deck and the
      Coach's Quiz share it — so even a day full of brand-new questions stays
      far under the LIGHTEST training day, not just under a full one. Questions are paid whole or not at all:
      once the day's budget can't cover the next one, its ledger entry is left
      untouched and it is still worth full value tomorrow.

   Why: the old rule was `score*25 + answered*10` per deck, with no cap, no
   cooldown and no memory. Because the deck reveals the correct answer after
   every pick, one honest pass taught the answers and every replay after that
   was a guaranteed 8/8 = 280 XP — a level's worth of XP in a few minutes of
   tapping, more than a whole training session. Worse, `answered*10` paid out
   even when every answer was wrong, so it rewarded tapping rather than
   knowing.

   Because the bank is finite, these rules make the quiz's LIFETIME yield
   finite and knowable, spread over at least (bank ÷ deck size) days by rule 1.
   Training stays the only open-ended way up the ladder. */
export const QXP_ATTEMPT = 5;    // once per question, first time attempted
export const QXP_CORRECT = 25;   // once per question, first time correct
/* One brand-new question a day (5 + 25). The lightest real training day — one
   round, or a mini — pays 180 XP, so the day's whole quiz budget is a sixth of
   it. The cap is deliberately measured against the EASY day, not the full one:
   those are the days a kid is most tempted to tap through a quiz instead of
   training, and they must still be worth far more than it. */
export const QXP_DAILY_CAP = 30;

export function quizQuestionKey(move, kind) { return move + "|" + kind; }

/* Quiz XP already banked today, across the deck and the Coach's Quiz. */
export function quizXpToday(quiz) {
  const q = quiz || loadQuiz();
  return q.dayISO === todayISODate() ? (q.dayXp || 0) : 0;
}
export function quizXpLeftToday(quiz) {
  return Math.max(0, QXP_DAILY_CAP - quizXpToday(quiz));
}

/* Every move the app can ask about, de-duplicated across the week. */
let _movePoolCache = null;
export function movePool() {
  if (_movePoolCache) return _movePoolCache;
  const seen = {}, pool = [];
  Object.values(DAYS).forEach(day => {
    const blocks = day.blocks || {}; const rec = day.recovery || [];
    [].concat(...Object.values(blocks), day.prepMenu || [], rec).forEach(ex => {
      if (!ex || !ex.name || seen[ex.name]) return; seen[ex.name] = true;
      pool.push({ name: ex.name, cue: ex.cue || "", watch: ex.parentWatch || "", fix: ex.redFlag || "", block: ex.block || "" });
    });
  });
  _movePoolCache = pool; return pool;
}

/* Ranks the swimmer has actually reached, as quiz topics. The Ocean Story is
   the best-read text in the app and nothing ever asked her about it; now the
   ladder itself teaches. Locked ranks are excluded on purpose — asking about a
   chapter she hasn't unlocked would spoil the mystery card AND quiz her on
   something she has never been shown. The pool therefore GROWS as she climbs,
   which is the point. */
export function rankPool(level) {
  const lvl = Number.isFinite(level) ? level : levelFromXp((loadJourney() || {}).xp || 0).level;
  return LADDER.filter(r => r.level <= lvl).map(r => {
    const lore = RANK_LORE[r.name] || {};
    return {
      name: "Rank: " + r.name,      // ledger key space of its own, never a move
      rank: r.name, icon: r.icon, block: "story",
      skill: lore.swim || "", fact: lore.fact || "", chapter: lore.chapter || ""
    };
  });
}

/* Every askable question: one per (topic, kind) that actually has content —
   the moves asked three ways, plus the unlocked ocean chapters asked two. */
export function questionBank(level) {
  const bank = [];
  movePool().forEach(m => {
    if (m.cue) bank.push([m, "cue"]);
    if (m.watch) bank.push([m, "watch"]);
    if (m.fix) bank.push([m, "fix"]);
  });
  rankPool(level).forEach(r => {
    if (r.skill) bank.push([r, "story"]);
    if (r.fact) bank.push([r, "fact"]);
  });
  return bank;
}

/* Has today's one paying deck already been completed? */
export function quizPaidToday(quiz) {
  return (quiz || loadQuiz()).lastPaidISO === todayISODate();
}

/* Price one answered question against the ledger and bank the XP it earns.
   Returns what it paid and why, so the caller can say so on screen. Callers
   are responsible for the once-a-day rule; the ledger itself only ever pays
   for something new. */
export function payQuizQuestion(key, correct, quiz) {
  const q = quiz || loadQuiz();
  const rec = q.qLedger[key] || { attempted: false, mastered: false };
  const wouldPay = (rec.attempted ? 0 : QXP_ATTEMPT) + (!rec.mastered && correct ? QXP_CORRECT : 0);
  // Nothing new to pay for: the question is spent, not capped.
  if (!wouldPay) return { xp: 0, firstSeen: false, newlyMastered: false, capped: false };
  // Over the day's ceiling: leave the ledger alone so the question keeps its
  // full value for tomorrow.
  if (wouldPay > quizXpLeftToday(q)) return { xp: 0, firstSeen: false, newlyMastered: false, capped: true };

  const firstSeen = !rec.attempted;
  const newlyMastered = !rec.mastered && !!correct;
  const spentToday = quizXpToday(q);   // read BEFORE rolling dayISO to today
  rec.attempted = true;
  if (newlyMastered) rec.mastered = true;
  q.qLedger[key] = rec;
  q.dayISO = todayISODate();
  q.dayXp = spentToday + wouldPay;
  if (!quiz) saveQuiz(q);        // caller-owned blobs are saved by the caller
  return { xp: wouldPay, firstSeen, newlyMastered, capped: false };
}

/* Mastery + remaining-XP snapshot over the whole bank. Feeds the kid's
   "moves mastered" line and the grown-up's quiz card. */
export function quizBankStatus(quiz) {
  const led = (quiz || loadQuiz()).qLedger || {};
  const bank = questionBank();   // unlocked ranks only, so this grows with her
  let mastered = 0, xpLeft = 0;
  bank.forEach(([m, k]) => {
    const rec = led[quizQuestionKey(m.name, k)] || {};
    if (rec.mastered) mastered++; else xpLeft += QXP_CORRECT;
    if (!rec.attempted) xpLeft += QXP_ATTEMPT;
  });
  return { total: bank.length, mastered, left: bank.length - mastered, xpLeft,
           xpTotal: bank.length * (QXP_ATTEMPT + QXP_CORRECT) };
}

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
   XP rules: a session pays a flat rate for the rounds trained
   (spa = 0); quiz pays for first-time learning only — see the
   quiz XP economy above.
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
  // Try-it rows exist only to carry a pain stop to the grown-up; they are not
  // training and must never reach the XP total on a rebuild.
  if (entry && entry.practice) return 0;
  if (Number.isFinite(entry && entry.xpEarned)) return Math.max(0, entry.xpEarned);
  const full = xpForSession(entry || {});
  return entry && entry.completedFully === false ? Math.round(full / 2) : full;
}

/* A session pays a flat rate for the rounds actually trained. The old rule
   (moves × 10 + 40, ignoring rounds) meant a red-light 1-round day paid the
   same as a full green 3-round day — showing up paid as well as working — and
   made the day's XP wobble with the move count of that weekday for no reason a
   kid could see. A 1-round day is worth half a 3-round day:

     1 round 180 XP   2 rounds 270 XP   3 rounds 360 XP

   A mini session is one shortened round, so it is priced as a 1-round day
   however the traffic light was set — otherwise "mini on a green day" would be
   the cheapest full-price session in the app.

   Only records written by this version are priced this way. Legacy rows keep
   the old formula, so a cloud restore re-awards what a session originally paid
   instead of re-pricing history. */
export const XP_VERSION = 4;
export const SESSION_XP = { 1: 180, 2: 270, 3: 360 };

export function sessionRounds(entry) {
  if (entry && entry.mini) return 1;
  return Math.min(3, Math.max(1, (entry && entry.roundsDone) || 1));
}

export function xpForSession(entry) {
  if (entry.sessionType === "spa" || entry.session === "spa" || entry.spa) return 0;
  if (entry.xpVersion !== XP_VERSION) {
    const moves = (entry.perExercise && entry.perExercise.length) ||
                  entry.movesDone || entry.moves || 6;
    return moves * 10 + 40;                       // legacy rows, unchanged
  }
  return SESSION_XP[sessionRounds(entry)];
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
  syncPendingDraws(j);
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

/* ---- prize draws ----------------------------------------------------------
   The rule the app promises a kid is "one prize per level you gain". That used
   to be banked as a running counter that every level-up incremented and every
   claim decremented — and a counter can be credited twice for the same level:

     · a wiped or second device rebuilt its XP from the cloud, saw the level
       climb from 1 to 17 in one boot, and credited 16 fresh draws for levels
       that were earned — and already cashed — somewhere else;
     · the counter travelled in the journey snapshot and merged with max(), so
       a stale cloud copy handed a spent draw straight back;
     · any downward XP correction (legacy re-pricing, a rebuild) let the same
       levels be climbed — and paid for — a second time.

   So a draw is no longer banked. It is DERIVED from two things that can only
   move up and that merge cleanly across devices: the level reached, and the
   prizes already in the wallet.

       draws earned  = level - 1        (level 1 has gained nothing yet)
       draws pending = earned - claimed

   Replaying a level-up now yields the same answer instead of another prize,
   and the wallet — which unions by id on every merge — is what says how many
   have been spent. j.pendingDraws is still written so anything reading the raw
   field (an older client reading our snapshot) sees the derived truth. */
export function drawsEarned(j) {
  return Math.max(0, levelFromXp((j && j.xp) || 0).level - 1);
}
export function drawsClaimed(j) {
  return ((j && j.prizesWon) || []).length;
}
export function pendingDrawsFor(j) {
  return Math.max(0, drawsEarned(j) - drawsClaimed(j));
}
/* The best level she has ever reached. Only ever moves UP, and merges with
   max() across devices, so it is the conservative floor for trimming: an XP
   total that dips — a thin session log, a legacy re-pricing, a partial sync —
   must never be grounds for deleting a prize she actually earned.

   Granting stays strict (derived from the CURRENT level, above); only the trim
   below consults this. Wrong-high here costs an untrimmed prize; wrong-low
   costs her a real one, so the asymmetry decides the direction. */
function notePeakLevel(j) {
  const now = levelFromXp((j && j.xp) || 0).level;
  j.maxLevelSeen = Math.max(j.maxLevelSeen || 1, now);
  return j.maxLevelSeen;
}
export function drawsEverEarned(j) {
  return Math.max(drawsEarned(j), (j && j.maxLevelSeen ? j.maxLevelSeen : 1) - 1);
}

/* Write the derived count onto the journey object (does not save). */
function syncPendingDraws(j) {
  notePeakLevel(j);
  j.pendingDraws = pendingDrawsFor(j);
  return j;
}

export function pendingDrawCount() {
  const j = loadJourney();
  return j ? pendingDrawsFor(j) : 0;
}

/* Prize ids must be unique across devices: the cloud merge unions wallets by
   id, so two prizes claimed in the same millisecond — or on two devices at
   once — used to collapse into one and silently lose a prize she had won. */
function prizeId() {
  // The athlete name is grown-up-editable free text and the id is rendered into
  // a data-arg attribute, so keep it to characters that can't break the markup.
  const who = athleteId().replace(/[^a-z0-9]/g, "").slice(0, 12) || "athlete";
  return [who, Date.now().toString(36), Math.random().toString(36).slice(2, 8)].join("-");
}

/* Claim one pending draw. Returns the journey unchanged when no draw is owed,
   so a double-tap on "Add to my prizes" — or any other second call — cannot
   turn one level-up into two prizes. */
export function addPrize(prize) {
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  if (pendingDrawsFor(j) < 1) { saveJourney(syncPendingDraws(j)); return j; }
  j.prizesWon = [{ ...prize, date: todayISODate(), redeemed: false, id: prizeId() }, ...(j.prizesWon || [])];
  saveJourney(syncPendingDraws(j));
  return j;
}
/* Redeeming is ONE-WAY, with a short undo for a mis-tap. It used to be a plain
   toggle, so tapping "✓ Used" a second time put the prize back in the pile and
   one prize could be spent forever. The window is enforced here rather than in
   the button, so a stale screen can't reopen a closed one. A prize redeemed
   before this rule existed has no redeemedAt and counts as locked. */
export const REDEEM_UNDO_MS = 5 * 60 * 1000;

export function prizeUndoOpen(p, now = Date.now()) {
  if (!p || !p.redeemed) return false;
  return Number.isFinite(p.redeemedAt) && (now - p.redeemedAt) < REDEEM_UNDO_MS;
}

export function redeemPrize(id) {
  const j = loadJourney();
  if (!j) return null;
  // Compare as strings: ids are strings now, but wallets written by earlier
  // versions still hold the old numeric Date.now() ids.
  j.prizesWon = (j.prizesWon || []).map(p => {
    if (String(p.id) !== String(id)) return p;
    if (!p.redeemed) return { ...p, redeemed: true, redeemedAt: Date.now() };
    if (prizeUndoOpen(p)) { const { redeemedAt, ...rest } = p; return { ...rest, redeemed: false }; }
    return p;                                   // window closed — stays used
  });
  saveJourney(j);
  return j;
}

/* ---- wallet reconcile -----------------------------------------------------
   Prizes handed out under the old double-granting logic leave the wallet
   holding more than the rule allows. Trim it to what her level actually
   earned: every prize she has already USED stays (you can't un-watch a movie
   night), then the oldest unredeemed ones, and the newest unredeemed excess
   comes off.

   Voided ids are REMEMBERED, not merely dropped. The cloud merge unions
   wallets by id, so a plain delete would be undone by the next sync from the
   other device. The voided list travels in the snapshot and is unioned too, so
   a trim on one device sticks everywhere.

   Only call this once XP is authoritative (after the cloud merge), never
   mid-boot against a stale total — see rebuildJourneyXp. */
export function reconcileWallet(j) {
  const wallet = j.prizesWon || [];
  const earned = drawsEverEarned(j);          // high-water, never the current dip
  if (wallet.length <= earned) return { journey: syncPendingDraws(j), removed: [] };

  const oldestFirst = wallet.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const keep = new Set();
  oldestFirst.forEach(p => { if (p.redeemed) keep.add(String(p.id)); });      // already spent in real life
  for (const p of oldestFirst) {
    if (keep.size >= earned) break;
    keep.add(String(p.id));                                                   // then oldest first
  }
  const removed = wallet.filter(p => !keep.has(String(p.id)));
  if (!removed.length) return { journey: syncPendingDraws(j), removed: [] };

  j.prizesWon = wallet.filter(p => keep.has(String(p.id)));
  j.voidedPrizeIds = [...new Set([...(j.voidedPrizeIds || []), ...removed.map(p => String(p.id))])];
  j.walletTrim = { at: Date.now(), count: removed.length };
  syncPendingDraws(j);
  logEvent("prize_voided", { count: removed.length, labels: removed.map(p => p.label).join(", ") });
  return { journey: j, removed };
}

/* The last trim, for the one-line note in the Grown-up zone. */
export function lastWalletTrim() {
  const j = loadJourney();
  return (j && j.walletTrim) || null;
}

/* Union two wallets by id, dropping anything either side has voided. */
function mergeWallets(a, b, voided) {
  const dead = new Set((voided || []).map(String));
  const out = new Map();
  [...(a || []), ...(b || [])].forEach(p => {
    if (!p || p.id == null) return;
    const k = String(p.id);
    if (dead.has(k) || out.has(k)) return;
    out.set(k, p);
  });
  return [...out.values()].sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
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

/* ---- journey convergence across devices ---------------------------------
   The skate app hit this first: the same kid read level 26 on the iPad and 18
   on the desktop. Both were honest — only SESSIONS were mirrored, so a wiped
   device rebuilt the training XP and nothing else, while the original still
   held quiz XP earned under the old uncapped rules on top of it.

   The fix, ported here so both sisters' apps behave identically, is to stop
   treating XP as a running total each device accumulates privately and treat
   it as DERIVED state:

       xp  =  what the training log is worth  +  what the quiz ledger is worth

   Both halves are mirrored, so every device computes the same number without
   anyone having to win an argument about whose total is right. It is also
   idempotent — rebuilding twice changes nothing — and un-farmable, because the
   ledger already pays each question exactly once. */

/* What the quiz ledger is worth, priced at the current rates. */
export function quizXpFromLedger(quiz) {
  const q = quiz || loadQuiz();
  let xp = 0;
  Object.values(q.qLedger || {}).forEach(rec => {
    if (!rec) return;
    if (rec.attempted) xp += QXP_ATTEMPT;
    if (rec.mastered) xp += QXP_CORRECT;
  });
  return xp;
}

/* Recompute the journey total from its two sources. Prizes already won are
   never touched. A rebuild does NOT grant draws for the levels it discovers:
   the same shared history rebuilds on every device, so crediting the climb
   here handed a second device — or one whose storage had been evicted — a
   fresh prize for every level the kid had already been paid for. Draws are
   derived from the level and the wallet instead. Returns the total. */
export function rebuildJourneyXp() {
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  const fromSessions = loadSessions().reduce((sum, s) => sum + sessionXp(s), 0);
  const fromQuiz = quizXpFromLedger();
  j.sessionXp = fromSessions;
  j.xp = fromSessions + fromQuiz;
  // Safe to trim here and nowhere earlier: sync.js runs mergeCloudJourney (which
  // restores the full wallet) BEFORE this, so the level and the wallet are both
  // final. Trimming mid-boot would void real prizes against a stale total.
  reconcileWallet(j);
  saveJourney(j);
  return j.xp;
}

/* The half of the journey the session log cannot re-derive: the quiz ledger
   (which prices itself) and the prize wallet. pendingDraws travels for the
   benefit of an older client still reading the raw field, but it is published
   as the DERIVED count and ignored on the way back in — a banked number that
   merges with max() is exactly how a spent draw used to come back to life. */
export function journeySnapshot() {
  const j = loadJourney() || {};
  const q = loadQuiz();
  return {
    kind: "journey",
    prizesWon: j.prizesWon || [],
    // Voided ids travel so a wallet trim on one device isn't undone by the
    // other device's copy coming back through the union below.
    voidedPrizeIds: j.voidedPrizeIds || [],
    maxLevelSeen: j.maxLevelSeen || levelFromXp(j.xp || 0).level,
    pendingDraws: pendingDrawsFor(j),
    qLedger: q.qLedger || {},
    quizItems: q.items || {},
    updatedAt: Date.now()
  };
}

/* Merge a cloud journey snapshot into this device. Everything moves UP: prize
   wallets union by id, and a question mastered anywhere counts as mastered
   everywhere, so the same learning can never be paid for twice. Returns true
   when something changed. */
export function mergeCloudJourney(snap) {
  if (!snap || snap.kind !== "journey") return false;
  let changed = false;

  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  j.maxLevelSeen = Math.max(j.maxLevelSeen || 1, snap.maxLevelSeen || 1);
  const voided = [...new Set([...(j.voidedPrizeIds || []), ...(snap.voidedPrizeIds || [])].map(String))];
  if (voided.length !== (j.voidedPrizeIds || []).length) changed = true;
  j.voidedPrizeIds = voided;
  const merged = mergeWallets(j.prizesWon, snap.prizesWon, voided);
  if (merged.length !== (j.prizesWon || []).length) changed = true;
  const before = j.pendingDraws || 0;
  j.prizesWon = merged;
  // Draws are derived, not merged: the unioned wallet already carries every
  // prize claimed on any device, so the count falls out of it.
  syncPendingDraws(j);
  if (j.pendingDraws !== before) changed = true;
  saveJourney(j);

  const q = loadQuiz();
  Object.entries(snap.qLedger || {}).forEach(([k, rec]) => {
    const cur = q.qLedger[k] || { attempted: false, mastered: false };
    const next = {
      attempted: !!(cur.attempted || (rec && rec.attempted)),
      mastered: !!(cur.mastered || (rec && rec.mastered))
    };
    if (next.attempted !== cur.attempted || next.mastered !== cur.mastered) changed = true;
    q.qLedger[k] = next;
  });
  Object.entries(snap.quizItems || {}).forEach(([move, rec]) => {
    const cur = q.items[move] || { right: 0, wrong: 0, seen: 0 };
    q.items[move] = {
      right: Math.max(cur.right || 0, (rec && rec.right) || 0),
      wrong: Math.max(cur.wrong || 0, (rec && rec.wrong) || 0),
      seen:  Math.max(cur.seen  || 0, (rec && rec.seen)  || 0)
    };
  });
  saveQuiz(q);
  return changed;
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

/* ============================================================
   PARENT FORM CHECK — the ground truth under every quality number.

   Clean %, quiz mastery and the Drop-and-Stick safety gate are all built
   on the kid's own word. So the app can be confidently wrong about her
   technique: she reports a move clean, it failed the written criteria,
   and nothing catches it.

   Every move already carries the exact fault to watch for and its fix
   (parentWatch / redFlag in data.js, 41 of them). This records what a
   grown-up actually SAW against those criteria, once a month, on a
   handful of moves — and that verdict outranks the self-report.
   ============================================================ */
export function monthKeyOf(d = new Date()) { return edmontonISO(d).slice(0, 7); }

export function loadFormChecks() {
  const fc = readStorage(LS_FORMCHECK, null);
  return fc && typeof fc === "object" ? { months: fc.months || {} } : { months: {} };
}
export function saveFormChecks(fc) { writeStorage(LS_FORMCHECK, fc); }

/* Record a verdict for one move in one month. A later verdict replaces an
   earlier one for the same move and month — you re-checked, that's the answer. */
export function recordFormVerdict(move, pass, month = monthKeyOf()) {
  if (!move) return null;
  const fc = loadFormChecks();
  const m = fc.months[month] || { moves: {} };
  m.moves[move] = { pass: !!pass, at: Date.now() };
  fc.months[month] = m;
  saveFormChecks(fc);
  logEvent("form_check", { move, pass: !!pass, month });
  return fc;
}
export function clearFormVerdict(move, month = monthKeyOf()) {
  const fc = loadFormChecks();
  const m = fc.months[month];
  if (!m || !m.moves[move]) return false;
  delete m.moves[move];
  saveFormChecks(fc);
  return true;
}
export function formVerdicts(month = monthKeyOf()) {
  return ((loadFormChecks().months[month] || {}).moves) || {};
}
/* Every verdict ever recorded, latest per move. */
export function latestFormVerdicts() {
  const fc = loadFormChecks();
  const out = {};
  Object.keys(fc.months).sort().forEach(mk => {
    Object.entries(fc.months[mk].moves || {}).forEach(([move, v]) => { out[move] = { ...v, month: mk }; });
  });
  return out;
}
/* Moves whose most recent verdict was a fail — these get re-taught and are
   pushed to the front of the next run's random spot-checks. */
export function flaggedMoves() {
  const latest = latestFormVerdicts();
  return Object.keys(latest).filter(m => latest[m] && latest[m].pass === false);
}

/* ============================================================
   BACKUP — a plain-JSON escape hatch for one athlete.

   The cloud mirror only carries sessions. This carries everything
   she owns (XP, prizes, quiz mastery, trackers, settings), so a
   grown-up can move a kid to a new device or keep a copy that no
   browser eviction can touch.
   ============================================================ */
export const BACKUP_APP = "splash-swim-dryland";
export const BACKUP_SCHEMA = 1;

/* Every key that belongs to an athlete. */
export const PROFILE_KEYS = [
  SETTINGS_KEY, PROGRESS_KEY, SKIP_HISTORY_KEY, ENGAGE_KEY, LS_READINESS, LS_DAYPROG,
  LS_LEARNING, LS_LADDER, LS_QUIZ, LS_GATE, LS_SESSIONS, LS_TRACKER, LS_EVENTS,
  LS_PRLOG, LS_JOURNEY, LS_FORMCHECK
];

/* True when nothing in the saved settings differs from the shipped defaults. */
function isDefaultSettings(saved) {
  if (!saved || typeof saved !== "object") return true;
  return Object.keys(DEFAULT_SETTINGS).every(k =>
    saved[k] === undefined || JSON.stringify(saved[k]) === JSON.stringify(DEFAULT_SETTINGS[k]));
}

export function exportProfileData() {
  const data = {};
  PROFILE_KEYS.forEach(k => {
    const v = readStorage(k, undefined);
    if (v !== undefined) data[k] = v;
  });
  return {
    app: BACKUP_APP, schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    profile: { id: activeProfileId(), name: settings.athleteName || LEGACY_ATHLETE },
    data
  };
}

/* Restore INTO the active athlete. Additive by design — a backup can only add
   to what's here, never delete or overwrite it:
     · sessions  — merged, deduped (same rule as the cloud restore)
     · journey   — higher XP total wins, prize wallets are unioned by id
     · the rest  — filled in only where this device has nothing
   Returns { sessionsAdded, xpAdded, filled: [keys] }. Throws on a file that
   isn't a Splash backup. */
export function importProfileData(payload) {
  if (!payload || payload.app !== BACKUP_APP || !payload.data || typeof payload.data !== "object") {
    throw new Error("That file isn't a Splash backup.");
  }
  if (Number(payload.schema) > BACKUP_SCHEMA) {
    throw new Error("That backup was made by a newer version of the app.");
  }
  const d = payload.data;
  const result = { sessionsAdded: 0, xpAdded: 0, filled: [] };

  if (Array.isArray(d[LS_SESSIONS])) result.sessionsAdded = mergeSessions(d[LS_SESSIONS]);

  const inc = d[LS_JOURNEY];
  if (inc && typeof inc === "object") {
    const local = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
    const voided = [...new Set([...(local.voidedPrizeIds || []), ...(inc.voidedPrizeIds || [])].map(String))];
    // pendingDraws is derived from the merged result, never max()'d in — a
    // backup taken before a prize was claimed would otherwise hand it back.
    const mergedJourney = {
      ...inc, ...local,
      xp: Math.max(local.xp || 0, inc.xp || 0),
      sessionXp: Math.max(
        Number.isFinite(local.sessionXp) ? local.sessionXp : 0,
        Number.isFinite(inc.sessionXp) ? inc.sessionXp : 0
      ),
      voidedPrizeIds: voided,
      maxLevelSeen: Math.max(local.maxLevelSeen || 1, inc.maxLevelSeen || 1),
      prizesWon: mergeWallets(local.prizesWon, inc.prizesWon, voided)
    };
    reconcileWallet(mergedJourney);          // XP has merged upward by here
    saveJourney(mergedJourney);
  }

  PROFILE_KEYS.forEach(k => {
    if (k === LS_SESSIONS || k === LS_JOURNEY || d[k] === undefined) return;
    // Settings are the exception to "fill only what's missing": migrate() always
    // writes them, so they'd never look missing. Untouched defaults count as
    // empty — a fresh device gets her name, rest times and prize pool back, and
    // anything a grown-up has actually changed here still wins.
    if (k === SETTINGS_KEY) {
      if (isDefaultSettings(readStorage(k, null))) { writeStorage(k, d[k]); result.filled.push(k); }
      return;
    }
    if (readStorage(k, null) === null) { writeStorage(k, d[k]); result.filled.push(k); }
  });

  result.xpAdded = reconcileJourneyWithSessions();
  return result;
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
