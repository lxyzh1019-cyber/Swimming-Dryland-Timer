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
/* ---- a DOM stub real enough to DRIVE THE LISTENERS -----------------------
   The old stub returned a NEW element from every getElementById and made
   addEventListener a no-op, so js/main.js's click / input / change listeners
   were never executed by any test — every test called main.actions.x() and the
   path a real tap takes was unproven. This one keeps a single `root`, records
   what is registered on it, and can fire a synthetic event at it. */
const listeners = {};
function makeRoot() {
  const el = fakeEl();
  el.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  el.contains = () => true;
  return el;
}
const testRoot = makeRoot();
/* Fire a real event at the real listener. `target` is what e.target will be —
   normally a stub element carrying the dataset / value the handler reads. */
globalThis.fireEvent = (type, target) => {
  let defaultPrevented = false;
  const ev = { type, target, preventDefault: () => { defaultPrevented = true; } };
  (listeners[type] || []).forEach(fn => fn(ev));
  return defaultPrevented;
};
/* An element as the delegated click listener expects to find it. */
globalThis.clickTarget = (action, arg) => {
  const el = fakeEl();
  el.dataset = { action, ...(arg === undefined ? {} : { arg }) };
  el.closest = sel => (sel === "[data-action]" ? el : null);
  el.tagName = "BUTTON";
  el.getAttribute = () => null;
  return el;
};
/* An input as the input / change listeners expect to find it. */
globalThis.inputTarget = (name, value, files) => {
  const el = fakeEl();
  el.matches = sel => sel === `[data-input="${name}"]`;
  el.value = value == null ? "" : value;
  if (files) el.files = files;
  return el;
};

/* WebAuthn. `passkeyStub.mode` decides what the platform does:
     "ok"     — the ceremony succeeds
     "cancel" — the grown-up dismisses the prompt (a rejected promise)
     "none"   — no platform authenticator at all */
globalThis.passkeyStub = { mode: "ok", id: "test-credential-id", creates: 0, gets: 0 };
const credId = () => new Uint8Array([...globalThis.passkeyStub.id].map(c => c.charCodeAt(0)));
const navStub = {
  credentials: {
    create: async () => {
      globalThis.passkeyStub.creates++;
      if (globalThis.passkeyStub.mode === "cancel") throw new Error("NotAllowedError");
      return { rawId: credId(), id: globalThis.passkeyStub.id };
    },
    get: async () => {
      globalThis.passkeyStub.gets++;
      if (globalThis.passkeyStub.mode === "cancel") throw new Error("NotAllowedError");
      return { rawId: credId(), id: globalThis.passkeyStub.id };
    }
  }
};
// Node 22 defines globalThis.navigator as a getter, so it has to be replaced.
Object.defineProperty(globalThis, "navigator", { value: navStub, configurable: true, writable: true });
globalThis.window.PublicKeyCredential = function PublicKeyCredential() {};
globalThis.PublicKeyCredential = globalThis.window.PublicKeyCredential;
/* passkeySupported() reads window.*, so unsupported means removing it. */
globalThis.setPasskeySupport = on => {
  if (on) globalThis.window.PublicKeyCredential = globalThis.PublicKeyCredential;
  else delete globalThis.window.PublicKeyCredential;
};
globalThis.btoa = globalThis.btoa || (s => Buffer.from(s, "binary").toString("base64"));
globalThis.atob = globalThis.atob || (s => Buffer.from(s, "base64").toString("binary"));

globalThis.document = {
  getElementById: () => testRoot, createElement: () => fakeEl(),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: fakeEl(), documentElement: fakeEl()
};

const base = new URL("../js/", import.meta.url).href;
const store  = await import(base + "store.js");
const engine = await import(base + "engine.js");
const gate    = await import(base + "gate.js");
const passkey = await import(base + "passkey.js");
const main   = await import(base + "main.js");
const rvm    = await import(base + "vm/readiness.js");
const data   = await import(base + "data.js");

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

/* Become the grown-up by walking the REAL flow: the device passkey confirms an
   adult, which earns the right to choose a PIN, which unlocks. There is no
   arithmetic question any more — that is the point of this round. */
const TEST_PIN = "4821";
async function unlockGrownup() {
  gate.lockGate();
  globalThis.passkeyStub.mode = "ok";
  setPasskeySupport(true);
  await enrollPasskeyForTest();
  if (!await passkey.verifyPasskey()) throw new Error("FAIL: test passkey did not verify");
  gate.allowPinChoice();
  if (!gate.choosePin(TEST_PIN)) throw new Error("FAIL: could not set the grown-up PIN");
  resetGateState();
}
async function enrollPasskeyForTest() {
  if (!passkey.hasPasskey() && !await passkey.enrollPasskey("test")) {
    throw new Error("FAIL: test passkey did not enrol");
  }
}
function resetGateState() {
  main.state.gateAsk = null; main.state.gateError = "";
  main.state.pendingAction = null; main.state.gatePayload = null;
  main.state.gateWantsNewPin = false; main.state.gateBusy = false;
}

/* ---- A. looking at the moves is a button, not a mode -------------------- */
localStorage.clear(); store.migrate();
await unlockGrownup();
gate.lockGate(); resetGateState();

/* Straight to the list, with no grown-up and nothing to arm first. Reading an
   instruction was never something a child should need an adult to unlock. */
main.actions.goTryIt("monday");
ok(main.state.gateAsk === null, "a child can look at the moves on her own");
ok(main.state.tryIt === "monday", "the move list opens on the day she asked for");
ok(main.state.readiness === null, "with no Body Check in the way");

main.actions.exitTryIt();
ok(main.state.tryIt === null, "closing it closes it");

/* ...and closing it leaves nothing behind. The old arm flag survived the close,
   so every later GO reopened Try-It and she could not reach a real session
   without finding the toggle again. */
main.actions.goSession("monday");
ok(main.state.readiness !== null, "the next GO opens Body Check");
ok(main.state.tryIt === null, "not the move list again");
ok(store.loadSessions().length === 0, "and looking at the moves wrote no session record at all");
ok(main.actionNames().includes("togglePractice") === false, "there is no mode left to toggle");

/* Mini is gone as a thing that can be started, so there is no second door into
   a session that skips the arming rules — or into a shortened workout at all. */
ok(main.actionNames().includes("startMini") === false, "there is no startMini action left");
main.state.readiness = null;
main.actions.startMini("monday");
ok(main.state.readiness === null && main.state.tryIt === null,
   "and dispatching the retired name does nothing at all");

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

/* ============================================================
   A CHILD CANNOT SELF-AUTHORIZE ANYTHING

   These drive the ACTIONS and the real DOM LISTENERS. That is the only thing
   that proves anything: an action is reachable whether or not a button for it
   was rendered, so asserting that a control is hidden proves nothing — and
   asserting that requireGrownup("unknown") returns false proves nothing either,
   because an action that never calls it is not protected by it.
   ============================================================ */
localStorage.clear(); store.migrate();
await unlockGrownup();          // set the PIN + passkey once, as a parent would
gate.lockGate();                // then be the child

/* --- the door: the Zone itself was never gated --- */
main.state.nav = "today";
main.actions.nav("grownup");
ok(main.state.nav !== "grownup",
   "a child tapping 🧑 does NOT get into the Grown-up Zone — it used to open for anyone");
ok(main.state.gateAsk === "nav", "it asks for a grown-up first");
main.actions.cancelGate();
ok(main.state.nav === "today", "cancelling leaves her where she was");
ok(main.state.pendingAction === null, "and forgets what she was trying to do");

/* --- EVERY mutating action, enumerated from the LIVE table ----------------
   Not a hand-written list that a new action can be forgotten out of: this walks
   whatever main.js actually registered. The day someone adds an action and does
   not think about authorization, THIS test fails. */
const snapshot = () => JSON.stringify({
  settings: { ...store.settings },
  gate: store.loadGate(), ladder: store.loadLadderRungs(),
  tracker: store.loadTracker(), journey: store.loadJourney(),
  verdicts: store.formVerdicts(),
  sessions: store.loadSessions().length, profile: store.activeProfileId()
});
/* Arguments that would really change something, so "nothing happened" means the
   guard stopped it rather than the argument being inert. */
const ARG = {
  setVoiceStyle: "fun", bumpRest: "exerciseRestSeconds|5|3|120",
  setLadderRung: "Box Jump|3", formCheckPass: "Dead Bug", formCheckFail: "Dead Bug",
  pickEngagement: "yes", restorePrize: "some-id", removePrizePoolItem: "0",
  pickAthlete: "someone-else", renameAthlete: "Hacked", nav: "grownup",
  rPickLight: "green", restoreBackup: null
};
const gatedNames = main.actionNames().filter(n => !gate.UNGATED_ACTIONS.includes(n));
ok(gatedNames.length > 20, "there are " + gatedNames.length + " gated actions to check");
gatedNames.forEach(name => {
  gate.lockGate();
  resetGateState();
  main.state.readiness = { answers: {}, zoneSev: {}, grownupOk: false, light: "red", overridden: false };
  const before = snapshot();
  main.actions[name](ARG[name]);
  ok(snapshot() === before, `a locked ${name} changes nothing at all`);
  ok(main.state.gateAsk !== null, `and ${name} asks for a grown-up`);
});
resetGateState();

/* --- an action NOBODY REMEMBERED TO GATE is blocked by the dispatcher -----
   The real claim. `defineAction` is the only way an action gets into the table,
   and the guard is on dispatch rather than on registration, so a brand-new
   mutating action written by someone who never heard of requireGrownup is
   refused anyway. This is what the old
   `requireGrownup("somethingNobodyHasWrittenYet") === false` assertion looked
   like it was proving and was not. */
let canaryRan = false;
main.defineAction("canaryMutation", () => { canaryRan = true; });
gate.lockGate(); resetGateState();
main.actions.canaryMutation();
ok(canaryRan === false,
   "a newly added action nobody gated NEVER RUNS while locked — deny-by-default is applied "
   + "at the dispatcher, not remembered action by action");
ok(main.state.gateAsk === "canaryMutation", "the dispatcher put the challenge up for it by name");
main.actions.answerGate(TEST_PIN);
ok(canaryRan === true, "and a grown-up who unlocks gets the action she asked for, unchanged");

/* An argument survives the round trip through the challenge. */
let canaryArg = null;
main.defineAction("canaryArg", a => { canaryArg = a; });
gate.lockGate(); resetGateState();
main.actions.canaryArg("the-argument");
ok(canaryArg === null, "the deferred action has not run");
main.actions.answerGate(TEST_PIN);
ok(canaryArg === "the-argument", "and it re-runs with the argument she originally gave");

/* --- the DISPATCHER PATH itself, not just direct calls -------------------
   js/main.js's click listener used to look the function up and invoke it with
   no check of its own. Until now no test ever executed it at all. */
gate.lockGate(); resetGateState();
const gateBefore = store.loadGate().unlocked;
fireEvent("click", clickTarget("toggleGate"));
ok(store.loadGate().unlocked === gateBefore, "a real TAP on a gated control changes nothing");
ok(main.state.gateAsk === "toggleGate", "the click dispatcher asks for a grown-up");
main.actions.answerGate(TEST_PIN);
ok(store.loadGate().unlocked === !gateBefore, "and the tap she made is carried out after unlocking");

/* An unknown data-action is simply ignored — it must not raise a challenge for
   an action that does not exist. */
gate.lockGate(); resetGateState();
fireEvent("click", clickTarget("noSuchActionAtAll"));
ok(main.state.gateAsk === null, "a typo'd data-action asks nobody for anything");

/* --- the two handlers that bypassed the action layer completely ----------
   The athlete-name field and the backup-file picker were raw DOM listeners
   calling straight into the store. Restoring a backup OVER LIVE HISTORY asked
   nobody at all. */
gate.lockGate(); resetGateState();
const nameBefore = store.settings.athleteName;
fireEvent("input", inputTarget("athleteName", "Renamed By The Child"));
ok(store.settings.athleteName === nameBefore,
   "typing in the athlete-name field renames nobody while locked — it used to rename her instantly");
ok(main.state.gateAsk === "renameAthlete", "it asks for a grown-up");

gate.lockGate(); resetGateState();
let restoreAttempted = false;
const fakeFile = { name: "backup.json", __fake: true };
const fileInput = inputTarget("restoreBackup", "", [fakeFile]);
fireEvent("change", fileInput);
ok(main.state.gateAsk === "restoreBackup",
   "choosing a backup file asks for a grown-up — writing a backup over her live history used to ask NOBODY");
ok(main.state.backupNote === "" || !/Restored/.test(main.state.backupNote), "and no restore was started");
main.actions.cancelGate();

/* --- the unlock EXPIRES while she is sitting in the Zone -----------------
   The Zone does not re-render on a timer, so after five minutes every control
   is still on screen and still tappable. None of them may work. */
await unlockGrownup();
main.state.nav = "grownup";
ok(gate.gateUnlocked() === true, "a grown-up is in the Zone");
const realNow = Date.now;
Date.now = () => realNow() + gate.GATE_UNLOCK_MS + 1000;      // six minutes pass
ok(gate.gateUnlocked() === false, "the unlock has expired");
ok(main.state.nav === "grownup", "but the Zone is still open and every control is still drawn");
gatedNames.forEach(name => {
  resetGateState();
  main.state.readiness = { answers: {}, zoneSev: {}, grownupOk: false, light: "red", overridden: false };
  const before = snapshot();
  main.actions[name](ARG[name]);
  ok(snapshot() === before, `${name} does nothing once the unlock has expired, Zone open or not`);
});
/* And the same for the two listener paths and the click dispatcher. */
resetGateState();
const nameAtExpiry = store.settings.athleteName;
fireEvent("input", inputTarget("athleteName", "Renamed After Expiry"));
ok(store.settings.athleteName === nameAtExpiry, "the name field is dead once the unlock expires too");
resetGateState();
const gateAtExpiry = store.loadGate().unlocked;
fireEvent("click", clickTarget("toggleGate"));
ok(store.loadGate().unlocked === gateAtExpiry, "and so is a tap on a control still on screen");
Date.now = realNow;
resetGateState();

/* --- the PIN, the passkey, and the reset, driven through the actions ---- */
await unlockGrownup();
gate.lockGate(); resetGateState();
main.actions.toggleGate();
ok(main.state.gateAsk === "toggleGate", "a gated tap raises the challenge");
main.actions.answerGate("0000");
ok(main.state.gateAsk === "toggleGate", "a wrong PIN leaves it up");
ok(main.state.gateError !== "", "with a visible retry message");
main.actions.answerGate(TEST_PIN);
ok(main.state.gateAsk === null, "the right PIN closes it");

/* Forgot the PIN: the passkey is the only way through, and the old PIN survives
   merely being asked about — clearing it up front would make "forgot" a bypass. */
gate.lockGate(); resetGateState();
main.actions.toggleGate();
main.actions.forgotPin();
ok(gate.hasGrownupPin() === true, "the old PIN is not thrown away just for asking");
ok(gate.gateMode(main.state.gateWantsNewPin) === "passkey", "the device passkey is what is asked for");
globalThis.passkeyStub.mode = "cancel";
await main.actions.unlockWithPasskey();
await new Promise(r => setTimeout(r, 0));
ok(gate.gateUnlocked() === false, "a dismissed prompt unlocks nothing");
globalThis.passkeyStub.mode = "ok";
main.actions.unlockWithPasskey();
await new Promise(r => setTimeout(r, 0));
ok(gate.gateMode(main.state.gateWantsNewPin) === "setPin", "a confirmed grown-up may then choose a new PIN");
main.actions.answerGate("7788");
ok(gate.gateUnlocked() === true, "choosing it unlocks");
ok(gate.answerPin("7788") === true, "and the new PIN is the one that works from now on");
resetGateState();

/* Leaving the Grown-up Zone drops the unlock — she cannot walk out, hand the
   phone back, and have the next tap on 🧑 still be authorized. */
await unlockGrownup();
main.state.nav = "grownup";
main.actions.nav("today");
ok(gate.gateUnlocked() === false, "walking out re-locks it immediately");
ok(main.state.nav === "today", "leaving is never itself blocked");
main.actions.nav("grownup");
ok(main.state.nav !== "grownup" && main.state.gateAsk === "nav", "so coming back asks again");
main.actions.cancelGate();

/* The severity-3 confirmation is no longer a checkbox she can tick herself. */
await unlockGrownup(); gate.lockGate(); resetGateState();
main.state.readiness = { answers: {}, zoneSev: {}, grownupOk: false, light: "green", overridden: false };
main.actions.rGrownupOk();
ok(main.state.readiness.grownupOk === false,
   "a child cannot clear her own severity-3 pain report by tapping the checkbox");
ok(main.state.gateAsk === "rGrownupOk", "it asks for a grown-up");
main.actions.answerGate(TEST_PIN);
ok(main.state.readiness.grownupOk === true, "a grown-up who is actually there can clear it");
/* Un-ticking it again does not need the grown-up back. */
gate.lockGate(); resetGateState();
main.actions.rGrownupOk();
ok(main.state.readiness.grownupOk === false, "and withdrawing the confirmation is always allowed");

/* Overriding the light the body check produced is an adult decision. */
gate.lockGate(); resetGateState();
main.state.readiness = { answers: {}, zoneSev: {}, grownupOk: false, light: "red", overridden: false };
main.actions.rPickLight("green");
ok(main.state.readiness.light === "red", "a red light cannot be overridden to green by the child");
ok(main.state.gateAsk === "rPickLight", "it asks for a grown-up");
main.actions.answerGate(TEST_PIN);
ok(main.state.readiness.light === "green" && main.state.readiness.overridden === true,
   "and a grown-up can, with the override recorded");

/* ---- and the whole result card follows the light the grown-up picked ------
   The card used to keep taking its description and its button from the body
   check's SEVERITY, which an override never touches. Overriding a sore-shoulder
   Yellow to Green drew a green "Full power!" header directly above "2 rounds
   max", a button reading "Start easy — Yellow light", and then ran three
   rounds. */
gate.lockGate(); resetGateState();
main.state.readiness = rvm.newReadinessFlow("monday");
rvm.answerQuestion(main.state.readiness, "q_pain", "no");     // "a bit sore" → body map
main.actions.rSetZoneSev("2|2");                              // shoulders, tired but controlled
let rv = rvm.buildReadinessVM(main.state.readiness, true);
ok(main.state.readiness.light === "yellow", "a severity-2 mark suggests Yellow");
ok(rv.suggestedLight === "yellow" && rv.wasOverridden === false, "and nothing has been overridden yet");
ok(/2 rounds/.test(rv.resultDesc), "the card describes the yellow dose");

main.actions.rPickLight("green");
ok(main.state.gateAsk === "rPickLight", "moving it asks for a grown-up");
main.actions.answerGate(TEST_PIN);
rv = rvm.buildReadinessVM(main.state.readiness, true);
ok(main.state.readiness.light === "green", "the grown-up's light is the one that stands");
ok(rv.wasOverridden === true, "the card knows it was overridden");
ok(rv.resultDesc === data.LIGHT_META.green.desc, "the description follows the final light, not the severity");
ok(rv.resultCta.label === data.LIGHT_META.green.btnLabel, "and so does the button");
ok(rv.resultCta.action === "continue", "which starts the session");
ok(/suggested Yellow — 2 rounds/.test(rv.suggestionLine) &&
   /selected Green — 3 rounds/.test(rv.suggestionLine),
   "and both decisions are shown, so the override is never mistaken for the body's answer");

/* Picking the suggested light back out of the list is not an override. */
gate.lockGate(); resetGateState();
main.actions.rPickLight("yellow");
main.actions.answerGate(TEST_PIN);
rv = rvm.buildReadinessVM(main.state.readiness, true);
ok(rv.wasOverridden === false, "returning to the suggested light clears the override");
ok(rv.suggestionLine === "", "and the two-decision line goes away with it");
ok(/2 rounds/.test(rv.resultDesc), "the body-check wording comes back");

/* Severity 4 carries action "back". Overriding it used to leave a button that
   EXITED instead of starting — dead on the one path a grown-up most needs. */
gate.lockGate(); resetGateState();
main.state.readiness = rvm.newReadinessFlow("monday");
rvm.answerQuestion(main.state.readiness, "q_pain", "no");
main.actions.rSetZoneSev("2|4");
rv = rvm.buildReadinessVM(main.state.readiness, true);
ok(main.state.readiness.light === "recovery", "a severity-4 mark suggests Recovery");
ok(rv.resultCta.action === "back", "and on its own the button sends her back to Today");
main.actions.rPickLight("green");
main.actions.answerGate(TEST_PIN);
rv = rvm.buildReadinessVM(main.state.readiness, true);
ok(rv.resultCta.action === "continue",
   "a grown-up who overrides a pain report gets a button that actually starts");
ok(rv.resultCta.label === data.LIGHT_META.green.btnLabel, "and it is labelled for the light they chose");

/* A fresh mark on the body map replaces the override — the body gets the last
   word on its own answer. */
main.actions.rSetZoneSev("3|3");
rv = rvm.buildReadinessVM(main.state.readiness, true);
ok(main.state.readiness.light === "recovery" && rv.wasOverridden === false,
   "marking another sore area re-suggests from the body, clearing the stale override");
ok(rv.resultCta.action === "back", "so the pain result governs again until a grown-up says otherwise");
main.actions.cancelGate();

/* Turning the safety voice back ON is always hers; turning it off is not. */
gate.lockGate(); resetGateState();
store.updateSettings({ safetyVoiceOn: false });
main.actions.toggleSafetyVoice();
ok(store.settings.safetyVoiceOn === true, "she may always turn the safety voice back ON");
gate.lockGate(); resetGateState();
main.actions.toggleSafetyVoice();
ok(store.settings.safetyVoiceOn === true, "but she may not turn it off");
ok(main.state.gateAsk === "toggleSafetyVoice", "that asks for a grown-up");
main.actions.cancelGate();

/* ---- the repair message says what actually happened -------------------- */
localStorage.clear(); store.migrate();
await unlockGrownup();
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
