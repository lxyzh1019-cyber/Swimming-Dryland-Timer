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

/* Become the grown-up, by walking the real flow: answer the fallback question,
   which earns the right to choose a PIN, which unlocks. */
const TEST_PIN = "4821";
function unlockGrownup() {
  gate.lockGate();
  const [a, b] = gate.gateChallenge().question.match(/\d+/g).map(Number);
  if (!gate.answerGate(String(a * b))) throw new Error("FAIL: could not answer the gate challenge");
  if (!gate.choosePin(TEST_PIN)) throw new Error("FAIL: could not set the grown-up PIN");
  main.state.gateAsk = null; main.state.gateError = ""; main.state.gateFallback = false;
}

/* ---- A. Try-It is ONE look, then it is over ---------------------------- */
localStorage.clear(); store.migrate();
// Arming Try-It stops the next run being recorded, so it is a grown-up's switch.
unlockGrownup();

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

/* ---- Phase 4: a child cannot self-authorize a grown-up decision ---------
   These drive the ACTIONS directly, which is the only thing that proves
   anything: an action is reachable whether or not a button for it was
   rendered, so asserting that a control is hidden proves nothing at all. */
localStorage.clear(); store.migrate();
gate.lockGate();

/* --- the door: the Zone itself was never gated --- */
main.state.nav = "today";
main.actions.nav("grownup");
ok(main.state.nav !== "grownup",
   "a child tapping 🧑 does NOT get into the Grown-up Zone — it used to open for anyone");
ok(main.state.gateAsk === "grownupZone", "it asks for a grown-up first");
main.actions.cancelGate();
ok(main.state.nav === "today", "cancelling leaves her where she was");

/* --- and every mutating action re-checks, whatever screen it came from ---
   Each of these was reachable by anyone holding the phone. Snapshot the store,
   invoke the action, and require that NOTHING changed. */
unlockGrownup();                                  // set the PIN once, as a parent would
gate.lockGate();                                  // then become the child again
const snapshot = () => JSON.stringify({
  settings: { ...store.settings },
  gate: store.loadGate(), ladder: store.loadLadderRungs(),
  tracker: store.loadTracker(), journey: store.loadJourney(),
  verdicts: store.formVerdicts(), tryIt: store.tryItArmed()
});
const CHILD_CANNOT = [
  ["toggleGate", undefined],           ["toggleCoachVoice", undefined],
  ["toggleTimerSounds", undefined],    ["toggleSafetyVoice", undefined],
  ["setVoiceStyle", "fun"],            ["bumpRest", "exerciseRestSeconds|5|3|120"],
  ["togglePractice", undefined],       ["setLadderRung", "Box Jump|3"],
  ["formCheckPass", "Dead Bug"],       ["formCheckFail", "Dead Bug"],
  ["pickEngagement", "yes"],           ["repairWallet", undefined],
  ["addPrizePoolItem", undefined],     ["removePrizePoolItem", "0"],
  ["resetPrizePool", undefined],       ["saveTrackerWeek", undefined],
  ["reviewPrizes", undefined],         ["restorePrize", "some-id"],
  ["downloadBackup", undefined],       ["exportCsv", undefined],
  ["addAthlete", undefined],           ["pickAthlete", "someone-else"]
];
CHILD_CANNOT.forEach(([name, arg]) => {
  gate.lockGate();
  main.state.gateAsk = null;
  const before = snapshot();
  main.actions[name](arg);
  ok(snapshot() === before, `a locked ${name} changes nothing at all`);
  ok(main.state.gateAsk === name || main.state.gateAsk !== null,
     `and ${name} asks for a grown-up`);
});
main.actions.cancelGate();

/* The valgus gate decides whether she is jumping at all. */
gate.lockGate();
const gateBefore = store.loadGate().unlocked;
main.actions.toggleGate();
ok(store.loadGate().unlocked === gateBefore,
   "tapping the valgus gate while locked changes NOTHING");
ok(main.state.gateAsk === "toggleGate", "it asks for a grown-up instead");

/* A wrong PIN does not let it through. */
main.actions.answerGate("0000");
ok(store.loadGate().unlocked === gateBefore, "a wrong PIN still changes nothing");
ok(main.state.gateAsk === "toggleGate", "and the question stays up");
ok(main.state.gateError !== "", "with a visible retry message");

/* The right PIN performs the action she originally asked for. */
main.actions.answerGate(TEST_PIN);
ok(main.state.gateAsk === null, "the question closes");
ok(store.loadGate().unlocked === !gateBefore,
   "and the action she asked for is carried out, so she does not have to find it again");

/* While unlocked, gated actions go straight through. */
main.actions.toggleGate();
ok(store.loadGate().unlocked === gateBefore, "a second change inside the unlock window is not re-challenged");

/* An action carrying an ARGUMENT re-runs with that argument, not without it. */
gate.lockGate();
main.actions.setVoiceStyle("fun");
ok(store.settings.voiceStyle !== "fun", "the style is not changed while locked");
main.actions.answerGate(TEST_PIN);
ok(store.settings.voiceStyle === "fun",
   "and after unlocking it is the style she picked that is applied, not a default");

/* Forgot the PIN: the fallback question, then a new PIN. */
gate.lockGate();
main.actions.toggleGate();
main.actions.forgotPin();
ok(gate.hasGrownupPin() === true, "the old PIN is not thrown away just for asking");
const fbq = gate.gateChallenge().question.match(/\d+/g).map(Number);
main.actions.answerGate(String(fbq[0] * fbq[1]));
ok(main.state.gateAsk === "toggleGate", "answering the fallback does not itself perform the action");
ok(gate.gateUnlocked() === false, "nor unlock");
main.actions.answerGate("7788");
ok(gate.gateUnlocked() === true, "choosing a new PIN unlocks");
ok(gate.answerPin("7788") === true, "and the new PIN is the one that works from now on");

/* Cancelling abandons the action. */
gate.lockGate();
const beforeCancel = store.loadGate().unlocked;
main.actions.toggleGate();
main.actions.cancelGate();
ok(main.state.gateAsk === null, "cancelling closes the question");
ok(store.loadGate().unlocked === beforeCancel, "and performs nothing");

/* The severity-3 confirmation is no longer a checkbox she can tick herself. */
unlockGrownup(); gate.lockGate();
main.state.readiness = { answers: {}, zoneSev: {}, grownupOk: false, light: "green", overridden: false };
main.actions.rGrownupOk();
ok(main.state.readiness.grownupOk === false,
   "a child cannot clear her own severity-3 pain report by tapping the checkbox");
ok(main.state.gateAsk === "severity3", "it asks for a grown-up");
main.actions.answerGate(TEST_PIN);
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
main.actions.answerGate(TEST_PIN);
ok(main.state.readiness.light === "green" && main.state.readiness.overridden === true,
   "and a grown-up can, with the override recorded");

/* Leaving the Grown-up Zone drops the unlock — she cannot walk out, hand the
   phone back, and have the next tap on 🧑 still be authorized. */
unlockGrownup();
main.state.nav = "grownup";
ok(gate.gateUnlocked() === true, "a grown-up is in the Zone");
main.actions.nav("today");
ok(gate.gateUnlocked() === false, "and walking out re-locks it immediately");
ok(main.state.nav === "today", "leaving is never itself blocked");
main.actions.nav("grownup");
ok(main.state.nav !== "grownup" && main.state.gateAsk === "grownupZone",
   "so coming back asks again");
main.actions.cancelGate();

/* ---- the repair message says what actually happened -------------------- */
localStorage.clear(); store.migrate();
unlockGrownup();
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
