/* THE SIZE FLOOR — what docs/DESIGN.md promises, checked on the real screens.

   Kid screens: no inline text under 13px, and every sized button at least
   56px tall (Done 64). Grown-up screens: every sized button at least 48px.
   The screens are rendered from their real view-models and their inline
   styles are read back, so a later edit that shrinks a control fails here
   instead of on a kid's iPad.

   A button with no min-height at all (a chip, an icon) is LISTED, not failed:
   its height comes from padding and is checked by screenshot.

   The splash redesign lands in six PRs. Screens a PR has not reached yet still
   carry their old sizes, so ALLOW below names every one of them, per screen.
   Each later PR deletes its own entries; when the redesign is done ALLOW is
   empty. The session screen and the journey map (PR 2) have no entries and
   must never get one. Today (PR 4) has none either. */
import { engine, store, data, tvm, gvm, gscreen, rvm, rscreen, pvm, pscreen, svm, sscreen, tscreen, overlays, runSession } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

const KID_FONT_MIN = 13, KID_TAP_MIN = 56, DONE_TAP_MIN = 64, ADULT_TAP_MIN = 48;
/* Approved below the kid floor by docs/DESIGN.md (Session screen): the quiet
   "◀ Back a move" link is 48px; the move card's ✕ is a 48px round close; the
   Body Check light picker is a grown-up control under 🔒 (grown-up floor, 48);
   Today's "🧪 Explore the moves" is the secondary action under "Let's go", kept
   at 48 (plan v4, PR 4; test/smoke.mjs checks its 48px).
   Not temporary entries — the design itself. */
const DESIGN_TAP = { goBack: 48, closeDetail: 48, rPickLight: 48, goExplore: 48 };

/* ---- ALLOW: sizes still failing on screens later PRs redesign ----------
   One entry = { kind: "font" | "tap", px, has } — `has` is a piece of the
   element's opening tag that singles it out. Every entry is a known debt
   with an owner; none of them is on the session screen or the journey map. */
const ALLOW = {
  // PR 6 — Progress
  progress: [
    { kind: "font", px: 12, has: "font-weight:900;font-size:12px;letter-spacing:0.05em;" },  // card headings
    { kind: "font", px: 8.5, has: "font-size:8.5px;" },
    { kind: "font", px: 9, has: "font-size:9px;font-weight:900;" },
    { kind: "font", px: 9, has: "font-size:9px;font-weight:800;" },
    { kind: "font", px: 11, has: 'scope="col"' },                                             // week table
    { kind: "font", px: 12, has: 'scope="row"' },
    { kind: "font", px: 12, has: "padding:6px 5px;text-align:center;font-size:12px;" },
    { kind: "font", px: 11, has: "padding:2px 8px;border-radius:var(--radius-pill);font-size:11px;" },
    { kind: "font", px: 11, has: "flex-wrap:wrap;margin-top:9px;font-size:11px;" },
    { kind: "font", px: 11, has: "font-size:11px;color:var(--ink-soft);margin-top:5px;" },
    { kind: "font", px: 11, has: "justify-content:space-between;font-size:11px;font-weight:700;" },
    { kind: "font", px: 12, has: 'data-action="progressScope"' },  // 4w / month / quarter
    { kind: "tap", px: 36, has: 'data-action="progressScope"' },
    { kind: "font", px: 12, has: 'data-action="logScope"' },       // week / month
    { kind: "tap", px: 32, has: 'data-action="logScope"' },
    { kind: "font", px: 12, has: "font-size:12px;font-weight:700;" },
    { kind: "font", px: 10, has: "font-size:10px;font-weight:900;letter-spacing:0.0" }        // micro labels and pace chips
  ],
  // PR 6 — Grown-up Zone (tap floor 48)
  grownup: [
    { kind: "tap", px: 36, has: "flex:1;min-height:36px;" },                                  // tab and scope pills
    { kind: "tap", px: 38, has: 'data-action="formCheckMonth"' },                      // month arrows
    { kind: "tap", px: 40, has: "min-height:40px;" },
    { kind: "tap", px: 44, has: "min-height:44px;" },
    { kind: "tap", px: 46, has: "flex:1;min-height:46px;" }
  ]
};

ok(!Object.keys(ALLOW).some(k => /session|journey|readiness|today|finish|quiz/.test(k)),
   "the session screen, the journey map, Body Check, Today, the finish screen and the Quiz Deck have no allowance — they meet the floor outright");

/* ---- a tiny reader for the opening tags of rendered HTML ---------------- */
const TAG = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>"']+(?:="[^"]*")?)*)\s*\/?>/g;
function tags(html) {
  const out = [];
  for (const m of String(html).matchAll(TAG)) {
    const attrs = m[2] || "";
    const style = (attrs.match(/\sstyle="([^"]*)"/) || [])[1] || "";
    const action = (attrs.match(/\sdata-action="([^"]*)"/) || [])[1] || "";
    out.push({ tag: m[1].toLowerCase(), open: m[0], style, action });
  }
  return out;
}
const pxOf = (style, prop) => {
  const m = style.match(new RegExp("(?:^|;)\\s*" + prop + ":\\s*(\\d+(?:\\.\\d+)?)px"));
  return m ? Number(m[1]) : null;
};
/* Every px font size in a style (a clamp() is not a px size and is skipped). */
const fontSizes = (style) => [...style.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]));

/* The section of `html` that starts at the element whose opening tag contains
   `marker`, up to that element's own closing tag. */
function section(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const from = html.lastIndexOf("<", start);
  const name = html.slice(from + 1).match(/^[a-zA-Z][\w-]*/)[0];
  const re = new RegExp("<(/?)" + name + "\\b[^>]*>", "g");
  re.lastIndex = from;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, re.lastIndex);
  }
  return html.slice(from);
}

const unsized = new Set();
/* Scan one rendered screen; return the failures that ALLOW does not name. */
function scan(screen, html, { kid, allow = [] }) {
  const fails = [];
  for (const t of tags(html)) {
    if (kid) for (const px of fontSizes(t.style)) {
      if (px < KID_FONT_MIN) fails.push({ kind: "font", px, open: t.open });
    }
    if (t.tag !== "button") continue;
    const mh = pxOf(t.style, "min-height");
    if (mh === null) { unsized.add(screen + ": " + (t.action || t.open.slice(0, 80))); continue; }
    const floor = !kid ? ADULT_TAP_MIN
      : (screen.startsWith("session") && t.action === "advance") ? DONE_TAP_MIN
      : (DESIGN_TAP[t.action] || KID_TAP_MIN);
    if (mh < floor) fails.push({ kind: "tap", px: mh, floor, open: t.open });
  }
  return fails.filter(f => !allow.some(a => a.kind === f.kind && a.px === f.px && f.open.includes(a.has)));
}
const show = (fails) => fails.map(f => f.kind + " " + f.px + "px"
  + (f.floor ? " (floor " + f.floor + ")" : "") + " in " + f.open.slice(0, 160)).join("\n    ");
const clean = (screen, html, opts) => {
  const fails = scan(screen, html, opts);
  ok(fails.length === 0, screen + ": nothing under the size floor\n    " + show(fails));
};

/* ---- 1. THE SESSION SCREEN, in every state a kid sees mid-workout ------- */
const dayWith = (pred) => Object.keys(data.DAYS).find(k => !data.DAYS[k].spa
  && Object.values(data.DAYS[k].blocks || {}).flat().some(pred));
const timedDay = dayWith(e => !e.byReps && e.work > 0);
const repsDay = dayWith(e => e.byReps);
ok(timedDay && repsDay, "the plan has a timed move and a rep move to draw");

const snaps = {};
const grab = (key) => { if (!snaps[key]) snaps[key] = { ...engine.sess, circuits: engine.sess.circuits }; };
/* The pop-up cards are caught live (before they are answered) where the run
   reaches them; any the run does not reach are drawn from a caught move with
   the phase set (see STATES). */
const answerChecks = () => {
  if (engine.sess.phase === "formcheck") { grab("formcheck"); engine.pickClean(); return true; }
  if (engine.sess.phase === "repcheck") { grab("repcheck"); engine.answerRepCheck("some"); return true; }
  if (["intent", "microloop", "breath"].includes(engine.sess.phase)) grab(engine.sess.phase);
  return false;
};
for (const dayKey of [timedDay, repsDay]) {
  await runSession({ dayKey, light: "green", gateUnlocked: true }, {
    onTick: () => {
      if (answerChecks()) return;
      const s = engine.sess, ex = s.currentEx;
      if (s.phase === "getready") grab("getready");
      if (s.phase === "work" && ex && !ex.byReps) grab("timed");
      if (s.phase === "reps") grab("reps");
      if (s.phase === "rest") grab("rest");
      const block = (s.circuits[s.ci] || {}).block;
      if (["work", "reps"].includes(s.phase) && block === "main" && s.round > 1) grab("main round 2");
      if (["work", "reps"].includes(s.phase) && ex && ex.parentWatch) grab("watch");
    },
    limitMs: 1800000
  });
}
const finishVm = svm.buildSessionVM({ isWide: true, isTablet: false, tightColumn: false, detailEx: {} });
ok(["timed", "reps", "rest"].every(k => snaps[k]), "caught a timed move, a rep move and a rest on the clock ("
   + Object.keys(snaps).join(", ") + ")");

const LAYOUTS = {
  roomy:  { isWide: true,  isTablet: false, tightColumn: false },
  tight:  { isWide: true,  isTablet: true,  tightColumn: true },
  narrow: { isWide: false, isTablet: false, tightColumn: false }
};
const draw = (snap, layout, extra = {}, state = {}) => {
  engine.exitSession(); Object.assign(engine.sess, snap, extra);
  return sscreen.sessionScreen(svm.buildSessionVM({ inSession: true, detailOverlay: false, detailEx: null, ...LAYOUTS[layout], ...state }));
};
const STATES = {
  ...Object.fromEntries(Object.keys(snaps).map(k => [k, [snaps[k], {}, {}]])),
  "watch open": [snaps.watch || snaps.timed, {}, { watchOpen: true }],
  paused:       [snaps.timed, { paused: true }, {}],
  skipAsk:      [snaps.timed, { confirmSkip: true }, {}],
  stop:         [snaps.timed, { stopOverlay: true }, {}],
  restartAsk:   [snaps.timed, { stopOverlay: true, confirmRestart: true }, {}],
  /* The pop-up cards and the move card (R4 PR 3, leftovers from PR 2). */
  intent:       [snaps.intent || snaps.timed, { phase: "intent" }, {}],
  microloop:    [snaps.microloop || snaps.timed, { phase: "microloop", microLoop: null }, {}],
  "microloop answered": [snaps.microloop || snaps.timed, { phase: "microloop", microLoop: { answer: "?", correct: false } }, {}],
  breath:       [snaps.breath || snaps.timed, { phase: "breath" }, {}],
  formcheck:    [snaps.formcheck || snaps.reps, { phase: "formcheck", pendingCleanCheck: true, cleanCheckMove: (snaps.reps.currentEx || {}).name || "" }, {}],
  repcheck:     [snaps.repcheck || snaps.reps, { phase: "repcheck", repsCounted: 3, repsTarget: 8 }, {}],
  detail:       [snaps.watch || snaps.timed, { running: true, paused: true },
                 { detailOverlay: true, detailEx: { ...((snaps.watch || snaps.timed).currentEx || {}),
                   cue: "Long and tall.", parentWatch: "Hips sag.", fix: "Squeeze the glutes.", transfer: "A stronger streamline." } }]
};
let drawn = 0, skipsSeen = 0;
const CALM = /^(?=.*border:3px solid var\(--hairline\))(?=.*background:var\(--surface\))(?=.*color:var\(--ink-soft\))/;
for (const [st, [snap, extra, state]] of Object.entries(STATES)) {
  for (const layout of Object.keys(LAYOUTS)) {
    const html = draw(snap, layout, extra, state);
    clean("session " + st + " " + layout, html, { kid: true });
    drawn++;
    /* Done is the one big action, white on the btn-go fill (aqua-deep: 3.6 on
       swim, so large text only — 20px+ weight 900); STOP keeps white on the
       darker stop fill; Pause, Resume and Skip are calm white buttons. */
    const done = tags(html).find(t => t.tag === "button" && t.action === "advance");
    ok(done && pxOf(done.style, "min-height") >= DONE_TAP_MIN && pxOf(done.style, "font-size") >= 20
       && /font-weight:900/.test(done.style)
       && /background:var\(--btn-go-bg,/.test(done.style) && /color:var\(--btn-go-text,/.test(done.style),
       "session " + st + " " + layout + ": Done is 64px, 20px+ weight 900, on the btn-go slots");
    if (st === "skipAsk") {
      const keep = tags(html).find(t => t.tag === "button" && t.action === "cancelSkip");
      ok(keep && /background:var\(--btn-go-bg,/.test(keep.style) && /color:var\(--btn-go-text,/.test(keep.style)
         && pxOf(keep.style, "font-size") >= 19 && /font-weight:900/.test(keep.style),
         "session skipAsk " + layout + ": Keep going is on the btn-go slots, 19px+ weight 900");
      const skipIt = tags(html).find(t => t.tag === "button" && t.action === "confirmSkipEx");
      ok(skipIt && CALM.test(skipIt.style), "session skipAsk " + layout + ": Skip it is white, 3px hairline, ink-soft");
    }
    const pause = tags(html).find(t => t.tag === "button" && t.action === "pauseTimer");
    ok(pause && CALM.test(pause.style), "session " + st + " " + layout + ": " + (st === "paused" ? "Resume" : "Pause") + " is white, 3px hairline, ink-soft");
    const skip = tags(html).find(t => t.tag === "button" && t.action === "askSkip");
    if (skip) { skipsSeen++; ok(CALM.test(skip.style), "session " + st + " " + layout + ": Skip is white, 3px hairline, ink-soft"); }
    if (st === "repcheck") {
      const reps = tags(html).filter(t => t.tag === "button" && t.action === "answerRepCheck");
      ok(reps.length === 3 && reps.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN),
         "session repcheck " + layout + ": All of them / Almost / Some are three 56px buttons");
    }
    if (st === "formcheck") {
      const strip = tags(html).filter(t => t.tag === "button" && ["pickClean", "pickWobbly", "skipFormCheck"].includes(t.action));
      ok(strip.length === 3 && strip.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN),
         "session formcheck " + layout + ": the clean-check strip's three buttons are 56px");
      const cleanBtn = strip.find(t => t.action === "pickClean");
      ok(/background:var\(--btn-go-bg,var\(--mint\)\);color:var\(--btn-go-text,#fff\);/.test(cleanBtn.style)
         && /box-shadow:0 3px 0 var\(--btn-go-edge,var\(--mint-deep\)\)/.test(cleanBtn.style),
         "session formcheck " + layout + ": the clean button is on the Go slots");
      /* Anything on the btn-go slots is large text: swim white on aqua-deep is 3.6. */
      ok(pxOf(cleanBtn.style, "font-size") >= 19 && /font-weight:900/.test(cleanBtn.style) && pxOf(cleanBtn.style, "min-height") >= KID_TAP_MIN,
         "session formcheck " + layout + ": the clean button is 19px+ weight 900, 56px");
    }
    if (st === "detail") {
      const close = tags(html).find(t => t.tag === "button" && t.action === "closeDetail");
      ok(close && pxOf(close.style, "width") >= 48 && pxOf(close.style, "height") >= 48 && pxOf(close.style, "min-height") >= 48,
         "session detail " + layout + ": the move card's close button is 48px");
      const resume = tags(html).find(t => t.tag === "button" && t.action === "resumeFromDetail");
      ok(resume && pxOf(resume.style, "min-height") >= KID_TAP_MIN, "session detail " + layout + ": Resume my session is 56px");
    }
    if (["intent", "microloop", "microloop answered"].includes(st)) {
      const act = st === "intent" ? "pickIntent" : "answerMicro";
      const opts = tags(html).filter(t => t.tag === "button" && t.action === act);
      ok(opts.length > 0 && opts.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN),
         "session " + st + " " + layout + ": its " + opts.length + " answers are 56px");
    }
    const stop = tags(html).find(t => t.tag === "button" && t.action === "stopNow");
    ok(stop && /background:var\(--btn-stop-bg,var\(--stop\)\)/.test(stop.style) && pxOf(stop.style, "min-height") >= KID_TAP_MIN,
       "session " + st + " " + layout + ": STOP is 56px on the btn-stop slot");
    /* Every move row is the tap target; the ⓘ is only a picture. */
    const list = section(html, "data-ex-list");
    const rows = (list.match(/data-arg="\d+\|\d+"/g) || []).length;
    const rowButtons = tags(list).filter(t => t.tag === "button" && t.action === "openDetailAt"
      && pxOf(t.style, "min-height") >= KID_TAP_MIN && /width:100%/.test(t.style));
    ok(rows > 0 && rowButtons.length === rows,
       "session " + st + " " + layout + ": each of the " + rows + " move rows is one 56px openDetailAt button");
    ok(!/<button[^>]*>\s*ⓘ\s*<\/button>/.test(list) && (list.match(/<span aria-hidden="true"[^>]*>ⓘ<\/span>/g) || []).length === rows,
       "session " + st + " " + layout + ": the ⓘ on each row is a hidden picture, not a button");
  }
}
/* The ring names the zone in the zone's -ink shade; the arc keeps the colour. */
for (const st of ["timed", "rest", "getready"].filter(k => snaps[k])) {
  for (const layout of Object.keys(LAYOUTS)) {
    const html = draw(snaps[st], layout);
    const label = (html.match(/letter-spacing:0\.12em;color:([^;]*);text-align:center;">/) || [])[1];
    const arc = (html.match(/id="s-ring-arc"[^>]*stroke="([^"]*)"/) || [])[1];
    ok(/^var\(--(aqua|sun|mint|grape|stop)-ink\)$/.test(label || "") && /font-size:13px;font-weight:900;letter-spacing:0\.12em;/.test(html),
       st + " " + layout + ": the ring's zone label is 13px in an -ink shade (" + label + ")");
    ok(arc && !/-ink\)$/.test(arc), st + " " + layout + ": and the arc keeps the bright zone colour (" + arc + ")");
  }
}
ok(/var\(--grape-ink\);">BY REPS/.test(draw(snaps.reps, "narrow")), "the rep ring says BY REPS in grape-ink");
ok(/data-action="toggleRail"[^>]*width:48px;height:48px/.test(draw(snaps.timed, "roomy")),
   "the rail's hide/show toggle is 48px");
ok(/data-action="toggleRail"/.test(draw(snaps.timed, "roomy", {}, { railOpen: false })),
   "and with the rail hidden it is still there to bring it back");
clean("session rail hidden", draw(snaps.timed, "roomy", {}, { railOpen: false }), { kid: true });
ok(/writing-mode:vertical-rl;[^"]*color:var\(--ink-soft\);/.test(draw(snaps.timed, "roomy", {}, { railOpen: false })),
   "with the rail hidden, its vertical label is ink-soft (was ink-faint)");
engine.exitSession();

/* Explore: the same controls, nothing counting down. */
store.updateSettings({ coachSpeechOn: false });
engine.startSession({ dayKey: timedDay, mode: "explore" });
await new Promise(r => setTimeout(r, 0));
ok(engine.sess.explore === true, "explore is running");
for (const layout of Object.keys(LAYOUTS)) {
  const html = sscreen.sessionScreen(svm.buildSessionVM({ inSession: true, detailOverlay: false, detailEx: null, ...LAYOUTS[layout] }));
  clean("session explore " + layout, html, { kid: true });
  const done = tags(html).find(t => t.tag === "button" && t.action === "advance");
  ok(done && pxOf(done.style, "min-height") >= DONE_TAP_MIN, "explore " + layout + ": its Done is 64px too");
}
engine.exitSession();

/* ---- 2. THE FINISH SCREEN (PR 5): every state, its order, the fold ----- */
ok(finishVm.sessionDone, "the finished session draws its finish screen");
ok(finishVm.moveReviewOpen === false
   && svm.buildSessionVM({ isWide: true, detailEx: {}, moveReviewOpen: true }).moveReviewOpen === true,
   "the finish VM carries the fold's state from main.js (closed unless opened)");
const SHORT_NOTE = "Round 2 wasn't a full round — Glute Bridge March was 4 of 16 reps.";
const KID_LINE = "A few moves came in short — next time hold them all the way. 💪";
const owedRows = [
  { name: "Glute Bridge March", circuit: "", label: "round 2", anySkipped: false },
  { name: "Dead Bug", circuit: "", label: "rounds 2 and 3", anySkipped: true }
];
const partDone = { ...finishVm, completionKey: "partial-short", completionState: "partial", completionNote: "",
  notFull: owedRows, roundShortNotes: [SHORT_NOTE], allInFull: false, showRoundsLine: true, moveReviewOpen: false };
const FINISH = {
  "part done":      partDone,
  "review open":    { ...partDone, moveReviewOpen: true },
  full:             { ...finishVm, completionKey: "complete", completionState: "complete", completionNote: "",
                      notFull: [], roundShortNotes: [], allInFull: true, moveReviewOpen: false },
  stopped:          { ...partDone, completionKey: "safety-stop", completionState: "safety-stop" },
  "nothing logged": { ...partDone, completionKey: "none", completionState: "none",
                      notFull: owedRows.map(r => ({ ...r, anySkipped: true })) },
  "save failed":    { ...partDone, completionKey: "save-failed", completionState: "save-failed", saveFailed: true,
                      showCompletionExtras: false, showReflection: false, notFull: [], roundShortNotes: [] },
  /* Mood picked (so the reflection shows), quiz answered, a level-up waiting. */
  "all extras":     { ...partDone, moveReviewOpen: true, showReflection: true, leveledUp: true, quizAnswered: true,
                      quizFeedback: "Nailed it!", quizFeedbackColor: "var(--mint-ink)", quizWhy: "Because." },
  explore:          { ...finishVm, completionKey: "explore", completionState: "explore", explore: true, completionNote: "",
                      showCompletionExtras: false, showReflection: false, showRoundsLine: false,
                      notFull: [], roundShortNotes: [], allInFull: false, xpLine: "" }
};
const at = (html, marker) => html.indexOf(marker);
for (const [st, vm] of Object.entries(FINISH)) {
  const html = sscreen.sessionScreen(vm);
  clean("finish " + st, html, { kid: true });
  const back = tags(html).find(t => t.tag === "button" && t.action === "exitSession");
  ok(back && pxOf(back.style, "min-height") >= KID_TAP_MIN && pxOf(back.style, "font-size") === 18 && /font-weight:900/.test(back.style)
     && /background:var\(--sun\)/.test(back.style) && /color:var\(--(ink|sun-ink)\)/.test(back.style),
     "finish " + st + ": the last button is 56px, 18px weight 900, on sun");
  ok(at(html, 'data-action="exitSession"') > Math.max(at(html, "data-finish-summary"), at(html, "data-finish-kid-line"),
       at(html, 'data-action="toggleMoveReview"'), at(html, "data-move-review"), at(html, "data-finish-quiz")),
     "finish " + st + ": \"" + (vm.explore ? "Done looking" : "Back to Today") + "\" is last");
  ok(!/var\(--coral\)/.test(section(html, "data-move-review")), "finish " + st + ": nothing in the move review is coral");
  if (vm.showCompletionExtras) {
    ok(at(html, "data-finish-summary") < at(html, "data-finish-mood") && at(html, "data-finish-mood") < at(html, "data-finish-quiz")
       && (at(html, "data-finish-kid-line") < 0 || at(html, "data-finish-quiz") < at(html, "data-finish-kid-line"))
       && at(html, "data-finish-quiz") < at(html, 'data-action="toggleMoveReview"') + (at(html, 'data-action="toggleMoveReview"') < 0 ? 1e9 : 0)
       && (at(html, 'data-action="toggleMoveReview"') < 0 || at(html, "data-finish-kid-line") < at(html, 'data-action="toggleMoveReview"')),
       "finish " + st + ": summary, then How did it feel?, then the Coach's Quiz, then the kid line, then See every move");
    const moods = tags(html).filter(t => t.tag === "button" && t.action === "pickMood");
    ok(moods.length > 0 && moods.every(t => pxOf(t.style, "min-height") >= 72), "finish " + st + ": the mood buttons are 72px tall");
    const opts = tags(html).filter(t => t.tag === "button" && t.action === "quizPick");
    ok(opts.length > 1 && opts.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN && pxOf(t.style, "font-size") >= 17),
       "finish " + st + ": the quiz options are 56px, 17px");
  }
}
{
  const closed = sscreen.sessionScreen(FINISH["part done"]);
  const open = sscreen.sessionScreen(FINISH["review open"]);
  ok(closed.includes(KID_LINE) && open.includes(KID_LINE), "finish: a day with a round short says the one kid line");
  ok(!closed.includes(SHORT_NOTE) && !/data-not-full/.test(closed) && !/data-action="goSessionRedo"/.test(closed),
     "finish: the exact counts, the list and Redo are hidden until she opens See every move");
  const fold = tags(closed).find(t => t.tag === "button" && t.action === "toggleMoveReview");
  ok(fold && /See every move ▾/.test(closed) && /aria-expanded="false"/.test(fold.open) && pxOf(fold.style, "min-height") >= KID_TAP_MIN,
     "finish: See every move ▾ is a 56px button, aria-expanded false");
  ok(open.includes(SHORT_NOTE) && owedRows.every(r => open.includes('data-not-full="' + r.name + '"'))
     && /Hide the moves ▴/.test(open) && /aria-expanded="true"/.test(open),
     "finish: opened, it shows the round line and every row, and says Hide the moves ▴");
  const review = section(open, "data-move-review");
  const rowTags = tags(review).filter(t => /data-not-full="/.test(t.open));
  ok(/⏭/.test(review) && /½/.test(review) && rowTags.length === owedRows.length
     && rowTags.every(t => /color:var\(--ink-soft\)/.test(t.style)),
     "finish: each row is ink-soft with its ⏭ or ½");
  const redo = tags(open).find(t => t.tag === "button" && t.action === "goSessionRedo");
  ok(redo && /background:var\(--btn-primary-bg,var\(--aqua\)\)/.test(redo.style) && /color:var\(--btn-primary-text,#fff\)/.test(redo.style)
     && /box-shadow:0 4px 0 var\(--btn-primary-edge,var\(--aqua-deep\)\)/.test(redo.style)
     && pxOf(redo.style, "min-height") >= KID_TAP_MIN && pxOf(redo.style, "font-size") >= 17,
     "finish: Redo these is on the btn-primary slots, 56px, 17px");
  const back = tags(open).find(t => t.tag === "button" && t.action === "exitSession");
  ok(/color:var\(--ink\)/.test(back.style) && />🏠 Back to Today</.test(open), "finish: 🏠 Back to Today is ink on sun");
  const full = sscreen.sessionScreen(FINISH.full);
  ok(full.includes("Every move was done in full.") && !full.includes(KID_LINE) && !/data-action="toggleMoveReview"/.test(full),
     "finish: a clean day says every move was done in full, with nothing to fold");
  const none = sscreen.sessionScreen(FINISH["nothing logged"]);
  ok(/Nothing logged this time\./.test(none) && /Every move got skipped, so there's nothing to record/.test(none)
     && !/data-not-full/.test(none) && !none.includes(KID_LINE) && !/data-finish-kid-line/.test(none),
     "finish: nothing logged is one friendly line — its title and note — with no kid line and no list of skipped rows");
  const explore = sscreen.sessionScreen(FINISH.explore);
  ok(/Done looking/.test(explore) && /Nothing was recorded/.test(explore) && !/data-action="toggleMoveReview"/.test(explore),
     "finish: explore still says Done looking and Nothing was recorded");
}

/* ---- 2b. THE QUIZ DECK (PR 5): a question, its answer, the results ----- */
{
  const deck = overlays.buildQuizDeck(8);
  ok(deck.qs.length > 0, "the Quiz Deck deals cards to draw");
  for (const [st, qd] of [["question", { ...deck, idx: 0, picks: [] }],
                          ["answered", { ...deck, idx: 0, picks: [deck.qs[0].opts.findIndex(o => o.ok)] }],
                          ["practice", { ...deck, idx: 0, picks: [], willPay: false }],
                          ["results", { ...deck, done: true, scored: true, picks: deck.qs.map(q => q.opts.findIndex(o => o.ok)),
                                        bank: { mastered: 3, total: 40, left: 37 }, leveledUp: true, xpEarned: 20 }]]) {
    const html = overlays.quizDeckHtml(qd);
    clean("quiz deck " + st, html, { kid: true });
    if (st !== "results") {
      const opts = tags(html).filter(t => t.tag === "button" && t.action === "answerQuizDeck");
      ok(opts.length > 1 && opts.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN),
         "quiz deck " + st + ": its " + opts.length + " options are 56px");
    }
  }
}

/* ---- 3. TODAY, AND ITS JOURNEY MAP (map: PR 2, no entries) -------------- */
const today = Object.keys(data.DAYS).find(k => !data.DAYS[k].spa);
const tv = tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: true });
const wideHtml = tscreen.todayWide(tv);
clean("today", wideHtml, { kid: true });
for (const [name, html] of [["wide", wideHtml], ["narrow", tscreen.todayNarrow({ ...tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: false }) })]]) {
  const map = section(html, 'id="journey-map-card"');
  ok(map.length > 0, "journey map " + name + ": found on Today");
  clean("journey map " + name, map, { kid: true });
  ok(/stop-color:var\(--hero-from/.test(map) && /stop-color:var\(--journey-to/.test(map),
     "journey map " + name + ": painted from the hero → journey slots");
  ok(!/#CDEDE7/i.test(map), "journey map " + name + ": the old fixed 80% stop is gone");
  ok(/color:var\(--hero-text,#fff\)/.test(map), "journey map " + name + ": its words take the hero-text slot");
  ok(/background:rgba\(255,255,255,0\.6\);border-radius:999px;padding:4px 10px;">\s*<span style="[^"]*color:var\(--ink\);">[^<]+<\/span>\s*<span style="[^"]*color:var\(--aqua-ink\);">YOU ARE HERE<\/span>/.test(map),
     "journey map " + name + ": \"You are here\" sits on a white pill");
}

/* ---- 3b. TODAY (PR 4): Card A day card, order, phone fold, sizes ------- */
{
  const todayKey = tvm.buildTodayVM({ expanded: {}, isWide: true }).todayKey;
  const day = data.DAYS[todayKey] && !data.DAYS[todayKey].spa ? todayKey : today;
  const T = (layout, extra = {}) => {
    const vm = tvm.buildTodayVM({ selectedDay: day, expanded: {}, ...LAYOUTS[layout], ...extra });
    return { vm, html: layout === "narrow" ? tscreen.todayNarrow(vm) : tscreen.todayWide(vm) };
  };
  const firstBlock = (T("roomy").vm.blocks[0] || {}).key;
  const VIEWS = {
    roomy: ["roomy", {}], tight: ["tight", {}],
    "roomy block open": ["roomy", { expanded: { [firstBlock]: true } }],
    "narrow closed": ["narrow", {}], "narrow open": ["narrow", { blocksOpen: true }],
    "narrow open block open": ["narrow", { blocksOpen: true, expanded: { [firstBlock]: true } }]
  };
  const HERO = /background:linear-gradient\(165deg,var\(--hero-from,var\(--aqua-light\)\) 0%,var\(--hero-to,var\(--aqua\)\) 70%\);color:var\(--hero-text,#fff\);/;
  for (const [name, [layout, extra]] of Object.entries(VIEWS)) {
    const { vm, html } = T(layout, extra);
    const label = "today " + name;
    clean(label, html, { kid: true });
    ok(vm.dayView.isActive && vm.dayView.showBlocksList && vm.dayView.showExplore, label + ": drawn on an active day (" + day + ")");
    ok(HERO.test(html) && !/var\(--aqua-deep\) 100%/.test(html), label + ": the day card is Card A — hero slots, 0 → 70%, no aqua-deep end");
    const n = vm.blocks.length;
    const rows = tags(html).filter(t => t.tag === "button" && t.action === "toggleBlock");
    const fold = tags(html).filter(t => t.tag === "button" && t.action === "toggleBlocks");
    const open = layout !== "narrow" || !!extra.blocksOpen;
    ok(n > 1 && rows.length === (open ? n : 0) && rows.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN),
       label + ": " + (open ? "all " + n + " block rows, each 56px" : "no block rows while folded"));
    if (layout === "narrow") {
      ok(fold.length === 1 && pxOf(fold[0].style, "min-height") >= KID_TAP_MIN && /background:var\(--hero-chip,/.test(fold[0].style),
         label + ": one 56px fold button on the hero-chip");
      ok(open ? /<span>Hide the blocks<\/span><span aria-hidden="true"[^>]*>▴<\/span>/.test(html)
              : new RegExp("<span>See the " + n + " blocks</span><span aria-hidden=\"true\"[^>]*>▾</span>").test(html),
         label + ": the fold reads " + (open ? "\"Hide the blocks ▴\"" : "\"See the " + n + " blocks ▾\""));
      ok(fold[0].open.includes('aria-expanded="' + open + '"'), label + ": aria-expanded=" + open);
    } else {
      ok(fold.length === 0, label + ": iPad keeps the blocks open, no fold button");
    }
    if (name.endsWith("block open")) ok(/padding:2px 15px 13px 56px;/.test(html), label + ": the tapped block shows its moves");
    /* Order: portrait and phone put the day card straight after the greeting;
       landscape keeps the left column (week … journey) and the card on the right. */
    const at = (re) => html.search(re);
    const [hi, card, week, map] = [at(/Hi, /), at(HERO), at(/data-action="selectDay"/), at(/id="journey-map-card"/)];
    ok(layout === "roomy" ? hi < week && week < map && map < card : hi < card && card < week && week < map,
       label + ": order " + (layout === "roomy" ? "greeting, week, journey | day card" : "greeting, day card, week, journey"));
    /* Week strip: 7 cells 88px tall, day names 13px, dates 15px. */
    const cells = tags(html).filter(t => t.tag === "button" && t.action === "selectDay" && /min-height:88px/.test(t.style));
    ok(cells.length === 7, label + ": 7 week cells, each min-height 88px");
    ok((html.match(/font-size:13px;font-weight:900;letter-spacing:0\.0[34]em;/g) || []).length === 7
       && (html.match(/<div style="font-size:15px;font-weight:800;color:var\(--ink-soft\);">\d+<\/div>/g) || []).length === 7,
       label + ": week day names 13px, dates 15px");
    ok(/color:var\(--grape-ink\);flex-shrink:0;">›<\/span>/.test(html), label + ": the Quiz Deck chevron is grape-ink");
    ok(html.includes("<span>⚡\uFE0F</span> " + vm.dayView.movesLabel), label + ": the moves chip asks for emoji ⚡️");
    ok(/background:var\(--hero-chip,rgba\(255,255,255,0\.18\)\);border-radius:var\(--radius-pill\);/.test(html), label + ": chips on the hero-chip slot");
    /* Faded words on the day card measured under 4.5:1 (PR 4) are full strength
       now; only the block-row count (5.2+ measured) and the • bullet keep one. */
    const dayCardHtml = section(html, "70%);color:var(--hero-text,#fff);");
    const faded = tags(dayCardHtml).filter(t => /(?:^|;)opacity:/.test(t.style));
    ok(dayCardHtml.length > 0 && faded.every(t => /text-align:right;/.test(t.style) || t.style === "opacity:0.7;flex-shrink:0;"),
       label + ": no faded text on the day card except the block-row count and the bullet");
    const go = tags(html).find(t => t.tag === "button" && t.action === vm.dayView.ctaAction);
    ok(go && /background:var\(--sun\);color:var\(--ink\);/.test(go.style), label + ": \"Let's go\" is ink on sun");
    const explore = tags(html).find(t => t.tag === "button" && t.action === "goExplore");
    ok(explore && /color:var\(--hero-text,#fff\);border:2px solid var\(--hero-text,#fff\);/.test(explore.style) && pxOf(explore.style, "min-height") === 48,
       label + ": Explore is a 48px hero-text outline");
    const map2 = section(html, 'id="journey-map-card"');
    ok(/background:rgba\(255,255,255,0\.55\);border-radius:9px;overflow:hidden;">\s*<div style="width:[\d.]+%;height:100%;background:var\(--sun\);/.test(map2),
       label + ": the journey XP bar is sun on a white 55% track");
  }
}

/* ---- 4. BODY CHECK (PR 3): every step, both layouts, no allowance ------ */
const flow = (steps) => { const r = rvm.newReadinessFlow(today); steps(r); return r; };
const answerAll = (r, v) => ["q_sleep", "q_light", "q_ready", "q_pain"].forEach(q => rvm.answerQuestion(r, q, v[q] || "yes"));
const R_STATES = {
  "questions":         flow(() => {}),
  "3 answered":        flow(r => { rvm.answerQuestion(r, "q_sleep", "yes"); rvm.answerQuestion(r, "q_light", "no"); rvm.answerQuestion(r, "q_ready", "yes"); }),
  "green result":      flow(r => answerAll(r, {})),
  "yellow result":     flow(r => answerAll(r, { q_light: "no" })),
  "recovery result":   flow(r => answerAll(r, { q_sleep: "no", q_light: "no", q_ready: "no" })),
  "overridden":        flow(r => { answerAll(r, {}); r.light = "yellow"; r.overridden = true; }),
  "body map":          flow(r => answerAll(r, { q_pain: "no" })),
  "zone popup":        flow(r => { answerAll(r, { q_pain: "no" }); r.pendingZone = 2; }),
  "zone popup marked": flow(r => { answerAll(r, { q_pain: "no" }); rvm.setZoneSev(r, 2, 2); r.pendingZone = 2; }),
  "sore result":       flow(r => { answerAll(r, { q_pain: "no" }); rvm.setZoneSev(r, 2, 2); }),
  "sev3 result":       flow(r => { answerAll(r, { q_pain: "no" }); rvm.setZoneSev(r, 4, 3); }),
  "sev3 confirmed":    flow(r => { answerAll(r, { q_pain: "no" }); rvm.setZoneSev(r, 4, 3); rvm.confirmGrownup(r); }),
  "pain result":       flow(r => { answerAll(r, { q_pain: "no" }); rvm.setZoneSev(r, 6, 4); })
};
const drawR = (r, wide) => rscreen.readinessScreen(rvm.buildReadinessVM(r, wide));
for (const [st, r] of Object.entries(R_STATES)) {
  for (const wide of [true, false]) {
    const name = "readiness " + st + (wide ? " wide" : " narrow");
    const html = drawR(r, wide);
    clean(name, html, { kid: true });
    /* Answers: 56px, 17px, two equal columns under the question. */
    if (r.step === "questions") {
      const answers = tags(html).filter(t => t.tag === "button" && t.action === "rAnswer");
      ok(answers.length === 8 && answers.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN && pxOf(t.style, "font-size") >= 17),
         name + ": 8 yes/no answers, each 56px and 17px");
      ok((html.match(/display:grid;grid-template-columns:1fr 1fr;/g) || []).length === 4,
         name + ": each of the 4 answer pairs is a two-column grid");
    }
    /* The result card: title in the light's -ink; Start 64px / 24px / 900;
       grown-up summary and light picker 48px. */
    if (/data-body-result/.test(html)) {
      const vm = rvm.buildReadinessVM(r, wide);
      ok(vm.light.titleInk && html.includes("color:" + vm.light.titleInk + ";line-height:1.1;\">" + vm.light.label),
         name + ": the light's title is in " + vm.light.titleInk);
      const start = tags(html).find(t => t.tag === "button" && pxOf(t.style, "font-size") === 24
        && (t.action === "rResultCta" || / disabled /.test(t.open)));
      ok(start && pxOf(start.style, "min-height") >= DONE_TAP_MIN && /font-weight:900/.test(start.style),
         name + ": Start is 64px, 24px, weight 900");
      if (r.light === "green" && vm.mayStart)
        ok(/background:var\(--btn-go-bg\);color:var\(--btn-go-text\);/.test(start.style) && /box-shadow:0 5px 0 var\(--btn-go-edge\)/.test(start.style),
           name + ": green's Start is on the Go slots");
      ok(/<summary style="[^"]*font-size:13px;[^"]*display:flex;align-items:center;[^"]*min-height:48px;/.test(html),
         name + ": the grown-up summary is 48px, 13px");
      const picks = tags(html).filter(t => t.tag === "button" && t.action === "rPickLight");
      const chosen = picks.find(t => t.open.includes('data-arg="' + r.light + '"'));
      ok(picks.length === 4 && picks.every(t => pxOf(t.style, "min-height") >= ADULT_TAP_MIN && /font-size:15px/.test(t.style))
         && chosen && chosen.style.includes("border:3px solid " + vm.light.color + ";color:" + vm.light.titleInk + ";")
         && /background:var\(--surface\)/.test(chosen.style) && !/color:#fff/.test(chosen.style),
         name + ": the light picker is 48px / 15px, the chosen light outlined with its -ink title");
    }
  }
}
/* The hero panel reads the hero slots, with the old look as fallback. */
for (const wide of [true, false]) {
  const html = drawR(R_STATES.questions, wide);
  ok(/background:linear-gradient\(165deg,var\(--hero-from,var\(--aqua-light\)\) 0%,var\(--hero-to,var\(--aqua\)\) 70%\);color:var\(--hero-text,#fff\);/.test(html),
     "readiness " + (wide ? "wide" : "narrow") + ": the hero panel is painted from the hero slots");
}
/* Body Check leftovers (PR 4): popup words in -ink, legend headers ink-soft,
   the view pills on the btn-primary slots. */
for (const wide of [true, false]) {
  const pop = drawR(R_STATES["zone popup"], wide);
  ok(/color:var\(--sun-ink\);">Tired but controlled/.test(pop) && /color:var\(--coral-ink\);">Changed movement/.test(pop)
     && /color:var\(--stop-ink\);">Pain \/ Stop/.test(pop) && !/font-size:16px;color:var\(--(sun|coral|stop)\);/.test(pop),
     "readiness zone popup " + (wide ? "wide" : "narrow") + ": the severity words are in their -ink shades");
  const map = drawR(R_STATES["body map"], wide);
  ok(/text-transform:uppercase;color:var\(--ink-soft\);padding:10px 4px 2px;/.test(map) && !/color:var\(--ink-faint\)/.test(map),
     "readiness body map " + (wide ? "wide" : "narrow") + ": legend headers are ink-soft");
  ok(/background:var\(--btn-primary-bg,var\(--aqua\)\);color:var\(--btn-primary-text,#fff\);[^"]*">FRONT VIEW/.test(map)
     && /background:var\(--btn-primary-bg,var\(--sea\)\);color:var\(--btn-primary-text,#fff\);[^"]*">BACK VIEW/.test(map),
     "readiness body map " + (wide ? "wide" : "narrow") + ": FRONT/BACK VIEW pills on the btn-primary slots");
}
/* The result after a body-map answer is the element main.js scrolls to. */
ok(/<div data-body-result /.test(drawR(R_STATES["sore result"], false)), "the body-map result card carries data-body-result");
/* The data side: every light has an -ink title; green on the Go slots; red text on text-on-coral. */
ok(["green", "yellow", "red", "recovery"].every(k => /^var\(--[a-z]+-ink\)$/.test(data.LIGHT_META[k].titleInk || "")),
   "every light has an -ink title shade");
ok(data.LIGHT_META.green.btnColor === "var(--btn-go-bg)" && data.LIGHT_META.green.btnText === "var(--btn-go-text)"
   && data.BODY_RESULTS[1].ctaColor === "var(--btn-go-bg)" && data.BODY_RESULTS[1].ctaText === "var(--btn-go-text)",
   "green Start (both paths) uses the Go slots");
ok(data.LIGHT_META.red.btnText === "var(--text-on-coral)" && data.BODY_RESULTS[3].ctaText === "var(--text-on-coral)"
   && data.LIGHT_META.recovery.btnColor === "var(--btn-grape-bg)",
   "red Start text on text-on-coral, recovery on btn-grape-bg");

/* ---- 4b. PROGRESS (PR 6) ----------------------------------------------- */
clean("progress", pscreen.progressScreen(pvm.buildProgressVM({ progressScope: "4w", logScope: "week" })),
  { kid: true, allow: ALLOW.progress });

/* ---- 5. THE GROWN-UP ZONE, every tab (PR 6; tap floor 48) --------------- */
for (const tab of ["overview", "analytics", "formcheck", "coaching", "library", "settings"]) {
  const html = gscreen.grownupScreen({ ...gvm.buildGrownupVM({ gsScope: "week", grownupTab: tab, isWide: true }), grownupUnlocked: true });
  clean("grownup " + tab, html, { kid: false, allow: ALLOW.grownup });
}

/* Body Check with yesterday's answers beside today's (drawn last: it saves a check). */
store.saveReadiness({ answers: { q_sleep: "yes", q_light: "no", q_ready: "yes", q_pain: "no" }, zoneSev: { 2: 2 }, light: "yellow" });
for (const wide of [true, false]) {
  const html = drawR(rvm.newReadinessFlow(today), wide);
  ok(/Yesterday/.test(html), "readiness yesterday " + (wide ? "wide" : "narrow") + ": yesterday's column is drawn");
  clean("readiness yesterday " + (wide ? "wide" : "narrow"), html, { kid: true });
}

ok(drawn >= 24, "drew the session screen in " + drawn + " state × layout combinations");
ok(skipsSeen >= 3, "checked the Skip button style in " + skipsSeen + " drawn states");
console.log("buttons with no min-height (listed, not failed):\n  " + [...unsized].join("\n  "));
console.log("✓ design floor passed (" + passed + " assertions; " + unsized.size + " unsized buttons listed)");
