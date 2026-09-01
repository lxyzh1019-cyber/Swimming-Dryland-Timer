/* ============================================================
   Action-layer tests — run with `npm test` (Node ≥ 18, no deps).

   These live in their own process because importing js/main.js runs boot()
   (first render, cloud restore), whose side effects do not compose with the
   fake-clock session tests in smoke.mjs.

   They exist because two of the app's shipped defects lived HERE and nowhere
   else: an action that closed the instructions card and silently restarted the
   workout clock, and one that closed Try-It without disarming it. Neither is
   visible from the engine, and neither can be proved by looking at markup.
   ============================================================ */

globalThis.localStorage = (() => { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)),
  removeItem: k => m.delete(k), clear: () => m.clear() }; })();
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.window = {
  SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
  speechSynthesis: { getVoices: () => [], cancel() {}, speaking: false, pending: false,
    set onvoiceschanged(f) {}, speak(u) { if (u && u.onstart) u.onstart(); if (u && u.onend) u.onend(); } },
  AudioContext: function () { this.state = "running"; this.currentTime = 0;
    this.createOscillator = () => ({ type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} });
    this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
    this.destination = {}; this.resume = () => {}; },
  innerWidth: 1200, innerHeight: 800, addEventListener() {},
  fetch: () => Promise.reject(new Error("no net"))
};
const fakeEl = () => ({
  innerHTML: "", scrollIntoView() {}, addEventListener() {}, removeEventListener() {},
  contains: () => true, closest: () => null, insertAdjacentHTML() {},
  querySelector: () => null, querySelectorAll: () => [],
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
  style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, value: ""
});
globalThis.document = {
  getElementById: () => fakeEl(), createElement: () => fakeEl(),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: fakeEl(), documentElement: fakeEl()
};

const base = new URL("../js/", import.meta.url).href;
const store  = await import(base + "store.js");
const engine = await import(base + "engine.js");
const main   = await import(base + "main.js");

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

/* ---- A. Try-It is ONE look, then it is over ---------------------------- */
localStorage.clear(); store.migrate();

main.actions.togglePractice();
ok(store.tryItArmed() === true, "the Try-It toggle arms it");
ok(main.state.practiceMode === true, "and the screen knows it is armed");

main.actions.goSession("monday");
ok(main.state.tryIt === "monday", "while armed, GO opens the Try-It move list");
ok(main.state.readiness === null, "and not a real session");

main.actions.exitTryIt();
ok(store.tryItArmed() === false,
   "Done Looking DISARMS Try-It — it used to stay armed, so every later GO reopened it");
ok(main.state.practiceMode === false, "and practice mode is cleared with it");
ok(main.state.tryIt === null, "the move list is closed");

main.actions.goSession("monday");
ok(main.state.readiness !== null, "the next GO opens Body Check");
ok(main.state.tryIt === null, "not Try-It again");
ok(store.loadSessions().length === 0, "and Try-It wrote no session record at all");

/* A Mini is not a way around it either. */
main.state.readiness = null;
main.actions.togglePractice();
main.actions.startMini("monday");
ok(main.state.tryIt === "monday" && main.state.readiness === null, "an armed Mini also opens Try-It");
main.actions.exitTryIt();
ok(store.tryItArmed() === false, "and leaving it disarms it just the same");

/* ---- C. closing the instructions is not resuming the workout ----------- */
localStorage.clear(); store.migrate();
engine.exitSession();
/* These actions read and write exactly these two flags; a live timed session is
   not needed to prove which of them restarts the clock. */
engine.sess.running = true; engine.sess.paused = false;

main.actions.openDetail({ name: "Superman" });
ok(engine.sess.paused === true, "opening the instructions pauses the run");
ok(main.state.detailOverlay === true, "and opens the card");

main.actions.closeDetail();
ok(engine.sess.paused === true,
   "✕ and the backdrop close the card and LEAVE IT PAUSED");
ok(main.state.detailOverlay === false, "the card is closed");
ok(main.state.detailEx === null, "and forgotten");

main.actions.openDetail({ name: "Superman" });
main.actions.resumeFromDetail();
ok(engine.sess.paused === false, "only the explicit Resume button restarts the clock");
ok(main.state.detailOverlay === false, "and it closes the card too");

/* Reading the instructions must not be able to un-pause a session she paused
   herself before opening them. */
engine.sess.paused = true;
main.actions.openDetail({ name: "Superman" });
main.actions.closeDetail();
ok(engine.sess.paused === true, "a session already paused stays paused through a read");

engine.exitSession();
console.log(`✓ action-layer tests passed (${passed} assertions)`);
process.exit(0);
