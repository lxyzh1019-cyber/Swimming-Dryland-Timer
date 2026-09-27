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

## Hotspot counter
| Area / feature | Fix rounds | Recurrences | Last symptom | Rewrite-vs-repair reviewed? |
|---|---|---|---|---|
| Coach's Quiz (finish screen) | 1 | 0 | question swaps after a correct tap | no |
| Grown-up gate / UNGATED_ACTIONS coverage | 1 | 0 | kid session buttons ask for PIN | no — structural option noted below |
| Move status list (session rail / Today review) | 1 | 0 | ½ gave no reason | no |
| Test suite depends on the real date | 2 | 1 | Sunday-only failures (earlier: Monday-only assertion) | structural fix applied: pinned test clock |
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
| R3 records, regression table, commit, push, draft PRs | PARTIAL | records + FEATURES updated; commit/push/PR in progress |
| R3 checked on a device | NOT STARTED | user, after merge (no on-page stamp) |
| R2 pinned test clock | PARTIAL | done + tests green locally on a real Sunday; awaiting CI on the PR + merge |

## Checks and evidence
- 2026-09-24 baseline `node core/test/run.mjs` → all suites green (before changes)
- 2026-09-24 after changes, rerun by main session: `node core/test/run.mjs` → all suites green, both TZs (swim invariants 569, session 325, actions 302; skate invariants 572, session 327); `diff -r core` swim vs skate → identical
- 2026-09-24 live site → untested (no on-page stamp)
- 2026-09-27 (Sunday) before fix: `node core/test/run.mjs` → skate 4 failing / swim 6 failing (invariants, session; swim also smoke); same on base `main`; clock shifted to Sat/Mon → all green
- 2026-09-27 after fix, rerun by main session on the real Sunday clock: all suites green in both repos; `release-check origin/main` → ok; `clock.mjs` and `run.mjs` identical across repos; worker also green under outer shifts to other Sundays/Saturday

- 2026-09-27 R3 after changes, rerun by main session: `node core/test/run.mjs` exit 0 in both repos, both TZs (new: core leadin 42 checks; skate leadin-data 11, swim leadin-data 19; skate invariants 572, session 327; swim invariants 569, session 325); `diff -r core` skate vs swim → identical
- 2026-09-27 R3 live site / device → untested

## Open questions / blockers
- No visible deploy stamp on the page (rules require one) — flagged, out of scope this round.
- R3 note: before a bar move she now gets the rest's +5s setup AND the 5s lead-in (~10s total) — as approved; worth a real try.
- Session hooks did not auto-fire in the R3 session (session started outside the repo); rules loaded by running the loader manually.
- FEATURES.md holds only the features touched this round; the full manifest is still unpopulated.
