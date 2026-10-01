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
   must never get one. */
import { engine, store, data, tvm, gvm, gscreen, rvm, rscreen, pvm, pscreen, svm, sscreen, tscreen, runSession } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

const KID_FONT_MIN = 13, KID_TAP_MIN = 56, DONE_TAP_MIN = 64, ADULT_TAP_MIN = 48;
/* Approved below the kid floor by docs/DESIGN.md (Session screen): the quiet
   "◀ Back a move" link is 48px. Not a temporary entry — the design itself. */
const DESIGN_TAP = { goBack: 48 };

/* ---- ALLOW: sizes still failing on screens later PRs redesign ----------
   One entry = { kind: "font" | "tap", px, has } — `has` is a piece of the
   element's opening tag that singles it out. Every entry is a known debt
   with an owner; none of them is on the session screen or the journey map. */
const ALLOW = {
  // PR 5 — finish screen
  finish: [
    { kind: "font", px: 12, has: "font-size:12px;font-weight:800;color:var(--ink-soft);" }   // Coach's Quiz intro line
  ],
  // PR 4 — Today day card, week strip, stats, Quiz Deck button (never the journey map)
  today: [
    { kind: "font", px: 11, has: "font-size:11px;font-weight:900;letter-spacing:0.04em;" },  // week strip day names
    { kind: "font", px: 12, has: "font-size:12px;font-weight:800;color:var(--ink-soft);" },  // week strip dates, Quiz Deck sub-line
    { kind: "font", px: 11, has: "width:20px;height:20px;border-radius:50%;" },              // week strip status dots
    { kind: "font", px: 10, has: "width:20px;height:20px;border-radius:50%;" },
    { kind: "font", px: 11, has: "padding:6px 14px;font-size:11px;font-weight:900;letter-spacing:0.08em;" }, // day card label chip
    { kind: "font", px: 11, has: "font-size:11px;font-weight:900;letter-spacing:0.08em;opacity:0.85;margin-bottom:9px;" },
    { kind: "font", px: 12, has: "font-size:12px;font-weight:800;opacity:0.85;text-align:right;" },   // block row minutes
    { kind: "font", px: 11, has: "font-size:11px;font-weight:800;opacity:0.85;line-height:1.35;" },   // block row move names
    { kind: "font", px: 11, has: "width:22px;height:22px;border-radius:50%;" }               // review round dots
  ],
  // PR 3 — Body Check
  readiness: [
    { kind: "font", px: 12, has: "width:24px;height:24px;border-radius:50%;" },              // question number circles
    { kind: "tap", px: 44, has: 'data-action="rAnswer"' }                                     // yes / no
  ],
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

ok(!Object.keys(ALLOW).some(k => /session|journey/.test(k)),
   "the session screen and the journey map have no allowance — they meet the floor outright");

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

const answerChecks = () => {
  if (engine.sess.phase === "formcheck") { engine.pickClean(); return true; }
  if (engine.sess.phase === "repcheck") { engine.answerRepCheck("some"); return true; }
  return false;
};
const snaps = {};
const grab = (key) => { if (!snaps[key]) snaps[key] = { ...engine.sess, circuits: engine.sess.circuits }; };
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
  restartAsk:   [snaps.timed, { stopOverlay: true, confirmRestart: true }, {}]
};
let drawn = 0;
for (const [st, [snap, extra, state]] of Object.entries(STATES)) {
  for (const layout of Object.keys(LAYOUTS)) {
    const html = draw(snap, layout, extra, state);
    clean("session " + st + " " + layout, html, { kid: true });
    drawn++;
    /* Done is the one big action, white on the dark green Go fill; STOP keeps
       white on the darker stop fill. */
    const done = tags(html).find(t => t.tag === "button" && t.action === "advance");
    ok(done && pxOf(done.style, "min-height") >= DONE_TAP_MIN && /font-size:20px/.test(done.style)
       && /background:var\(--btn-go-bg,/.test(done.style) && /color:var\(--btn-go-text,/.test(done.style),
       "session " + st + " " + layout + ": Done is 64px, 20px, on the btn-go slots");
    if (st === "skipAsk") {
      const keep = tags(html).find(t => t.tag === "button" && t.action === "cancelSkip");
      ok(keep && /background:var\(--btn-go-bg,/.test(keep.style),
         "session skipAsk " + layout + ": Keep going is on the btn-go slot");
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

/* ---- 2. THE FINISH SCREEN (PR 5) --------------------------------------- */
ok(finishVm.sessionDone, "the finished session draws its finish screen");
clean("finish", sscreen.sessionScreen(finishVm), { kid: true, allow: ALLOW.finish });

/* ---- 3. TODAY, AND ITS JOURNEY MAP (map: PR 2, no entries) -------------- */
const today = Object.keys(data.DAYS).find(k => !data.DAYS[k].spa);
const tv = tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: true });
const wideHtml = tscreen.todayWide(tv);
clean("today", wideHtml, { kid: true, allow: ALLOW.today });
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

/* ---- 4. BODY CHECK (PR 3) AND PROGRESS (PR 6) --------------------------- */
clean("readiness", rscreen.readinessScreen(rvm.buildReadinessVM(rvm.newReadinessFlow(today), true)),
  { kid: true, allow: ALLOW.readiness });
clean("progress", pscreen.progressScreen(pvm.buildProgressVM({ progressScope: "4w", logScope: "week" })),
  { kid: true, allow: ALLOW.progress });

/* ---- 5. THE GROWN-UP ZONE, every tab (PR 6; tap floor 48) --------------- */
for (const tab of ["overview", "analytics", "formcheck", "coaching", "library", "settings"]) {
  const html = gscreen.grownupScreen({ ...gvm.buildGrownupVM({ gsScope: "week", grownupTab: tab, isWide: true }), grownupUnlocked: true });
  clean("grownup " + tab, html, { kid: false, allow: ALLOW.grownup });
}

ok(drawn >= 24, "drew the session screen in " + drawn + " state × layout combinations");
console.log("buttons with no min-height (listed, not failed):\n  " + [...unsized].join("\n  "));
console.log("✓ design floor passed (" + passed + " assertions; " + unsized.size + " unsized buttons listed)");
