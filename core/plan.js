/* ============================================================
   PLAN MECHANISM — how a plan is built and priced, for every app.

   The content of a plan (which moves, on which day, with which cue) is the
   app's own, in js/data.js. The machinery those tables are built with is the
   same for every sport and lives here: progressive overload, the structured
   prescription a rep move is counted by, the X() move factory, and the level
   curve that prices a rank. Nothing in this file names a sport.
   ============================================================ */

import { TRANSFER_FIELD } from "./sport.js";

/* ------------------------------------------------------------
   PROGRESSIVE OVERLOAD  (v2)
   Anchored to the week of Mon May 25, 2026. Capped mid-July.
   Timed work: +2s every 2 weeks.  Rep-based: +1 rep every 2 weeks.
   ------------------------------------------------------------ */
export const OVERLOAD_ANCHOR = new Date(2026, 4, 25);   // May 25 2026 (month is 0-indexed)
export const OVERLOAD_CAP_WEEKS = 7;                    // week 7 ~= mid-July, then frozen

// Returns 1-based training week (1..OVERLOAD_CAP_WEEKS)
export function overloadWeek() {
  const now = new Date();
  if (now < OVERLOAD_ANCHOR) return 1;
  const days = Math.floor((now - OVERLOAD_ANCHOR) / 86400000);
  return Math.min(OVERLOAD_CAP_WEEKS, Math.floor(days / 7) + 1);
}
// Timed work seconds for a given base value, adjusted for the current week.
export function adjWork(baseSeconds) {
  return baseSeconds + Math.floor((overloadWeek() - 1) / 2) * 2;
}
// Extra reps for rep-based sets: +1 every 2 weeks.
export function repBonus() {
  return Math.floor((overloadWeek() - 1) / 2);
}

/* 2026.2 runs with overload PAUSED (the old app's getActiveData() set
   noOverload:true for every 2026.2 day; the Learning panel shows the manual
   table as PAUSED). Flip this to false to re-enable auto-progression. */
export const OVERLOAD_PAUSED = true;

/* Overload-adjusted work seconds for a timed exercise. */
export function exWork(ex) {
  if (ex.work == null) return ex.work;
  return OVERLOAD_PAUSED ? ex.work : adjWork(ex.work);
}
/* Rep count shown for a rep-based exercise, with the +1-rep bonus applied
   to the leading "N reps" figure in repsDetail. */
export function exRepsDetail(ex) {
  if (OVERLOAD_PAUSED) return ex.repsDetail;
  const bonus = repBonus();
  if (!bonus || !ex.repsDetail) return ex.repsDetail;
  return ex.repsDetail.replace(/^(\d+)/, n => parseInt(n, 10) + bonus);
}
/* The structured prescription the runner counts, with the +1-rep overload
   bonus applied. Every consumer that needs to know how many reps, how many
   sides or what tempo goes through here — never through the display string. */
export function exPrescription(ex) {
  const p = ex && ex.prescription;
  if (!p) return null;
  const bonus = OVERLOAD_PAUSED ? 0 : repBonus();
  if (!bonus) return p;
  return normalizePrescription({
    ...p, reps: p.reps + bonus,
    repsHigh: p.repsHigh ? p.repsHigh + bonus : null
  });
}
/* Overload-adjusted dose string for display (bumps a leading rep count,
   or a leading seconds figure for timed work). */
export function exDose(ex) {
  if (ex.byReps || ex.driver === "reps") return exRepsDetail(ex) || ex.dose;
  if (ex.driver === "time" && ex.work != null) {
    const w = exWork(ex);
    return ex.eachSide ? Math.floor(w / 2) + "s/side" : (ex.dose || w + "s");
  }
  return ex.dose;
}

/* ------------------------------------------------------------
   STRUCTURED PRESCRIPTION — what the runner actually counts.

   The runner used to read the DISPLAY string ("2×8/side") with a
   regex that required a digit next to the word "reps". Not one
   prescription in this file is written that way, so every rep
   exercise fell through to a hard-coded 10 and no rep exercise
   ever switched sides. A kid was told 8 per side and counted to
   10 once.

   So the display string is parsed ONCE, here, into structure:

     { sets, reps, repsHigh, sides, dirs, tempo, holdSeconds, unit }

   parsePrescription THROWS on anything it can't read. New content
   that invents a dose format fails loudly at load instead of
   quietly counting to 10 forever.
   ------------------------------------------------------------ */

const DASHES = /[–—−]/g;   // en / em dash, minus → "-"

function fail(detail, why) {
  throw new Error(`parsePrescription: ${why} in "${detail}"`);
}

export function parsePrescription(detail) {
  const raw = String(detail == null ? "" : detail).replace(DASHES, "-").trim();
  if (!raw) fail(detail, "empty prescription");

  // "12 · 2-1-2 tempo" → head "12", modifiers "2-1-2 tempo". Splitting on the
  // separator first keeps a 2-1-2 tempo from being read as a 2-to-1 rep range.
  const parts = raw.split("·").map(p => p.trim()).filter(Boolean);
  let body = parts.shift() || "";
  const mods = parts.join(" ").toLowerCase();

  // leading set count — "2×8", "2x8"
  let sets = 1;
  const setsM = body.match(/^(\d+)\s*[×x]\s*/i);
  if (setsM) { sets = parseInt(setsM[1], 10); body = body.slice(setsM[0].length); }

  // rep count, optionally a range ("8-10") or an approximation ("~24")
  const repsM = body.match(/^~?\s*(\d+)\s*(?:-\s*(\d+))?/);
  if (!repsM) fail(detail, "no rep count");
  const reps = parseInt(repsM[1], 10);
  const repsHigh = repsM[2] ? parseInt(repsM[2], 10) : null;
  if (repsHigh != null && repsHigh < reps) fail(detail, "rep range runs backwards");

  // whatever follows the number says how the reps are divided up
  let tail = body.slice(repsM[0].length).toLowerCase();
  const eat = (re) => { if (!re.test(tail)) return false; tail = tail.replace(re, " "); return true; };
  let sides = 1, dirs = 1, unit = "reps";
  if (eat(/\/\s*side/)) sides = 2;
  if (eat(/\/\s*leg/))  sides = 2;
  if (eat(/\/\s*arm/))  sides = 2;
  if (eat(/\/\s*dir\b/)) dirs = 2;
  if (eat(/\beach\b/))   sides = 2;        // "3/dir each" — each direction, each arm
  if (eat(/\bcycles?\b/)) unit = "cycles";
  if (eat(/\bsteps?\b/))  unit = "steps";
  eat(/\bclean\b/); eat(/\breps?\b/); eat(/\balternating\b/);
  tail = tail.replace(/[()\s]+/g, " ").trim();
  if (tail) fail(detail, `unrecognised "${tail}"`);

  // tempo / hold live after the separator
  let tempo = null, holdSeconds = 0, left = mods;
  const tempoM = left.match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (tempoM) {
    tempo = [parseInt(tempoM[1], 10), parseInt(tempoM[2], 10), parseInt(tempoM[3], 10)];
    left = left.replace(tempoM[0], " ");
  }
  const holdM = left.match(/hold\s*(\d+)\s*s/) || left.match(/(\d+)\s*s\s*hold/);
  if (holdM) { holdSeconds = parseInt(holdM[1], 10); left = left.replace(holdM[0], " "); }
  left = left.replace(/\btempo\b/g, " ").replace(/[()\s]+/g, " ").trim();
  if (left) fail(detail, `unrecognised modifier "${left}"`);

  return normalizePrescription({ sets, reps, repsHigh, sides, dirs, tempo, holdSeconds, unit });
}

/* Fill in the defaults and derive the totals every consumer wants. */
export function normalizePrescription(p) {
  const sets  = Math.max(1, p.sets || 1);
  const reps  = Math.max(1, p.reps || 1);
  const sides = Math.max(1, p.sides || 1);
  const dirs  = Math.max(1, p.dirs  || 1);
  const hold  = Math.max(0, p.holdSeconds || 0);
  // A hold with no explicit tempo IS a tempo: one beat out, hold, one beat back.
  const tempo = p.tempo || (hold > 0 ? [1, hold, 1] : null);
  const segments = sets * sides * dirs;
  return {
    sets, reps, sides, dirs, tempo, holdSeconds: hold,
    repsHigh: p.repsHigh && p.repsHigh > reps ? p.repsHigh : null,
    unit: p.unit || "reps",
    segments, totalReps: segments * reps
  };
}

/* Seconds one rep takes: the tempo when there is one, else the configured
   per-rep estimate the settings own. */
export function repSeconds(p, secondsPerRep = 3) {
  if (p && p.tempo) return p.tempo.reduce((a, b) => a + b, 0);
  return secondsPerRep;
}

const ORDINAL = ["", "first", "second", "third", "fourth"];

/* The ordered list of stretches of work the runner walks through. One segment
   per set × side × direction, each carrying how it should be announced and
   whether reaching it means switching sides. */
export function prescriptionSegments(p) {
  const out = [];
  for (let set = 1; set <= p.sets; set++) {
    for (let side = 1; side <= p.sides; side++) {
      for (let dir = 1; dir <= p.dirs; dir++) {
        const bits = [];
        if (p.sets  > 1) bits.push(`set ${ORDINAL[set] || set}`);
        if (p.sides > 1) bits.push(`${ORDINAL[side] || side} side`);
        if (p.dirs  > 1) bits.push(`${ORDINAL[dir] || dir} direction`);
        const prev = out[out.length - 1];
        out.push({
          set, side, dir, reps: p.reps,
          label: bits.join(", "),
          // What changed since the last segment decides what the coach says.
          transition: !prev ? null
            : prev.side !== side ? "side"
            : prev.dir  !== dir  ? "direction"
            : "set"
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------
   X() — exercise factory. Returns an object compatible with the
   timer/voice runner (work / byReps+repsDetail / reset / cue / redFlag).
   ------------------------------------------------------------ */
export function X(o) {
  const driver = o.driver ||
    (o.work != null ? "time" : (o.repsDetail != null ? "reps" : null));
  const ex = {
    name: o.name,
    block: o.block || "main",
    driver,
    dose: o.dose || "",
    reset: o.reset || "",                 // short setup phrase spoken first
    cue: o.cue || "",
    redFlag: o.fix || null,               // correction (shown as red-flag / "the fix")
    parentWatch: o.parentWatch || null,   // "what to watch" (feeds quiz/cards)
    transfer: o.transfer || o[TRANSFER_FIELD] || null, // skill it builds (feeds quiz/cards)
    faultAnchor: !!o.faultAnchor,
    gate: o.gate || null,                 // null | "valgus"
    parentEcho: !!o.parentEcho,           // anti-extension breath gate
    searchableName: o.searchableName || o.name,
    demoUrl: o.demoUrl || null,
    /* Needs gear fetched or rigged before the clock starts — see needsSetup.
       Set explicitly only where the NAME does not already say so. */
    setup: o.setup === true,
    rest: o.rest != null ? o.rest : 5
  };
  if (driver === "reps") {
    ex.byReps = true;
    ex.repsDetail = o.repsDetail || o.dose;
    // Parsed once, here. The runner reads `prescription`; the display string is
    // only ever shown. `prescription:` overrides the parse where the written
    // dose is short of the truth (Band Ankle 4-Way's "/dir" means four).
    // `tempo:` supplies the cadence a coach knows but the dose doesn't say.
    const parsed = o.prescription
      ? normalizePrescription(o.prescription)
      : parsePrescription(ex.repsDetail);
    ex.prescription = o.tempo && !parsed.tempo
      ? normalizePrescription({ ...parsed, tempo: o.tempo })
      : parsed;
    // The words a coach actually says for this move's cadence. Defaults to
    // Up / Hold / Down; Dead Bug extends and returns, it doesn't go up.
    if (o.tempoWords) ex.tempoWords = o.tempoWords;
  }
  else if (driver === "time") { ex.work = o.work; }
  if (o.eachSide) ex.eachSide = true;
  return ex;
}

/* XP cost of going from level n to n+1 (design curve).
   FROZEN: re-pricing a level silently moves the athlete's current level (the
   same XP total would resolve to a different level), so this curve must not
   change. New ranks are added to LADDER above instead. */
export function levelCost(n) {
  if (n <= 8) return 500 + (n - 1) * 30;
  if (n <= 17) return 1000 + (n - 9) * 45;
  return 1500 + (n - 18) * 50;
}
export function fmtXp(n) { return Math.round(n).toLocaleString("en-US"); }

/* What the coach SAYS the dose is. The screen's `dose` is written to be read
   ("2×8/side", "30s · Parent Echo") and is nonsense out loud, so the spoken
   form is built from the numbers instead of the label.

   A two-sided TIMED move splits `work` in half per side (see eachSide in
   engine.js), so the spoken number is the half — saying "30 seconds per side"
   for a 30-second move would have her hold each side twice as long as the
   plan asks. */
function sayClock(secs) {
  if (secs < 60) return `${secs} second${secs === 1 ? "" : "s"}`;
  const m = Math.floor(secs / 60), r = secs % 60;
  const mins = `${m} minute${m === 1 ? "" : "s"}`;
  return r ? `${mins} ${r} second${r === 1 ? "" : "s"}` : mins;   // "1 minute 15 seconds", not "75 seconds"
}

export function spokenDose(ex) {
  if (!ex) return "";
  if (ex.byReps) {
    const m = String(ex.repsDetail || ex.dose || "").trim()
      .match(/^(?:(\d+)\s*[×x]\s*)?(\d+)\s*(\/\s*side|per side)?/i);
    if (!m) return "";
    const [, sets, reps, side] = m;
    const core = sets ? `${sets} sets of ${reps}` : `${reps} rep${reps === "1" ? "" : "s"}`;
    return side ? `${core} per side` : core;
  }
  const total = Number(ex.work) || 0;
  if (!total) return "";
  const secs = ex.eachSide ? Math.floor(total / 2) : total;
  const said = sayClock(secs);
  return ex.eachSide ? `${said} per side` : said;
}
