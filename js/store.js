/* ============================================================
   STORE — localStorage persistence, settings, session log,
   events, journey (XP/levels/prizes) and one-time migration.
   Local-first; Firestore mirroring happens in the engine.
   ============================================================ */

import { DAY_MS, todayISODate, edmontonISO, edmontonWeekISODates } from "./util.js";
import { DAYS, PRIZE_POOL, levelCost, LADDER, RANK_LORE } from "./data.js";
import { outcomeOf, deriveSessionOutcome, OUTCOME_VERSION } from "./outcome.js";

/* ---- keys (unchanged from the old app unless noted) ---- */
export const SETTINGS_KEY     = "swimTrainingSettingsV2";
export const PROGRESS_KEY     = "swimTrainingProgressV2";
export const SKIP_HISTORY_KEY = "swimTrainingSkipHistoryV2";
export const ENGAGE_KEY       = "swimEngagementPickV2";
export const LS_READINESS     = "swim_readiness";      // v2 schema (4-Q + body map)
export const LS_READINESS_LOG = "swim_readiness_log_v1"; // every check, kept as history
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
  // Keep the outgoing name as an alias: records already mirrored under it must
  // keep matching, or a rename silently orphans the whole history.
  const prev = _profiles.list.find(p => p.id === id);
  if (prev && prev.name) rememberAthleteAlias(id, prev.name);
  _profiles = { ..._profiles, list: _profiles.list.map(p => p.id === id ? { ...p, name: clean } : p) };
  const okWrite = writeRaw(PROFILES_KEY, _profiles);
  // The new name too: a device still running the old build tags its records
  // with whatever name it sees, so both must keep matching.
  rememberAthleteAlias(id, clean);
  return okWrite;
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
  /* How fast the coach talks, chosen separately from how she sounds — see
     VOICE_SPEED in js/audio.js. Slow by default: speed used to be baked into
     the personality, so the app had no genuinely slow voice to offer a child
     who needed one. A grown-up can set it to Normal in Coaching settings. */
  voiceSpeed: "slow",
  exerciseRestSeconds: 5,
  roundRestSeconds: 25,
  sectionRestSeconds: 30,   // NEW (block break; old app hardcoded 8s)
  secondsPerRep: 3,
  coachVoiceOn: true,       // legacy single switch — migrated into the three below
  coachSpeechOn: true,      // the coach's spoken cues and encouragement
  timerSoundsOn: true,      // beeps, rep ticks, round/rest cues
  safetyVoiceOn: true,      // pain checks, safety stops, form warnings
  athleteName: "Jess",      // NEW: editable in Grown-up Settings
  prizePool: null,          // NEW: null = default PRIZE_POOL
  cloudMirror: true         // NEW: privacy — mirror completed sessions to Firestore
};

/* ---- looking at the moves is not a mode -----------------------------------
   Try-It used to be ARMED: a grown-up flipped a persistent setting, and while
   it was on, GO opened the move list instead of starting a workout. The flag
   went through several repairs — it lived only in memory, so a reload disarmed
   it silently; then nothing cleared it, so one forgotten arm threw away every
   session after it; then it expired after two hours.

   None of that is needed to read an instruction. Every launchable day now has
   its own "Explore the moves" button straight to the list, GO always means GO,
   and there is no state to leave switched on. The settings keys are gone with
   it; an old saved value simply goes unread.  */

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

/* ---- who a record belongs to ----------------------------------------------
   The cloud mirror is shared between the athletes, so every mirrored record is
   tagged. That tag used to be the athlete's NAME, lowercased — and the name is
   free text a grown-up can edit in Settings. Renaming "Jess" to "Jessica"
   therefore cut the profile off from every record it had ever written, and two
   profiles that happened to share a name merged into one history.

   The tag is the PROFILE ID now, which is generated once and never changes.
   Records written under the old scheme are still matched, because each profile
   remembers every name it has been tagged under. */
export const LEGACY_ATHLETE = "Jess";

export function athleteId() { return String(activeProfileId()); }

/* Every tag this profile's records might legitimately carry: the immutable id,
   plus the names it was known by before ids were used. */
export function athleteAliases(profileId) {
  const id = profileId || activeProfileId();
  const p = _profiles.list.find(x => x.id === id);
  const out = [String(id).trim().toLowerCase()];
  const add = v => {
    const s = String(v == null ? "" : v).trim().toLowerCase();
    if (s && !out.includes(s)) out.push(s);
  };
  ((p && p.aliases) || []).forEach(add);
  if (id === LEGACY_PROFILE_ID) add(LEGACY_ATHLETE);   // the original, pre-profiles athlete
  // A NAME claimed by more than one profile identifies nobody. Two sisters both
  // called Jessica would otherwise pull each other's pre-id records back.
  const contested = new Set();
  _profiles.list.forEach(x => {
    if (x.id === id) return;
    [x.name, ...(x.aliases || [])].forEach(v => {
      const t = String(v == null ? "" : v).trim().toLowerCase();
      if (t) contested.add(t);
    });
  });
  return out.filter((v, i) => i === 0 || !contested.has(v));
}

export function belongsToAthlete(record) {
  const tag = record && record.athlete;
  // Untagged records predate profiles; they belong to the athlete who was here
  // first — the one still on the bare storage keys.
  if (!tag) return activeProfileId() === LEGACY_PROFILE_ID;
  return athleteAliases().includes(String(tag).trim().toLowerCase());
}

/* Record a name this profile has answered to, so records tagged with it keep
   matching after a rename. */
export function rememberAthleteAlias(profileId, name) {
  const clean = String(name == null ? "" : name).trim().toLowerCase();
  if (!clean) return false;
  const id = profileId || activeProfileId();
  const p = _profiles.list.find(x => x.id === id);
  if (!p || String(id).toLowerCase() === clean) return false;
  const aliases = p.aliases || [];
  if (aliases.includes(clean)) return false;
  _profiles = { ..._profiles, list: _profiles.list.map(x => x.id === id ? { ...x, aliases: [...aliases, clean] } : x) };
  return writeRaw(PROFILES_KEY, _profiles);
}

/* One-time: seed the alias list from the name each profile currently answers
   to, and retag this profile's own local rows onto the immutable id. */
export function migrateAthleteIdentity() {
  const id = activeProfileId();
  const p = _profiles.list.find(x => x.id === id);
  rememberAthleteAlias(id, (p && p.name) || "");
  rememberAthleteAlias(id, settings.athleteName || "");
  const known = athleteAliases(id);
  const rows = loadSessions();
  let retagged = 0;
  rows.forEach(r => {
    if (!r || !r.athlete) return;
    const tag = String(r.athlete).trim().toLowerCase();
    if (tag === String(id).toLowerCase()) return;
    if (!known.includes(tag)) return;              // someone else's row — leave it alone
    r.athlete = String(id);
    retagged++;
  });
  if (retagged) writeStorage(LS_SESSIONS, rows);
  return retagged;
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
  return outcomeOf(s).countsAsTraining;
}
/* Trained, but not all the way through — rendered as a softer ✓. */
export function isPartialSession(s) { return outcomeOf(s).state === "partial"; }

/* Whether a session earns a STREAK day, which is a stricter question than
   whether she trained — see js/outcome.js. The streak used to be filtered on
   countsAsTrained, so one recorded move kept the flame; countsForStreak was
   computed right next to it and read by nobody. */
export function countsForStreak(s) {
  if (!s || s.practice) return false;
  return outcomeOf(s).countsForStreak;
}

/* Whether a session HOLDS the streak without adding to it — a finished recovery
   pass. Care is not training, so it cannot pay into a training streak; but the
   day she reports soreness honestly must not be the day the flame goes out. */
export function freezesStreak(s) {
  if (!s || s.practice) return false;
  return outcomeOf(s).streakFreeze;
}

/* The dates those passes cover, ready to hand to currentStreak/longestStreak. */
export function streakFreezeDates(sessions) {
  return new Set((sessions || []).filter(freezesStreak)
    .map(s => edmontonISO(s.isoDate)).filter(Boolean));
}

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
// Same UTC-noon anchoring as dayGap, for the same DST reason.
function shiftISO(iso, days) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/* Is every day BETWEEN these two a freeze day? STREAK_MAX_GAP forgives a rest
   day or two on its own; this forgives a run of honest recovery of any length,
   because the alternative is that a sore week reads exactly like a week off —
   which is the pressure the traffic light exists to remove. */
function allFrozenBetween(fromISO, toISO, freeze) {
  if (!freeze || !freeze.size) return false;
  const gap = dayGap(fromISO, toISO);
  if (gap < 1) return false;
  for (let i = 1; i < gap; i++) if (!freeze.has(shiftISO(fromISO, i))) return false;
  return true;
}
// One rule, used by both streak functions: adjacent enough, or bridged by care.
function gapHolds(fromISO, toISO, freeze) {
  const gap = dayGap(fromISO, toISO);
  return gap >= 1 && (gap <= STREAK_MAX_GAP || allFrozenBetween(fromISO, toISO, freeze));
}

// Longest run of active days under the same freeze rule as currentStreak —
// otherwise "best" can read lower than the streak the kid is standing on.
export function longestStreak(sessions, freezeDays = null) {
  const days = activeDays(sessions);
  const freeze = freezeDays instanceof Set ? freezeDays : new Set(freezeDays || []);
  let best = 0, run = 0, prev = null;
  days.forEach(d => {
    run = (prev !== null && gapHolds(prev, d, freeze)) ? run + 1 : 1;
    prev = d; if (run > best) best = run;
  });
  return best;
}
// Current streak (Edmonton). Compares date STRINGS — Date objects here would
// mix UTC-parsed and local clocks and break the streak every morning.
export function currentStreak(sessions, freezeDays = null) {
  const days = activeDays(sessions);
  if (!days.length) return 0;
  const freeze = freezeDays instanceof Set ? freezeDays : new Set(freezeDays || []);
  const last = days[days.length - 1];
  const today = todayISODate();
  // A rest day today is still inside the freeze — same gap rule as below, plus
  // the care days themselves, so a stretch of recovery holds rather than ends.
  if (dayGap(last, today) > STREAK_MAX_GAP && !allFrozenBetween(last, today, freeze)) return 0;
  let streak = 1;
  let cur = last;
  for (let i = days.length - 2; i >= 0; i--) {
    if (!gapHolds(days[i], cur, freeze)) break;
    streak++; cur = days[i];
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

/* ---- the readiness LOG ------------------------------------------------------
   `LS_READINESS` holds ONE check — the latest — because that is all the session
   about to start needs. That made the body map a control and nothing else: the
   next morning's check overwrote the zones she marked, so "left shoulder, three
   days running" was never a thing the app could notice or a grown-up could see.

   This log is the record. It keeps every check, green ones included, and it is
   append-only: a check is a thing that happened, not a value to overwrite. */
const READINESS_LOG_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;  // a full season
const READINESS_LOG_CAP = 500;

/* Is there anything on this check worth a grown-up's attention? Any marked
   zone, or any answer set that did not come out green. An all-green check is
   still logged — it is what makes a trend readable — but it is the one shape
   that never leaves the device. */
export function isAbnormalCheck(check) {
  if (!check) return false;
  const worst = Math.max(0, ...Object.values(check.zoneSev || {}).map(Number).filter(Number.isFinite));
  if (worst >= 2) return true;
  return (check.suggestedLight || check.light || "green") !== "green";
}

export function loadReadinessLog() {
  const cutoff = Date.now() - READINESS_LOG_RETENTION_MS;
  return readStorage(LS_READINESS_LOG, []).filter(r => r && (r.at || 0) >= cutoff);
}

function writeReadinessLog(rows) {
  const trimmed = rows.slice(Math.max(0, rows.length - READINESS_LOG_CAP));
  writeStorage(LS_READINESS_LOG, trimmed);
  return trimmed;
}

export function appendReadinessLog(check) {
  const row = {
    at: Date.now(),
    answers: { ...(check.answers || {}) },
    zoneSev: { ...(check.zoneSev || {}) },
    severity: check.severity ?? null,
    suggestedLight: check.suggestedLight || check.light || "green",
    finalLight: check.light || null,
    wasOverridden: !!check.overridden,
    resultSource: check.resultSource || null,
    abnormal: isAbnormalCheck(check)
  };
  writeReadinessLog([...loadReadinessLog(), row]);
  return row;
}

/* The check is saved BEFORE the session starts, so what actually ran is known
   only afterwards. Stamp it onto the newest row rather than writing a second. */
export function stampReadinessOutcome(finalLight, wasOverridden) {
  const rows = loadReadinessLog();
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  last.finalLight = finalLight || last.finalLight;
  last.wasOverridden = !!wasOverridden;
  writeReadinessLog(rows);
  return last;
}

/* Rows pulled back from the other device. Keyed on `at`, which is a millisecond
   stamp from the device that wrote it — two checks cannot share one. */
export function mergeReadinessLog(remoteRows) {
  const seen = new Set(loadReadinessLog().map(r => r.at));
  const added = (remoteRows || []).filter(r => r && Number.isFinite(r.at) && !seen.has(r.at));
  if (!added.length) return 0;
  const all = [...loadReadinessLog(), ...added].sort((a, b) => a.at - b.at);
  writeReadinessLog(all);
  return added.length;
}

export function saveReadiness(check) {
  writeStorage(LS_READINESS, { version: 2, when: Date.now(), ...check });
  appendReadinessLog(check);
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

/* ---- valgus gate ----------------------------------------------------------
   The gate held a bare `cleanCount` that the engine bumped whenever
   Drop-and-Stick merely wasn't skipped, while the Grown-up screen promised
   "5/5 clean ×2 weeks". Two sessions in one afternoon could open a gate meant
   to take a fortnight. It banks WEEKS now, and only for a session where the
   move was actually done AND self-checked clean. */
export const GATE_WEEKS_REQUIRED = 2;
export const GATE_MOVE = "Drop-and-Stick";

/* ---- the grown-up PIN ------------------------------------------------------
   The secret behind every grown-up decision in the app (js/gate.js).

   Deliberately stored OUTSIDE the per-athlete namespace and OUTSIDE
   PROFILE_KEYS, for three separate reasons:

     · Device-level, not per-athlete. "Is a grown-up here?" is a fact about the
       person holding the phone, not about whose training is on screen — a PIN
       that lived per profile would be bypassed by switching athlete.
     · Never exported. PROFILE_KEYS is what downloadBackup() writes into a JSON
       file the child can open; a PIN in there is a PIN she can simply read.
     · Never mirrored. Only session records go to Firestore, and this is not one.

   The stored value is a salted digest, not the PIN. Be honest about what that
   buys: localStorage is readable from devtools and the digest is not
   cryptographic. It stops a curious 10-year-old from reading the PIN over her
   parent's shoulder in the stored data — which is the actual threat model. It
   would not stop an adult who wanted in, and it is not meant to. */
export const LS_GROWNUP_PIN     = "swim_grownup_pin_v1";       // NOT in PROFILE_KEYS — see above
export const LS_GROWNUP_PASSKEY = "swim_grownup_passkey_v1";  // likewise

/* Device-level storage: no profile namespace, and never in PROFILE_KEYS, so
   neither exportProfileData() nor the Firestore mirror can carry it. Both the
   PIN digest and the passkey credential id live here. */
export function readDeviceKey(key, fallback) { return readRaw(key, fallback); }
export function writeDeviceKey(key, value) { return writeRaw(key, value); }
export function clearDeviceKey(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

/* A small non-cryptographic digest (FNV-1a, salted). See the caveat above. */
function pinDigest(pin, salt) {
  const s = String(salt) + ":" + String(pin);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // A second pass over the reversed string, so two PINs that differ only in
  // digit order don't collide as readily as one pass would allow.
  for (let i = s.length - 1; i >= 0; i--) {
    h ^= s.charCodeAt(i) * 31;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const PIN_MIN_DIGITS = 4;
export const PIN_MAX_DIGITS = 8;

/* A PIN must be digits only and long enough not to be guessed in three tries. */
export function isValidPinFormat(pin) {
  return new RegExp("^\\d{" + PIN_MIN_DIGITS + "," + PIN_MAX_DIGITS + "}$").test(String(pin || "").trim());
}

export function hasGrownupPin() {
  const rec = readDeviceKey(LS_GROWNUP_PIN, null);
  return !!(rec && rec.hash && rec.salt);
}

/* Returns false (and stores nothing) for a PIN that isn't 4–8 digits. */
export function setGrownupPin(pin) {
  const clean = String(pin || "").trim();
  if (!isValidPinFormat(clean)) return false;
  const salt = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return writeDeviceKey(LS_GROWNUP_PIN, { hash: pinDigest(clean, salt), salt, setAt: Date.now() });
}

export function verifyGrownupPin(pin) {
  const rec = readDeviceKey(LS_GROWNUP_PIN, null);
  if (!rec || !rec.hash || !rec.salt) return false;
  return pinDigest(String(pin || "").trim(), rec.salt) === rec.hash;
}

/* Used by the "Forgot PIN" path, which clears the old one so a new one can be
   set. Never called from anything the child can reach without the fallback. */
export function clearGrownupPin() { return clearDeviceKey(LS_GROWNUP_PIN); }

export function loadGate() {
  const g = readStorage(LS_GATE, { unlocked: false, cleanWeeks: [] });
  if (!Array.isArray(g.cleanWeeks)) g.cleanWeeks = [];
  return g;
}
export function saveGate(g) { writeStorage(LS_GATE, g); }
export function gateLocked() { return !loadGate().unlocked; }
export function gateCleanWeeks() { return loadGate().cleanWeeks.length; }

/* The old bare counter can't say WHICH weeks were clean, and it was inflated by
   sessions that only had to not-skip the move. Credit at most one week for it
   so real progress isn't wiped, and let the new rule earn the rest. */
export function migrateGateWeeks() {
  const g = readStorage(LS_GATE, null);
  if (!g || g.cleanWeeks || g.cleanCount == null) return false;
  const carried = g.cleanCount > 0 && !g.unlocked ? [weekKeyFor(new Date())] : [];
  const { cleanCount, ...rest } = g;
  writeStorage(LS_GATE, { ...rest, cleanWeeks: g.unlocked ? [] : carried });
  return true;
}

/* Credit this session's week toward the gate, if it earned it. Returns the
   gate. Unlocking is automatic once the two weeks are banked. */
export function creditValgusWeek(entry) {
  const rows = (entry && entry.ledger) || [];
  const didIt = rows.some(l => l && l.name === GATE_MOVE && l.status === "done");
  const wasClean = (entry.formChecks || []).some(f => f && f.name === GATE_MOVE && f.clean);
  // A grown-up who watched the move fail outranks her own self-report — that
  // verdict is the whole reason the monthly form check exists.
  const parentSaysNo = flaggedMoves().includes(GATE_MOVE);
  if (!didIt || !wasClean || parentSaysNo) return loadGate();
  const g = loadGate();
  const week = weekKeyFor(new Date(entry.isoDate || Date.now()));
  if (!g.cleanWeeks.includes(week)) g.cleanWeeks.push(week);
  g.cleanWeeks = g.cleanWeeks.slice(-8);
  if (g.cleanWeeks.length >= GATE_WEEKS_REQUIRED) g.unlocked = true;
  saveGate(g);
  return g;
}

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
  // Try-it rows are not training (older histories may still hold some) and must
  // never reach the XP total on a rebuild.
  if (entry && entry.practice) return 0;
  // xpEarned is the SESSION's XP and nothing else. Quiz XP is priced by the
  // quiz ledger and rides on the record as its own field, because
  // rebuildJourneyXp adds the ledger to the session log — a row that folded
  // the two together was counted twice on every rebuild (360 + 30 came back
  // as 420). migrateQuizXp() splits the historic rows that did.
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
export const XP_VERSION = 5;
export const SESSION_XP = { 0: 90, 1: 180, 2: 270, 3: 360 };
export const XP_PER_ROUND = 90;
export const XP_SHOWED_UP = 90;

/* Main rounds a record actually finished. v4 and earlier stored the rounds the
   LIGHT ASKED FOR here, so an ended-early session claimed a full green day. */
export function sessionRounds(entry) {
  if (!entry) return 0;
  if (entry.xpVersion !== XP_VERSION) {
    // Legacy rows: roundsDone was the plan, so read it as the plan.
    if (entry.mini) return 1;
    return Math.min(3, Math.max(1, entry.roundsDone || 1));
  }
  /* THE LEDGER PRICES THE SESSION, not the engine's bare counter.
     `entry.roundsDone` is a number the engine wrote and nothing can re-check,
     and it was written at the wrong moment: a round finished and then
     interrupted during its rest was saved as zero, so a full Thursday was priced
     at the 90 XP show-up credit alone. outcomeOf reads the rows instead — the
     same authority the finish screen, the streak and the parent reports use, so
     the number she is paid and the number she is shown cannot disagree.

     Still capped by what the day asked for: you cannot finish more rounds than
     were on offer, and a mini is one round however the traffic light was set. */
  return Math.min(sessionRoundsPlanned(entry),
                  Math.max(0, outcomeOf(entry).mainRoundsDone || 0));
}

/* Rounds THIS SITTING was asked for — the ceiling on what one row may be paid.

   On a resume this is a REMAINDER: a green day with one round already banked
   asks its second sitting for two. That is the right number for capping a row,
   and the wrong number for every sentence that begins "today" — which is what
   dayRoundsPlanned below is for. */
export function sessionRoundsPlanned(entry) {
  if (!entry) return 0;
  if (entry.sessionType === "recovery" || entry.sessionType === "spa") return 0;
  if (entry.mini || entry.sessionType === "mini") return 1;
  if (Number.isFinite(entry.roundsPlanned)) return Math.min(3, Math.max(0, entry.roundsPlanned));
  return Math.min(3, Math.max(1, entry.roundsDone || 1));
}

/* Rounds THE DAY asked for, whatever it took to get through them.

   One number answered both questions until now, and the remainder won, so a day
   trained in two goes was reported against leftovers at both ends: the finish
   screen said "2 of 2 main rounds" for a full green day, and the grown-up tiles
   ADDED the two sittings' asks — 3 and 2 — and scored a finished day 3 of 5.

   Rows written before this carry no day plan, so they fall back to the sitting's
   own ask, which is exactly how they read today. On a first sitting the two are
   the same number anyway; only a resume can tell them apart. */
export function dayRoundsPlanned(entry) {
  if (!entry) return 0;
  if (entry.sessionType === "recovery" || entry.sessionType === "spa") return 0;
  if (entry.mini || entry.sessionType === "mini") return 1;
  if (Number.isFinite(entry.dayRoundsPlanned)) {
    return Math.min(3, Math.max(0, entry.dayRoundsPlanned));
  }
  return sessionRoundsPlanned(entry);
}

/* Rounds a SET of sessions was asked for, counting each real day once.

   Both the grown-up analytics tile and the progress period stats summed the
   per-row ask, which double-counts a day trained in two goes: the first sitting
   stores the full three, the resume stores the two it had left, and a day that
   asked for three is scored out of five. A finished green day read 3 / 5 and
   60% adherence to the grown-up who was checking whether it got done.

   So the plan is rolled up by the REAL DATE — the same unit the XP budget is
   keyed by (see dayXpKey) — taking the largest ask any row on that date
   declares. Largest, not first: a date carrying both a recovery pass (0) and a
   training session (3) asked for three, and a legacy row falling back to its
   sitting's ask must never shrink a date a newer row can describe properly. */
export function plannedRoundsAcrossDays(sessions) {
  const byDate = new Map();
  (sessions || []).forEach(s => {
    if (!s) return;
    const k = edmontonISO(s.isoDate);
    byDate.set(k, Math.max(byDate.get(k) || 0, dayRoundsPlanned(s)));
  });
  let total = 0;
  byDate.forEach(v => { total += v; });
  return total;
}

/* Did any real work happen? Delegated to the one outcome authority — this used
   to count only `done` rows, so a session of 7-of-8 reps on every move read as
   nothing at all. See js/outcome.js. */
export function sessionHadRealWork(entry) {
  return outcomeOf(entry).meaningfulWork;
}
const didRealWork = sessionHadRealWork;

/* Re-exported so every view-model reads the one authority through the store
   it already imports, instead of re-deriving completion for itself. */
export { outcomeOf, deriveSessionOutcome, OUTCOME_VERSION };

/* XP a session is worth: showing up and doing real work pays the base, and
   every MAIN ROUND actually finished pays another. Nothing done pays nothing,
   and a safety stop pays nothing at all. */
export function xpForSession(entry) {
  if (!entry) return 0;
  if (entry.sessionType === "spa" || entry.session === "spa" || entry.spa) return 0;
  if (entry.safetyStop) return 0;
  if (entry.xpVersion !== XP_VERSION) {
    if (entry.xpVersion === 4) return SESSION_XP[sessionRounds(entry)];
    const moves = (entry.perExercise && entry.perExercise.length) ||
                  entry.movesDone || entry.moves || 6;
    return moves * 10 + 40;                       // older rows, unchanged
  }
  // A weekday that resolved to Recovery is care, not a workout. It pays the
  // flat show-up credit and no round XP: reporting soreness honestly must never
  // cost her, or the readiness check becomes something to lie to. It still buys
  // no training day, no streak and no adherence (see js/outcome.js).
  // Sunday's scheduled spa day is unchanged at 0 above — it was never a
  // training day she gave up.
  if (entry.sessionType === "recovery") return XP_SHOWED_UP;
  // The authority decides what is payable, not a bare "was there a done row".
  // A practice / try-it row can carry a full ledger and must still pay nothing.
  if (!outcomeOf(entry).xpEligible) return 0;
  if (!didRealWork(entry)) return 0;
  return XP_SHOWED_UP + XP_PER_ROUND * sessionRounds(entry);
}

/* ---- one training day pays for one training day --------------------------
   Pricing on rounds actually finished is necessary but not sufficient: a
   partial that finished one round (180) plus the resumed run that finished the
   other two (270) still adds to 450 for a 360 day. So the day itself carries a
   budget, and a session can only draw what is left in it. */
const DAY_XP_RETENTION = 60;                       // days of budget rows kept

/* The ceiling is the DAY's, which is what the name says and what the budget is
   keyed by. It used to be the sitting's: harmless while the first sitting's row
   is on the device, because the cap is the largest any row for the date claims —
   and an under-payment when it is not, which is the ordinary case for a day
   started on the tablet and finished on the phone. */
export function dayXpCap(entry) {
  return XP_SHOWED_UP + XP_PER_ROUND * dayRoundsPlanned(entry);
}

/* The budget belongs to the REAL DAY, not to the weekday card that was run.
   The key used to be `dayKey|date`, which gave every weekday card its own
   budget on the same date — and running two cards on one date is a single tap:
   "Catch Up Now" on a missed day and "Start Early" on an upcoming one both hand
   the engine a different dayKey. Monday's catch-up plus Tuesday's card on a
   Tuesday paid 720 XP for one day of training.

   No profile in the key: the journey doc is already stored per athlete
   (see nsKey), so two athletes on one device never share these rows. */
function dayXpKey(entry) {
  return edmontonISO(entry.isoDate || Date.now());
}

/* A budget row is { spent, cap }. Rows written before the key changed were a
   bare number under the old `dayKey|date` key — they can never match a new key,
   so they age out over the 60-day retention rather than being migrated. The
   number form is still read because one can arrive from an older BACKUP
   restored onto a device with no journey of its own (restoreBackup keeps the
   local journey where there is one, so this is the fresh-device case).

   The budget is device-local: journeySnapshot does not carry it, so two devices
   finalizing sessions on the same date each grant their own. That gap predates
   this key and is not closed here — closing it needs the spend derived from the
   synced log rather than banked per device. */
function dayXpRow(map, key) {
  const raw = map && map[key];
  if (typeof raw === "number") return { spent: raw, cap: 0 };
  if (raw && typeof raw === "object") {
    return { spent: Number(raw.spent) || 0, cap: Number(raw.cap) || 0 };
  }
  return { spent: 0, cap: 0 };
}

function pruneDayXp(map) {
  const keys = Object.keys(map || {});
  if (keys.length <= DAY_XP_RETENTION) return map || {};
  // The key IS the date now, so it sorts directly.
  const keep = keys.sort((a, b) => a.localeCompare(b)).slice(-DAY_XP_RETENTION);
  const out = {};
  keep.forEach(k => { out[k] = map[k]; });
  return out;
}

/* What this session may actually be paid, after the day's budget. Records the
   draw, so calling it twice for one session does not pay twice.

   The day's ceiling is the LARGEST cap any session run on that date warrants,
   not the first one claimed. Taking the first would let a Recovery morning
   (cap 90) hold down a real session trained that afternoon; taking the largest
   still refuses a second full day's pay, because the cap is on the date's TOTAL
   spend. A partial and its resume share one budget exactly as before. */
/* What the training LOG already says about a date, for the sessions this device
   can see — which includes every session synced from her other device.

   The banked row alone is a fact about one device: train on the tablet in the
   morning and the phone in the afternoon and each grants a full day, because
   neither has ever seen the other's row (the budget is deliberately not
   published — see dayXpRow). Every session record, however, DOES sync, and
   since finalize stamps what each one was actually paid, the day's spend can be
   read back off the log. So the log is used as a floor under the banked value:
   whichever knows about more spending wins.

   Only the STAMPED amount counts. Re-pricing a row here would count the session
   being finalized right now — it is already in the log by this point, and its
   stamp is written a moment later — at full value against its own budget. */
function loggedDayXp(key, entry) {
  const rows = loadSessions().filter(s =>
    s && !s.practice && edmontonISO(s.isoDate) === key);
  let spent = 0;
  let cap = dayXpCap(entry);
  rows.forEach(s => {
    if (Number.isFinite(s.xpEarned)) spent += Math.max(0, s.xpEarned);
    cap = Math.max(cap, dayXpCap(s));
  });
  return { spent, cap };
}

export function claimSessionXp(entry) {
  const want = xpForSession(entry);
  if (want <= 0) return 0;
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  const key = dayXpKey(entry);
  const banked = dayXpRow(j.dayXpPaid, key);
  const logged = loggedDayXp(key, entry);
  const spent = Math.max(banked.spent, logged.spent);
  const cap = Math.max(banked.cap, logged.cap);
  const grant = Math.max(0, Math.min(want, cap - spent));
  if (grant > 0) {
    j.dayXpPaid = pruneDayXp({ ...(j.dayXpPaid || {}), [key]: { spent: spent + grant, cap } });
    saveJourney(j);
  }
  return grant;
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

/* A draw is owed but cannot be claimed yet, because this device has not been
   able to settle the day's XP against the other one. Separate from "no draw
   owed" so the screen can say which it is — "not yet" and "nothing here" are
   very different messages to a kid who just finished a workout. */
export function drawIsWaitingOnSync() {
  return xpIsPending() && pendingDrawCount() > 0;
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
  /* A DRAW WAITS FOR THE DAY TO SETTLE.

     Prizes are drawn off the XP total, and while a device is offline that total
     is its own honest guess: the other device may hold work for the same date,
     and only once they have met does the date have a final value (see
     settledDayXp). Claiming against an unsettled total is how an over-payment
     bought a real thing that could not then be taken back.

     The award itself is not withheld — she trained, the XP shows, the ladder
     moves. Only the claim waits, and only while there is genuinely no way to
     check. See drawIsWaitingOnSync for what the screen should say. */
  if (xpIsPending()) { saveJourney(syncPendingDraws(j)); return j; }
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

  // Oldest first, full stop. Pinning every redeemed prize ahead of the queue
  // meant a wallet with more redeemed prizes than the level earned trimmed
  // AVAILABLE ones instead — she watched prizes she had never used disappear.
  const oldestFirst = wallet.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const keep = new Set();
  for (const p of oldestFirst) {
    if (keep.size >= earned) break;
    keep.add(String(p.id));
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

/* ---- one-time repairs, run by a grown-up, not silently on boot -----------
   Two wallet faults predate the id and redemption rules and cannot be fixed by
   merging: prizes that share an id (so the cloud union collapses them into
   one and a won prize disappears), and prizes marked redeemed before
   redeemedAt existed (so the undo window reads as closed and they are locked
   forever). Resetting every prize automatically would be worse than the bug,
   so this is a button in the Grown-up Zone. */
export function repairPrizeWallet() {
  const j = loadJourney();
  if (!j) return { reissued: 0, dated: 0 };
  const seen = new Set();
  let reissued = 0, dated = 0;
  j.prizesWon = (j.prizesWon || []).map(p => {
    const out = { ...p };
    if (out.id == null || seen.has(String(out.id))) { out.id = prizeId(); reissued++; }
    seen.add(String(out.id));
    if (out.redeemed && !Number.isFinite(out.redeemedAt)) { out.redeemedAt = redeemedAtOf(out) || 0; dated++; }
    return out;
  });
  saveJourney(syncPendingDraws(j));
  if (reissued || dated) logEvent("wallet_repair", { reissued, dated });
  return { reissued, dated };
}

/* Every redeemed prize, for the grown-up to review one at a time.
   The app CANNOT know which of these she actually spent and which the
   duplicate-id bug marked used behind her back — so it does not guess. It shows
   them and asks. */
export function redeemedPrizesForReview() {
  const j = loadJourney() || {};
  return (j.prizesWon || [])
    .filter(p => p && p.redeemed)
    .map(p => ({
      id: String(p.id), label: p.label || p.name || "Prize",
      date: p.date || "", redeemedAt: redeemedAtOf(p) || 0,
      repairOf: p.repairOf || null
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* Restore ONE prize a grown-up has identified as wrongly marked used.

   Not by setting redeemed:false — that would not survive the night. Redemption
   always wins a wallet merge (see mergePrize), and it has to: a device that
   still shows a prize as available is simply behind, and letting ITS copy win
   is how one prize gets spent twice. So an un-redeemed copy would be quietly
   re-redeemed by the next sync from her other device.

   Instead the corrupted id is VOIDED — mergeWallets drops a voided id from
   either side, permanently — and a replacement prize is issued with a new id,
   the original label and earned date, and repairOf pointing at what it
   replaces. Nothing she earned is removed; the record simply stops lying. */
export function restorePrize(prizeId_) {
  const j = loadJourney();
  if (!j) return { restored: false, reason: "no-journey" };
  const key = String(prizeId_);
  const wallet = j.prizesWon || [];
  const target = wallet.find(p => p && String(p.id) === key);
  if (!target) return { restored: false, reason: "not-found" };
  if (!target.redeemed) return { restored: false, reason: "not-redeemed" };

  const replacement = {
    ...target,
    id: prizeId(),
    date: target.date,            // the day she EARNED it is hers, unchanged
    redeemed: false,
    repairOf: key
  };
  delete replacement.redeemedAt;

  j.prizesWon = [replacement, ...wallet.filter(p => String(p.id) !== key)];
  // Voided for good, on this device and on every device it syncs with.
  j.voidedPrizeIds = [...new Set([...(j.voidedPrizeIds || []), key])];
  saveJourney(syncPendingDraws(j));
  logEvent("prize_restored", { was: key, now: replacement.id });
  return { restored: true, id: replacement.id, was: key, label: replacement.label || "" };
}

/* ============================================================
   PRIZE AMNESTY — one dated forgiveness of every earlier redemption.

   Her wallet showed all thirteen prizes as used. The cause is persisted legacy
   data carrying `redeemed: true`, and the merge cannot second-guess it:
   redemption always wins (see mergePrize), and it has to, because a device
   still showing a prize as available is simply behind, and letting ITS copy win
   is how one prize gets spent twice. The app therefore cannot tell a real spend
   from one the duplicate-id bug invented, and restorePrize above exists so a
   grown-up can decide one at a time.

   An adult has decided for all of them at once. THE RULE, and it is the whole
   rule: every redemption that happened BEFORE the moment this first ran is
   forgiven, wherever it is later seen; anything redeemed after that moment is
   hers to keep spent. That is what makes running it on every boot safe forever
   rather than a switch that keeps handing back prizes she really used.

   It cannot work by setting `redeemed: false` — the next sync from the other
   device would quietly re-redeem it. It voids the corrupted id and issues a
   replacement, exactly as restorePrize does.

   AND THE REPLACEMENT ID IS DERIVED FROM THE ORIGINAL, not random. Both devices
   run this independently on their own copy of the wallet. With a random id each
   would mint a DIFFERENT replacement for the same prize, the union would carry
   twenty-six, and reconcileWallet would then trim thirteen of them by date —
   arbitrarily, since every replacement keeps its original earned date. A
   derived id makes both devices produce the same prize, which the union
   collapses back into one. This is load-bearing; do not make it random.

   The wallet's SIZE is unchanged (one id swapped for one id), so the
   reconcileWallet trim never fires on account of this. */
export const PRIZE_AMNESTY_VERSION = 1;

/* One prize whose label is being corrected at the same time, by adult request.
   The DRAW POOL in js/data.js is deliberately untouched: it already holds a
   chore-skip, and adding a second would quietly double its odds. */
const AMNESTY_RELABEL = [
  { match: /stay\s*up\s*20\s*min(ute)?s?\s*later/i, icon: "✨", label: "Skip a chore" }
];

/* Same charset prizeId() produces, so a derived id is safe everywhere an id is
   written — including into a data-arg attribute. */
function restoredIdFor(originalId) {
  const clean = String(originalId).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return "restored-" + (clean || "prize");
}

export function migratePrizeAmnesty(now = Date.now()) {
  const j = loadJourney();
  if (!j) return { restored: 0, relabelled: 0 };

  // Stamped on the FIRST pass and never moved. Every later pass measures
  // redemptions against this instant, which is what makes "before the amnesty"
  // a fixed fact rather than a rolling window.
  if (!j.prizeAmnesty || j.prizeAmnesty.v !== PRIZE_AMNESTY_VERSION) {
    j.prizeAmnesty = { v: PRIZE_AMNESTY_VERSION, at: now, note: "" };
  }
  const cutoff = Number(j.prizeAmnesty.at) || now;

  const wallet = j.prizesWon || [];
  const voided = new Set((j.voidedPrizeIds || []).map(String));
  let restored = 0, relabelled = 0;

  const next = wallet.map(p => {
    if (!p || p.id == null) return p;
    let out = { ...p };

    // The relabel applies to every copy, spent or not — it is a correction to
    // what the prize SAYS, not to whether it has been used.
    const rule = AMNESTY_RELABEL.find(r => r.match.test(String(out.label || "")));
    if (rule) { out.icon = rule.icon; out.label = rule.label; relabelled++; }

    if (!out.redeemed) return out;
    /* A redemption with no date at all is precisely the legacy shape the audit
       identified as corrupt, so it is forgiven; one dated after the amnesty is
       a real spend and is left alone. */
    const at = Number.isFinite(out.redeemedAt) ? out.redeemedAt : redeemedAtOf(out);
    if (at != null && at >= cutoff) return out;

    const replacementId = restoredIdFor(out.id);
    voided.add(String(out.id));
    restored++;
    const replacement = { ...out, id: replacementId, redeemed: false, repairOf: String(out.id) };
    delete replacement.redeemedAt;
    return replacement;      // date untouched: the day she EARNED it is hers
  });

  // A replacement can collide with a prize already carrying that id if this has
  // somehow run twice against one wallet; keep one.
  const byId = new Map();
  next.forEach(p => {
    if (!p || p.id == null) return;
    const k = String(p.id);
    byId.set(k, byId.has(k) ? mergePrize(byId.get(k), p) : p);
  });

  j.prizesWon = [...byId.values()];
  j.voidedPrizeIds = [...voided];
  if (restored || relabelled) {
    /* Not silent. This runs itself, and a wallet that changes behind a child's
       back with no explanation is what produced the problem in the first place;
       the Grown-up Zone renders this line. */
    j.prizeAmnesty.note = restored
      ? restored + " prize" + (restored === 1 ? " was" : "s were") + " made available again on "
        + edmontonISO(now) + ". Prizes used after that stay used."
      : j.prizeAmnesty.note;
    logEvent("prize_amnesty", { restored, relabelled });
  }
  saveJourney(syncPendingDraws(j));
  return { restored, relabelled };
}

/* Split quiz XP back out of the session rows that folded it in. The Coach's
   Quiz used to add its XP to BOTH the session record and the quiz ledger, and
   rebuildJourneyXp sums both — so every rebuild inflated the total by the
   quiz XP again. Idempotent: a row it has already split carries quizXp. */
export function migrateQuizXp() {
  const V4 = { 1: 180, 2: 270, 3: 360 };
  const all = loadSessions();
  let touched = 0;
  all.forEach(s => {
    if (!s || s.xpVersion !== 4 || s.quizXp != null || !Number.isFinite(s.xpEarned)) return;
    const rounds = s.mini ? 1 : Math.min(3, Math.max(1, s.roundsDone || 1));
    const base = V4[rounds] || 0;
    const expected = s.completedFully ? base : Math.round(base / 2);
    // Move the excess out of xpEarned rather than leaving it there: after this
    // every row in the log means the same thing by xpEarned.
    s.quizXp = Math.max(0, s.xpEarned - expected);
    s.xpEarned = s.xpEarned - s.quizXp;
    touched++;
  });
  if (touched) writeStorage(LS_SESSIONS, all);
  return touched;
}

/* The last trim, for the one-line note in the Grown-up zone. */
export function lastWalletTrim() {
  const j = loadJourney();
  return (j && j.walletTrim) || null;
}

/* A prize redeemed before redeemedAt existed has no timestamp, so
   prizeUndoOpen() reads it as a closed window and it is locked forever with no
   way to tell when it was spent. Treat its own date as the redemption time:
   the undo window is long past either way, but the value is now comparable. */
function redeemedAtOf(p) {
  if (!p || !p.redeemed) return null;
  if (Number.isFinite(p.redeemedAt)) return p.redeemedAt;
  const t = Date.parse(String(p.date || "") + "T12:00:00");
  return Number.isFinite(t) ? t : 0;
}

/* Merge one prize seen on two devices. Redemption is the irreversible half of
   a prize's life, so it always wins: a device that still shows it available is
   simply behind, and keeping ITS copy is how the same prize got spent twice. */
export function mergePrize(a, b) {
  if (!a) return b;
  if (!b) return a;
  const base = { ...a, ...b, id: a.id };
  // Keep the earliest creation date so history doesn't drift forward.
  base.date = [a.date, b.date].filter(Boolean).sort()[0] || a.date;
  const ra = redeemedAtOf(a), rb = redeemedAtOf(b);
  if (ra == null && rb == null) {
    delete base.redeemedAt;
    base.redeemed = false;
    return base;
  }
  base.redeemed = true;
  base.redeemedAt = Math.min(...[ra, rb].filter(v => v != null));
  return base;
}

/* Union two wallets by id, dropping anything either side has voided. Prizes
   present on both sides are merged field by field rather than first-wins. */
function mergeWallets(a, b, voided) {
  const dead = new Set((voided || []).map(String));
  const out = new Map();
  [...(a || []), ...(b || [])].forEach(p => {
    if (!p || p.id == null) return;
    const k = String(p.id);
    if (dead.has(k)) return;
    out.set(k, out.has(k) ? mergePrize(out.get(k), p) : p);
  });
  return [...out.values()].sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
}

/* Exposed for tests: the voided-id rule is the load-bearing half of prize
   repair, and it is only observable through a merge. */
export const mergeWalletsForTest = mergeWallets;

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

/* IS THIS SHAPED LIKE A SESSION THIS APP WROTE?

   Everything merged here arrives from somewhere the app does not control: a
   collection with no sign-in in front of it, or a JSON file a grown-up picked
   off a disk. A row that is merely the wrong shape is enough to do damage
   without anyone being hostile — a `ledger` that is a string rather than an
   array reaches every screen that iterates it, and a NaN duration poisons an
   average. So a row is checked before it joins the log, and a row that fails is
   quarantined (counted and logged, never merged) rather than being allowed in
   to break a screen later, somewhere with no clue where it came from.

   Deliberately shallow: this is a shape check, not a re-scoring. Interpreting
   what a row MEANS is js/outcome.js's job and stays there. */
function looksLikeSession(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  if (typeof entry.isoDate !== "string" || !entry.isoDate) return false;
  if (isNaN(new Date(entry.isoDate))) return false;
  if (entry.dayKey != null && typeof entry.dayKey !== "string") return false;
  // The fields every reader ITERATES have to be iterable, or they take a screen
  // down at render time rather than here.
  if (entry.ledger != null && !Array.isArray(entry.ledger)) return false;
  if (entry.perExercise != null && !Array.isArray(entry.perExercise)) return false;
  if (entry.formChecks != null && !Array.isArray(entry.formChecks)) return false;
  // And the fields that get summed have to be numbers, or one row turns every
  // total on the progress screen into NaN.
  const numeric = ["durationSecs", "xpEarned", "roundsDone", "roundsPlanned", "expectedWork"];
  return numeric.every(k => entry[k] == null || Number.isFinite(Number(entry[k])));
}

/* Add any incoming records the local log doesn't already have.
   Returns how many were added. */
export function mergeSessions(incoming) {
  const local = loadSessions();
  const seen = new Set(local.map(sessionKey));
  let added = 0;
  let rejected = 0;
  (incoming || []).forEach(doc => {
    const entry = stripCloudFields(doc);
    if (!entry.isoDate) return;
    if (!looksLikeSession(entry)) { rejected++; return; }
    const key = sessionKey(entry);
    if (seen.has(key)) return;
    seen.add(key);
    local.push(entry);
    added++;
  });
  // Quarantined, not silently dropped: a grown-up looking at why a restore was
  // short should find the count rather than have to guess.
  if (rejected) logEvent("merge_rejected", { rejected, source: "sessions" });
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

/* ---- ONE DAY OF TRAINING PAYS FOR ONE DAY, ON EVERY DEVICE ----------------

   The live path already holds the line on one device and on two used in
   sequence: claimSessionXp takes the larger of the banked budget row and what
   the synced log says the date has already been paid (see loggedDayXp), so a
   day started on the tablet and finished on the phone draws from one budget.

   What neither could cover is two devices OFFLINE AT ONCE. Each grants a full
   day against a budget the other has never seen, each stamps `xpEarned` on its
   own record, and a rebuild then simply ADDED the two stamps: 360 + 360 for one
   360 day. Both devices converged, honestly, on twice what the day was worth —
   and prizes are drawn off that total, so the over-payment bought real things.

   The stamp is still what a row is WORTH — re-pricing history is how a cloud
   restore came to re-score sessions underneath her. What changes is that the
   total is no longer the sum of the stamps: the log is grouped by the actual
   Edmonton date the work happened on, and each date pays at most that date's
   ceiling. Deterministic (no ordering, no clock), idempotent, and it settles to
   the same number on every device the moment they have seen the same rows.

   Sessions are aggregated by WORKOUT first, so the two fragments of a day
   trained in two goes are the same workout and cannot each claim a day. */
export function settledDayXp(sessions) {
  const byDate = new Map();
  (sessions || []).forEach(s => {
    if (!s || s.practice) return;
    const date = edmontonISO(s.isoDate);
    if (!date) return;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(s);
  });
  const out = [];
  byDate.forEach((rows, date) => {
    /* Only rows priced by the CURRENT rules are capped. A legacy row carries a
       stamp from a formula that had no daily ceiling and no rounds-planned to
       derive one from, so dayXpCap reads 90 for it and capping would quietly
       cut a real award to a quarter on the next boot. Re-scoring her history
       underneath her is the thing this file refuses to do everywhere else; the
       cap is a rule for days trained under the rule. */
    const modern = rows.filter(s => s.xpVersion === XP_VERSION);
    const legacy = rows.filter(s => s.xpVersion !== XP_VERSION);
    const cap = modern.reduce((m, s) => Math.max(m, dayXpCap(s)), 0);
    const claimed = modern.reduce((sum, s) => sum + sessionXp(s), 0);
    const carried = legacy.reduce((sum, s) => sum + sessionXp(s), 0);
    out.push({
      date, cap, claimed, carried,
      capped: claimed > cap,
      settled: Math.min(claimed, cap) + carried
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function settledTrainingXp(sessions) {
  return settledDayXp(sessions).reduce((sum, d) => sum + d.settled, 0);
}

/* XP THIS DEVICE HAS CALCULATED BUT CANNOT YET PROMISE.

   Offline, a device can only see its own records, so the number it shows is its
   own honest guess at what the date is worth — and the other device may be
   holding work for the same date. The award is real either way; what is not
   final until the two have met is the TOTAL, and prizes are drawn off the
   total. So an unsynced day is reported as pending, and a draw waits for it.
   Displaying it is the point: a kid who trained is told her work is counted,
   not that it is missing. */
let _syncFailed = false;

/* WHETHER THIS DEVICE HAS A WORKING MIRROR, remembered ACROSS LOADS.

   This was a module-level boolean, which meant it reset on every page load — so
   a COLD offline launch had the guard below switched off entirely, and a cold
   offline launch is precisely the case it exists for. It lives on the journey
   now, which is already persisted and already synced. */
export function noteSyncResult(ok) {
  _syncFailed = !ok;
  if (!ok) return;
  const j = loadJourney();
  if (!j) return;
  j.lastSyncAt = Date.now();
  saveJourney(j);
}
export function lastSyncFailed() { return _syncFailed; }
export function hasEverSynced() {
  return Number.isFinite((loadJourney() || {}).lastSyncAt);
}

/* How long a successful sync counts as evidence that there IS another device to
   disagree with. Past this, a mirror nobody has reached in weeks is treated as
   gone: a Firebase project that breaks permanently must not silently block
   every prize draw from then on, with nothing on screen to explain why. */
export const SYNC_EVIDENCE_MS = 14 * DAY_MS;

/* The online check, behind a seam so a test can be offline without a browser. */
let _onlineOverride = null;
export function setOnlineForTest(v) { _onlineOverride = v; }
function deviceIsOnline() {
  if (_onlineOverride !== null) return _onlineOverride;
  if (typeof navigator === "undefined" || !navigator) return true;
  return navigator.onLine !== false;
}

export function xpIsPending(now = Date.now()) {
  if (settings.cloudMirror === false) return false;   // no mirror, nothing to wait for
  /* A mirror this device has never reached — or has not reached in weeks — is
     not a second opinion it is waiting on. It is a project that was never
     configured, a family running on one device, or a backend that has died.
     Blocking a prize on a sync that is never going to arrive is a worse failure
     than the over-payment this guards against, and it is silent from where the
     kid is standing. */
  const last = Number((loadJourney() || {}).lastSyncAt);
  if (!Number.isFinite(last)) return false;
  if (now - last > SYNC_EVIDENCE_MS) return false;
  if (!deviceIsOnline()) return true;
  return _syncFailed;
}

/* Recompute the journey total from its two sources. Prizes already won are
   never touched. A rebuild does NOT grant draws for the levels it discovers:
   the same shared history rebuilds on every device, so crediting the climb
   here handed a second device — or one whose storage had been evicted — a
   fresh prize for every level the kid had already been paid for. Draws are
   derived from the level and the wallet instead. Returns the total. */
export function rebuildJourneyXp() {
  const j = loadJourney() || { xp: 0, prizesWon: [], pendingDraws: 0 };
  const fromSessions = settledTrainingXp(loadSessions());
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
  /* Same rule as the session merge above: what arrives from the mirror is not
     trusted to be the shape it claims. The wallet is iterated and rendered, and
     the ledger is keyed and priced, so both have to be the right kind of thing
     before either is unioned into what is already here. */
  if (snap.prizesWon != null && !Array.isArray(snap.prizesWon)) return false;
  if (snap.voidedPrizeIds != null && !Array.isArray(snap.voidedPrizeIds)) return false;
  if (snap.qLedger != null && (typeof snap.qLedger !== "object" || Array.isArray(snap.qLedger))) return false;
  if (snap.quizItems != null && (typeof snap.quizItems !== "object" || Array.isArray(snap.quizItems))) return false;
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
export function recordFormVerdict(move, pass, month) {
  if (!move) return null;
  month = month || monthKeyOf();     // callers pass null for "the current month"
  const fc = loadFormChecks();
  const m = fc.months[month] || { moves: {} };
  m.moves[move] = { pass: !!pass, at: Date.now() };
  fc.months[month] = m;
  saveFormChecks(fc);
  logEvent("form_check", { move, pass: !!pass, month });
  return fc;
}
export function clearFormVerdict(move, month) {
  month = month || monthKeyOf();
  const fc = loadFormChecks();
  const m = fc.months[month];
  if (!m || !m.moves[move]) return false;
  delete m.moves[move];
  saveFormChecks(fc);
  return true;
}
export function formVerdicts(month) {
  return ((loadFormChecks().months[month || monthKeyOf()] || {}).moves) || {};
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
  SETTINGS_KEY, PROGRESS_KEY, SKIP_HISTORY_KEY, ENGAGE_KEY, LS_READINESS, LS_READINESS_LOG, LS_DAYPROG,
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

/* Does this backup belong to someone other than the athlete currently open?
   Returns null when it matches (or when the file is too old to say). Matches
   on the immutable profile id first, then on any name the profile has
   answered to, so a rename doesn't make her own backup look foreign. */
export function backupIdentityMismatch(payload) {
  const prof = payload && payload.profile;
  if (!prof) return null;                       // pre-identity backups can't be checked
  const known = athleteAliases();
  const id = String(prof.id == null ? "" : prof.id).trim().toLowerCase();
  const name = String(prof.name == null ? "" : prof.name).trim().toLowerCase();
  if (!id && !name) return null;
  if ((id && known.includes(id)) || (name && known.includes(name))) return null;
  const me = activeProfile();
  return { from: prof.name || prof.id || "another athlete", to: (me && me.name) || settings.athleteName || "this athlete" };
}

/* Restore INTO the active athlete. Additive by design — a backup can only add
   to what's here, never delete or overwrite it:
     · sessions  — merged, deduped (same rule as the cloud restore)
     · journey   — higher XP total wins, prize wallets are unioned by id
     · the rest  — filled in only where this device has nothing
   Returns { sessionsAdded, xpAdded, filled: [keys] }. Throws on a file that
   isn't a Splash backup. */
export function importProfileData(payload, opts = {}) {
  if (!payload || payload.app !== BACKUP_APP || !payload.data || typeof payload.data !== "object") {
    throw new Error("That file isn't a Splash backup.");
  }
  if (Number(payload.schema) > BACKUP_SCHEMA) {
    throw new Error("That backup was made by a newer version of the app.");
  }
  // Whose backup is this? A restore merges XP, prizes and a whole training
  // history into whichever athlete happens to be open, and it cannot be
  // undone — so Jess's backup opened under Jenn used to silently become
  // Jenn's. Naming the mismatch and making the grown-up confirm is the only
  // point at which it can still be caught.
  const mismatch = backupIdentityMismatch(payload);
  if (mismatch && !opts.force) {
    const err = new Error(`That backup is ${mismatch.from}'s, but ${mismatch.to} is the athlete open right now. `
      + `Restoring would merge ${mismatch.from}'s sessions, XP and prizes into ${mismatch.to} — and it can't be undone.`);
    err.identityMismatch = mismatch;
    throw err;
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
/* One 🎧 switch used to gate every sound in the app, so turning the coach's
   voice off also silenced the timer beeps she paces on and the safety cues that
   are the point of the readiness system. Splitting them is only safe if the
   split inherits what she already chose: the old value seeds speech and timer
   sounds, and the safety voice starts ON regardless — it is not the thing
   anyone was trying to turn off. */
export function migrateAudioSettings() {
  if (settings.audioSplitDone) return false;
  const legacy = settings.coachVoiceOn !== false;
  updateSettings({
    coachSpeechOn: legacy,
    timerSoundsOn: legacy,
    safetyVoiceOn: true,
    audioSplitDone: true
  });
  return true;
}

export function migrate() {
  // merge any new default settings keys into the saved blob
  settings = loadSettings();
  saveSettings();
  migrateAudioSettings();
  // Un-double the quiz XP baked into older session rows BEFORE any total is
  // derived from the log, so the baseline below is the honest number.
  migrateQuizXp();
  migrateGateWeeks();
  migrateAthleteIdentity();
  if (loadJourney() == null) {
    const xp = loadSessions().reduce((sum, s) => sum + sessionXp(s), 0);
    saveJourney({ xp, prizesWon: [], pendingDraws: 0, seededAt: Date.now() });
  }
  // Establish the session-XP baseline BEFORE any cloud restore runs, so a
  // restore awards exactly the XP of the records it actually brings back.
  reconcileJourneyWithSessions();
  /* Forgive every redemption that predates the amnesty. Runs here so an OFFLINE
     device gets its wallet back too, and again after the cloud restore resolves
     (see boot() in js/main.js) to catch spent prizes that arrive from the other
     device. Both passes are safe: the cutoff is stamped once. */
  migratePrizeAmnesty();
  const bootJourney = loadJourney();
  if (bootJourney) { reconcileWallet(bootJourney); saveJourney(bootJourney); }
}
