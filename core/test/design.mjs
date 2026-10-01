/* THE SIZE FLOOR — what docs/DESIGN.md promises, checked on the real screens.

   Kid screens: no inline text under 13px, and every sized button at least
   56px tall (Done 64). Grown-up screens: every sized button at least 48px.
   The screens are rendered from their real view-models and their inline
   styles are read back, so a later edit that shrinks a control fails here
   instead of on a kid's iPad.

   A button with no min-height at all (a chip, an icon) is LISTED, not failed:
   its height comes from padding and is checked by screenshot.

   The splash redesign landed in six PRs, each removing its screens from a
   per-screen allowance. PR 6 (Progress and the Grown-up Zone) removed the
   last entries, so there is no allowance any more: every screen scanned
   here meets the floor outright, and a new exception has to be a named,
   approved design exception in DESIGN_TAP below. */
import fs from "node:fs";
import { engine, store, data, tvm, gvm, gscreen, rvm, rscreen, pvm, pscreen, svm, sscreen, tscreen, overlays, runSession } from "./harness.mjs";
const shell = await import(new URL("../screens/shell.js", import.meta.url).href);

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

const KID_FONT_MIN = 13, KID_TAP_MIN = 56, DONE_TAP_MIN = 64, ADULT_TAP_MIN = 48, ADULT_FONT_MIN = 13;
/* Approved below the kid floor by docs/DESIGN.md (Session screen): the quiet
   "◀ Back a move" link is 48px; the move card's ✕ is a 48px round close; the
   Body Check light picker is a grown-up control under 🔒 (grown-up floor, 48);
   Today's "🧪 Explore the moves" is the secondary action under "Let's go" — a
   56px calm button since R5 (it was 48, plan v4, PR 4; the 48 floor entry
   stays, and test/smoke.mjs checks its 56px); the Quiz Deck's ✕ is
   the same 48px round close as the move card's (R4 PR 6); so is the prize
   draw's ✕ (R4 PR 7, was 44).
   Not temporary entries — the design itself. */
const DESIGN_TAP = { goBack: 48, closeDetail: 48, rPickLight: 48, goExplore: 48, exitQuizDeck: 48, closePrizeDraw: 48 };

/* No allowance: the per-screen ALLOW list that PRs 2–6 shrank is gone (PR 6
   removed the Progress and Grown-up entries, the last ones). */

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

/* ---- THE CONTRAST RULES (docs/DESIGN.md, R4 PR 7) ----------------------
   Read from each tag's own style (the last colour / background it sets):
   - ink-faint (and hairline / text-faint) is never text;
   - a bright family colour (aqua, sea, coral, sun, mint, grape, gum, stop,
     their -light and -deep) is never text — coloured words use the -ink shade;
   - white text never sits on a bright fill (aqua, sea, coral, sun, mint,
     grape, gum, stop, their -light shades, or a mix of them): it belongs on
     stop-deep / grape-deep / the btn-go and btn-primary slots only;
   - a ✓ mark carries an -ink colour (or ink), never the bright one or white. */
const FAMILY = "(?:aqua|sea|coral|sun|mint|grape|gum|stop)";
const lastProp = (style, prop) => {
  const all = [...style.matchAll(new RegExp("(?:^|;)\\s*" + prop + ":\\s*([^;]+)", "g"))];
  return all.length ? all[all.length - 1][1].trim() : "";
};
const FAINT_TEXT = /^var\(--(?:ink-faint|text-faint|hairline)[,)]/;
const BRIGHT_TEXT = new RegExp("^var\\(--" + FAMILY + "(?:-light|-deep)?[,)]");
const WHITE = /^(?:#fff|#ffffff|white|var\(--text-on-grape\))$/i;
const BRIGHT_FILL = new RegExp("^(?:var\\(--" + FAMILY + "(?:-light)?[,)]|color-mix\\(in srgb, var\\(--" + FAMILY + "(?:-light)?\\))", "i");
const INK_MARK = /^var\(--(?:ink|[a-z]+-ink|hero-text|btn-primary-text)[,)]/;
/* And measured: where one tag sets both its text colour and an opaque fill,
   the pair is resolved through THIS app's colour tokens (css/tokens/colors.css
   — swim and skate fill the same names with different values) and must reach
   4.5:1, or 3:1 for large text (24px+, or 19px+ at weight 700+) as the tag
   itself sizes it. A tag that fades itself (opacity) is a disabled state and
   is left to the screenshot scan. */
const TOKENS = Object.fromEntries([...fs.readFileSync(new URL("../../css/tokens/colors.css", import.meta.url), "utf8")
  .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
function rgbOf(v, depth = 0) {
  v = String(v || "").trim();
  if (depth > 12 || !v) return null;
  let m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (m) return TOKENS[m[1]] != null ? rgbOf(TOKENS[m[1]], depth + 1) : (m[2] ? rgbOf(m[2], depth + 1) : null);
  if (/^#fff$/i.test(v) || /^white$/i.test(v)) return [255, 255, 255];
  m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3]];
  m = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%\s*,\s*(.+)\)$/);
  if (m) { const a = rgbOf(m[1], depth + 1), b = rgbOf(m[3], depth + 1), p = +m[2] / 100;
    return a && b ? a.map((x, i) => x * p + b[i] * (1 - p)) : null; }
  return null;
}
const lum = (c) => c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
  .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratioOf = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function colourFails(html) {
  const fails = [];
  for (const t of tags(html)) {
    const color = lastProp(t.style, "color");
    const bg = lastProp(t.style, "background(?:-color)?");
    if (FAINT_TEXT.test(color)) fails.push({ kind: "faint text " + color, open: t.open });
    else if (BRIGHT_TEXT.test(color)) fails.push({ kind: "bright text " + color, open: t.open });
    else if (WHITE.test(color) && BRIGHT_FILL.test(bg)) fails.push({ kind: "white on " + bg, open: t.open });
    else if (color && bg && !/(?:^|;)\s*opacity:/.test(t.style)) {
      const fg = rgbOf(color), back = rgbOf(bg);
      if (!fg || !back) continue;
      const px = pxOf(t.style, "font-size"), weight = Number(lastProp(t.style, "font-weight")) || 400;
      const large = px != null && (px >= 24 || (px >= 18.66 && weight >= 700));
      const r = ratioOf(fg, back);
      if (r < (large ? 3 : 4.5)) fails.push({ kind: "contrast " + r.toFixed(2) + (large ? " (large, needs 3)" : " (needs 4.5)") + " " + color + " on " + bg, open: t.open });
    }
  }
  for (const m of String(html).matchAll(/<[a-zA-Z][\w-]*\s[^>]*style="([^"]*)"[^>]*>\s*✓\s*</g)) {
    const color = lastProp(m[1], "color");
    if (color && !INK_MARK.test(color)) fails.push({ kind: "✓ mark in " + color, open: m[0] });
  }
  return fails;
}

const unsized = new Set();
/* Scan one rendered screen; return every failure. Text floor 13px on kid
   AND grown-up screens (R4 PR 7: the grown-up tabs joined the floor). */
function scan(screen, html, { kid }) {
  const fails = colourFails(html);
  for (const t of tags(html)) {
    for (const px of fontSizes(t.style)) {
      if (px < (kid ? KID_FONT_MIN : ADULT_FONT_MIN)) fails.push({ kind: "font", px, open: t.open });
    }
    if (t.tag !== "button") continue;
    const mh = pxOf(t.style, "min-height");
    if (mh === null) { unsized.add(screen + ": " + (t.action || t.open.slice(0, 80))); continue; }
    const floor = !kid ? ADULT_TAP_MIN
      : (screen.startsWith("session") && t.action === "advance") ? DONE_TAP_MIN
      : (DESIGN_TAP[t.action] || KID_TAP_MIN);
    if (mh < floor) fails.push({ kind: "tap", px: mh, floor, open: t.open });
  }
  return fails;
}
const show = (fails) => fails.map(f => f.kind + (f.px != null ? " " + f.px + "px" : "")
  + (f.floor ? " (floor " + f.floor + ")" : "") + " in " + f.open.slice(0, 160)).join("\n    ");
const clean = (screen, html, opts) => {
  const fails = scan(screen, html, opts);
  ok(fails.length === 0, screen + ": nothing under the size floor or against the contrast rules\n    " + show(fails));
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
/* R5: the calm buttons are the neutral slots — filled, no border. */
const CALM = /^(?=.*border:none;)(?=.*background:var\(--btn-neutral-bg,var\(--surface\)\))(?=.*color:var\(--btn-neutral-text,var\(--ink\)\))(?=.*box-shadow:0 4px 0 var\(--btn-neutral-edge,var\(--hairline\)\))/;
for (const [st, [snap, extra, state]] of Object.entries(STATES)) {
  for (const layout of Object.keys(LAYOUTS)) {
    const html = draw(snap, layout, extra, state);
    clean("session " + st + " " + layout, html, { kid: true });
    drawn++;
    /* Done is the one big action on the btn-go slots (22px weight 900); STOP
       keeps white on the stop fill; Pause, Resume and Skip are calm buttons on
       the neutral slots (R5). */
    const done = tags(html).find(t => t.tag === "button" && t.action === "advance");
    ok(done && pxOf(done.style, "min-height") >= DONE_TAP_MIN && pxOf(done.style, "font-size") >= 20
       && /font-weight:900/.test(done.style)
       && /background:var\(--btn-go-bg,/.test(done.style) && /color:var\(--btn-go-text,/.test(done.style),
       "session " + st + " " + layout + ": Done is 64px, 20px+ weight 900, on the btn-go slots");
    if (st === "skipAsk") {
      const keep = tags(html).find(t => t.tag === "button" && t.action === "cancelSkip");
      ok(keep && /background:var\(--btn-go-bg,/.test(keep.style) && /color:var\(--btn-go-text,/.test(keep.style)
         && pxOf(keep.style, "font-size") >= 18 && /font-weight:900/.test(keep.style),
         "session skipAsk " + layout + ": Keep going is on the btn-go slots, 18px+ weight 900");
      const skipIt = tags(html).find(t => t.tag === "button" && t.action === "confirmSkipEx");
      ok(skipIt && CALM.test(skipIt.style), "session skipAsk " + layout + ": Skip it is on the neutral slots, no border");
    }
    const pause = tags(html).find(t => t.tag === "button" && t.action === "pauseTimer");
    ok(pause && CALM.test(pause.style), "session " + st + " " + layout + ": " + (st === "paused" ? "Resume" : "Pause") + " is on the neutral slots, no border");
    const skip = tags(html).find(t => t.tag === "button" && t.action === "askSkip");
    if (skip) { skipsSeen++; ok(CALM.test(skip.style), "session " + st + " " + layout + ": Skip is on the neutral slots, no border"); }
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
      ok(/background:var\(--btn-go-bg,var\(--aqua-deep\)\);color:var\(--btn-go-text,#fff\);/.test(cleanBtn.style)
         && /box-shadow:0 4px 0 var\(--btn-go-edge,var\(--aqua-ink\)\)/.test(cleanBtn.style),
         "session formcheck " + layout + ": the clean button is on the Go slots");
      /* R5: every normal kid button is 18px weight 900 on 56px. */
      ok(pxOf(cleanBtn.style, "font-size") >= 18 && /font-weight:900/.test(cleanBtn.style) && pxOf(cleanBtn.style, "min-height") >= KID_TAP_MIN,
         "session formcheck " + layout + ": the clean button is 18px+ weight 900, 56px");
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
/* The ring names the zone in its ring slot's -ink shade (R5: ready / work /
   rest slots); the arc is a gradient from the slot's -light to its colour. */
for (const st of ["timed", "rest", "getready"].filter(k => snaps[k])) {
  for (const layout of Object.keys(LAYOUTS)) {
    const html = draw(snaps[st], layout);
    const label = (html.match(/letter-spacing:0\.12em;color:([^;]*);text-align:center;">/) || [])[1];
    const arc = (html.match(/id="s-ring-arc"[^>]*\sstroke="([^"]*)"/) || [])[1];
    const zone = ((label || "").match(/^var\(--ring-(ready|work|rest)-ink,var\(--(?:aqua|sun|mint)-ink\)\)$/) || [])[1];
    ok(zone && /font-size:13px;font-weight:900;letter-spacing:0\.12em;/.test(html),
       st + " " + layout + ": the ring's zone label is 13px in its ring slot's -ink (" + label + ")");
    ok(arc === "url(#s-ring-grad-" + zone + ")"
       && new RegExp('<linearGradient id="s-ring-grad-' + zone + '"[^>]*>\\s*<stop offset="0" style="stop-color:var\\(--ring-' + zone + '-light,[^"]*"></stop>\\s*<stop offset="1" style="stop-color:var\\(--ring-' + zone + ',').test(html)
       && new RegExp('fill="var\\(--ring-' + zone + '-fill,var\\(--surface\\)\\)" stroke="var\\(--ring-' + zone + '-light,var\\(--surface-2\\)\\)"').test(html),
       st + " " + layout + ": and the arc is the " + zone + " gradient (-light → colour) on a -light track round a -fill centre (" + arc + ")");
  }
}
ok(/var\(--ring-work-ink,var\(--aqua-ink\)\);">BY REPS/.test(draw(snaps.reps, "narrow")), "the rep ring says BY REPS in the work ring's -ink");
ok(/data-action="toggleRail"[^>]*width:48px;height:48px/.test(draw(snaps.timed, "roomy")),
   "the rail's hide/show toggle is 48px");
ok(/data-action="toggleRail"/.test(draw(snaps.timed, "roomy", {}, { railOpen: false })),
   "and with the rail hidden it is still there to bring it back");
clean("session rail hidden", draw(snaps.timed, "roomy", {}, { railOpen: false }), { kid: true });

/* THE LAST THREE SECONDS (R5). The countdown ticks with targeted writes
   (updateSessionTick), never a full render, so whatever "urgent" looks like
   has to be written by the tick itself: the arc and the time go red, the zone
   word goes stop-ink and the ring pulses on a ROUND wrapper — and all of it
   goes back to the zone's own colours when the clock is not urgent. The DOM
   here is the rendered page's own elements, read back by id. */
{
  const domOf = (html) => {
    const els = {};
    for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\s([^>]*\bid="([^"]+)"[^>]*)>/g)) {
      const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
      const style = {};
      for (const decl of (attrs.style || "").split(";")) {
        const at = decl.indexOf(":");
        if (at > 0) style[decl.slice(0, at).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decl.slice(at + 1).trim();
      }
      els[m[3]] = { id: m[3], attrs, style, textContent: "",
        getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); } };
    }
    return els;
  };
  for (const layout of ["roomy", "narrow"]) {
    engine.exitSession(); Object.assign(engine.sess, snaps.timed);
    const vm = svm.buildSessionVM({ inSession: true, detailOverlay: false, detailEx: null, ...LAYOUTS[layout] });
    const calm = { ...vm, timerUrgent: false };
    const els = domOf(sscreen.sessionScreen(calm));
    const realGet = document.getElementById;
    document.getElementById = (id) => els[id] || null;
    try {
      const zoneStroke = (els["s-ring-arc"] || { attrs: {} }).attrs.stroke;
      sscreen.updateSessionTick({ ...calm, timerUrgent: true });
      const ring = els["s-ring"], label = els["s-ring-label"], time = els["s-timer-text"], arc = els["s-ring-arc"];
      ok(ring && /pulse-ring/.test(ring.style.animation || "") && ring.style.borderRadius === "50%",
         "pulse " + layout + ": in the last seconds the tick pulses the ring on a round wrapper (" + JSON.stringify(ring && ring.style) + ")");
      ok(label && label.style.color === "var(--stop-ink)", "pulse " + layout + ": the zone word turns stop-ink");
      ok(time && time.style.color === "var(--stop-deep)", "pulse " + layout + ": the time turns stop-deep red (≥ 3:1 on every ring fill)");
      ok(arc && arc.getAttribute("stroke") === "var(--stop)", "pulse " + layout + ": the arc turns var(--stop)");
      sscreen.updateSessionTick(calm);
      ok(ring && !/pulse-ring/.test(ring.style.animation || "") && arc.getAttribute("stroke") === zoneStroke
         && /^url\(#/.test(zoneStroke || "") && label.style.color === vm.timerZoneInk && time.style.color === "var(--ink)",
         "pulse " + layout + ": and back to the zone's own gradient, ink and no pulse when not urgent (" + zoneStroke + ")");
    } finally { document.getElementById = realGet; }
  }
}
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
  ok(back && pxOf(back.style, "min-height") >= DONE_TAP_MIN && pxOf(back.style, "font-size") === 22 && /font-weight:900/.test(back.style)
     && /background:var\(--btn-primary-bg,var\(--action-bg\)\)/.test(back.style) && /color:var\(--btn-primary-text,var\(--action-text\)\)/.test(back.style),
     "finish " + st + ": the last button is 64px, 22px weight 900, on the main-colour (btn-primary) slots");
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
  ok(redo && /background:var\(--btn-primary-bg,var\(--action-bg\)\)/.test(redo.style) && /color:var\(--btn-primary-text,var\(--action-text\)\)/.test(redo.style)
     && /box-shadow:0 4px 0 var\(--btn-primary-edge,var\(--action-edge\)\)/.test(redo.style)
     && pxOf(redo.style, "min-height") >= KID_TAP_MIN && pxOf(redo.style, "font-size") >= 18,
     "finish: Redo these is on the btn-primary slots, 56px, 18px");
  const back = tags(open).find(t => t.tag === "button" && t.action === "exitSession");
  ok(/background:var\(--btn-primary-bg,/.test(back.style) && /color:var\(--btn-primary-text,/.test(back.style) && />🏠 Back to Today</.test(open),
     "finish: 🏠 Back to Today is on the main-colour (btn-primary) slots");
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
    const exit = tags(html).find(t => t.tag === "button" && t.action === "exitQuizDeck" && /aria-label="Exit quiz"/.test(t.open));
    if (st !== "results") ok(exit && pxOf(exit.style, "width") >= 48 && pxOf(exit.style, "height") >= 48 && pxOf(exit.style, "min-height") >= 48,
       "quiz deck " + st + ": the ✕ exit is a 48px round close, like the move card's");
    if (st !== "results") {
      const opts = tags(html).filter(t => t.tag === "button" && t.action === "answerQuizDeck");
      ok(opts.length > 1 && opts.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN),
         "quiz deck " + st + ": its " + opts.length + " options are 56px");
    }
  }
}

/* ---- 2c. THE PRIZE DRAW (R4 PR 7): envelopes, then a picked prize ------ */
{
  const pd = overlays.newPrizeDraw();
  for (const [st, d] of [["envelopes", pd], ["picked", { ...pd, picked: 0 }]]) {
    const html = overlays.prizeDrawHtml(d);
    clean("prize draw " + st, html, { kid: true });
    const close = tags(html).find(t => t.tag === "button" && t.action === "closePrizeDraw");
    ok(close && pxOf(close.style, "width") >= 48 && pxOf(close.style, "height") >= 48 && pxOf(close.style, "min-height") >= 48,
       "prize draw " + st + ": the ✕ is a 48px round close");
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
  ok(/background:var\(--journey-bg,/.test(map) && !/<linearGradient|<ellipse|rgba\(0,0,0,/.test(map),
     "journey map " + name + ": painted from the journey-bg slot (no painted sky, ellipses or dark band)");
  ok(!/#CDEDE7/i.test(map), "journey map " + name + ": the old fixed 80% stop is gone");
  ok(/color:var\(--journey-text,#fff\)/.test(map), "journey map " + name + ": its words take the journey-text slot");
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
  const HERO = /background:var\(--hero-bg,linear-gradient\(165deg,var\(--aqua-light\) 0%,var\(--aqua\) 70%\)\);color:var\(--hero-text,#fff\);/;
  for (const [name, [layout, extra]] of Object.entries(VIEWS)) {
    const { vm, html } = T(layout, extra);
    const label = "today " + name;
    clean(label, html, { kid: true });
    ok(vm.dayView.isActive && vm.dayView.showBlocksList && vm.dayView.showExplore, label + ": drawn on an active day (" + day + ")");
    ok(HERO.test(html) && !/var\(--aqua-deep\) 100%/.test(html), label + ": the day card is on the hero-bg slot (fallback Card A 0 → 70%, no aqua-deep end)");
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
    ok(/color:var\(--ring-work-ink,var\(--aqua-ink\)\);flex-shrink:0;">›<\/span>/.test(html), label + ": the Quiz Deck chevron is the work ring's -ink");
    ok(html.includes("<span>⚡\uFE0F</span> " + vm.dayView.movesLabel), label + ": the moves chip asks for emoji ⚡️");
    ok(/background:var\(--hero-chip,rgba\(255,255,255,0\.18\)\);border-radius:var\(--radius-pill\);/.test(html), label + ": chips on the hero-chip slot");
    /* Faded words on the day card measured under 4.5:1 (PR 4) are full strength
       now; only the block-row count (5.2+ measured) and the • bullet keep one. */
    const dayCardHtml = section(html, "70%));color:var(--hero-text,#fff);");
    const faded = tags(dayCardHtml).filter(t => /(?:^|;)opacity:/.test(t.style));
    ok(dayCardHtml.length > 0 && faded.every(t => /text-align:right;/.test(t.style) || t.style === "opacity:0.7;flex-shrink:0;"),
       label + ": no faded text on the day card except the block-row count and the bullet");
    const go = tags(html).find(t => t.tag === "button" && t.action === vm.dayView.ctaAction);
    ok(go && /background:var\(--btn-primary-bg,var\(--action-bg\)\);color:var\(--btn-primary-text,var\(--action-text\)\);/.test(go.style)
       && pxOf(go.style, "font-size") === 22 && pxOf(go.style, "min-height") === 64,
       label + ": \"Let's go\" is on the main-colour (btn-primary) slots, 22px, 64px");
    const explore = tags(html).find(t => t.tag === "button" && t.action === "goExplore");
    ok(explore && /background:var\(--btn-neutral-bg,/.test(explore.style) && /border:none;/.test(explore.style) && pxOf(explore.style, "min-height") === 56,
       label + ": Explore is a 56px calm (neutral) filled button");
    const map2 = section(html, 'id="journey-map-card"');
    ok(/background:rgba\(255,255,255,0\.55\);border-radius:9px;overflow:hidden;">\s*<div style="width:[\d.]+%;height:100%;background:var\(--xp-bar,var\(--sun\)\);/.test(map2),
       label + ": the journey XP bar is on the points-bar (xp-bar) slot on a white 55% track");
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
    /* The result card: title in the light's -ink; Start 64px / 22px / 900 (R5);
       grown-up summary and light picker 48px. */
    if (/data-body-result/.test(html)) {
      const vm = rvm.buildReadinessVM(r, wide);
      ok(vm.light.titleInk && html.includes("color:" + vm.light.titleInk + ";line-height:1.1;\">" + vm.light.label),
         name + ": the light's title is in " + vm.light.titleInk);
      const start = tags(html).find(t => t.tag === "button" && pxOf(t.style, "font-size") === 22
        && (t.action === "rResultCta" || / disabled /.test(t.open)));
      ok(start && pxOf(start.style, "min-height") >= DONE_TAP_MIN && /font-weight:900/.test(start.style),
         name + ": Start is 64px, 22px, weight 900");
      if (r.light === "green" && vm.mayStart)
        ok(/background:var\(--btn-go-bg\);color:var\(--btn-go-text\);/.test(start.style) && /box-shadow:0 4px 0 var\(--btn-go-edge\)/.test(start.style),
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
  ok(/background:var\(--hero-bg,linear-gradient\(165deg,var\(--aqua-light\) 0%,var\(--aqua\) 70%\)\);color:var\(--hero-text,#fff\);/.test(html),
     "readiness " + (wide ? "wide" : "narrow") + ": the hero panel is painted from the hero-bg slot");
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

/* ---- 4b. PROGRESS (PR 6): empty and with data, three layouts ---------- */
/* Every text on Progress ≥ 13px, every button ≥ 56; the week table in
   ink / ink-soft; below 900px wide the prizes stack under the table. */
const drawP = (layout, extra = {}) => {
  const vm = pvm.buildProgressVM({ progressScope: "4w", logScope: "week", ...LAYOUTS[layout], ...extra });
  return { vm, html: pscreen.progressScreen(vm) };
};
const progressChecks = (label) => {
  for (const layout of Object.keys(LAYOUTS)) {
    const { vm, html } = drawP(layout);
    const name = "progress " + label + " " + layout;
    clean(name, html, { kid: true });
    const table = section(html, "<table");
    ok(table.length > 0 && !/var\(--ink-faint\)/.test(table), name + ": the week table has no ink-faint text");
    ok(/>DAY STREAK</.test(table), name + ": the streak corner still says DAY STREAK");
    const stacked = layout !== "roomy";
    ok(vm.stackPrizes === stacked && html.includes('data-progress-top="' + (stacked ? "stacked" : "side") + '"'),
       name + ": the prizes " + (stacked ? "stack under the table (below 900px)" : "sit beside the table"));
    const prizes = tags(html).find(t => /data-prizes="1"/.test(t.open));
    ok(prizes && (stacked ? /^width:100%;/.test(prizes.style) : /^flex:1;min-width:220px;/.test(prizes.style)),
       name + ": the prizes card is " + (stacked ? "full width" : "the side column"));
    for (const act of ["progressScope", "logScope"]) {
      const tabs = tags(html).filter(t => t.tag === "button" && t.action === act);
      ok(tabs.length > 1 && tabs.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN && pxOf(t.style, "font-size") >= 15),
         name + ": the " + act + " chips are 56px, 15px");
    }
  }
};
/* With data: the session section 1 saved last (dated today on the test
   clock), plus a prize in the wallet and one already used. */
store.saveJourney({ ...(store.loadJourney() || {}), prizesWon: [
  { id: "pz-1", label: "Movie night", icon: "🎬", wonAt: Date.now(), redeemed: false },
  { id: "pz-2", label: "Ice cream", icon: "🍦", wonAt: Date.now() - 86400000, redeemed: true, redeemedAt: Date.now() - 86400000 }] });
const withData = drawP("roomy").vm;
ok(withData.weekDays.some(d => d.hasWork) && withData.hasPrizes && withData.hasLog,
   "progress with data: a trained day in the week, prizes and a log entry to draw");
progressChecks("with data");
ok(tags(drawP("roomy").html).filter(t => t.tag === "button" && t.action === "redeemPrize").every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN),
   "progress with data: Redeem is a 56px button");

/* ---- 5. THE GROWN-UP ZONE, every tab (PR 6; tap floor 48) --------------- */
const GU_TABS = ["overview", "analytics", "formcheck", "coaching", "library", "settings"];
const drawG = (tab, extra = {}) => gscreen.grownupScreen({ ...gvm.buildGrownupVM({ gsScope: "week", grownupTab: tab, isWide: true, ...extra }), grownupUnlocked: true });
const guScan = (label) => { for (const tab of GU_TABS) {
  for (const wide of [true, false]) {
    const html = drawG(tab, { isWide: wide });
    clean("grownup " + label + " " + tab + (wide ? " wide" : " narrow"), html, { kid: false });
    const tabsBtns = tags(html).filter(t => t.tag === "button" && t.action === "setGuTab");
    ok(tabsBtns.length === 6 && tabsBtns.every(t => pxOf(t.style, "min-height") >= ADULT_TAP_MIN && pxOf(t.style, "font-size") >= 15),
       "grownup " + tab + ": the six tabs are 48px, 15px");
    if (tab === "overview" || tab === "analytics") {
      const scopes = tags(html).filter(t => t.tag === "button" && t.action === "setGsScope");
      ok(scopes.length === 3 && scopes.every(t => pxOf(t.style, "min-height") >= ADULT_TAP_MIN && pxOf(t.style, "font-size") >= 15),
         "grownup " + tab + ": the period chips are 48px, 15px");
    }
  }
} };
guScan("with data");
{
  /* Analytics carries the Progress week table — the same function, the same rows. */
  const html = drawG("analytics");
  const week = section(html, 'data-analytics-week="1"');
  const pv = pvm.buildProgressVM({});
  ok(week.length > 0 && week.includes(pscreen.weekTable({ weekDays: pv.analyticsWeek, dayStreakVal: pv.dayStreakVal })),
     "grownup analytics: the Progress week table is drawn, from the Progress rows");
  ok(html.indexOf('data-analytics-week="1"') < html.indexOf("Is she trying?"), "grownup analytics: near the top, after At a glance");
  ok(pv.analyticsWeek.some(d => d.hasWork && /^\d+\/\d+$/.test(d.performancesLabel) && week.includes(">" + d.performancesLabel + "<")),
     "grownup analytics: with the exact counts (" + pv.analyticsWeek.filter(d => d.hasWork).map(d => d.performancesLabel).join(", ") + ")");
  /* A2: every note on Analytics is 13px+ and none of it is ink-faint. */
  const body = html.slice(html.indexOf("Coach analytics"));
  const small = tags(body).flatMap(t => fontSizes(t.style).filter(px => px < 13).map(px => px + "px in " + t.open.slice(0, 100)));
  ok(small.length === 0, "grownup analytics: no text under 13px\n    " + small.join("\n    "));
  ok(!/var\(--ink-faint\)/.test(body), "grownup analytics: no ink-faint text");
}
{
  /* A3: the library, one fold per block, the first open, every move kept. */
  const vm = gvm.buildGrownupVM({ gsScope: "week", grownupTab: "library", isWide: true });
  const flat = new Set();
  Object.values(data.DAYS).forEach(day => Object.values(day.blocks || {}).flat().concat(day.prepMenu || [], day.recovery || [])
    .forEach(ex => { if (ex && ex.name) flat.add(ex.name); }));
  const html = drawG("library");
  const folds = (html.match(/<details data-lib-block="[^"]*"( open)?>/g) || []);
  ok(vm.libraryGroups.length > 1 && folds.length === vm.libraryGroups.length,
     "grownup library: one fold per block (" + vm.libraryGroups.map(g => g.label + " " + g.count).join(", ") + ")");
  ok(/ open>$/.test(folds[0]) && folds.slice(1).every(f => !/ open>$/.test(f)), "grownup library: the first fold is open, the rest closed");
  ok(vm.libraryGroups.reduce((n, g) => n + g.count, 0) === flat.size && vm.libraryList.length === flat.size
     && (html.match(/▶ Watch the move</g) || []).length === flat.size,
     "grownup library: every move is kept — " + flat.size + " moves, the old flat count");
  ok(vm.libraryGroups.every(g => g.label === (data.BLOCK_LABEL[g.block] || g.block)), "grownup library: each fold is named by BLOCK_LABEL");
  const order = [...data.BLOCK_ORDER, "prep", "recovery"];
  ok(vm.libraryGroups.every((g, i, a) => i === 0 || order.indexOf(a[i - 1].block) < order.indexOf(g.block)),
     "grownup library: folds in the order a day runs its blocks");
  ok(/<summary style="min-height:48px;[^"]*font-size:15px;/.test(html), "grownup library: each fold's summary is 48px, 15px");
}
{
  /* A4: the ladder rungs are 48px circles, 15px. */
  const rungs = tags(drawG("coaching")).filter(t => t.tag === "button" && t.action === "setLadderRung");
  ok(rungs.length > 0 && rungs.every(t => pxOf(t.style, "width") === 48 && pxOf(t.style, "height") === 48 && pxOf(t.style, "font-size") >= 15),
     "grownup coaching: the " + rungs.length + " ladder rungs are 48px circles, 15px");
}

/* Empty: a fresh profile, Progress and every Grown-up tab again. */
localStorage.clear(); store.migrate();
progressChecks("empty");
guScan("empty");

/* ---- 6. THE NAV SHELL: rail and bottom nav labels 13px, buttons 56px ---- */
{
  const tv = tvm.buildTodayVM({ expanded: {}, isWide: true });
  for (const [name, html] of [["rail", shell.shellWithRail(tv, "")], ["bottom nav", shell.bottomNav(tv)]]) {
    clean("nav " + name, html, { kid: true });
    const navs = tags(html).filter(t => t.tag === "button" && t.action === "nav");
    ok(navs.length === 3 && navs.every(t => pxOf(t.style, "min-height") >= KID_TAP_MIN), "nav " + name + ": three 56px nav buttons");
    ok((html.match(/font-size:13px;font-weight:900;color:var\(--(aqua-ink|ink-soft)\);">(Today|Progress|Grown-up)</g) || []).length === 3,
       "nav " + name + ": labels 13px");
  }
}

/* ---- 7. TODAY: "+ Add them back" on a partly skipped day is 56px -------- */
{
  const tv = tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: true });
  const html = tscreen.todayWide({ ...tv, dayView: { ...tv.dayView, partialSkipLabel: "2 moves skipped" } });
  const redo = tags(html).find(t => t.tag === "button" && t.action === "goSessionRedo");
  ok(redo && pxOf(redo.style, "min-height") >= KID_TAP_MIN && />\+ Add them back</.test(html), "today: + Add them back is 56px");
  ok(tv.dayView.isActive ? html.includes("<span>⏱️</span> ") : true, "today: the minutes chip asks for emoji ⏱️");
}

/* Body Check with yesterday's answers beside today's (drawn last: it saves a check). */
store.saveReadiness({ answers: { q_sleep: "yes", q_light: "no", q_ready: "yes", q_pain: "no" }, zoneSev: { 2: 2 }, light: "yellow" });
for (const wide of [true, false]) {
  const html = drawR(rvm.newReadinessFlow(today), wide);
  ok(/Yesterday/.test(html), "readiness yesterday " + (wide ? "wide" : "narrow") + ": yesterday's column is drawn");
  clean("readiness yesterday " + (wide ? "wide" : "narrow"), html, { kid: true });
}

/* ---- 8. THE CONTRAST RULES CATCH WHAT PR 7 FIXED (R4 PR 7) --------------
   Each cluster the PR 7 scan found, as the markup that drew it, must still
   fail the rules above — so the rules cannot quietly stop catching them. */
{
  const CAUGHT = {
    "white ✓ in a mint week circle": '<div style="width:30px;height:30px;border-radius:50%;background:var(--mint);color:#fff;font-size:15px;">✓</div>',
    "white number in a mint done pill": '<span style="width:24px;height:24px;font-size:13px;font-weight:900;background:var(--mint);color:#fff;">1</span>',
    "white ↺ on a sun circle": '<div style="background:var(--sun);color:#fff;font-size:15px;">↺</div>',
    "white ✓ on the mint-light partial circle": '<span style="font-size:13px;background:color-mix(in srgb, var(--mint) 55%, #fff);color:#fff;">✓</span>',
    "mint ✓ mark on white": '<span style="font-size:17px;color:var(--mint);">✓</span>',
    "aqua ▶ current mark": '<span style="font-size:17px;color:var(--aqua);">▶</span>',
    "done move name in ink-faint": '<span style="font-weight:800;color:var(--ink-faint);text-decoration:line-through;font-size:17px;">Jump Rope</span>',
    "prize-pool ✕ in ink-faint": '<button type="button" style="min-height:48px;color:var(--ink-faint);font-size:15px;">✕</button>',
    "white Add on aqua": '<button type="button" style="min-height:48px;background:var(--aqua);color:#fff;font-size:13px;">Add</button>',
    "small coral word": '<button type="button" style="min-height:48px;color:var(--coral);font-size:14px;">✗ Not yet</button>',
    "small sun-ink on sun (3.5 swim, 4.0 skate)": '<button type="button" style="min-height:56px;background:var(--sun);color:var(--sun-ink);font-weight:900;font-size:14px;">Wobbly</button>'
  };
  for (const [name, html] of Object.entries(CAUGHT)) ok(colourFails(html).length > 0, "contrast rules: still catch " + name);
  ok(colourFails('<span style="font-size:13px;background:var(--mint-wash);color:var(--mint-ink);">✓</span>').length === 0
     && colourFails('<div style="font-size:15px;background:var(--sun);color:var(--ink);">↺</div>').length === 0,
     "contrast rules: and pass the fixes (mint-ink on mint-wash, ink on sun)");
  const fontFails = scan("grown-up probe", '<div style="font-size:12px;color:var(--ink-soft);">Settings label</div>', { kid: false });
  ok(fontFails.some(f => f.kind === "font"), "grown-up screens have the 13px text floor too");
}

/* ---- 9. ONE BUTTON, ONE CORNER RULE, NO PURPLE, THE DECORATION (R5) ------
   Every filled kid button on Today, the timer, the finish screen, Progress,
   the Quiz Deck and the prize draw is ONE button: the primary, go, stop or
   neutral slots (a marked quiz answer keeps its mint / coral, Wobbly its sun),
   no border, the 16px corner, a 4px bottom edge, the UI font at 900, and two
   sizes — 22px on 64px for a screen's main action, 18px on 56px for the rest
   (STOP 20px). A "filled button" is any button with a candy bottom edge or a
   btn slot fill, so a new one cannot drift by leaving the slots. */
{
  const KID_SCREENS = [];
  const add = (name, html) => KID_SCREENS.push([name, html]);
  store.updateSettings({ heroDecorOn: true });
  for (const [st, [snap, extra, state]] of Object.entries(STATES))
    for (const layout of Object.keys(LAYOUTS)) add("session " + st + " " + layout, draw(snap, layout, extra, state));
  engine.exitSession();
  for (const [st, vm] of Object.entries(FINISH)) add("finish " + st, sscreen.sessionScreen(vm));
  for (const layout of Object.keys(LAYOUTS)) {
    const vm = tvm.buildTodayVM({ selectedDay: today, expanded: {}, ...LAYOUTS[layout] });
    add("today " + layout, layout === "narrow" ? tscreen.todayNarrow(vm) : tscreen.todayWide(vm));
    add("progress " + layout, pscreen.progressScreen(pvm.buildProgressVM({ progressScope: "4w", logScope: "week", ...LAYOUTS[layout] })));
  }
  {
    const tv = tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: true });
    add("today partly skipped", tscreen.todayWide({ ...tv, dayView: { ...tv.dayView, partialSkipLabel: "2 moves skipped" } }));
    add("today finished day", tscreen.todayWide({ ...tv, dayView: { ...tv.dayView, ctaVariant: "secondary",
      ctaButtonStyle: tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: true }).dayView.ctaButtonStyle } }));
  }
  const deck = overlays.buildQuizDeck(8);
  add("quiz deck question", overlays.quizDeckHtml({ ...deck, idx: 0, picks: [] }));
  add("quiz deck answered", overlays.quizDeckHtml({ ...deck, idx: 0, picks: [deck.qs[0].opts.findIndex(o => !o.ok)] }));
  add("quiz deck results", overlays.quizDeckHtml({ ...deck, done: true, scored: true, picks: deck.qs.map(q => q.opts.findIndex(o => o.ok)),
    bank: { mastered: 3, total: 40, left: 37 }, leveledUp: true, xpEarned: 20 }));
  add("prize draw picked", overlays.prizeDrawHtml({ ...overlays.newPrizeDraw(), picked: 0 }));

  const EDGE = /box-shadow:(?:inset 0 0 0 3px [^,;]+,)?0 (\d+)px 0 /;
  const SLOT = /background:var\(--btn-(primary|go|stop|neutral)-bg,/;
  const MARKED = /background:var\(--(mint|coral)-wash\);color:var\(--\1-ink\);box-shadow:inset 0 0 0 3px var\(--\1\),0 4px 0 var\(--\1-deep\)/;
  const BIG_ACTIONS = new Set(["advance", "exitSession", "openPrizeDraw", "claimPrize", "goSession", "goSessionResume", "startDay"]);
  let filled = 0;
  const kinds = new Set();
  for (const [name, html] of KID_SCREENS) {
    for (const t of tags(html)) {
      if (!(t.tag === "button" || (t.tag === "a" && t.action))) continue;
      const edge = t.style.match(EDGE), slot = t.style.match(SLOT);
      if (!edge && !slot) continue;
      // A chosen tab or chip (a pill on the main colour, no edge) is a tab, not a button.
      if (!edge && /border-radius:var\(--radius-pill\)/.test(t.style)) continue;
      filled++;
      const who = name + ": " + (t.action || t.open.slice(0, 60));
      const marked = MARKED.test(t.style);
      const wobbly = t.action === "pickWobbly" && /background:var\(--sun\);color:var\(--ink\);box-shadow:0 4px 0 var\(--sun-deep\);/.test(t.style);
      ok(slot || marked || wobbly, who + " — a filled kid button is on the primary, go, stop or neutral slots (" + t.style.slice(0, 120) + ")");
      if (slot) kinds.add(slot[1]);
      ok(edge && edge[1] === "4", who + " — its bottom edge is 4px (" + (edge ? edge[1] : "none") + ")");
      ok(/(?:^|;)border:none;/.test(t.style) && /border-radius:var\(--radius-md\);/.test(t.style),
         who + " — no border and the 16px corner (var(--radius-md))");
      ok(/font-family:var\(--font-ui\);font-weight:900;/.test(t.style), who + " — the UI font at weight 900");
      const px = pxOf(t.style, "font-size"), mh = pxOf(t.style, "min-height");
      const sized = t.action === "stopNow" ? px === 20
        : px === 22 ? mh >= DONE_TAP_MIN
        : px === 18 && mh >= KID_TAP_MIN;
      ok(sized, who + " — 22px on 64px or 18px on 56px (STOP 20px); got " + px + "px on " + mh + "px");
      if (/var\(--btn-stop-bg/.test(t.style)) ok(t.action === "stopNow", who + " — red (the stop slot) is only ever STOP on a kid screen");
      if (BIG_ACTIONS.has(t.action) && slot) ok(px === 22, who + " — a screen's main action is the big size");
    }
  }
  ok(filled > 150 && ["primary", "go", "stop", "neutral"].every(k => kinds.has(k)),
     "checked " + filled + " filled kid buttons across " + KID_SCREENS.length + " screens, on all four slot families (" + [...kinds].join(", ") + ")");

  /* No purple on kid screens: grape is recovery's colour, and none of these
     screens is a recovery screen. */
  for (const [name, html] of KID_SCREENS) {
    if (name.startsWith("progress")) continue;   // Progress shows the recovery legend and care days
    ok(!/var\(--(?:grape|btn-grape-bg)[,)-]/.test(html), name + ": no grape (purple) on a kid button, card or ring");
  }

  /* Corners: the frame is radius-xl, cards inside it radius-lg, rows radius-md. */
  const sess = KID_SCREENS.find(([n]) => n === "session timed roomy")[1];
  ok(/^\s*<div style="display:flex;flex-direction:column;background:var\(--surface\);border-radius:var\(--radius-xl\);box-shadow:var\(--shadow-frame\);/.test(sess),
     "the session frame is radius-xl with the frame shadow token");
  const rowsOk = tags(section(sess, "data-ex-list")).filter(t => t.action === "openDetailAt" || t.action === "goToMove");
  ok(rowsOk.length > 0 && rowsOk.every(t => /border-radius:var\(--radius-md\);/.test(t.style)), "every timer move row is radius-md");
  const tw = KID_SCREENS.find(([n]) => n === "today roomy")[1];
  ok(/<div style="width:452px;flex-shrink:0;margin:14px;border-radius:var\(--radius-lg\);background:var\(--hero-bg,/.test(tw)
     && /id="journey-map-card"[^>]*border-radius:var\(--radius-lg\);/.test(tw),
     "the Today day card and the journey card are radius-lg");
  ok((tw.match(/background:var\(--hero-row-bg,[^;]*\);color:var\(--hero-row-text,[^;]*\);border-radius:var\(--radius-md\);/g) || []).length > 1,
     "the Today block rows are on the hero-row slots, radius-md");
  const fin = KID_SCREENS.find(([n]) => n === "finish all extras")[1];
  ok(/border-radius:var\(--radius-lg\);[^"]*data-finish-quiz|border-radius:var\(--radius-lg\);padding:18px 22px;[^"]*" data-finish-quiz/.test(fin)
     && /background:var\(--finish-bg,/.test(fin), "the finish quiz card is radius-lg, on the finish-bg page");
  for (const [name, html] of KID_SCREENS)
    ok(!/border-radius:(?:12|14|20|26)px/.test(html), name + ": no hard-coded 12/14/20/26px card or row corner left");

  /* The decoration: drawn on every hero when on — aria-hidden, untappable,
     behind the content — never on the timer's right side, the finish screen
     or the Grown-up Zone, and not drawn at all when off. */
  const DECOR = /<div aria-hidden="true" data-hero-decor="1" style="position:absolute;inset:0;z-index:-1;pointer-events:none;background:url\(\.\/assets\/hero-(?:ripples|snow)\.webp\) center top\/cover;border-radius:inherit;"><\/div>/g;
  const decorCount = (html) => (html.match(DECOR) || []).length;
  const anyDecor = (html) => (html.match(/data-hero-decor/g) || []).length;
  const heroes = () => {
    const wide = tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: true });
    const narrow = tvm.buildTodayVM({ selectedDay: today, expanded: {}, isWide: false });
    return {
      "today wide (day card + journey)": [tscreen.todayWide(wide), 2],
      "today narrow (day card + journey)": [tscreen.todayNarrow(narrow), 2],
      "body check wide": [drawR(R_STATES.questions, true), 1],
      "body check narrow": [drawR(R_STATES.questions, false), 1],
      "progress level card": [pscreen.progressScreen(pvm.buildProgressVM({ progressScope: "4w", logScope: "week", ...LAYOUTS.roomy })), 1],
      "timer rail open": [draw(snaps.timed, "roomy"), 1],
      "timer rail folded": [draw(snaps.timed, "roomy", {}, { railOpen: false }), 1],
      "timer phone (no rail)": [draw(snaps.timed, "narrow"), 0],
      "finish": [sscreen.sessionScreen({ ...FINISH.full, heroDecorOn: true }), 0],
      "grown-up settings": [drawG("settings"), 0]
    };
  };
  store.updateSettings({ heroDecorOn: true });
  for (const [name, [html, n]] of Object.entries(heroes())) {
    ok(decorCount(html) === n && anyDecor(html) === n, name + ": " + n + " decoration layer(s), aria-hidden, pointer-events none, behind the content (" + anyDecor(html) + ")");
    if (n) ok((html.match(/isolation:isolate;/g) || []).length >= n, name + ": its host isolates, so the layer stays behind the words");
  }
  const rail = draw(snaps.timed, "roomy");
  const rightPane = rail.slice(rail.indexOf("justify-content:safe center"));
  ok(!/data-hero-decor/.test(rightPane), "never behind the ring, the move name or the timer buttons");
  const levelCard = heroes()["progress level card"][0];
  ok(/<span style="display:inline-block;background:var\(--hero-chip,transparent\);border-radius:var\(--radius-pill\);[^"]*font-size:24px;[^"]*">[^<]+<\/span>/.test(levelCard),
     "progress level card: the rank name sits on the hero-chip slot");
  store.updateSettings({ heroDecorOn: false });
  for (const [name, [html]] of Object.entries(heroes())) ok(anyDecor(html) === 0, name + ": switched off, no decoration layer at all");
  store.updateSettings({ heroDecorOn: true });
  engine.exitSession();
}

/* No hard-coded navy (swim's ink) or swim cyan in shared code: shadows and
   backdrops come from each app's spacing tokens. */
{
  const dir = new URL("../", import.meta.url);
  const files = [];
  const walk = (u) => { for (const e of fs.readdirSync(u, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== "test" && e.name !== "tools") walk(new URL(e.name + "/", u)); }
    else if (/\.js$/.test(e.name)) files.push(new URL(e.name, u)); } };
  walk(dir);
  const bad = files.flatMap(f => fs.readFileSync(f, "utf8").split("\n").map((l, i) => [f.pathname.split("/core/")[1] + ":" + (i + 1), l])
    .filter(([, l]) => /rgba\(\s*20\s*,\s*59\s*,\s*74|rgba\(\s*6\s*,\s*182\s*,\s*212|rgba\(\s*10\s*,\s*(?:40|30)\s*,\s*(?:55|40)/.test(l)).map(([w]) => w));
  ok(files.length > 20 && bad.length === 0, "core has no hard-coded rgba(20,59,74,…), rgba(6,182,212,…) or rgba(10,40,55 / 10,30,40,…) (" + files.length + " files; " + bad.join(", ") + ")");
}

ok(drawn >= 24, "drew the session screen in " + drawn + " state × layout combinations");
ok(skipsSeen >= 3, "checked the Skip button style in " + skipsSeen + " drawn states");
console.log("buttons with no min-height (listed, not failed):\n  " + [...unsized].join("\n  "));
console.log("✓ design floor passed (" + passed + " assertions; " + unsized.size + " unsized buttons listed)");
