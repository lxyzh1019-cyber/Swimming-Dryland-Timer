# Why the kids' progress disappears — investigation

Scope: how XP, levels, prizes, streaks, week checkmarks and session history are
persisted, and every path by which they can be lost or appear lost.
Findings are ordered by how likely they are to be behind the complaint.

Verdict: the claim is real. There are **five ways data is genuinely destroyed
or never written**, and **two ways intact data is displayed as zero**. Nothing
in the app can restore any of it.

## Status

| # | Finding | Status |
|---|---|---|
| 1 | Cloud backup is write-only | **fixed** — `js/sync.js` restores on boot |
| 2 | Safari evicts localStorage after ~7 idle days | **mitigated** by the restore; the eviction itself is Safari's |
| 3 | Both kids share one store | **fixed** — one storage namespace per athlete, switchable in the Grown-up Zone |
| 4 | Failed writes are swallowed | **fixed** — retried after freeing analytics, then reported in the UI |
| 5 | Partials keyed to the calendar date | **fixed** — a partial also survives 6h, so one bout can cross midnight |
| 6 | Streak resets after a rest day | **fixed** — one freeze rule for every streak check |
| 7 | Ending early erases the day | **fixed** — counts as a day trained, shown as a softer ✓ |
| 8 | Minor (patch target, week boundary) | **fixed** — patches target their own record; the week is Edmonton's |

---

## 1. The cloud backup is write-only — nothing can ever be restored

`js/firebase.js` exports `fsGetRecent()` and `fsGetAll()`. Neither is called
anywhere in the codebase:

```
js/engine.js:14   import { fsAddSession } from "./firebase.js";
js/engine.js:677  if (settings.cloudMirror !== false) fsAddSession(entry)...
```

Only `fsAddSession` and `fsUpdateSession` are used. So completed sessions are
copied to Firestore and then never read back. There is also no JSON import —
the only export is a parent-facing CSV (`js/vm/grownup.js:430`), which is
one-way and doesn't include XP, prizes or quiz mastery.

Consequence: the instant `localStorage` is cleared for any reason, everything
the kid earned is gone from the app **while a full copy sits intact in
Firestore**. README's claim ("nothing earned ever vanishes") holds for reload
only, not for storage eviction.

This finding is what turns every item below from an annoyance into permanent
loss.

## 2. Safari deletes localStorage after 7 idle days

The app is a plain static site: no `manifest.json`, no service worker, no
`apple-mobile-web-app-capable`, and all state in `localStorage`
(`js/store.js:11-25`). Under Safari's ITP, script-writable storage for a site
with no first-party interaction in 7 days is deleted — the exact profile of a
kid who takes a week off. Same effect from "Clear History and Website Data",
Private tabs, and iOS storage pressure.

Related, same root cause: `localStorage` is per-origin **and per-browser**.
Opening the app in Safari one day and Chrome (or a different device, or an
in-app browser from a message) the next shows a blank slate, even though the
sessions exist in Firestore.

## 3. Both kids share one set of data

There is no profile namespace anywhere. `swim_sessions_v2`, `swim_journey_v1`
(XP/level/prizes), quiz mastery and the trackers are single global keys.
`athleteName` (`js/store.js:49`) is only a display label, and the Firestore
collection is hardcoded `jess_swimming_sessions` (`js/firebase.js:7`).

If Jenn and Jess use the same browser, they share one XP pool, one streak and
one prize wallet — each sees numbers she didn't earn, and neither sees a
correct picture of her own. To a kid this reads exactly as "my progress is
gone."

## 4. Failed writes are swallowed silently

```js
export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
```
`js/store.js:35-37`

`swim_sessions_v2` grows without a cap and each record embeds a `perExercise`
array; `swim_events_v1` holds up to 1500 events for 120 days. When the origin
hits its quota (Safari's budget is small), `saveSession()` fails, the empty
`catch` hides it, and the app still says "Training complete." The session is
never recorded — no XP, no checkmark, no log entry.

## 5. Partial sessions are keyed to the calendar date

`dayProgressKey()` appends `todayISODate()`, and `saveDayProgress()` deletes
every key that isn't today's (`js/store.js:187-198`). A session started before
midnight and resumed after it loses the blocks already finished. Partly
intentional (the "No-Debt" rule), but the kid experiences finished work
vanishing.

---

## Displayed as lost, though the data is fine

### 6. The streak resets after a rest day, despite the freeze rule

`currentStreak()` (`js/store.js:125-146`) forgives internal gaps of 1–2 days,
but bails out unless the **most recent** session is today or yesterday. The two
rules contradict each other. Verified against the real function:

| history | today | streak shown |
|---|---|---|
| sessions 5, 3 and 1 days ago | — | **3** |
| sessions 6, 4 and 2 days ago | — | **0** |

So a Mon/Wed/Fri kid sees 🔥3 on Saturday and 🔥0 on Sunday. The freeze exists
precisely to stop this ("would otherwise pressure a kid to train while sore"),
and the anchor check undoes it. This is the most-watched number in the app and
the most likely single trigger for the complaint.

Also `longestStreak()` (`js/store.js:112`) applies no freeze at all — it needs
exact 1-day gaps — so "best" can read **1** while "current" reads **3** on the
same history.

### 7. Ending a session early erases the day

`finalize()` tells the kid progress is saved and awards half XP, but writes
`completedFully: false` (`js/engine.js:635`). Both screens filter on it:

- `js/vm/today.js:41` — no ✓ on the week strip; a past day renders as **missed**
- `js/vm/today.js:208`, `js/vm/progress.js:99` — excluded from the streak

A kid who does 80% of the workout gets a congratulation, then finds an empty
day and a broken streak. (The pre-rewrite app used `completedFully !== false`,
i.e. it counted anything not explicitly aborted — the rewrite tightened this to
truthy, so any record lacking the field is now dropped too.)

### 8. Minor

- `patchLastSession()` (`js/store.js:94`) patches the last array element, not
  the session that just ended — mood/reflection lands on the wrong record if
  another session finishes in between (realistic with two kids on one device).
- `thisWeekSessions()` (`js/store.js:100`) uses device-local `mondayOfThisWeek()`
  and raw `new Date(s.isoDate)`, while every other grouping goes through
  `edmontonISO()` — week boundaries can disagree by a day when travelling.

---

### Notes on the profile fix

The first athlete keeps the bare storage keys (`swim_sessions_v2`, …), so
nothing already on a device moves or is orphaned; each additional athlete gets
`<key>::<profileId>`. Switching reloads the page — module-level caches
(`settings`, the session engine) would otherwise still hold the previous kid's
data. The cloud mirror stays one shared collection, tagged per athlete; two
profiles given the *same* name would share restored records.

## Recommended fixes, in order

1. **Restore on boot.** Call `fsGetAll()` at startup and merge into
   `swim_sessions_v2` (dedupe on `isoDate` + `dayKey`), then re-derive XP.
   This alone converts findings 1, 2 and 4 from permanent loss to a hiccup.
2. **Mirror the journey too.** XP, level, prizes and pending draws are only
   local; sessions alone can't rebuild redeemed prizes.
3. **Per-kid profile id** in every storage key and as a Firestore field, chosen
   once and switchable in the Grown-up Zone.
4. **Fix the streak anchor** to honour the same 1–2 day freeze as the internal
   gap check, and give `longestStreak()` the same rule.
5. **Count ended-early sessions as a day trained** (or render a distinct
   "partial ✓") so the promise on the complete screen matches the week strip.
6. **Surface write failures** instead of `catch {}` — cap/trim the session log
   and tell the parent when a save fails.
7. **JSON export/import** in the Grown-up Zone as a manual escape hatch.
