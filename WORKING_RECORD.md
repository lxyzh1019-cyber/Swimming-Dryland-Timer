# WORKING RECORD — Swimming-Dryland-Timer (Splash) — rules v2

Single working record for this repository. Updated by the main session at the end of every implementation turn (the record guard hook checks this). Keep it terse; history lives in git.

`core/` is shared byte-for-byte with Figure-Skate-Dryland-Timer; every core change lands in both repos, and both records carry the same round.

## Approved baseline
- Plan v2 approved 2026-09-24 (branch `claude/fervent-lamport-sstzde`):
  - Coach's Quiz question pinned per session (`sessionQuizOf`), so a correct tap no longer swaps the question.
  - `toggleRail` (hide/show left panel) and `toggleWatch` (👀 What to watch for) added to `UNGATED_ACTIONS`; `askRestart`/`cancelRestart`/`doRestart` stay gated (user choice).
  - ½ / ⏭ moves in the session left panel show a reason line (`moveReviewReason`); Today "Review what you did" gives every short round its own reason line, and the round dot's title carries it. Both apps.
  - `sw.js` version bump v21 → v22.
- Plan v1 approved 2026-09-27 (branch `claude/hopeful-dirac-a3cbqn`): tests start on a pinned weekday — new `core/test/clock.mjs` (clock shifted to Wed 2026-09-23 12:00 Edmonton, still advancing), loaded by `core/test/run.mjs` via `--import` for every suite. Test files only; rides in the rules-stub PR.
- Plan v2 approved 2026-09-27 (branch `claude/exciting-einstein-khyh28`, R3): 5-second "Get on the bar" lead-in before the pull-up moves (skate "Pull-Up (heavy)", swim "Clean Pull-Ups", and in both apps the timed "Scap Pull-Up + Dead Hang"). New optional move field `leadInSeconds`, honoured by the shared `core/` runner between the opening line and rep 1 / the work clock; excluded from work time and the move's own clock; included in session estimates. The existing +5s setup in the rest before these moves is kept. Tests first; `sw.js` bump in both repos.

- Plan v1 approved 2026-09-30 (R4, Splash redesign; plan file `plans/2026-09-30-plan-v1-splash-redesign.md` in the swim repo): six paired PRs (tokens/slots → Session → Body Check → Today → Finish + Quiz Deck → Progress + Grown-up) from the design handoff `splash-redesign-handoff.zip` (DESIGN.md, PROBLEMS.md, tokens-slots.css, mockups). Screens read colour slots with fallbacks equal to today's look; skate fills its own slot values. All 13 non-cosmetic items kept (row-tap move list, auto-scroll on Body Check, phone block fold, portrait/phone day-card-first, finish reorder with "See every move", kid line instead of exact counts, Quiz Deck paired fact, week table in Grown-up Analytics, library grouped by block, ⚡️ selector, prizes stack <900px, light/result colour data). New shared size-floor test. Stops after each PR pair for the user's merge. Screenshots via a one-off Playwright install outside the repos, network blocked.
- Plan v2 approved 2026-09-30 (user instruction after the PR 1 merge): K7 journey map colours move from PR 4 into PR 2; no other change.
- Plan v3 approved 2026-09-30 (user choice): Go/Done, Keep going and the green-light Start button use Deep green (white on mint-ink, darker edge) via slots `btn-go-bg/edge/text`; applied on the PR 2 branch.
- Plan v4 approved 2026-09-30 (user's pasted decision "Pool calm"): `btn-go` slots = aqua-deep / aqua-ink / white in both apps (Go stays ≥64px, ≥20px weight 900: swim contrast 3.6 passes as large text only); Pause, Resume, Skip, Skip it white with 3px hairline border and ink-soft text. Supersedes v3 Deep green. On the PR 2 branch.

- 2026-10-01: all seven R4 PR pairs merged; live site checked by fetching sw.js (v31) and colors.css from GitHub Pages (merged, live files confirmed; device not yet checked).

- Plan v2 approved 2026-10-01 (R5, kids' colours + one button style + ripples/snow; plan file `plans/2026-10-01-plan-v1-colours-decor.md` in the swim repo; branch `claude/splash-colours-decor` in both repos): colour slots per the user's "Splash-colour-prompt.md" (hero-bg, journey-bg/-text, xp-bar, btn-primary/go/stop/neutral, ring-ready/work/rest -light/-fill/-ink, finish-bg) with fallbacks equal to today's look; one filled-button style (no border, 4px edge, radius-md, font-ui 900, 22px/64 main or 18px/56 rest, STOP 20px); corner, border and shadow tokens tinted per app (--shadow-frame, --scrim); no purple on kid screens (recovery excepted); hero decoration setting `heroDecorOn` (default on, gated toggle, decor layer z-index -1). User decisions 2026-10-01: skate --hero-chip rose-700 at 80%; selected outline = btn-primary-edge; bright red STOP 20px and the two small grown-up red buttons 19px bold; make the last-3-seconds pulse show (pre-existing bug, failing test first). Exactly one PR per repo (user: "only one PR, not 4"). Supersedes Pool calm (plan v4 R4), "Let's go"/"Back to Today" on sun (R4 PR 4/5) and STOP on stop-deep (R4 PR 7).

- Plan v1 approved 2026-10-04 (care/recovery day record; plan file `plans/1-why-the-completion-rippling-valiant.md` in the swim repo; branch `claude/recovery-day-record` in both repos): one care-day verdict `careComplete` (every menu move has a row, none skipped, none under half its dose, not ended early) read by the finish screen, Today card, Progress table and Grown-up by-weekday row; the care day record keeps its rows and move counts against the recovery menu; Sunday and weekday recovery on one path. User choice: the streak freeze uses the same `careComplete` verdict (recommended option). Unchanged: XP (Sunday no-XP), `recovery` / `dayComplete` meanings, adherence, streak gap rules, training-day records, stored record shape.
## Pending
- none

## Request ledger
| # | Round/date | Requirement (user's words, short) | Status | Note |
|---|---|---|---|---|
| 1 | R1 2026-09-24 | Coach quiz at the end jumps to a new question when kids click | done | root cause: question re-picked every render from mastery ledger |
| 2 | R1 2026-09-24 | Left panel hide asks for password on swim, not on skate | done | `toggleRail` missing from `UNGATED_ACTIONS`; same code in skate, skate difference unverified (likely a live 5-min unlock) |
| 3 | R1 2026-09-24 | Remove password from "watch out" by the coach tip | done | `toggleWatch` missing from `UNGATED_ACTIONS` |
| 4 | R1 2026-09-24 | Found in scope sweep: "I need to start over" also gated | done | user chose: keep the PIN (it erases progress) — no change |
| 5 | R1 2026-09-24 | Plan explained in plain text | done | Plan v2 |
| 6 | R1 2026-09-24 | ½ pill shows recorded status (reps short / tapped timer early) — left panel + Today review, both apps | done | reuses `moveReviewReason` wording; "tapped Done early" wording offered, not adopted |
| 7 | R2 2026-09-27 | Install hz-rules stub (central rules v3.1.4) | done | installer output only; INSTALL OK |
| 8 | R2 2026-09-27 | "Fix the confliction" on the stub PR | done | not a merge conflict: `test` check red because suites read the real date and 2026-09-27 is a Sunday (recovery day); fixed structurally by the pinned test clock |
| 9 | R3 2026-09-27 | "Add 5s to the pull up exercise even though it is a rep set" — both repos | done | user chose: lead-in countdown before rep 1 (setup rest already had +5s) |
| 10 | R3 2026-09-27 | "Scap pull up also get the 5 s get ready time" | done | timed move: lead-in before the hang clock; hang length unchanged |
| 11 | R4 2026-09-30 | "Take a look at update plan, validate and prepare a plan for the implementation" (Splash redesign handoff) | done | Plan v1: 11 corrections to the handoff's code references; all 13 non-cosmetic items kept by user choice |
| 12 | R4 2026-09-30 | "Show me all the confliction with current app feature, function besides the style" | done | 13 items listed with user-facing effect; user: "keep all in the plan" |
| 13 | R4 2026-09-30 | "The figure skate level block background colour is wrong, it can not use the same colour from swimming dryland timer" | done (in PR 2) | user 2026-09-30: "move the map color fix forward into pr2" → plan v2. Pre-existing (K7): the journey/level map gradient is literal swim hex in shared core; unchanged by PR 1 (before = after); fixed in PR 4 via the journey slots set in PR 1 (skate rose/sand) |
| 14 | R4 2026-09-30 | "The Go button in the timer is ugly, I need a better option; contrast important, overall colour combo more important" | superseded (R5) | 4 options shown on both palettes; user chose Deep green (white on mint-ink) → plan v3 |
| 15 | R4 2026-09-30 | Pasted decision "Option 1 Pool calm": Go/Done on aqua-deep with white text; Pause/Resume/Skip/Skip it white with hairline border; show screenshots before merge; "anything else we have not done?" | superseded (R5 — Go/Done and Pause/Skip restyled) | plan v4; supersedes Deep green (row 14) |
| 16 | R4 2026-10-01 | Decision offered after PR 5: fix "Every move was done in full." showing after a pain stop | done (PR 6) | recommended fix offered with "say no to leave it"; user replied "merged, continue" → included in PR 6 |
| 18 | R4 2026-10-01 | "I have other changes to implement, I will tag this as completed" | done | R4 redesign round closed by the user; device check not reported |
| 17 | R4 2026-10-01 | PR 7 contrast and grown-up text sweep offered (finishes the plan's "Done when"; "say stop at PR 6" to skip) | done (PR 7) | user replied "merged, continue" |
| 19 | R5 2026-10-01 | "Take a look at the new request, validate, and create the plan" (Splash-colour-prompt.md + Colour-combo-check.html: girls' colours, one button style, ripples/snow) | open | plan v1 → v2; 4 decisions answered (deep-rose chip, edge-colour ring, bright red with bigger words, make pulse show) |
| 20 | R5 2026-10-01 | "only one PR, not 4" | done | plan v2: one build, exactly one PR per repo |
| 21 | 2026-10-04 | Finished Sunday recovery shows as not done on every screen, and the finish screen says she "stopped partway" although she did every move | open — branch pushed, PR not opened | Plan v1; diagnosis: day record dropped care rows (0/0, dayComplete false), Today showed "Start Recovery", finish needed 100% of every clock; user: every screen looked wrong, she did every move; Today card must show a finished recovery day like any finished day |

## Hotspot counter
| Area / feature | Fix rounds | Recurrences | Regressions caused | Workarounds/exceptions | Last symptom | Rewrite-vs-repair reviewed? |
|---|---|---|---|---|---|---|
| Coach's Quiz (finish screen) | 1 | 0 | 0 | 0 | question swaps after a correct tap | no |
| Grown-up gate / UNGATED_ACTIONS coverage | 1 | 0 | 0 | 0 | kid session buttons ask for PIN | no — structural option noted below |
| Move status list (session rail / Today review) | 1 | 0 | 0 | 0 | ½ gave no reason | no |
| Test suite depends on the real date | 2 | 1 | 0 | 0 | Sunday-only failures (earlier: Monday-only assertion) | structural fix applied: pinned test clock |
| Screen contrast and tap size (redesign R4) | 0 | 0 | 0 | 0 | 76 contrast fails, 185 texts <13px, controls 26–44px (handoff screen check) | n/a — redesign round, not a fix |
| Finish kid line | 1 | 0 | 0 | 0 | full-round line after a pain stop | no — one-line condition fix, failing test first (invariants S11) |
| Timer last-3-seconds pulse | 1 | 0 | 0 | 0 | pulse / red label never shown (tick only recolours the arc) | no — failing test first (R5) |
| Kids' colours and button style (R5) | 0 | 0 | 0 | 0 | n/a — redesign round, not a fix | n/a |
| Care/recovery day record | 1 | 0 | 0 | 0 | finished recovery read as not done (Today "Start Recovery", Progress "care / n/a", Grown-up "—"); early tap → "stopped partway" | no — first fix round; failing tests first (dayrecords CARE DAYS) |
Rule: 3 fix rounds, or 2 recurrences, or a fix causing a nearby regression → no further patch until the comparison is presented.

Structural option (not approved, not done): a test that renders every screen, collects every `data-action` a kid can reach during a session, and fails if any is gated without being named in an explicit "adult-only" list — so a new kid button cannot silently ship behind the PIN.

## Deliverable ledger
| Deliverable | State | Evidence |
|---|---|---|
| Quiz pinned per session | PARTIAL | code + tests done (new tests failed before fix, pass after); awaiting merge + device check |
| Panel + 👀 open without PIN | PARTIAL | code + tests done; awaiting merge + device check |
| ½ reason in left panel | PARTIAL | code + tests done; layout checked as HTML only, not on a screen |
| ½ reason per round on Today | PARTIAL | code + tests done; layout checked as HTML only |
| sw.js version bump | COMPLETE | sw.js diff; release-check logic ok on working tree |
| Commit, push, draft PR | NOT STARTED | |
| Verified on live site | NOT STARTED | no on-page version stamp; user must check on device |
| R3 lead-in: failing tests first | COMPLETE | worker: 22 target checks failed before the change, pass after |
| R3 lead-in: core runner + estimates (both repos, core identical) | COMPLETE | core/engine.js, core/plan.js, core/vm/session.js; `diff -r core` identical; screen text checked in VM output only, not in a browser |
| R3 lead-in: data flags on pull-up moves + sw.js bump | COMPLETE | test/leadin.mjs checks every X() copy; sw.js v22 → v23 |
| R3 records, regression table, commit, push, draft PRs | COMPLETE | pushed; draft PR lxyzh1019-cyber/Swimming-Dryland-Timer#64 (awaiting CI + user merge) |
| R3 checked on a device | NOT STARTED | user, after merge (no on-page stamp) |
| R2 pinned test clock | PARTIAL | done + tests green locally on a real Sunday; awaiting CI on the PR + merge |
| R4-1 PR 1 tokens, slots, stylesheet fix, docs copy (both repos) | COMPLETE | opus-worker 2026-09-30: changes made on `claude/splash-pr1-tokens-slots`; `npm test` exit 0; `diff -rq core` empty; release-check ok; Today screenshots 0 px diff at 3 sizes; commit/push/PR not run by the worker (executor rule) — COMPLETE once the PR is open; PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#67 |
| R4-2 Merge PR pair 1 | COMPLETE | merged by user 2026-09-30: swim #67 → main 42f2fbd, skate #41 → main 58de412 |
| R4-3 PR 2 Session screen + size-floor test + journey map colours (K7 moved from PR 4, plan v2) | COMPLETE | opus-worker 2026-09-30 on `claude/splash-pr2-session`: session controls/list/ring/rail/estimate, journey map slots, new `core/test/design.mjs`, sw.js v24 → v25; `npm test` exit 0 both TZs; `diff -rq core` empty; release-check ok on working tree; screenshots 26 per app + contact sheet; DOM heights at 1194×834 Done 64, STOP/Pause/Skip 56, row 56, Back 48, rail toggle 48. Not committed (executor rule) — main session completes it after the PR opens; PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#68; plan v3 Deep green applied (tests, screenshots); plan v4 Pool calm applied |
| R4-4 Merge PR pair 2 | COMPLETE | merged by user 2026-09-30 (swim #68 → 32e7f83, skate #42 → 681756d) with the v3 Deep green look |
| R4-3b PR 2b Pool calm session buttons (plan v4) | COMPLETE | code, tests (design 288), screenshots done on `claude/splash-pr2b-pool-calm`;  PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#69 |
| R4-4b Merge PR pair 2b | COMPLETE | merged by user 2026-09-30 |
| R4-5 PR 3 Body Check (+ pop-up card sizes and rail-hidden label ink, leftovers from PR 2) | COMPLETE | opus-worker 2026-10-01 on `claude/splash-pr3-body-check`, uncommitted: code, data, tests (design 288 → 572, readiness allowance removed), sw.js v26 → v27, FEATURES.md; `npm test` exit 0 both TZs; `diff -rq core` empty; screenshots C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr3/pr3-swim.png. Remaining: commit, push, PR (main session); PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#70 |
| R4-6 Merge PR pair 3 | COMPLETE | merged by user 2026-10-01 (swim #70, skate #44) |
| R4-7 PR 4 Today (+ journey XP bar, green-result scroll, Body Check leftover colours) | COMPLETE | opus-worker 2026-10-01 on `claude/splash-pr4-today`, uncommitted: code (core today screen/vm, main, gate, readiness, session clean button), `js/data.js` ⚡️, tests (design 572 → 682, Today allowance removed; actions 302 → 312), sw.js v27 → v28, FEATURES.md; `npm test` exit 0 both TZs; `diff -rq core` empty; screenshots C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr4/pr4-swim.png. Remaining: commit, push, PR (main session); PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#71 |
| R4-8 Merge PR pair 4 | COMPLETE | merged by user 2026-10-01 (swim #71, skate #45) |
| R4-9 PR 5 Finish screen and Quiz Deck | COMPLETE | opus-worker 2026-10-01 on `claude/splash-pr5-finish-quiz`, uncommitted: finish order + "See every move" fold + kid line + Redo/Back styles (core session screen/vm), Quiz Deck paired fact + `transfer` in the quiz pool + sizes (core overlays, store), exact round lines in Grown-up › Analytics (core grownup vm/screen), tests (design 682 → 750, finish allowance removed; invariants 569 → 585; actions 312 → 322); follow-up fixes (a) no kid line on "Nothing logged", (b) fold reset per session (`core/main.js` launchSession), sw.js v28 → v29, FEATURES.md; `npm test` exit 0 both TZs; `diff -rq core` empty; screenshots C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr5/pr5-swim.png. Remaining: commit, push, PR (main session); PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#72 |
| R4-10 Merge PR pair 5 | COMPLETE | merged by user 2026-10-01 (swim #72, skate #46) |
| R4-11 PR 6 Progress and Grown-up (+ leftovers: nav labels, ⏱/▶ selectors, Add-them-back and Quiz Deck ✕ sizes, pain-stop kid line) | COMPLETE | opus-worker 2026-10-01 on `claude/splash-pr6-progress-grownup`, uncommitted: Progress week table (exported `weekTable`, 13px, ink/ink-soft) + prizes stack below 900 + Progress sizes (core progress screen/vm), Analytics week table from `analyticsWeek` + A1 controls 48 + A2 notes 13px ink-soft + A3 library grouped by block + A4 rungs 48 (core grownup screen/vm), nav labels 13 / buttons 56 (core shell), Today ⏱️ + "+ Add them back" 56 (core today), Quiz Deck ✕ 48 (core overlays), pain-stop kid line (`allInFull` in core vm/session.js), tests (design 750 → 865, ALLOW removed; invariants 585 → 593 with S11), sw.js v29 → v30, FEATURES.md; `npm test` exit 0 both TZs; `diff -rq core` empty; screenshots C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr6/pr6-swim.png; final scan C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/final-scan.json. Remaining: commit, push, PR (main session); PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#73 |
| R4-12 Merge PR pair 6 | COMPLETE | merged by user 2026-10-01 (swim #73, skate #47) |
| R4-13 Final size test + screenshots, manifest lists locked items | COMPLETE | final scan after PR 7 (shots/final-scan-pr7.json; 96 screens per app × 3 sizes; adds Quiz Deck results, move card, STOP, the grown-up check, prize draw): swim — text <13px 0 (kid 0 / grown-up 0), kid buttons <56 3 (the approved 48px "🔒 Grown-up only" summary, once per size), grown-up controls <48 0, real contrast fails 0 (gradients measured at each text's position: 1155, 0 fail; skipped 0), justified 15 (12 emoji 🐢, 3 disabled Form check ▶); skate — text <13px 0 (0 / 0), kid buttons <56 3 (same summary), grown-up controls <48 0, real contrast fails 0 (899 measured over gradients, 0 fail; skipped 0), justified 27 (24 emoji ❄️, 3 disabled ▶). Before (shots/final-scan.json, PR 6): swim text <13 183, contrast 1079 (+871 skipped); skate 171, 752 (+673 skipped); FEATURES.md lists every locked "Done when" item plus the contrast rules and the grown-up 13px floor; contact sheets shots/pr7/pr7-swim.png, pr7-skate.png (state left for the main session); final scan on the PR 7 branch (shots/final-scan-pr7.json): text <13px 0, grown-up controls <48px 0, real contrast fails 0 both apps; FEATURES.md lists all Done-when locked items (worker confirmed) |
| R4-13a PR 7 final contrast and grown-up text sweep | COMPLETE | opus-worker 2026-10-01 on `claude/splash-pr7-contrast-sweep`, uncommitted: contrast sweep across core screens/vm (session pills on washes with rings and -ink marks, Today strip/legend/review slots, Body Check chips/badges/title ✓, Quiz Deck, prize draw, Progress rank card, Grown-up tabs 13px and no ink-faint, gate dialog, storage banner), js/data.js pain Stop on btn-stop slots, sw.js v30 → v31, core/test/design.mjs (contrast rules + measured contrast through this app's tokens + grown-up 13px floor + prize draw + rule self-checks; 865 → 882), test/smoke.mjs:2122 regex (see checks), FEATURES.md; `npm test` exit 0 both TZs; `diff -rq core` empty; real contrast fails 0 in both apps. Remaining: commit, push, PR (main session); PR open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#74 |
| R4-13b Merge PR pair 7 | COMPLETE | merged by user 2026-10-01; live GitHub Pages serves sw.js v31 and the btn-go slot (curl 2026-10-01) |
| R4-14 iPad check by user | COMPLETE | closed by the user 2026-10-01 ("I will tag this as completed"); no device result was reported, so the device check itself is unverified |

| R5-1 Records and plan saved | COMPLETE | both WORKING_RECORD.md updated 2026-10-01; plan copied to swim plans/2026-10-01-plan-v1-colours-decor.md |
| R5-2 One build of both apps (pulse failing test first, slots, button style, corners, shadows, decor setting, tests) | COMPLETE | opus-worker (claude-opus-5-5) 2026-10-01, uncommitted on claude/splash-colours-decor; pulse test failed before fix ("pulse roomy: … round wrapper (undefined)"), passes after; design 882 → 2946, actions 322 → 333, shell +1; 4 mutants each fail a suite; rerun by main session: npm test exit 0 both repos, diff -rq core empty, no rgba(20,59,74 / rgba(6,182,212 in core, sw.js swim v32 / skate v28 |
| R5-3 Screenshots + readability measurement (both apps, 2 sizes, decor on/off) | COMPLETE | opus-worker (escalated: sonnet-worker not registered) 2026-10-01: 8 runs × 18 states, all reached, 0 page errors, network blocked; first scan 2 real fails (swim urgent digits var(--stop) on ready-fill 2.95; skate level-card rank name over snow 1.81) → fixed (urgent digits var(--stop-deep) 4.27/4.66; rank name on --hero-chip 5.5) → rescan 0 real fails in all 4 decor-on runs; Let's go inside first viewport (swim 735–799, skate 765–829 of 834); decor layer on every hero host when on, 0 when off, never in the timer's right pane; contact sheets C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/9fa1f983-710d-4d7e-bd00-153161018037/scratchpad/shots-r5/swim-r5.png, C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/9fa1f983-710d-4d7e-bd00-153161018037/scratchpad/shots-r5/skate-r5.png |
| R5-4 Review pass, FEATURES.md, regression table, one PR per repo | COMPLETE | review pass done (colour slots match the request + decisions; core identical; npm test exit 0 both repos after the contrast fixes); FEATURES.md updated by the worker; regression table below; PRs open ready for review: lxyzh1019-cyber/Swimming-Dryland-Timer#76, lxyzh1019-cyber/Figure-Skate-Dryland-Timer#50 |
| R5-5 Merge both PRs | COMPLETE | merged by the user 2026-10-01 (swim #76 → 6d11edf, skate #50 → 9e746a8; gh pr view: MERGED) |
| R5-6 Live site serves new version | COMPLETE | curl 2026-10-01: live GitHub Pages sw.js serves v32 and the decor image answers HTTP 200 |
| R5-7 iPad check | PARTIAL | not run yet — waiting on the user: open the app on the iPad (reload twice so the new version installs) and look at Today, Body Check, a session, the finish screen, Progress and the Grown-up switch |
| RD-1 Failing tests first (both apps) | COMPLETE | `core/test/dayrecords.mjs` CARE DAYS (Sunday + weekday recovery × full / early tap / skip / ended early): before the change 142 failing assertions in each app (swim and skate, counted with a non-throwing copy of the suite run against the old code), 0 after |
| RD-2 Build the change (both apps, core identical) | COMPLETE | opus-worker 2026-10-04: core/outcome.js, core/vm/session.js, core/screens/session.js, core/vm/today.js, core/vm/progress.js, core/vm/grownup.js; sw.js swim v32 → v33, skate v28 → v29; FEATURES.md "Care / recovery days" |
| RD-3 Run every test in both apps | COMPLETE | `npm test` exit 0 both repos, both TZs (dayrecords now 489 with the new CARE DAYS assertions; all other counts unchanged); `diff -rq core` empty |
| RD-4 One draft PR per app | PARTIAL | branch `claude/recovery-day-record` committed and pushed in both repos; PR not opened — `gh pr create --draft` refused by the git-guard hook (PRs open ready for review), and `gh pr create` without --draft denied by the permission system (auto-mode classifier). Open from GitHub, or allow it and re-run |
| RD-5 Merge both PRs | NOT STARTED | the user |
| RD-6 Live site serves the new version | NOT STARTED | after merge: sw.js swim v33 / skate v29 |
| RD-7 Sunday recovery on the device (finish, Today, Progress, Grown-up) | NOT STARTED | the user |

## Checks and evidence
- 2026-09-24 baseline `node core/test/run.mjs` → all suites green (before changes)
- 2026-09-24 after changes, rerun by main session: `node core/test/run.mjs` → all suites green, both TZs (swim invariants 569, session 325, actions 302; skate invariants 572, session 327); `diff -r core` swim vs skate → identical
- 2026-09-24 live site → untested (no on-page stamp)
- 2026-09-27 (Sunday) before fix: `node core/test/run.mjs` → skate 4 failing / swim 6 failing (invariants, session; swim also smoke); same on base `main`; clock shifted to Sat/Mon → all green
- 2026-09-27 after fix, rerun by main session on the real Sunday clock: all suites green in both repos; `release-check origin/main` → ok; `clock.mjs` and `run.mjs` identical across repos; worker also green under outer shifts to other Sundays/Saturday

- 2026-09-27 R3 after changes, rerun by main session: `node core/test/run.mjs` exit 0 in both repos, both TZs (new: core leadin 42 checks; skate leadin-data 11, swim leadin-data 19; skate invariants 572, session 327; swim invariants 569, session 325); `diff -r core` skate vs swim → identical
- 2026-09-27 R3 live site / device → untested
- 2026-09-30 R4 PR 1 (opus-worker): `npm test` exit 0, both TZs, all suites green (swim leadin-data 19, smoke 1401, core actions 302, dayrecords 251, integrity 48, interaction 18, invariants 569, landing 7, core leadin 42, session 325, shell 256); identical counts to the pre-change baseline
- 2026-09-30 R4 PR 1: `diff -rq core` swim vs skate → empty (exit 0)
- 2026-09-30 R4 PR 1: `node core/tools/release-check.mjs origin/main` → ok ("no shell files changed" — it compares base...HEAD, so it cannot see uncommitted work); working-tree equivalent: precached `css/app.css`, `css/tokens/colors.css` changed, sw.js v23 → v24 → bump present. Re-run after commit.
- 2026-09-30 R4 PR 1: screenshots (Playwright Chromium, touch, all non-localhost requests aborted, clock fixed Wed 2026-09-23 12:00 Edmonton), Today full-page at 1194×834, 834×1194, 390×844, origin/main vs branch → 0 differing pixels at all three sizes; computed style confirms the branch served the new tokens
- 2026-09-30 R4 PR 1: grep of `core/` and `js/` for `--text-on-aqua/coral/mint`, `--action-text`, `--go-text`, `--border-card`, `action-deep`, class `candy` → no matches
- 2026-09-30 R4 PR 2 baseline before changes: `npm test` exit 0 in both repos, all suites green (same counts as PR 1)
- 2026-09-30 R4 PR 2 after changes (opus-worker): `npm test` exit 0, both TZs, all suites green (swim leadin-data 19, smoke 1401, core actions 302, dayrecords 251, design 221 (new), integrity 48, interaction 18, invariants 569, landing 7, core leadin 42, session 325, shell 256)
- 2026-09-30 R4 PR 2: `diff -rq core` swim vs skate → empty
- 2026-09-30 R4 PR 2: `node core/tools/release-check.mjs origin/main` → ok ("no shell files changed" — base...HEAD only, uncommitted); working-tree equivalent: precached core/screens/session.js, core/screens/today.js, core/vm/session.js, core/vm/today.js changed, sw.js v24 → v25 → bump present. Re-run after commit.
- 2026-09-30 R4 PR 2: design.mjs mutation check — adding an 11px span to the session screen, or turning the row ⓘ back into a button, makes the suite fail
- 2026-09-30 R4 PR 2: screenshots (Playwright Chromium, touch, fake clock Wed 2026-09-23 12:00 Edmonton, every non-127.0.0.1 request aborted) of Today + get ready, timed, rep ring, rest, paused, skip confirm, STOP, rail hidden (wide) at 1194×834, 834×1194, 390×844, driven through Let's go → Body Check (4 × yes) → Start training; all states reached; `C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr2/swim-pr2-contact-sheet.png`
- 2026-09-30 R4 PR 2: DOM heights at 1194×834: Done 64, STOP 56, Pause 56, Skip 56, move-list row 56, Back a move 48, rail toggle 48
- 2026-09-30 R4 PR 2 live site / device → untested
- 2026-09-30 R4 PR 2 plan v3 Deep green (opus-worker): `npm test` exit 0, both TZs, all suites green (swim leadin-data 19, smoke 1401, core actions 302, dayrecords 251, design 224, integrity 48, interaction 18, invariants 569, landing 7, core leadin 42, session 325, shell 256; design 221 → 224: Keep going on btn-go checked in 3 layouts); `diff -rq core` → empty; sw.js still v25; computed style at 1194×834: Done and Keep going white on mint-ink, edge #04342C, Done 64px/20px, Keep going 56px; contrast white on mint-ink 6.6; screenshots timed, rep ring, skip confirm both apps: `C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr2b/pr2b-go-button.png`
- 2026-09-30 R4 PR 2 plan v4 Pool calm (opus-worker, uncommitted): `npm test` exit 0, both TZs, all suites green (swim leadin-data 19, smoke 1401, core actions 302, dayrecords 251, design 288, integrity 48, interaction 18, invariants 569, landing 7, core leadin 42, session 325, shell 256; design 224 → 288: Done/Keep going size+weight, Pause/Resume, Skip, Skip it calm style); design suite fails on the pre-v4 session.js (Pause check); `diff -rq core` → empty; sw.js v25 → v26 (PR 2 had already merged; changes moved to `claude/splash-pr2b-pool-calm`); computed style at 1194×834: Go 64px, 20px/900, white on rgb(5,147,174) aqua-deep, edge rgb(6,95,115); Keep going 56px, 19px/900; STOP/Pause/Skip 56px; Pause/Resume/Skip/Skip it bg rgb(255,255,255), text rgb(74,107,120), border 3px rgb(210,234,242); screenshots timed, rep ring, skip confirm, paused at 1194×834 and 834×1194: `C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr2c/pr2c-swim.png`
- 2026-10-01 R4 PR 3 baseline before changes (branch from origin/main): `npm test` exit 0 in both repos, all suites green (design 288)
- 2026-10-01 R4 PR 3 after changes (opus-worker): `npm test` exit 0, both TZs, all suites green (swim: leadin-data 19, smoke 1401, core actions 302, dayrecords 251, design 572, integrity 48, interaction 18, invariants 569, landing 7, core leadin 42, session 325, shell 256; skate: leadin-data 11, smoke 317, actions 302, dayrecords 251, design 572, integrity 48, interaction 18, invariants 572, landing 15, core leadin 42, session 327, shell 176); design 288 → 572: Body Check 13 states × 2 layouts + yesterday, pop-up cards and move card in 3 layouts, rail-hidden label ink
- 2026-10-01 R4 PR 3: design.mjs mutation check — rep-check buttons back to 52px, or the light title back to the bright colour, makes the suite fail
- 2026-10-01 R4 PR 3: `diff -rq core` swim vs skate → empty
- 2026-10-01 R4 PR 3: `node core/tools/release-check.mjs origin/main` → ok ("no shell files changed" — base...HEAD only, uncommitted); working-tree equivalent: precached js/data.js and core screens/vm/main changed, sw.js v26 → v27 → bump present. Re-run after commit.
- 2026-10-01 R4 PR 3: screenshots (Playwright Chromium, touch, fake clock Wed 2026-09-23 12:00 Edmonton, every non-127.0.0.1 request aborted) at 1194×834, 834×1194, 390×844: questions, 3 answered, green result, body map, zone popup, sore result after the scroll, recovery (all three "no"); plus rep-check card and move card at 1194×834 (rep count set through the page's engine module: headless Chromium has no voices, so the coach count never moves); all reached; C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr3/pr3-swim.png
- 2026-10-01 R4 PR 3: DOM at all three sizes: yes/no 56px / 17px; Start 64px / 24px / 900; grown-up summary 48px / 13px; light picker option 48px / 15px (chosen: text in mint-ink on white); green title in mint-ink; sore result card on screen after the answer (card top at 1194×834 / 834×1194 / 390×844: swim 350 / 710 / 221 px, skate 352 / 712 / 220 px); rep-check buttons 56 / 56 / 56 (17px); move card ✕ 48×48; Resume 56
- 2026-10-01 R4 PR 3 live site / device → untested
- 2026-10-01 R4 PR 4 baseline before changes (branch from origin/main): `npm test` exit 0 in both repos, all suites green (actions 302, design 572, shell 256)
- 2026-10-01 R4 PR 4 after changes (opus-worker): `npm test` exit 0, both TZs, all suites green (leadin-data 19, smoke 1401, core actions 312, dayrecords 251, design 682, integrity 48, interaction 18, invariants 569, landing 7, core leadin 42, session 325, shell 257); design 572 → 682: Today roomy / tight / phone folded / phone open / block expanded (sizes, Card A slots, order, fold, week cells, chevron, ⚡️, Let's go, Explore, XP bar), Body Check popup words / legend headers / view pills, clean button slots; actions 302 → 312: toggleBlocks ungated and survives a block tap, green-result scroll once and null-safe; shell +1 (sw.js version)
- 2026-10-01 R4 PR 4: mutation check — removing the green-result flag, dropping toggleBlocks from the gate, restoring the old phone gradient, or always-open phone blocks each fails a suite
- 2026-10-01 R4 PR 4: `diff -rq core` swim vs skate → empty
- 2026-10-01 R4 PR 4: screenshots (Playwright Chromium, touch, fake clock Wed 2026-09-23 12:00 Edmonton, every non-127.0.0.1 request aborted) at 1194×834, 834×1194, 390×844: Today first screen + full page, phone blocks open, a block expanded, Body Check green result after the four questions, zone popup; clean-check card at 1194×834 drawn by setting the engine phase through the page's own modules (not reached by stepping the session in 300 steps); C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr4/pr4-swim.png
- 2026-10-01 R4 PR 4: DOM — "Let's go" fully in the first viewport at all three sizes (top–bottom px: 1194×834 719–785, 834×1194 778–844, 390×844 521–587); block row 60 (iPad) / 56 (phone); week cell 100; phone fold 56; Explore 48; green result after the questions: card top 502 / 725 / 475 px, Start 698–762 / 962–1026 / 712–776, Start on screen at all three sizes
- 2026-10-01 R4 PR 4: contrast hero-text on hero-from / hero-to: aqua-light → aqua, ink text (7.97 / 4.93); Let's go ink on sun swim 7.43 / skate 5.95
- 2026-10-01 R4 PR 4 follow-up (coordinator): "✓ Clean" 14 → 19px weight 900 (DOM 56px / 19px in both apps; design.mjs asserts ≥ 19px, 900, 56px); faded day-card text measured in the browser (computed colour × opacity composited over the median background pixel of its box, 1194×834 and 390×844, Wed / Mon / Thu / Sun, blocks open and one expanded): swim before 3.50–4.81 (Explore hint, line under Let's go, cues, Pool lines down to 3.50; recovery note 4.15), after (full strength) 4.93–6.77; opacity removed from every failing site; the only faded text left (block-row count) re-measured ≥ 5.24, all pass; design.mjs asserts no other opacity on the day card (design 673 → 682); `npm test` exit 0 both repos, both TZs; `diff -rq core` empty; screenshots and contact sheets refreshed (Let's go still fully in the first viewport at all three sizes)
- 2026-10-01 R4 PR 4 live site / device → untested
- 2026-10-01 R4 PR 5 baseline before changes (branch from origin/main): `npm test` exit 0 in both repos, all suites green (actions 312, design 682; swim invariants 569 / skate 572)
- 2026-10-01 R4 PR 5 after changes (opus-worker): `npm test` exit 0, both TZs, all suites green (leadin-data 19, smoke 1401, core actions 318, dayrecords 251, design 750, integrity 48, interaction 18, invariants 585, landing 7, core leadin 42, session 325, shell 257); design 682 → 750: finish states part done / review open / full / stopped / nothing logged / save failed / all extras / explore (size floor with no allowance, order summary → mood → quiz → kid line → See every move → Back last, kid line text, list and counts hidden until opened, rows ink-soft ⏭/½ no coral, Redo on btn-primary 56/17, Back ink 18/900/56, mood 72, quiz options 56/17, none keeps title and note, explore words kept), Quiz Deck question / answered / practice / results scanned; invariants +16: G1 (pool carries `transfer`, cue/watch/fix all drawn, no line repeats its answer, each line is its pair, empty line not drawn), Analytics round lines = finish round lines (shared check, and new S10 with a real short round: hidden until opened, shown when opened, same words in Analytics, drawn on the rounds card); actions +6: toggleMoveReview ungated, opens/closes through the click dispatcher, survives another tap's repaint
- 2026-10-01 R4 PR 5 test changes: `test/smoke.mjs:3504` (swim only) now renders the finish screen from a VM built with `moveReviewOpen: true`; assertion and message otherwise kept. No assertion removed or weakened.
- 2026-10-01 R4 PR 5: mutation check — finish review always open fails design.mjs ("hidden until she opens See every move"); restoring the old Quiz Deck `why` fails invariants (117 of 117 cards repeat the answer)
- 2026-10-01 R4 PR 5: Grown-up › Analytics before this PR showed rounds only as totals (done / planned / %); the exact per-round lines were not there (the CSV had reasons without counts). Added: the finish screen's round lines on the Main-set rounds card, newest first, latest 10 + "…and N more earlier"
- 2026-10-01 R4 PR 5: `diff -rq core` swim vs skate → empty
- 2026-10-01 R4 PR 5: `node core/tools/release-check.mjs origin/main` → ok ("no shell files changed" — base...HEAD only, uncommitted); working-tree equivalent: precached core screens/vm/store changed, sw.js v28 → v29 → bump present. Re-run after commit.
- 2026-10-01 R4 PR 5: screenshots (Playwright Chromium, touch, fake clock Wed 2026-09-23 12:00 Edmonton, service workers blocked, every non-127.0.0.1 request aborted) at 1194×834, 834×1194, 390×844, each finish reached by driving a real session (Let's go → 4 × yes → Start; coach speech off; rep counts set through the page's engine after ≥ 6 s of work): part done (first viewport + full page), review open (viewport + full page), full, stopped (pain), nothing logged (every move skipped); Quiz Deck question and answered; 54 shots, all reached, no page errors; C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr5/pr5-swim.png, C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr5/pr5-skate.png
- 2026-10-01 R4 PR 5: DOM at 1194×834 part done: "How did it feel?" inside the first viewport (swim 608–672, skate 608–672); the Coach's Quiz question just below it (swim 855–877, skate 853–897; viewport 834); full / stopped / nothing logged: both inside. 834×1194: both inside in every state. Mood buttons 83 (swim) / 81 (skate) px; Coach's Quiz options 56px / 17px (iPad), 114–122px on phone (wrapped); See every move 56; Redo 56 / 17px (swim ink on aqua, skate white on rose-deep); Back 56 / 18px; no text under 13px; Quiz Deck options 62–94px
- 2026-10-01 R4 PR 5 follow-up (coordinator request): (a) "Nothing logged" no longer draws the kid line — title and note only (design.mjs asserts no kid line there); (b) `state.moveReviewOpen = false` in `launchSession` (every session start, incl. explore and start-over), new actions assertions: opened and left open, the next session starts folded, its finish screen (reached by a real run stopped with "break") has no review section (actions 318 → 322); mutation — removing the reset fails actions. `npm test` exit 0 both repos, both TZs (actions 322, design 750, invariants unchanged); `diff -rq core` empty; nothing-logged screenshots re-shot at 3 sizes × 2 apps (kid line absent, title "Nothing logged this time.", See every move 56, no text < 13px) and contact sheets rebuilt
- 2026-10-01 R4 PR 5 live site / device → untested

- 2026-10-01 R4 PR 6 baseline before changes (branch from origin/main): `npm test` exit 0, all suites green (leadin-data 19, smoke 1401, actions 322, dayrecords 251, design 750, integrity 48, interaction 18, invariants 585, landing 7, core leadin 42, session 325, shell 257)
- 2026-10-01 R4 PR 6 failing test first: new invariants S11 (pain stop, early stop, finished day) failed before the fix — "S11 pain stop: the finish VM does not claim every move was done in full (got true, wanted false)" (both repos) — and passes after (`allInFull` now also needs completion state complete). Browser repro before the fix: pain stop and break stop at warm-up rest, round rest, first work, round 2 work, section rest all showed "Every move was done in full."
- 2026-10-01 R4 PR 6 after changes (opus-worker): `npm test` exit 0, both TZs, all suites green (leadin-data 19, smoke 1401, actions 322, dayrecords 251, design 865, integrity 48, interaction 18, invariants 593, landing 7, core leadin 42, session 325, shell 259); design 750 → 865: ALLOW removed; Progress empty and with data × roomy/tight/narrow (no allowance, table ink/ink-soft, DAY STREAK, prizes stacked/side, scope chips 56/15); six Grown-up tabs with data and empty × wide/narrow (floor 48, tabs and period chips 48/15); Analytics week table = `weekTable(analyticsWeek)` with exact counts, near the top, no text < 13 / no ink-faint; library one fold per block, first open, total = old flat count (55); rungs 48/15; nav shell labels 13 / buttons 56; Quiz Deck ✕ 48; "+ Add them back" 56; ⏱️ chip. shell.mjs +2 = the two new import edges (grownup screen → progress screen, grownup vm → progress vm)
- 2026-10-01 R4 PR 6 test changes: core/test/design.mjs (ALLOW and the `allow` option removed — the last Progress/Grown-up entries; `exitQuizDeck: 48` added to DESIGN_TAP; Progress and Grown-up sections rewritten to scan more states; new sections nav shell, Today Add-them-back), core/test/invariants.mjs (S11 added). No assertion removed or weakened; smoke.mjs:4653 (DAY STREAK) unchanged and green.
- 2026-10-01 R4 PR 6: `diff -rq core` swim vs skate → empty
- 2026-10-01 R4 PR 6: `node core/tools/release-check.mjs origin/main` → ok ("no shell files changed" — base...HEAD only, uncommitted); working-tree equivalent: precached core screens/vm changed, sw.js v29 → v30 → bump present. Re-run after commit.
- 2026-10-01 R4 PR 6: screenshots (Playwright Chromium, touch, fake clock Wed 2026-09-23 12:00 Edmonton, service workers blocked, every non-127.0.0.1 request aborted; Grown-up opened with the app's own `unlockByPasskey` on a fresh local profile, no PIN, no cloud) at 1194×834, 834×1194, 390×844: Today with nav, Progress empty, Progress after a full session (viewport + full page), all six Grown-up tabs (Analytics and Library full page) — C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/pr6/, contact sheet pr6-swim.png; all states reached, no page errors
- 2026-10-01 R4 PR 6 DOM: Progress 1194×834 prizes beside, 834×1194 stacked under the table with SUN visible and no table scroll, 390×844 stacked (table scrolls sideways, min-width 440); week-table min font 13; scope chips 56; nav buttons 86–88 (rail) / 56 (bottom), labels 13px; Quiz Deck ✕ 48×48; Grown-up tabs and period chips 48; Analytics week table present (SUN visible on iPad); library 7 folds, Warm-up open, summaries 48; rungs 48; real full session finish says "Every move was done in full."
- 2026-10-01 R4 PR 6 FINAL whole-app scan (Today, Quiz Deck, Body Check, every session state reached, finish, Progress empty/data, six Grown-up tabs; 26 screens × 3 sizes; exceptions Back a move / rail toggle / Explore / move-card ✕ / Quiz Deck ✕ / light picker 48): kid text under 13px 0; kid buttons under 56 3 (the Body Check "🔒 Grown-up only" summary, 48px, approved in PR 3, once per size); grown-up controls under 48 0; grown-up text under 13px 183 (61 per size: Overview stat labels, Form Check, Coaching, Library photo placeholder, Settings labels — outside A2, Analytics 0); low contrast 1079 (Progress 0, Analytics 0, finish 0; the rest on session list marks/move names, Today week-strip glyphs, Form Check/Coaching/Settings), skipped 871 (gradient/image backgrounds). Raw: C:/Users/HENGZ~1/AppData/Local/Temp/claude/D--User-Heng-Z-Documents-GitHub-Swimming-Dryland-Timer/59e66598-6ee2-474f-b662-9fef28e89c20/scratchpad/shots/final-scan.json
- 2026-10-01 R4 PR 6 live site / device → untested

- 2026-10-01 R4 PR 7 baseline before changes (branch from origin/main): `npm test` exit 0 both TZs, all suites green (design 865, smoke 1401, invariants 593, session 325, shell 259)
- 2026-10-01 R4 PR 7 failing test first: the extended design.mjs listed 95 contrast/size violations on the rendered screens before the fixes (ink-faint text, bright colours as text, white on mint/sun/coral/aqua, grown-up 10–12px), and the measured rule then caught skate's ink on mint (4.37) in the consistency grid; all pass after
- 2026-10-01 R4 PR 7 after changes (opus-worker): `npm test` exit 0 both TZs, all suites green; design 865 → 882 (new: colour rules on every rendered screen, measured contrast against css/tokens/colors.css, grown-up text floor 13px, prize draw envelopes / picked with a 48px ✕, section 8 proving each PR 7 cluster is still caught); other counts unchanged
- 2026-10-01 R4 PR 7 test changes: core/test/design.mjs (rules above; DESIGN_TAP gains closePrizeDraw: 48); test/smoke.mjs:2122 trained-cell regex `/background:var(--mint)|background:var(--sun)/` → `/var(--mint)|var(--sun)/` because a done cell is now mint-wash with a mint ring (it still counts only trained cells: untrained cells use surface-2 / grape-wash / coral mix; the quit-only 0 and trained 1 assertions unchanged and green). No assertion removed or weakened
- 2026-10-01 R4 PR 7: consistency done cell mint-ink on mint-wash with a mint ring — swim 5.9:1, skate 5.5:1 (was ink on solid mint: swim 5.5, skate 4.37)
- 2026-10-01 R4 PR 7: `diff -rq core` swim vs skate → empty; `node core/tools/release-check.mjs origin/main` → ok (base...HEAD only, uncommitted; sw.js v30 → v31 present). Re-run after commit
- 2026-10-01 R4 PR 7 FINAL whole-app scan (R4-13): final scan after PR 7 (shots/final-scan-pr7.json; 96 screens per app × 3 sizes; adds Quiz Deck results, move card, STOP, the grown-up check, prize draw): swim — text <13px 0 (kid 0 / grown-up 0), kid buttons <56 3 (the approved 48px "🔒 Grown-up only" summary, once per size), grown-up controls <48 0, real contrast fails 0 (gradients measured at each text's position: 1155, 0 fail; skipped 0), justified 15 (12 emoji 🐢, 3 disabled Form check ▶); skate — text <13px 0 (0 / 0), kid buttons <56 3 (same summary), grown-up controls <48 0, real contrast fails 0 (899 measured over gradients, 0 fail; skipped 0), justified 27 (24 emoji ❄️, 3 disabled ▶). Before (shots/final-scan.json, PR 6): swim text <13 183, contrast 1079 (+871 skipped); skate 171, 752 (+673 skipped). Scanner shots/shoot-pr7.mjs: same rules as PR 6, plus text over a CSS linear-gradient measured at its own corners and centre, and each fail tagged emoji / disabled / decorative / real
- 2026-10-01 R4 PR 7 looked at (Playwright, 1194×834, shots/pr7/look/): session rail with ✓ done / ½ short / ▶ current pills, rep check (All of them on btn-go, Almost ink on sun), STOP card (keep going on btn-go), grown-up check dialog, Form check verdict pills, Today legend 24px circles and strip glyphs, Analytics consistency — nothing broken. Noted, not changed: the session photo box shows "Form photo coming soon" through transparent parts of the move photo (pre-existing, visible in PR 2 shots; hiding it is a behaviour change); Form check headline reads "She reports null% clean" when she has no self-checks (pre-existing text bug); the consistency legend's Done dot is still solid mint while done cells are mint-wash with a mint ring
- 2026-10-01 R4 PR 7 live site / device → untested

- 2026-10-01 R5 baseline: npm test exit 0 both repos (design 882, actions 322)
- 2026-10-01 R5 failing test first: "pulse roomy: in the last seconds the tick pulses the ring on a round wrapper (undefined)" before the fix; passes after
- 2026-10-01 R5 after changes: npm test exit 0 both repos, both TZs (design 2947, actions 333, shell +1; other suites unchanged); diff -rq core empty; mutants (Back to Today on sun, 3px edge, decor without aria-hidden, tick without pulse) each fail a suite; no rgba(20,59,74 / rgba(6,182,212 in core
- 2026-10-01 R5 test changes: only plan items 1–19 (core/test/design.mjs, core/test/invariants.mjs:641 radius in the negative pattern, swim test/smoke.mjs:627 Explore 48 → 56); no other assertion removed or weakened
- 2026-10-01 R5 not covered: grown-up red buttons (merge anyway, storage warning) at 19px not reached in a run (contrast by token: white on stop 3.45 swim / 3.70 skate, large text); phone size not in scope; live site and iPad untested
- 2026-10-04 care/recovery day record — before: harness Sunday 2026-10-04 full menu → saved session 8/8 done, workRatio 1, but day record rows [], moves 0/0; new CARE DAYS assertions: 142 failing per app (Sunday full 19, early tap 24, skip 16, ended early 14; weekday full 18, early tap 23, skip 15, ended early 13)
- 2026-10-04 after (opus-worker): `npm test` exit 0 in both repos, both TZs — swim: leadin-data 19, smoke 1401, actions 333, dayrecords 489, design 2947, integrity 48, interaction 18, invariants 593, landing 7, core leadin 42, session 325, shell 260; skate: leadin-data 11, smoke 317, actions 333, dayrecords 489, design 2947, integrity 48, interaction 18, invariants 596, landing 15, core leadin 42, session 327, shell 180; `diff -rq core` swim vs skate → empty
- 2026-10-04 strings now shown (swim, VM/HTML output, not a browser): full Sunday — finish "Recovery done. That was care." / "Spa Sunday — Recovery Only · 11 min · 8 of 8 moves"; Today "SUN · COMPLETED ✓ | 8 of 8 moves | 11 of 11 min | Nice reset — recovery complete! | Do it again"; Progress 8/8, 8/8, skipped 0, n/a, early No, Care, ❄️; Grown-up "✓ recovery 11m" (grape). Early tap — identical. Skip — finish "Some care is better than none." + "You did most of the recovery menu, and 1 move got skipped (…)", "7 of 8 moves"; Today "SUN · PARTLY DONE ✓ … Finish recovery"; Grown-up "recovery · part". Weekday recovery — same, plus "+90 XP" show-up (unchanged pricing)
- 2026-10-04 deviation: `careComplete` also requires every row at half its dose or more (ROUND_ROW_FLOOR) — without it the existing smoke check "brushing at every move on the menu freezes nothing" (test/smoke.mjs:1676) would fail; an early tap at ~60% passes the floor
- 2026-10-04 not covered: live site and device untested; screens checked as VM/HTML output only

## Open questions / blockers
- No visible deploy stamp on the page (rules require one) — flagged, out of scope this round.
- R3 note: before a bar move she now gets the rest's +5s setup AND the 5s lead-in (~10s total) — as approved; worth a real try.
- Session hooks did not auto-fire in the R3 session (session started outside the repo); rules loaded by running the loader manually.
- FEATURES.md holds only the features touched this round; the full manifest is still unpopulated.

## Regression table — R4 PR 1 (manifest v1 partial → v1 partial + design tokens)
| Feature | v1 → v1+R4-PR1 | Note |
|---|---|---|
| Coach's Quiz: question pinned until close | kept | no core/js change; tests green |
| Coach's Quiz: first tap locks, second does nothing, options grey | kept | tests green |
| Coach's Quiz: XP by ledger, never twice | kept | tests green |
| Left panel hide/show without PIN | kept | actions suite 302 green |
| 👀 What to watch for without PIN | kept | actions suite green |
| "I need to start over" asks for PIN | kept | actions suite green |
| Left panel ✓ ½ ⏭ ▶ marks | kept | no screen change; screenshots identical |
| Bar-move 5s lead-in | kept | leadin suites green |
| Estimate includes lead-in | kept | leadin suites green |
| ½ / ⏭ reason line in left panel | kept | session suite green |
| Today review round dots + legend | kept | tests green |
| Today review per-round reason lines | kept | tests green |
| Gate deny-by-default | kept | `core/gate.js` untouched |
| `core/` byte-identical with the other repo | kept | `diff -rq core` empty |
| sw.js version bump on shell change | kept | v23 → v24 |
| Design tokens and colour slots (12 slots, text-on tokens, `--border-card-color`) | added | FEATURES.md new section |
| Dead alias `--border-card` (colour) / `--action-deep` reference | intentionally removed | approved plan v1 "Removes/consolidates"; no visible effect |
| Missing | none | |

## Regression table — R4 PR 2 (manifest v1 partial + design tokens → + session sizes, journey map)
| Feature | R4-PR1 → R4-PR2 | Note |
|---|---|---|
| Coach's Quiz: question pinned until close | kept | finish screen untouched; tests green |
| Coach's Quiz: first tap locks, second does nothing, options grey | kept | tests green |
| Coach's Quiz: XP by ledger, never twice | kept | tests green |
| Left panel hide/show without PIN | kept | toggle now 48px; actions suite green |
| 👀 What to watch for without PIN | kept | ❗ button now 56px; actions suite green |
| "I need to start over" asks for PIN | kept | STOP overlay untouched; actions suite green |
| Left panel ✓ ½ ⏭ ▶ marks | kept | same marks; row is now the detail button |
| Bar-move 5s lead-in | kept | leadin suites green |
| Estimate includes lead-in ("~N min · estimate") | kept | text unchanged; colour/size only |
| ½ / ⏭ reason line in left panel | kept | 13px (was 11–12) |
| Today review round dots + legend | kept | untouched (PR 4) |
| Today review per-round reason lines | kept | untouched |
| Explore: tapping a move jumps to it | kept | row stays `goToMove` in explore for moves she is not on |
| Gate deny-by-default | kept | `core/gate.js` untouched; every session data-action has a handler (actions suite) |
| `core/` byte-identical with the other repo | kept | `diff -rq core` empty |
| sw.js version bump on shell change | kept | v24 → v25 |
| Design tokens and colour slots | kept | now read by session controls and the journey map |
| Session control sizes (Done 64, row 56, Back 48) | added | FEATURES.md |
| Move-list row is the tap target, ⓘ decorative | added | FEATURES.md |
| Ring zone label in -ink | added | FEATURES.md |
| Journey map from hero/journey slots, "You are here" pill | added | FEATURES.md (K7) |
| Size-floor test with shrinking allowance | added | `core/test/design.mjs` |
| ⓘ as its own 26px button on each row | intentionally removed | approved plan (S3): the whole row opens the detail |
| Journey map dark navy header band and fixed 80% #CDEDE7 stop | intentionally removed | approved plan (K7); mockup Card A has no dark band |
| Done / Keep going colour: ink on mint → white on mint-ink (`btn-go` slots) | changed (plan v3) | sizes and text kept; contrast 6.6; design suite checks the slots |
| Go/Done colour: white on mint-ink → white on aqua-deep (plan v4); Pause/Resume fills: sun-wash/mint-wash → white with hairline border (plan v4) | changed (plan v4) | sizes, actions and text kept; Keep going 17 → 19px (bold large-text floor for swim 3.6); Skip / Skip it border 2 → 3px; design suite checks slots, sizes and the calm buttons || Missing | none | |

## Regression table — R4 PR 3 (+ session sizes, journey map → + Body Check, pop-up cards)
| Feature | R4-PR2b → R4-PR3 | Note |
|---|---|---|
| Coach's Quiz: question pinned / first tap locks / XP by ledger | kept | finish screen untouched; tests green |
| Left panel hide/show without PIN | kept | actions suite green |
| 👀 What to watch for without PIN | kept | actions suite green |
| "I need to start over" asks for PIN | kept | untouched |
| Left panel ✓ ½ ⏭ ▶ marks and reason lines | kept | untouched |
| Bar-move 5s lead-in; estimate includes lead-in | kept | leadin suites green |
| Session controls (Done 64, Pool calm buttons, STOP slot), move-list rows, ring label | kept | design suite assertions unchanged and green |
| Session size floor with no allowance | kept | now also covers intent, micro-loop (open and answered), breath, form check, rep check, move card |
| Rep check: exactly 3 `answerRepCheck` buttons, "Some" right before its closing tag | kept | session.mjs:665–666 green; only min-height 52 → 56 |
| Today review dots and per-round reasons; journey map slots | kept | untouched |
| Body Check: 4 questions, scoring, cautious combine, pain gate (`disabled` + handler), grown-up override, zones, yesterday shown, all text | kept | smoke + actions suites green; smoke.mjs:721, :795 unchanged and green |
| Body Check answer size and grid; light title in -ink; Start 64/24 on the Go slots (green); result scrolled into view; grown-up 48px; picker outline style; hero slots | added | FEATURES.md "Body Check (R4 PR 3)" |
| Pop-up card sizes; rail-hidden label ink-soft | added | FEATURES.md Session screen |
| Light picker: white text on the selected light's fill | intentionally removed | approved plan correction 5 / C5 |
| Body Check hero three-stop aqua gradient (aqua-deep end) | intentionally removed | approved plan: hero slots, 0 → 70% |
| Gate deny-by-default | kept | `core/gate.js` untouched; no new action |
| `core/` byte-identical with the other repo | kept | `diff -rq core` empty |
| sw.js version bump on shell change | kept | v26 → v27 |
| Missing | none | |

## Regression table — R4 PR 4 (+ Body Check, pop-up cards → + Today)
| Feature | R4-PR3 → R4-PR4 | Note |
|---|---|---|
| Coach's Quiz: question pinned / first tap locks / XP by ledger | kept | finish screen untouched; tests green |
| Left panel hide/show, 👀 without PIN; start over asks for PIN | kept | actions suite green |
| Left panel marks, reason lines; bar-move lead-in; estimate | kept | untouched; suites green |
| Session controls, move-list rows, ring label, pop-up card sizes | kept | design assertions unchanged and green |
| Clean-check "✓ Clean" colour: white on mint → Go slots | changed | 56px / 14px / text kept |
| Today review dots and per-round reasons | kept | invariants S2, session copy guard green (todayWide); dots and reasons now 13px |
| Journey map slots, "You are here" pill | kept | design journey checks unchanged and green |
| Journey XP bar white on dark → sun on white 55% | changed | mockup Card A |
| Today day card Card A (hero slots, ink text, hero-chip) | added | FEATURES.md |
| Portrait/phone order: day card first | added | landscape order unchanged |
| Phone fold "See the N blocks" (toggleBlocks, ungated, not saved) | added | iPad always open |
| Today sizes (rows 56, week 13/15/88, all ≥ 13px), Today allowance removed | added | design.mjs |
| ⚡️ selector (moves chip, "⚡️ Full"); Quiz Deck chevron grape-ink | added | |
| Body Check: four questions, scoring, pain gate, override, zones, yesterday, all text | kept | smoke + actions green |
| Body Check: result scrolled into view after the four questions | added | one-shot, same flag as the body map |
| Body Check popup words -ink, legend headers ink-soft, view pills btn-primary | changed | colours only |
| Day card aqua-deep end, white text, alternating row whites (with the slot set) | intentionally removed | approved plan v4 (K1; mockup has no alternation) |
| "Let's go" sun-ink text → ink | changed | approved plan |
| Explore 48px | kept | smoke.mjs:627 unchanged; design exception added |
| Gate deny-by-default | kept | one new kid action `toggleBlocks`, added to `UNGATED_ACTIONS` deliberately |
| `core/` byte-identical with the other repo | kept | `diff -rq core` empty |
| sw.js version bump on shell change | kept | v27 → v28 |
| Missing | none | |

## Regression table — R4 PR 5 (+ Today → + finish screen, Quiz Deck)
| Feature | R4-PR4 → R4-PR5 | Note |
|---|---|---|
| Coach's Quiz: one question per session, pinned after the answer | kept | invariants N+5 and actions quiz tests green; question/opts code untouched |
| Coach's Quiz: first tap locks, options go grey (`disabled`) | kept | invariants (rendered `disabled` count) green |
| Coach's Quiz: XP by the ledger (+10 / +25), never twice | kept | pricing untouched; suites green |
| Coach's Quiz options 15 → 17px, min-height 56; intro 12 → 13px | changed | sizes only |
| XP, streak, completion states and their words | kept | COMPLETION table untouched; smoke partial/held/missed/resume copy green |
| Finish order (summary moved above pace note/mantra; save-failed and level-up moved up; kid line; fold) | changed | correction 3 order; design.mjs asserts it |
| "Not done in full" list, "Redo these", round lines: always shown → behind "See every move ▾" | changed | R1/R2; `toggleMoveReview` (existing state, ungated) |
| Not-done rows coral / sun-ink labels → ink-soft with ⏭ / ½ | changed | R1 |
| "Redo these" white on aqua 44px/14px → btn-primary slots 56px/17px | changed | R4 |
| "🏠 Back to Today" sun-ink 20px/600 → ink 18px/900, 56px | changed | R5; Explore "Done looking" keeps sun-ink, same size |
| Kid line "A few moves came in short — next time hold them all the way. 💪" | added | |
| "Every move was done in full." | kept | now the kid line when nothing came in short |
| `none` title and note; explore "Nothing was recorded" | kept | design.mjs asserts both; `none` shows no kid line (follow-up a) |
| "See every move" folded on every new session's finish | added | follow-up b: reset in `launchSession`; actions.mjs asserts it |
| Mood ≥ 72px, reflection chips / Quiz Deck launcher / level-up 56px, finish allowance removed | added | design.mjs, no allowance |
| Exact round lines in Grown-up › Analytics | added | were not there (totals only) |
| Quiz Deck line under the answer repeated the answer | intentionally removed | G1: now the paired fact, or no line |
| Quiz Deck paired fact (Fix / 👀 Watch for / transfer heading); `transfer` in the quiz pool | added | label from `COPY.transferHeading` (per sport) |
| Quiz Deck dealing, mastery ledger, daily paying round, cap, results | kept | invariants deck checks green |
| Quiz Deck options 56px; tag, practice banner, results labels 13px; results level-up 56px | changed | sizes only |
| Session screen, pop-up cards, Body Check, Today, journey map | kept | untouched; design assertions unchanged and green |
| Gate deny-by-default | kept | no new action; `toggleMoveReview` was already ungated, now asserted |
| `core/` byte-identical with the other repo | kept | `diff -rq core` empty |
| sw.js version bump on shell change | kept | v28 → v29 |
| Missing | none | |

## Regression table — R4 PR 6 (+ finish screen, Quiz Deck → + Progress, Grown-up Zone, nav)
| Feature | R4-PR5 → R4-PR6 | Note |
|---|---|---|
| Coach's Quiz, finish order, See every move fold, kid line wording | kept | design/invariants assertions unchanged and green |
| "Every move was done in full." after a pain stop / early stop | intentionally removed (bug fix) | ledger row 16; only a finished day says it (invariants S11) |
| Quiz Deck dealing, paired fact, sizes | kept | ✕ 44 → 48 (approved exception) |
| Session screen, pop-up cards, Body Check, Today, journey map | kept | untouched except Today ⏱️ chip and "+ Add them back" 44 → 56 |
| Progress week table rows, bars, streak corner, "DAY STREAK" | kept | sizes 8.5–12 → 13, ink-faint → ink-soft, today's name sea → ink; smoke.mjs:4653 green |
| Progress table in both places (kid Progress + Grown-up › Analytics, one `weekTable`) | added | consolidates; `analyticsWeek` now read |
| Prizes beside the table below 900px | intentionally removed | K6: stacked under the table, full width; landscape unchanged |
| Progress period board, XP per day, milestones, log, wallet (redeem/undo), rank story | kept | sizes and -ink colours only; chips/Redeem 56px |
| Grown-up six tabs, numbers, CSV, round lines, settings, backup, gate, PR board, engagement | kept | controls ≥ 48, notes 13px ink-soft on Analytics |
| Move Library as one flat grid | intentionally removed | A3: grouped into one fold per block, every move kept (55) |
| Ladder rungs 36px | changed | A4: 48px, 15px |
| Nav labels 11px / bottom nav 48px | changed | 13px / 56px |
| Size-floor allowance (ALLOW) | intentionally removed | plan: shrinks to empty by PR 6 |
| Gate deny-by-default | kept | no new action |
| Hostile strings escaped on all six Grown-up tabs | kept | invariants green (library fold labels from BLOCK_LABEL, escaped) |
| `core/` byte-identical with the other repo | kept | `diff -rq core` empty |
| sw.js version bump on shell change | kept | v29 → v30 |
| Missing | none | |

## Regression table — R4 PR 7 (+ Progress, Grown-up Zone, nav → + contrast sweep, grown-up text floor)
| Feature | R4-PR6 → R4-PR7 | Note |
|---|---|---|
| Colour slots, Card A day card, portrait/phone order, phone fold, finish order, Progress table in both places | kept | design.mjs assertions unchanged and green |
| Move list marks ✓ ½ ⏭ ▶ and reason lines | kept | marks now in -ink shades; numbers on washes with rings (mint / sun / coral kept in numStyle, session.mjs:492–503 green) |
| Done / skipped move names ink-faint | changed | ink-soft; done keeps the strike-through |
| Week strip / legend white glyphs | changed | ink; done ✓ 19px; legend circles 24px (smoke :4471 / invariants :1009 green) |
| Explore "🏠 Done looking" sun-ink on sun | changed | ink on sun (was 3.5 at 18px) — locked line updated in FEATURES.md |
| Day-card • bullet at 70% | intentionally removed (the fade) | measured 3.7–4.1 over the gradient; the bullet stays |
| Consistency done cell ink on mint | changed | mint-ink on mint-wash + mint ring (5.9); smoke.mjs:2122 regex follows |
| Rep check / STOP / restart / move-card resume buttons on mint | changed | btn-go slots, 19–20px weight 900 (like Keep going and ✓ Clean) |
| Grown-up text 10–12px, ink-faint notes, prize-pool ✕ | changed | 13px, ink-soft |
| Prize draw ✕ 44px | changed | 48px (approved exception, now scanned) |
| Gate dialog buttons 46px, white on mint | changed | 48px, btn-primary slots |
| Quiz Deck, prize wallet, Body Check flow, gate rules, all text | kept | no text, layout or behaviour change |
| `core/` byte-identical with the other repo | kept | `diff -rq core` empty |
| sw.js version bump on shell change | kept | v30 → v31 |
| Missing | none | |

## Regression table — R5 (R4 manifest → + kids' colours, one button style, ripples/snow)
| Feature | Status |
|---|---|
| Finish order, kid line, move-review fold, round lines, Quiz Deck pairing, lead-ins, gate deny-by-default, Body Check scoring and gates, Progress table in both places, phone fold, Today order, size floors, 13px text floor, contrast rules | ✅ kept |
| Week-strip status colours, readiness light colours, Wobbly on sun, recovery purple | ✅ kept |
| One main-button colour; one filled-button style (4px edge, radius-md, font-ui 900, 22/64 or 18/56, STOP 20); red only STOP / destructive grown-up / ring warning; corner rule; card borders 2px; shadows and scrim from per-app tokens; no purple on kid screens; ring slots; finish background; hero decoration setting (gated, default on, old backups on); last-3-seconds pulse shows | ➕ added |
| Pool-calm Go (aqua-deep, white) and white outlined Pause/Skip; Let's go / Back to Today / prize on sun; STOP on stop-deep; Card A day card; journey painted sky; XP bar sun; grape quiz chevron, rep ring, explore banner, evening ring; navy rank card; Explore 48px outline | ⚠️ intentionally replaced (approved R5 plan v2) |
| --hero-from, --hero-to, --journey-via, --journey-to | ⚠️ intentionally removed (plan "Removes") |
| Missing | none found |

## Regression table — care/recovery day record (R5 manifest → + care days)
| Feature | Status |
|---|---|
| Training-day records, XP pricing (Sunday no-XP, weekday show-up), `recovery` / `dayComplete` meanings, adherence, streak gap rules, stored session shape | ✅ kept (all existing suites green unchanged) |
| Finish order, kid line, move-review fold, Today order / phone fold, unfinished Sunday "Start Recovery" card, week-strip rest mark, Progress table in both places, size and contrast floors | ✅ kept |
| `careComplete` verdict; care record rows and move counts; finish "N of M moves" line; Today finished-day card for care (COMPLETED / PARTLY DONE, Finish recovery); Progress care cells; Grown-up recovery chip in grape | ➕ added |
| `RECOVERY_STREAK_FRACTION` (100% of every clock) and the separate `isSpaDay` paths on the done card | ⚠️ intentionally removed / merged (plan "Removes") |
| Streak freeze rule | changed as approved — `streakJudged && careComplete` (an early-tapped weekday recovery now holds the streak) |
| Missing | none found |
