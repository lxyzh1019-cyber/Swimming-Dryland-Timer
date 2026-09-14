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

## Run it

```sh
OPENAI_API_KEY=sk-… node tools/voice/render.mjs     # ~2¢, writes assets/voice/sample/
python3 -m http.server 8080                         # from the repo root
```

Then open `http://<this-machine>:8080/tools/voice/compare.html` **on the iPad**,
not on a laptop — the speaker and the room are part of what you're judging.

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
