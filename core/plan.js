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

  /* Rep count, optionally a range ("8-10") — and the MARKER in front of or
     behind it, which is not decoration. "<=6" on a jump-landing drill is a
     ceiling: no more than six, because the seventh is the sloppy one. "10+"
     is a floor. "~24" is an estimate. The old regex ate "~" and could not see
     the other two at all, so deriving the dose turned every one of them into a
     flat number — and a ceiling silently became a target. */
  const repsM = body.match(/^([~\u2264]?)\s*(\d+)\s*(\+?)\s*(?:-\s*(\d+))?/);
  if (!repsM) fail(detail, "no rep count");
  const approx = repsM[1] || (repsM[3] ? "+" : null);
  const reps = parseInt(repsM[2], 10);
  const repsHigh = repsM[4] ? parseInt(repsM[4], 10) : null;
  if (repsHigh != null && repsHigh < reps) fail(detail, "rep range runs backwards");

  // whatever follows the number says how the reps are divided up
  let tail = body.slice(repsM[0].length).toLowerCase();
  const eat = (re) => { if (!re.test(tail)) return false; tail = tail.replace(re, " "); return true; };
  let sides = 1, dirs = 1, unit = "reps", sideWord = "side";
  if (eat(/\/\s*side/)) sides = 2;
  if (eat(/\/\s*leg/))  { sides = 2; sideWord = "leg"; }
  if (eat(/\/\s*arm/))  { sides = 2; sideWord = "arm"; }
  /* "/dir" USED TO MEAN TWO, SILENTLY, AND THAT WAS THE BUG.

     Band Ankle 4-Way is written "8/dir" and is four directions — it only
     counts right because somebody noticed and passed an explicit
     prescription. Nothing warned them; the parser just picked two. So a
     direction count must now be SAID: "8/4-way", or an explicit
     prescription:{dirs:N}. A bare "/dir" fails at load, where a test catches
     it, rather than quietly costing a child half her reps. */
  const dirM = tail.match(/\/\s*(\d+)\s*-?\s*(?:way|dir)s?\b/) || tail.match(/\b(\d+)\s*-?\s*ways?\b/);
  if (dirM) { dirs = parseInt(dirM[1], 10); tail = tail.replace(dirM[0], " "); }
  else if (/\/\s*dir\b/.test(tail)) {
    fail(detail, "\"/dir\" does not say how many directions — write \"/4-way\" or pass prescription:{dirs:N}");
  }
  if (eat(/\beach\b/))   sides = 2;        // "3/dir each" — each direction, each arm
  if (eat(/\bcycles?\b/)) unit = "cycles";
  if (eat(/\bsteps?\b/))  unit = "steps";
  if (eat(/\brotations?\b/)) unit = "rotations";
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

  return normalizePrescription({ sets, reps, repsHigh, sides, dirs, tempo, holdSeconds, unit, sideWord, approx });
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
  /* SOME MOVES ARE NOT SYMMETRICAL. The right ankle is the stiff one, so Ankle
     Rock asks for eight on the left and ten on the right — which the old shape
     could not say, so the extra two lived in a "(+2 R)" nobody counted and the
     runner did eight and eight. A per-side count says it where the runner can
     read it. Two sides only; anything else is a prescription, not a footnote. */
  const sideReps = Array.isArray(p.sideReps) && p.sideReps.length === sides
    ? p.sideReps.map(n => Math.max(1, Number(n) || 1)) : null;
  const totalReps = sideReps
    ? sets * dirs * sideReps.reduce((a, b) => a + b, 0)
    : segments * reps;
  return {
    sets, reps, sides, dirs, tempo, holdSeconds: hold, sideReps,
    repsHigh: p.repsHigh && p.repsHigh > reps ? p.repsHigh : null,
    unit: p.unit || "reps",
    /* "~24", "<=6", "10+" — a marker the coach honours rather than a number to
       do arithmetic on. Kept beside the count so the screen and the voice can
       both repeat it instead of inventing a precision the plan never claimed. */
    approx: ["~", "\u2264", "+"].includes(p.approx) ? p.approx : null,
    /* "/leg" and "/arm" say which pair of things the two sides ARE. Keeping the
       word means the screen can say "each leg" instead of the vaguer "each
       side" — without the app ever claiming to know which leg she began on. */
    sideWord: ["side", "leg", "arm"].includes(p.sideWord) ? p.sideWord : "side",
    /* NAMED SIDES — only where the PLAN names them.

       Two different questions were being confused. The RUNNER cannot know
       which side she started on: nothing records it, and the coach only ever
       says first and second — which is why "LEFT SIDE" came off the coach
       strip. But the PLAN sometimes does know, because a physio said so: the
       right ankle is the stiff one, the left knee is the one that caves. That
       is a fact about her body, not a guess about the timer, and dropping it
       would lose the reason the two sides differ at all.

       So a side is named here or nowhere. */
    sideNames: Array.isArray(p.sideNames) && p.sideNames.length === sides
      ? p.sideNames.map(String) : null,
    segments, totalReps
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
        if (p.sides > 1) bits.push(p.sideNames ? `${p.sideNames[side - 1]} side` : `${ORDINAL[side] || side} side`);
        if (p.dirs  > 1) bits.push(`${ORDINAL[dir] || dir} direction`);
        const prev = out[out.length - 1];
        out.push({
          set, side, dir, reps: (p.sideReps ? p.sideReps[side - 1] : p.reps),
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
    /* A qualifier that is for READING, never for counting: "dowel on the back",
       "kick only", "about 10 m". These used to be smuggled into the dose string
       in brackets, which is fine while a human types the dose and fatal once it
       is derived — the bracket would simply vanish. It has its own field now,
       and it is shown but never spoken and never parsed. */
    note: o.note || "",
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

/* ------------------------------------------------------------
   ONE GRAMMAR FOR A DOSE, TWO VOICES SAYING IT.

   Band Ankle 4-Way is {reps:8, dirs:4} — thirty-two reps. The ring showed the
   string somebody typed, "8/dir", and the coach read a different string and
   said "8 reps". Three descriptions of one fact, none of them the count the
   runner actually walks, and a kid who did eight and tapped Done was asked
   "Did you get all 32?" — a number she had never been shown.

   So the prescription is described ONCE, here, into parts. The screen and the
   coach are both thin formatters over those parts. They can word things
   differently — a ring has 50 pixels, a sentence has as long as it likes — but
   they can no longer disagree about a number, because neither of them counts.
   ------------------------------------------------------------ */
function plural(n, word) { return n === 1 ? word : word + "s"; }

export function describeDose(p) {
  if (!p) return null;
  const marker = p.approx || "";
  const unit = p.unit || "reps";
  /* What she counts to in one stretch of work. A range keeps both ends: the
     low number is the one the runner counts (see offerExtraReps), and the high
     one is the offer, so hiding it would make the screen stricter than the plan. */
  const count = p.sideReps
    ? (p.sideNames ? p.sideReps.map((n, i) => n + " " + p.sideNames[i]).join(", ") : p.sideReps.join(" then "))
    : marker === "+"
      ? p.reps + "+"
      : marker + p.reps + (p.repsHigh ? "\u2013" + p.repsHigh : "");
  /* How that stretch is repeated. Named in the order she meets them. */
  const divisors = [];
  if (p.dirs  > 1) divisors.push({ kind: "dirs",  n: p.dirs,  short: "\u00d7 " + p.dirs + " ways", long: p.dirs + " ways" });
  if (p.sides > 1) divisors.push({ kind: "sides", n: p.sides, short: "each " + p.sideWord, long: "each " + p.sideWord });
  /* Sets are deliberately NOT a ring divisor: the coach strip already counts
     them live ("SET 1 OF 2"), and the ring is a fixed circle with room for a
     few characters. They belong in the sentence, not the glance. */
  if (p.sets  > 1) divisors.push({ kind: "sets",  n: p.sets,  short: "", long: p.sets + " sets" });
  const totalLow = p.totalReps;
  const totalHigh = p.repsHigh ? p.totalReps + (p.repsHigh - p.reps) * p.segments : null;
  /* A total is worth saying when it is news. "1 rep, 3 sets" totalling
     "3 reps" is not news -- and on Pull-Up (heavy), where the 1 is a
     placeholder for "then as many clean reps as you have", it is a lie. */
  const totalIsNews = p.segments > 1 && !(p.reps === 1 && !p.repsHigh && !p.sideReps);
  const total = totalIsNews
    ? (marker === "+" ? totalLow + "+" : marker + totalLow + (totalHigh ? "\u2013" + totalHigh : ""))
    : "";
  /* "2-1-2 tempo" is three real phases and reads as one. But a tempo whose
     only slow phase is the lower -- [4,0,1] -- is not a rhythm, it is an
     instruction, and the authored strings said so in words ("5 . 4s lower").
     Deriving the dose must not turn that into a code she has to decode. */
  const slowLowerOnly = p.tempo && p.tempo.length === 3 && p.tempo[1] === 0 && p.tempo[2] <= 1;
  const cadence = p.holdSeconds ? p.holdSeconds + "s hold"
    : slowLowerOnly ? p.tempo[0] + "s lower"
    : p.tempo ? p.tempo.join("-") + " tempo" : "";
  /* "1 reps" is the kind of thing a derived string says and a person never
     does. The count is a bare number only when nothing else shapes it. */
  const countedOne = p.reps === 1 && !p.repsHigh && !p.sideReps && !marker;
  const unitFor = countedOne ? unit.replace(/s$/, "") : unit;
  return { count, unit, unitFor, divisors, total, cadence, segments: p.segments, totalReps: p.totalReps };
}

/* The strings a screen shows. `big` goes in the ring, which is a fixed circle
   at 50px — it stays short on purpose. `sub` is the line under it, which is
   where a total can afford to be spelled out. `full` is the sentence for a
   card with room, and `short` is the one-line form for a list. */
export function doseLines(ex) {
  const p = exPrescription(ex);
  if (!p) {
    /* Timed moves have no prescription, but they can still carry a note — the
       target a clock cannot say ("about 3 slides of 20-30s each side"). It
       belongs on the long line, the same place a prescription's note goes. */
    const written = (ex && (ex.dose || ex.repsDetail)) || "";
    const plainNote = (ex && ex.note) || "";
    const longWritten = [written, plainNote].filter(Boolean).join(" \u00b7 ");
    return { big: written, sub: "", full: longWritten, short: written };
  }
  const d = describeDose(p);
  const note = (ex && ex.note) || "";
  const sideways = p.sideReps ? "" : d.divisors.map(x => x.short).filter(Boolean).join(", ");
  const big = [d.count, d.unit !== "reps" ? d.unit : "", sideways].filter(Boolean).join(" ").trim();
  const sub = d.total ? d.total + " " + d.unit + " in total" : "";
  /* When the counts already name the sides ("8 left, 10 right") the side
     divisor has been said — repeating it gives "8 left, 10 right reps each
     side", which is nobody's sentence. */
  const longDivisors = d.divisors.filter(x => !(p.sideReps && x.kind === "sides"));
  const full = [
    longDivisors.reduce((line, x) => line + (x.kind === "sets" ? ", " : " ") + x.long,
                        [d.count, d.unitFor].join(" ")),
    d.total ? d.total + " " + d.unit + " in total" : "",
    d.cadence, note
  ].filter(Boolean).join(" \u00b7 ");
  const short = sub ? big + " \u00b7 " + sub : big;
  return { big, sub, full, short };
}

/* WHAT THE COACH SAYS. Built from the same parts as the screen, so the two
   cannot name different numbers.

   The string branch below is not politeness: a move may carry an explicit
   `prescription:` and a `repsDetail` that is prose — "5-8 (incline if needed)"
   would not survive parsePrescription at all — and the oldest fixtures pass a
   bare object with no prescription. Those still get the reading they had. */
export function spokenDose(ex) {
  if (!ex) return "";
  const p = ex.byReps ? exPrescription(ex) : null;
  if (p) {
    const d = describeDose(p);
    const unit = d.unit === "reps" ? plural(p.reps, "rep") : d.unit;
    /* A marker is a symbol on screen and a WORD out loud: "at most six" is the
       whole point of writing "<=6", and "six" is a different instruction. */
    const lead = p.approx === "\u2264" ? "at most " : p.approx === "+" ? "at least " : p.approx === "~" ? "about " : "";
    let said = p.sideReps
      ? (p.sideNames
          ? `${p.sideReps[0]} on the ${p.sideNames[0]} and ${p.sideReps[1]} on the ${p.sideNames[1]}`
          : `${p.sideReps[0]} on the first side and ${p.sideReps[1]} on the second`)
      : p.sets > 1
        ? `${p.sets} sets of ${lead}${p.repsHigh ? p.reps + " to " + p.repsHigh : p.reps}`
        : `${lead}${p.repsHigh ? p.reps + " to " + p.repsHigh : p.reps} ${unit}`;
    if (p.sides > 1 && !p.sideReps) said += " per side";
    if (p.dirs > 1) said += ` in each of ${p.dirs} directions`;
    /* The total is only worth saying when the segments make it surprising —
       "8 reps per side" is already the whole story, "8 in each of 4 directions"
       is not. This is also what keeps the legacy phrasings word for word. */
    if (p.dirs > 1 || p.sideReps) said += `, ${p.totalReps} in total`;
    /* Where the count is a placeholder for "and then as many as you have",
       the number on its own is not the prescription. The screen already says
       so in the note; the coach must not say less. */
    if (!d.total && p.reps === 1 && !p.repsHigh && ex.note) said += `, ${ex.note}`;
    return said;
  }
  if (ex.byReps) {
    const m = String(ex.repsDetail || ex.dose || "").trim()
      .match(/^(?:(\d+)\s*[\u00d7x]\s*)?(\d+)\s*(\/\s*side|per side)?/i);
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
