/* INTERACTION — the plan's manual verification list, driven instead of tapped.

   Tapping the ❗, advancing through moves to watch the list stay marked,
   driving each STOP reason, listening for the dose, rotating mid-session: all
   of it was going to be "I checked by hand", which is the same promise that
   let an entirely unwired app ship with perfect screenshots. */
import "./harness.mjs";
const base = new URL("../", import.meta.url).href;
const engine = await import(base + "engine.js");
const svm    = await import(base + "vm/session.js");
const sscreen= await import(base + "screens/session.js");
const store  = await import(base + "store.js");
const H      = await import("./harness.mjs");
const data   = await import(base + "data.js");

/* Nothing here may name a move or a day: this suite runs against BOTH apps'
   content. Ask the plan for a day that has a timed move in it, the way the
   session suite does — the skate app's Monday opens on a rep move, which has
   no SVG arc, and a hardcoded "monday" fails there and only there. */
const timedDay = Object.keys(data.DAYS).find(k => !data.DAYS[k].spa
  && Object.values(data.DAYS[k].blocks || {}).flat().some(e => !e.byReps && e.work > 0));

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

// a real mid-session moment
let snap = null;
ok(!!timedDay, "the plan has a day with a timed move to test on");
await H.runSession({ dayKey: timedDay, light: "green", gateUnlocked: true }, {
  onTick: (ms, s) => { if (s.phase === "formcheck") engine.pickClean();
    const ex = engine.sess.currentEx;
    /* A TIMED move specifically: the arc below only exists on the SVG ring, and
       a day that merely contains a timed move can still reach its cue-and-watch
       move by reps first. */
    if (!snap && s.phase === "work" && ex && !ex.byReps && ex.cue && ex.parentWatch)
      snap = { ...engine.sess, circuits: engine.sess.circuits }; },
  limitMs: 1800000
});
const draw = (st, sessX) => { engine.exitSession(); Object.assign(engine.sess, snap, sessX || {});
  return sscreen.sessionScreen(svm.buildSessionVM({ inSession:true, detailOverlay:false, detailEx:null, ...st })); };

const shut = draw({ isWide:true, watchOpen:false });
const open = draw({ isWide:true, watchOpen:true });
ok(!/👀 Watch for/.test(shut) && /👀 Watch for/.test(open), "closed hides the watch-for, open reveals it");
ok(/aria-expanded="false"/.test(shut) && /aria-expanded="true"/.test(open), "aria-expanded flips with it");
ok(/id="s-timer-text"/.test(open), "the tick target s-timer-text survives the repaint");
ok(/id="s-ring-arc"/.test(open), "and so does the progress arc — this snapshot is a timed move");
ok(!/id="s-ex-actual"/.test(open), "and the pace bar is absent on a timed move — the ring already counts it");
ok(/id="s-watch"/.test(open), "and the panel is the one aria-controls points at");

let seen = 0, marked = 0;
await H.runSession({ dayKey: timedDay, light: "green", gateUnlocked: true }, {
  onTick: (ms, s) => { if (s.phase === "formcheck") engine.pickClean();
    if (ms % 60000) return;
    const vm = svm.buildSessionVM({ inSession:true, isWide:true, detailOverlay:false, detailEx:null });
    const cur = vm.sessionExList.filter(r => r.isCur);
    if (vm.sessionExList.length) { seen++; if (cur.length === 1) marked++; } },
  limitMs: 1800000
});
ok(seen > 5 && marked === seen, `exactly one row was current at every sampled phase (${marked}/${seen})`);

const warn = draw({ isWide:true }, { stopOverlay:true, confirmRestart:true });
ok(/Start this workout over\?/.test(warn) && /erased/.test(warn), "the warning says the attempt is erased");
ok(/Keep what I've done/.test(warn), "and offers to keep it");
const reasons = draw({ isWide:true }, { stopOverlay:true });
for (const r of ["pain","break","restart"]) ok(new RegExp(`data-arg="${r}"|askRestart`).test(reasons), `STOP offers the '${r}' path`);
await H.runSession({ dayKey: timedDay, light:"green", gateUnlocked:true }, {
  onTick:(ms,s)=>{ if (s.phase==="formcheck") engine.pickClean(); if (ms===60000) engine.discardSession(); }, limitMs:600000 });
// runSession clears storage on entry, so anything present now was written by THIS run
ok(store.loadSessions().length === 0, "a real discarded run wrote no row");
ok(engine.sess.saveFailed === false, "and did not claim the save failed");

store.updateSettings({ coachVoiceOn: true });
H.spoken.length = 0;
await H.runSession({ dayKey: timedDay, light:"green", gateUnlocked:true }, {
  onTick:(ms,s)=>{ if (s.phase==="formcheck") engine.pickClean();
                   if (ms===1000) store.updateSettings({ coachVoiceOn:true }); if (ms>200000) engine.endFromStop("break"); },
  limitMs:600000 });
const line = H.spoken.find(l => /Three, two, one, go\.$/.test(l));
ok(line && /\d/.test(line), "opening line carries a number: " + JSON.stringify(line));

const { layoutFor } = await import(base + "layout.js");
const up = layoutFor(810,1080), side = layoutFor(1080,810);
ok(up.tightColumn !== side.tightColumn, "upright and landscape iPad differ in tightColumn — a rotation changes the layout");
ok(/linear-gradient\(165deg,var\(--aqua-wash\)/.test(draw({ isWide:true, ...side })), "and the photo comes back on rotation to landscape");
console.log("✓ interaction passed (" + passed + " assertions)");
