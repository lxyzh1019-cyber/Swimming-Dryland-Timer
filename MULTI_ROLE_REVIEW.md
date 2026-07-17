# Multi-Role Review — Splash Swim Dryland Timer

## Context

A five-hat review of the app — senior software engineer (bugs), senior
developer/designer (color & components), kid + parent (logic & flow /
performance review), and psychologist (logic & motivation) — ending in an
**improvement list per role**.

This is a **review deliverable only — no code changes were made**. Each role has
findings, then a prioritized improvement list. Severity tags: 🔴 high · 🟠 medium
· 🟡 low.

**Reviewed:** `js/engine.js`, `js/store.js`, `js/main.js`, `js/audio.js`,
`js/util.js`, `js/firebase.js`, `js/data.js`, the `vm/*` view-models,
`css/tokens/*`, and `css/app.css`. The app is a ~6,500-line vanilla-JS ES-module
SPA — genuinely well-built: clean VM/screen separation, honest empty states,
local-first persistence, thoughtful safety scaffolding. The notes below are
improvements on a strong base.

---

## Role 1 — Senior Software Engineer (bugs, correctness, robustness)

**Findings**

- 🔴 **Cloud privacy depends on unverified Firestore rules.** `js/firebase.js`
  ships a public config and writes a named child's sessions — including
  soreness/pain/body-map-derived data and the name "Jess" — to collection
  `jess_swimming_sessions` in a shared project (`chore-tracker-a461b`), with **no
  authentication**. Client Firebase configs are public by design, so if the
  Firestore security rules are in default/test/permissive mode, anyone can read,
  overwrite, or delete a child's health-adjacent data. This must be verified
  server-side; if open, lock rules behind auth or drop the cloud mirror. Also
  the collection name hardcodes the child's identity.
- 🟠 **Timer drift when backgrounded / desync between clocks.** `countdown()` and
  the separate `startElapsed()` both use `setInterval(…,1000)` and decrement by
  one per tick (`engine.js:134`, `engine.js:281`). Background-tab throttling makes
  both under-count, and because they are independent intervals the displayed
  countdown and elapsed clock drift apart. A timestamp-based countdown
  (`Date.now()` deltas) would be accurate and self-correcting.
- 🟠 **`speakAndWait` can stall the session up to ~15 s.** If `speechSynthesis`
  never fires `onstart` (common on mobile Safari), the start-failsafe waits
  `max(len*100+10000, 15000)` ms before the block begins (`audio.js:103`). Real
  risk of long silent gaps at the start of exercises on some devices.
- 🟠 **`advance()` force-done race.** `advance()` sets `sess.forceDone=true` and
  clears it 1200 ms later (`engine.js:693`). A double-tap, or a tap landing just
  as a countdown resolves, can let the lingering flag be consumed by the *next*
  phase, skipping an extra countdown.
- 🟠 **No automated tests, no `package.json`.** For an app with intricate
  async/timing/state logic (and an audio layer explicitly written to make
  "headless test runs fast"), there is zero test coverage. High regression risk
  for any future change to the engine.
- 🟠 **Full-DOM re-render on every interaction.** `render()` rebuilds
  `root.innerHTML` on each action (`main.js:85`). Session ticks are optimized
  (targeted writes), but everything else destroys/rebuilds the tree — jank on
  low-end tablets, lost scroll/focus (already worked around for the name input
  by *not* re-rendering on input, `main.js:323`).
- 🟠 **No keyboard / screen-reader access.** UI is `innerHTML` strings with inline
  styles and `data-action` delegation; no ARIA roles, no real focus management or
  focus-trapping in overlays, no `:focus-visible` styling (inline styles can't
  express it). Keyboard and AT users are effectively locked out.
- 🟡 **`sleep()` skips its remainder after a pause.** It early-returns while
  paused but compares raw `Date.now()-start` (`engine.js:161`), which already
  exceeds the target after resume, so the rest of the sleep is skipped. Affects
  greeting/getready/breath pauses only. (The tempo loop handles paused time
  correctly — `engine.js:207` — so the fix pattern already exists in-repo.)
- 🟡 **Inconsistent "done" semantics.** `weekStatuses()` marks a past day "done"
  on *any* attempt including aborted (`attemptKeys`, `today.js:57`), while
  streaks/adherence use `completedFully`. The week strip and the stats can
  disagree.
- 🟡 **`refTime` duplicated** verbatim in `engine.js:116` and `vm/today.js:12` →
  drift risk. Single source it.
- 🟡 **Stale `HARD_EXERCISES` set.** Most names in `engine.js:17` (Squat Jump,
  Lateral Bound, Jump Rope Simulation…) don't exist in the current 2026.2
  content, so the "longer lead-time before hard moves" branch rarely fires. Dead
  weight to prune or re-map to real move names.
- 🟡 **Repetitive completion quiz keying.** `sessionQuizFor` keys on
  `dayKey.length % 3` (`vm/session.js:36`); Mon/Wed/Fri/Sun all map to the same
  question and there are only 3 total — the same 2–3 questions recur weekly, and
  the +XP becomes rote.
- 🟡 **Cloud mirror misses late edits & XP.** `sess.fsId` is set async
  (`engine.js:665`); a fast mood/reflection tap patches localStorage but not
  Firestore (id still null). Separately, journey/XP/prizes are never mirrored, so
  the cloud copy can't restore them.

**Improvement list — Engineer**
1. 🔴 Verify & lock Firestore security rules (or remove cloud mirror); stop
   hardcoding the child's name in the collection id.
2. 🟠 Convert countdown/elapsed to timestamp-based timing; unify into one clock.
3. 🟠 Harden `speakAndWait` (shorter no-`onstart` fallback; start the timer and
   let voice catch up) and fix the `advance()` force-done race with an explicit
   token/guard.
4. 🟠 Introduce a test harness (the code is already structured for it) covering
   the engine state machine, streak/XP math, and readiness scoring.
5. 🟠 Move to incremental DOM updates (or a tiny diff layer) instead of
   whole-page `innerHTML`; add ARIA roles, focus traps, and `:focus-visible`.
6. 🟡 Fix `sleep()` paused-time accounting; single-source `refTime`; prune/repair
   `HARD_EXERCISES`; expand + robustly key the quiz bank; mirror `fsId`/journey.

---

## Role 2 — Senior Developer / Designer (color combos & components)

**Findings — color**

- 🟠 **White/ink text on saturated mid-tone fills likely fails WCAG AA for normal
  text.** `--text-on-mint:#FFFFFF` on `--mint #2FC78C`, `--text-on-aqua:#FFFFFF`
  on `--aqua #06B6D4`, `--go-text:#FFFFFF` on `--coral #FF7A59`, and
  `--text-on-grape:#FFFFFF` on `--grape #8B7CE8` are all light-on-light-mid
  pairings that pass only at large/bold sizes. Any small label using them fails.
  For an app potentially used on a bright pool deck (glare), this matters more,
  not less. Fix by using the `*-deep` tokens as fills with white text, or ink
  text on the `*-wash` tints. (Verify each pair in a contrast checker.)
- 🟠 **Semantic color overload / collisions.**
  - **Coral** = GO/action *and* form watch-out (`--quality-watch`) *and* "missed"
    day *and* the over-pace nudge. It simultaneously means go, caution, and
    negative.
  - **Sun/yellow** = rewards/stars *and* yellow traffic light (go easy) *and*
    "today" highlight *and* partial/early-end flags. A kid can't learn one
    meaning.
- 🟠 **The traffic-light metaphor is dropped on the action buttons.** In
  `LIGHT_META`/`BODY_RESULTS` the "Start Training" CTA for green, yellow, **and
  red** is all sun-colored — the red-light day's button doesn't look red or
  cautionary, undercutting the whole safety signal at the exact moment it should
  reinforce it.
- 🟡 **Traffic-light icon set is inconsistent:** 💚 💛 🔴 🧊 — two hearts, a red
  circle, an ice cube. Different metaphors for one 4-state control.
- 🟡 **Off-token one-off colors:** habitat hexes in `LADDER` (`#FF9B7A`…) and raw
  `rgba()` literals in the journey map bypass the token system.

**Findings — components / system**

- 🟠 **No component layer — styling lives in long inline-style strings inside JS
  VMs.** Tokens are used, but a restyle means editing many duplicated string
  literals across `vm/*` and `screens/*`. Hard to keep the "design system"
  consistent; this is where drift will happen.
- 🟠 **No dark / low-light theme.** Light-only, tuned for "bright pool water."
  There are "evening session" (grape) affordances and a `calmMode` for *audio*,
  but no visual calm/dark mode for evening or bedtime-adjacent use.
- 🟡 **No visible keyboard focus styling** anywhere (see Engineer a11y).
- 🟡 **Emoji used as the icon system** (🔥✅🏊💪 and the traffic lights). Renders
  inconsistently across OS/older Android and carries no accessible label. A small
  SVG set would be crisper and labelable.
- 🟡 **Touch targets mostly good** (many `min-height:44px`) but a few are under —
  e.g. the 36×36 ladder rung buttons (parent-facing).
- 🟡 **Portrait tablets always get the narrow layout** (`computeIsWide` needs
  ≥900px *and* landscape, `main.js:47`); a large portrait tablet never uses the
  rail. Confirm that's intended.
- ✅ **Good:** cohesive candy-3D buttons with `box-shadow` bottom edges; a
  genuine token file split into base "crayon box" + semantic aliases;
  `prefers-reduced-motion: reduce` **is** handled (`app.css:56`,
  `spacing.css:76`); playful-but-legible display/UI/handwriting font trio.

**Improvement list — Designer**
1. 🟠 Re-audit every text-on-fill pair for WCAG AA; shift to `*-deep` fills or
   ink-on-`*-wash` where they fail.
2. 🟠 Give each color one job: reserve coral for GO, pick a distinct caution hue,
   and stop reusing sun for reward + traffic-light + today + flags.
3. 🟠 Carry the traffic-light color onto the readiness CTA (red day = red-toned
   button) so the safety signal survives to the action.
4. 🟠 Extract a real component layer (CSS classes / a small style map) so buttons,
   chips, cards, and bars are defined once.
5. 🟡 Add a dark/low-light theme; unify the traffic-light icon set; move one-off
   hexes/rgba into tokens; add `:focus-visible`; consider an SVG icon set.

---

## Role 3 — Kid (logic & flow) + Parent (performance review)

### 3a. Kid's-eye view (a 10-year-old before/around training)

**What works for a kid:** warm, low-anxiety CTA copy ("Let's go!", "that's the
whole thing — no surprises"); a real voice coach that counts and cues; self-paced
"tap the ring to finish"; skip/pause/stop always there; the ocean-rank Journey
Map with locked mystery ranks and marine facts; prize envelopes; end-screen
cheers and mascot poses. This is a genuinely fun, motivating loop.

**Friction / flow issues (exhaustive):**
1. 🟠 **Text density mid-workout.** Cues, watch-fors, and subtitles are
   paragraph-length; a kid working out won't read them. Surface exactly **one**
   big cue; let voice carry the rest.
2. 🟠 **Empty exercise photos.** Slots fall back to a placeholder until real
   photos are added (by design). Right now a kid has no picture of the move —
   the single most useful thing for a 10-yo learning form.
3. 🟠 **Everything hinges on sound.** All coach voice/cues are gated by the 🎧
   toggle and the device volume. A muted kid (library, sleeping sibling, phone on
   silent) loses counts and rep cadence and gets a much weaker experience with no
   visual substitute for the spoken cadence.
4. 🟠 **Reflection prompts repeat and can feel like a test.** The micro-loop is
   *always* "Where did the power start? → the hips," and the completion quiz
   recycles 2–3 questions. Rote answers, and the timeout-then-"It's the hips"
   can read as "you got it wrong."
5. 🟡 **Inverted-feeling readiness answers.** "Any aches today?" → "😊 All good"
   is the *Yes* button. A fast-tapping kid can pick the wrong one; the emoji
   rescue it, but the semantics are tricky.
6. 🟡 **"Changed" severity label is vague** to a child (Tired / Changed / Pain).
7. 🟡 **Abstract intent-word step** ("pick one word to fix what you felt") is
   metacognitively advanced; the chips help but the concept may puzzle a young
   kid.
8. 🟡 **Progress-left isn't loud.** A kid wants a big "3 moves to go!"; the
   current label + dots are subtle.
9. 🟡 **Grown-up Zone is wide open.** A kid can wander into analytics/settings,
   change their own rest lengths or prize pool, edit their name, or flip the
   valgus safety gate — confusing for the kid and a control problem for the
   parent (see 3b).
10. 🟡 **"Try-it mode" is parent-language** ("doesn't change progress"); a kid
    won't know when/why to use it.

### 3b. Parent's-eye view (reviewing the kid's performance — Grown-up Zone)

**What works for a parent:** this is the strongest part of the app. Safety
alerts (pain stops, early ends, yellow/red days) surface immediately; readiness→
completion correlation; consistency heatmap; load trend; **ACWR with a sensible
thin-history guard** and a 0.8–1.3 safe band; planned-vs-actual pace; pause and
skipped-move tracking; CSV export; the valgus gate and Independence Ladder as
injury-prevention/scaffolding tools. Genuinely coach-grade monitoring.

**Gaps (exhaustive):**
1. 🔴 **No parental lock on the Grown-up Zone or Settings.** The child can alter
   difficulty (rest lengths), the prize pool, or unlock the valgus safety gate
   themselves. A PIN/hold-to-open gate is needed for the oversight to mean
   anything.
2. 🟠 **No body-zone soreness *trend*.** Only the latest readiness is stored
   (`LS_READINESS`), and pain is surfaced only as discrete "stopped for pain"
   events. For a growing swimmer, a *recurring* sore knee/shoulder is the single
   most valuable early-warning signal — and the per-zone history to show it isn't
   captured or charted.
3. 🟠 **Fragile backup / no XP recovery.** "Nothing earned vanishes on reload" is
   true, but a cache clear or new device wipes XP/streak/prizes — and the cloud
   mirror stores *sessions only*, not journey/XP/prizes. A parent would want a
   real export/restore of the full state.
4. 🟡 **Effort metrics, not swim outcomes.** The PR board is manual and
   disconnected; a parent "reviewing performance" can't see land-work → pool-time
   trends tied together.
5. 🟡 **Single athlete.** Name is a single "Jess"; a two-swimmer family can't
   share the app.
6. 🟡 **Prizes are self-claimed** with no parent-approve step.

**Improvement list — Kid & Parent**
1. 🔴 Add a parental PIN/lock to Grown-up Zone + Settings (and the valgus gate).
2. 🟠 Capture and chart per-body-zone soreness over time for the parent; give the
   kid one big cue + a real move photo; add a visual (non-audio) rep cadence for
   muted use.
3. 🟠 Add full-state export/restore (or mirror journey/XP to the cloud).
4. 🟡 Expand/rotate the reflection + quiz banks; clarify "Changed" and the
   inverted readiness labels; make "moves to go" prominent; connect the PR board
   to a trend; kid-friendly "Try-it" label.

---

## Role 4 — Psychologist (child-sport motivation & logic)

**What's already psychologically sound (worth preserving):** strong
Self-Determination-Theory alignment — **autonomy** (skip/pause/stop, no-stakes
Try-it mode, voice-style choice, self-paced reps), **competence** (XP/levels/
ranks, clear progress), and process-over-outcome framing ("slow and clean beats
fast and sloppy," clean/wobbly self-check, "what went well / next time"
reflection). Recovery is framed *as* training ("Rest is training — no XP today").
The interoceptive readiness check + pain "tell a grown-up" rule teach genuine
self-advocacy. The echo-back of the child's own last words is a lovely
self-efficacy touch. The "encouraging" voice uses effort/character praise
("You showed up. That matters."). This is above-average child-sport design.

**Concerns / risks (exhaustive):**
1. 🟠 **Extrinsic-reward dominance (overjustification).** The spine of the loop is
   XP→level→**tangible prize**. Heavy material rewards for exercise can erode the
   *intrinsic* motivation to move over time. The identity journey (becoming a
   Marlin) is a far healthier driver — lean on that; make material prizes
   occasional/surprise rather than the guaranteed per-level engine.
2. 🟠 **Food (and screen time) as exercise rewards.** The prize pool includes
   "Dessert of choice" and "Pick tonight's dinner," plus iPad/screen time. Child
   & sport psychologists broadly caution against exercise↔food contingencies
   (disordered-eating risk) and exercise↔screen bargaining. Prefer
   experiences/privileges/autonomy rewards.
3. 🟠 **Streak mechanic conflicts with the readiness system.** A 🔥 day-streak
   that zeroes on one miss pressures an eager/anxious kid toward all-or-nothing
   thinking and toward training while sore *just to keep the streak* — which
   directly defeats the recovery/readiness safety design. Add streak-freeze/grace
   days, and weight "total sessions / consistency" over the fragile streak.
4. 🟠 **Unverified self-clear at pain severity 3.** Level 3 says "Tell your coach
   or parent first. If they say OK…" but nothing confirms a grown-up actually
   approved — the child can self-approve and continue ("Start light day — Red
   light"). For a safety-critical pain gate this is the real weak point (level 4
   correctly force-stops). Add a parent-confirm step at level 3.
5. 🟠 **"MISSED" shown as red ✕ (coral).** A wall of red X's on past days reads as
   guilt/shame to a child; shame suppresses future engagement while
   self-compassion sustains it. Keep the "Catch up" CTA but neutralize the
   red-X framing.
6. 🟡 **Default voice is "fun" / trait-hype** ("You're a beast," "You're crushing
   it"). Trait/ability praise can backfire on off days; default to the
   process/effort voice and keep hype as an opt-in.
7. 🟡 **Daily whole-body problem-scan** can, for an anxious child, heighten
   symptom focus / health anxiety. Balance "where is something wrong?" with "what
   feels strong today?"
8. 🟡 **Collected mood gets no response.** An end-screen "😴 tired" is recorded
   but not acknowledged to the kid or flagged to the parent — a missed chance to
   model emotional regulation and to notice a low-mood pattern.
9. 🟡 **"Wobbly" self-labels** are honest and mastery-oriented but, repeated, can
   feel like failure; frame them explicitly as "learning edge," not deficiency.
10. 🟡 **Peer Challenge / Role Flip engagement systems** introduce social
    comparison; for a young athlete keep these cooperative / self-referenced
    rather than ranked-against-others.
11. 🟡 **Guaranteed per-level prize schedule** is predictable; intermittent/
    surprise reinforcement sustains behavior better and reduces the
    overjustification risk in #1.

**Improvement list — Psychologist**
1. 🟠 Rebalance rewards toward intrinsic/identity (rank journey, mastery badges,
   autonomy privileges); make tangible prizes occasional/surprise.
2. 🟠 Remove or replace food/screen-time prizes with experiences/privileges.
3. 🟠 Resolve the streak-vs-recovery conflict (grace/freeze days; emphasize
   consistency), and neutralize "MISSED" red-X shame framing.
4. 🟠 Add a genuine parent-confirm at pain severity 3.
5. 🟡 Default to process/effort praise; acknowledge low mood (kid + parent);
   reframe "wobbly" as a learning edge; add a "what feels strong?" positive
   body-scan; keep peer systems cooperative.

---

## Cross-role themes (where fixing one helps several)

- **Parental lock** serves the Parent role (oversight) *and* the Psychologist
  role (the severity-3 pain confirm) *and* the Kid role (fewer confusing places
  to wander).
- **Reward rebalancing** is a Psychologist ask that also simplifies the
  Designer's overloaded "sun = reward" color problem.
- **Contrast + one-job colors** is a Designer ask that also restores the
  Engineer/AT accessibility story and the Kid's ability to read the safety
  traffic light.
- **Reflection/quiz variety** is a Kid engagement ask and an Engineer
  data-quality (keying) fix.

## Verification / how to pressure-test these findings

No code was changed. To check the findings yourself:
- **Contrast:** run each `--text-on-*` / fill pair through a WCAG checker
  (WebAIM) at the real font sizes.
- **Privacy:** check the Firestore console rules for `chore-tracker-a461b`;
  confirm whether `jess_swimming_sessions` is world-readable/writable.
- **Timer drift:** run a session, background the tab for 60 s mid-countdown, and
  compare the timer to a stopwatch.
- **Muted experience:** run a session with the 🎧 toggle off (or device muted)
  and judge whether a kid could follow the reps.
- **Kid/parent flow:** walk the full path Today → Body Check → Session → Complete
  → Progress → Grown-up Zone, watching for the friction points above.
