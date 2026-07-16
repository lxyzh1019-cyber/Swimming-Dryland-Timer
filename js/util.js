/* ============================================================
   Small shared helpers — dates, formatting, slugs.
   ============================================================ */

export const DAY_MS = 86400000;

/* Edmonton calendar date (YYYY-MM-DD) for a Date or ISO timestamp. Sessions
   store full UTC timestamps; slicing the UTC date shifts any evening session
   (after ~6 pm local) onto the NEXT day, so every calendar-day grouping —
   week strip, streaks, day-progress keys, analytics — must go through here. */
export function edmontonISO(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "";
  return dt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
}

export function todayISODate() { return edmontonISO(new Date()); }

export function edmontonDayKey() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Edmonton", weekday: "long"
  }).toLowerCase();
}

/* Day-of-month for each weekday of the CURRENT (Mon–Sun) week, in Edmonton time.
   Anchors at UTC-noon off Edmonton's local date so DST/midnight can't drift the
   day. Returns { monday: 15, tuesday: 16, … }. */
export function edmontonWeekDates() {
  const tz = "America/Edmonton";
  const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: tz })
    .split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = anchor.getUTCDay();               // 0=Sun … 6=Sat
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const out = {};
  keys.forEach((k, i) => {
    const dt = new Date(monday);
    dt.setUTCDate(monday.getUTCDate() + i);
    out[k] = dt.getUTCDate();
  });
  return out;
}

/* ISO date (YYYY-MM-DD) for each weekday of the current Mon–Sun week (Edmonton). */
export function edmontonWeekISODates() {
  const tz = "America/Edmonton";
  const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: tz })
    .split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = anchor.getUTCDay();
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const out = {};
  keys.forEach((k, i) => {
    const dt = new Date(monday);
    dt.setUTCDate(monday.getUTCDate() + i);
    out[k] = dt.toISOString().slice(0, 10);
  });
  return out;
}

export function mondayOfThisWeek() {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // Monday-based week
  d.setDate(d.getDate() + diff);
  return d;
}

/* Timer digits: "05" under a minute, "1:05" above. */
export function fmt(s) {
  if (typeof s === "string") return s;
  if (s < 60) return String(s).padStart(2, "0");
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/* Always MM:SS. */
export function fmtMMSS(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

export function fmtHHMM(secs) {
  if (!secs || secs < 0) return "0m";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Exercise photos live in assets/exercises/ named "<Exercise Name> - Timer
   Image.png" (in-session photo slot) or "<Exercise Name> - Demo Image.png"
   (move-library / detail-overlay photo). "/" can't appear in a filename, so
   it's swapped for "-"; stray whitespace is collapsed before matching. */
export function exercisePhotoUrl(name, kind) {
  const clean = String(name || "").replace(/\//g, "-").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return "assets/exercises/" + encodeURIComponent(clean + " - " + kind + " Image.png");
}

/* Parse a recovery dose string ("60s/side", "2 min", "30–45s/muscle") to seconds. */
export function recoveryDoseSecs(dose) {
  const m = String(dose).match(/(\d+)\s*(?:–\s*\d+)?\s*(min|s)?/i);
  let secs = m ? parseInt(m[1], 10) : 40;
  if (m && /min/i.test(m[2] || "")) secs *= 60;
  const eachSide = /\/side/i.test(dose);
  return { secs: eachSide ? secs * 2 : secs, eachSide };
}
