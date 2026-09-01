/* ============================================================
   2026.2 CONTENT MODEL — workout data, overload, and static tables.
   Each training day = Warm-up → Coordination → Main (Traffic-Light
   rounds) → Finisher → Swim-Skill. Sunday = Spa (recovery only).
   The AM micro-activation and evening variants were retired with
   the Splash UI rebuild — GO always runs the day's main workout.
   ============================================================ */

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

export const MANTRA = "I am STRONG. I am FAST. I can SWIM THIS.";

export const PRONUNCIATION_MAP = {
  "Pallof Press (band)": "Pal-off Press, band",
  "Pallof Press": "Pal-off Press",
  "Bosu Squat": "Boh-soo Squat"
};

export const ENCOURAGEMENTS_BY_STYLE = {
  classic: [
    "Strong finish.",
    "Good control on that set.",
    "Clean round. Stay steady.",
    "Solid effort.",
    "Discipline is showing. Nice work.",
    "Power and calm. Good combo.",
    "That round looked sharp.",
    "Quality work.",
    "Hold your line.",
    "Keep the form tidy."
  ],
  fun: [
    "Boom. That was awesome!",
    "Level up unlocked!",
    "Big energy. Love it!",
    "You're a beast — keep rolling!",
    "Crushing it. High five!",
    "Whoa, that was clean!",
    "Sparkly form. So good!",
    "You stayed cool under pressure. Nice!",
    "Banger of a round!",
    "That was straight up fire!"
  ],
  encouraging: [
    "You're doing great. Keep going.",
    "Every rep counts. Proud of you.",
    "One round at a time. You've got this.",
    "Breathe — you're strong.",
    "Trust the work. It's adding up.",
    "Steady. Strong. Calm.",
    "You showed up. That matters.",
    "Small wins build big wins.",
    "Your body remembers. Keep teaching it.",
    "Soft hands, strong core. Beautiful."
  ]
};

/* ------------------------------------------------------------
   HOW-TO / VALIDATED COACHING CHANNELS — each block routes to ONE
   trusted channel covering that kind of work. The demo link is a
   broad YouTube search with the channel NAME appended, so it always
   returns real videos while biasing toward the validated channel.
   ------------------------------------------------------------ */
export const COACH_CHANNELS = {
  swim:     { label: "Swim technique",       name: "Effortless Swimming", url: "https://www.youtube.com/@effortlessswimming" },
  mobility: { label: "Mobility & warm-up",   name: "Tom Merrick",         url: "https://www.youtube.com/@TomMerrick" },
  speed:    { label: "Speed & coordination", name: "ALTIS",               url: "https://www.youtube.com/@ALTIS" },
  strength: { label: "Strength & core",      name: "ATHLEAN-X",           url: "https://www.youtube.com/@athleanx" }
};
export const BLOCK_CHANNEL = {
  warmup: "mobility", recovery: "mobility",
  coordination: "speed",
  main: "strength", prep: "strength", finisher: "strength",
  swimskill: "swim"
};
export const channelForBlock = b => COACH_CHANNELS[BLOCK_CHANNEL[b]] || COACH_CHANNELS.strength;
export const yt = (q, ch) =>
  "https://www.youtube.com/results?search_query=" + encodeURIComponent(q + " " + ch.name);

export const EXERCISE_HOWTO = {
  // — 2026.2 swim-skill drills —
  "Chair High-Elbow Catch": {
    text: "Stand bent over a chair-back (or table). With one arm, set a high-elbow catch: forearm turns IN, elbow stays HIGH, fingertips point down. Reach, catch, finish past the hip. Fixes the straight-arm pull.",
    search: "high elbow catch drill on land chair"
  },
  "Towel-Band Catch Pull": {
    text: "Hold a towel or band anchored high. Lead with a bent elbow, pull long and finish the stroke PAST your hip — feel the lats, not the shoulders.",
    search: "band lat pull swimming catch drill"
  },
  "Long-Axis Rotation Roll": {
    text: "Lie in a back-streamline (arms overhead, legs lifted). Roll your whole body as one unit side to side, driving the rotation from the hips — no bending in the middle.",
    search: "long axis rotation core drill swimming"
  },
  "Side-Lying Breath Rehearsal": {
    text: "Lie on your side. Exhale/hum with your face down, rotate so one ear stays in the 'water', take a quick sip of air, return to neutral. Continuous exhale — never hold your breath.",
    search: "side lying freestyle breathing drill"
  },
  "Breaststroke Kick Shape": {
    text: "Lie face-down or sit on the floor. Practice the breaststroke 'whip kick': heels to bum with feet flexed out, then snap the feet back together in a circular kick.",
    search: "breaststroke whip kick dryland rehearsal"
  },
  "Standing Scap Squeeze": {
    text: "Stand tall, arms at your sides or in a W. Squeeze your shoulder blades down and together, hold 2 seconds, release. Wakes up the lats and scap stabilizers.",
    search: "standing scapular retraction squeeze"
  },
  "Standing Hollow Brace": {
    text: "Stand tall. Pull ribs down, tuck pelvis slightly, squeeze glutes and tense your core as if bracing for a punch. Breathe normally while holding the brace.",
    search: "standing core brace ribs down 360 breathing"
  },
  // — Opus-coined / descriptive labels —
  "Hollow-Body Flutter": {
    text: "Lie on your back in a hollow-body hold (lower back PRESSED into the floor, head + shoulders + legs lifted), then flutter-kick your legs quickly. Core stays braced the whole time.",
    search: "hollow body hold flutter kick swimmer"
  },
  "Prone Flutter + Brace": {
    text: "Lie face-down, arms by your sides. Lift legs and chest slightly off the floor (mini-superman) and flutter-kick from the hips while bracing your core.",
    search: "prone flutter kick superman swimmer"
  },
  "Prone Streamline Flutter Hold": {
    text: "Lie face-down with arms in swimming streamline overhead (hands stacked). Lift arms + chest + legs and hold a flutter kick.",
    search: "prone streamline flutter kick hold dryland"
  },
  "Floor Body-Line Hold": {
    text: "Face-down 'swimmer's superman' — arms streamline overhead, legs straight, lift everything off the floor and hold a long, straight body line.",
    search: "swimmer superman body line hold"
  },
  "Slow Flutter-Kick Rehearsal": {
    text: "Lie on your back, legs straight. Flutter-kick SLOWLY from the hips (not knees). It is a rehearsal — focus on quiet, small, controlled kicks, not speed.",
    search: "flutter kick from hips slow rehearsal dryland"
  },
  "Backstroke Arm Shape": {
    text: "Lie on your back and rehearse the backstroke pull shape — one arm enters straight overhead, pinky-first, then sweeps down past the hip while the other recovers. No resistance, just the shape.",
    search: "backstroke arm pull pattern dryland dry land"
  },
  "Dolphin Body-Wave Rehearsal": {
    text: "Stand or lie face-down. Initiate an undulation from the chest, through the hips, finishing at the feet — the same body wave used in butterfly kick. Smooth and rhythmic.",
    search: "dolphin kick body undulation dryland"
  },
  "Ball Prone Stroke Sim": {
    text: "Lie face-down on a stability ball with the ball under your hips/belly. Hold a long body line and simulate freestyle pulls with both arms (or one at a time).",
    search: "stability ball prone freestyle pull swim"
  },
  "Calm Breathing": {
    text: "Box breathing: inhale through the nose for 4 seconds, hold 4, exhale through the nose 4, hold 4. Repeat. Long, quiet, calm breaths.",
    search: "box breathing 4 4 4 4 technique"
  },
  // — Uncommon name aliases (real exercises, easier to search) —
  "Box Jump-Down": {
    text: "Step off a low box, land softly on the balls of your feet with bent knees and 'stick' the landing. Same as a 'Depth Drop'.",
    search: "depth drop landing drill"
  },
  "Streamline Wall Hold": {
    text: "Stand with your back to a wall, arms reaching overhead in swimming streamline (hands stacked, biceps by ears). Squeeze the streamline shape; lower back stays flat against the wall.",
    search: "swimmer streamline wall hold dryland"
  },
  "Streamline Hold": {
    text: "Same as the swimming streamline shape — hands stacked above your head, biceps by the ears, long body. Can be done standing, lying, or on a wall.",
    search: "swimming streamline position dryland"
  },
  "Catch-Position Hold": {
    text: "Set the freestyle 'catch': one arm forward and slightly down, fingertips down, forearm vertical, elbow high (Early Vertical Forearm / EVF). Hold the shape.",
    search: "early vertical forearm EVF catch hold dryland"
  },
  "Stability Ball Freestyle Pull": {
    text: "Lie face-down on a stability ball with the ball under your hips. Hold streamline, then perform slow freestyle pulls keeping a high elbow catch.",
    search: "stability ball freestyle pull simulation swim"
  },
  "Band Single-Arm Pull": {
    text: "Anchor a resistance band in front of you at chest height. Hinge forward into a freestyle posture and pull through the full stroke — entry, catch, push past the hip.",
    search: "resistance band single arm freestyle pull"
  },
  "Side-Lying Hip-Drive Kick": {
    text: "Lie on your side, body in a long line. Drive the top leg up and slightly forward with the hip (not the knee) — like the strong kick used to balance freestyle/back.",
    search: "side lying hip abduction kick swimmer"
  },
  // — warm-up / mobility (biased toward Tom Merrick's clean mobility demos) —
  "Jump Rope": { search: "jump rope basic bounce technique tutorial" },
  "Band Pass-Through": { search: "resistance band pass through shoulder mobility drill Tom Merrick" },
  "Cat-Camel": { search: "cat camel spine mobility exercise tutorial" },
  "90/90 Hip Switch": { search: "90 90 hip switch mobility drill Tom Merrick" },
  "Leg Swings": { search: "leg swings dynamic warm up drill tutorial" },
  "Wall Slides": { search: "wall slides shoulder mobility exercise tutorial" },
  "Open-Book / T-Rotation": { search: "open book thoracic rotation stretch tutorial" },
  "Knee-to-Wall Ankle": { search: "knee to wall ankle mobility drill tutorial" },
  "Short-Foot": { search: "short foot exercise arch activation tutorial" },
  "Shoulder CARs": { search: "shoulder CARs controlled articular rotations tutorial" },
  "Hip Circles": { search: "standing hip circles mobility drill tutorial" },
  "Band Ankle 4-Way": { search: "resistance band ankle four way mobility drill" },
  "World's Greatest Stretch": { search: "world's greatest stretch full body warm up tutorial" },
  // — coordination / running mechanics (biased toward Chari Hawkins' drill demos) —
  "A-March": { search: "A march running drill technique Chari Hawkins" },
  "A-Skip": { search: "A skip running drill technique Chari Hawkins" },
  "Carioca": { search: "carioca drill running technique Chari Hawkins" },
  "Butt Kicks": { search: "butt kicks running drill technique Chari Hawkins" },
  "Ankle Dribbles": { search: "ankle dribbles quick feet running drill" },
  "C-Skip": { search: "C skip running drill technique Chari Hawkins" },
  "Fast Leg": { search: "fast leg cyclic recovery running drill technique" },
  "Straight-Leg Bound": { search: "straight leg bound running drill technique" },
  "Wall Drive": { search: "wall drill sprint knee drive technique" },
  "Falling Start → 3m": { search: "falling start sprint acceleration drill technique" },
  "Lateral Shuffle": { search: "lateral shuffle agility drill technique" },
  // — main / finisher / prep strength & core (biased toward The Prehab Guys' short form demos) —
  "Hollow Tuck Flutter": { search: "hollow body hold flutter kick exercise tutorial" },
  "Clean Pull-Ups": { search: "strict pull up correct form tutorial" },
  "Dead Bug": { search: "dead bug exercise correct form The Prehab Guys" },
  "Glute Bridge March": { search: "glute bridge march exercise The Prehab Guys" },
  "Single-Leg Balance Reach": { search: "single leg balance reach exercise The Prehab Guys" },
  "Band Row": { search: "resistance band row exercise form tutorial" },
  "Bird Dog": { search: "bird dog exercise correct form The Prehab Guys" },
  "Hip Hinge": { search: "hip hinge dowel drill exercise tutorial" },
  "Superman": { search: "superman exercise back extension correct form" },
  "Drop-and-Stick": { search: "depth drop soft landing mechanics drill" },
  "Single-Arm Band Row": { search: "single arm resistance band row exercise tutorial" },
  "Band External Rotation": { search: "band external rotation shoulder exercise The Prehab Guys" },
  "Side-Lying ER": { search: "side lying external rotation shoulder exercise The Prehab Guys" },
  "Pallof Press": { search: "pallof press anti rotation exercise The Prehab Guys" },
  "Side Plank Reach": { search: "side plank reach under exercise tutorial" },
  "Partner Ball Toss": { search: "rotational medicine ball throw exercise tutorial" },
  "Half-Kneeling Chop/Lift": { search: "half kneeling cable chop lift exercise tutorial" },
  "Scap Pull-Up + Dead Hang": { search: "scapular pull up dead hang exercise swimmers shoulder" },
  // — recovery (foam rolling / breathing) —
  "Calves — foam roller": { search: "foam rolling calves technique tutorial" },
  "Quads — roller or gun": { search: "foam rolling quads technique tutorial" },
  "Lats / upper back — roller, arms overhead": { search: "foam rolling lats upper back technique tutorial" },
  "Glutes — foam roller": { search: "foam rolling glutes technique tutorial" },
  "Touch-up — massage gun (parent)": { search: "massage gun technique legs safe use tutorial" },
  "Wind-down — Crocodile / 90-90 breathing": { search: "crocodile breathing 90 90 breathing exercise tutorial" },
  "Forearm Plank Dolphin Undulation": { search: "forearm plank dolphin kick undulation core exercise" },
  "Light Streamline Hold": { search: "swimming streamline position dryland hold" },
  "Easy Single-Leg Balance": { search: "single leg balance exercise The Prehab Guys" }
};

/* Best available YouTube search query for an exercise: a hand-picked
   query (biased toward a specific, kid-appropriate demo source) when
   one exists in EXERCISE_HOWTO, else a generic fallback. */
export function videoSearchQuery(ex) {
  if (!ex || !ex.name) return "";
  const howto = EXERCISE_HOWTO[ex.name];
  if (howto && howto.search) return howto.search;
  return (ex.searchableName || ex.name) + " exercise tutorial correct form";
}
export function videoSearchUrl(ex) {
  const q = videoSearchQuery(ex);
  return q ? "https://www.youtube.com/results?search_query=" + encodeURIComponent(q) : "#";
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
    swimTransfer: o.swimTransfer || null, // skill it builds (feeds quiz/cards)
    faultAnchor: !!o.faultAnchor,
    gate: o.gate || null,                 // null | "valgus"
    parentEcho: !!o.parentEcho,           // anti-extension breath gate
    searchableName: o.searchableName || o.name,
    demoUrl: o.demoUrl || null,
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

/* Light → number of rounds for the Main block. */
export const LIGHT_ROUNDS = { green: 3, yellow: 2, red: 1, recovery: 0 };

/* ---- the valgus gate ------------------------------------------------------
   The Grown-up Zone states the rule plainly: LOCKED means "all jumps stay at
   Drop-and-Stick", UNLOCKED means "jumps allowed beyond Drop-and-Stick". So
   the gate is a CEILING on jump progressions, and Drop-and-Stick is the safe
   floor she earns her way up from — never the thing held back. */
export const VALGUS_FLOOR = "Drop-and-Stick";
export const VALGUS_PROGRESSIONS = ["Box Jump", "Box Jump-Down", "Bosu Squat", "Depth Jump", "Broad Jump"];

/* Top-7 exercises tracked on the Independence Ladder. */
export const TOP7 = [
  "Hollow Tuck Flutter", "Clean Pull-Ups", "Glute Bridge March",
  "Superman", "Single-Leg Balance Reach", "Pallof Press", "Drop-and-Stick"
];

export const MICRO_LOOP = { q: "Where did the power start?", a: "the hips" };
export const BREATH_REHEARSAL =
  "Side-lying head-turn: exhale face-down (hum), rotate, quick sip, rotate back.";

/* Shared finisher + swim-skill block builders */
const FINISHER = () => [
  X({ name: "Scap Pull-Up + Dead Hang", block: "finisher", driver: "time", work: 30,
      dose: "30s", reset: "Hang tall, shoulders ready.",
      cue: "Shoulders slide DOWN, hang and decompress.",
      swimTransfer: "Shoulder control / decompression" })
];

const SWIMSKILL_A = () => [
  X({ name: "Chair High-Elbow Catch", block: "swimskill", driver: "reps", repsDetail: "2×8/side", dose: "2×8/side",
      cue: "Forearm turns IN, elbow stays HIGH, fingertips down — fixes straight-arm. [free/back/fly]",
      swimTransfer: "High-elbow catch", searchableName: "high elbow catch drill chair" }),
  X({ name: "Towel-Band Catch Pull", block: "swimskill", driver: "reps", repsDetail: "2×8/side", dose: "2×8/side",
      cue: "Bent elbow leads, pull long, finish PAST the hip.",
      swimTransfer: "Catch-to-finish pull", searchableName: "band lat pulldown swim catch" }),
  X({ name: "Long-Axis Rotation Roll", block: "swimskill", driver: "reps", repsDetail: "6/side", dose: "6/side",
      cue: "Back-streamline, legs lifted, roll as one unit — drive from the hip.",
      swimTransfer: "Long-axis rotation", searchableName: "long axis rotation drill dryland" }),
  X({ name: "Side-Lying Breath Rehearsal", block: "swimskill", driver: "reps", repsDetail: "2×6/side", dose: "2×6/side",
      cue: "Exhale/hum face-down, rotate (one ear in water), quick sip, neutral.",
      swimTransfer: "Breath timing", searchableName: "side lying breathing drill swimming" }),
  X({ name: "Streamline Hold", block: "swimskill", driver: "time", work: 40, dose: "2×20s",
      cue: "Ribs down, long body, hum the breath.",
      swimTransfer: "Tighter streamline", searchableName: "streamline position hold" })
];
const SWIMSKILL_B = () => [
  X({ name: "Chair High-Elbow Catch", block: "swimskill", driver: "reps", repsDetail: "2×8/side", dose: "2×8/side",
      cue: "Forearm turns IN, elbow stays HIGH, fingertips down — fixes straight-arm. [free/back/fly]",
      swimTransfer: "High-elbow catch", searchableName: "high elbow catch drill chair" }),
  X({ name: "Forearm Plank Dolphin Undulation", block: "swimskill", driver: "reps", repsDetail: "~24", dose: "~24",
      cue: "Wave from chest/hip, not the knees.",
      swimTransfer: "Stroke patterning", searchableName: "forearm plank dolphin undulation" }),
  X({ name: "Breaststroke Kick Shape", block: "swimskill", driver: "reps", repsDetail: "~20", dose: "~20 (kick only)",
      cue: "Heels to seat, sweep, snap together — kick only, no arms.",
      swimTransfer: "Breaststroke kick", searchableName: "breaststroke kick technique on land" }),
  X({ name: "Streamline Hold", block: "swimskill", driver: "time", work: 40, dose: "2×20s",
      cue: "Ribs down, long body, hum the breath.",
      swimTransfer: "Tighter streamline", searchableName: "streamline position hold" })
];
const SWIMSKILL_SAT = () => [
  X({ name: "Chair High-Elbow Catch", block: "swimskill", driver: "reps", repsDetail: "2×8/side", dose: "2×8/side",
      cue: "Forearm turns IN, elbow stays HIGH, fingertips down — fixes straight-arm. [free/back/fly]",
      swimTransfer: "High-elbow catch", searchableName: "high elbow catch drill chair" }),
  X({ name: "Streamline Hold", block: "swimskill", driver: "time", work: 40, dose: "2×20s",
      cue: "Ribs down, long body, hum the breath.",
      swimTransfer: "Tighter streamline", searchableName: "streamline position hold" })
];

/* Coach-handoff + breath-fork notes shown on the swim-skill brief. */
export const COACH_HANDOFF = "Timing is a WATER skill — hand the coach: catch-up · 6-kick switch · single-arm freestyle. Land builds the parts (catch shape, body line, kick posture); the pool assembles the timing.";
export const BREATH_DECISION = "Breath = continuous exhale (hum / bubbles), NOT breath-hold-for-float. This overrides the hold-to-float video because breath-holding feeds the hip-sink fault. Coach preference overrides this.";

/* Intent words picked AFTER Round 1 (targets what R1 revealed). */
export const INTENT_WORDS = ["FAST", "LOCK", "PUSH", "HOLD", "DRIVE"];

export const DAYS = {
  monday: {
    title: "Pull + Hip Drive",
    subtitle: "PM · single pool day",
    badge: "MON",
    theme: "Pull + Hip Drive",
    tag: "PULL + HIP DRIVE",
    mantra: "I am STRONG. I am SMOOTH. I can SWIM THIS.",
    poolLoad: "pm",
    defaultLight: "green",
    timeLo: 18, timeHi: 22,
    equipment: ["Jump rope", "Resistance band", "Pull-up bar", "Mat"],
    prSentinel: "Clean Pull-Ups — clean reps in Round 1",
    blocks: {
      warmup: [
        X({ name: "Jump Rope", block: "warmup", driver: "time", work: 75, dose: "60–90s", cue: "Off the toes, quiet, tall." }),
        X({ name: "Band Pass-Through", block: "warmup", driver: "reps", repsDetail: "8–10", dose: "8–10", cue: "Wide, slow, no shrug." }),
        X({ name: "Cat-Camel", block: "warmup", driver: "reps", repsDetail: "8 cycles", dose: "8 cycles", cue: "Move segment by segment." }),
        X({ name: "90/90 Hip Switch", block: "warmup", driver: "reps", repsDetail: "6/side", dose: "6/side", cue: "Knees lead, sit tall." }),
        X({ name: "Leg Swings", block: "warmup", driver: "reps", repsDetail: "8/dir/leg", dose: "8/dir/leg", cue: "Relaxed, build range." })
      ],
      coordination: [
        X({ name: "A-March", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Knee up, toe up, foot down under hip." }),
        X({ name: "A-Skip", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Same pattern with rhythm." })
      ],
      main: [
        X({ name: "Hollow Tuck Flutter", block: "main", driver: "time", work: 30, dose: "30s · Parent Echo",
            parentEcho: true, faultAnchor: true, reset: "Ribs down, low back glued.",
            cue: "Ribs down, low back glued to floor.",
            parentWatch: "Rib flare / breath-holding", fix: "Exhale slowly, count aloud.",
            swimTransfer: "Body line + kick" }),
        X({ name: "Clean Pull-Ups", block: "main", driver: "reps", repsDetail: "2–3 clean reps", dose: "2–3 clean",
            reset: "Shoulders sink first.", cue: "Shoulders sink first, THEN bend.",
            parentWatch: "Kipping / swinging", fix: "One swing = set over.",
            swimTransfer: "Catch with the lats" }),
        X({ name: "Dead Bug", block: "main", driver: "reps", repsDetail: "8/side", dose: "8/side", faultAnchor: true, tempo: [2, 0, 2], tempoWords: ["Extend", "", "Return"],
            reset: "Back flat, exhale on extend.", cue: "Exhale as limbs extend, back flat.",
            parentWatch: "Low back lifts off floor", fix: "Smaller range.",
            swimTransfer: "Brace under breathing" }),
        X({ name: "Glute Bridge March", block: "main", driver: "reps", repsDetail: "8–10/side", dose: "8–10/side", faultAnchor: true, tempo: [2, 1, 2],
            reset: "Drive from the hip.", cue: "Drive from the HIP, not the heel.",
            parentWatch: "Pelvis tilts / drops", fix: "Slow down, level the pelvis.",
            swimTransfer: "Hip = the motor" }),
        X({ name: "Single-Leg Balance Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
            reset: "Quiet foot, knee over toe.", cue: "Quiet foot, knee over toe. Progress: eyes-open → eyes-closed → folded towel.",
            parentWatch: "Knee caves inward", fix: "Reach shorter, slow down.",
            swimTransfer: "Start / turn line" })
      ],
      finisher: FINISHER(),
      swimskill: SWIMSKILL_A()
    },
    prepMenu: []
  },

  tuesday: {
    title: "Anti-Rotation + Posterior",
    subtitle: "AM+PM pool · double day · priming, not a workout",
    badge: "TUE",
    theme: "Anti-Rotation + Posterior",
    tag: "ANTI-ROTATION",
    mantra: "I am SHARP. I am STRONG. I can SWIM THIS.",
    poolLoad: "double",
    defaultLight: "green",
    timeLo: 18, timeHi: 18,
    equipment: ["Resistance band", "Dowel", "Mat"],
    prSentinel: "Hollow Tuck Flutter — seconds held flat",
    blocks: {
      warmup: [
        X({ name: "Wall Slides", block: "warmup", driver: "reps", repsDetail: "8", dose: "8", cue: "Back on wall, ribs down — no arching." }),
        X({ name: "Open-Book / T-Rotation", block: "warmup", driver: "reps", repsDetail: "6/side", dose: "6/side", cue: "Hips stacked, rotate from the spine." }),
        X({ name: "90/90 Hip Switch", block: "warmup", driver: "reps", repsDetail: "6/side", dose: "6/side", cue: "Knees lead, sit tall." }),
        X({ name: "Knee-to-Wall Ankle", block: "warmup", driver: "reps", repsDetail: "8/side", dose: "8/side", cue: "Heel flat, knee past toes." }),
        X({ name: "Short-Foot", block: "warmup", driver: "time", work: 20, dose: "20s", cue: "Spread toes, dome the arch." })
      ],
      coordination: [
        X({ name: "A-March", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Knee up, toe up, foot down under hip." }),
        X({ name: "Carioca", block: "coordination", driver: "time", work: 60, dose: "10m/side", cue: "Hip over hip — trunk-hip separation." })
      ],
      main: [
        X({ name: "Hollow Tuck Flutter", block: "main", driver: "time", work: 30, dose: "30s · Parent Echo",
            parentEcho: true, faultAnchor: true, reset: "Ribs down, low back glued.",
            cue: "Ribs down, low back glued to floor.",
            parentWatch: "Rib flare / breath-holding", fix: "Exhale slowly, count aloud.",
            swimTransfer: "Body line + kick" }),
        X({ name: "Band Row", block: "main", driver: "reps", repsDetail: "12 · 2-1-2 tempo", dose: "12 · 2-1-2",
            reset: "Blades first.", cue: "Drive elbows back, squeeze the blades.",
            parentWatch: "Shrugging / arms-only", fix: "Reset, blades first.",
            swimTransfer: "Freestyle pull" }),
        X({ name: "Bird Dog", block: "main", driver: "reps", repsDetail: "8/side", dose: "8/side", tempo: [1, 5, 1], tempoWords: ["Extend", "Hold", "Return"],
            reset: "Flat back.", cue: "Flat back, no hip rotation.",
            parentWatch: "Hips rotate", fix: "Slow down, reduce reach.",
            swimTransfer: "Posterior body line" }),
        X({ name: "Hip Hinge", block: "main", driver: "reps", repsDetail: "8 · 2-1-2", dose: "8 · 2-1-2 (dowel)",
            reset: "Hips load back.", cue: "Hips load back, dowel touches 3 points.",
            parentWatch: "Rounding the back", fix: "Hinge from the hip, flat back.",
            swimTransfer: "Hip drive for the start" }),
        X({ name: "Single-Leg Balance Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
            reset: "Quiet foot, knee over toe.", cue: "Quiet foot, knee over toe. Progress: eyes-open → eyes-closed → folded towel.",
            parentWatch: "Knee caves inward", fix: "Reach shorter, slow down.",
            swimTransfer: "Start / turn line" })
      ],
      finisher: FINISHER(),
      swimskill: SWIMSKILL_B()
    },
    prepMenu: [
      X({ name: "Pallof Press", block: "main", driver: "reps", repsDetail: "10/side · 2s hold", dose: "10/side · 2s hold",
          cue: "Press out, hold, hips square — resist the twist.",
          parentWatch: "Body rotates on the press", fix: "Lower tension, hips square.",
          swimTransfer: "Anti-rotation / less roll" }),
      X({ name: "Side Plank Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
          cue: "Hips stacked and lifted, reach under and back.",
          parentWatch: "Hip drops", fix: "Lift the hip, shorten the reach.",
          swimTransfer: "Anti-side-bend" })
    ]
  },

  wednesday: {
    title: "Rhythm + Dynamic",
    subtitle: "PM pool day",
    badge: "WED",
    theme: "Rhythm + Dynamic",
    tag: "RHYTHM + DYNAMIC",
    mantra: "Practice makes perfect.",
    poolLoad: "pm",
    defaultLight: "green",
    timeLo: 20, timeHi: 20,
    equipment: ["Jump rope", "Pull-up bar", "Mat"],
    prSentinel: "Drop-and-Stick — clean landings out of 5",
    blocks: {
      warmup: [
        X({ name: "Jump Rope", block: "warmup", driver: "time", work: 75, dose: "60–90s", cue: "Off the toes, quiet, tall." }),
        X({ name: "Wall Slides", block: "warmup", driver: "reps", repsDetail: "8", dose: "8", cue: "Back on wall, ribs down — no arching." }),
        X({ name: "Open-Book / T-Rotation", block: "warmup", driver: "reps", repsDetail: "6/side", dose: "6/side", cue: "Hips stacked, rotate from the spine." }),
        X({ name: "90/90 Hip Switch", block: "warmup", driver: "reps", repsDetail: "6/side", dose: "6/side", cue: "Knees lead, sit tall." }),
        X({ name: "Knee-to-Wall Ankle", block: "warmup", driver: "reps", repsDetail: "8/side", dose: "8/side", cue: "Heel flat, knee past toes." })
      ],
      coordination: [
        X({ name: "A-March", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Knee up, toe up, foot down under hip." }),
        X({ name: "A-Skip", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Same pattern with rhythm." }),
        X({ name: "Carioca", block: "coordination", driver: "time", work: 60, dose: "10m/side", cue: "Hip over hip — trunk-hip separation." })
      ],
      main: [
        X({ name: "Hollow Tuck Flutter", block: "main", driver: "time", work: 30, dose: "30s · Parent Echo",
            parentEcho: true, faultAnchor: true, reset: "Ribs down, low back glued.",
            cue: "Ribs down, low back glued to floor.",
            parentWatch: "Rib flare / breath-holding", fix: "Exhale slowly, count aloud.",
            swimTransfer: "Body line + kick" }),
        X({ name: "Clean Pull-Ups", block: "main", driver: "reps", repsDetail: "2–3 clean reps", dose: "2–3 clean",
            reset: "Shoulders sink first.", cue: "Shoulders sink first, THEN bend.",
            parentWatch: "Kipping / swinging", fix: "One swing = set over.",
            swimTransfer: "Catch with the lats" }),
        X({ name: "Superman", block: "main", driver: "time", work: 30, dose: "3 × 8–10s hold",
            reset: "Lift into streamline.", cue: "Lift arms+legs into streamline, hold.",
            parentWatch: "Neck strains / fast pumping", fix: "Lower the lift, hold the shape.",
            swimTransfer: "Dry-land streamline" }),
        X({ name: "Glute Bridge March", block: "main", driver: "reps", repsDetail: "8–10/side", dose: "8–10/side", faultAnchor: true, tempo: [2, 1, 2],
            reset: "Drive from the hip.", cue: "Drive from the HIP, not the heel.",
            parentWatch: "Pelvis tilts / drops", fix: "Slow down, level the pelvis.",
            swimTransfer: "Hip = the motor" }),
        X({ name: "Single-Leg Balance Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
            reset: "Quiet foot, knee over toe.", cue: "Quiet foot, knee over toe. Progress: eyes-open → eyes-closed → folded towel.",
            parentWatch: "Knee caves inward", fix: "Reach shorter, slow down.",
            swimTransfer: "Start / turn line" }),
        X({ name: "Drop-and-Stick", block: "main", driver: "reps", repsDetail: "5 · hold 3s", dose: "5 · hold 3s",
            gate: "valgus", reset: "Land soft, knees over toes.",
            cue: "Land soft, knees apart over toes, freeze.",
            parentWatch: "Knees cave inward (valgus)", fix: "Stop, reset stance, slower.",
            swimTransfer: "Turn / landing absorption" })
      ],
      finisher: FINISHER(),
      swimskill: SWIMSKILL_A()
    },
    prepMenu: []
  },

  thursday: {
    title: "Pull-Up Rest + Control",
    subtitle: "PM pool day · band work only",
    badge: "THU",
    theme: "Pull-Up Rest + Control",
    tag: "CONTROL",
    mantra: "I am SHARP. I am FAST. I can SWIM THIS.",
    poolLoad: "pm",
    defaultLight: "green",
    timeLo: 19, timeHi: 19,
    equipment: ["Resistance band", "Mat"],
    prSentinel: "Hollow Tuck Flutter — seconds held flat",
    blocks: {
      warmup: [
        X({ name: "Band Pass-Through", block: "warmup", driver: "reps", repsDetail: "8–10", dose: "8–10", cue: "Wide, slow, no shrug." }),
        X({ name: "Shoulder CARs", block: "warmup", driver: "reps", repsDetail: "3/dir each", dose: "3/dir each", cue: "Slow full circle, control the range." }),
        X({ name: "Hip Circles", block: "warmup", driver: "reps", repsDetail: "8/dir", dose: "8/dir", cue: "Big slow circles." }),
        X({ name: "Band Ankle 4-Way", block: "warmup", driver: "reps", repsDetail: "8/dir", dose: "8/dir", cue: "Slow, full range each direction.",
            prescription: { reps: 8, dirs: 4 } }),
        X({ name: "Leg Swings", block: "warmup", driver: "reps", repsDetail: "8/dir/leg", dose: "8/dir/leg", cue: "Relaxed, build range." })
      ],
      coordination: [
        X({ name: "A-March", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Knee up, toe up, foot down under hip." }),
        X({ name: "Butt Kicks", block: "coordination", driver: "time", work: 60, dose: "15s", cue: "Heels recover fast under the butt." }),
        X({ name: "Ankle Dribbles", block: "coordination", driver: "time", work: 60, dose: "15s", cue: "Low, fast, stiff ankle." })
      ],
      main: [
        X({ name: "Hollow Tuck Flutter", block: "main", driver: "time", work: 30, dose: "30s · Parent Echo",
            parentEcho: true, faultAnchor: true, reset: "Ribs down, low back glued.",
            cue: "Ribs down, low back glued to floor.",
            parentWatch: "Rib flare / breath-holding", fix: "Exhale slowly, count aloud.",
            swimTransfer: "Body line + kick" }),
        X({ name: "Single-Arm Band Row", block: "main", driver: "reps", repsDetail: "10/side", dose: "10/side",
            reset: "Torso completely still.", cue: "Torso completely still.",
            parentWatch: "Torso rotates", fix: "Lower tension, widen base.",
            swimTransfer: "Anti-roll in the pull" }),
        X({ name: "Dead Bug", block: "main", driver: "reps", repsDetail: "8/side", dose: "8/side", faultAnchor: true, tempo: [2, 0, 2], tempoWords: ["Extend", "", "Return"],
            reset: "Back flat, exhale on extend.", cue: "Exhale as limbs extend, back flat.",
            parentWatch: "Low back lifts off floor", fix: "Smaller range.",
            swimTransfer: "Brace under breathing" }),
        X({ name: "Glute Bridge March", block: "main", driver: "reps", repsDetail: "8–10/side", dose: "8–10/side", faultAnchor: true, tempo: [2, 1, 2],
            reset: "Drive from the hip.", cue: "Drive from the HIP, not the heel.",
            parentWatch: "Pelvis tilts / drops", fix: "Slow down, level the pelvis.",
            swimTransfer: "Hip = the motor" }),
        X({ name: "Single-Leg Balance Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
            reset: "Quiet foot, knee over toe.", cue: "Quiet foot, knee over toe. Progress: eyes-open → eyes-closed → folded towel.",
            parentWatch: "Knee caves inward", fix: "Reach shorter, slow down.",
            swimTransfer: "Start / turn line" })
      ],
      finisher: FINISHER(),
      swimskill: SWIMSKILL_B()
    },
    prepMenu: [
      X({ name: "Band External Rotation", block: "main", driver: "reps", repsDetail: "12/side", dose: "12/side",
          cue: "Elbow pinned to the side, rotate slow.",
          parentWatch: "Elbow drifts off the ribs", fix: "Pin the elbow, slow down.",
          swimTransfer: "Shoulder durability" }),
      X({ name: "Side-Lying ER", block: "main", driver: "reps", repsDetail: "10/side", dose: "10/side",
          cue: "Second cuff angle — light, slow.",
          parentWatch: "Rushing / too heavy", fix: "Lighter, slower.",
          swimTransfer: "Shoulder durability" })
    ]
  },

  friday: {
    title: "Light Stability + Shoulder",
    subtitle: "AM pool only · fresh day",
    badge: "FRI",
    theme: "Light Stability + Shoulder",
    tag: "STABILITY + SHOULDER",
    mantra: "Sweat in training, no tears in competition.",
    poolLoad: "am",
    defaultLight: "green",
    timeLo: 19, timeHi: 23,
    equipment: ["Jump rope", "Resistance band", "Dowel", "Mat"],
    prSentinel: "Hollow Tuck Flutter — seconds held flat",
    blocks: {
      warmup: [
        X({ name: "Jump Rope", block: "warmup", driver: "time", work: 75, dose: "60–90s", cue: "Off the toes, quiet, tall." }),
        X({ name: "Wall Slides", block: "warmup", driver: "reps", repsDetail: "8", dose: "8", cue: "Back on wall, ribs down — no arching." }),
        X({ name: "Shoulder CARs", block: "warmup", driver: "reps", repsDetail: "3/dir each", dose: "3/dir each", cue: "Slow full circle, control the range." }),
        X({ name: "World's Greatest Stretch", block: "warmup", driver: "reps", repsDetail: "4/side", dose: "4/side", cue: "Lunge, reach, rotate — whole body opens." }),
        X({ name: "Short-Foot", block: "warmup", driver: "time", work: 20, dose: "20s", cue: "Spread toes, dome the arch." })
      ],
      coordination: [
        X({ name: "A-March", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Knee up, toe up, foot down under hip." }),
        X({ name: "C-Skip", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Paw the ground back under the hip." }),
        X({ name: "Fast Leg", block: "coordination", driver: "time", work: 60, dose: "4/side", cue: "One sharp snap leg in a march." })
      ],
      main: [
        X({ name: "Hollow Tuck Flutter", block: "main", driver: "time", work: 30, dose: "30s · Parent Echo",
            parentEcho: true, faultAnchor: true, reset: "Ribs down, low back glued.",
            cue: "Ribs down, low back glued to floor.",
            parentWatch: "Rib flare / breath-holding", fix: "Exhale slowly, count aloud.",
            swimTransfer: "Body line + kick" }),
        X({ name: "Clean Pull-Ups", block: "main", driver: "reps", repsDetail: "2–3 clean reps", dose: "2–3 clean",
            reset: "Shoulders sink first.", cue: "Shoulders sink first, THEN bend.",
            parentWatch: "Kipping / swinging", fix: "One swing = set over.",
            swimTransfer: "Catch with the lats" }),
        X({ name: "Bird Dog", block: "main", driver: "reps", repsDetail: "8/side", dose: "8/side", tempo: [1, 5, 1], tempoWords: ["Extend", "Hold", "Return"],
            reset: "Flat back.", cue: "Flat back, no hip rotation.",
            parentWatch: "Hips rotate", fix: "Slow down, reduce reach.",
            swimTransfer: "Posterior body line" }),
        X({ name: "Hip Hinge", block: "main", driver: "reps", repsDetail: "8 · 2-1-2", dose: "8 · 2-1-2 (dowel)",
            reset: "Hips load back.", cue: "Hips load back, dowel touches 3 points.",
            parentWatch: "Rounding the back", fix: "Hinge from the hip, flat back.",
            swimTransfer: "Hip drive for the start" }),
        X({ name: "Single-Leg Balance Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
            reset: "Quiet foot, knee over toe.", cue: "Quiet foot, knee over toe. Progress: eyes-open → eyes-closed → folded towel.",
            parentWatch: "Knee caves inward", fix: "Reach shorter, slow down.",
            swimTransfer: "Start / turn line" })
      ],
      finisher: FINISHER(),
      swimskill: SWIMSKILL_A()
    },
    prepMenu: [
      X({ name: "Pallof Press", block: "main", driver: "reps", repsDetail: "10/side · 2s hold", dose: "10/side · 2s hold",
          cue: "Resist the twist, hips square.",
          parentWatch: "Body rotates on the press", fix: "Lower tension, hips square.",
          swimTransfer: "Anti-rotation / less roll" }),
      X({ name: "Side Plank Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
          cue: "Hips lifted, reach under and back.",
          parentWatch: "Hip drops", fix: "Lift the hip, shorten the reach.",
          swimTransfer: "Anti-side-bend" })
    ]
  },

  saturday: {
    title: "Athletic Day — Coordination + Power",
    subtitle: "No pool · the week's main dryland day",
    badge: "SAT",
    theme: "Coordination + Power",
    tag: "COORD + POWER",
    mantra: "I am STRONG. I am FAST. I can SWIM THIS.",
    poolLoad: "none",
    defaultLight: "green",
    timeLo: 23, timeHi: 28,
    equipment: ["Jump rope", "Pull-up bar", "Med ball / partner", "Mat"],
    prSentinel: "Drop-and-Stick — clean landings out of 5",
    blocks: {
      warmup: [
        X({ name: "Jump Rope", block: "warmup", driver: "time", work: 75, dose: "60–90s", cue: "Off the toes, quiet, tall." }),
        X({ name: "World's Greatest Stretch", block: "warmup", driver: "reps", repsDetail: "4/side", dose: "4/side", cue: "Lunge, reach, rotate — whole body opens." }),
        X({ name: "Open-Book / T-Rotation", block: "warmup", driver: "reps", repsDetail: "6/side", dose: "6/side", cue: "Hips stacked, rotate from the spine." }),
        X({ name: "90/90 Hip Switch", block: "warmup", driver: "reps", repsDetail: "6/side", dose: "6/side", cue: "Knees lead, sit tall." }),
        X({ name: "Band Ankle 4-Way", block: "warmup", driver: "reps", repsDetail: "8/dir", dose: "8/dir", cue: "Slow, full range each direction.",
            prescription: { reps: 8, dirs: 4 } })
      ],
      coordination: [
        X({ name: "C-Skip", block: "coordination", driver: "time", work: 60, dose: "10m", cue: "Paw the ground back under the hip." }),
        X({ name: "Fast Leg", block: "coordination", driver: "time", work: 60, dose: "4/side", cue: "One sharp snap leg in a march." }),
        X({ name: "Straight-Leg Bound", block: "coordination", driver: "time", work: 60, dose: "6 reps", cue: "Stiff-leg drive, active foot strike." }),
        X({ name: "Wall Drive", block: "coordination", driver: "time", work: 60, dose: "6/side", cue: "Lean on wall, drive knee, hold line." }),
        X({ name: "Falling Start → 3m", block: "coordination", driver: "time", work: 60, dose: "3 reps", cue: "Lean, fall, catch with 3 strides." }),
        X({ name: "Lateral Shuffle", block: "coordination", driver: "time", work: 60, dose: "10m/side", cue: "Stay low, don't cross your feet." })
      ],
      main: [
        X({ name: "Hollow Tuck Flutter", block: "main", driver: "time", work: 30, dose: "30s · Parent Echo",
            parentEcho: true, faultAnchor: true, reset: "Ribs down, low back glued.",
            cue: "Ribs down, low back glued to floor.",
            parentWatch: "Rib flare / breath-holding", fix: "Exhale slowly, count aloud.",
            swimTransfer: "Body line + kick" }),
        X({ name: "Clean Pull-Ups", block: "main", driver: "reps", repsDetail: "2–3 clean reps", dose: "2–3 clean",
            reset: "Shoulders sink first.", cue: "Shoulders sink first, THEN bend.",
            parentWatch: "Kipping / swinging", fix: "One swing = set over.",
            swimTransfer: "Catch with the lats" }),
        X({ name: "Superman", block: "main", driver: "time", work: 30, dose: "3 × 8–10s hold",
            reset: "Lift into streamline.", cue: "Lift arms+legs into streamline, hold.",
            parentWatch: "Neck strains / fast pumping", fix: "Lower the lift, hold the shape.",
            swimTransfer: "Dry-land streamline" }),
        X({ name: "Glute Bridge March", block: "main", driver: "reps", repsDetail: "8–10/side", dose: "8–10/side", faultAnchor: true, tempo: [2, 1, 2],
            reset: "Drive from the hip.", cue: "Drive from the HIP, not the heel.",
            parentWatch: "Pelvis tilts / drops", fix: "Slow down, level the pelvis.",
            swimTransfer: "Hip = the motor" }),
        X({ name: "Single-Leg Balance Reach", block: "main", driver: "time", work: 40, eachSide: true, dose: "20s/side",
            reset: "Quiet foot, knee over toe.", cue: "Quiet foot, knee over toe. Progress: eyes-open → eyes-closed → folded towel.",
            parentWatch: "Knee caves inward", fix: "Reach shorter, slow down.",
            swimTransfer: "Start / turn line" }),
        X({ name: "Drop-and-Stick", block: "main", driver: "reps", repsDetail: "5 · hold 3s", dose: "5 · hold 3s",
            gate: "valgus", reset: "Land soft, knees over toes.",
            cue: "Land soft, knees apart over toes, freeze.",
            parentWatch: "Knees cave inward (valgus)", fix: "Stop, reset stance, slower.",
            swimTransfer: "Turn / landing absorption" })
      ],
      finisher: FINISHER(),
      swimskill: SWIMSKILL_SAT()
    },
    prepMenu: [
      X({ name: "Partner Ball Toss", block: "main", driver: "reps", repsDetail: "2×8", dose: "2×8",
          cue: "Throw from the hips and core, not just arms.",
          parentWatch: "All arms, no hip", fix: "Load the hip, then throw.",
          swimTransfer: "Rotation production" }),
      X({ name: "Half-Kneeling Chop/Lift", block: "main", driver: "reps", repsDetail: "8/side", dose: "8/side",
          cue: "Rotate through the hip, controlled.",
          parentWatch: "Twisting from the low back", fix: "Rotate through the hip, slow.",
          swimTransfer: "Cleaner stroke roll" })
    ]
  },

  sunday: {
    title: "Spa Sunday — Recovery Only",
    subtitle: "No main, no finisher · recovery is scheduled, not optional",
    badge: "SUN",
    theme: "Recovery",
    tag: "",
    mantra: "Rest IS training.",
    poolLoad: "none",
    defaultLight: "recovery",
    timeLo: 10, timeHi: 12,
    spa: true,
    equipment: ["Foam roller", "Massage gun (parent-operated)", "Mat"],
    safety: "Roller slow (2–3 cm/sec), pause 20s on tender spots. NEVER roll the lower-back spine or neck. Massage gun is PARENT-OPERATED only, lowest speed, big muscles only — never on bones, joints, spine, neck, or growth plates.",
    recovery: [
      { name: "Calves — foam roller", dose: "60s/side", why: "Kick + rope volume lands here." },
      { name: "Quads — roller or gun", dose: "60s/side", why: "Jump days (Wed/Sat)." },
      { name: "Lats / upper back — roller, arms overhead", dose: "60s", why: "Pull work + overhead range." },
      { name: "Glutes — foam roller", dose: "45s/side", why: "Bridge + landing absorption." },
      { name: "Touch-up — massage gun (parent)", dose: "30–45s/muscle", why: "Lowest speed, comfort not pain." },
      { name: "Wind-down — Crocodile / 90-90 breathing", dose: "2 min", why: "Closes the week down-regulated." }
    ],
    recoveryHolds: [
      X({ name: "Light Streamline Hold", block: "swimskill", driver: "time", work: 20, dose: "2×20s", cue: "Easy, long, relaxed." }),
      X({ name: "Easy Single-Leg Balance", block: "swimskill", driver: "time", work: 40, eachSide: true, dose: "20s/side", cue: "Gentle, quiet foot." })
    ],
    blocks: { warmup: [], coordination: [], main: [], finisher: [], swimskill: [] },
    prepMenu: []
  }
};

export const STANDING_RULES = [
  "No-Debt / Stop: a missed day is never doubled. Quality over quantity.",
  "Jump rope: single / no-pool days only — never double-pool days.",
  "Valgus gate: all jumps stay at Drop-and-Stick until 5/5 clean landings ×2 weeks.",
  "Parent Echo: hum/count out loud on anti-extension holds. Can't hear it = the rep doesn't count.",
  "Coordination / sprint always FRESH — first after warm-up, never to fatigue."
];

export const ENGAGEMENT_SYSTEMS = {
  peer: { label: "Peer Challenge vs Parent", desc: "Same marker, parent genuinely tries. Reveal after both are done." },
  roleflip: { label: "Role Flip", desc: "Jess demos one exercise + gives the parent ONE coaching cue." }
};

/* ------------------------------------------------------------
   Day keys — repo uses monday..sunday; the design's week strip
   runs Mon-first with short keys. One mapping, applied everywhere.
   ------------------------------------------------------------ */
export const WEEK_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const DAY_SHORT = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun"
};
export const DAY_LONG = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday"
};

export const BLOCK_ORDER = ["warmup", "coordination", "main", "finisher", "swimskill"];
export const BLOCK_LABEL = {
  warmup: "Warm-up", coordination: "Coordination", main: "Main Circuit",
  prep: "Prep Pair", finisher: "Finisher", swimskill: "Swim-Skill", recovery: "Recovery"
};
/* Per-block emoji + Splash token color so the kid always knows which part she's in. */
export const BLOCK_META = {
  warmup:       { emoji: "🔥", color: "var(--coral)",  wash: "var(--coral-wash)",  ink: "var(--coral-ink)" },
  coordination: { emoji: "⚡", color: "var(--sun)",    wash: "var(--sun-wash)",    ink: "var(--sun-ink)" },
  main:         { emoji: "💪", color: "var(--sea)",    wash: "var(--sea-wash)",    ink: "var(--sea-ink)" },
  prep:         { emoji: "🎯", color: "var(--grape)",  wash: "var(--grape-wash)",  ink: "var(--grape-ink)" },
  finisher:     { emoji: "🪝", color: "var(--mint)",   wash: "var(--mint-wash)",   ink: "var(--mint-ink)" },
  swimskill:    { emoji: "🏊", color: "var(--aqua)",   wash: "var(--aqua-wash)",   ink: "var(--aqua-ink)" },
  recovery:     { emoji: "🧊", color: "var(--grape)",  wash: "var(--grape-wash)",  ink: "var(--grape-ink)" }
};

export const MIN_REST = 3;
/* Re-exported from util so the constant has exactly one definition. */
export { SIDE_SWITCH_BUFFER } from "./util.js";
export const ROUND_REST = 25;   // flat all weeks (settings can override)

/* ============================================================
   SPLASH DESIGN DATA — journey ranks, lore, prizes, readiness.
   Ported from the design prototypes (behavioral spec).
   ============================================================ */

export const CHEERS = [
  "Boom — that was awesome! 🌟", "Sparkly form, keep it up! ✨", "Big energy. Love it! 💪",
  "You stayed steady. Nice! 🌊", "Clean round — power and calm! 🏊"
];

/* Rank ladder — every original rank AND its level threshold is untouched, so
   a rank that has been earned can never move backwards. levelCost() below is
   likewise frozen for the same reason.

   The top eight ranks (29 → 50) extend the summit past Marlin. Raising the
   ceiling — rather than re-pricing levels or clawing XP back — is the only
   lever that adds a real climb ahead WITHOUT moving an already-earned level. */
export const LADDER = [
  { level: 1,  name: "Seahorse",       icon: "🌊", habitat: "#FF9B7A" },
  { level: 3,  name: "Sea Turtle",     icon: "🐢", habitat: "#4FAE7A" },
  { level: 6,  name: "Penguin",        icon: "🐧", habitat: "#BFE3F5" },
  { level: 9,  name: "Sea Otter",      icon: "🦦", habitat: "#2F8F5B" },
  { level: 12, name: "Stingray",       icon: "🌊", habitat: "#E7C486" },
  { level: 15, name: "Dolphin",        icon: "🐬", habitat: "#5FD1E0" },
  { level: 18, name: "Shark",          icon: "🦈", habitat: "#1E6E82" },
  { level: 21, name: "Orca",           icon: "🐋", habitat: "#9FD8EA" },
  { level: 24, name: "Sailfish",       icon: "🌊", habitat: "#3FC7D9" },
  { level: 26, name: "Marlin",         icon: "🏆", habitat: "#F2C14E" },
  { level: 29, name: "Sea Lion",       icon: "🦭", habitat: "#C9A227" },
  { level: 32, name: "Octopus",        icon: "🐙", habitat: "#B5646F" },
  { level: 35, name: "Giant Squid",    icon: "🦑", habitat: "#6E5A8E" },
  { level: 38, name: "Humpback Whale", icon: "🐳", habitat: "#3C7E9C" },
  { level: 41, name: "Blue Whale",     icon: "🐋", habitat: "#2B5F86" },
  { level: 44, name: "Storm Rider",    icon: "🌩️", habitat: "#4C5C78" },
  { level: 47, name: "Ocean Guardian", icon: "🔱", habitat: "#1F8A70" },
  { level: 50, name: "Ocean Legend",   icon: "👑", habitat: "#F2A65A" }
];

/* The final rung — nothing above this level changes rank, so the UI can
   honestly say "you're at the summit" instead of teasing a next rank. */
export const MAX_LEVEL = LADDER[LADDER.length - 1].level;

// Each rank gets a rich story chapter + a swim tie-in + a real marine fact.
// Future ranks stay locked (mystery cards) so there's always something to discover.
export const RANK_LORE = {
  "Seahorse":   { chapter: "Chapter 1 · The Shallows", story: "Every champion starts here, in the warm, calm shallows. A seahorse can’t swim fast at all — but it never lets go. You’re learning the very first swimmer’s superpower: hold steady, stay patient, and don’t give up when it’s hard.", swim: "This is your body learning to hold a shape — the base of every streamline.", fact: "Seahorses wrap their tails around seagrass and hold on all day so the current can’t sweep them away. Tiny, but mighty holders!" },
  "Sea Turtle": { chapter: "Chapter 1 · The Shallows", story: "You’ve learned that slow and steady wins. A sea turtle doesn’t rush — it glides for miles with calm, patient strokes and saves its energy for the long journey ahead. You’re building endurance now: the power to keep going.", swim: "Long, unhurried strokes = the pacing you’ll use in distance sets.", fact: "Sea turtles can hold their breath for hours while they rest underwater, and they cross entire oceans to come home." },
  "Penguin":    { chapter: "Chapter 2 · The Open Water", story: "Out past the shallows, the water gets deeper and cooler. Penguins look clumsy on land — but underwater they turn into rockets, tidy and quick with no wasted splash. You’ve found your glide: clean, efficient, no fuss.", swim: "A quiet body with no wasted motion is exactly what makes a fast freestyle.", fact: "Penguins can’t fly in the sky, but they “fly” underwater at over 10 mph, flapping their wings just like flippers." },
  "Sea Otter":  { chapter: "Chapter 2 · The Open Water", story: "Core power unlocked! A sea otter is one of the strongest, bendiest swimmers in the sea — all the power comes from the middle of its body as it rolls and spins. Your core is your engine room now.", swim: "A strong, tight core is what connects your arm-pull to your kick.", fact: "Sea otters hold hands while they sleep so they don’t drift apart, and they keep their favourite rock in a little pocket of skin." },
  "Stingray":   { chapter: "Chapter 3 · The Deep Reef", story: "Now you glide with real power. A stingray moves by rippling its whole body like a slow, smooth wave — huge power, and almost no splash at all. Smooth IS strong: you’ve stopped fighting the water and started flowing with it.", swim: "That whole-body ripple is the exact feeling of a strong dolphin undulation.", fact: "Stingrays flap their “wings” like an underwater bird and can bury themselves in the sand with just their eyes peeking out." },
  "Dolphin":    { chapter: "Chapter 3 · The Deep Reef", story: "The most playful, powerful swimmer of the reef. Dolphins kick with their entire body in one smooth wave and love to practice the same jump over and over until it’s perfect. Speed AND joy — that’s the dolphin way.", swim: "Your dolphin kick comes straight from here: one wave, head to toe.", fact: "Dolphins call each other by name with special whistles, and they leap out of the water just for fun." },
  "Shark":      { chapter: "Chapter 4 · The Blue", story: "Deep in the open blue, the shark rules. Its secret is streamline: every part of its body is shaped to slide through water with zero drag, always moving forward. You’ve learned to make yourself long, tight, and unstoppable.", swim: "Perfect streamline off every wall is your free speed — no strokes needed.", fact: "Many sharks have to keep swimming to breathe, so they never fully stop — for them, motion really is life." },
  "Orca":       { chapter: "Chapter 4 · The Blue", story: "The orca is the smartest hunter in the sea — and it never trains alone. Orca pods learn moves from each other and practice them together for years. You’re strong on your own now, but you’ve learned you’re even stronger with your team.", swim: "Training with your squad and racing relays — strong alone, stronger together.", fact: "Orcas are actually the largest kind of dolphin, and each family has its own set of calls, like a secret language." },
  "Sailfish":   { chapter: "Chapter 5 · The Championship Current", story: "You’re almost at the top. The sailfish is pure, blazing speed — but it’s fast because its form is flawless, folding its huge sail away to become a perfect arrow. Speed with perfect shape: the champion’s combination.", swim: "Full power with zero wasted motion — racing speed, held together.", fact: "Sailfish are the fastest fish in the ocean, hitting bursts up to 68 mph — faster than a car on the motorway!" },
  "Marlin":     { chapter: "Chapter 5 · The Championship Current", story: "Marli’s crown — the legend of the whole ocean. The marlin is the ruler of the open sea: fast, fearless, and unbeatable, because it did the work every single day. You made it to the top of the ocean class — and past it, the water gets deeper still.", swim: "Everything you built — hold, glide, core, streamline, speed — all in one swimmer.", fact: "Marlins can outswim almost anything in the sea and use their long bill to slice through the water like a sword." },
  "Sea Lion":       { chapter: "Chapter 6 · Past the Blue", story: "Out past the championship current, the water gets colder and the swimmers get tougher. A sea lion plays in surf that would knock anyone else over — not because it’s fearless, but because it has practised in rough water so many times that rough water feels like home. You’ve started training on the days that aren’t fun.", swim: "Turning up on the tired days is its own skill, and it’s the one that separates swimmers.", fact: "Sea lions can hold their breath for about 10 minutes and dive deeper than 270 m — and they steer with their front flippers like wings." },
  "Octopus":        { chapter: "Chapter 6 · Past the Blue", story: "The cleverest problem-solver in the sea. An octopus doesn’t out-muscle anything — it studies the problem, tries something, and if that fails it tries a completely different way. That’s what you do now with a move that won’t click: you don’t quit, you change the plan.", swim: "Fixing your own stroke mid-set — noticing, adjusting, re-testing — is coaching yourself.", fact: "An octopus has three hearts, blue blood, and can unscrew a jar lid from the inside to get at the snack in it." },
  "Giant Squid":    { chapter: "Chapter 6 · Past the Blue", story: "Down where the sunlight gives up, the giant squid keeps going. Almost nobody has ever seen one train — it does the work in the dark, unwatched, for years. This rank belongs to the swimmer who does the session when no one is clapping.", swim: "Quiet weekday drylands nobody sees are what makes race day loud.", fact: "The giant squid has the largest eyes of any animal on Earth — about the size of a dinner plate — to catch the tiniest glimmer of light in the deep." },
  "Humpback Whale": { chapter: "Chapter 7 · The Long Migration", story: "The humpback swims further than almost anything alive — thousands of kilometres, every year, without ever making a fuss about it. It doesn’t sprint. It just never stops. You’ve built the rarest thing in sport: a habit that outlasts moods.", swim: "Season-long endurance — the base that makes every hard set possible.", fact: "Humpbacks migrate up to 8,000 km each year, and the males sing long songs that whole ocean populations learn and change together." },
  "Blue Whale":     { chapter: "Chapter 7 · The Long Migration", story: "The biggest animal that has ever lived — bigger than any dinosaur — and it got that way one quiet mouthful at a time. Nothing about a blue whale happened fast. Everything about it happened relentlessly. That’s your training log now: enormous, built out of ordinary days.", swim: "Power that comes from volume — months of work stacked into one body.", fact: "A blue whale’s heart is about the size of a small car, and its call is louder than a jet engine and can carry for hundreds of kilometres." },
  "Storm Rider":    { chapter: "Chapter 8 · The Summit Current", story: "Some swimmers wait for calm water. You stopped waiting. A storm rider reads the swell, picks the line, and uses the rough water to go faster — hard practices, tough meets, bad days all become fuel instead of excuses.", swim: "Racing well when conditions are wrong: cold pool, early heat, tired legs, no problem.", fact: "The Gulf Stream carries more water than every river on Earth combined, and swimmers and sailors have used its push for centuries." },
  "Ocean Guardian": { chapter: "Chapter 8 · The Summit Current", story: "At this height the ocean stops being something you conquer and becomes something you look after. A guardian is the swimmer younger kids copy — first in, encouraging in the next lane, honest about form. You’re not just strong now. You’re the reason someone else keeps going.", swim: "Leading a warm-up, spotting a teammate’s catch, setting the tone on the deck.", fact: "The ocean makes more than half of the oxygen we breathe — most of it from plankton too small to see." },
  "Ocean Legend":   { chapter: "Chapter 9 · The Summit", story: "You reached the top of the ladder — and here’s the secret it was keeping: the ocean never actually ends. There’s no rank above this one because there’s nothing left to unlock. From here it isn’t about earning anything. It’s just you, the water, and the swimmer you decided to become. Go swim for the love of it.", swim: "Nothing left to prove on this ladder. Every session from here is yours to spend how you like.", fact: "More than 80% of the ocean has never been mapped or explored — even at the summit, most of it is still waiting." }
};
export const RANK_TEASE = {
  "Sea Turtle": "A patient traveller waits ahead…", "Penguin": "Something quick and tidy is coming…",
  "Sea Otter": "A strong, bendy friend is near…", "Stingray": "A smooth glider hides in the reef…",
  "Dolphin": "A playful speedster is coming…", "Shark": "A powerful ruler waits in the blue…",
  "Orca": "A clever team-hunter lies ahead…", "Sailfish": "Pure speed is almost within reach…",
  "Marlin": "The ruler of the open sea waits at the top of the ocean class…",
  "Sea Lion": "Something that plays in rough water is waiting past the blue…",
  "Octopus": "The cleverest problem-solver in the sea is out there…",
  "Giant Squid": "Something enormous trains in the dark where nobody watches…",
  "Humpback Whale": "A traveller who never stops is somewhere ahead…",
  "Blue Whale": "The biggest heart in the ocean is still out of sight…",
  "Storm Rider": "Something that races the storm instead of hiding from it…",
  "Ocean Guardian": "The one the whole ocean looks up to is nearly here…",
  "Ocean Legend": "The very summit. No one has told you what’s up there yet…"
};

// Level-up prize pool — a grown-up curates this in Settings.
// Default rewards lean on experiences, privileges, and autonomy rather than food
// or screen time — linking a child's training to food ("earn dessert") or iPad
// bargaining is a pattern child-sport psychologists caution against. Grown-ups
// can still add whatever they like in Settings; this is only the starting pool.
export const PRIZE_POOL = [
  { icon: "🎡", label: "Plan a weekend outing" },
  { icon: "✨", label: "Skip one chore" },
  { icon: "⚽", label: "+30 min play time" },
  { icon: "🎬", label: "Family movie pick" },
  { icon: "🛌", label: "Stay up 20 min later" },
  { icon: "🎯", label: "Choose the next family activity" },
  { icon: "🏊", label: "Pick a fun game at practice" },
  { icon: "🎨", label: "One-on-one time with a grown-up" }
];

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
/* Rank for a given level — highest ladder entry at or below the level. */
export function rankForLevel(level) {
  let rank = LADDER[0];
  for (const r of LADDER) if (level >= r.level) rank = r;
  return rank;
}

export const COACH_VOICE_ITEMS = [
  "Count your time", "Tell you the next exercise", "Remind you to breathe",
  "Warn about common mistakes", "Prompt a self-check"
];

/* ------------------------------------------------------------
   READINESS CHECK (4-Q + body map) — from the Assessment prototype.
   ------------------------------------------------------------ */
export const READINESS_QS = [
  { id: "q_pain",  text: "Any aches or sore spots today?", isPain: true, yesLabel: "😊 All good", noLabel: "😣 A bit sore" },
  { id: "q_sleep", text: "How well did you sleep last night?", yesLabel: "😴 Good", noLabel: "🥱 Not great" },
  { id: "q_light", text: "How do your muscles feel from your last swim?", yesLabel: "💪 Fresh", noLabel: "😮‍💨 Tired" },
  { id: "q_ready", text: "What's your energy like right now?", yesLabel: "⚡ Full", noLabel: "💤 Low" }
];

// Anatomically distinct front vs. back regions — only true shared joints
// (head/neck, shoulders, arms, knees) carry one zone number across both views.
export const BODY_ZONES = [
  { n: 1,  label: "Head",         group: "shared" },
  { n: 17, label: "Neck",         group: "shared" },
  { n: 2,  label: "Shoulders",    group: "shared" },
  { n: 3,  label: "Arms",         group: "shared" },
  { n: 4,  label: "Knees",        group: "shared" },
  { n: 5,  label: "Chest / Ribs", group: "front" },
  { n: 6,  label: "Abs / Core",   group: "front" },
  { n: 7,  label: "Hip / Groin",  group: "front" },
  { n: 8,  label: "Quads (Front Thigh)", group: "front" },
  { n: 9,  label: "Shin",         group: "front" },
  { n: 10, label: "Ankle / Foot", group: "front" },
  { n: 11, label: "Upper Back",   group: "back" },
  { n: 12, label: "Lower Back",   group: "back" },
  { n: 13, label: "Glutes",       group: "back" },
  { n: 14, label: "Hamstrings (Back Thigh)", group: "back" },
  { n: 15, label: "Calf",         group: "back" },
  { n: 16, label: "Achilles / Heel", group: "back" }
];

export const SEVERITY_LEVELS = [
  { level: 1, emoji: "🙂", label: "OK",                   color: "var(--mint)",  desc: "Moved normally. Both sides feel similar." },
  { level: 2, emoji: "😐", label: "Tired but controlled", color: "var(--sun)",   desc: "Tired or shaky, but still controlled. Better after 1–2 minutes rest." },
  { level: 3, emoji: "😟", label: "Changed movement",     color: "var(--coral)", desc: "Limp, lean, twist, shake, or less range. Tell coach or parent." },
  { level: 4, emoji: "🥺", label: "Pain / Stop",          color: "var(--stop)",  desc: "Pain, sharp pain, swelling, numbness, tingling, or affects normal activity. Stop now." }
];

// Unified colored-circle icon set (🟢🟡🔴🟣) instead of the old mixed
// hearts/circle/ice. The CTA now carries the light's OWN color — a red-light day
// shows a warm caution button, not the same yellow as a green day — so the
// safety signal survives all the way to the action.
export const LIGHT_META = {
  green:    { emoji: "🟢", color: "var(--mint)",  btnColor: "var(--mint)",  btnDeep: "var(--mint-deep)",  btnText: "#fff",           btnIcon: "💪", label: "Green Light — Full power!",  btnLabel: "Start Training!", desc: "You're good to go! Full 3 rounds. Focus on quality." },
  yellow:   { emoji: "🟡", color: "var(--sun)",   btnColor: "var(--sun)",   btnDeep: "var(--sun-deep)",   btnText: "var(--sun-ink)", btnIcon: "🌊", label: "Yellow Light — Go easy",     btnLabel: "Start Training!", desc: "2 rounds max. Listen to your body — clean form over effort." },
  red:      { emoji: "🔴", color: "var(--stop)",  btnColor: "var(--coral)", btnDeep: "var(--coral-deep)", btnText: "#fff",           btnIcon: "💙", label: "Red Light — Light day",      btnLabel: "Start easy day",  desc: "1 round only. Something feels off — take it easy today." },
  recovery: { emoji: "🟣", color: "var(--grape)", btnColor: "var(--grape)", btnDeep: "var(--grape-deep)", btnText: "#fff",           btnIcon: "🧊", label: "Recovery — Rest is training", btnLabel: "Start Recovery",  desc: "Rest day. Tell a grown-up, then stretch and hydrate." }
};

export const BODY_RESULTS = {
  1: { emoji: "✅", color: "var(--mint)",  desc: "You are OK. Keep moving with control.",          cta: "Continue to Training",    ctaIcon: "💪", ctaColor: "var(--mint)", ctaDeep: "var(--mint-deep)", ctaText: "#fff", action: "continue" },
  2: { emoji: "⏱️", color: "var(--sun)",   desc: "Take 1–2 minutes rest, then go easy — 2 rounds max, clean form.", cta: "Start easy — Yellow light", ctaIcon: "💛", ctaColor: "var(--sun)", ctaDeep: "var(--sun-deep)", ctaText: "var(--sun-ink)", action: "continue", secondary: "retry", secondaryLabel: "Rest 1–2 min, then re-check" },
  3: { emoji: "🗣️", color: "var(--coral)", desc: "Tell your coach or parent first. If they say OK — light day only, 1 easy round.", cta: "Start light day — Red light", ctaIcon: "💙", ctaColor: "var(--coral)", ctaDeep: "var(--coral-deep)", ctaText: "#fff", action: "continue", secondary: "back", secondaryLabel: "Stop — back to Today", needsGrownup: true },
  4: { emoji: "🛑", color: "var(--stop)",  desc: "Stop now. Tell your coach or parent right away.",   cta: "Stop — back to Today",    ctaIcon: "🛑", ctaColor: "var(--stop)", ctaDeep: "var(--stop-deep)", ctaText: "#fff", action: "back" }
};

/* Per-day mascot greeting rotates through the pose set. */
export const POSES = {
  welcome: "assets/poses/welcome.png",
  greatwork: "assets/poses/greatwork.png",
  celebrate: "assets/poses/celebrate.png",
  keepgoing: "assets/poses/keepgoing.png",
  breath: "assets/poses/breath.png",
  think: "assets/poses/think.png",
  seeyou: "assets/poses/seeyou.png",
  remember: "assets/poses/remember.png"
};
