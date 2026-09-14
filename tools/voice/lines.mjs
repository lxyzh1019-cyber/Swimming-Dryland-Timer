/* ============================================================
   VOICE SAMPLE SET — the fifteen lines that decide whether a pre-rendered
   coach is worth building.

   WHY A SAMPLE AND NOT THE WHOLE SCRIPT. The full coach is ~400 clips. Nobody
   should pay for 400 clips, or spend two days wiring a player, to find out the
   voice doesn't suit a ten-year-old. So this file picks the fifteen lines that
   between them cover every KIND of thing the coach says — a move name, a setup
   cue, a count-in, praise, a rest hand-off, a safety line — and the renderer
   makes only those.

   The lines are pulled from the app's real data, not retyped. A sample built
   from invented text proves nothing about how "Pal-off Press" or
   "Scap Pull-Up + Dead Hang" actually land.
   ============================================================ */

import { DAYS, PRONUNCIATION_MAP, ENCOURAGEMENTS_BY_STYLE, MICRO_LOOP } from "../../js/data.js";
import { speakableText } from "../../js/util.js";

/* Every exercise the coach can end up announcing, by name — the day's blocks
   AND the prep menu, because a swapped-in move is spoken exactly like a
   scheduled one. The sample quotes real moves, so a renamed or retired move
   must break this loudly rather than sample a ghost. */
function allExercises() {
  const out = new Map();
  const add = list => { for (const ex of list || []) if (ex && ex.name) out.set(ex.name, ex); };
  for (const day of Object.values(DAYS)) {
    for (const block of Object.values(day.blocks || {})) add(block);
    add(day.prepMenu);
  }
  return out;
}

const EX = allExercises();

function ex(name) {
  const found = EX.get(name);
  if (!found) {
    throw new Error(
      `Sample line references "${name}", which is no longer in DAYS. ` +
      `Pick a current move in tools/voice/lines.mjs.`
    );
  }
  return found;
}

/* The engine's own phrasing, reproduced exactly. These templates live in
   engine.js; if one changes there the sample should change with it, because the
   whole point is to hear what she will actually hear. */
const announce   = e => e.name + "." + (e.reset ? " " + e.reset : "") + " Three, two, one, go.";
const getReady   = e => "Get ready for " + e.name + (e.reset ? ". " + e.reset : "");
const restNext   = e => `Rest. Next: ${e.name}.`;

/* Fifteen lines, one per kind of thing the coach says. `kind` is what the clip
   is PROVING, and it is what you should listen for when you compare. */
export const SAMPLE_LINES = [
  { id: "announce-flutter",  kind: "Move announcement",  text: announce(ex("Hollow Tuck Flutter")) },
  { id: "announce-pullup",   kind: "Move announcement",  text: announce(ex("Clean Pull-Ups")) },
  { id: "announce-hyphen",   kind: "Awkward move name",  text: announce(ex("Scap Pull-Up + Dead Hang")) },
  { id: "announce-pallof",   kind: "Pronunciation map",  text: announce(ex("Pallof Press")) },
  { id: "get-ready",         kind: "Rest-countdown cue", text: getReady(ex("Drop-and-Stick")) },
  { id: "rest-next",         kind: "Rest hand-off",      text: restNext(ex("Glute Bridge March")) },

  { id: "mantra",            kind: "Session opening",
    text: "Say it out loud with me, loud and proud: " + DAYS.monday.mantra +
          " Your light today is green. Starting with " + DAYS.monday.blocks.warmup[0].name + "." },
  { id: "first-block",       kind: "Lead-in",            text: "Five seconds to the first block." },
  { id: "count-in",          kind: "Bare count-in",      text: "Three, two, one, go." },
  { id: "switch-sides",      kind: "Mid-move correction", text: "Nice. Switch sides — five to reset." },
  { id: "round-done",        kind: "Round progress",     text: "Round 1 done! You've got 2 more to crush!" },

  { id: "praise-encouraging", kind: "Praise · encouraging", text: ENCOURAGEMENTS_BY_STYLE.encouraging[0] },
  { id: "praise-fun",         kind: "Praise · fun",         text: ENCOURAGEMENTS_BY_STYLE.fun[0] },

  { id: "micro-loop",        kind: "Question to her",     text: MICRO_LOOP.q },
  { id: "safety-stop",       kind: "Safety voice",        text: "Session stopped." }
];

/* What actually goes to the renderer. A clip is keyed by its SPOKEN text — the
   same transform the live coach applies before speaking — so a clip and a
   fallback utterance can never drift apart. */
export function sampleClips() {
  return SAMPLE_LINES.map(l => ({ ...l, spoken: speakableText(l.text, PRONUNCIATION_MAP) }));
}

/* Two voices, because the styles are staying. `fun` and `encouraging` stop
   being a pitch multiplier on one synthetic voice and become two people: one
   warm and steady, one bright and playful. `classic` rides the warm voice.

   The instructions are what `gpt-4o-mini-tts` steers on, and they are written
   for the listener the app is actually for — a ten-year-old hearing an exercise
   name for the first time, mid-effort, on a phone speaker across a room. */
export const VOICES = {
  warm: {
    voice: "coral",
    label: "Warm",
    instructions:
      "You are a patient, kind swim coach talking to a ten-year-old girl during a " +
      "dryland workout. Speak calmly and clearly, a little slower than conversational. " +
      "Warm and steady, never sing-song, never babyish, never shouty. Land the exercise " +
      "name cleanly and leave a small beat before any count-in."
  },
  bright: {
    voice: "nova",
    label: "Bright",
    instructions:
      "You are an upbeat, fun swim coach talking to a ten-year-old girl during a " +
      "dryland workout. Energetic and playful, with a smile in the voice, but still " +
      "crisp and easy to follow mid-effort. Never frantic, never condescending. Land " +
      "the exercise name cleanly and leave a small beat before any count-in."
  }
};

/* The safety voice does not track a preference in the app, and it must not here
   either — level and slow, whichever coach voice is selected. */
export const SAFETY_IDS = new Set(["safety-stop"]);
