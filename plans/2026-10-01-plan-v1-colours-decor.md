# Plan v2 — Kids' colours, one button style, ripples and snow (both apps) — Approved 2026-10-01 (v1 not approved; v2 approved)

Written by Opus 5.5 (the session's own model; no switch to Fable applied).

## Summary

🟦 **Rev 1** · Changed in this version, after your note "only one PR, not 4": the whole change is built in one go and lands as exactly one pull request in each app — one in swim, one in skate, nothing more. GitHub cannot put two separate apps in a single pull request, so two (one per app) is the minimum. No step-by-step or follow-up pull requests. The two build stages are merged into one. Nothing else changed.

Changes in this version:
```diff
- Stage 2 build swim + shared screens; Stage 3 build skate (two build stages)
+ Stage 2 one build of both apps in a single pass
+ Exactly one pull request per app (swim 1, skate 1); no extra or follow-up pull requests
```

**What this plan does.** It gives both apps the colours the girls chose. It also gives them one button look, one corner rule and one shadow rule, plus water ripples (swim) and snowflakes (skate) on the big coloured cards. A grown-up can switch the ripples or snow off. 🟦 **Rev 1** · Everything lands in one pull request per app (one swim, one skate), opened together. The two apps keep sharing exactly the same screen code.

**What I checked.** I compared your request with the picture page, both apps' colour files, every shared screen and every test.
- Every colour you named is already in each app's colour file. The one exception is the sky blue for skate rest, which you already approved. So nothing new has to be invented.

**What I found, with the fixes you chose:**
- **Skate small words.** Small white words on skate's rose card become hard to read where the rose fades light. They now sit on a deep-rose chip, as you chose.
- **Picked ring.** The ring that marks a picked answer or a selected tab uses the main button's darker edge colour, as you chose. That is mid blue in swim and deep rose in skate.
- **Red buttons.** Red stays bright as in the picture. STOP keeps 20px words. The two small grown-up red buttons get bigger words, so all of them stay readable.
- **Last-3-seconds pulse.** It never actually showed. It will now show, in each app's own colour.

**Other gaps I found:**
- **Things that don't exist.** Some items in your request don't exist in the apps: a Quiz Deck "Start" screen, a grown-up "Back" button and a "timed-hold card". I apply the rule to the closest real thing in each case: the Quiz Deck "Next", "Play again" and "Done" buttons, the grown-up "Unlock" button, and the aqua quick-question card on the timer screen.
- **Hidden layer.** As written, the ripples/snow layer would cover the words on the card. I add one setting that keeps it behind them, the same as the picture page does.
- **More purple.** Purple also shows on a few more kid spots: the ring during rests between rounds, the "prep" block label, and a Quiz Deck note. They switch to the work colours like the rest. Purple stays wherever it means recovery.
- **Tests your list missed.** Your list of tests to change is missing a few that the new rules necessarily break. They are named below, and none is weakened.

**Earlier choices this replaces, on purpose:**
- the dark teal Go button;
- the white outlined Pause and Skip buttons;
- the yellow "Let's go" and "Back to Today";
- the darker red STOP.

**What I need from you.** Approve this plan. I then build both apps and stop with the one pull request per app and the screenshots for your review. Nothing is merged until you merge it.

## Stages to finish

1. **Claude** — record this round in both working records and save the approved plan (main session).
2. 🟦 **Rev 1** · **Claude** — one build of both apps in a single pass: failing test first for the missing timer pulse, then the shared screens, swim's colours and ripples, skate's colours and snow, shadows in each app's own colour, the setting and the tests; all tests green in both apps (opus-worker, Complex).
3. **Claude** — screenshots of both apps at both iPad sizes, with ripples/snow on and off. A readability measurement on every screen, including white words over the snow. Compare with the picture page (sonnet-worker, Routine).
4. 🟦 **Rev 1** · **Claude** — review pass, feature lists and records, then open the one pull request in each app, ready for review (main session).
5. 🟦 **Rev 1** · **You** — look at the screenshots and the two pull requests (one per app), then merge both.
6. **Claude** — confirm the live sites serve the new version.
7. **You** — try it on the iPad.

## Whole-request check

Whole request: 12 of 16 requirements will be Guaranteed by an automatic test. The other 4 rely on screenshots and a measurement each round (Checked). None is Broken after the fixes above.

| Requirement | How it is held after this plan | Grade |
|---|---|---|
| Shared screens identical in both apps | compared file by file in each PR | Checked |
| Every colour comes from the colour slots, fallback = today's look | new test: kid buttons on slots | Guaranteed |
| One main-button colour, one button style, two text sizes (+ STOP 20) | new test: every filled kid button's colour slot, corner, edge, font, size | Guaranteed |
| Red only on STOP, destructive grown-up actions, ring warning | new test: kid screens use the stop slot only on STOP | Guaranteed |
| No purple on kid screens (recovery excepted) | new test | Guaranteed |
| Ring zone colours, Done never changes with the zone | updated ring test | Guaranteed |
| Last-3-seconds pulse | new test (fails before the fix) | Guaranteed |
| No navy or cyan hard-coded shadow/backdrop in shared code | new test | Guaranteed |
| Ripples/snow: on by default, off removes it, hidden from screen readers, not tappable | new test | Guaranteed |
| Old backups restore with ripples/snow on | new test | Guaranteed |
| Switch sits behind the grown-up gate | existing gate test picks it up automatically | Guaranteed |
| Corners on cards and rows | new test on the shared card/row helpers | Guaranteed |
| Shadows tinted per app (skate no longer teal) | token files reviewed; scrollbar and pulse colours | Checked |
| Every text readable (4.5:1, 3:1 large), incl. over snow | colour-pair test for solid fills (Guaranteed); over pictures and gradients only the screenshot measurement can tell | Checked |
| Looks like the picture page | screenshots side by side | Checked |
| Tap targets never smaller | existing size-floor test | Guaranteed |

- Hand-off: the edit itself follows the regression-guard method: feature list first, regression table at the end.
- hz-outcome-audit does not fit: there is no repeated failure to audit; earlier colour changes were your choices, not repairs.
- hz-web-app-audit does not fit: these are multi-file apps, not a single-file app.

## What changes, screen by screen

**Both apps, everywhere**
- **Main buttons.** One main-button colour: swim sky blue with dark words, skate deep rose with white words. It is used for "Let's go", "Start training", "Done — next", "Keep going", "Back to Today", "Open a prize", "Claim", "Redo", the Quiz Deck buttons, "Watch the move", the pop-up "Resume" buttons, and the grown-up filled buttons (Add athlete, Save week, Unlock, Restore prize, Add prize item).
- **Calm buttons.** Pause/Resume, Skip, "Skip it", Cancel, Explore, the secondary Today button, "See every move", and answer choices are pale filled buttons with dark words.
- **Red.** Red appears only on STOP, the grown-up "merge anyway" and storage-warning buttons, the pain stop, and the last-3-seconds ring.
- **One button look.** Filled, no border, a 4px darker bottom edge and 16px corners. Words are always bold Nunito (skate's own font in skate): 22px on each screen's main button, 18px on the rest. STOP keeps 20px. Small chips, tags and switches stay round pills. No button gets smaller.
- **Picked state.** A picked answer, mood or quiz choice and a selected tab or chip get a 3px ring in the main button's edge colour. A selected tab is filled with the main colour.
- **Corners.** Big screen card 30px (phone 24px). Cards inside 22px. Rows 16px. Pills and round icons as now.
- **Borders and shadows.** Card borders are 2px (3px only for the picked ring). Shadows and pop-up backdrops use each app's own ink. Skate loses swim's teal shadows, teal scrollbar and cyan pulse.
- **The big coloured cards.** Today day card, journey card, Body Check side panel, timer left panel (iPad only) and the Progress level card use the new hero colours, with ripples/snow behind the content when switched on. Small words on them sit on a chip (white see-through in swim, deep rose in skate).

**Today**
- **Day card.** New hero colours. The block rows are see-through white. The coach line sits at the bottom of the card.
- **Buttons.** "Let's go" uses the main colour. Explore and the secondary button are calm buttons.
- **Journey.** The journey card uses the journey colours (skate: rose → peach → soft yellow, no blue). Path, pips, ranks and the white "You are here" pill stay. The points bar is pink in swim and gold in skate.
- **Quiz card.** It is in the work colours instead of purple.

**Body Check**
- **Side panel.** Hero colours, with the title and subtitle at the top.
- **Answers.** Answers are calm buttons with the picked ring. Yes and No no longer turn green or yellow when picked, as in the picture.
- **Body view.** The FRONT and BACK VIEW tags use the main colour.
- **Result buttons.** They keep their light colours but take the one button shape and size: 22px words and a 4px edge.

**Timer**
- **Ring.** The ring line, its pale track and its filled centre change with the zone: get ready, work, rest. The rest between rounds uses work instead of purple. The last 3 seconds go red and pulse.
- **Done.** "Done — next" always stays in the one main colour.
- **Rep ring.** The rep ring, the rep-check card, the quick-question card and the Explore banner use the work colours.
- **Left panel (iPad, open and folded).** Hero colours with ripples/snow. The time card stays white. The move list loses its white box. Each row is see-through white; the current move is solid white with the picked ring. The block label and list title sit on white pills, and the tips box stays solid. Session-time bar in the main colour, moves-done bar in the points colour.
- **Right side.** Ring, move name and buttons stay plain white. There are never ripples or snow on that side.

**Finish**
- **Background.** Light pool blue in swim; skate's page colour.
- **Rest of the screen.** Each finish state keeps its note box. Mood uses the picked ring. "Back to Today", "Redo" and "Open a prize" use the main colour.

**Progress**
- **Level card.** Hero colours with the points bar. "Open a prize" and "Redeem" use the main colour.

**Grown-up Zone**
- **Main colour.** Filled buttons and selected tabs, chips and rungs use the main colour.
- **New switch.** "Water ripples" (swim) or "Snowflakes" (skate) appears in Settings next to Timer sounds. It is on by default and sits behind the grown-up gate like the other switches. Older backups restore with it on.

**Left unchanged**
- week-strip status colours;
- Body Check light colours;
- the Wobbly choice;
- the recovery purple;
- all other sizes, layout, words and behaviour.

## Tests that change (you asked for this list)

**From your list:**
1. ✓ Clean button on the Go slots: new fallback and a 4px edge (was 3px).
2. Ring zone label in an "-ink" shade: now the ring slots' "-ink".
3. "finish: the last button is 56px, 18px weight 900, on sun" → 64px, 22px, weight 900, main-colour slots.
4. "finish: 🏠 Back to Today is ink on sun" → on the main-colour slots.
5. "Redo these is on the btn-primary slots": new fallback; 18px (was 17px).
6. Card A day-card pattern, its section marker, and the Body Check panel pattern → the hero-bg slot.
7. "Let's go is ink on sun" → on the main-colour slots, 22px, 64px.
8. "the journey XP bar is sun on a white 55% track" → the points-bar slot.

**Size and edge checks the new rules change (allowed by your list; named here):**

9. "Keep going is on the btn-go slots, 19px+ weight 900" → 18px+.
10. "the clean button is 19px+ weight 900, 56px" → 18px+.
11. "Start is 64px, 24px, weight 900" → 22px (the test finds the button by its size).
12. "green's Start is on the Go slots": 5px edge → 4px.
13. "Explore is a 48px hero-text outline" → a 56px calm filled button.
14. Swim smoke test "with a 48px tap target" (Explore) → 56px (stricter).
15. Quiz Deck note-box check (shared invariants test, "an answered card with nothing to pair draws no line under it"). Its pattern names the old 14px corner; it moves to the new 22px corner. Without this the check would pass without testing anything.

**Not in your list, but forced by the new rules (please confirm with your approval):**

16. Pause/Resume, Skip and "Skip it" "are white, 3px hairline, ink-soft" → the calm (neutral) slots, no border.
17. "the rep ring says BY REPS in grape-ink" → work-ring ink.
18. "the Quiz Deck chevron is grape-ink" → work-ring ink.
19. The journey map checks "painted from the hero → journey slots" and "its words take the hero-text slot" → the journey-bg and journey-text slots.

**Unchanged and still passing:** all other tests, including STOP on the stop slot, the size floors, mood 72px, the green Start data check, the recovery button on its purple slot, and the contrast rules and their self-checks.

**New tests:**
- ripples/snow layer: present when on, absent when off, hidden from screen readers, not tappable;
- old backup without the setting → on;
- the switch is gated;
- no purple on kid buttons, cards or rings, except recovery;
- every filled kid button on Today, timer, finish, Progress and Quiz Deck uses the main, go, stop or calm slots, with the one shape, edge, font and size;
- cards and rows use the corner tokens;
- no hard-coded navy or cyan shadow or backdrop in shared code;
- the last-3-seconds pulse (fails before the fix).

## Done when

- **Tests.** All tests pass in both apps. The shared code is identical in both. The service-worker version goes up in both.
- **Screenshots.** At 1194×834 and 834×1194, in both apps, with ripples/snow on and off (timer left panel open and folded). Screens: Today, Body Check (answered), timer (get ready, work, rest, by reps, skip confirm, Stop pop-up), Finish (complete and partial), Progress, Quiz Deck, Grown-up Settings. They match the picture page apart from the four fixes above.
- **Readability.** Every text pair measures 4.5:1, or 3:1 for big text, including white over the snow. STOP is allowed 3.4–3.7 only because it is 20px bold, and the same goes for the two grown-up red buttons at 19px bold.
- **Records.** Both feature lists lock the new rules, and both records carry the regression table.

## Checked against

- Request ledger rows 13–15 (skate journey colours, Go button options, "Pool calm") and the R4 PR 4/7 decisions (Let's go on sun, STOP on darker red, white-text rule): superseded on purpose by this request; marked superseded, not deleted.
- Hotspot rows (both repos identical): no area at a threshold.
  - "Screen contrast and tap size" stays a redesign row; the colour-pair and size-floor tests are kept.
  - "Grown-up gate coverage" (1 fix round): the new switch is gated and the existing "every gated action asks" test covers it.
  - New row at approval: "Timer last-3-seconds pulse", 1 fix round (pre-existing bug, failing test first).
- Known traps from earlier rounds:
  - the day-card test pattern must not have properties inserted inside it;
  - the release check only sees committed work;
  - screenshots never touch real Firebase (network blocked, the app's own local unlock).

## Removes/consolidates

- Retires the colour slots that become unused: hero-from, hero-to, journey-via, journey-to (both apps). btn-grape-bg stays (the recovery result button still uses it).
- Removes from shared code every hard-coded navy shadow/backdrop and the cyan scope-tab glow, in favour of the shadow and backdrop tokens. It also drops the journey map's painted sky, its blur ellipses and its dark top overlay, replaced by the journey colour.
- Replaces about eight button sizes, two fonts and three edge depths with one style. A new test holds it, so a future button cannot drift (structural instead of "be careful").

## Technical details

**Branches and PRs.** `claude/splash-colours-decor` in each repo from `origin/main` (swim 90a9fc8, skate cef96b6; both contain fe9a1ca / 857a5c5; the local clones are behind only by record commits). 🟦 **Rev 1** · Exactly one PR per repo (two in total), opened together, ready for review; no further PRs this round; stop before merge. sw.js swim v31 → v32, skate v27 → v28. Plan copied to `plans/2026-10-01-plan-v1-colours-decor.md` (swim). 🟦 **Rev 1** · Ledger rows R5-1 … R5-7 = the stages above, in both WORKING_RECORD.md files.

**Routing.** 🟦 **Rev 1** · Stage 2 to one opus-worker (Level: Complex — settings/backup data and shared screens, both repos in one pass); stage 3 to sonnet-worker (Level: Routine — screenshots/measurement only, no repo edits). Foreground only; worker instructions path from the session-start line passed with each hand-over.

**Slots (css/tokens/colors.css).** Exactly as in the request. Then three changes from your decisions:
- skate `--hero-chip: rgba(142,52,83,.8)` (rose-700 at 80%; white ≥5.0:1 over every point of the skate gradients; swim keeps `rgba(255,255,255,.6)`);
- the selected outline reads `var(--btn-primary-edge)` (swim #2393E0 3.3:1, skate #8E3453 7.6:1 against white);
- `--btn-stop-*` as requested.

Remove `--hero-from/--hero-to/--journey-via/--journey-to`. Every screen reads `var(--slot, today's look)`.

**spacing.css (per app).**
- `--shadow-soft/-lift/-pop/-inset` use the app's ink: swim 20,59,74; skate 74,58,65.
- New `--shadow-frame` (0 18px 44px ink .16) and `--scrim` (ink .55).
- `pulse-ring` uses the app's colour: swim as now, skate #C25671.

**app.css.** The `[data-rail]` scrollbar uses the app colour: swim as now, skate #C25671.

**Core files.**
- **today.js + vm/today.js:** day card, rows, mantra, ctaButtonStyle, practiceBtnStyle, journey, quiz card.
- **readiness.js + vm/readiness.js:** panel, answers, tags, result button shape.
- **session.js + vm/session.js:**
  - `RING_ZONE_*` → ring slots (warmup/getready → ready, work → work, rest → rest, evening → work);
  - SVG linear-gradient arc from -light to the colour, track -light, centre -fill;
  - rep ring, rep-check card, micro-loop card, Explore banner;
  - rail on hero-bg with row/pill styles;
  - finish background and buttons.
- **main.js:** `updateSessionTick` toggles urgent: arc stroke between the gradient and `var(--stop)`, label and time colour, pulse on a round wrapper. Also the gate and scrim, and storage dismiss at 19px.
- **progress.js:** level card.
- **overlays.js:** Quiz Deck and prize buttons.
- **grownup.js + vm/grownup.js:** filled buttons, selected states, the new toggle row; confirmRestore at 19px.
- **store.js:** `heroDecorOn: true` default.
- **gate.js:** `GATE_REASON.toggleHeroDecor`.
- **shell.js:** shadows.
- **sport.js:** re-exports.

**Decor layer.** One div as the first child, marked aria-hidden true, styled position absolute, inset 0, z-index -1, pointer-events none, background url(HERO_DECOR_SRC) center top / cover, border-radius inherit.
- The container gets `position:relative;isolation:isolate`. The `z-index:-1` is the one addition to your markup, matching the picture page.
- Rendered only when `settings.heroDecorOn !== false`.
- Containers:
  - today.js 368/411 (narrow gets position:relative);
  - journey 117/134;
  - readiness 138/149;
  - progress 213;
  - session rail 732/736.
- Phone timer has no rail, so no decor there.

**Skate-only text shadow.** White text on the decorated hero gets `text-shadow:0 1px 3px rgba(142,52,83,.5)`. The value is read from a slot so core stays sport-free; swim's slot is `none`.

**Assets and sport.js.**
- Copy `Downloads/ripples.webp` → swim `assets/hero-ripples.webp` and `snow.webp` → skate `assets/hero-snow.webp`; add both to the sw.js `shell` lists.
- Skate's `FEATURES.webp=false` only concerns photo twins; the decor path is used directly.
- `js/sport.js` exports `HERO_DECOR_SRC` / `HERO_DECOR_LABEL`.

**Test edits.**
- `core/test/design.mjs` lines ≈245–293, 309–316, 374–417, 473–477, 496–548, 590–596, 611.
- `core/test/invariants.mjs:641` (radius in the negative pattern).
- swim `test/smoke.mjs:627`.
- New sections are added to design.mjs (styles) and actions.mjs (toggle, gate, backup).

**Verification.**
- `npm test` in both repos, both time zones.
- `diff -rq core` empty.
- `node core/tools/release-check.mjs origin/main` after commit.
- Mutation check: revert one button to sun or 3px edge, or remove the decor `aria-hidden`; each must fail a suite.
- Screenshots with the Playwright copy already installed outside the repos (previous session scratchpad `shots/`), Chromium touch, fake clock Wed 2026-09-23 12:00 Edmonton, service workers blocked, every non-127.0.0.1 request aborted, Grown-up via `unlockByPasskey` on a fresh local profile.
- Contrast measured on the screenshots at each text's own pixels (the PR 7 scanner, decor on).

**Font note.** Skate's UI font (Quicksand) tops out at 700, so "900" renders as 700 there, as it does today.
