# Splash — Swim Dryland Timer

A dryland strength & mobility training companion for a young competitive
swimmer, built on the **2026.2 plan** (Warm-up → Coordination → Main
[traffic-light rounds] → Finisher → Swim-Skill; Sunday = spa recovery) and
the **Splash — Kids Swim Training** design system.

## What's inside

- **Today** — week strip, Journey Map (XP → ocean ranks), day card with the
  full plan, GO button
- **Body Check** — 4-question readiness check with a tappable front/back body
  map; the traffic light sets main-set rounds (green 3 / yellow 2 / red 1 /
  recovery)
- **Session** — guided timer with a real speech coach (cues, counts, tempo
  reps), portrait form-photo slots, STOP rule overlay, clean/wobbly checks,
  mood + reflection on the complete screen
- **Progress** — streaks, prize wallet, milestones, training log, Ocean Story
- **Grown-up Zone** — Overview, Analytics (incl. ACWR + CSV export), Coaching
  (valgus gate, Independence Ladder, PR board, engagement systems), Move
  Library, Settings
- **Quiz Deck & Prize Draw** — questions generated from the plan's own
  cues/watch-outs/fixes; level-ups earn a prize envelope

## Running it

Static files, no build step — but the app uses ES modules, so serve over HTTP
(opening `index.html` from disk won't work):

```
python3 -m http.server 8080
# then open http://localhost:8080/
```

Any static host (e.g. GitHub Pages) works as-is.

## Tests

A dependency-free smoke test covers the core logic (streak/XP math, readiness
scoring + the pain-gate, quiz rotation, and that the view-models render):

```
npm test        # runs node test/smoke.mjs — no install needed
```

The `package.json` exists only for this script; the app itself still has no
build step.

## Data

- Everything the kid earns lives in `localStorage` (sessions, XP, prizes,
  quiz mastery, trackers) — nothing earned ever vanishes on reload.
- Completed sessions are also mirrored to Firebase Firestore when online
  (`js/firebase.js`); the app works fully offline.
- That mirror is **read back on every boot** (`js/sync.js`): any session this
  browser is missing is merged into the local log and its XP re-awarded, so a
  cleared or brand-new browser recovers the history instead of starting over.
  The merge is additive and idempotent — local records are never overwritten.
  Mirrored records are tagged with the athlete, and a restore only pulls back
  that athlete's own sessions.
- **One storage namespace per athlete.** The first athlete uses the bare keys;
  additional ones get `<key>::<profileId>`. Add or switch athletes in
  Grown-up Zone → Settings (switching reloads the app).
- Writes that localStorage rejects (full device) are retried after dropping the
  expendable analytics keys, and if they still fail the app says so — a session
  that wasn't recorded never reads as saved.
- Workout content lives in `js/data.js` (`DAYS`). Progressive overload
  machinery is present but **paused** (`OVERLOAD_PAUSED` in `js/data.js`).

## Exercise photos

Photo slots are intentionally empty until real photos land in
`assets/exercises/`, one file per exercise per purpose:

- `<Exercise Name> - Timer Image.png` — shown in the in-session photo slot
  while that exercise is running. Portrait ≥720×960.
- `<Exercise Name> - Demo Image.png` — shown in the Move Library card and
  the session detail overlay (the ⓘ "Watch the move" popup). Cover-cropped,
  so any aspect ratio works.

`<Exercise Name>` is the exercise's `name` from `js/data.js`, spaces and all
(e.g. `Hollow Tuck Flutter - Timer Image.png`). A `/` in a name becomes `-`
since it can't appear in a filename. Get the spelling exactly right — a
typo means that photo silently falls back to the placeholder.
