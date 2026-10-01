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

import { FEATURES, HERO_DECOR_SRC } from "./sport.js";
import { repSeconds } from "./plan.js";

/* ---- THE ONE KID BUTTON (R5) ---------------------------------------------
   Every filled button a kid taps has one look: filled, no border, a 4px
   darker bottom edge, the 16px corner and the bold UI font. Its colours come
   from one of four slot families in the app's colors.css, each read with a
   fallback equal to the look before the slots existed. Two sizes: a screen's
   main action is 22px on 64px, everything else 18px on 56px (STOP keeps its
   20px). A picked answer, mood or tab carries a 3px ring in the main button's
   edge colour. Chips, tags and switches are not buttons of this kind: they
   stay pills. */
const BTN_SLOTS = {
  primary: ["var(--btn-primary-bg,var(--action-bg))", "var(--btn-primary-text,var(--action-text))", "var(--btn-primary-edge,var(--action-edge))"],
  go:      ["var(--btn-go-bg,var(--aqua-deep))", "var(--btn-go-text,#fff)", "var(--btn-go-edge,var(--aqua-ink))"],
  stop:    ["var(--btn-stop-bg,var(--stop))", "var(--btn-stop-text,#fff)", "var(--btn-stop-edge,var(--stop-ink))"],
  neutral: ["var(--btn-neutral-bg,var(--surface))", "var(--btn-neutral-text,var(--ink))", "var(--btn-neutral-edge,var(--hairline))"]
};
export const PICKED_RING = "inset 0 0 0 3px var(--btn-primary-edge,var(--action-edge))";
export function kidButton(kind, { big = false, px = 0, minH = 0, picked = false, ink = "" } = {}) {
  const [bg, text, edge] = BTN_SLOTS[kind] || BTN_SLOTS.primary;
  return "min-height:" + (minH || (big ? 64 : 56)) + "px;border:none;border-radius:var(--radius-md);"
    + "background:" + bg + ";color:" + (ink || text) + ";"
    + "box-shadow:" + (picked ? PICKED_RING + "," : "") + "0 4px 0 " + edge + ";"
    + "font-family:var(--font-ui);font-weight:900;font-size:" + (px || (big ? 22 : 18)) + "px;cursor:pointer;";
}
/* An answer that has been marked keeps its right (mint) or wrong (coral)
   colours, in the same shape: the family's wash, its -ink words, a 3px ring in
   the bright colour and the 4px edge in its -deep. */
export function markedAnswer(family, { px = 0 } = {}) {
  return "min-height:56px;border:none;border-radius:var(--radius-md);"
    + "background:var(--" + family + "-wash);color:var(--" + family + "-ink);"
    + "box-shadow:inset 0 0 0 3px var(--" + family + "),0 4px 0 var(--" + family + "-deep);"
    + "font-family:var(--font-ui);font-weight:900;font-size:" + (px || 18) + "px;cursor:pointer;";
}

/* ---- THE HERO DECORATION (R5): water ripples in swim, snow in skate --------
   One picture behind the content of a coloured hero card, drawn only while
   the grown-up setting is on (settings.heroDecorOn, on unless switched off).
   z-index -1 inside a container that isolates, so it sits under the words and
   never takes a tap or a screen-reader stop. HERO_HOST goes on the container. */
export const HERO_HOST = "position:relative;isolation:isolate;";
export function heroDecor(on) {
  if (!on) return "";
  return `<div aria-hidden="true" data-hero-decor="1" style="position:absolute;inset:0;z-index:-1;pointer-events:none;background:url(${HERO_DECOR_SRC}) center top/cover;border-radius:inherit;"></div>`;
}
/* White words over the decoration get a soft shadow in the app that needs it
   (skate); the slot is `none` elsewhere, so core never names the sport. */
export function heroShadow(on) { return on ? "text-shadow:var(--hero-text-shadow,none);" : ""; }

export function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Exercise photos live in assets/exercises/ named "<Exercise Name> - Timer
   Image.png" (in-session photo slot) or "<Exercise Name> - Demo Image.png"
   (move-library / detail-overlay photo). "/" can't appear in a filename, so
   it's swapped for "-"; stray whitespace is collapsed before matching. */
export function exercisePhotoUrl(name, kind, ext = "png") {
  const clean = String(name || "").replace(/\//g, "-").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return "assets/exercises/" + encodeURIComponent(clean + " - " + kind + " Image." + ext);
}

/* THE PICTURES SHE ACTUALLY DOWNLOADS. A move photo is a 1086 × 1448 PNG of
   about a megabyte; the same pixels as WebP are a tenth of that, and an iPad
   on cellular was pulling tens of megabytes in its first week of sessions.
   Where the app ships the WebP twin (FEATURES.webp), it is asked for first;
   the PNG stays as the fallback for a browser without WebP, and a file that
   is missing altogether hides the slot as it always did. */
export function photoSources(pngUrl) {
  if (!pngUrl) return [];
  return FEATURES.webp && /\.png$/i.test(pngUrl) ? [pngUrl.replace(/\.png$/i, ".webp"), pngUrl] : [pngUrl];
}

/* An <img> that tries each URL in turn and hides itself when none loads. The
   chain rides on the element (data-fallback, "|"-separated) so a re-render
   starts it over rather than remembering a dead end. */
const IMG_FALLBACK_JS = "var f=(this.dataset.fallback||'').split('|').filter(Boolean);if(f.length){this.src=f.shift();this.dataset.fallback=f.join('|');}else{this.style.display='none';}";
export function imgWithFallbacks(urls, attrs = "") {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return "";
  return `<img src="${list[0]}" data-fallback="${list.slice(1).join("|")}" onerror="${IMG_FALLBACK_JS}" ${attrs}>`;
}

/* Seconds given between sides / sets of the same move, so she can reset. One
   definition, re-exported by data.js for the content and runner to share. */
export const SIDE_SWITCH_BUFFER = 5;

/* Planning-estimate seconds for one exercise (time-driver → work seconds;
   rep/hold → dose heuristic). Single source shared by the engine estimate and
   the Today/plan view-models — previously duplicated verbatim in both. */
export function refTime(ex) {
  if (!ex) return 30;
  if (ex.driver === "time") return ex.work || 30;
  // A parsed prescription knows exactly how much work it is: reps × cadence,
  // plus a reset between each side / direction / set.
  const p = ex.prescription;
  if (p) {
    /* repSeconds is the single owner of "how long one rep takes" -- the
       session estimate already used it while this re-derived it inline, so
       the two could price the same move differently. */
    return p.totalReps * repSeconds(p)
         + Math.max(0, p.segments - 1) * SIDE_SWITCH_BUFFER
         + (p.keepGoingSeconds || 0);
  }
  // Fallback for plain objects with only a display dose (legacy records).
  const d = (ex.dose || "").toLowerCase();
  let base = 30;
  if (/\/side|\/leg|\/dir/.test(d)) base = 40;
  if (/2×|2x/.test(d)) base = 45;
  if (/hold/.test(d)) base = 25;
  return base;
}

/* Parse a recovery dose string ("60s/side", "2 min", "30–45s/muscle") to seconds. */
export function recoveryDoseSecs(dose) {
  const m = String(dose).match(/(\d+)\s*(?:–\s*\d+)?\s*(min|s)?/i);
  let secs = m ? parseInt(m[1], 10) : 40;
  if (m && /min/i.test(m[2] || "")) secs *= 60;
  const eachSide = /\/side/i.test(dose);
  return { secs: eachSide ? secs * 2 : secs, eachSide };
}
