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

## XP rules

- **Training** is the open-ended way up: a finished session pays
  `(moves × 10 + 40) × roundsFactor` (half for one ended early, nothing for a
  spa day). Rounds count — 1 round ×1.0, 2 rounds ×1.5, 3 rounds ×2.0 — so a
  1-round easy day is worth half a full 3-round day instead of the same.
  Sessions logged before this rule keep the flat value they were awarded.
- **Quiz XP pays for learning, not repetition.** Only the day's first completed
  deck pays at all; each question pays at most once *ever* (+10 the first time
  it is attempted, +25 the first time it is answered right — a question missed
  the first time still pays its +25 when it is finally learned); and all quiz
  XP shares a daily ceiling of 35 XP — one brand-new question, against 220+
  for even the lightest training day.
  Questions are paid whole or not at all, so one the cap skipped is still worth
  full value tomorrow. Replays are free practice worth 0 XP, and the Coach's
  Quiz at the end of a session prices off the same ledger. The bank asks about
  every move three ways (cue / watch-out / fix) **and about every ocean rank she
  has unlocked two ways** — what that rank taught her, and its one true marine
  fact — so the pool grows as she climbs. Locked ranks are never asked: that
  would spoil the mystery card and quiz her on a chapter she has not been shown.
  The bank is finite, so lifetime quiz XP is capped — the Grown-up Zone's Analytics tab
  shows how much of that budget is spent.
- **The rank ladder runs to level 50** (Seahorse → Ocean Legend). Rank
  thresholds and `levelCost()` are frozen: re-pricing a level would silently
  move a level that has already been earned.

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
- **Backup & restore** (Grown-up Zone → Settings): downloads one athlete's
  whole namespace as JSON — sessions, XP, prizes, quiz mastery, trackers,
  settings — and restores it into the active athlete. Restoring is additive:
  sessions are merged and deduped, the higher XP total wins, prize wallets are
  unioned, and other records fill in only where the device has nothing.
  Settings are the one exception — untouched defaults are replaced, anything a
  grown-up has actually changed here wins.
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
