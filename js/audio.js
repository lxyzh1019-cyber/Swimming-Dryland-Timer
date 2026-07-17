/* ============================================================
   AUDIO — the speech coach (speechSynthesis) + Web Audio cues.
   Everything is gated by settings.coachVoiceOn (the design's 🎧
   toggle): voice off ⇒ speakAndWait resolves immediately and no
   cues play — which is also what makes headless test runs fast.
   voiceStyle 'quiet' keeps the cues but suppresses most speech.
   ============================================================ */

import { settings } from "./store.js";
import { PRONUNCIATION_MAP, ENCOURAGEMENTS_BY_STYLE } from "./data.js";
import { escapeRegex } from "./util.js";

const speech = window.speechSynthesis || null;
let audioCtx = null;
let calmMode = false;

export function setCalmMode(on) { calmMode = !!on; }

export function coachAudioOn() { return settings.coachVoiceOn !== false; }
export function voiceOn() { return coachAudioOn() && settings.voiceStyle !== "quiet" && !!speech; }

/* Prefer an installed high-quality English voice; never force a gender or pitch. */
let _coachVoice = null;
function pickCoachVoice() {
  if (!speech) return null;
  const voices = speech.getVoices() || [];
  if (!voices.length) return null;
  const en = voices.filter(v => /^en/i.test(v.lang || ""));
  const pool = en.length ? en : voices;
  const preferred = ["natural", "neural", "enhanced", "premium", "siri", "aria",
                     "jenny", "ava", "guy", "google", "microsoft"];
  return pool.find(v => preferred.some(h => (v.name || "").toLowerCase().includes(h)))
    || pool.find(v => v.default)
    || pool[0]
    || null;
}
function refreshVoice() { _coachVoice = pickCoachVoice(); }
if (speech) {
  refreshVoice();
  speech.onvoiceschanged = refreshVoice;
}

const VOICE_PITCH = 1.0;
const VOICE_RATE  = 1.05;
const VOICE_PERSONA = {
  classic:     { rate: 1.00, pitch: 1.00 },
  fun:         { rate: 1.12, pitch: 1.15 },
  encouraging: { rate: 0.94, pitch: 0.95 },
  quiet:       { rate: 1.00, pitch: 1.00 }  // gated upstream — never reaches here
};

function applyPronunciationMap(msg) {
  let out = msg;
  for (const [word, pron] of Object.entries(PRONUNCIATION_MAP)) {
    out = out.replace(new RegExp(escapeRegex(word), "gi"), pron);
  }
  return out;
}

function createCoachUtterance(msg) {
  const u = new SpeechSynthesisUtterance(applyPronunciationMap(msg));
  const style = settings.voiceStyle || "classic";
  const p = VOICE_PERSONA[style] || VOICE_PERSONA.classic;
  u.rate  = VOICE_RATE  * p.rate;
  u.pitch = VOICE_PITCH * p.pitch;
  if (_coachVoice) u.voice = _coachVoice;
  return u;
}

export function speak(msg) {
  if (!voiceOn()) return;
  speech.speak(createCoachUtterance(msg));
}

export function speakIfIdle(msg) {
  if (!voiceOn() || speech.speaking || speech.pending) return;
  speak(msg);
}

export function interruptSpeech(msg) {
  if (!voiceOn()) return;
  speech.cancel();
  speak(msg);
}

export function cancelSpeech() {
  if (speech) speech.cancel();
}

export function speechActive() {
  return !!(speech && (speech.speaking || speech.pending));
}

// Speak and WAIT for the utterance to finish before proceeding — the timer
// never starts until the voice cue completes. Resolves immediately when the
// coach voice is off or in quiet mode.
export function speakAndWait(msg) {
  return new Promise(resolve => {
    if (!voiceOn()) { resolve(); return; }
    const u = createCoachUtterance(msg);
    let settled = false;
    let failsafe = null;
    // If `onstart` never fires (flaky mobile speechSynthesis), don't strand the
    // session in silence — proceed after a short grace so the timer starts and
    // the voice can catch up, rather than the old ~15s hang.
    const startFailsafe = setTimeout(done, 4000);
    function done() {
      if (settled) return;
      settled = true;
      clearTimeout(startFailsafe);
      if (failsafe) clearTimeout(failsafe);
      setTimeout(resolve, 200);
    }
    u.onstart = () => {
      clearTimeout(startFailsafe);
      failsafe = setTimeout(done, Math.max(msg.length * 100, 3000));
    };
    u.onend = done;
    u.onerror = done;
    speech.speak(u);
  });
}

let lastEncouragement = "";
export function nextEncouragement() {
  const style = settings.voiceStyle || "classic";
  const pool  = ENCOURAGEMENTS_BY_STYLE[style] || ENCOURAGEMENTS_BY_STYLE.classic;
  const options = pool.filter(msg => msg !== lastEncouragement);
  const chosen = options[Math.floor(Math.random() * options.length)] || pool[0];
  lastEncouragement = chosen;
  return chosen;
}

/* ---- Web Audio cues (design spec): WORK = bright rising triangle,
   REST = soft falling sine; countdown ticks match their phase. ---- */
export function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (audioCtx && audioCtx.state === "suspended") { try { audioCtx.resume(); } catch {} }
  return audioCtx;
}

function note(freq, at, dur, type, vol) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  const t = ctx.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(calmMode ? vol * 0.4 : vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

export function playCue(kind) {
  if (!coachAudioOn()) return;
  // never blip over the coach's voice
  if (kind.startsWith("tick") && speechActive()) return;
  if (kind === "work")          { note(659, 0, 0.14, "triangle", 0.18); note(880, 0.15, 0.2, "triangle", 0.2); }
  else if (kind === "rest")     { note(523, 0, 0.18, "sine", 0.14); note(392, 0.2, 0.28, "sine", 0.12); }
  else if (kind === "tick")     { note(880, 0, 0.07, "square", 0.07); }
  else if (kind === "tickSoft") { note(660, 0, 0.045, "sine", 0.028); }
  else if (kind === "tickRest") { note(440, 0, 0.07, "sine", 0.08); }
  else if (kind === "done")     { note(523, 0, 0.16, "triangle", 0.18); note(659, 0.16, 0.16, "triangle", 0.18); note(784, 0.32, 0.34, "triangle", 0.2); }
}

export function beep(freq = 440, duration = 0.12) {
  if (!coachAudioOn() || calmMode) return;
  note(freq, 0, duration, "sine", 0.15);
}
export function endBeep() {
  if (!coachAudioOn()) return;
  note(700, 0, 0.25, "sine", calmMode ? 0.07 : 0.18);
}
