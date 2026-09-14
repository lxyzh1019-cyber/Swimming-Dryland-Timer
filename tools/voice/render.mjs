#!/usr/bin/env node
/* ============================================================
   VOICE RENDERER — turns the sample lines into MP3s, once.

     OPENAI_API_KEY=sk-... node tools/voice/render.mjs

   Writes assets/voice/sample/<voice>/<id>.mp3 and a manifest.json beside them,
   then prints what it cost. Nothing in the app reads these yet: the sample is
   played by tools/voice/compare.html, which you open on the iPad.

   WHY PRE-RENDER AT ALL. On iPhone and iPad the Web Speech API is a dead end —
   Safari 26 restricts the voice list as anti-fingerprinting, Siri's voices are
   never exposed, and the voices that do show up are the old compact ones. The
   app cannot pick a better voice because there isn't one to pick. So the only
   route to a coach who sounds like a person is to generate the audio somewhere
   else and ship it.

   WHY THAT IS AFFORDABLE. The coach's script is small and templated — move
   names, setup cues, counts, praise, a handful of fixed lines. Rendering the
   whole thing twice (two voices) is a few hundred clips and about two dollars,
   one time, not per session and not per child.

   RE-RUNS ARE FREE. A clip already on disk is skipped, so re-running after
   adding a line only renders the new line. Delete a file to re-render it.
   ============================================================ */

import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sampleClips, VOICES, SAFETY_IDS } from "./lines.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = join(ROOT, "assets/voice/sample");

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
/* $15 per million characters at the time of writing. Only used to print an
   estimate, so a price change makes the estimate stale, never the audio. */
const USD_PER_MILLION_CHARS = 15;

/* The app's own speeds. Rendering at 1.0 and letting the player slow it down is
   the right call — <audio>.playbackRate with preservesPitch keeps a slowed
   clip from sounding like a chipmunk, so one clip serves both Slow and Normal
   and we don't pay to render the script twice. */
const RENDER_SPEED = 1.0;
/* The safety line is the one that does not track a preference — level, clear
   and slow, whatever style is selected. Baked in, because it must not depend on
   a playback setting being right. */
const SAFETY_SPEED = 0.85;

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function renderClip({ spoken, speed, voice, instructions }) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      voice,
      instructions,
      input: spoken,
      speed,
      response_format: "mp3"
    })
  });
  if (!res.ok) {
    throw new Error(`TTS ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 400)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const clips = sampleClips();
  const voiceKeys = Object.keys(VOICES);
  const chars = clips.reduce((n, c) => n + c.spoken.length, 0) * voiceKeys.length;
  const estimate = (chars / 1_000_000) * USD_PER_MILLION_CHARS;

  console.log(`${clips.length} lines × ${voiceKeys.length} voices = ${clips.length * voiceKeys.length} clips`);
  console.log(`${chars} characters ≈ $${estimate.toFixed(4)} at $${USD_PER_MILLION_CHARS}/M\n`);

  if (!API_KEY) {
    console.error("OPENAI_API_KEY is not set — nothing rendered.\n");
    console.error("  OPENAI_API_KEY=sk-... node tools/voice/render.mjs\n");
    process.exitCode = 1;
    return;
  }

  const manifest = { model: MODEL, renderedAt: new Date().toISOString(), voices: {}, clips: [] };

  for (const key of voiceKeys) {
    const { voice, label, instructions } = VOICES[key];
    manifest.voices[key] = { voice, label, instructions };
    await mkdir(join(OUT_DIR, key), { recursive: true });

    for (const clip of clips) {
      const file = join(OUT_DIR, key, `${clip.id}.mp3`);
      if (await exists(file)) { console.log(`  = ${key}/${clip.id}.mp3 (exists)`); continue; }
      const speed = SAFETY_IDS.has(clip.id) ? SAFETY_SPEED : RENDER_SPEED;
      const audio = await renderClip({ spoken: clip.spoken, speed, voice, instructions });
      await writeFile(file, audio);
      console.log(`  + ${key}/${clip.id}.mp3  ${(audio.length / 1024).toFixed(0)} KB`);
    }
  }

  /* One manifest entry per LINE, not per file — the two voices are two
     renderings of the same line, and the compare page plays them side by side. */
  manifest.clips = clips.map(c => ({
    id: c.id, kind: c.kind, text: c.text, spoken: c.spoken,
    safety: SAFETY_IDS.has(c.id)
  }));
  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\nWrote ${OUT_DIR}/manifest.json`);
  console.log("Now serve the repo and open tools/voice/compare.html on the iPad.");
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
