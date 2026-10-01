# FEATURES — Splash (Swim Dryland Timer) — manifest v1 (partial) — confirmed 2026-09-24, updated 2026-09-30 (R4 PR 1)

Locked features of the current version. Every edit is checked against this list and ends with a regression table. Update this file in the same change that alters a feature. Over-list rather than under-list.

**Partial manifest.** Only the features touched on 2026-09-24 are listed. The rest of the app is not yet inventoried here; until it is, a regression table can only vouch for these lines plus the automated test suite (`node core/test/run.mjs`).

## Session finish screen
- Coach's Quiz: one question per finished session; the question on screen does not change after she answers (right or wrong), until the session is closed.
- Coach's Quiz: first tap locks the card; a second tap changes nothing; options go grey after the reveal.
- Coach's Quiz: XP priced by the quiz ledger (+10 first attempt, +25 first correct), never twice; the question paid is the question shown.

## Session screen (during a workout)
- Left panel (wide screens) can be hidden and shown by the kid with no grown-up PIN.
- 👀 "What to watch for" by the coach tip opens and closes with no grown-up PIN.
- "I need to start over" (erases the attempt) asks for the grown-up PIN.
- Left panel move list: ✓ done · ½ short · ⏭ skipped · ▶ current, for the round she is in.
- Bar moves ("Clean Pull-Ups" and "Scap Pull-Up + Dead Hang", flagged `leadInSeconds: 5`): after the move is named, a 5s "Get on the bar" get-ready countdown runs before rep 1 / the work clock, then "Go.". Not work time (the hang stays 30s; reps and the move clock start after it). Done ("▶ Go") starts the move early; Skip skips the move; Back goes to the move before; STOP ends the session. The +5s setup in the rest before these moves is kept.
- Session length estimate ("about N min") includes each lead-in.
- Left panel: a ½ or ⏭ move shows a small reason line (e.g. "4 of 6 reps — all 6 to count", "20s of 30s — needs 24s (80%) to count", "under 3s — counted as skipped").

## Today screen
- "Review what you did": per-move round dots (✓ / ½ / ⏭ / —) with a legend.
- "Review what you did": every short round of a move has its own reason line; each round dot's label carries that round's reason.

## Design tokens and colour slots
- Rule: screens read slots with fallbacks equal to the previous look; core stays byte-identical; skate fills its own slot values.
- Slots in `css/tokens/colors.css` (SEMANTIC ALIASES): `--hero-from` aqua-light · `--hero-to` aqua · `--hero-text` ink · `--hero-chip` white 55% · `--journey-via` #9FE6F3 · `--journey-to` #F6E7C1 · `--btn-primary-bg` aqua · `--btn-primary-edge` aqua-deep · `--btn-primary-text` ink · `--btn-stop-bg` stop-deep · `--btn-stop-edge` stop-ink · `--btn-grape-bg` grape-deep.
- Text-on tokens: `--text-on-aqua`, `--text-on-coral`, `--text-on-mint`, `--action-text`, `--go-text` = `var(--ink)` (were white). No screen in `core/` or `js/` reads them yet (grep 2026-09-30).
- `--border-card-color` (was the dead colour alias `--border-card`; `--border-card: 3px` in `spacing.css` is the live width and is unchanged).
- `.candy` (unused by screens) falls back to `--action-edge` for its 3D edge (was the non-existent `--action-deep`).
- Design reference copied in: `docs/DESIGN.md`, `docs/mockups/Splash-mockups.html` (handoff copies, not app code).

## Rules / special cases
- Grown-up gate is deny-by-default: any action not in `UNGATED_ACTIONS` (or allowed by `CHILD_MAY`) asks for the PIN.
- `core/` is byte-identical with the Figure-Skate-Dryland-Timer repo.
- Every release that changes a precached shell file bumps `version` in `sw.js`.

## Regression table format (paste at the end of every edit)
| Feature | v<old> → v<new> | Note |
|---|---|---|
| <feature> | kept / added / intentionally removed / missing | <why, if not kept> |
