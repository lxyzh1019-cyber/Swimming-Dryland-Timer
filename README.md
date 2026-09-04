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

- **Training** is the open-ended way up: a session pays a flat rate for the
  rounds actually trained — **0 rounds 90 (showing up), 1 round 180, 2 rounds
  270, 3 rounds 360**, and nothing for Sunday's spa day or a session stopped for
  pain. A session ended early is not halved: it is paid for the rounds it
  finished, which is what "half for one ended early" used to approximate badly.
  An easy day is worth half a full one, and the number no longer wobbles with
  the move count of that weekday. Sessions logged before this rule keep the
  value they were awarded.
- **A day pays for a day.** The ceiling is the day's, not the sitting's, so a
  green day trained in two goes pays 360 in total rather than 360 twice. Since
  two devices offline at once cannot see each other's budget, the total is
  settled per calendar date when the log is rebuilt — and a prize draw waits
  while a device is offline with a mirror it has previously reached, because
  prizes are drawn off a total that is not final until both devices have met.
- **Quiz XP pays for learning, not repetition.** Only the day's first completed
  deck pays at all; each question pays at most once *ever* (+5 the first time it
  is attempted, +25 the first time it is answered right — a question missed the
  first time still pays its +25 when it is finally learned); and all quiz XP
  shares a daily ceiling of 30 XP — exactly one brand-new question, a sixth of
  even the lightest training day.
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
  (`js/firebase.js`); the app works fully offline. A versioned service worker
  (`sw.js`) precaches the app shell, so an Add-to-Home-Screen launch with no
  network still boots and can run a whole workout — bump `CACHE_VERSION` on
  every release. Nothing from the mirror is ever cached: it carries body-map
  notes and readiness answers, and a stale copy of current data is worse than
  none.
- **A workout has an identity, and one answer.** A day trained in two goes
  writes two session records carrying the same `workoutInstanceId` (minted when
  the plan starts, carried on the day's progress record so a resume keeps it).
  Every screen that answers for a day — the finish screen, Today, Progress and
  the Grown-up Zone — aggregates on it before counting, so resuming a day does
  not turn it into two sessions with half the duration each. Its main rounds are
  numbered from what is already banked, so the second sitting's rows cannot
  collide with the first's; its rows are merged per planned move, keeping the
  best credit anything proved, so a move attempted twice is paid once; and its
  XP is the *settled* day total, never the sum of the sittings' stamps.
  `test/invariants.mjs` asserts those numbers agree ACROSS screens rather than
  inside one module — the class of defect that outlives a per-module test.
- **A workout keeps the light it started under.** A later body check may lower
  it — a body with more to say shortens what is left of the day — but never
  raise it. A bigger plan is a different workout, started deliberately, with its
  own identity and its own completion denominator.
- **Only saved history syncs, not an unfinished workout.** The day's progress
  record (completed moves, banked rounds, the resume position, the locked light)
  is local to the device. A workout is finished on the device it was started on;
  what crosses devices is the log, the journey and the readiness checks, below.
- **The mirror syncs both ways on every boot** (`js/sync.js`), all of it
  additive — nothing is overwritten or deleted on either side:
  1. *pull* — any session this browser is missing is merged into the local log,
     so a cleared or brand-new browser recovers the history instead of starting
     over;
  2. *push* — any session the cloud is missing (logged offline, or before the
     mirror existed) is backfilled up;
  3. *journey* — the quiz ledger, prize wallet and pending draws ride in one
     `kind: "journey"` doc per athlete in the same collection, merged upward and
     republished.
  Mirrored records are tagged with the athlete, and a restore only pulls back
  that athlete's own sessions.
- **XP is derived, not accumulated**: `xp = what the training log is worth +
  what the quiz ledger is worth`. Both halves sync, so every device computes the
  same number — without this, two devices showed two different levels for the
  same kid (26 on one, 18 on the other). It is idempotent and un-farmable: the
  ledger already pays each question exactly once.
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

## Firestore rules

Everything the mirror writes lives in one collection,
`jess_swimming_sessions`, holding three document shapes told apart by `kind`:
session rows (no `kind`), one `journey-<athlete>` doc, and one
`readiness-<athlete>` doc carrying the abnormal body-map checks. One collection
was a deliberate choice — a second would have meant a second rule to get wrong.

`firestore.rules` confines the app to that collection, rejects anything that is
not one of the three shapes, caps the number of fields in a document, and
forbids deletion outright so a mis-tap or a stale client can never take her
history with it.

**The mirror is not secure, and nothing here should be read as saying it is.**
It has no sign-in, so reads are public and writes are unauthenticated: anyone
who can reach the Firebase project can read training and body-map data and
write forged records. That is an accepted trade — the whole point of the mirror
is that two phones in one family see the same log without an account — and it
rests on the assumption that nobody outside the family knows the project
exists. The rules confine a MISBEHAVING client; they do nothing about a hostile
one. The app defends itself separately by rendering every stored string as text
(`js/screens/progress.js`, `js/screens/overlays.js`) and turning away malformed
rows at the merge (`mergeSessions` in `js/store.js`), so nothing that comes back
off the wire can execute or break a screen.

The deferred upgrade is Firebase Authentication with family-owned document
paths and server-side ownership rules. It is not implemented.

Deploy it with the Firebase CLI, from the repository root:

```
npx firebase-tools deploy --only firestore:rules --project chore-tracker-a461b
```

**Cross-device saving is not verified by anything in this repository.** The test
suite covers the local logic; it cannot reach Firestore. Rules also do nothing
at all until they are deployed — an undeployed `firestore.rules` and no rules
file are the same thing to the running app. After deploying, check it end to
end: finish a session on one device, open the app on the other, and confirm the
session and any abnormal body-map check both arrive.

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
