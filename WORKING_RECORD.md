# WORKING RECORD — Swimming-Dryland-Timer (Splash) — rules v2

Single working record for this repository. Updated by the main session at the end of every implementation turn (the record guard hook checks this). Keep it terse; history lives in git.

`core/` is shared byte-for-byte with Figure-Skate-Dryland-Timer; every core change lands in both repos, and both records carry the same round.

## Approved baseline
- Plan v2 approved 2026-09-24 (branch `claude/fervent-lamport-sstzde`):
  - Coach's Quiz question pinned per session (`sessionQuizOf`), so a correct tap no longer swaps the question.
  - `toggleRail` (hide/show left panel) and `toggleWatch` (👀 What to watch for) added to `UNGATED_ACTIONS`; `askRestart`/`cancelRestart`/`doRestart` stay gated (user choice).
  - ½ / ⏭ moves in the session left panel show a reason line (`moveReviewReason`); Today "Review what you did" gives every short round its own reason line, and the round dot's title carries it. Both apps.
  - `sw.js` version bump v21 → v22.

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

## Hotspot counter
| Area / feature | Fix rounds | Recurrences | Last symptom | Rewrite-vs-repair reviewed? |
|---|---|---|---|---|
| Coach's Quiz (finish screen) | 1 | 0 | question swaps after a correct tap | no |
| Grown-up gate / UNGATED_ACTIONS coverage | 1 | 0 | kid session buttons ask for PIN | no — structural option noted below |
| Move status list (session rail / Today review) | 1 | 0 | ½ gave no reason | no |
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

## Checks and evidence
- 2026-09-24 baseline `node core/test/run.mjs` → all suites green (before changes)
- 2026-09-24 after changes, rerun by main session: `node core/test/run.mjs` → all suites green, both TZs (swim invariants 569, session 325, actions 302; skate invariants 572, session 327); `diff -r core` swim vs skate → identical
- 2026-09-24 live site → untested (no on-page stamp)

## Open questions / blockers
- No visible deploy stamp on the page (rules require one) — flagged, out of scope this round.
- FEATURES.md holds only the features touched this round; the full manifest is still unpopulated.
