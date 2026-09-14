# Coach voice — sample kit

A fifteen-line listening test, to decide one thing: **is a pre-rendered coach
worth building?** Nothing here is wired into the app. If the answer is no,
delete `tools/voice/` and `assets/voice/` and the app is exactly as it was.

## Why this exists

The coach speaks through `speechSynthesis` (`js/audio.js`). On the iPad she
actually trains with, that is a dead end and has got worse, not better:

- Safari 26 **restricts the voice list as anti-fingerprinting protection**
- Siri's voices are **never** exposed to the web
- voices visible in Settings → Accessibility → Spoken Content often don't show
  up to `getVoices()` at all, and a web page **cannot** trigger their download
- on-device neural TTS in the browser (Kokoro, 82M params) **runs out of memory
  on iOS** — desktop only

So there is no better voice for the app to pick. Writing a smarter
`pickCoachVoice()` polishes something Apple has locked.

What *did* change is the price of going around it. Neural TTS is now ~$15 per
million characters, and the coach's script is small and templated — move names,
setup cues, counts, praise, a handful of fixed lines. Rendering the whole thing
in two voices is a few hundred clips, roughly **$2, once**.

## How to test it

Three ways, cheapest first. **Do them on the iPad**, not a laptop — the speaker
and the room are part of what you're judging.

### 1. Hear the candidate voices — 2 minutes, no key, no code

Open [openai.fm](https://openai.fm) on the iPad. It's OpenAI's free demo of the
same model this kit renders with (`gpt-4o-mini-tts`), and it takes custom text,
a voice, and a plain-English instruction — no account, no API key.

Paste these lines in (the real ones, from the real plan):

```
Hollow Tuck Flutter. Ribs down, low back glued. Three, two, one, go.
Pal-off Press. Three, two, one, go.
Scap Pull-Up + Dead Hang. Hang tall, shoulders ready. Three, two, one, go.
Say it out loud with me, loud and proud: I am STRONG. I am SMOOTH. I can SWIM THIS. Your light today is green. Starting with Jump Rope.
```

Then listen twice. **Warm** — pick voice `coral`, instruction:

> You are a patient, kind swim coach talking to a ten-year-old girl during a
> dryland workout. Speak calmly and clearly, a little slower than
> conversational. Warm and steady, never sing-song, never babyish, never
> shouty. Land the exercise name cleanly and leave a small beat before any
> count-in.

**Bright** — pick voice `nova`, instruction:

> You are an upbeat, fun swim coach talking to a ten-year-old girl during a
> dryland workout. Energetic and playful, with a smile in the voice, but still
> crisp and easy to follow mid-effort. Never frantic, never condescending.
> Land the exercise name cleanly and leave a small beat before any count-in.

This answers the only question that actually blocks the build: **is a real voice
clearly better than what she hears now, and are the two styles distinguishable?**
If the answer is no, stop here — nothing else in this folder needs running.

### 2. Hear what she has today — no key either

```sh
npm run voice:serve
```

It prints a `http://192.168.x.x:8080/…` address — open that on the iPad (same
Wi-Fi). Without rendered clips the **Now (device)** buttons still work, and the
bottom panel lists exactly which voices iOS is willing to hand the web page.
That list is the evidence for why the device voice can't just be swapped.

Pair it with step 1 and you have the full comparison, for free.

### 3. The real A/B, side by side — needs a key, costs ~2¢

```sh
OPENAI_API_KEY=sk-… npm run voice:render
npm run voice:serve
```

Now each row on the compare page plays the same line three ways: device, Warm,
Bright, back to back. This is the one that settles the *playback* questions
(below), not just the voice.

Re-runs skip clips already on disk, so adding a line only renders that line.

## What to listen for

Each row plays the same line three ways: **Now (device)** — rigged to be fair,
using the app's real defaults, the same pronunciation map and the same
voice-picking rule as `js/audio.js` — then the two rendered candidates.

The rows that matter most:

| Row | The question it answers |
|---|---|
| Pronunciation map | Does "Pal-off Press" still work, or does a real voice make the hack unnecessary? |
| Awkward move name | "Scap Pull-Up + Dead Hang" — does the `+` get read as a word? |
| Session opening | The longest line she hears. Does it hold attention or drone? |
| Safety voice | Level and slow, and clearly different from the coaching voice |
| Praise · fun vs encouraging | Are two voices actually distinguishable to a ten-year-old? |

Toggle **Slow/Normal** on at least one long line. Rendered clips slow down via
`playbackRate` with `preservesPitch`, so one rendering serves both speeds — if
that sounds wrong, the plan needs two renderings per line and costs double.

## If it's a yes

The build after this is: render the full script (~400 clips), put an audio
player behind `speak()` in `js/audio.js`, cache the clips in `sw.js`, and keep
`speechSynthesis` as the fallback for anything not in the manifest. The three
switches (`coachSpeechOn` / `timerSoundsOn` / `safetyVoiceOn`) and the safety
rules don't change — only the player underneath them.

One thing it forces: `fun` / `classic` / `encouraging` stop being pitch-and-rate
tweaks on one synthetic voice and become two real voices, with `classic` riding
the warm one.
