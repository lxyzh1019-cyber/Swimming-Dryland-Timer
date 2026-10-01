# Plan v1 — Splash redesign: six paired PRs, validated against the code — Approved 2026-09-30

Written by Fable 5.1 (the session model; the planner hint to switch to Fable already applies).

## Summary

The handoff asks for a visual redesign of the kids' app (bigger buttons, readable colours, a sunnier Today card, a calmer finish screen) in six steps, each step landing in both apps at once because the screens are shared. I checked every claim in the handoff against the real code and the tests. The plan is sound and can be built as written, with eleven corrections: a few things it assumes exist do not (a "See every move" button, an "in the pool" fact in the quiz), one label would be wrong in the skate app, two fold-away sections would snap shut on every tap unless the app remembers them, and one screen reorder is missing for phones. Each correction comes with my fix below.

What I need from you: approve this plan, then merge each pair of pull requests when I stop for it (six times). One decision is open: how the required screenshots are taken.

## Whole-artifact verdict (handoff plan)

Whole artifact: 3 of 9 requirements Guaranteed; the rest are Checked or Assumed because the design targets (sizes, colours, order) have no automatic check yet. The plan below adds one.

| Requirement | Current mechanism | Grade | Fix / residual |
|---|---|---|---|
| Both apps keep identical shared code | manual `diff -r` after each PR | Checked | keep the manual diff in every PR report; no CI check exists (stays Checked) |
| Service-worker version bumped on every release | `release-check` in CI | Guaranteed | none |
| No kid action silently behind the PIN | `actions` test enumerates session-screen actions | Guaranteed (session only) | new Today action is also covered by adding it to the ungated list and a Today assertion |
| Nothing under 13px on kid screens | measured once by the handoff script | Assumed | add a shared test that scans rendered kid screens for inline `font-size` under 13px → Guaranteed |
| Kid controls ≥56px, grown-up ≥48px | measured once | Assumed | same test scans `min-height` on buttons of each screen → Guaranteed for sized buttons; unsized ones stay Checked by screenshot |
| Text contrast ≥4.5 in both palettes | worked out by hand | Checked | screenshot review per PR; no mechanism (stays Checked) |
| Behaviour unchanged (timing, scoring, quiz ledger) | existing suites (≈3,200 checks per app) | Guaranteed | none |
| Other-language text untouched | none | Assumed | worker instruction + diff review per PR (stays Assumed) |
| Line references in the handoff | none | Broken in 11 places | corrected below |

Skills that did not fit: hz-chat-handoff (no handoff requested), hz-outcome-audit (no version history to audit), hz-web-app-audit (not a single-file app question).

## Checked against

- Request ledger: nothing conflicts; the R1 decision to keep the PIN on "I need to start over" is untouched.
- Hotspot rows: "Grown-up gate / UNGATED_ACTIONS coverage" (1 fix round, structural option not approved) — every new kid action in this plan is added to the ungated list and asserted. "Move status list" — the ✓ ½ ⏭ ▶ marks and reason lines are kept exactly. "Coach's Quiz" — question pinning and ledger untouched. This is a redesign round, not a fix: at approval both records get a new area row "Screen contrast and tap size (redesign)" with 0 fix rounds, and the ledger rows below.
- Skate clone is at a newer `main` than the handoff baseline (only the rules-stub update since); no effect.

## Removes/consolidates

- Retires the dead colour alias `--border-card` (renamed `--border-card-color`) and the non-existent `--action-deep` reference in both apps' stylesheet.
- Consolidates the Progress week table into one function used by both Progress and Grown-up › Analytics (no copied markup); the unused `analyticsWeek` rows already built by the Progress view-model get used instead of staying dead.
- Retires the Quiz Deck line that repeats the answer.

## Corrections to the handoff plan (each with the chosen fix)

1. **"See every move" does not exist on the finish screen.** The toggle action and its state exist in the app core and the gate, but no button calls them. Fix: PR 5 adds the button and the collapsed section (uses the existing action and state, so it survives re-renders).
2. **The quiz has no "in the pool" fact.** Quiz moves carry only name, cue, watch, fix and block. Also "🌊 In the pool" is a swim phrase in shared code. Fix: add `transfer` to the quiz move pool (one field), and use the sport-specific transfer label the session detail overlay already uses; hide the line when the field is empty.
3. **Finish-screen order has more parts than the plan lists** (pace note, mantra, summary line, level-up prize, save-failed card). Fix: order = pose, title, note, save-failed card (if any), level-up prize (if any), summary line, pace note, mantra, "How did it feel?", Coach's Quiz, kid line, "See every move ▾", "🏠 Back to Today".
4. **Body Check result card is full-width under the map row**, not in a side column. Fix (the smaller change): scroll it into view after render, using the same null-safe pattern as the session list scroll.
5. **The light picker (grown-up override) paints white text on the selected light**, including yellow (fails). Fix inside C5: selected option = 3px border in the light colour, white background, title in the light's `-ink` shade.
6. **"Hide today's moves" is a 32px chevron with screen-reader text only.** Fix: the chevron button becomes 48px; the text stays screen-reader only (no new visible label).
7. **The estimate text is "~N min · estimate"**, not "about N min"; a test depends on it. Fix: change only colour and size.
8. **Phone "See the N blocks" fold would snap shut on every block tap** (each tap re-renders the screen). Fix: a remembered state + a new ungated action `toggleBlocks` (button with ▾/▴), not a bare native details element.
9. **Day-card-first is missing on phone.** The plan reorders only the iPad-portrait path; the design decision says portrait and phone. Fix: the phone layout also moves the day card above the week strip.
10. **"Let's go" and the Explore button styles live in the Today view-model**, not the screen; the week-strip cell has no explicit height (padding only). Fix: edit where they live; give the cell `min-height:88px`.
11. **Journey rank names are white** on what becomes a light gradient. Fix: names, captions and pips take `var(--hero-text, #fff)` so they stay readable on the new sky-to-sand map.

Smaller: the move-list ends at line 646 (not 651); the yellow light's description differs between apps (data stays per app, untouched); the `LIGHT_META` lookup spreads every field already, so `titleInk` passes through with no extra code.

## Risks (shared core and skate)

- Every screen change ships to skate at the same time. Protection: slots with fallbacks equal to today's look, byte-identical core checked with `diff -r`, both suites run in both repos, screenshots in both apps.
- Skate `ink` on skate `mint`/`coral` passes only as large text (4.2–4.4): Done and Start stay ≥20px bold, enforced by the new size test.
- A new kid action that is not in the ungated list asks for the PIN (hotspot area). Protection: added to the list and asserted.
- Two fold-aways (blocks, move review) rely on remembered state; forgotten state would reset on each tap. Protection: assertions that the open state renders the content.
- Screenshots require a browser with network blocked (never the real Firebase). See the decision below.

## Tests expected to change

- `test/smoke.mjs` line 3504 (swim only): asserts the "Round 2 wasn't a full round…" note is on the finish screen. After PR 5 it is inside the collapsed "See every move" section, so the test's view-model gets the review-open flag set. Nothing else; all other listed strings, counts and actions are kept.

New shared tests (added, never weakened): size floor scan (kid screens: no inline font-size under 13px, buttons with min-height ≥56; grown-up ≥48); `openDetailAt` rows are buttons and the ⓘ is not; finish-screen order; Today phone order and fold; week table present in Analytics; quiz `why` never equals the answer; new actions ungated.

## Stages to finish

Each PR stage = branch from `main` in both repos, change, `npm test` in both, `diff -r core`, screenshots, records + regression table, push, PR ready for review in both repos, then stop for your merge.

1. **Claude** — opus-worker · Level: Complex — PR 1 tokens, slots, stylesheet fix, docs copy (both repos).
2. **You** — merge PR pair 1.
3. **Claude** — opus-worker · Complex — PR 2 Session screen + size-floor test.
4. **You** — merge PR pair 2.
5. **Claude** — opus-worker · Complex — PR 3 Body Check.
6. **You** — merge PR pair 3.
7. **Claude** — opus-worker · Complex — PR 4 Today.
8. **You** — merge PR pair 4.
9. **Claude** — opus-worker · Complex — PR 5 Finish screen and Quiz Deck.
10. **You** — merge PR pair 5.
11. **Claude** — opus-worker · Complex — PR 6 Progress and Grown-up.
12. **You** — merge PR pair 6.
13. **Claude** — final re-run of the size test and screenshots in both apps; manifest lists the locked items.
14. **You** — check on the iPad (no deploy stamp exists, so "live" is yours to confirm).

Every stage uses opus-worker because each PR touches shared core and the service worker (sonnet-worker may not edit the service worker). The main session plans, checks evidence, keeps records, and does not edit source.

## Success criteria

- Both suites green in both repos after every PR; `diff -r core` empty.
- PR 1 screenshots pixel-identical to the handoff's "now" shots.
- New size test green; after PR 6 no kid text under 13px, kid buttons ≥56 (Done 64), grown-up ≥48.
- "Let's go" on the first screen at all three sizes; finish screen shows mood then quiz above the fold on iPad.
- Manifest (`FEATURES.md`) lists: colour slots, Card A, portrait/phone order, phone fold, finish order, Progress table in both places.

## ❓ Decisions

- **Screenshots.** Recommended: a one-off Playwright install in the session's temp folder (outside both repos, never committed), serving each app from a local static server with all non-local requests blocked, at 1194×834, 834×1194 and 390×844 with touch emulation — exactly what the handoff did. Alternative: you take them on the iPad after each merge (slower, and PR 1's pixel check becomes approximate).

---

## Technical details

Baseline: swim `main@8de0bbe`, skate `main@3570e44` (core identical today). `sw.js` swim v23 → v24… , skate v19 → v20… (one bump per PR). Branch names `claude/splash-prN-slug` in each repo; PRs opened ready for review with `gh pr create`; approved plan copied to `plans/2026-09-30-plan-v1-splash-redesign.md` in PR 1.

### PR 1 — tokens, slots, docs (no visible change)
- Swim `css/tokens/colors.css`: `--text-on-aqua/-coral/-mint`, `--action-text`, `--go-text` → `var(--ink)`; delete `--border-card: var(--hairline)` (line 95); add `--border-card-color` and the 12 slots from `tokens-slots.css` (swim block).
- Skate `css/tokens/colors.css`: `--text-on-coral/-mint` → `var(--ink)`; `--text-on-aqua` stays white; delete `--border-card` (line 113); add `--border-card-color` and the skate slot block.
- Both `css/app.css` lines 50, 54, 55: `var(--action-deep)` → `var(--action-edge)`.
- Swim only: `docs/DESIGN.md` and `docs/mockups/Splash-mockups.html` from the handoff.
- Check: `.candy` unused; no screen reads `text-on-*`; screenshots identical.

### PR 2 — Session (`core/screens/session.js`, `core/vm/session.js`)
- `controls()` 568–613: `rowBtn` min-height 56 / 17px; Done 591 and explore Done 578 min-height 64, 20px 900, `color:var(--text-on-mint,#fff)`; STOP 593 `background:var(--btn-stop-bg,var(--stop));box-shadow:0 3px 0 var(--btn-stop-edge,var(--stop-ink))`; Keep going / Skip it 603–606 min-height 56; "◀ Back a move" 610 and 570 min-height 48, `color:var(--ink-soft)`; Skip narrow font 12 → 17.
- `exList` 615–646: row becomes a button element with `data-action="openDetailAt"`, the same `data-arg` (ci|ei) and `min-height:56px`; ⓘ 643 becomes a plain span with `aria-hidden="true"`; marks, `statusNote` and `secColor` unchanged; legend 627–628 `var(--ink-soft)` 13px; headers 630–632 use `-ink` shades via `BLOCK_COLORS` (vm 489: warmup `coral-ink`, main `sea-ink`, prep/recovery `grape-ink`; others already `-ink`); `PILL.current` (vm 549) `bg: var(--btn-primary-bg,var(--aqua))`, `ink: var(--btn-primary-text,#fff)`.
- Ring: add `RING_ZONE_INK` beside `RING_ZONE_COLOR` (line 10); label at 29 uses ink map (urgent `stop-ink`), 13px on all ring sizes; arc keeps colour. Rep ring 40–43: dose and labels `var(--grape-ink)`, hint 13px.
- `railToggle` 663–670: 48px. Estimate lines 723 and 758: `var(--ink-soft)`, 13px, text unchanged.
- New `core/test/design.mjs`: size-floor scan over session/today/readiness/progress/finish (kid) and grownup (adult) HTML; per-PR allowlist shrinks to empty by PR 6. Add to the runner's discovery (no `CORE_SHELL` change needed; tests aren't precached).

### PR 3 — Body Check
- `core/vm/readiness.js:189` `baseBtn` min-height 56, 17px; `core/screens/readiness.js:173–174` yes/no pair in a 2-column grid, full width.
- Title line 90: `color:${vm.light.titleInk || vm.light.color}`; `titleInk` added to `LIGHT_META` in both `js/data.js` (swim 1267–1270, skate 1292–1295): green `mint-ink`, yellow `sun-ink`, red `stop-ink`, recovery `grape-ink`.
- `LIGHT_META`: green `btnText: "var(--text-on-mint)"`, red `btnText: "var(--text-on-coral)"`, recovery `btnColor: "var(--btn-grape-bg)"`, `btnDeep: "var(--grape-ink)"`; `BODY_RESULTS` (swim 1274–1277, skate 1299–1302) severity 1 `ctaText: "var(--text-on-mint)"`, severity 3 `ctaText: "var(--text-on-coral)"`. Start button line 117: 24px, min-height 64 (`disabled` attribute kept exactly as is — a test forbids the word elsewhere).
- C4: after render on the result step, `root.querySelector("[data-body-result]")?.scrollIntoView(...)` in `core/main.js`, same pattern as `sessionListScrollIntoView`.
- C5: `summary` line 103 min-height 48; `lo.style` (vm 257–261) 48px, selected = `border:3px solid L.color; background:var(--surface); color: L.titleInk`.
- Hero panel: `linear-gradient(165deg,var(--hero-from,FROM) 0%,var(--hero-to,TO) 70%);color:var(--hero-text,#fff)` where FROM and TO are today's literal values copied as fallbacks.

### PR 4 — Today (`core/screens/today.js`, `core/vm/today.js`, `core/gate.js`, both `js/data.js`)
- Day card 364 and 393: `linear-gradient(165deg,var(--hero-from,var(--aqua-light)) 0%,var(--hero-to,var(--aqua)) 70%)`, `color:var(--hero-text,#fff)`; chips 157–164, focus box 177–181, block rows (`rowBg`, vm 467) → `var(--hero-chip, …)` with today's rgba value as the fallback; block button 218 min-height 56; `ctaButtonStyle` (vm 741) `color:var(--ink)`; `practiceBtnStyle` (vm 749) border/text `var(--hero-text,#fff)` (keeps `min-height:48px`).
- Journey 59–87, 114–147: gradient stops → `var(--hero-from,#0E4A73)`, `var(--hero-to,#1B7FAD)`, `var(--journey-via,#4FC3D9)`, `var(--journey-to,#F2D9A6)` (80% stop folded into `journey-to`); ellipse `#0A3E63` and header overlay 119/136 keep today's rgba as fallbacks; header text 120/137 `var(--hero-text,#fff)`; rank name/caption/pips (vm 151–221) `var(--hero-text,#fff)`; current rank name + "YOU ARE HERE" (vm 160–167) on a `rgba(255,255,255,0.6)` pill, text `ink` / `aqua-ink`; path, pips, ranks kept.
- Order: `todayWide` tight path (327–366) → greeting, day card, week + legend, stats, Quiz Deck, journey; `todayNarrow` (369–401) → greeting, day card, week, stats, Quiz Deck, journey.
- Phone fold: in `dayPane(vm,false)` a button `See the ${n} blocks ▾` / `Hide the blocks ▴`, `data-action="toggleBlocks"`, min-height 56; list rendered when `state.blocksOpen`; action added to `UNGATED_ACTIONS` (`core/gate.js:61`) and `actionNames`; wide always open, no button.
- Sizes: week strip 18/20 → 13px label, 15px date; `cellStyle` (vm 486) min-height 88; legend and stat labels 13px.
- K8: `"⚡ Full"` → `"⚡️ Full"` (swim `js/data.js:1229`, skate 1255); line 160 `emojiPresentation("⚡")` (import from `core/vm/today.js`).
- G2: chevron 47, 55 → `var(--grape-ink)`.

### PR 5 — Finish and Quiz Deck
- `completeScreen` 302–405 reordered as in correction 3; mood buttons ≥72px, quiz options ≥56px; new button `See every move ▾` (`data-action="toggleMoveReview"`, existing state at `core/main.js:583–584`, already ungated at `core/gate.js:73`); section (rendered when open) holds "Not done in full" (334–341, rows `ink-soft` with ⏭, no coral), "Redo these" (340: `btn-primary` slots, 56px), and `roundShortNotes` (328–331, unchanged in vm 337–349).
- Kid line above, when `roundShortNotes` is not empty: exactly "A few moves came in short — next time hold them all the way. 💪". Worker verifies Grown-up › Analytics rounds card already shows the exact counts; if not, the `roundShortNotes` lines are added there.
- `none` state 280–285 keeps title and note. "🏠 Back to Today" 405: `color:var(--ink)`, 18px 900, 56px.
- G1 `core/screens/overlays.js:85`: watch → `"Fix · " + move.fix`; fix → `"👀 Watch for · " + move.watch`; cue → the sport's transfer label + " · " + `move.transfer` (field added to the pool at `core/store.js:889–891`; label from the session detail overlay, `core/screens/session.js:215`); empty → `why: ""`, line hidden.
- Test change: `test/smoke.mjs:3504` sets the review-open flag on its VM.

### PR 6 — Progress and Grown-up
- `core/screens/progress.js`: export `weekTable`; 50/53/57/61/74/81/94/103 → ≥13px, `ink`/`ink-soft`; `PACE_CHIP` (40–46) → `-ink` shades; prizes column (117–130) stacks when `!isWide || tightColumn` (flag passed into the Progress VM from `core/main.js:251–253`).
- `core/screens/grownup.js` `analyticsTab` (250–544): render `weekTable` with the `analyticsWeek` rows (`core/vm/progress.js:233, 383`) — worker confirms they are the exact-count variant, else uses `weekDays`.
- A1: `tabStyle`/`scopeTabStyle` (`core/vm/grownup.js:104–107`), `progressScope` (`core/vm/progress.js:338`), `logScope` (265) → min-height 48, 15px. A2: analytics notes (subtitles 265…504, footnotes 261…524, micro labels 268…511) → `ink-soft`, 13px. A3: `libraryList` (vm 742–759) grouped by `ex.block` using `BLOCK_LABEL`; `libraryTab` 546–571 renders one native details element per block, the first one open, every move kept. A4: rungs 707 → 48px circles.

### Per-PR checks (both repos)
`npm test` (both TZs, runner-driven) · `diff -r core` · `node core/tools/release-check.mjs origin/main` · screenshots (decision above) · `WORKING_RECORD.md` ledger rows + `FEATURES.md` + regression table · PR link, ready for review.
