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
  "◀ Back a move" (redo the previous move; not across a counted round),
  mood + reflection on the complete screen. A tap during the coach's
  announcement starts the move; the red STOP asks whether something hurts
  before it costs her anything — a plain "just stopping" is paid for the
  rounds she trained
- **Explore the moves** — the same session screen with nothing counting
  down: every move once, advanced by tap, no Body Check, nothing recorded
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
  pain. A round that falls short is **paid the fraction of it she actually did**
  rather than nothing: one skipped move in an eight-move round costs about 11 XP,
  not the whole 90. A round that counts still pays in full, so nothing she earned
  before got smaller — and whether a round *counts* is unchanged, it is only the
  price that stopped being all-or-nothing. Records written before this rule keep
  the value they were awarded (outcome version 5). A session ended early is not halved: it is paid for the rounds it
  finished, which is what "half for one ended early" used to approximate badly.
  An easy day is worth half a full one, and the number no longer wobbles with
  the move count of that weekday. Sessions logged before this rule keep the
  value they were awarded. **From outcome version 6 the day is priced once, not
  each sitting**: showing up is paid once per day, each main round that counts
  is paid once off the merged ledger, and the total is capped by the day's ask.
  A pain stop followed by coming back and finishing pays the rounds she
  finished; a second sitting never re-earns the show-up. Days written before
  version 6 keep their per-sitting settlement.
- **A day pays for a day.** The ceiling is the day's, not the sitting's, so a
  green day trained in two goes pays 360 in total rather than 360 twice. A move
  she skipped is never banked, so it is offered again the same day: come back
  before the day is out, finish what is left, and the day reads **complete**
  everywhere. **Complete is one field** (`dayComplete` on the day record): every
  move the plan asked for was attempted, nothing was skipped, no move came in
  under half its dose, and every planned main round counted — the same door that
  earns the streak and pays the full day, so the week strip, the day card, the
  training log, the Grown-up boards and the finish screen cannot disagree. A move
  itself counts (✓) at 80% of its time or all of its reps, reads ½ when short of
  that, and ⏭ when skipped or under 3 seconds; the day card and the finish screen
  show that verdict per move with the reason, and a one-line legend says the rule. That window is the training day
  only (plus a 6-hour grace past midnight for a session that crossed it): a
  partial never carries into a new day, which is the No-Debt rule. Since
  two devices offline at once cannot see each other's budget, the total is
  settled per calendar date when the log is rebuilt — and a prize draw waits
  while a device is offline with a mirror it has previously reached, because
  prizes are drawn off a total that is not final until both devices have met.
- **The streak follows the plan's schedule** (from 2026-09-18). A scheduled
  training weekday with neither a counting day nor a finished recovery pass
  breaks it; Sunday is never a gap; today untrained is not yet a gap; a
  finished-recovery day holds the run and counts in its length. Days before the
  cutover keep the old two-day-gap reading, so nothing she was standing on that
  night dropped.
- **Quiz XP pays for learning, not repetition.** Only the day's first completed
  deck pays at all; each question pays at most once *ever* (+5 the first time it
  is attempted, +25 the first time it is answered right — a question missed the
  first time still pays its +25 when it is finally learned); and all quiz XP
  shares a daily ceiling of 30 XP — exactly one brand-new question, a sixth of
  even the lightest training day.
  Questions are paid whole or not at all, so one the cap skipped is still worth
  full value tomorrow. Replays are free practice worth 0 XP, and the Coach's
  Quiz at the end of a session prices off the same ledger. The bank asks about
  every move three ways (cue / watch-out / fix), **about every ocean rank she
  has unlocked two ways** — what that rank taught her, and its one true marine
  fact — and **about training itself**: eighteen questions on attitude,
  efficiency, and why results come from repeating the same movement rather than
  a similar one. So the pool grows as she climbs. Locked ranks are never asked: that
  would spoil the mystery card and quiz her on a chapter she has not been shown.
  The bank is finite, so lifetime quiz XP is capped — the Grown-up Zone's Analytics tab
  shows how much of that budget is spent.
- **A wrong answer is never the silly one.** Every distractor is either true of
  a different move or something a swimmer her age actually believes, so a card
  can only be answered by knowing which one applies. The generator refuses to
  put two answers that say the same thing on one card, and refuses to let the
  right answer give itself away by being the longest — both were real failures,
  and both are asserted in `core/test/invariants.mjs` against generated cards
  rather than against any one function.
- **Two tiers, paced by her.** Tier 1 is recognition (which cue belongs to this
  move). Tier 2 is application (that felt wrong — so what do you change?), and
  it stays closed until the tier-1 question it builds on is mastered. Nothing to
  configure; it moves at her pace. The whole bank still counts toward the mastery
  total and the lifetime ceiling, so neither number moves when a tier opens.
- **The training principles reach her, rather than waiting to be found.** Left
  to the draw they were four entries in a bank of eighty-nine — about one card
  in twenty — so the thing the app most wants her to understand was the thing
  she was least likely to be asked. One Quiz Deck slot is now reserved for one,
  and they are in the end-of-session rotation too, which is the card she sees
  whether or not she opens the deck: roughly two of them a training week, with
  the first inside three sessions. A principle keeps the SAME ledger key in both
  places — one question, one key, wherever it is asked — so it can never be paid
  for twice or counted twice toward mastery.
- **One card is about today.** Each deck opens with a question built from the
  session she just trained — a move she herself graded wobbly, the light her own
  Body Check produced, the word she picked after round one. It renews daily, so
  it can never be mastered and never pays from the finite ledger: a flat +5, once
  a day, inside the same 30 XP ceiling.
- **The rank ladder runs to level 50** (Seahorse → Ocean Legend). Rank
  thresholds and `levelCost()` are frozen: re-pricing a level would silently
  move a level that has already been earned.

## Shared core

Two apps are built on one engine: this one and the sibling Figure-Skate
Dryland Timer. Everything that does not name the sport — the session engine,
the store, the XP and prize rules, the grown-up gate, the sync, the screens,
the service worker and four of the five test suites — lives under `core/`,
which is byte-identical in both repositories and shared with `git subtree`.
What makes this app *this* app is three files it owns:

- `js/sport.js` — its identity: names, storage keys, the Firestore collection,
  the mascot and body-map images, and the twenty lines of copy that mention
  water. The core reads them through `core/sport.js` and never names a sport.
- `js/data.js` — its content: the plan, the ranks and lore, the prizes, the
  readiness copy, the Coach's Quiz, the training principles and the kid-facing
  watch-out/fix wording. Built with the mechanism in `core/plan.js`.
- `css/tokens/*`, `css/fonts.css`, `assets/`, `index.html`, `manifest.webmanifest`
  and the two-line `sw.js` that configures the shared worker — the design
  system and the shell.

A change to the rules is made once, in `core/`, and reaches the sibling app
with one `git subtree pull`. A change to how a level is priced is therefore
the same change for both athletes by construction, not by a test.

## Running it

Static files, no build step — but the app uses ES modules, so serve over HTTP
(opening `index.html` from disk won't work):

```
python3 -m http.server 8080
# then open http://localhost:8080/
```

Any static host (e.g. GitHub Pages) works as-is.

## Tests

`npm test` runs `core/test/run.mjs`, which runs every suite in its own
process under the default timezone and America/New_York and reports every
failure — the chained `&&` it replaced stopped at the first one, so a
Monday-only assertion hid four green suites for a day a week. The suites:
the core's action-layer, invariants, integrity, landing-rule and offline-shell
suites (`core/test/`, shared with the skate app and run there against its
content too), the session-safety suite, the day-record suite, and this app's
`test/smoke.mjs`. No
install needed; the `package.json` exists only for this script. On a pull
request CI also runs `core/tools/release-check.mjs`: a precached shell file
that changed without a bump of `version` in `sw.js` fails the build.

## Data

- Everything the kid earns lives in `localStorage` (sessions, XP, prizes,
  quiz mastery, trackers) — nothing earned ever vanishes on reload.
- Completed sessions are also mirrored to Firebase Firestore when online
  (`core/firebase.js`); the app works fully offline. A versioned service worker
  (`core/sw-core.js`, configured by `sw.js`) precaches the app shell, so an
  Add-to-Home-Screen launch with no network still boots and can run a whole
  workout — bump `version` in `sw.js` on every release. Nothing from the mirror is ever cached: it carries body-map
  notes and readiness answers, and a stale copy of current data is worse than
  none.
- **One day record, and every screen a view of it.** `dayRecords()` in
  `core/outcome.js` settles each training day once: its sittings are grouped by
  the weekday the day was for and the date it began (a session that crosses
  midnight, or a Monday caught up on Wednesday, is one day everywhere), never by
  a device-local id — so a morning on the iPad and an afternoon on the phone are
  one workout. Its rows are the merged log plus any work banked live but never
  saved (see below); its ask is what the day was started under, lowered only by
  a jump-landing tier drop; its minutes are summed in seconds and rounded once;
  its movements are reported in both units, distinct moves and performances; a
  pain stop is a sitting's fact, not the day's verdict when she comes back and
  finishes; the override flag is set only when an adult changed the light. The
  finish screen, Today, Progress, the Grown-up Zone, the Body Check result and
  the CSV all read that record and nothing else — `core/test/invariants.mjs`
  asserts that no screen file computes a day-level fact on its own, and
  `core/test/dayrecords.mjs` drives fourteen days through the real engine
  (two devices, midnight, catch-up, crash, pain stop, start over, tier drop).
- **A workout keeps the light it started under.** A later body check may lower
  it — a body with more to say shortens what is left of the day — but never
  raise it. A bigger plan is a different workout, started deliberately, with its
  own identity and its own completion denominator.
- **Only saved history syncs, not an unfinished workout.** The day's progress
  record (completed moves, banked rounds, the resume position, the locked light)
  is local to the device, and it now keeps each finished move by name with its
  seconds, refreshed by a thirty-second heartbeat. When the next sitting saves,
  that proof is stamped on the row (`bankedRows`, `bankedSecs`) so a sitting the
  iPad lost mid-way still counts by name, never by a guess; "I need to start
  over" clears the record so the restart really starts over. What crosses
  devices is the log, the journey and the readiness checks, below.
- **The mirror syncs both ways on every boot** (`core/sync.js`), all of it
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
  machinery is present but **paused** (`OVERLOAD_PAUSED` in `core/plan.js`).

## Firestore rules

**Two apps, one project, one rules file.** This app and the sibling
Figure-Skate Dryland Timer share Firebase project `chore-tracker-a461b`; each
writes its own collection (`jess_swimming_sessions` here,
`jenn_skating_sessions` there). `firestore.rules` is byte-identical in both
repositories and names both collections in `isAppCollection`, so deploying it
from either repo is the same deploy. An earlier version named only this
collection, and deploying it would have locked the skate app out of its mirror
entirely — a collection with no match falls through to the deny-all.

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
(`core/screens/progress.js`, `core/screens/overlays.js`) and turning away malformed
rows at the merge (`mergeSessions` in `core/store.js`), so nothing that comes back
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

**Ship the WebP twin.** Every PNG a screen shows — move photos, poses, the
mascot, the body maps — has a `.webp` beside it at the same pixel size
(~90 % smaller), and the screens ask for it first, falling back to the PNG.
`npm test` fails if a twin is missing. After adding or replacing a PNG:

```
PLAYWRIGHT_MODULE=… node core/tools/webp.mjs "assets/exercises/<New Move> - Timer Image.png"
```

(`playwright` from `node_modules` works without the variable.)
