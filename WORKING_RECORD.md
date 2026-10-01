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
| 13 | R4 2026-09-30 | "The figure skate level block background colour is wrong, it can not use the same colour from swimming dryland timer" | open | pre-existing (K7): the journey/level map gradient is literal swim hex in shared core; unchanged by PR 1 (before = after); fixed in PR 4 via the journey slots set in PR 1 (skate rose/sand) |

## Hotspot counter
| Area / feature | Fix rounds | Recurrences | Regressions caused | Workarounds/exceptions | Last symptom | Rewrite-vs-repair reviewed? |
|---|---|---|---|---|---|---|
| Coach's Quiz (finish screen) | 1 | 0 | 0 | 0 | question swaps after a correct tap | no |
| Grown-up gate / UNGATED_ACTIONS coverage | 1 | 0 | 0 | 0 | kid session buttons ask for PIN | no — structural option noted below |
| Move status list (session rail / Today review) | 1 | 0 | 0 | 0 | ½ gave no reason | no |
| Test suite depends on the real date | 2 | 1 | 0 | 0 | Sunday-only failures (earlier: Monday-only assertion) | structural fix applied: pinned test clock |
| Screen contrast and tap size (redesign R4) | 0 | 0 | 0 | 0 | 76 contrast fails, 185 texts <13px, controls 26–44px (handoff screen check) | n/a — redesign round, not a fix |
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
| R4-2 Merge PR pair 1 | WAITING ON YOU — merge PR pair 1 | |
| R4-3 PR 2 Session screen + size-floor test | NOT STARTED | |
| R4-4 Merge PR pair 2 | NOT STARTED | |
| R4-5 PR 3 Body Check | NOT STARTED | |
| R4-6 Merge PR pair 3 | NOT STARTED | |
| R4-7 PR 4 Today | NOT STARTED | |
| R4-8 Merge PR pair 4 | NOT STARTED | |
| R4-9 PR 5 Finish screen and Quiz Deck | NOT STARTED | |
| R4-10 Merge PR pair 5 | NOT STARTED | |
| R4-11 PR 6 Progress and Grown-up | NOT STARTED | |
| R4-12 Merge PR pair 6 | NOT STARTED | |
| R4-13 Final size test + screenshots, manifest lists locked items | NOT STARTED | |
| R4-14 iPad check by user | NOT STARTED | |

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
