/* ============================================================
   2026.2 CONTENT MODEL — workout data, overload, and static tables.
   Each training day = Warm-up → Coordination → Main (Traffic-Light
   rounds) → Finisher → Swim-Skill. Sunday = Spa (recovery only).
   The AM micro-activation and evening variants were retired with
   the Splash UI rebuild — GO always runs the day's main workout.
   ============================================================ */

/* The mechanism these tables are built with lives in the shared core. */
import { X } from "../core/plan.js";

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
   HOW-TO / VALIDATED COACHING CHANNELS — a reference list, not a
   mechanism. Nothing appends these names. Where a move's best demo
   comes from one of these channels, the name is written INTO that
   move's `search` string by hand.
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

/* ONE LIGHT, ONE WHOLE-SESSION DOSE.

   The light used to change only the main round count, so a "red light" day
   still ran a full warm-up, full coordination, the prep pair, a finisher and
   swim-skill — measured at 65-72% of that weekday's green session, which is
   not a light day by any reading. Yellow came out at 82-86%. The light now
   decides which BLOCKS run as well as how many main rounds.

   Warm-up and swim-skill survive every light: one prepares the body, and the
   other is technique work at almost no load — the part that transfers to the
   pool, and the last thing worth cutting on a day she is already short of.

   Measured against green, per weekday, after this policy:
     yellow  71-82%   (target 70-80%; Mon 81% and Wed 82% run a little high,
                       having no prep block to drop in the first place)
     red     40-57%   (target 45-60%; Sat 40% is a little low)
   Those five points are not worth deleting a prescribed exercise over. */
export const LIGHT_SESSION_POLICY = {
  green:    { mainRounds: 3, blocks: ["warmup", "coordination", "main", "prep", "finisher", "swimskill"] },
  yellow:   { mainRounds: 2, blocks: ["warmup", "coordination", "main", "swimskill"] },
  red:      { mainRounds: 1, blocks: ["warmup", "main", "swimskill"] },
  recovery: { mainRounds: 0, blocks: ["recovery"] }
};

/* Light → number of rounds for the Main block. Derived from the policy above so
   the rounds and the blocks can never drift apart. */
export const LIGHT_ROUNDS = Object.fromEntries(
  Object.entries(LIGHT_SESSION_POLICY).map(([k, v]) => [k, v.mainRounds]));

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

/* The one question the coach asks out loud at the end of the skill block. The
   options live HERE, beside the answer, because they used to be hardcoded in
   shared core/ — where they could only ever match one sport, and silently did
   not match the other. `a` must be one of `opts`; the smoke test enforces it. */
export const MICRO_LOOP = {
  q: "Where did the power start?",
  a: "the hips",
  opts: ["the hips", "the arms", "the knees"],
  yes: "Yes — the hips!",
  no: "It starts at the hips."
};
export const BREATH_REHEARSAL =
  "Side-lying head-turn: exhale face-down (hum), rotate, quick sip, rotate back.";
/* Same rehearsal, written to be heard rather than read. The engine used to
   speak a swim line in both apps; each app now says its own. */
export const BREATH_SAY =
  "Breath rehearsal. Exhale face down, hum, turn, quick sip, turn back.";

/* The two reflection chip sets on the finish screen. These lived in shared
   core/ with swimming words in them, which the skating app then offered to its
   skater; sport words belong to the app. */
export const REFLECT_WELL = ["My breathing", "Strong holds", "Clean form", "Staying focused"];
export const REFLECT_NEXT = ["Slow down", "Breathe out loud", "Point my toes", "Keep core tight"];

/* Shared finisher + swim-skill block builders */
const FINISHER = () => [
  X({ name: "Scap Pull-Up + Dead Hang", block: "finisher", driver: "time", work: 30,
      dose: "30s", reset: "Hang tall, shoulders ready.",
      cue: "Shoulders slide DOWN, hang and decompress.",
      swimTransfer: "Shoulder control / decompression" })
];

const SWIMSKILL_A = () => [
  X({ name: "Chair High-Elbow Catch", setup: true, block: "swimskill", driver: "reps", repsDetail: "2×8/side", dose: "2×8/side",
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
  X({ name: "Chair High-Elbow Catch", setup: true, block: "swimskill", driver: "reps", repsDetail: "2×8/side", dose: "2×8/side",
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
  X({ name: "Chair High-Elbow Catch", setup: true, block: "swimskill", driver: "reps", repsDetail: "2×8/side", dose: "2×8/side",
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
        X({ name: "Hip Hinge", setup: true, block: "main", driver: "reps", repsDetail: "8 · 2-1-2", dose: "8 · 2-1-2 (dowel)",
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
      X({ name: "Pallof Press", setup: true, block: "main", driver: "reps", repsDetail: "10/side · 2s hold", dose: "10/side · 2s hold",
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
      X({ name: "Side-Lying ER", setup: true, block: "main", driver: "reps", repsDetail: "10/side", dose: "10/side",
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
        X({ name: "Hip Hinge", setup: true, block: "main", driver: "reps", repsDetail: "8 · 2-1-2", dose: "8 · 2-1-2 (dowel)",
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
      X({ name: "Pallof Press", setup: true, block: "main", driver: "reps", repsDetail: "10/side · 2s hold", dose: "10/side · 2s hold",
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
      X({ name: "Partner Ball Toss", setup: true, block: "main", driver: "reps", repsDetail: "2×8", dose: "2×8",
          cue: "Throw from the hips and core, not just arms.",
          parentWatch: "All arms, no hip", fix: "Load the hip, then throw.",
          swimTransfer: "Rotation production" }),
      X({ name: "Half-Kneeling Chop/Lift", setup: true, block: "main", driver: "reps", repsDetail: "8/side", dose: "8/side",
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

/* ---- moves that need setting up ------------------------------------------
   A band has to be anchored, a bar walked to, a rope untangled. Those moves
   used to start on the same five-second rest as a floor move, so the clock was
   already running while she was still rigging the band — the timer punishing
   the one part of the session she cannot rush.

   Recognised two ways on purpose. An explicit `setup: true` marks the moves
   whose names say nothing about their gear (Pallof Press is a band move; Hip
   Hinge wants a dowel), and a name test catches everything that announces
   itself — including the band move somebody adds next year without knowing
   this list exists. HARD_EXERCISES in js/engine.js is a hand-kept list of
   names and it went stale exactly that way. */
export const SETUP_SECONDS = 5;
const SETUP_NAME = /\bband\b|pull-?up|dead hang|jump rope|roller|massage gun/i;
export function needsSetup(ex) {
  if (!ex) return false;
  if (ex.setup === true) return true;
  return SETUP_NAME.test(String(ex.name || ""));
}

export const MIN_REST = 3;
/* Re-exported from util so the constant has exactly one definition. */
export { SIDE_SWITCH_BUFFER } from "../core/util.js";
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

/* Rank for a given level — highest ladder entry at or below the level. */
export function rankForLevel(level) {
  let rank = LADDER[0];
  for (const r of LADDER) if (level >= r.level) rank = r;
  return rank;
}

/* ------------------------------------------------------------
   KID COACHING — the watch-out and the fix, in her words.

   The Quiz Deck asks "what should you watch out for?" and "if this feels wrong,
   what's the fix?" and used to answer from `parentWatch` and `redFlag` — notes
   written for a grown-up watching from the side. Two problems came out of that.

   The wrong answers on a card are drawn from OTHER moves' text, and the grown-up
   fixes are nearly all the same sentence: "Smaller range.", "Reach shorter, slow
   down.", "Slow down, reduce reach.", "Slow down, level the pelvis." Three of
   those on one card is a coin flip, not a question — and since more than one is
   genuinely right, a right answer could be marked wrong.

   Every line here names the move's OWN body part and shape, so no two of them
   can be mistaken for each other, and reads as something a coach would say to an
   eleven-year-old rather than about her. `parentWatch` / `redFlag` stay exactly
   as they are for the grown-up's Form Check tab — this is the kid-facing pair.
   ------------------------------------------------------------ */
export const KID_COACHING = {
  "Hollow Tuck Flutter": { watch: "Your ribs popping up off the floor while your legs are going",
                           fix: "Breathe out loud and press your low back flat before the legs move" },
  "Clean Pull-Ups":      { watch: "Your legs swinging to help your arms get you up",
                           fix: "The set is over the moment a swing starts — hang still, try again next round" },
  "Dead Bug":            { watch: "Your low back peeling up off the floor as you reach out",
                           fix: "Reach a shorter way out, until your low back stays glued down" },
  "Glute Bridge March":  { watch: "One hip dropping every time the other knee lifts",
                           fix: "Lift a smaller knee and keep both hip bones exactly level" },
  "Single-Leg Balance Reach": { cue: "Quiet foot, knee over toe.",
                           watch: "Your standing knee sliding inward toward your big toe",
                           fix: "Reach a shorter way and push that knee back out over your toe" },
  "Band Row":            { watch: "Your shoulders climbing up toward your ears",
                           fix: "Start the pull by sliding your shoulder blades together, then bend your elbows" },
  "Bird Dog":            { watch: "Your hips rolling open toward the leg you lifted",
                           fix: "Keep both hip bones pointing at the floor and reach less far" },
  "Hip Hinge":           { watch: "Your back rounding over as your hips travel back",
                           fix: "Send your hips further back and keep your chest flat like a tabletop" },
  "Pallof Press":        { watch: "Your body turning toward the band as your arms press out",
                           fix: "Use less band and keep both hips facing straight ahead" },
  "Side Plank Reach":    { watch: "Your bottom hip sagging down toward the floor",
                           fix: "Push your bottom hip up to the ceiling and reach less far" },
  "Superman":            { watch: "Your neck craning up and your arms flapping fast",
                           fix: "Lift lower, look at the floor, and hold the shape still" },
  "Drop-and-Stick":      { watch: "Both knees falling in toward each other when you land",
                           fix: "Stop, set your feet hip-width, and land slower with each knee over its toe" },
  "Single-Arm Band Row": { watch: "Your chest turning to follow the arm that's pulling",
                           fix: "Use less band and widen your feet so your chest stays square" },
  "Band External Rotation": { watch: "Your elbow floating away from your ribs",
                           fix: "Pin your elbow to your ribs and turn slower" },
  "Side-Lying ER":       { watch: "Rushing the turn, or using a weight you have to throw",
                           fix: "Go lighter and take two whole seconds each way" },
  "Partner Ball Toss":   { watch: "Throwing with all arms, so your hips never load",
                           fix: "Sink into your hip first, then throw from the legs up" },
  "Half-Kneeling Chop/Lift": { watch: "Twisting from your low back instead of your hips",
                           fix: "Turn from your hip and ribs, and slow the whole path down" },

  /* Moves the grown-up notes never covered, so the deck could never ask about
     them. A watch-out and a fix each is what makes them askable at all. */
  /* Short cue forms for the quiz card only — see movePool in core/store.js. */
  "Side-Lying Breath Rehearsal": { cue: "Hum face-down, rotate, quick sip." },
  "A-Skip":              { cue: "Same as A-March, with a skip rhythm." },

  "Streamline Hold":     { watch: "Your ribs flaring and your arms drifting apart above your head",
                           fix: "Squeeze your arms behind your ears and pull your ribs down" },
  "Scap Pull-Up + Dead Hang": { watch: "Bending your elbows instead of sliding your shoulders down",
                           fix: "Keep your arms dead straight and move only your shoulder blades" },
  "Chair High-Elbow Catch": { cue: "Forearm turns IN, elbow stays HIGH.",
                           watch: "Your elbow dropping so the whole arm pulls straight back",
                           fix: "Turn your forearm in first and keep your elbow high and still" },
  "Wall Slides":         { watch: "Your low back arching off the wall as your arms go up",
                           fix: "Press your ribs to the wall and go only as high as they stay there" },
  "Knee-to-Wall Ankle":  { watch: "Your heel lifting as your knee reaches for the wall",
                           fix: "Move closer only while your heel stays stuck to the floor" },
  "Short-Foot":          { watch: "Curling your toes under instead of lifting your arch",
                           fix: "Keep your toes long and flat and draw the ball of your foot toward your heel" },
  "Forearm Plank Dolphin Undulation": { watch: "The wave starting at your knees instead of your middle",
                           fix: "Start the wave at your ribs and keep your legs long" },
  "Long-Axis Rotation Roll": { cue: "Roll as one unit, driven from the hip.",
                           watch: "Your head rolling along with your body",
                           fix: "Keep your head still and roll from your hips and ribs" },
  "Jump Rope":           { watch: "Loud, flat landings on your whole foot",
                           fix: "Stay on the balls of your feet and make every landing quiet" },
  "Cat-Camel":           { watch: "Moving your whole back at once instead of bit by bit",
                           fix: "Move one part of your spine at a time, slowly" },
  "Band Pass-Through":   { watch: "Your shoulders shrugging up to get the band over",
                           fix: "Widen your hands and keep your shoulders down the whole way round" },
  "90/90 Hip Switch":    { watch: "Slumping backwards as your knees swap over",
                           fix: "Sit tall, lean on your hands less, and let your knees lead the switch" },
  "A-March":             { watch: "Your foot landing out in front of your body",
                           fix: "Put your foot down underneath your hip, toe pulled up" },
  "Carioca":             { watch: "Your shoulders turning along with your hips",
                           fix: "Keep your chest facing forward and turn only your hips" },
  "Breaststroke Kick Shape": { watch: "Your knees swinging wide apart",
                           fix: "Keep your knees inside your hips and turn your feet out instead" },
  "Towel-Band Catch Pull": { watch: "Your elbow leading the pull instead of your hand anchoring it",
                           fix: "Hold the elbow high and pull your body past your hand" },
  "Open-Book / T-Rotation": { watch: "Your knees falling apart as your top arm opens",
                           fix: "Keep your knees stacked and stop where they start to lift" }
};

/* ------------------------------------------------------------
   TRAINING PRINCIPLES — attitude, efficiency, and why it works.

   Everything else the app asks about is a move or a rank: what a cue is, which
   chapter taught what. Nothing ever asked her about training itself — whether a
   bad-sleep day is worth training, whether ten sloppy reps beat six clean ones,
   or why the same moves keep coming back week after week.

   That last one is the point of this set. Results come from repeating the SAME
   movement, not a similar one. A different exercise that works the same muscles
   builds a different skill, and swapping it in restarts the learning — which is
   the single thing a kid bored of week six most needs to hear, and the single
   thing she is most likely to get wrong on her own.

   Authored, not generated: a principle has no sibling move to borrow a wrong
   answer from. Every wrong option here is something an eleven-year-old actually
   believes, so the card cannot be solved by spotting the silly one.

   `tier: 2` waits until the `after` question is mastered — see questionPrereq
   in core/store.js.
   ------------------------------------------------------------ */
export const TRAINING_QS = [
  { id: "honest", kind: "attitude", tier: 1,
    q: "You slept badly and you feel flat. What does the Body Check want to hear?",
    why: "Honest answers are the only thing Coach can pick a day from. A smaller day done properly still builds you — a big day faked doesn't.",
    opts: [
      { t: "The truth — then train the day Coach gives me", ok: true },
      { t: "That I feel great, so I still get the full session", ok: false },
      { t: "Nothing — skip today and do double tomorrow", ok: false } ] },

  { id: "wrongrep", kind: "attitude", tier: 2, after: "honest",
    q: "You marked a set wobbly and the app wrote it down. What is that worth?",
    why: "A rep you got wrong and noticed is worth more than one you got right by luck — it tells you exactly what to fix next time.",
    opts: [
      { t: "It tells me which part to fix next time", ok: true },
      { t: "Nothing — wobbly sets don't count", ok: false },
      { t: "It cancels out the sets I did clean", ok: false } ] },

  { id: "showup", kind: "attitude", tier: 1,
    q: "Which week makes a faster swimmer?",
    why: "Four ordinary sessions beat one heroic one. Your body changes from what you do most weeks, not from your best day.",
    opts: [
      { t: "Four ordinary sessions I actually finished", ok: true },
      { t: "One huge session and three days off", ok: false },
      { t: "Whichever week felt hardest", ok: false } ] },

  { id: "clean6", kind: "efficiency", tier: 1,
    q: "Ten sloppy reps or six clean ones — which one makes you faster?",
    why: "Your body learns the shape you repeat. Sloppy reps are still practice; they just teach the sloppy shape.",
    opts: [
      { t: "Six clean ones", ok: true },
      { t: "Ten sloppy ones — more reps is more work", ok: false },
      { t: "Neither — only swimming makes you faster", ok: false } ] },

  { id: "rest", kind: "efficiency", tier: 2, after: "clean6",
    q: "Why is the rest between rounds part of the workout?",
    why: "Rest is what buys the next round its quality. Skip it and round three teaches your body a tired, messy shape.",
    opts: [
      { t: "It's what lets the next round be as clean as the first", ok: true },
      { t: "It's a break so the session isn't boring", ok: false },
      { t: "It's there to stretch the session out to 30 minutes", ok: false } ] },

  { id: "rushing", kind: "efficiency", tier: 2, after: "clean6",
    q: "You're racing the timer to squeeze the last reps in. What does that cost you?",
    why: "The timer is a fence, not a race. Reps crammed in at the end are the ones your body remembers worst.",
    opts: [
      { t: "The last reps are the sloppiest, so they teach the worst shape", ok: true },
      { t: "Nothing — finishing the set is what matters", ok: false },
      { t: "Only time, and I get to finish sooner", ok: false } ] },

  { id: "sameagain", kind: "results", tier: 1,
    q: "Why do the same moves keep coming back every week?",
    why: "A movement only becomes automatic when you repeat THE SAME movement. Variety feels fun; repetition is what actually changes you.",
    opts: [
      { t: "Repeating the same movement is what makes it automatic", ok: true },
      { t: "So the app doesn't have to think up new ones", ok: false },
      { t: "Because they're the easiest ones to set up at home", ok: false } ] },

  { id: "swapit", kind: "results", tier: 2, after: "sameagain",
    q: "A different exercise works the same muscles. Can you swap it in?",
    why: "Your body learns the exact movement you practise, not the muscle group. A similar exercise builds a similar skill — not the same one — and the swap starts the learning over.",
    opts: [
      { t: "No — a similar movement builds a similar skill, not the same one", ok: true },
      { t: "Yes — same muscles means the same result", ok: false },
      { t: "Yes, as long as the new one is harder", ok: false } ] },

  { id: "gotboring", kind: "results", tier: 2, after: "sameagain",
    q: "Six weeks of Glute Bridge March and it feels easy now. What should change?",
    why: "Same movement, more challenge — slower, longer, heavier. Trading it for a new exercise throws away six weeks of learning and starts a different skill from zero.",
    opts: [
      { t: "Keep the same move and make it harder — slower, longer, more load", ok: true },
      { t: "Swap it for a new exercise so it stays interesting", ok: false },
      { t: "Drop it — easy means I've finished learning it", ok: false } ] }
];

/* ------------------------------------------------------------
   READINESS CHECK (4-Q + body map) — from the Assessment prototype.
   ------------------------------------------------------------ */
/* The pain question is LAST, and that ordering is load-bearing.

   It used to be first, and answering "a bit sore" jumped straight to the body
   map — so on a sore morning the other three were never asked, and the general
   readiness score was never computed at all. The body map's severity then
   produced the light on its own: three negative answers plus a merely tired
   shoulder ran a Yellow day. Asking pain last costs no extra taps and means both
   signals always exist, so the light can be the more cautious of the two.
   Nothing reads this list positionally — every consumer is by `id`. */
export const READINESS_QS = [
  { id: "q_sleep", text: "How well did you sleep last night?", yesLabel: "😴 Good", noLabel: "🥱 Not great" },
  { id: "q_light", text: "How do your muscles feel from your last swim?", yesLabel: "💪 Fresh", noLabel: "😮‍💨 Tired" },
  { id: "q_ready", text: "What's your energy like right now?", yesLabel: "⚡ Full", noLabel: "💤 Low" },
  { id: "q_pain",  text: "Any aches or sore spots today?", isPain: true, yesLabel: "😊 All good", noLabel: "😣 A bit sore" }
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
  yellow:   { emoji: "🟡", color: "var(--sun)",   btnColor: "var(--sun)",   btnDeep: "var(--sun-deep)",   btnText: "var(--sun-ink)", btnIcon: "🌊", label: "Yellow Light — Go easy",     btnLabel: "Start Training!", desc: "2 rounds, and we skip the extras. Listen to your body — clean form over effort." },
  red:      { emoji: "🔴", color: "var(--stop)",  btnColor: "var(--coral)", btnDeep: "var(--coral-deep)", btnText: "#fff",           btnIcon: "💙", label: "Red Light — Light day",      btnLabel: "Start easy day",  desc: "1 round, warm-up and swim skill only. Something feels off — take it easy today." },
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

/* Coach's Quiz — the questions the finish screen asks, connecting today's
   land work to the sport. Rotated by core/vm/session.js sessionQuizFor(). */
/* ------------------------------------------------------------
   THE COACH'S QUIZ — one card at the end of every session.

   This bank had six questions and every wrong answer was a joke: "Comfier
   goggles", "Louder splashing", "It keeps your socks on". The right answer was
   always the only real coaching sentence, so she could score six out of six
   knowing nothing at all — which is exactly why the quiz stopped meaning
   anything to her. A wrong answer here is now something TRUE of a different
   move, or something a swimmer her age genuinely believes. You have to know
   which one applies.

   Eighteen of them now, not six, so the end-of-session card stops coming back
   round every few days.

   `tier: 2` questions are application — you felt this, so what do you change —
   and stay closed until the `after` question is mastered. Ids are the XP ledger
   keys ("coach|<id>"), so the original six keep theirs and nothing she has
   already learned gets charged for twice.
   ------------------------------------------------------------ */
export const SESSION_QUIZ = [
  { id: "superman", tier: 1, q: "Why do we practise Superman holds on land?", why: "A strong Superman hold = a strong streamline off every wall.", opts: [
    { t: "To build a long, tight streamline for push-offs", ok: true },
    { t: "To make the catch at the front of the stroke stronger", ok: false },
    { t: "To keep the hips level while one leg is working", ok: false } ] },

  { id: "squat", tier: 1, q: "Squats make your legs stronger. Where does that power show up in the pool?", why: "Every start and turn is a jump — leg power is pool speed.", opts: [
    { t: "Faster starts and turns off the block and wall", ok: true },
    { t: "A longer, straighter body line down the pool", ok: false },
    { t: "More push per kick from the ankles", ok: false } ] },

  { id: "clean", tier: 1, q: "Why does Coach say \u201cslow and clean beats fast and sloppy\u201d?", why: "Your body learns the shape you practise — so practise the good one.", opts: [
    { t: "Clean shapes on land become clean strokes in the water", ok: true },
    { t: "Slow reps use up more energy, so they count for more", ok: false },
    { t: "Going slowly is how you avoid getting out of breath", ok: false } ] },

  { id: "core", tier: 1, q: "Why do we brace our core (like a strong tube) during land work?", why: "A braced core stops your middle from bending, so your push and pull don't leak power.", opts: [
    { t: "A stiff middle sends leg and arm power straight down the pool", ok: true },
    { t: "It opens the shoulders so the catch can go deeper", ok: false },
    { t: "It trains you to hold your breath longer underwater", ok: false } ] },

  { id: "balance", tier: 1, q: "Balance moves (like Single-Leg Balance) — what do they build for swimming?", why: "Steady hips and ankles keep your body straight and long instead of wobbling and slowing down.", opts: [
    { t: "A stable, straight body line that glides instead of wobbles", ok: true },
    { t: "More power off the wall on every turn", ok: false },
    { t: "A higher elbow at the front of the stroke", ok: false } ] },

  { id: "toes", tier: 1, q: "Why do we point our toes in kicking-shape drills on land?", why: "Pointed toes make your foot a longer paddle, so each kick pushes more water.", opts: [
    { t: "Pointed feet act like paddles — more push per kick", ok: true },
    { t: "It stops the knees bending too much in the kick", ok: false },
    { t: "It keeps your ankles from getting sore", ok: false } ] },

  { id: "hollow", tier: 1, q: "Hollow Tuck Flutter — ribs down, low back glued to the floor. What is that teaching?", why: "A flutter kick only travels if the middle stays still. Ribs down is the shape you kick from.", opts: [
    { t: "To hold one straight line while the legs move underneath", ok: true },
    { t: "To breathe out slowly while your legs are working", ok: false },
    { t: "To make your stomach muscles bigger", ok: false } ] },

  { id: "deadhang", tier: 1, q: "Scap Pull-Up + Dead Hang — the shoulders slide DOWN before anything bends. Why?", why: "Your shoulder blades set the position every pull starts from. Bend first and the pull starts from nowhere.", opts: [
    { t: "Your shoulder blades set the position every pull starts from", ok: true },
    { t: "It's a stretch, so it loosens the shoulders before you swim", ok: false },
    { t: "Hanging makes your arms longer so you reach further", ok: false } ] },

  { id: "pullups", tier: 1, q: "Clean Pull-Ups — no swinging, no kipping. What does the \u201cclean\u201d part build?", why: "A pull you control is a pull that travels. A swing borrows from your legs and teaches your arms nothing.", opts: [
    { t: "The pulling shape your stroke actually starts from", ok: true },
    { t: "Grip strength for holding on to the wall", ok: false },
    { t: "Bigger arms, so the pull is stronger", ok: false } ] },

  { id: "pallof", tier: 1, q: "Pallof Press — the band tries to twist you and you don't let it. What is that for?", why: "One arm pulls at a time. Anti-twist is what stops your whole body snaking after it.", opts: [
    { t: "Staying straight in the water while one arm pulls", ok: true },
    { t: "Making your flip turn spin faster", ok: false },
    { t: "Making one side of your arms stronger than the other", ok: false } ] },

  { id: "jumprope", tier: 1, q: "Jump Rope — off the toes, quiet, tall. Why does Coach want it QUIET?", why: "Quiet is springy. A loud landing is a leg absorbing the jump instead of returning it.", opts: [
    { t: "Quiet means the ankles are springing, not crashing", ok: true },
    { t: "Quiet means you're landing flat, so your legs get a rest", ok: false },
    { t: "Quiet means you're going slowly enough to stay in control", ok: false } ] },

  { id: "hinge", tier: 1, q: "Hip Hinge — flat back, hips travel backwards. What is that protecting?", why: "The hips are built to bend under load. The lower back is not.", opts: [
    { t: "Your lower back — the hips do the bending, not the spine", ok: true },
    { t: "Your knees, by keeping them completely straight", ok: false },
    { t: "Your shoulders, by keeping them pulled down", ok: false } ] },

  { id: "fixstreamline", tier: 2, after: "superman", q: "Your streamline keeps coming apart off the wall. Which land move goes after that?", why: "Fix the shape where you can hold it still, then take it to the wall.", opts: [
    { t: "Superman holds — the very same long, tight shape", ok: true },
    { t: "Squats — you need a harder push off the wall", ok: false },
    { t: "Band Pass-Through — looser shoulders would help", ok: false } ] },

  { id: "busykick", tier: 2, after: "toes", q: "Your kick feels busy but you aren't going anywhere. What's the most likely reason?", why: "A kick from the knee with a loose ankle is a lot of splashing and no push. It starts at the hip and finishes through a long, pointed foot.", opts: [
    { t: "It's coming from the knee, with the ankle flopping", ok: true },
    { t: "You simply aren't kicking hard enough yet", ok: false },
    { t: "Your arms are pulling too early in the stroke", ok: false } ] },

  { id: "roundthree", tier: 2, after: "clean", q: "Round three, and your form has gone. What's the right call?", why: "The shape is the point of the round. A round trained sloppy is practice at being sloppy.", opts: [
    { t: "Slow down and hold the shape — a clean round is what counts", ok: true },
    { t: "Push harder, the last round is where the gains are", ok: false },
    { t: "Skip ahead and come back to it at the end", ok: false } ] },

  { id: "ankletalk", tier: 2, after: "balance", q: "You feel Single-Leg Balance mostly in your ankle, not your hip. What does that tell you?", why: "A busy ankle means the hip has stopped doing its job. Shorten the reach until the hip takes it back.", opts: [
    { t: "The foot is fighting for balance — reach shorter and slow down", ok: true },
    { t: "It's working exactly right; ankles are what balance is for", ok: false },
    { t: "You're ready for the harder eyes-closed version", ok: false } ] },

  { id: "bracewhen", tier: 2, after: "core", q: "Why brace your middle BEFORE the hard part, not during it?", why: "A middle braced late has already bent, and the power leaked out through the bend.", opts: [
    { t: "Brace late and it has already bent — the power leaked", ok: true },
    { t: "Bracing after means you get one more breath in first", ok: false },
    { t: "It makes no difference as long as you brace at some point", ok: false } ] },

  { id: "deadbugback", tier: 2, after: "hollow", q: "Dead Bug — your low back keeps lifting off the floor. What do you change?", why: "Shorten the reach until the back stays down. The range you can hold is the range that's training you.", opts: [
    { t: "Make the reach smaller until the back stays glued down", ok: true },
    { t: "Press harder into the floor with your arms", ok: false },
    { t: "Speed up, so the back has no time to lift", ok: false } ] }
];
