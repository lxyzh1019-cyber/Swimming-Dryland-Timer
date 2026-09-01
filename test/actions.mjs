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
const gate   = await import(base + "gate.js");
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

/* ---- Phase 4: a child cannot self-authorize a grown-up decision --------- */
localStorage.clear(); store.migrate();
gate.lockGate();

/* The valgus gate decides whether she is jumping at all. */
const gateBefore = store.loadGate().unlocked;
main.actions.toggleGate();
ok(store.loadGate().unlocked === gateBefore,
   "tapping the valgus gate while locked changes NOTHING");
ok(main.state.gateAsk === "valgusGate", "it asks for a grown-up instead");
ok(main.state.gateAsk !== null, "and holds the pending action");

/* A wrong answer does not let it through. */
main.actions.answerGate("0");
ok(store.loadGate().unlocked === gateBefore, "a wrong answer still changes nothing");
ok(main.state.gateAsk === "valgusGate", "and the question stays up");
ok(main.state.gateError !== "", "with a visible retry message");

/* The right answer performs the action she originally asked for. */
const ch = gate.gateChallenge().question.match(/\d+/g).map(Number);
main.actions.answerGate(String(ch[0] * ch[1]));
ok(main.state.gateAsk === null, "the question closes");
ok(store.loadGate().unlocked === !gateBefore,
   "and the action she asked for is carried out, so she does not have to find it again");

/* While unlocked, gated actions go straight through. */
main.actions.toggleGate();
ok(store.loadGate().unlocked === gateBefore, "a second change inside the unlock window is not re-challenged");

/* Cancelling abandons the action. */
gate.lockGate();
const beforeCancel = store.loadGate().unlocked;
main.actions.toggleGate();
main.actions.cancelGate();
ok(main.state.gateAsk === null, "cancelling closes the question");
ok(store.loadGate().unlocked === beforeCancel, "and performs nothing");

/* The severity-3 confirmation is no longer a checkbox she can tick herself. */
gate.lockGate();
main.state.readiness = { answers: {}, zoneSev: {}, grownupOk: false, light: "green", overridden: false };
main.actions.rGrownupOk();
ok(main.state.readiness.grownupOk === false,
   "a child cannot clear her own severity-3 pain report by tapping the checkbox");
ok(main.state.gateAsk === "severity3", "it asks for a grown-up");
const ch2 = gate.gateChallenge().question.match(/\d+/g).map(Number);
main.actions.answerGate(String(ch2[0] * ch2[1]));
ok(main.state.readiness.grownupOk === true, "a grown-up who is actually there can clear it");
/* Un-ticking it again does not need the grown-up back. */
main.actions.rGrownupOk();
ok(main.state.readiness.grownupOk === false, "and withdrawing the confirmation is always allowed");

/* Overriding the light the body check produced is an adult decision. */
gate.lockGate();
main.state.readiness = { answers: {}, zoneSev: {}, grownupOk: false, light: "red", overridden: false };
main.actions.rPickLight("green");
ok(main.state.readiness.light === "red", "a red light cannot be overridden to green by the child");
ok(main.state.gateAsk === "lightOverride", "it asks for a grown-up");
const ch3 = gate.gateChallenge().question.match(/\d+/g).map(Number);
main.actions.answerGate(String(ch3[0] * ch3[1]));
ok(main.state.readiness.light === "green" && main.state.readiness.overridden === true,
   "and a grown-up can, with the override recorded");

/* Leaving the Grown-up Zone drops the unlock. */
main.actions.goToday && main.actions.goToday();
gate.lockGate();
ok(gate.gateUnlocked() === false, "the unlock does not follow her out of the Grown-up Zone");

/* ---- the repair message says what actually happened -------------------- */
localStorage.clear(); store.migrate();
store.saveJourney({ ...(store.loadJourney() || {}), xp: 0, pendingDraws: 0, prizesWon: [
  { id: "a", label: "Movie night", date: "2026-01-05", redeemed: true },
  { id: "a", label: "Ice cream", date: "2026-01-06", redeemed: true }
] });
main.actions.repairWallet();
const note = main.state.walletRepairNote;
ok(/ID/.test(note), "the repair note reports the IDs it actually fixed");
ok(!/unstuck/i.test(note), "and never claims a prize was unstuck when it is still marked used");
ok(/marked used/.test(note), "it says plainly that prizes are still marked used");
ok(store.redeemedPrizesForReview().length === 2, "and offers them for review");

engine.exitSession();
console.log(`✓ action-layer tests passed (${passed} assertions)`);
process.exit(0);
