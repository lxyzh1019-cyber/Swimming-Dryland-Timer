# Plan v1 — Recovery days keep their completion record (Sunday and weekday alike) — Awaiting approval

| Summary |
|---|
| **What this plan does:** a finished recovery day (Sunday, or any day the body check turned into recovery) keeps its moves, minutes and "completed" mark, and every screen shows them the same way a finished training day is shown. Tapping Done a little early on a long roll no longer makes a finished recovery read as "stopped partway". |
| **What changed from the last version:** first version. It follows your answers (every screen looked wrong; she did every move) and your instruction that the Today card shows a finished recovery day like any finished day, with no Sunday-only handling. |
| **What I need from you:** approve the plan, and say whether a weekday recovery with an early-tapped move should also hold the streak (recommended: yes, so "complete" means the same thing everywhere). |

**Stages to finish**

7 stages: 4 build-and-test steps by Claude (each covering both apps), 1 merge by you, a live-site check by Claude and your check on the device.

1. Write tests that fail on today's behaviour — Claude
2. Build the change in both apps — Claude
3. Run every test in both apps — Claude
4. Open one draft pull request per app — Claude
5. Merge both pull requests — You
6. Check the live site updated — Claude
7. Do a Sunday recovery on the device and check the finish screen, Today card, Progress and Grown-up Zone — You

## Context — why
Reproduced in the test harness (Sun 2026-10-04, full Sunday menu run):
- **The session saves correctly**: all 8 moves `done`, 11 min, `workRatio 1`.
- **The day record throws it away**: `core/outcome.js` `dayRecords()` builds a care-only day with `rows: []`, moves `0/0`, times done `0/0`, `dayComplete: false`, and `recovery: false` (only `sessionType "recovery"` sets it; Sunday saves as `"spa"`). Every screen reads this record, so:
  - **Today card**: today's finished Sunday still shows `TODAY · Start Recovery`; a finished recovery day on any other date shows `RECOVERY DAY · Start Recovery` — finished or not, no moves or minutes. Same flaw for weekday recovery days.
  - **Progress table**: `care` / `n/a` / `—` instead of `8/8` moves.
  - **Grown-up Zone by weekday**: Sunday shows `—`, 0 min; a weekday recovery shows a yellow "recovery" chip — the same colour as "partial".
- **"Stopped partway" on the finish screen**: the care verdict needs 100% of every move's clock (`RECOVERY_STREAK_FRACTION = 1`, pro-rated). Tapping Done early on one 2-min roll (73 of 120 s) → 95% → "Some care is better than none… you stopped partway", although every move was done. The finish screen also shows no move count for care.

## Approach — one care-day verdict, read by every screen (no Sunday special case)
1. **Care record keeps its facts** (`core/outcome.js`, care-only branch of `dayRecords`): keep the merged care ledger rows; moves and times done measured against the recovery menu (`assembleRecoveryCircuit` + `countExpectedWork`, reused from `core/engine.js`); add `careComplete` = every menu move recorded, none skipped, not ended early. `recovery`, `dayComplete`, XP and adherence fields keep their current meaning (Sunday stays no-XP).
2. **Finish screen** (`core/vm/session.js`, `core/screens/session.js`): "Recovery done" vs "stopped partway" decided by `careComplete`; add the "N of M moves" line for care. The "stopped partway" copy appears only when a move was skipped or the session ended early.
3. **Streak freeze** (`core/outcome.js`): uses the same `careComplete` verdict instead of 100% of every clock. *Meaningful choice:* this makes a weekday recovery with an early-tapped move hold the streak (today it does not). Recommended, so one verdict means one thing on every screen; say "keep the freeze strict" to leave it out.
4. **Today card** (`core/vm/today.js`): a day with a care record uses the finished-day card on any weekday, today included: `SUN · COMPLETED ✓` or `· PARTLY DONE ✓`, "8 of 8 moves", "11 of 12 min", "Nice reset — recovery complete!", "Do it again" (nothing recorded). Partly done offers "Finish recovery" (records). The `isSpaDay` switches in the done card become "this record is care". Week strip keeps its recovery (rest) mark.
5. **Progress table + log** (`core/vm/progress.js`): moves / times done / skipped / ended early filled from the care record; rounds stay `n/a`, pace stays "Care".
6. **Grown-up Zone** (`core/vm/grownup.js`): by-weekday row shows any care record (Sunday included) with minutes; chip in the recovery colour — `✓ recovery 11m` or `recovery · part` — not the yellow "partial" colour. CSV export gets the move counts.
7. Both repos (`core/` is shared byte-for-byte); `sw.js` version bump in both.

**Removes/consolidates:** the separate Sunday (`isSpaDay`) and weekday-recovery paths on the Today card and Grown-up row merge into one care-record path; the 100%-of-clock recovery rule is replaced by `careComplete`.

**Checked against:** request ledger (no earlier recovery-day request); hotspot counter (no row for care days → new row "Care/recovery day record", fix round 1). Not touched: training-day records, XP prices (Sunday stays no-XP), streak gaps (Sunday never a gap), adherence counts.

## Success criteria (tests first, must fail before the change)
- Full Sunday run → day record has 8/8 moves, `careComplete: true`; finish = "Recovery done" with "8 of 8 moves"; Today card `SUN · COMPLETED ✓`, "8 of 8 moves", "11 of 12 min"; Progress `8/8`; Grown-up `✓ recovery 11m`.
- Sunday with one early Done tap → still "Recovery done" / COMPLETED.
- Sunday with a skipped move or ended early → "PARTLY DONE" everywhere, finish says what was skipped.
- The same three cases on a weekday whose light was Recovery give the same results.
- XP, streak length on existing histories, and every existing suite unchanged (`npm test` green, both repos, both time zones); `diff -rq core` empty between repos.

## Execution
Executor: opus-worker (touches the shared day record). New branch in each repo; one commit and one draft PR per repo after tests pass; WORKING_RECORD updated. No merge.
