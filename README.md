# Splash — Swim Dryland Timer

A dryland strength & mobility training companion for a young competitive
swimmer, built on the **2026.2 plan** (Warm-up → Coordination → Main
[traffic-light rounds] → Finisher → Swim-Skill; Sunday = spa recovery) and
the **Splash — Kids Swim Training** design system.

## What's inside

- **Today** — week strip, Journey Map (XP → ocean ranks), day card with the
  full plan, GO button
- **Body Check** — 4-question readiness check with a tappable front/back body
  map; the traffic light sets main-set rounds (green 3 / yellow 2 / red 1 /
  recovery)
- **Session** — guided timer with a real speech coach (cues, counts, tempo
  reps), portrait form-photo slots, STOP rule overlay, clean/wobbly checks,
  mood + reflection on the complete screen
- **Progress** — streaks, prize wallet, milestones, training log, Ocean Story
- **Grown-up Zone** — Overview, Analytics (incl. ACWR + CSV export), Coaching
  (valgus gate, Independence Ladder, PR board, engagement systems), Move
  Library, Settings
- **Quiz Deck & Prize Draw** — questions generated from the plan's own
  cues/watch-outs/fixes; level-ups earn a prize envelope

## Running it

Static files, no build step — but the app uses ES modules, so serve over HTTP
(opening `index.html` from disk won't work):

```
python3 -m http.server 8080
# then open http://localhost:8080/
```

Any static host (e.g. GitHub Pages) works as-is.

## Data

- Everything the kid earns lives in `localStorage` (sessions, XP, prizes,
  quiz mastery, trackers) — nothing earned ever vanishes on reload.
- Completed sessions are also mirrored to Firebase Firestore when online
  (`js/firebase.js`); the app works fully offline.
- Workout content lives in `js/data.js` (`DAYS`). Progressive overload
  machinery is present but **paused** (`OVERLOAD_PAUSED` in `js/data.js`).

## Exercise photos

Photo slots are intentionally empty until real photos land in
`assets/exercises/` named `<slug>.jpg` (lowercase, non-alphanumerics → `-`,
e.g. `hollow-tuck-flutter.jpg`). Portrait ≥720×960 serves the in-session
view; the same file is cover-cropped for library cards.
