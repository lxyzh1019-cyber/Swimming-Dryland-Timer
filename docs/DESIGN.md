# Splash

**Splash — Kids Swim Training.** A bright, friendly design that is **cute on top and strict underneath**. It is for a dryland (land-based) strength and mobility timer used by a young competitive swimmer (Jess, about 11), mostly on an **iPad held landscape**.

> **Brand promise:** *Make a kid want to show up every day — and do it right.*

**Sources, merged 2026-09-30**

- **Values:** the live app, `lxyzh1019-cyber/swimming-dryland-timer` at `main@8de0bbe` (`css/tokens/*`, self-hosted fonts, `assets/`).
- **Components, guideline cards, voice:** the Claude Design project "Splash — Kids Swim Training".

The two had identical token files. Where they disagreed, the decisions are listed under **Decisions**. The app's screens live in `core/` and are shared with the Figure-Skate Dryland Timer, so **a screen change here changes both apps**.

## Content fundamentals

**Who's talking:** a warm, upbeat coach speaking **directly to the kid** in the second person, and by name for big moments. *"You're doing great. Every rep counts — proud of you."* Coaches and parents are "a grown-up".

**Three encouragement registers.** Rotate them; don't overuse one.

- **Encouraging:** *"One round at a time. You've got this."*
- **Fun:** *"Boom. That was awesome!" "Level up unlocked!"*
- **Calm and steady:** *"Clean round. Stay steady."*

**Strict on quality — never drop it**

- Quality over quantity: *"Better reps, not more reps."*
- Clear faults and fixes: *"Knees cave inward → stop, reset stance, slower." "One swing = set over."*
- The hard safety rule, stated plainly: *"Sharp pain, pinching, or numbness means STOP. Always stop and tell a grown-up."*

**No shame**

- A missed day is a yellow ↺ "catch up", never a red ✕.
- A stopped session still pays for the rounds she trained.
- A finished round never looks like a failure.

**Mechanics**

- Sentence case. ALL-CAPS only for badges and labels (MON, WARM-UP) and for one stressed word in a cue (*"Shoulders sink first, THEN bend"*).
- Short: one idea per line. Cues are one imperative sentence.
- Doses read naturally: *"2–3 clean reps", "30s", "8/side"*.
- Mantras use the handwriting voice: *"I am STRONG. I am SMOOTH. I can SWIM THIS."*
- Emoji: one per line, at the end, for punch. Don't spray them through body copy.
- Text in another language (for example Chinese) stays exactly where it is. Never remove, move or reword it.

## Visual foundations

**Vibe:** a sunny pool on a bright morning. Clean, rounded, chunky and bouncy, like soft toys and pool floats, but never babyish.

**Colour families.** Each family has wash / light / base / deep / ink shades.

| Family | Means | Use |
|---|---|---|
| `aqua` | the pool, primary brand | work-zone ring, active nav, primary action |
| `sea` | deep water | focus ring, depth accents |
| `coral` | GO, energy | start buttons, "watch out" callouts |
| `sun` | rewards, warm-up, caution | stars, today, pause, yellow light |
| `mint` | success, rest | Done, clean rep, green light, rest ring |
| `grape` | learning, evening, recovery | quiz, rep ring, recovery light |
| `gum` | playful | side switches |
| `stop` | red flag | STOP, pain rule, urgent ring |

Surfaces: pool water `bg` (#E2F8FE; the Claude Design readme's #EAF7FB was a typo) with white `surface` cards. Ink is navy `ink`, never black.

**Type**

- **Fredoka** (`font-display`): titles, timers, big numbers.
- **Nunito** (`font-ui`, 700–900): UI, body and buttons.
- **Caveat** (`font-hand`): **only** the coach's voice (mantras, encouragement). Never instructions or numbers.
- The fonts are **self-hosted** variable woff2 files, so they work offline. Claude Design used the Google Fonts CDN.

**Shape and depth**

- Corners: `radius-sm` 10 · `radius-md` 16 · `radius-lg` 22 (default card) · `radius-xl` 30 · `radius-pill`.
- Mostly borderless; depth comes from soft navy shadows (`shadow-soft`, `shadow-lift`, `shadow-pop`, `shadow-inset`). Where a border helps, it is a chunky 3px (`border-card`) in `border-card-color`.
- **Candy buttons** have a solid bottom edge in the colour's `-deep` shade (`edge-depth` 4px). Hover lifts 2px; press sinks onto the edge (`edge-press`).

**Motion:** gentle and springy. Ease-bounce for taps and pops, ease-out for everything else, 140 / 240 / 420ms. Mascots bob; rewards pop. Everything is off under reduced motion. The urgent-ring keyframe is named `pulse-ring` (the app's fix; Claude Design called it `splash-pulse-ring`, which nothing played).

**Imagery:** hand-painted watercolour, cool aqua and teal with warm coral and yellow pops, on transparent backgrounds. It is decorative (`aria-hidden`), never behind text. The **Illustrations** group (banner, gear, waves) is kept for the redesign. The app does not show it yet.

## Contrast rules (approved 2026-09-30)

1. **Buttons stay bright.** Text on `aqua`, `coral`, `mint` and `sun` is dark: `ink` (4.7–5.5:1), or `sun-ink` on sun. White text on those fills is not allowed (1.6–2.6:1).
2. **STOP, grape and Go/Done buttons** keep white text on the darker fill: `stop-deep` (5.0:1), `grape-deep` (5.4:1) and `mint-ink` (6.6:1; skate 6.4:1).
3. **Coloured words** (light titles, ring zone labels, doses) use the family's **`-ink`** shade. The bright colour is only for borders, dots, arcs and fills.
4. `ink-faint` and `hairline` are for lines, borders and disabled states only. They are never text.
5. Every text/surface pair is at least 4.5:1, or 3:1 for text 24px+ (or 19px+ bold). Controls and focus rings are at least 3:1.

The live components already follow rules 1–3; each changed component's guide says what changed.

### Colour slots (approved 2026-09-30)

The screens are shared with the Figure-Skate app (rose palette under the same token names). So the screens never pick these colours directly. They read **slots**, and each app fills them. The code always gives a fallback equal to today's look (e.g. `var(--hero-text, #fff)`), so the apps can be updated in any order.

| Slot | What it paints | Swim | Skate |
|---|---|---|---|
| `hero-from` → `hero-to` | Today day card, Body Check panel (gradient 165°, 0 → 70%) | `aqua-light` → `aqua` | #EAA7B8 → #E698AC |
| `hero-text` | text on the hero | `ink` (4.9–7.9) | `ink` (4.8–5.4) |
| `hero-chip` | chips / block rows on the hero | rgba(255,255,255,.55) | same |
| `journey-via`, `journey-to` | journey map below the hero colours (sky → sand) | #9fe6f3, #f6e7c1 | #F7D3DC, #FBEBD6 |
| `btn-primary-bg` / `-edge` / `-text` | current-move marker, Redo, primary actions | `aqua` / `aqua-deep` / `ink` | `aqua-deep` / `aqua-ink` / #fff (5.7) |
| `text-on-mint`, `text-on-coral`, `text-on-aqua` | text on those fills | `ink` | mint/coral: `ink` (large text only); aqua: #fff |
| `btn-stop-bg` / `-edge` | STOP | `stop-deep` / `stop-ink` | same (5.4) |
| `btn-grape-bg` | grape buttons | `grape-deep` (5.4) | `grape-ink` (8.7) |
| `btn-go-bg` | Go / Done, Keep going | `mint-ink` | `mint-ink` |
| `btn-go-text` | text on btn-go-bg | #fff (6.6) | #fff (6.4) |
| `btn-go-edge` | Go / Done 3D edge | #04342C | #0F3F2F |

Start stays **20px+ bold** in both apps: skate's `ink` on `mint` is 4.4, which passes only as large text. Done/Go is white on `mint-ink` (6.6 / 6.4), so it has no size caveat.

**Card A · Sunny pool** is the chosen Today look: the bright aqua kept, the darkest end of the old gradient dropped, dark navy text. The journey block matches it: the same bright aqua fading to sand, with navy text and the "You are here" label on a white pill.

## Layout rules

**Canvas.** iPad landscape first (1194×834, iPad Pro 11"), then iPad portrait (834×1194), then phone. Use the app's breakpoints (`core/layout.js`):

- Wide: landscape ≥ 900px, or upright tablet ≥ 740 × 1000.
- Tablet proportions: under 1100px.
- Page max width: 1242px, 18px padding; the shell card uses `radius-xl`.

**Spacing.** Use `space-*` steps only. The most-used gaps are 8, 12 and 16px (`space-2`, `space-3`, `space-4`); cards pad 24px (`space-6`). Snap stray values to the nearest step.

**Corners.** Snap 8–12 to `radius-sm`, 14–18 to `radius-md`, 20–26 to `radius-lg` and 30 to `radius-xl`. Tiny bars (3px) stay as they are.

**Tap size.** Kid screens use `tap-min` (56px). Grown-up screens can go down to 48px. Never go below 48.

**Text size.** Kid-screen body is 17px (`fs-base`). Kid labels are at least 13px (`fs-xs`). Grown-up screens are at least 13px. Nothing smaller.

**Session screen** (decided 2026-09-30 — the app's layout wins):

- **Move list on the LEFT** (32%; 38% on a tight iPad column). The kid can hide it with no PIN.
- **Timer and controls on the RIGHT** (68%).
- The timer ring is the biggest thing on screen.
- Done is the one big full-width action (64px, 20px bold). STOP, Pause and Skip sit in a row under it (56px each).
- Each move-list row is one 56px tap target (it opens the detail); the ⓘ is only a picture.
- The ring's zone label uses the zone's `-ink` shade; the arc keeps the bright colour.

**Body Check** (decided 2026-09-30): **4 questions**, then the light, then one start button in the light's colour. The grown-up override sits under 🔒. Red always routes to rest and "tell a grown-up".

**Today** (decided 2026-09-30):

- Landscape: the week, stats, Quiz Deck and journey on the left; the day card on the right.
- Portrait and phone: greeting, then the **day card first**, then the week, stats and journey.
- Block rows are 56px.
- On phone, the blocks fold into one "See the N blocks ▾" row, so "Let's go" is on the first screen. iPad keeps them open.

**Finish screen** (decided 2026-09-30):

- Order: pose and title, then one line (streak and XP), then **"How did it feel?"**, then **Coach's Quiz**, then one kid line, then "See every move ▾" and "🏠 Back to Today".
- Exact counts ("Glute Bridge March was 4 of 16 reps") and the per-move list sit behind "See every move" and in the Grown-up Zone, never on top.
- A session where everything was skipped shows one friendly line, not a list of red "skipped" rows.

**Progress** (decided 2026-09-30): the week table (Planned, Times done, Moves, Main rounds, Pace) shows in **both** the kid's Progress and Grown-up › Analytics. This is the one allowed exception to "no raw counts on kid screens". On Progress it must be readable: 13px minimum, `ink` / `ink-soft` text, and prizes stacked under the table below 900px.

**Emoji:** a legacy symbol (below U+1F000, e.g. ⚡, ☀, ✈) needs the colour selector U+FE0F, or it can draw as a plain glyph in the text colour. Use `emojiPresentation()` (core/vm/today.js) or write `⚡️`.

**Kids' screens**

- The main task sits above the fold.
- No adult rules, formulas or raw counts, and no code names.
- An answer is shown once.
- A finished round never looks like failure.
- Choices look tappable (candy edge or a 3px outline).
- The big title is on the start screen only.
- Save status is one icon.

**Grown-up screens**

- Reading comes before admin.
- Tabs are grouped by job.
- Destructive actions sit apart, in `stop-deep`.
- Put a one-line explanation under each button.
- No kid colours on buttons.

## Iconography

- The brand is **emoji-forward** by design.
  - Celebration: ⭐ 🎉 💪 🏊 ✨ 🥳 🏅.
  - Status: 🔥 streak · 🌊 swim transfer · 🔴 stop · 👀 watch · ✓ done · 🌙 rest · ⚡ coordination.
- State glyphs: ✓ done · ½ short · ⏭ skipped · ▶ current · ↺ catch up.
- If a vector icon set is ever added, use a rounded, bold or filled style. Never thin or sharp outlines.
- **Mascot:** Marli, the leaping marlin, with 8 poses (Mascot group). **Body map:** the swimmer front, back and face (Body map group). Use them as images; never redraw them.
- The app icon is `Logos/icon-512.png`.

## Components

- **Live** (from Claude Design, `window.SplashKidsSwimTrainingDesignSystem_03dc6e`):
  - Core: Button, IconButton, Badge, Chip, Card.
  - Training: DayTab, TimerRing, ExerciseCard, ReadinessLight, QuizOption, MascotBubble, StatBadge, ProgressBar.
- **As built today** (static copies of the app, no live component yet): SessionControls, RepRing, Navigation, WeekStrip.

The live app does not use the React components. Its screens are template strings in `core/screens/*.js`. The components are the design target; the PRs bring the screens in line with them.

## Decisions (2026-09-30)

| Topic | App | Claude Design | Chosen |
|---|---|---|---|
| Session layout | list left 32% / timer right 68% | timer left 58% / list right 42% | **App** |
| Body Check | 4 questions | 8 questions | **App (4)** |
| Components | inline markup | 13 live components | **Claude Design live + 4 as-built** |
| Watercolour art | not used | brand illustrations | **Keep in both; decide after mockups** |
| Button text | white | white | **ink on bright fills; -deep fills for stop and grape** |
| Fonts | self-hosted | Google CDN | **self-hosted** |
| `--bg` | #E2F8FE | readme said #EAF7FB | **#E2F8FE** |
| Today day card | white on aqua gradient (1.5–3.6) | — | **Card A · Sunny pool** (bright aqua, navy text) |
| Journey block | dark night-blue, white text | — | **matches Card A** |
| Portrait Today | map first | — | **day card first** |
| Phone Today | blocks open | — | **blocks folded** |
| Finish order | summary first | — | **mood → quiz → one line → details** |
| Progress table | kid screen only | — | **kid Progress and Grown-up Analytics** |
| Skate app | shares the screens | — | **all changes apply to both; skate colours via slots** |

## Not synced

- **Claude Design layout cards** (iPad canvas, screen map, session anatomy, traffic-light), the **timer UI kit** and the original readme and token files: kept under `archived/claude-design/` for reference only. They show the 58/42 session layout and the 8-question check, which were not chosen.
- **Not brought over:** `_source/original-app.html` (the old single-file app), the Training Day template, pasted uploads, and the screenshot.
- **Motion tokens** (`ease-*`, `dur-*`) and keyframes: the format has no motion family, so they are described above.
- **Type-role shorthands** (`--type-timer` …) are kept as text styles, not as variables.
- **Exercise photos** (53, `assets/exercises/`): content, not brand.
- **PNG copies** of the mascot and body map: webp only.
- **Hex values in the app's screens:** most are fallbacks inside `var()` (harmless). The journey-map gradient literals (`core/screens/today.js:64–80`) become the `hero-*` / `journey-*` slots in the PR plan.

---

# Tokens

Source of truth for values: each app's `css/tokens/*.css`. New and changed slots: `tokens-slots.css`.

## Colour (swim)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#143b4a` | Primary text on bg and surface (10.9:1 on bg). |
| `--ink-soft` | `#4a6b78` | Secondary text and captions (5.7:1 on surface). |
| `--ink-faint` | `#8aa6b0` | Lines, borders and disabled states only — never text (2.6:1 on surface). |
| `--aqua-wash` | `#dff7fe` | Tinted surfaces and fills; ground for aqua-ink text. |
| `--aqua-light` | `#6fe3f5` | Active-nav inset ring, light aqua accents. |
| `--aqua` | `#06b6d4` | Primary brand — vivid ocean cyan. Fills and arcs, not text. Text on it: ink (4.9:1). |
| `--aqua-deep` | `#0593ae` | Primary pressed / 3D candy edge. |
| `--aqua-ink` | `#065f73` | Text on light aqua (6.5:1 on aqua-wash). |
| `--sea-wash` | `#d6edfb` | Sea badge ground. |
| `--sea-light` | `#7cc4f2` | Light deep-water accent. |
| `--sea` | `#2393e0` | Deep-water blue; keyboard focus ring. |
| `--sea-deep` | `#1570c0` | Sea pressed / edge. |
| `--sea-ink` | `#0c4a86` | Text on sea-wash. |
| `--coral-wash` | `#ffede6` | Soft coral ground. |
| `--coral-light` | `#ffb59e` | Light coral accent. |
| `--coral` | `#ff7a59` | Energy, the GO / action warm. Text on it: ink (4.7:1). |
| `--coral-deep` | `#e5532f` | Coral pressed / 3D edge. |
| `--coral-ink` | `#a8330f` | Text on coral-wash. |
| `--sun-wash` | `#fff4d6` | Rewards ground; pause and warning banners (sun-ink text 5.2:1). |
| `--sun-light` | `#ffde8a` | Light sunshine highlight. |
| `--sun` | `#ffc23d` | Rewards, stars, highlights; warm-up ring. Text on it: sun-ink or ink. |
| `--sun-deep` | `#e8a015` | Sun pressed / 3D edge; Pause button border. |
| `--sun-ink` | `#8a5e00` | Text on sun-wash and on sun (3.5:1 on sun: large text only). |
| `--mint-wash` | `#dff7ec` | Success ground; Resume button. |
| `--mint-light` | `#a6eccc` | Light success accent. |
| `--mint` | `#2fc78c` | Success, clean rep, green light; Done button; rest ring. Text on it: ink (5.5:1). |
| `--mint-deep` | `#18a372` | Mint pressed / 3D edge. |
| `--mint-ink` | `#0b6a47` | Text on mint-wash (5.9:1). |
| `--grape-wash` | `#ece6fd` | Rep-ring ground; learning / quiz surfaces. |
| `--grape-light` | `#c9bcf5` | Light grape accent. |
| `--grape` | `#8b7ce8` | Learning, quizzes, evening sessions; rep ring border; recovery light. |
| `--grape-deep` | `#6a57d4` | Grape button fill with white text (5.4:1); rep-ring labels. |
| `--grape-ink` | `#46329c` | Text on grape-wash (7.9:1). |
| `--gum-wash` | `#ffe7f0` | Playful pink ground. |
| `--gum-light` | `#ffb9d2` | Light pink accent. |
| `--gum` | `#ff82ae` | Playful pink accents, side-switches. |
| `--gum-deep` | `#ed5a8c` | Gum pressed / edge. |
| `--gum-ink` | `#b02560` | Text on gum-wash. |
| `--stop-wash` | `#ffe2e0` | Red-flag ground. |
| `--stop-light` | `#ffa9a5` | Light stop accent. |
| `--stop` | `#f0544f` | Red flags, pain rule, urgent ring. Buttons with white text use stop-deep instead. |
| `--stop-deep` | `#d1322c` | STOP button fill with white text (5.0:1). |
| `--stop-ink` | `#8e1b17` | Text on stop-wash (7.4:1); STOP button edge. |
| `--bg` | `#e2f8fe` | App background — bright pool water. |
| `--bg-deep` | `#bfedfa` | Lower wash behind cards — deeper water. |
| `--surface` | `#ffffff` | Card surface. |
| `--surface-2` | `#f1fbfe` | Nested / inset surface; timer ring track. |
| `--hairline` | `#d2eaf2` | Subtle borders and dividers (not a text colour). |
| `--text-strong` | `{ink}` | Headings. |
| `--text-body` | `{ink}` | Body text. |
| `--text-muted` | `{ink-soft}` | Secondary text. |
| `--text-faint` | `{ink-faint}` | Do not use for text (inherits ink-faint). |
| `--text-on-aqua` | `{ink}` | Text on aqua — ink, 4.9:1 (was white, 2.4:1; changed 2026-09-30). |
| `--text-on-coral` | `{ink}` | Text on coral — ink, 4.7:1 (was white, 2.6:1). |
| `--text-on-sun` | `{sun-ink}` | Text on sun (3.5:1, large only). |
| `--text-on-mint` | `{ink}` | Text on mint — ink, 5.5:1 (was white, 2.2:1). |
| `--text-on-grape` | `#ffffff` | White text — only on grape-deep (5.4:1). On grape it fails (3.4:1). |
| `--surface-app` | `{bg}` | App background. |
| `--surface-card` | `{surface}` | Cards. |
| `--surface-inset` | `{surface-2}` | Inset panels. |
| `--action-bg` | `{aqua}` | Primary action (aqua candy button). |
| `--action-edge` | `{aqua-deep}` | Primary action 3D edge. |
| `--action-text` | `{ink}` | Primary action text — ink on action-bg, 4.9:1. |
| `--go-bg` | `{coral}` | GO / start (coral). |
| `--go-edge` | `{coral-deep}` | GO 3D edge. |
| `--go-text` | `{ink}` | GO text — ink on go-bg, 4.7:1. |
| `--reward-bg` | `{sun}` | Reward / star (sunshine). |
| `--reward-edge` | `{sun-deep}` | Reward 3D edge. |
| `--reward-text` | `{sun-ink}` | Reward text (3.5:1 on reward-bg, large only). |
| `--light-go` | `{mint}` | Readiness green — feel great. |
| `--light-careful` | `{sun}` | Readiness yellow — go easy. |
| `--light-stop` | `{stop}` | Readiness red — rest / tell a grown-up. |
| `--light-recovery` | `{grape}` | Readiness recovery / spa day. |
| `--quality-good` | `{mint}` | Clean rep. |
| `--quality-watch` | `{coral}` | Form watch-out. |
| `--quality-stop` | `{stop}` | Hard stop / pain rule. |
| `--border-card-color` | `{hairline}` | Card outline colour. Renamed from the colour --border-card, which spacing.css overrode with 3px. |
| `--hero-from` | `{aqua-light}` | Hero gradient start (Today day card, Body Check panel). Skate: #EAA7B8. |
| `--hero-to` | `{aqua}` | Hero gradient end, at 70%. Skate: #E698AC. |
| `--hero-text` | `{ink}` | Text on the hero: 4.9–7.9. Skate: ink, 4.8–5.4. |
| `--hero-chip` | `rgba(255, 255, 255, 0.55)` | Chips and block rows on the hero. |
| `--journey-via` | `#9fe6f3` | Journey map sky below the hero colours. Skate: #F7D3DC. |
| `--journey-to` | `#f6e7c1` | Journey map sand at the bottom. Skate: #FBEBD6. |
| `--btn-primary-bg` | `{aqua}` | Primary button / current-move marker fill. Skate: aqua-deep. |
| `--btn-primary-edge` | `{aqua-deep}` | Primary button 3D edge. Skate: aqua-ink. |
| `--btn-primary-text` | `{ink}` | Text on btn-primary-bg (4.9). Skate: #ffffff (5.7). |
| `--btn-stop-bg` | `{stop-deep}` | STOP button fill, white text 5.0 (skate 5.4). |
| `--btn-stop-edge` | `{stop-ink}` | STOP button edge. |
| `--btn-grape-bg` | `{grape-deep}` | Grape button fill, white text 5.4. Skate: grape-ink (8.7). |
| `--btn-go-bg` | `{mint-ink}` | Go / Done and Keep going fill. Skate: mint-ink (#1C6B50). |
| `--btn-go-text` | `#ffffff` | Text on btn-go-bg (6.6). Skate: #ffffff (6.4). |
| `--btn-go-edge` | `#04342c` | Go / Done 3D edge. Skate: #0F3F2F. |

## Spacing

| Token | Value | Use |
|---|---|---|
| `--space-1` | `0.25rem` | 4px. |
| `--space-2` | `0.5rem` | 8px — the most-used gap in the screens. |
| `--space-3` | `0.75rem` | 12px. |
| `--space-4` | `1rem` | 16px. |
| `--space-5` | `1.25rem` | 20px. |
| `--space-6` | `1.5rem` | 24px — card padding. |
| `--space-8` | `2rem` | 32px. |
| `--space-10` | `2.5rem` | 40px. |
| `--space-12` | `3rem` | 48px. |
| `--tap-min` | `56px` | Touch target — kid-sized, never below 56. |
| `--edge-depth` | `4px` | Candy-button bottom edge at rest. |
| `--edge-press` | `2px` | Candy-button edge when pressed. |

## Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `10px` | Small chips, inset notes. |
| `--radius-md` | `16px` | Session buttons, week-strip cells. |
| `--radius-lg` | `22px` | Default card. |
| `--radius-xl` | `30px` | Hero panels, the shell card. |
| `--radius-pill` | `999px` | Candy buttons, badges, stat chips. |

## Border

| Token | Value | Use |
|---|---|---|
| `--border-thin` | `2px` | Chip and control outlines. |
| `--border-card` | `3px` | Card outline. Note: colors.css also defines --border-card as a colour alias; spacing.css loads later and wins, so the colour alias is dead. |

## Shadow

| Token | Value | Use |
|---|---|---|
| `--shadow-soft` | `0 6px 18px rgba(20, 59, 74, 0.10)` | Resting card. |
| `--shadow-lift` | `0 14px 30px rgba(20, 59, 74, 0.16)` | Hover / raised; readiness result card. |
| `--shadow-pop` | `0 18px 44px rgba(20, 59, 74, 0.20)` | Modal / mascot. |
| `--shadow-inset` | `inset 0 2px 6px rgba(20, 59, 74, 0.08)` | Inset wells. |

## Type

| Style | Family | Size | Line height | Weight | Use |
|---|---|---|---|---|---|
| timer | display | 3.25rem | 1.05 | 700 | --type-timer: hero timer, big numbers. (The session ring actually renders 600 at clamp(44px, 6.5vw, 76px).) |
| title | display | 2.5rem | 1.2 | 600 | --type-title: screen titles. |
| heading | display | 2rem | 1.2 | 600 | --type-heading: section headings. |
| card | display | 1.5rem | 1.2 | 600 | --type-card: card titles, exercise name. |
| body | ui | 1.0625rem | 1.5 | 700 | --type-body: body — 17px is the kid-readable minimum on screen. |
| label | ui | 0.9375rem | 1 | 900 | --type-label: labels and chips. |
| coach | hand | 1.25rem | 1.35 | 700 | --type-coach: the coach’s encouraging voice, mantras. |
| fs-3xl | display | 3.25rem | 1.05 | 700 | 52px — hero timer / big number. |
| fs-2xl | display | 2.5rem | 1.2 | 600 | 40px — screen titles. |
| fs-xl | display | 2rem | 1.2 | 600 | 32px — section headings. |
| fs-lg | display | 1.5rem | 1.2 | 600 | 24px — card titles, exercise name. |
| fs-md | ui | 1.25rem | 1.5 | 700 | 20px — emphasised body. |
| fs-base | ui | 1.0625rem | 1.5 | 700 | 17px — body (kid-readable minimum). |
| fs-sm | ui | 0.9375rem | 1.5 | 700 | 15px — captions. |
| fs-xs | ui | 0.8125rem | 1.5 | 800 | 13px — tiny labels, use sparingly. |

Fonts: Fredoka (display), Nunito (ui), Caveat (hand) — self-hosted variable woff2 in `assets/fonts/`.


## tokens-slots.css

```css
/* ============================================================
   PR 1 token changes — paste into each app's css/tokens/colors.css,
   inside :root, in the SEMANTIC ALIASES section. Values only; no rules.
   Screens read these with a fallback equal to today's look, e.g.
   var(--hero-text, #fff), so the two repos can merge in any order.
   ============================================================ */

/* ---------- swimming-dryland-timer (Splash, aqua palette) ---------- */
:root {
  /* changed (were #FFFFFF — 2.2–2.6:1 on the bright fills) */
  --text-on-aqua:   var(--ink);      /* 4.9 */
  --text-on-coral:  var(--ink);      /* 4.7 */
  --text-on-mint:   var(--ink);      /* 5.5 */
  --action-text:    var(--ink);
  --go-text:        var(--ink);

  /* renamed: the colour alias --border-card was dead (spacing.css's 3px wins) */
  /* DELETE  --border-card: var(--hairline);   from colors.css */
  --border-card-color: var(--hairline);

  /* new slots */
  --hero-from:        var(--aqua-light);          /* Card A · Sunny pool */
  --hero-to:          var(--aqua);
  --hero-text:        var(--ink);                 /* 4.9–7.9 */
  --hero-chip:        rgba(255, 255, 255, 0.55);
  --journey-via:      #9FE6F3;
  --journey-to:       #F6E7C1;
  --btn-primary-bg:   var(--aqua);
  --btn-primary-edge: var(--aqua-deep);
  --btn-primary-text: var(--ink);                 /* 4.9 */
  --btn-stop-bg:      var(--stop-deep);           /* white 5.0 */
  --btn-stop-edge:    var(--stop-ink);
  --btn-grape-bg:     var(--grape-deep);          /* white 5.4 */
  --btn-go-bg:        var(--mint-ink);             /* Go / Done: white 6.6 (added PR 2, plan v3) */
  --btn-go-edge:      #04342C;
  --btn-go-text:      #FFFFFF;
}

/* ---------- Figure-Skate-Dryland-Timer (rose palette) ---------- */
:root {
  /* changed */
  --text-on-coral:  var(--ink);      /* 4.2 — large text only (buttons are 20px+ bold) */
  --text-on-mint:   var(--ink);      /* 4.4 — large text only (Done/Start 20–24px bold) */
  /* --text-on-aqua stays #FFFFFF (ink would be 2.5 on skate aqua) */

  /* renamed */
  /* DELETE  --border-card: var(--hairline);   from colors.css (line 113) */
  --border-card-color: var(--hairline);

  /* new slots */
  --hero-from:        #EAA7B8;                    /* = skate aqua-light */
  --hero-to:          #E698AC;
  --hero-text:        var(--ink);                 /* 4.8–5.4 */
  --hero-chip:        rgba(255, 255, 255, 0.55);
  --journey-via:      #F7D3DC;
  --journey-to:       #FBEBD6;
  --btn-primary-bg:   var(--aqua-deep);
  --btn-primary-edge: var(--aqua-ink);
  --btn-primary-text: #FFFFFF;                    /* 5.7 */
  --btn-stop-bg:      var(--stop-deep);           /* white 5.4 */
  --btn-stop-edge:    var(--stop-ink);
  --btn-grape-bg:     var(--grape-ink);           /* white 8.7 */
  --btn-go-bg:        var(--mint-ink);             /* Go / Done: white 6.4 */
  --btn-go-edge:      #0F3F2F;
  --btn-go-text:      #FFFFFF;
}
```
