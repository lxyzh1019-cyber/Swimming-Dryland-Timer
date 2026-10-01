# FEATURES — Splash (Swim Dryland Timer) — manifest v1 (partial) — confirmed 2026-09-24, updated 2026-10-01 (R4 PR 1, R4 PR 2, R4 PR 3, R4 PR 4)

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
- Session controls (R4 PR 2, plan v4 "Pool calm"): Go/Done 64px, 20px weight 900 (never smaller), white text on aqua-deep via the `btn-go` slots (`--btn-go-bg` / `--btn-go-text` / `--btn-go-edge`; fallbacks mint / `--text-on-mint` / mint-deep); "Keep going" on the same `btn-go` slots, 56px, 19px weight 900 (swim white on aqua-deep is 3.6, large text only); Pause, Resume, Skip (also in explore) and "⏭ Skip it" white (`--surface`) with a 3px `--hairline` border and `ink-soft` text; STOP, Pause/Resume, Skip, "⏭ Skip it" and "✕ Done looking" 56px, 17px; STOP fill `--btn-stop-bg` with edge `--btn-stop-edge`, white text; "◀ Back a move" 48px in `ink-soft` (the one approved exception to 56).
- Move list (R4 PR 2): each row is one 56px button that opens that move's detail (`openDetailAt`, same `ci|ei`); the ⓘ is a decorative picture (`aria-hidden`), not a button. In explore, a row she is not standing on keeps its old job: it jumps to that move (`goToMove`). Legend `ink-soft` 13px; block titles in the `-ink` shades (warm-up coral-ink, main sea-ink, prep/recovery grape-ink); current-move pill on `--btn-primary-bg` / `--btn-primary-text`. Marks ✓ ½ ⏭ ▶ and reason lines unchanged.
- Timer ring (R4 PR 2): the zone label (TIMED / READY / REST …) is 13px in the zone's `-ink` shade (urgent: stop-ink); the arc keeps the bright zone colour. Rep ring: BY REPS, dose, ⏱ and hint in grape-ink, hint 13px, no fade.
- Left-panel hide/show toggle 48px round, screen-reader text kept. Session-time estimate line `ink-soft` 13px, text "~N min · estimate" unchanged.
- Size floor (R4 PR 2): on the live session screen (get ready, timed, rep ring, rest, main round 2, watch-for open, paused, skip confirm, STOP, start-over warning, rail hidden, explore; three layouts) no inline text is under 13px and every sized button is ≥ 56px (Done ≥ 64, Back a move 48). Enforced by `core/test/design.mjs` with no allowance.
- Pop-up cards (R4 PR 3): intent word buttons, micro-loop answers, the rep check ("All of them / Almost / Some", exactly 3 `answerRepCheck` buttons), the clean-check strip (clean / wobbly / Skip) and "▶ Resume my session" are 56px; the move card's ✕ is a 48px round close; the move card's section labels (Coach tip, 👀 Watch for, transfer heading) are 13px. Breath and landing/form cards keep their text ≥ 13px. All drawn and scanned by `core/test/design.mjs` (three layouts).
- Rail hidden (R4 PR 3): the vertical progress label is `ink-soft` (was ink-faint), 13px.
- Clean-check strip (R4 PR 4): the "✓ Clean" button is on the Go slots (`--btn-go-bg` / `--btn-go-text` / `--btn-go-edge`, fallbacks mint / white / mint-deep); 56px, 19px weight 900 (anything on the btn-go slots is large text).

## Today screen
- "Review what you did": per-move round dots (✓ / ½ / ⏭ / —) with a legend.
- "Review what you did": every short round of a move has its own reason line; each round dot's label carries that round's reason.
- Journey map (R4 PR 2, K7): painted from the slots `--hero-from` → `--hero-to` → `--journey-via` → `--journey-to` (fallbacks = the old swim colours), so each app shows its own map; header text, rank names, captions, pips and "More of the … awaits" in `--hero-text`; the current rank's name and "YOU ARE HERE" sit on a white 60% pill (name ink, caption aqua-ink); done ranks keep the mint circle; dashed/solid paths and pips kept. Header fade is a light neutral one (the dark navy band is gone, as in the mockup's Card A). Map text ≥ 13px; checked by `core/test/design.mjs` with no allowance.
- Journey XP bar (R4 PR 4): fill `var(--sun)` with a 2px inset `sun-deep` edge, track white 55% (mockup Card A), so it shows on the light map.
- Day card (R4 PR 4, K1, Card A · Sunny pool): `linear-gradient(165deg, var(--hero-from) 0%, var(--hero-to) 70%)`, text `--hero-text` (swim: aqua-light → aqua, ink text (7.97 / 4.93)); chips, header pills, focus box, block rows and the phone fold on `--hero-chip` (fallbacks = the old white tints; block rows one even tint, the old alternation only in the fallback); block-row text, "← Back to today", "+ Add them back", secondary CTA and "🧪 Explore the moves" in `--hero-text`; block icon circles stay white. "Let's go" ink on sun (was sun-ink). Explore stays 48px (approved exception, secondary action). No faded day-card text: every line that measured under 4.5:1 with an opacity (line under "Let's go", Explore hint, echo line, block hint, cues, transfer lines, missed and recovery notes) and the same pattern in states the test clock cannot reach (done, XP note, review legend and reasons, skipped label, future note, partial-skip label) is full-strength hero-text; only the block-row count (≥ 5.24 measured) and the • bullet keep an opacity.
- Order (R4 PR 4, K2/K9): landscape unchanged (greeting, week + legend, stats, Quiz Deck, journey | day card right). iPad portrait (tight): greeting, day card, week + legend, stats, Quiz Deck, journey. Phone: greeting, day card, week, stats, Quiz Deck, journey.
- Phone fold (R4 PR 4, K9): on phone only, the blocks sit behind one 56px button "See the N blocks ▾" / "Hide the blocks ▴" (`data-action="toggleBlocks"`, `aria-expanded`); state `state.blocksOpen` in `core/main.js` (default folded, not saved), so a block tap does not fold it; `toggleBlocks` is in `UNGATED_ACTIONS`. iPad (wide and tight) always open, no button.
- Sizes (R4 PR 4, K3): block rows 56px; week strip day name 13px, date 15px, cell min-height 88px; legend dots, stat labels, chips, header pill, block hint/minutes, review legend/reasons/dots, transfer line, Explore hint all ≥ 13px. Today has no size allowance in `core/test/design.mjs` (roomy, tight, phone folded and open, a block expanded).
- Emoji (R4 PR 4, K8): the moves chip uses `emojiPresentation("⚡")`; the energy answer reads "⚡️ Full" (U+FE0F) in `js/data.js`.
- Quiz Deck launcher chevron in `grape-ink` (R4 PR 4, G2).

## Body Check (R4 PR 3)
- Kept: the 4 questions and their words, scoring (3 yes Green, 2 Yellow, 1 Red, 0 Recovery; the body map and the questions combine to the more cautious), the pain gate (severity 3 needs "A grown-up said it's OK" before Start; the Start button is `disabled` until then and the handler checks the same rule), the grown-up override under 🔒, the body-map zones and their coordinates, yesterday shown beside today (never reused), "Nothing feels off now", all text.
- Answers: each yes/no is 56px, 17px, weight 900; the pair is a two-column grid, full width under its question (mockup).
- Result card: the light's title is in the light's `-ink` shade (`titleInk` in `LIGHT_META`: green mint-ink, yellow sun-ink, red stop-ink, recovery grape-ink); the bright colour stays on the top border and dot.
- Start button (both paths, and "Back to Today" when the day is finished): 64px, 24px, weight 900. Green on the Go slots (`--btn-go-bg` / `--btn-go-edge` / `--btn-go-text`, white on aqua-deep), also body-check severity 1; yellow sun / sun-deep / sun-ink; red coral fill with `--text-on-coral` text (also severity 3); recovery `--btn-grape-bg` with grape-ink edge, white text.
- After a body-map answer the result card is scrolled into view (`[data-body-result]`, `core/main.js`, only on the render that follows the answer; null-safe).
- After the answer that completes the four questions, the light (result card with Start) is scrolled into view once, by the same one-shot flag (R4 PR 4); a later changed answer does not scroll again.
- Leftover colours (R4 PR 4): zone popup severity words in `sun-ink` / `coral-ink` / `stop-ink` (bright colour kept on the border); legend group headers `ink-soft` (were ink-faint); "FRONT VIEW" / "BACK VIEW" pills on `--btn-primary-bg` with `--btn-primary-text` (swim: ink on aqua (4.9)).
- Grown-up override: the "🔒 Grown-up only" summary is 48px, 13px; the light picker options are 48px, 15px; the chosen light has a 3px border in its colour on white with its title in its `-ink` shade (no white text on the light); the others a 3px hairline border, ink-soft.
- Hero panel (questions step): `linear-gradient(165deg, var(--hero-from) 0%, var(--hero-to) 70%)`, text `--hero-text`, back button and step chips on `--hero-chip` (fallbacks = the old aqua/white look).
- Sizes: every inline text on every Body Check step ≥ 13px; kid buttons ≥ 56px (answers, legend rows, back arrows 56px round, popup options, "Feels fine now", Cancel, "Rest 1–2 min, then re-check", "Nothing feels off now"); grown-up controls ≥ 48px. Enforced by `core/test/design.mjs` over 13 states × 2 layouts plus yesterday, no allowance.

## Design tokens and colour slots
- Rule: screens read slots with fallbacks equal to the previous look; core stays byte-identical; skate fills its own slot values.
- Slots in `css/tokens/colors.css` (SEMANTIC ALIASES): `--hero-from` aqua-light · `--hero-to` aqua · `--hero-text` ink · `--hero-chip` white 55% · `--journey-via` #9FE6F3 · `--journey-to` #F6E7C1 · `--btn-primary-bg` aqua · `--btn-primary-edge` aqua-deep · `--btn-primary-text` ink · `--btn-stop-bg` stop-deep · `--btn-stop-edge` stop-ink · `--btn-grape-bg` grape-deep · `--btn-go-bg` aqua-deep · `--btn-go-text` #FFFFFF · `--btn-go-edge` aqua-ink.
- Text-on tokens: `--text-on-aqua`, `--text-on-coral`, `--text-on-mint`, `--action-text`, `--go-text` = `var(--ink)` (were white). Read since R4 PR 3: `--text-on-coral` by the red Start button (`js/data.js` LIGHT_META red, BODY_RESULTS 3); `--text-on-mint` only as the fallback inside the `btn-go` slots (session Go/Done, Keep going); the others unread (grep 2026-10-01).
- `--border-card-color` (was the dead colour alias `--border-card`; `--border-card: 3px` in `spacing.css` is the live width and is unchanged).
- `.candy` (unused by screens) falls back to `--action-edge` for its 3D edge (was the non-existent `--action-deep`).
- Design reference copied in: `docs/DESIGN.md`, `docs/mockups/Splash-mockups.html` (handoff copies, not app code).

## Rules / special cases
- Grown-up gate is deny-by-default: any action not in `UNGATED_ACTIONS` (or allowed by `CHILD_MAY`) asks for the PIN.
- `core/` is byte-identical with the Figure-Skate-Dryland-Timer repo.
- Every release that changes a precached shell file bumps `version` in `sw.js`.
- Size-floor test `core/test/design.mjs` (R4 PR 2): kid screens no inline text < 13px, sized buttons ≥ 56 (session Done ≥ 64); grown-up buttons ≥ 48; buttons with no min-height are listed, not failed. Screens not yet redesigned carry a per-screen allowance (`ALLOW`) that PRs 4–6 shrink to empty; the session screen, the journey map, Body Check and Today have none (R4 PR 3 removed the Body Check entries, R4 PR 4 the Today entries). Approved below-56 kid controls: Back a move 48, the move card's ✕ 48, the Body Check light picker 48 (grown-up control), Today's "🧪 Explore the moves" 48 (secondary action).

## Regression table format (paste at the end of every edit)
| Feature | v<old> → v<new> | Note |
|---|---|---|
| <feature> | kept / added / intentionally removed / missing | <why, if not kept> |
