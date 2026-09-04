/* ============================================================
   Smoke tests — run with `npm test` (Node ≥ 18, no dependencies).
   The app has no build step and runs in the browser, so these
   tests stub the few browser globals the ES modules touch at load
   (localStorage / window / document) and then exercise the pure
   logic: streak math, XP, readiness scoring + the pain-gate, quiz
   rotation, and that the view-models render to strings.
   ============================================================ */

globalThis.localStorage = (() => { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)),
  removeItem: k => m.delete(k), clear: () => m.clear() }; })();
/* An utterance that starts and ends IMMEDIATELY — the real behaviour of a
   device with no installed voices, and the condition that made a whole rep set
   fly past in milliseconds and get recorded as skipped. */
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
const winListeners = {};
globalThis.fireWinEvent = (type) => { (winListeners[type] || []).forEach(fn => fn({ type })); };
globalThis.window = {
  SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
  speechSynthesis: { getVoices: () => [], cancel() {}, speaking: false, pending: false, set onvoiceschanged(f) {},
    speak(u) { if (u && u.onstart) u.onstart(); if (u && u.onend) u.onend(); } },
  AudioContext: function () { this.state = "running"; this.currentTime = 0;
    this.createOscillator = () => ({ type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} });
    this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
    this.destination = {}; this.resume = () => {}; },
  innerWidth: 1200, innerHeight: 800,
  addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener(type, fn) { const l = winListeners[type] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }, fetch: () => Promise.reject(new Error("no net"))
};
/* A DOM stub real enough to import js/main.js, so the ACTION LAYER — which is
   where the Try-It arm flag and the detail-overlay pause live — can be driven
   directly instead of guessed at from rendered markup. */
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

/* The document listeners are RECORDED, not swallowed. The engine's
   backgrounding guard hangs off `visibilitychange` / `pagehide`, and a stub
   that dropped every registration would have let that guard be written and
   never once executed by a test — which is exactly how the gap got here. */
const docListeners = {};
globalThis.document = {
  hidden: false, visibilityState: "visible",
  getElementById: () => testRoot, createElement: () => fakeEl(),
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const l = docListeners[type] || [];
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  },
  querySelector: () => null, querySelectorAll: () => [],
  body: fakeEl(), documentElement: fakeEl()
};
globalThis.fireDocEvent = (type) => {
  globalThis.document.visibilityState = globalThis.document.hidden ? "hidden" : "visible";
  (docListeners[type] || []).forEach(fn => fn({ type }));
};

import fs from "node:fs";

const base = new URL("../js/", import.meta.url).href;
const util   = await import(base + "util.js");
const data   = await import(base + "data.js");
const store  = await import(base + "store.js");
const engine = await import(base + "engine.js");
const rvm    = await import(base + "vm/readiness.js");
const svm    = await import(base + "vm/session.js");
const tvm    = await import(base + "vm/today.js");
const sscreen = await import(base + "screens/session.js");
const tscreen = await import(base + "screens/today.js");
const effort  = await import(base + "effort.js");
const pvm     = await import(base + "vm/progress.js");
const pscreen = await import(base + "screens/progress.js");
const gvm     = await import(base + "vm/grownup.js");
const gscreen = await import(base + "screens/grownup.js");
const rscreen = await import(base + "screens/readiness.js");
const sync    = await import(base + "sync.js");
const overlays = await import(base + "screens/overlays.js");
const tryvm   = await import(base + "vm/tryit.js");
const tryscreen = await import(base + "screens/tryit.js");
const outcome = await import(base + "outcome.js");
const gate    = await import(base + "gate.js");
const passkey = await import(base + "passkey.js");


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
/* smoke.mjs never imports js/main.js (boot() does not compose with the
   fake-clock session tests), so there is no view state to clear here. */
function resetGateState() {}

/* --- refTime is single-sourced (engine re-exports util's) --- */
ok(engine.refTime === util.refTime, "engine.refTime === util.refTime");
ok(util.refTime({ driver: "time", work: 22 }) === 22, "refTime time-driver");
ok(util.refTime({ dose: "10 reps/side" }) === 40, "refTime /side heuristic");

/* --- streak math with the recovery-friendly grace --- */
ok(store.currentStreak([]) === 0, "empty streak is 0");
const s = iso => ({ isoDate: iso, completedFully: true });
const d0 = new Date().toISOString();
const d2 = new Date(Date.now() - 2 * 86400000).toISOString();
const d5 = new Date(Date.now() - 5 * 86400000).toISOString();
ok(store.currentStreak([s(d2), s(d0)]) === 2, "1-day gap keeps the streak (grace)");
ok(store.currentStreak([s(d5), s(d0)]) === 1, "a 4-day gap breaks the streak");

/* The freeze applies to TODAY's gap too — a Mon/Wed/Fri kid used to see the
   streak survive Saturday and collapse to 0 on Sunday. */
const ago = n => new Date(Date.now() - n * 86400000).toISOString();
ok(store.currentStreak([s(ago(5)), s(ago(3)), s(ago(1))]) === 3, "Mon/Wed/Fri, last was yesterday");
ok(store.currentStreak([s(ago(6)), s(ago(4)), s(ago(2))]) === 3, "same run a day later still holds (rest day inside the freeze)");
ok(store.currentStreak([s(ago(3))]) === 0, "a 3-day gap does end the streak");
/* "Best" must never read lower than the streak the kid is standing on. */
ok(store.longestStreak([s(ago(6)), s(ago(4)), s(ago(2))]) === 3, "longestStreak uses the same freeze");

/* --- ended-early sessions count as a day trained --- */
const early = ex => ({ isoDate: d0, completedFully: false, endedEarly: true, perExercise: ex });
ok(store.countsAsTrained({ completedFully: true }), "completed session counts");
ok(store.countsAsTrained(early([{ name: "Superman" }])), "ended early after real work counts");
ok(!store.countsAsTrained(early([{ name: "Superman", skipped: true }])), "ended early with everything skipped does not");
ok(!store.countsAsTrained(early([])), "GO-then-quit does not count");
/* Reaching the END of a session having skipped everything is not training
   either — it used to arrive as completedFully:true and take the streak. */
const allSkipped = { isoDate: d0, completedFully: true, endedEarly: false,
  ledger: [{ name: "A", status: "skipped" }, { name: "B", status: "skipped" }] };
ok(!store.countsAsTrained(allSkipped), "skipping every exercise is not a trained day, even at the end");
ok(store.countsAsTrained({ ...allSkipped, ledger: [{ name: "A", status: "done" }] }),
   "but one real move is");
ok(!store.countsAsTrained({ isoDate: d0, completedFully: true, safetyStop: true,
   ledger: [{ name: "A", status: "done" }] }), "and a safety stop is a safety event, not a training day");
ok(store.countsAsTrained({ isoDate: d0 }), "pre-flag legacy records count (old app's !== false rule)");
ok(store.isPartialSession(early([{ name: "Superman" }])), "ended-early reads as partial");

/* --- cloud restore: merge is additive and idempotent, XP is awarded once --- */
localStorage.clear();
const rec = (iso, day) => ({ isoDate: iso, dayKey: day, perExercise: [1,2,3,4,5,6], completedFully: true, xpEarned: 100 });
const cloud = [{ id: "abc", createdAt: { seconds: 1 }, ...rec(d2, "monday") }, rec(d0, "tuesday")];
store.migrate();                                   // fresh device: baseline 0
ok(store.loadJourney().xp === 0, "wiped device starts at 0 XP");
ok(store.mergeSessions(cloud) === 2, "restore adds both cloud sessions");
ok(store.loadSessions()[0].id === undefined, "cloud-only fields are stripped");
ok(store.reconcileJourneyWithSessions() === 200, "restored sessions re-award their XP");
ok(store.loadJourney().xp === 200, "XP is back after the restore");
ok(store.mergeSessions(cloud) === 0, "re-running the restore adds nothing");
ok(store.reconcileJourneyWithSessions() === 0, "and awards no XP a second time");
ok(store.currentStreak(store.loadSessions().filter(store.countsAsTrained)) === 2, "the restored streak is back");
localStorage.clear();

/* --- two devices converge on one level ------------------------------------
   The skate app read 26 on the iPad and 18 on the desktop, because only
   sessions were mirrored. XP is now DERIVED from the two mirrored sources —
   training log + quiz ledger — so every device computes the same number. */
localStorage.clear();
store.migrate();
store.saveSession({ isoDate: "2026-04-01T10:00:00.000Z", dayKey: "monday", completedFully: true, xpEarned: 300 });
store.addXp(4000);                                  // years of old, uncapped quiz XP
ok(store.loadJourney().xp === 4000, "the device starts with an inflated private total");
ok(store.rebuildJourneyXp() === 300, "rebuilding lands on the training log, not the old total");
ok(store.loadJourney().sessionXp === 300, "and records what the log accounts for");

const convKey = store.quizQuestionKey("Superman Hold", "cue");
const oneQuestion = store.QXP_ATTEMPT + store.QXP_CORRECT;
store.payQuizQuestion(convKey, true);
ok(store.quizXpFromLedger() === oneQuestion, "the ledger prices itself at the current rates");
ok(store.rebuildJourneyXp() === 300 + oneQuestion, "so quiz learning still counts, at its capped value");
ok(store.rebuildJourneyXp() === 300 + oneQuestion, "and rebuilding twice changes nothing");

const convSnap = store.journeySnapshot();
ok(convSnap.kind === "journey" && convSnap.qLedger[convKey], "the snapshot carries the ledger");
ok(convSnap.nonSessionXp === undefined, "no private XP total travels — XP is derived, not shipped");

localStorage.clear();
store.migrate();
store.saveSession({ isoDate: "2026-04-01T10:00:00.000Z", dayKey: "monday", completedFully: true, xpEarned: 300 });
ok(store.rebuildJourneyXp() === 300, "device 2 starts from the training log alone");
store.mergeCloudJourney(convSnap);
ok(store.rebuildJourneyXp() === 300 + oneQuestion, "after the merge both devices read the same total");
ok(store.payQuizQuestion(convKey, true).xp === 0, "a question mastered elsewhere is already spent here");
ok(store.mergeCloudJourney(convSnap) === false, "merging the same snapshot again changes nothing");
localStorage.clear();

/* --- prize draws: one prize per level gained, ever ------------------------
   Draws used to be a banked counter, and every replay of a level-up credited
   it again: a second device rebuilding the shared history, a stale cloud
   snapshot merged with max(), an XP correction that let the same levels be
   climbed twice. A draw is derived now — level reached minus prizes claimed —
   so replaying a climb yields the same answer instead of another prize. */
localStorage.clear();
store.migrate();
const lvlXp = n => { let x = 0; for (let i = 1; i < n; i++) x += data.levelCost(i); return x; };
store.saveJourney({ xp: 0, sessionXp: 0, prizesWon: [], pendingDraws: 0 });
ok(store.pendingDrawCount() === 0, "level 1 owes no prize");
store.addXp(lvlXp(4));
ok(store.levelFromXp(store.loadJourney().xp).level === 4, "climbed to level 4");
ok(store.pendingDrawCount() === 3, "three levels gained, three draws owed");
store.addPrize({ icon: "🎁", label: "one" });
ok(store.pendingDrawCount() === 2, "claiming one spends one");

/* A double-tap on "Add to my prizes" is one prize, not two. */
const claimAll = () => { let n = 0; while (store.pendingDrawCount() > 0 && n < 99) { store.addPrize({ icon: "🎁", label: "p" }); n++; } return n; };
ok(claimAll() === 2, "the rest of the draws are claimable");
store.addPrize({ icon: "🎁", label: "extra" });
ok(store.loadJourney().prizesWon.length === 3, "a claim with nothing pending is refused");

/* Prize ids are unique, so the cloud merge can't fold two prizes into one. */
const walletIds = store.loadJourney().prizesWon.map(p => p.id);
ok(new Set(walletIds).size === 3, "every prize gets its own id");
store.redeemPrize(walletIds[0]);
ok(store.loadJourney().prizesWon.find(p => p.id === walletIds[0]).redeemed === true, "a prize redeems by its id");

/* An XP dip and re-climb does not re-sell a level she already cashed. */
const dipped = store.loadJourney(); dipped.xp = lvlXp(2); store.saveJourney(dipped);
ok(store.pendingDrawCount() === 0, "a dip owes nothing");
store.addXp(lvlXp(4) - lvlXp(2));
ok(store.pendingDrawCount() === 0, "and re-climbing the same levels pays no second prize");

/* A rebuild — which every device runs on every boot — grants nothing. */
const spentSnap = store.journeySnapshot();
ok(spentSnap.pendingDraws === 0, "the snapshot publishes the derived count, not a bankable one");
store.rebuildJourneyXp();
ok(store.pendingDrawCount() === 0, "a rebuild does not credit the levels it rediscovers");

/* A second device: same shared history, same wallet, no fresh draws. */
const wonWallet = store.loadJourney().prizesWon;
const staleSnap = { ...spentSnap, prizesWon: [], pendingDraws: 3 };  // cloud copy from before she claimed
localStorage.clear();
store.migrate();
store.saveJourney({ xp: lvlXp(4), sessionXp: lvlXp(4), prizesWon: [], pendingDraws: 0 });
store.mergeCloudJourney({ ...spentSnap, prizesWon: wonWallet });
ok(store.loadJourney().prizesWon.length === 3, "device 2 sees the prizes claimed on device 1");
ok(store.pendingDrawCount() === 0, "so it owes her no second set");
store.mergeCloudJourney(staleSnap);
ok(store.pendingDrawCount() === 0, "and a stale cloud copy cannot resurrect a spent draw");
localStorage.clear();

/* --- redeeming is one-way, with a 5-minute undo for a mis-tap ------------- */
localStorage.clear();
store.migrate();
store.saveJourney({ xp: lvlXp(3), sessionXp: lvlXp(3), prizesWon: [], pendingDraws: 0 });
store.addPrize({ icon: "🎁", label: "one" });
const rid = store.loadJourney().prizesWon[0].id;
const rprize = () => store.loadJourney().prizesWon.find(x => x.id === rid);
store.redeemPrize(rid);
ok(rprize().redeemed === true, "redeeming marks the prize used");
store.redeemPrize(rid);
ok(rprize().redeemed === false, "a second tap inside 5 minutes undoes the mis-tap");
store.redeemPrize(rid);
const agedJ = store.loadJourney();
agedJ.prizesWon = agedJ.prizesWon.map(x => x.id === rid ? { ...x, redeemedAt: Date.now() - 6 * 60 * 1000 } : x);
store.saveJourney(agedJ);
store.redeemPrize(rid);
ok(rprize().redeemed === true, "past the window it stays used — no toggling a prize back");
const legacyJ = store.loadJourney();
legacyJ.prizesWon = legacyJ.prizesWon.map(x => ({ ...x, redeemed: true, redeemedAt: undefined }));
store.saveJourney(legacyJ);
store.redeemPrize(rid);
ok(rprize().redeemed === true, "a prize redeemed before this rule existed is locked");
localStorage.clear();

/* --- the wallet trims to the rule, and the trim survives the next sync ---- */
const pz = (n, date, redeemed) => ({ id: "p" + n, label: "prize" + n, date, redeemed });
const sixPrizes = () => [pz(6, "2026-06-06", false), pz(5, "2026-05-05", false), pz(4, "2026-04-04", false),
                         pz(3, "2026-03-03", false), pz(2, "2026-02-02", true), pz(1, "2026-01-01", true)];
localStorage.clear();
store.migrate();
store.saveJourney({ xp: lvlXp(4), sessionXp: lvlXp(4), maxLevelSeen: 4, pendingDraws: 0, prizesWon: sixPrizes() });
const trimJ = store.loadJourney();
store.reconcileWallet(trimJ);
store.saveJourney(trimJ);
const kept = store.loadJourney().prizesWon.map(x => x.id).sort();
ok(kept.length === 3, "a level-4 wallet of 6 trims to the 3 she earned");
ok(String(kept) === "p1,p2,p3", "keeping both already-used prizes and the oldest unused");
ok(store.pendingDrawCount() === 0, "and the trimmed wallet owes no fresh draws");
ok((store.lastWalletTrim() || {}).count === 3, "the trim is recorded for the grown-up note");
store.mergeCloudJourney({ ...store.journeySnapshot(), prizesWon: sixPrizes(), voidedPrizeIds: [] });
ok(store.loadJourney().prizesWon.length === 3, "a cloud copy still holding all 6 cannot undo the trim");

/* A dip in XP — a thin session log, a partial sync — must never delete a prize
   she really earned. The trim measures against the best level ever reached. */
localStorage.clear();
store.migrate();
store.saveJourney({ xp: lvlXp(4), sessionXp: lvlXp(4), maxLevelSeen: 4, pendingDraws: 0,
                    prizesWon: [pz(3, "2026-03-03", false), pz(2, "2026-02-02", false), pz(1, "2026-01-01", false)] });
const dipJ = store.loadJourney();
dipJ.xp = 0;
store.reconcileWallet(dipJ);
store.saveJourney(dipJ);
ok(store.loadJourney().prizesWon.length === 3, "an XP dip voids nothing — the trim uses the high-water level");
localStorage.clear();

/* --- XP --- */
ok(store.xpForSession({ perExercise: [1,2,3,4,5,6] }) === 100, "6 moves = 100 XP");
ok(store.xpForSession({ sessionType: "spa" }) === 0, "spa earns no XP");

/* A session pays a flat rate for the rounds trained — a 1-round day is worth
   half a 3-round day, and the move count no longer moves the number. Legacy
   rows keep the old formula, so a cloud restore can't re-price history. */
const sess3 = rounds => ({ perExercise: [1,2,3,4,5,6], roundsDone: rounds, xpVersion: store.XP_VERSION });
ok(store.xpForSession(sess3(1)) === 180, "1 round pays 180");
ok(store.xpForSession(sess3(2)) === 270, "2 rounds pay 270");
ok(store.xpForSession(sess3(3)) === 360, "3 rounds pay 360 — a 1-round day is half of it");
ok(store.xpForSession({ ...sess3(3), perExercise: Array(30).fill(1) }) === 360,
   "the move count no longer changes the day's XP");
ok(store.xpForSession({ ...sess3(3), mini: true }) === 180,
   "a mini is one short round, so it is priced as a 1-round day even on green");
ok(store.xpForSession({ perExercise: [1,2,3,4,5,6], roundsDone: 3 }) === 100,
   "a legacy row keeps the old moves x 10 + 40 value");
ok(store.xpForSession({ ...sess3(3), sessionType: "spa" }) === 0, "spa still earns nothing");

/* --- defaults --- */
ok(store.DEFAULT_SETTINGS.voiceStyle === "encouraging", "default voice is process-praise");
ok(store.DEFAULT_SETTINGS.cloudMirror === true, "cloudMirror default on");

/* --- parent form check: the ground truth under every quality number -------
   Clean %, quiz mastery and the safety gate are all built on the kid's own
   word, so the app can be confidently wrong about her technique. */
localStorage.clear();
store.migrate();
for (let d = 40; d >= 1; d -= 2) {
  store.saveSession({ isoDate: new Date(Date.now() - d * 86400000).toISOString(), dayKey: "monday",
    completedFully: true, roundsDone: 3, xpVersion: store.XP_VERSION, durationSecs: 1400, xpEarned: 360,
    plannedSecs: 1500, clean: 2, wobbly: 0,
    formChecks: [{ name: "Glute Bridge March", clean: true }, { name: "Dead Bug", clean: true }],
    perExercise: [{ name: "Glute Bridge March", skipped: false }, { name: "Dead Bug", skipped: false }, { name: "Superman", skipped: false }] });
}
const fcState = { grownupTab: "formcheck", gsScope: "month", isWide: true };
let fc = gvm.buildGrownupVM(fcState).formCheck;
ok(fc.queue.length === 5, "five moves a month are queued, not all forty");
ok(fc.queue.every(c => c.watch), "each carries the written watch-for criteria the app already ships");
ok(fc.queue.every(c => c.why), "and says why it was picked");
ok(fc.selfPct === 100 && fc.verifiedPct === null, "she reports 100% clean and nothing is verified yet");
store.recordFormVerdict("Glute Bridge March", false);
fc = gvm.buildGrownupVM(fcState).formCheck;
ok(fc.verifiedPct === 0 && fc.gap === -100, "a failed check surfaces the gap between what she claims and what you saw");
ok(fc.flagged.includes("Glute Bridge March"), "and flags the move for re-teaching");
const fcCircuits = [{ block: "main", exercises: [{ name: "Glute Bridge March" }, { name: "Dead Bug" }, { name: "Superman" }, { name: "Pallof Press" }, { name: "Hollow Tuck Flutter" }] }];
let fcFront = 0;
for (let i = 0; i < 200; i++) if (engine.pickSpotChecks(fcCircuits).includes("Glute Bridge March")) fcFront++;
ok(fcFront === 200, "a failed move goes to the front of the next runs' random spot-checks");
store.recordFormVerdict("Glute Bridge March", true);
fc = gvm.buildGrownupVM(fcState).formCheck;
ok(fc.verifiedPct === 100 && fc.flagged.length === 0, "re-verifying it clears the flag");
const fcInd = gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics", isWide: true })
  .analytics.indicators.find(i => i.label === "Form · you verified");
ok(fcInd.total === "1 of 1", "the indicator board reports verified form beside self-reported form");
ok(fc.prevMonth < fc.month && fc.nextMonth > fc.month, "the month stepper moves in both directions");
await unlockGrownup();   // the Zone renders its tabs only to a grown-up
ok(/Form check/.test(gscreen.grownupScreen(gvm.buildGrownupVM(fcState))), "the Form Check tab renders");
const fcXpBefore = store.loadJourney().xp;
store.recordFormVerdict("Dead Bug", true);
ok(store.loadJourney().xp === fcXpBefore, "recording a verdict never touches XP or prizes — it is a conversation tool, not a reward");
/* The UI passes null for "the current month". A default parameter only fills in
   for undefined, so null used to file the verdict under a "null" key where the
   month view never found it. */
store.recordFormVerdict("Superman", true, null);
ok(store.formVerdicts(null).Superman && store.formVerdicts().Superman,
   "a null month means the current month, not a month called 'null'");
localStorage.clear();

/* The trim used to run only inside rebuildJourneyXp, which only runs on a cloud
   sync — so a grown-up who turned the mirror off for privacy never got it. */
store.saveJourney({ xp: lvlXp(4), sessionXp: lvlXp(4), maxLevelSeen: 4, pendingDraws: 0, prizesWon: sixPrizes() });
store.updateSettings({ cloudMirror: false });
store.migrate();
ok(store.loadJourney().prizesWon.length === 3, "the wallet trims at boot, even with the cloud mirror switched off");
store.updateSettings({ cloudMirror: true });
localStorage.clear();

/* --- Grown-up: the period toggle now moves every panel --------------------
   All-time used to look like Month: the consistency grid was hardcoded to 28
   days, the load trend capped at 8 weeks, and the quiz trend ignored the scope
   entirely. */
localStorage.clear();
store.migrate();
for (let d = 150; d >= 1; d -= 3) {
  store.saveSession({ isoDate: new Date(Date.now() - d * 86400000).toISOString(), dayKey: "monday",
    completedFully: d % 9 !== 0, roundsDone: 3, xpVersion: store.XP_VERSION, durationSecs: 1400,
    xpEarned: 360, mood: "okay", lightResult: d % 12 === 0 ? "red" : "green", plannedSecs: 1500,
    formChecks: [{ clean: true }, { clean: d % 5 !== 0 }], clean: 2, wobbly: 0,
    perExercise: Array.from({ length: 6 }, () => ({ skipped: false })) });
}
store.reconcileJourneyWithSessions();
const gq = store.loadQuiz();
gq.results = [{ t: Date.now() - 100 * 86400000, score: 5, total: 8 }, { t: Date.now() - 2 * 86400000, score: 7, total: 8 }];
store.saveQuiz(gq);
const gA = k => gvm.buildGrownupVM({ gsScope: k, grownupTab: "analytics", isWide: true }).analytics;
const gWeek = gA("week"), gMonth = gA("month"), gAll = gA("all");
ok(gAll.consistency.cells.length !== gMonth.consistency.cells.length, "the consistency grid differs between Month and All-time");
ok(/per week/.test(gAll.consistency.subtitle), "all-time consistency is one cell per week, back to her first session");
ok(gAll.loadTrend.length > gMonth.loadTrend.length && gAll.loadTrend.length > 8, "the load trend spans her history instead of capping at 8 weeks");
ok(gMonth.quizTrend.length < gAll.quizTrend.length, "the quiz trend obeys the scope instead of always showing the last 6 runs");
ok(gAll.indicators.length === 11 && gAll.indicators.every(i => i.total !== undefined && i.avg !== undefined),
   "the indicator board reports every category as a total and an average");
ok(gWeek.indicators[1].total !== gAll.indicators[1].total, "and its numbers move when the period changes");
ok(gAll.isSheTrying.avg != null && gAll.isSheTrying.lines.length >= 2, "the 'Is she trying?' card has a score and its plain-English lines");
await unlockGrownup();
ok(/Is she trying/.test(gscreen.grownupScreen(gvm.buildGrownupVM({ gsScope: "all", grownupTab: "analytics", isWide: true }))),
   "and it renders on the Analytics tab");

/* A try-it pain stop must reach Safety & Flags without touching training stats. */
const beforeCompleted = gA("week").indicators[5].total;
store.saveSession({ practice: true, dayKey: "monday", isoDate: new Date(Date.now() - 86400000).toISOString(),
                    pain: true, sessionType: "try-it", completedFully: false, endedEarly: true, safetyOnly: true, durationSecs: 200 });
ok(gA("week").hasStops === true, "a try-it pain stop shows up in Safety & Flags");
ok(gA("week").indicators[5].total === beforeCompleted, "but never counts as a session she trained");
localStorage.clear();

/* --- Progress periods: totals AND averages, over a real window ------------
   The screen only ever showed "this week", so a month of work was invisible. */
localStorage.clear();
store.migrate();
const pIso = n => new Date(Date.now() - n * 86400000).toISOString();
[2, 10, 25, 80].forEach((d, i) => store.saveSession({
  isoDate: pIso(d), dayKey: "monday", completedFully: true, roundsDone: 3, xpVersion: store.XP_VERSION,
  durationSecs: 1500, xpEarned: 360, mood: i ? "okay" : "great", lightResult: i === 1 ? "red" : "green",
  formChecks: [{ clean: true }, { clean: i !== 2 }], clean: 2, wobbly: 0,
  perExercise: Array.from({ length: 6 }, () => ({ skipped: false })) }));
store.reconcileJourneyWithSessions();
["4w", "month", "quarter"].forEach(k => {
  const ps = pvm.buildProgressVM({ progressScope: k, logScope: "week" }).periodStats;
  ok(ps.rows.length === 9, k + ": nine categories");
  ok(ps.rows.every(r => r.total !== undefined && r.avg !== undefined), k + ": every category carries a total AND an average");
  ok(ps.xpByDay.length > 0, k + ": the XP-per-day strip has a bar per day");
});
const p4w = pvm.buildProgressVM({ progressScope: "4w", logScope: "week" }).periodStats;
const pRow = l => p4w.rows.find(r => r.label === l);
ok(pRow("Sessions finished").total === "3", "the 4-week window excludes the 80-day-old session");
ok(pRow("Completion status").total.includes(" of "), "completion status reads done-of-started");
ok(pRow("Levels upgraded").total.startsWith("+"), "levels upgraded is reported for the window");
ok(pRow("Tough days finished").total === "1", "a red-light day she finished counts as a tough day");
ok(/progressScope/.test(pscreen.progressScreen(pvm.buildProgressVM({ progressScope: "month", logScope: "week" }))),
   "the period toggle renders on the Progress screen");
localStorage.clear();
store.migrate();
ok(pvm.buildProgressVM({ progressScope: "4w", logScope: "week" }).periodStats.hasData === false,
   "an empty window says so rather than showing a wall of zeros");
localStorage.clear();

/* --- effort: scored on what she controls, normalised to the day -----------
   Volume metrics reward an easy day. Effort has to reward the opposite: doing
   the day's own target properly, especially on a day she felt bad. */
const eSess = o => ({ perExercise: Array.from({ length: 6 }, (_, i) => ({ name: "m" + i, skipped: false })),
                      completedFully: true, lightResult: "green", plannedSecs: 1200, durationSecs: 1200,
                      formChecks: [{ clean: true }, { clean: true }, { clean: true }], ...o });
const ePain = effort.sessionEffort(eSess({ pain: true, completedFully: false }));
ok(ePain.counted === false && ePain.painStop === true, "a pain stop is excluded from effort, never penalised");
ok(/right call/i.test(ePain.band), "and reads as the right call — the stop rule must never cost her");
const eGreen = effort.sessionEffort(eSess({}));
ok(effort.sessionEffort(eSess({ lightResult: "red" })).score > eGreen.score,
   "a red-light day outscores the same work on a green one — showing up when it's hard is the point");
ok(effort.sessionEffort(eSess({ formChecks: [{ clean: false }, { clean: false }, { clean: false }] })).score < eGreen.score,
   "wobbly spot-checks cost form points");
ok(effort.sessionEffort(eSess({ perExercise: [{ skipped: true }, { skipped: true }, { skipped: false }, { skipped: false }, { skipped: false }, { skipped: false }] })).score < eGreen.score,
   "skipping moves costs effort");
ok(effort.sessionEffort(eSess({ durationSecs: 400 })).score < eGreen.score, "rushing the clock costs effort");
ok(effort.sessionEffort(eSess({ durationSecs: 2400 })).score === eGreen.score, "but running long is never penalised");
const eSum = effort.effortSummary([eSess({}), eSess({ lightResult: "red" }), eSess({ pain: true })]);
ok(eSum.sessions === 2 && eSum.painStops === 1, "pain stops are reported but kept out of the average");
ok(eSum.toughDays === 1 && eSum.toughFinished === 1, "tough days shown up for are counted");
ok(eSum.formPct === 100, "form % comes from the spot-checks, not a guess");

/* The spot-check picker: 2–3 moves, main/prep only, different every run. */
const spotCircuits = [{ block: "warmup", exercises: [{ name: "w1" }, { name: "w2" }] },
                      { block: "main", exercises: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" }] },
                      { block: "prep", exercises: [{ name: "p1" }] }];
const spotSizes = new Set(); const spotSeen = new Set(); let spotWarmup = false;
for (let i = 0; i < 300; i++) {
  const pick = engine.pickSpotChecks(spotCircuits);
  spotSizes.add(pick.length);
  pick.forEach(n => { spotSeen.add(n); if (n[0] === "w") spotWarmup = true; });
}
ok([...spotSizes].every(n => n >= 2 && n <= 3), "the app watches 2–3 moves a run, not all twelve");
ok(!spotWarmup, "and never a warm-up move — main and prep only");
ok(spotSeen.size === 6, "the picks vary run to run, so she can't know which move is watched");

/* --- looking at the moves is a button, not a mode --------------------------
   Try-It used to be ARMED: a grown-up flipped a persistent setting and, while
   it was on, GO opened the move list instead of starting a workout. That flag
   went through three repairs (memory-only, then never cleared, then a two-hour
   expiry) and none of them were needed to read an instruction. Every launchable
   day has its own button straight to the list now. */
localStorage.clear();
store.migrate();
ok(store.tryItArmed === undefined && store.setTryIt === undefined,
   "the arming machinery is gone from the store entirely");
ok(store.loadSettings().tryItArmed === undefined, "and so is its setting");

const launchDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const tryItGaps = { noButton: [], notAButton: [], goHijacked: [] };
launchDays.forEach(d => {
  const vm = tvm.buildTodayVM({ selectedDay: d, expanded: {}, isWide: true });
  const dv = vm.dayView;
  if (!(dv.isActive || dv.isDone || dv.isMissed || dv.isPreview)) return;   // nothing to launch
  if (!dv.showTryIt) tryItGaps.noButton.push(d);
  const html = tscreen.todayWide(vm);
  if (!new RegExp('data-action="goTryIt" data-arg="' + d + '"').test(html)) tryItGaps.notAButton.push(d);
  // GO always means GO — nothing can re-point it at the move list.
  if (dv.showCta && dv.ctaAction === "goTryIt" && !dv.isDone && !dv.isRest) tryItGaps.goHijacked.push(d);
});
ok(tryItGaps.noButton.length === 0, "every day a run can start from offers a direct look at the moves");
ok(tryItGaps.notAButton.length === 0, "and it goes straight to that day's list, with no mode to arm first");
ok(tryItGaps.goHijacked.length === 0, "while the start button still starts the workout");
const tryVM = tvm.buildTodayVM({ selectedDay: launchDays[0], expanded: {}, isWide: true });
ok(/min-height:48px/.test(tryVM.practiceBtnStyle), "with a 48px tap target — the old link was ~16px");
ok(tryVM.practiceMode === undefined, "and there is no armed state left for a screen to read");

/* TRY-IT IS NOT A WORKOUT. It used to run the entire session engine — Body
   Check, traffic light, rounds, timers, clean-checks, a finish screen —
   behind a purple banner, so a kid could complete a whole workout that was
   never going to count. It is a list of moves now. */
const tryItVM = tryvm.buildTryItVM({ selectedDay: "monday", isWide: true, detailOverlay: false, detailEx: null });
const tryItHtml = tryscreen.tryItScreen(tryItVM);
ok(tryItVM.moves.length > 0, "the try-it screen lists the day's moves");
ok(tryItVM.moves.every(m => m.videoUrl && m.videoUrl !== "#"), "every one links to a demo video");
ok(/data-action="tryItDetail"/.test(tryItHtml), "and each is tappable for instructions");
ok(!/data-action="(advance|pauseTimer|skipEx|stopNow)"/.test(tryItHtml),
   "with no timer controls anywhere — there is nothing running to control");
ok(/data-action="exitTryIt"/.test(tryItHtml), "and a plain way out");
/* prepMenu moves are inserted by the session assembly but were missing from
   every "what's in today" count — in try-it there is nothing to assemble. */
ok(tryvm.tryItMoves("tuesday").some(m => m.name === "Pallof Press"),
   "try-it lists prepMenu moves too, which the plan counts never included");

/* The engine itself refuses the mode, so no stale caller can start a real,
   recorded workout in "test" mode. */
localStorage.clear();
store.migrate();
await engine.startSession({ dayKey: "monday", light: "green", mode: "tryit" });
ok(engine.sess.running === false, "the engine refuses to start a try-it session at all");
ok(store.loadSessions().length === 0, "so try-it can never write a session record");

/* Legacy try-it rows may still sit in a history; they are not training. */
store.saveSession({ app: "swimming", practice: true, dayKey: "monday", dayTitle: "Mon",
                    isoDate: new Date().toISOString(), durationSecs: 300, sessionType: "try-it",
                    pain: true, endedEarly: true, completedFully: false, safetyOnly: true });
const painRow = store.loadSessions()[0];
ok(store.countsAsTrained(painRow) === false, "a legacy try-it row is not a trained day");
ok(store.sessionXp(painRow) === 0, "and pays no XP");
ok(store.rebuildJourneyXp() === 0, "so a rebuild still totals nothing");
localStorage.clear();

/* --- prize pool defaults avoid food / screen-time --- */
const prizeText = data.PRIZE_POOL.map(p => p.label.toLowerCase()).join("|");
ok(!/dinner|dessert|ice ?cream|ipad|screen/.test(prizeText), "no food/screen default prizes");

/* --- traffic-light colour survives to the CTA --- */
ok(data.LIGHT_META.red.btnColor !== data.LIGHT_META.green.btnColor, "red CTA differs from green");
ok(data.LIGHT_META.green.emoji === "🟢", "unified circle light icons");

/* --- readiness scoring --- */
const scored = rvm.newReadinessFlow("monday", false);
["q_sleep", "q_light", "q_ready"].forEach(q => rvm.answerQuestion(scored, q, "yes"));
rvm.answerQuestion(scored, "q_pain", "yes");
ok(scored.light === "green", "all-good readiness → green");

/* --- THE TWO SIGNALS ARE COMBINED, NOT SWAPPED ---------------------------
   The body map used to overwrite the general-readiness light outright — and on
   the sore path the readiness light was never even computed, because scoring
   bailed unless the pain answer was "all good" and the pain question was asked
   FIRST. So a girl who slept badly, felt tired and had no energy, with one
   merely-tired shoulder, was handed a Yellow two-round day. Neither reading is
   wrong; they are about different things. The session runs the smaller day. */
ok(rvm.moreCautious("green", "red") === "red" && rvm.moreCautious("recovery", "yellow") === "recovery",
   "the more cautious of two lights is the smaller day, whichever side it comes from");
ok(rvm.moreCautious("yellow", null) === "yellow", "and a missing second signal decides nothing");
ok(data.READINESS_QS[data.READINESS_QS.length - 1].id === "q_pain",
   "the pain question is asked LAST, so the other three always get asked");

const flatAndSore = rvm.newReadinessFlow("monday", false);
["q_sleep", "q_light", "q_ready"].forEach(q => rvm.answerQuestion(flatAndSore, q, "no"));
rvm.answerQuestion(flatAndSore, "q_pain", "no");
ok(flatAndSore.readinessLight === "recovery",
   "three negative answers score Recovery even on the sore path — they used to score nothing");
ok(flatAndSore.step === "bodyArea", "and the sore answer still routes to the body map");
rvm.setZoneSev(flatAndSore, 2, 2);
ok(flatAndSore.bodyLight === "yellow", "a tired shoulder is Yellow on the body map's own terms");
ok(flatAndSore.light === "recovery",
   "but the day runs Recovery — the body map no longer overrules a flatter body");
const flatVM = rvm.buildReadinessVM(flatAndSore, true);
ok(/Body Check said/.test(flatVM.combinedLine) && /Quick check said/.test(flatVM.combinedLine),
   "and the card names both readings, so Recovery over a Yellow map is not a mystery");

/* The other direction is unchanged: a sore body still outranks a good night. */
const freshButSore = rvm.newReadinessFlow("monday", false);
["q_sleep", "q_light", "q_ready"].forEach(q => rvm.answerQuestion(freshButSore, q, "yes"));
rvm.answerQuestion(freshButSore, "q_pain", "no");
rvm.setZoneSev(freshButSore, 2, 3);
ok(freshButSore.light === "red", "a good night with real pain in it is still a Red day");
ok(rvm.buildReadinessVM(freshButSore, true).needsGrownupConfirm,
   "and severity 3 still needs a grown-up");

/* The pain gate belongs to the PAIN, not to whichever signal won the light. */
const flatAndHurting = rvm.newReadinessFlow("monday", false);
["q_sleep", "q_light", "q_ready"].forEach(q => rvm.answerQuestion(flatAndHurting, q, "no"));
rvm.answerQuestion(flatAndHurting, "q_pain", "no");
rvm.setZoneSev(flatAndHurting, 2, 3);
ok(flatAndHurting.light === "recovery", "pain plus a flat body is Recovery, not Red");
ok(rvm.buildReadinessVM(flatAndHurting, true).needsGrownupConfirm,
   "and the grown-up confirm survives the readiness score taking the light past Red");

/* Re-checking the body must not quietly throw the readiness answers away. */
rvm.resetBodyCheck(flatAndHurting);
ok(flatAndHurting.light === "recovery" && flatAndHurting.severity === null,
   "clearing the marks clears the MARKS — a flat night is not a mark and survives");

/* Nothing regresses where there is only one signal to go on. */
const bodyOnly = rvm.newReadinessFlow("monday", false);
rvm.answerQuestion(bodyOnly, "q_pain", "no");
rvm.setZoneSev(bodyOnly, 2, 2);
ok(bodyOnly.light === "yellow" && bodyOnly.readinessLight === null,
   "with no readiness answers the body map decides alone, exactly as it always did");

/* --- pain-gate: level 3 requires a grown-up confirm; level 2 does not --- */
const r3 = rvm.newReadinessFlow("monday", false);
rvm.answerQuestion(r3, "q_pain", "no");
ok(r3.step === "bodyArea", "sore answer routes to body check");
rvm.setZoneSev(r3, 4, 3);
let html = rscreen.readinessScreen(rvm.buildReadinessVM(r3, true));
ok(/rGrownupOk/.test(html) && /disabled/.test(html), "sev3 gate rendered + CTA disabled");
rvm.confirmGrownup(r3);
ok(!/disabled/.test(rscreen.readinessScreen(rvm.buildReadinessVM(r3, true))), "CTA enables after confirm");
const r2 = rvm.newReadinessFlow("monday", false);
rvm.answerQuestion(r2, "q_pain", "no");
rvm.setZoneSev(r2, 6, 2);
ok(!/rGrownupOk/.test(rscreen.readinessScreen(rvm.buildReadinessVM(r2, true))), "sev2 does not gate");

/* --- quiz has a correct option and rotates over the expanded bank --- */
const q = svm.sessionQuizFor("monday");
ok(q && q.opts.some(o => o.ok), "quiz question has a correct answer");
ok(q.id, "Coach's Quiz questions carry a stable id for the XP ledger");

/* --- the rank ladder only ever grows upward -----------------------------
   Every historical threshold must keep its exact level, or a kid's rank
   silently moves backwards on the next release. */
const REQUIRED_RUNGS = [[1, "Seahorse"], [3, "Sea Turtle"], [6, "Penguin"], [9, "Sea Otter"],
  [12, "Stingray"], [15, "Dolphin"], [18, "Shark"], [21, "Orca"], [24, "Sailfish"], [26, "Marlin"]];
REQUIRED_RUNGS.forEach(([lvl, name]) => {
  ok(data.LADDER.some(r => r.level === lvl && r.name === name),
     `ladder keeps ${name} at level ${lvl}`);
});
ok(data.levelCost(1) === 500 && data.levelCost(9) === 1000 && data.levelCost(26) === 1900,
   "levelCost curve unchanged (re-pricing would move an earned level)");
ok(data.MAX_LEVEL === 50 && data.MAX_LEVEL === data.LADDER[data.LADDER.length - 1].level,
   "the ladder now tops out at level 50");
ok(data.LADDER.every((r, i, a) => i === 0 || r.level > a[i - 1].level), "ladder levels strictly increase");
data.LADDER.forEach(r => ok(data.RANK_LORE[r.name] && data.RANK_LORE[r.name].story,
  `${r.name} has lore (no blank story card)`));
data.LADDER.slice(1).forEach(r => ok(data.RANK_TEASE[r.name],
  `${r.name} has a locked-card tease`));
ok(tvm.buildJourney().atSummit === false, "not at summit at level 1");

/* --- quiz XP cannot be farmed -------------------------------------------
   Regression guard for the old `score*25 + answered*10` rule, which had no
   cap, no cooldown and no memory: because the deck reveals each answer, a
   replay was a guaranteed 8/8 = 280 XP, so the ladder could be climbed by
   tapping instead of training. */
const playPerfect = () => {
  const qd = overlays.buildQuizDeck(8);
  qd.qs.forEach((qq, i) => { qd.idx = i; overlays.answerQuizDeck(qd, qq.opts.findIndex(o => o.ok)); });
  overlays.finishQuizDeck(qd);
  return qd;
};
localStorage.removeItem(store.LS_QUIZ);
localStorage.removeItem(store.LS_JOURNEY);
const bank0 = store.quizBankStatus();
const BANK = store.questionBank().length;      // 83 move questions + the unlocked ranks
ok(BANK === 83 + store.rankPool().length * 2, "the bank is the moves plus the unlocked ocean chapters");
ok(bank0.total === BANK && bank0.mastered === 0, "nothing is mastered on a fresh device");
ok(bank0.xpTotal === BANK * (store.QXP_ATTEMPT + store.QXP_CORRECT), "lifetime quiz XP budget is bank x question value");

/* --- the ocean chapters are quiz material too, once unlocked --- */
const swimBank1 = store.questionBank(1), swimBank26 = store.questionBank(26);
ok(swimBank26.length > swimBank1.length, "the question pool grows as ranks unlock");
ok(store.rankPool(1).length === 1 && store.rankPool(50).length === data.LADDER.length,
   "only ranks she has reached are askable — locked chapters stay a mystery");
ok(store.rankPool(26).every(r => r.name.startsWith("Rank: ")),
   "rank topics have their own ledger key space, never colliding with a move");
ok(swimBank26.filter(([, k]) => k === "story" || k === "fact").length === store.rankPool(26).length * 2,
   "each unlocked rank is asked two ways");

const firstDeck = playPerfect();
ok(firstDeck.wasPaidRound === true && firstDeck.xpEarned === store.QXP_DAILY_CAP,
   "the day's paying deck stops at the daily cap");
ok(firstDeck.hitDailyCap === true && firstDeck.newlyMastered === 1,
   "only the question the cap paid for is marked mastered");
ok(store.quizXpLeftToday() === 0, "the daily quiz budget is spent");
let sameDay = 0;
for (let i = 0; i < 12; i++) sameDay += playPerfect().xpEarned;
ok(sameDay === 0, "every later deck the same day pays 0 (one paying deck per day)");
ok(store.quizPaidToday() === true, "quizPaidToday flips after the paying deck");
ok(store.quizBankStatus().mastered === 1, "practice replays never advance the mastery ledger");

// A fresh day restores the budget; the questions the cap skipped kept full value.
const nextDay = store.loadQuiz();
nextDay.lastPaidISO = null; nextDay.dayISO = "2020-01-01"; store.saveQuiz(nextDay);
ok(store.quizXpLeftToday() === store.QXP_DAILY_CAP, "the daily budget resets with the date");
const day2 = playPerfect();
ok(day2.xpEarned === store.QXP_DAILY_CAP && store.quizBankStatus().mastered === 2,
   "the next day pays another capped round of brand-new questions");

// New day, but the same questions: already-mastered questions must not re-pay.
const qz = store.loadQuiz();
qz.lastPaidISO = null; qz.dayISO = null; qz.dayXp = 0;
qz.qLedger = Object.fromEntries(store.questionBank()
  .map(([m, k]) => [store.quizQuestionKey(m.name, k), { attempted: true, mastered: true }]));
store.saveQuiz(qz);
ok(playPerfect().xpEarned === 0, "a fully-mastered bank pays nothing, even on a fresh day");

// Wrong answers earn the attempt credit but never the correct credit — and the
// question stays claimable, so the XP arrives when it is finally learned.
const qz2 = store.loadQuiz();
qz2.lastPaidISO = null; qz2.dayISO = null; qz2.dayXp = 0; qz2.qLedger = {}; store.saveQuiz(qz2);
const wrongDeck = overlays.buildQuizDeck(8);
wrongDeck.qs.forEach((qq, i) => { wrongDeck.idx = i; overlays.answerQuizDeck(wrongDeck, qq.opts.findIndex(o => !o.ok)); });
overlays.finishQuizDeck(wrongDeck);
ok(wrongDeck.xpEarned === 30 && wrongDeck.newlyMastered === 0,
   "all-wrong deck pays attempt credit only (6 x 5, then the cap bites) and masters nothing");
// left vs total, not a captured number: the bank grows as ranks unlock, and
// earlier tests move the level around.
const afterWrong = store.quizBankStatus();
ok(afterWrong.left === afterWrong.total, "wrong answers leave every question still claimable");

// The Coach's Quiz at the end of a session prices off the same ledger and
// shares the same daily ceiling.
localStorage.removeItem(store.LS_QUIZ);
const coachKey = store.quizQuestionKey("coach", q.id);
ok(store.payQuizQuestion(coachKey, true).xp === 30, "a new Coach's Quiz answer pays attempt + correct, exactly one day's budget");
ok(store.payQuizQuestion(coachKey, true).xp === 0, "answering it again pays nothing");
localStorage.removeItem(store.LS_QUIZ);
ok(store.payQuizQuestion(coachKey, false).xp === 5, "a missed question pays the attempt credit only");
ok(store.payQuizQuestion(coachKey, true).xp === 25, "and pays the rest when it is finally learned");
const spent = store.loadQuiz();
spent.dayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
spent.dayXp = store.QXP_DAILY_CAP; store.saveQuiz(spent);
const capped = store.payQuizQuestion(store.quizQuestionKey("coach", "another"), true);
ok(capped.xp === 0 && capped.capped === true, "the Coach's Quiz respects the shared daily cap");
ok(!store.loadQuiz().qLedger[store.quizQuestionKey("coach", "another")],
   "a capped question is left unspent, worth full value tomorrow");
localStorage.removeItem(store.LS_QUIZ);
localStorage.removeItem(store.LS_JOURNEY);

/* --- the day card quotes what the session actually earned ------------------
   It used to carry its own copy of the XP formula, so the card and the ladder
   disagreed about the same session the moment the rates changed. */
localStorage.clear();
store.migrate();
const todayKey = new Date().toLocaleString("en-US", { timeZone: "America/Edmonton", weekday: "long" }).toLowerCase();
store.saveSession({ isoDate: new Date().toISOString(), dayKey: todayKey, completedFully: true,
                    roundsDone: 3, xpVersion: store.XP_VERSION, perExercise: Array(18).fill(1) });
const dayVM = tvm.buildTodayVM({ selectedDay: todayKey, expanded: {}, practiceMode: false, isWide: true });
// Assert against the day the calendar actually lands on. Spa Sunday earns 0 by
// design, so hard-coding "+360" made this test fail every Sunday and pass the
// other six days — a flake that says nothing about the XP label.
ok(data.DAYS[todayKey].spa
   ? (dayVM.dayView.earnedXpLabel || "") === ""
   : /\+360 XP earned/.test(dayVM.dayView.earnedXpLabel || ""),
   "a finished 3-round day says +360 (and a spa day says nothing)");
localStorage.clear();

/* --- view-models + screens render to strings without throwing --- */
const state = { selectedDay: null, expanded: {}, practiceMode: false, nav: "today", weather: null, isWide: true, detailEx: null, detailOverlay: false };
ok(typeof tvm.buildTodayVM(state).dayView === "object", "today VM builds");
ok(typeof sscreen.sessionScreen(svm.buildSessionVM(state)) === "string", "session screen renders");

/* --- day progress survives midnight (one bout, two calendar dates) --- */
localStorage.clear();
store.saveDayProgress("monday", { done: ["warmup"], light: "green" });
const dp = JSON.parse(localStorage.getItem(store.LS_DAYPROG));
const [onlyKey] = Object.keys(dp);
// Re-file it under yesterday, as if the blocks were finished before midnight.
dp["monday|2000-01-01"] = { ...dp[onlyKey], savedAt: Date.now() - 60 * 60 * 1000 };
delete dp[onlyKey];
localStorage.setItem(store.LS_DAYPROG, JSON.stringify(dp));
ok(store.loadDayProgress("monday").done[0] === "warmup", "a partial from an hour ago carries across midnight");
dp["monday|2000-01-01"].savedAt = Date.now() - 20 * 60 * 60 * 1000;
localStorage.setItem(store.LS_DAYPROG, JSON.stringify(dp));
ok(store.loadDayProgress("monday") === null, "a stale partial still does not carry over (No-Debt)");
store.clearDayProgress("monday");
ok(Object.keys(JSON.parse(localStorage.getItem(store.LS_DAYPROG))).length === 0, "clear removes every date bucket");

/* --- patches land on their own record, not on whatever finished last --- */
localStorage.clear();
const a = { isoDate: "2026-01-01T10:00:00.000Z", dayKey: "monday" };
const b = { isoDate: "2026-01-01T18:00:00.000Z", dayKey: "tuesday" };
store.saveSession(a); store.saveSession(b);
store.patchSession(store.sessionKey(a), { mood: "great" });
ok(store.loadSessions()[0].mood === "great", "patch finds the right record");
ok(store.loadSessions()[1].mood === undefined, "the later session is untouched");

/* --- a full disk is reported, not swallowed --- */
localStorage.clear();
let seen = null;
store.onStorageError(e => { seen = e; });
store.logEvent("noise", { pad: "x".repeat(50) });          // something expendable to drop
const realSet = localStorage.setItem;
const realErr = console.error; console.error = () => {};   // the reported failure is the point
let full = true;
localStorage.setItem = (k, v) => { if (full) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } realSet(k, v); };
ok(store.saveSession({ isoDate: "2026-01-02T10:00:00.000Z" }) === false, "a rejected write reports failure");
ok(seen && /Quota/.test(seen.message), "the app is told about it");
ok(localStorage.getItem(store.LS_EVENTS) === null, "expendable analytics were dropped to make room");
full = false;
seen = null;
ok(store.saveSession({ isoDate: "2026-01-02T10:00:00.000Z" }) === true, "writes succeed again once there is room");
ok(seen === null, "and no error is reported then");
localStorage.setItem = realSet;
console.error = realErr;
store.onStorageError(null);

/* --- profiles: one storage namespace per kid, first kid keeps the bare keys --- */
localStorage.clear();
ok(store.activeProfileId() === store.LEGACY_PROFILE_ID, "the existing athlete stays on the legacy profile");
store.saveSession({ isoDate: "2026-02-01T10:00:00.000Z", dayKey: "monday", completedFully: true });
ok(localStorage.getItem(store.LS_SESSIONS) !== null, "her sessions stay on the unsuffixed key");
const jenn = store.addProfile("Jenn");
ok(store.profileList().length === 2, "a second athlete is registered");
ok(store.loadSessions().length === 1, "adding one doesn't disturb the active athlete");
store.switchProfile(jenn);
ok(store.loadSessions().length === 0, "the new athlete starts with her own empty log");
store.saveSession({ isoDate: "2026-02-02T10:00:00.000Z", dayKey: "tuesday", completedFully: true });
ok(localStorage.getItem(store.LS_SESSIONS + "::" + jenn) !== null, "and writes to her own namespace");
ok(!store.belongsToAthlete({ isoDate: "x" }), "untagged cloud records are not hers");
store.switchProfile(store.LEGACY_PROFILE_ID);
ok(store.loadSessions().length === 1, "switching back restores the first athlete's log intact");
ok(store.belongsToAthlete({ isoDate: "x" }), "untagged cloud records belong to the athlete who was here first");
localStorage.clear();

/* --- backup: a full copy of one athlete, restored additively --- */
localStorage.clear();
store.migrate();
// 600 XP is past level 1's cost, so the prize below is one she actually owns —
// addPrize refuses a claim with no draw pending.
store.saveSession({ isoDate: "2026-03-01T10:00:00.000Z", dayKey: "monday", perExercise: [1,2,3,4,5,6], completedFully: true, xpEarned: 600 });
store.reconcileJourneyWithSessions();
store.addXp(100);
store.addPrize({ icon: "🎁", label: "Movie night" });
ok(store.loadJourney().prizesWon.length === 1, "a level-up buys a prize");
store.saveQuiz({ items: { a: 1 }, results: [1], streak: 3 });
const backup = store.exportProfileData();
ok(backup.app === "splash-swim-dryland" && backup.schema === 1, "backup is stamped");
ok(backup.data[store.LS_SESSIONS].length === 1, "the session log is in the file");
ok(backup.data[store.LS_JOURNEY].prizesWon.length === 1, "so is the prize wallet");
ok(backup.data[store.LS_QUIZ].streak === 3, "and quiz mastery");

localStorage.clear();                       // the Safari-eviction case
store.migrate();
ok(store.loadSessions().length === 0 && store.loadJourney().xp === 0, "device is empty");
const restored = store.importProfileData(backup);
ok(restored.sessionsAdded === 1, "the session comes back");
ok(store.loadJourney().xp === 700, "XP comes back");
ok(store.loadJourney().prizesWon.length === 1, "the prize wallet comes back");
ok(store.loadQuiz().streak === 3, "quiz mastery comes back");
ok(store.loadSettings().athleteName === backup.data[store.SETTINGS_KEY].athleteName, "her settings come back onto a fresh device");
const again = store.importProfileData(backup);
ok(again.sessionsAdded === 0 && again.xpAdded === 0, "restoring the same file twice changes nothing");
ok(store.loadJourney().xp === 700, "and cannot inflate XP");

/* Additive: a record only on the device survives a restore. */
store.saveSession({ isoDate: "2026-03-05T10:00:00.000Z", dayKey: "friday", completedFully: true, xpEarned: 100 });
store.importProfileData(backup);
ok(store.loadSessions().length === 2, "a newer local session is not wiped by an older backup");
/* ...but settings a grown-up actually changed on THIS device still win. */
store.updateSettings({ roundRestSeconds: 45 });
store.importProfileData(backup);
ok(store.loadSettings().roundRestSeconds === 45, "a changed setting is not overwritten by a restore");
let threw = "";
try { store.importProfileData({ app: "something-else", data: {} }); } catch (e) { threw = e.message; }
ok(/isn't a Splash backup/.test(threw), "a foreign file is rejected");
localStorage.clear();


/* ============================================================
   THE STATE MACHINE ITSELF

   Everything above tests pure helpers. None of it ever ran the
   timer, and that is precisely why the runner could count to 10
   for every prescription in the plan, never switch sides, accept
   an instant Done as a finished exercise, and pay 150% for one
   day — with 260 assertions passing the whole time.

   These drive a REAL session on a fake clock.
   ============================================================ */

/* ---- prescriptions: parsed, not guessed --------------------------------- */
const P = data.parsePrescription;
const shape = p => `${p.sets}x${p.reps}${p.repsHigh ? "-" + p.repsHigh : ""}/s${p.sides}/d${p.dirs}`;
ok(shape(P("8/side")) === "1x8/s2/d1", "8/side is eight reps on each of two sides");
ok(shape(P("2×8/side")) === "2x8/s2/d1", "2x8/side is four segments of eight");
ok(P("2×8/side").totalReps === 32, "…which is 32 reps, not the 10 the old parser counted");
ok(shape(P("8/dir/leg")) === "1x8/s2/d2", "8/dir/leg is both directions on both legs");
ok(shape(P("3/dir each")) === "1x3/s2/d2", "3/dir each is both directions, each arm");
ok(shape(P("2–3 clean reps")) === "1x2-3/s1/d1", "a range keeps both ends");
ok(P("~24").reps === 24, "an approximate count is still a count");
ok(P("8 cycles").unit === "cycles", "a cycle is not a rep");
ok(P("12 · 2-1-2 tempo").tempo.join("-") === "2-1-2" && P("12 · 2-1-2 tempo").reps === 12,
   "a tempo is read as a tempo, and 12 still means 12");
ok(P("5 · hold 3s").tempo.join("-") === "1-3-1", "a hold becomes a cadence with the hold in the middle");
ok(P("10/side · 2s hold").sides === 2 && P("10/side · 2s hold").holdSeconds === 2, "sides and holds coexist");
let presThrew = "";
try { P("as many as you like"); } catch (e) { presThrew = e.message; }
ok(/parsePrescription/.test(presThrew), "an unreadable dose throws instead of silently counting to 10");

/* Every rep exercise in the whole plan resolves — no fallbacks, anywhere. */
const allRepEx = Object.values(data.DAYS).flatMap(d =>
  [...Object.values(d.blocks || {}).flat(), ...(d.prepMenu || [])]).filter(ex => ex.byReps);
ok(allRepEx.length > 60, "the plan really does have a lot of rep work (" + allRepEx.length + " instances)");
ok(allRepEx.every(ex => ex.prescription && ex.prescription.totalReps > 0),
   "every rep exercise in every day carries a real prescription");
const tenners = allRepEx.filter(ex => ex.prescription.totalReps === 10);
ok(tenners.length === 0, "and not one of them is the old hard-coded 10");
const birdDog = allRepEx.find(ex => ex.name === "Bird Dog");
ok(birdDog.prescription.totalReps === 16 && birdDog.prescription.sides === 2,
   "Bird Dog 8/side is 16 reps across two sides — it was hard-coded to 10 total, one side");
const bandRow = allRepEx.find(ex => ex.name === "Band Row");
ok(bandRow.prescription.reps === 12, "Band Row 12 · 2-1-2 counts 12 — the tempo branch also defaulted to 10");
const deadBug = allRepEx.find(ex => ex.name === "Dead Bug");
ok(deadBug.prescription.tempo.join("-") === "2-0-2" && deadBug.tempoWords[0] === "Extend",
   "Dead Bug keeps its own cadence AND its own words — it extends, it doesn't go up");
const pullUps = allRepEx.find(ex => ex.name === "Clean Pull-Ups");
ok(pullUps.prescription.reps === 2 && pullUps.prescription.repsHigh === 3,
   "Clean Pull-Ups counts the low end of 2–3, then offers the extra");

/* Segments are walked in a real order, with a side switch between them. */
const segs = data.prescriptionSegments(P("2×8/side"));
ok(segs.length === 4, "2x8/side walks four segments");
// left, right, left, right — three switches, and each one gets its own reset.
ok(segs.filter(g => g.transition === "side").length === 3, "switching sides between every one of them");
ok(segs[0].transition === null, "the first segment has nothing to switch from");
ok(data.prescriptionSegments(P("8/dir")).some(g => g.transition === "direction"),
   "and a /dir move changes direction rather than sides");

/* The day card and the session screen must not disagree about the day. The
   card read authored timeLo/timeHi and counted five named blocks once; the
   session estimates the circuits it is about to run, prepMenu and all rounds
   included. */
const mondayCircuits = engine.assembleCircuits("monday", "green");
ok(tvm.planStats("monday").mins === Math.max(1, Math.round(engine.estimateSessionSecs(mondayCircuits) / 60)),
   "the day card's minutes are the session's own estimate, not a stale authored number");
ok(tvm.planStats("tuesday").moves === new Set(engine.assembleCircuits("tuesday", "green")
     .flatMap(c => c.exercises.map(e => e.name))).size,
   "and its move count includes the prepMenu moves the session actually inserts");

/* --- the light sets the whole session, not just the round count -----------
   A "red light" day used to run a full warm-up, full coordination, the prep
   pair, a finisher and swim-skill — 65-72% of that weekday's green session,
   which is not a light day. One policy now decides the blocks AND the rounds,
   and everything downstream is derived from the circuits it produces. */
const TRAINING_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const blocksOf = (day, light) => engine.assembleCircuits(day, light).map(c => c.block);
const mainRoundsOf = (day, light) => {
  const m = engine.assembleCircuits(day, light).find(c => c.block === "main");
  return m ? m.rounds : 0;
};
TRAINING_DAYS.forEach(d => {
  const green = blocksOf(d, "green"), yellow = blocksOf(d, "yellow"), red = blocksOf(d, "red");

  ok(mainRoundsOf(d, "green") === 3 && mainRoundsOf(d, "yellow") === 2 && mainRoundsOf(d, "red") === 1,
     d + ": the main rounds still follow the light");

  // Green is the whole authored plan.
  ok(green.includes("warmup") && green.includes("main") && green.includes("swimskill"),
     d + ": green runs the full plan");

  // Yellow drops prep and the finisher; keeps coordination.
  ok(!yellow.includes("prep") && !yellow.includes("finisher"),
     d + ": yellow drops the prep pair and the finisher");
  ok(yellow.includes("coordination") === green.includes("coordination"),
     d + ": yellow keeps coordination");

  // Red drops coordination too.
  ok(!red.includes("coordination") && !red.includes("prep") && !red.includes("finisher"),
     d + ": red drops coordination, prep and the finisher");

  // Warm-up and swim-skill survive every light — one prepares the body, the
  // other is technique at almost no load.
  ok(red.includes("warmup") && red.includes("swimskill"),
     d + ": red still warms up and still does swim-skill");

  // A lighter light is never a LONGER session.
  const g = engine.estimateSessionSecs(engine.assembleCircuits(d, "green"));
  const y = engine.estimateSessionSecs(engine.assembleCircuits(d, "yellow"));
  const r = engine.estimateSessionSecs(engine.assembleCircuits(d, "red"));
  ok(g > y && y > r, d + ": green is longer than yellow, which is longer than red");
  // Red has to be a genuinely light day, not a green day minus two rounds.
  ok(r / g < 0.62, d + ": red is well under two thirds of green (" + Math.round(r / g * 100) + "%)");
  ok(y / g <= 0.85, d + ": yellow is a real step down too (" + Math.round(y / g * 100) + "%)");

  // Expected work is counted off the same circuits the runner walks, so
  // completion is judged against the light that actually ran.
  ok(engine.countExpectedWork(engine.assembleCircuits(d, "red"))
     < engine.countExpectedWork(engine.assembleCircuits(d, "green")),
     d + ": a red plan expects less work than a green one");
});

/* Recovery is its own content, whatever weekday it lands on. */
ok(blocksOf("monday", "recovery").every(b => b === "recovery"),
   "a weekday that resolves to Recovery runs recovery content only");
ok(data.LIGHT_ROUNDS.green === 3 && data.LIGHT_ROUNDS.recovery === 0,
   "the round counts are derived from the one policy object");
ok(Object.keys(data.LIGHT_SESSION_POLICY).length === 4, "which covers all four lights");

/* ---- a real session on a fake clock -------------------------------------- */
/* The engine is timestamp-driven (setInterval + Date.now), so the harness
   moves both together and lets the microtask queue drain between ticks. */
const realNow = Date.now, realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;

function makeClock() {
  let now = 1780000000000, id = 1;
  const timers = new Map();
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => { const k = id++; timers.set(k, { fn, ms, next: now + ms, repeat: true }); return k; };
  globalThis.setTimeout  = (fn, ms) => { const k = id++; timers.set(k, { fn, ms: ms || 0, next: now + (ms || 0), repeat: false }); return k; };
  globalThis.clearInterval = k => timers.delete(k);
  globalThis.clearTimeout  = k => timers.delete(k);
  return {
    async advance(ms, step = 50) {
      for (let done = 0; done < ms; done += step) {
        now += step;
        [...timers.entries()].forEach(([k, t]) => {
          if (t.next > now) return;
          if (t.repeat) t.next = now + t.ms; else timers.delete(k);
          t.fn();
        });
        await new Promise(r => process.nextTick(r));   // let awaits resolve
      }
    },
    restore() {
      Date.now = realNow;
      globalThis.setInterval = realSetInterval; globalThis.clearInterval = realClearInterval;
      globalThis.setTimeout = realSetTimeout;   globalThis.clearTimeout = realClearTimeout;
    }
  };
}

/* Run a session to completion (or until `stop` says otherwise). Voice off, so
   the runner paces on the clock rather than on speech. */
async function runSession(opts, script = {}) {
  localStorage.clear();
  store.migrate();
  store.updateSettings({ coachVoiceOn: !!opts.voice, exerciseRestSeconds: 3, roundRestSeconds: 10, sectionRestSeconds: 5, cloudMirror: false });
  if (opts.gateUnlocked) store.saveGate({ unlocked: true, cleanWeeks: [] });
  // Runs after the wipe and before the session starts — the only place a test
  // can put state on the device that the session will then read.
  if (opts.seed) opts.seed();
  const clock = makeClock();
  engine.exitSession();
  const run = engine.startSession(opts);
  let elapsed = 0;
  const limit = opts.limitMs || 3600000;
  while (engine.sess.running && elapsed < limit) {
    await clock.advance(1000);
    elapsed += 1000;
    if (script.onTick) script.onTick(elapsed, engine.sess);
  }
  await run;
  clock.restore();
  /* A SNAPSHOT, not the live object. `engine.sess` is a module-level singleton,
     so two runs used to return the SAME reference — and the two-sitting test
     below then built its "two fragments" out of one record twice, verified:
     inst1.savedEntry === inst2.savedEntry. That test could never fail, which is
     exactly how a resume came to write ledger rows that collided with the
     sitting before it and nothing noticed. A shallow copy is enough: every run
     starts from a fresh blankSession(), so the arrays and the saved record a
     snapshot points at are that run's own. */
  return { ...engine.sess };
}

/* --- a straight, honest green session --- */
let s1 = await runSession({ dayKey: "monday", light: "green", gateUnlocked: true });
ok(s1.running === false, "a green session runs to the end on a fake clock");
ok(s1.ledger.length > 0, "and writes a completion ledger");
ok(s1.roundsCompleted === 3, "3 main rounds trained reads as 3 — it used to add every block in too");
ok(s1.blocksCompleted >= 4, "blocks are counted separately (" + s1.blocksCompleted + ")");
const mainRows = s1.ledger.filter(l => l.block === "main");
ok(new Set(mainRows.map(l => l.round)).size === 3, "and the ledger holds a row per exercise PER ROUND");
ok(s1.ledger.every(l => l.status === "done"), "everything done reads as done");
const rec1 = store.loadSessions()[0];
ok(rec1.roundsDone === 3 && rec1.roundsPlanned === 3, "the record stores rounds done AND rounds planned");
ok(store.sessionXp(rec1) === 360, "a full green day pays 360");
/* A session that is not a resume must be untouched by any of the day-banking
   machinery: nothing was banked before it, and the day's ask IS its ask. */
ok(s1.bankedCredit === 0, "a first sitting carries no banked credit");
ok(s1.expectedWork === s1.dayExpectedWork && s1.expectedWork === engine.countExpectedWork(s1.circuits),
   "and is priced against exactly the plan it ran — the day's plan and its own are the same thing");
ok(rec1.bankedCredit === 0 && outcome.outcomeOf(rec1).state === "complete",
   "so a straight-through green day still reads complete, scored exactly as before");

/* --- side switching actually happens --- */
const sided = s1.ledger.filter(l => l.segmentsPlanned > 1 && l.driver === "reps");
ok(sided.length > 0, "the day contains multi-segment rep work");
ok(sided.every(l => l.segmentsDone === l.segmentsPlanned),
   "and every segment of it was walked — rep moves never switched sides at all before");
const dbRow = s1.ledger.find(l => l.name === "Dead Bug");
ok(dbRow.repsPlanned === 16 && dbRow.repsCounted === 16, "Dead Bug counted all 16 reps, 8 to a side");

/* Running the real app caught this one: with the voice ON but no installed
   voices, speakAndWait resolves instantly, a whole rep set flew past in
   milliseconds, and the ledger recorded a fully counted set as SKIPPED.
   Reps are paced on the clock now, and judged on reps rather than wall time. */
let sVoice = await runSession({ dayKey: "tuesday", light: "red", gateUnlocked: true, voice: true });
const voiceRows = sVoice.ledger.filter(l => l.driver === "reps");
ok(voiceRows.length > 0, "the day has rep work");
ok(voiceRows.every(l => !(l.repsCounted >= l.repsPlanned && l.status === "skipped")),
   "a fully counted rep set is never recorded as skipped, however fast the voice is");
ok(voiceRows.filter(l => l.status === "done").length === voiceRows.length,
   "every completed rep set reads as done");

/* --- Done is no longer a free pass --- */
let s2 = await runSession({ dayKey: "monday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => { if (["work", "reps"].includes(sess.phase)) engine.advance(); }
});
ok(s2.ledger.length > 0, "tapping Done on everything still reaches the end of the session");
ok(s2.ledger.every(l => l.status !== "done"), "but nothing instantly tapped counts as done");
ok(s2.roundsCompleted === 0, "so no round was completed");
const rec2 = store.loadSessions()[0];
ok(rec2.roundsDone === 0, "the record says zero rounds, not the light's three");
ok(store.sessionXp(rec2) === 0, "and an untouched session pays nothing");

/* --- timed work has to actually be there ---------------------------------
   The bar used to be half the dose, so a thirty-second hold abandoned at
   fifteen seconds was recorded DONE and paid for a full round. Rep work has
   always demanded the whole rep count. */
const st = engine.timedExerciseStatus;
ok(engine.DONE_WORK_FRACTION === 0.8, "timed work needs four fifths of its dose");
ok(st(0, 30) === "skipped", "an instant tap is not an exercise");
ok(st(2, 30) === "skipped", "and neither is two seconds");
ok(st(3, 30) === "partial", "three seconds is real work, saved as partial");
ok(st(15, 30) === "partial", "half a thirty-second hold is partial now, not done");
ok(st(23, 30) === "partial", "and so is 76% of it");
ok(st(24, 30) === "done", "exactly 80% is done");
ok(st(30, 30) === "done", "and the full dose certainly is");
ok(st(15, 20) === "partial" && st(16, 20) === "done", "a 20-second dose turns over at 16");
ok(st(35, 45) === "partial" && st(36, 45) === "done", "a 45-second dose turns over at 36");
ok(st(40, 0) === "done", "an exercise with no planned time is judged only on showing up");

/* --- one training day pays for one training day --------------------------
   The reproduction from the report: stop partway (half XP on the planned
   three rounds = 180), come back, finish the resumed green session (360).
   That paid 540 for a 360-day plan. */
localStorage.clear();
store.migrate();
/* The ledger has to SHOW the rounds the row claims: XP is priced off the rows
   now, not off `roundsDone`, precisely so a counter written at the wrong moment
   cannot pay a full session the show-up credit alone. */
const mainRound = (r, n = 2) => Array.from({ length: n }, (_, i) => ({
  name: "m" + r + "-" + i, block: "main", round: r, status: "done" }));
const partial = { app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, roundsDone: 1, roundsPlanned: 3, sessionType: "main",
  outcomeVersion: store.OUTCOME_VERSION,
  completedFully: false, endedEarly: true, ledger: mainRound(1) };
const firstPay = store.claimSessionXp(partial);
const resumed = { ...partial, roundsDone: 2, completedFully: true, endedEarly: false,
  ledger: [...mainRound(1), ...mainRound(2)] };
const secondPay = store.claimSessionXp(resumed);
ok(firstPay === 180, "the partial pays for the one round it finished");
ok(firstPay + secondPay === 360, "and the resume tops it up to exactly one full day, never 540");
ok(store.claimSessionXp(resumed) === 0, "a third attempt on the same day pays nothing at all");

/* --- one REAL date pays for one real date --------------------------------
   The budget used to be keyed by the weekday card as well as the date, so two
   cards run on one date drew two full budgets. Both routes into a second card
   are one tap: "Catch Up Now" on a missed day and "Start Early" on an upcoming
   one. */
localStorage.clear();
store.migrate();
const oneDate = new Date().toISOString();
const mondayCard = { app: "swimming", dayKey: "monday", isoDate: oneDate,
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION, sessionType: "main",
  roundsDone: 3, roundsPlanned: 3, completedFully: true,
  // Three rounds' worth of rows, because three rounds is what this card claims
  // and the rows are what it is now priced on.
  ledger: [...mainRound(1), ...mainRound(2), ...mainRound(3)] };
const tuesdayCard = { ...mondayCard, dayKey: "tuesday" };
const mondayPay = store.claimSessionXp(mondayCard);
const tuesdayPay = store.claimSessionXp(tuesdayCard);
ok(mondayPay === 360, "the first card run on a date pays a full day");
ok(tuesdayPay === 0, "a second weekday card on the SAME real date pays nothing more");
ok(mondayPay + tuesdayPay === 360, "so one real date is still worth exactly one day, never 720");

/* Crossing Edmonton midnight is a new date, and a new budget. */
const tomorrowIso = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
ok(store.claimSessionXp({ ...mondayCard, isoDate: tomorrowIso }) === 360,
   "the next real date opens a fresh budget");

/* The ceiling is the LARGEST session the date warrants, not the first claimed:
   a Recovery morning must not hold down training done that afternoon. */
localStorage.clear();
store.migrate();
const recoveryFirst = { ...mondayCard, sessionType: "recovery", roundsDone: 0, roundsPlanned: 0 };
const recPay = store.claimSessionXp(recoveryFirst);
const trainedAfter = store.claimSessionXp(mondayCard);
ok(recPay === store.XP_SHOWED_UP, "a recovery session pays its show-up credit");
ok(recPay + trainedAfter === 360,
   "and training later the same date still reaches one full day, no more");

/* ...and the reverse order does not let the day exceed one full day either. */
localStorage.clear();
store.migrate();
const bigFirst = store.claimSessionXp(mondayCard);
const smallAfter = store.claimSessionXp({ ...mondayCard, dayKey: "wednesday",
  roundsDone: 1, ledger: mainRound(1) });
ok(bigFirst + smallAfter === 360, "a lighter card after a full one adds nothing");

/* The cap has to survive a REBUILD. XP is derived from the log on every boot
   (rebuildJourneyXp), and sessionXp() re-prices any row that does not carry
   what it was actually paid — so a record the cap granted nothing to must
   still say so, out loud, as xpEarned: 0. Otherwise the second card comes
   back at full price the next time the app is opened. */
localStorage.clear();
store.migrate();
const spentDay = await runSession({ dayKey: "monday", light: "red", gateUnlocked: true,
  // The day's budget is already gone when this session finishes, so the cap
  // grants it nothing — exactly the second-card-on-one-date case.
  seed: () => store.claimSessionXp({ app: "swimming", dayKey: "tuesday",
    isoDate: new Date().toISOString(), xpVersion: store.XP_VERSION,
    outcomeVersion: outcome.OUTCOME_VERSION, sessionType: "main",
    roundsDone: 3, roundsPlanned: 3, completedFully: true,
    ledger: [...mainRound(1), ...mainRound(2), ...mainRound(3)] })
});
ok(spentDay.xpEarned === 0, "a session run after the day's budget is spent is granted nothing");
const spentRow = store.loadSessions().find(x => x.dayKey === "monday");
ok(spentRow && spentRow.xpEarned === 0,
   "and the record SAYS it was paid nothing, instead of leaving the field off");
ok(store.sessionXp(spentRow) === 0,
   "so a rebuild reads zero from it rather than re-pricing it at full value");

/* --- and the day holds across her two devices -----------------------------
   The banked budget row is deliberately not published, so it is a fact about
   ONE device: train on the tablet in the morning and the phone in the
   afternoon and each used to grant a full day, neither having seen the other's
   row. Every session record does sync though, and each one carries what it was
   paid — so the log is read as a floor under the banked value. */
localStorage.clear();
store.migrate();
const fromOtherDevice = { ...mondayCard, xpEarned: 360, isoDate: new Date().toISOString() };
store.mergeSessions([fromOtherDevice]);       // arrives from the cloud mirror
ok(store.loadJourney() === null || !(store.loadJourney() || {}).dayXpPaid,
   "this device has banked nothing for the date");
ok(store.claimSessionXp(tuesdayCard) === 0,
   "a session finished on the other device still spends this device's budget");

/* A lighter session synced in does not cap a bigger one trained here. */
localStorage.clear();
store.migrate();
store.mergeSessions([{ ...mondayCard, sessionType: "recovery", roundsDone: 0,
  roundsPlanned: 0, xpEarned: store.XP_SHOWED_UP }]);
ok(store.claimSessionXp(tuesdayCard) === 360 - store.XP_SHOWED_UP,
   "a recovery session synced from the other device leaves the rest of the day available");

/* Budgets are per athlete: the journey doc is namespaced, so switching athletes
   must not hand the second one a spent budget. */
localStorage.clear();
store.migrate();
ok(store.claimSessionXp(mondayCard) === 360, "athlete one draws her day's budget");
const firstAthlete = store.activeProfileId();
store.switchProfile(store.addProfile("Second"));
store.migrate();
ok(store.claimSessionXp(mondayCard) === 360, "a different athlete has her own budget for the same date");
// Put the first athlete back: everything after this reads her namespace.
store.switchProfile(firstAthlete);
localStorage.clear();
store.migrate();

/* --- the streak asks for a session, not a piece of one --------------------
   It used to be filtered on countsAsTrained, which ONE recorded move satisfies:
   warm up, do a single thing, walk away, keep the flame. Training, adherence
   and XP still count any real work — only the streak got stricter. */
const streakRow = (doneCount, expected, extra = {}) => ({
  app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
  sessionType: "main", roundsDone: 1, roundsPlanned: 3, expectedWork: expected,
  ledger: Array.from({ length: doneCount }, (_, i) => ({
    name: "m" + i, block: "main", round: 1, status: "done" })),
  ...extra
});
/* `roundsDone` is overridable because the bar must NOT be a hidden round count —
   see the zero-round assertions below. */
ok(outcome.STREAK_WORK_FRACTION === 0.75, "a training day needs three quarters of its plan");
ok(store.countsForStreak(streakRow(1, 20)) === false, "one move out of twenty is not a training day");
ok(store.countsForStreak(streakRow(14, 20)) === false, "nor is 70% of it");
ok(store.countsForStreak(streakRow(15, 20)) === true, "exactly 75% earns the day");
ok(store.countsForStreak(streakRow(20, 20)) === true, "and a full session certainly does");
ok(store.countsAsTrained(streakRow(1, 20)) === true,
   "while a single move is still real training that saves and pays");
ok(store.xpForSession(streakRow(1, 20)) > 0, "and is still worth XP — only the streak got stricter");

/* The bar is a fraction of the LIGHT'S OWN plan, so a light day is a smaller
   ask and never a harder one. */
const redPlan = engine.countExpectedWork(engine.assembleCircuits("monday", "red"));
const greenPlan = engine.countExpectedWork(engine.assembleCircuits("monday", "green"));
ok(redPlan < greenPlan, "a red plan is smaller than a green one");
ok(store.countsForStreak(streakRow(Math.ceil(redPlan * 0.75), redPlan)) === true,
   "three quarters of a red day earns the streak");
ok(store.countsForStreak(streakRow(Math.ceil(redPlan * 0.75), greenPlan)) === false,
   "the same amount of work against a green plan does not — the ask scales with the light");

/* THE BAR IS THE DOSE, AND ONLY THE DOSE.
   Every assertion above happens to carry `roundsDone: 1`, so none of them could
   tell a dose rule from a dose rule with a quiet "and finish one main round"
   stapled to it. A short Red day may not even reach the end of its single round,
   and it still trained. State it outright, in both directions. */
ok(store.countsForStreak(streakRow(Math.ceil(redPlan * 0.75), redPlan, { roundsDone: 0 })) === true,
   "three quarters of a Red day earns the streak with ZERO completed main rounds");
ok(store.countsForStreak(streakRow(Math.floor(redPlan * 0.75) - 1, redPlan, { roundsDone: 0 })) === false,
   "and below three quarters earns nothing, rounds or no rounds");
/* The round count and the streak are independent readings of the same rows, and
   this says so from the other side: a short day that never finished a round
   still earns the streak on dose alone.

   It used to be asserted with a ledger whose rows DID prove a round, and a
   `roundsDone: 0` that min() let override them — so it passed by way of the very
   bug that reported "0 of 3 main rounds" after three rounds of work. The rows
   are what is short now, which is what the case was always about. */
const shortOfARound = streakRow(Math.ceil(redPlan * 0.75), redPlan).ledger;
const shortRoundOutcome = outcome.deriveSessionOutcome({
  ledger: shortOfARound, expectedWork: redPlan,
  // The round asked for the whole plan and got three quarters of it: rows are
  // MISSING, which is what "she did not finish the round" actually looks like.
  expectedByRound: { 1: redPlan },
  outcomeVersion: outcome.OUTCOME_VERSION, sessionType: "main", roundsDone: 0
});
ok(shortRoundOutcome.mainRoundsDone === 0,
   "the outcome says plainly that no round was completed, and pays the day anyway");
ok(store.countsForStreak(streakRow(Math.ceil(redPlan * 0.75), redPlan,
     { ledger: shortOfARound, roundsDone: 0 })) === true,
   "the dose earns the streak with no completed round behind it");

/* --- THE BAR IS THE DAY'S, NOT THE SITTING'S ------------------------------
   A day can be trained in two goes, and the second used to be judged against
   its own leftovers alone. That cut both ways: a sitting that finished
   everything still owed could not read as completing the DAY, and a two-move
   sitting on a barely-started day cleared 75% of two moves and bought the
   streak outright. The plan stays the whole day's now, and the credit already
   banked today is carried in beside it. */
const dayPlan = 20;
const sitting = (rows, banked) => ({
  app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
  sessionType: "main", roundsDone: 1, roundsPlanned: 3, expectedWork: dayPlan,
  bankedCredit: banked,
  ledger: Array.from({ length: rows }, (_, i) => ({
    name: "m" + i, block: "main", round: 1, status: "done" }))
});
ok(store.countsForStreak(sitting(2, 4)) === false,
   "two moves in the evening on a barely-started day is 6 of 20 — it buys nothing");
ok(store.countsForStreak(sitting(11, 4)) === true,
   "but the sitting that carries the day past three quarters earns it");
const finished = outcome.outcomeOf(sitting(16, 4));
ok(finished.state === "complete" && finished.workRatio === 1,
   "and a day finished across two sittings reads COMPLETE — it used to read partial forever");
ok(outcome.outcomeOf(sitting(15, 4)).state === "partial",
   "one move short of the day is still short, however it was split up");

/* A sitting with a skipped move in it is not a finished sitting, whatever the
   day already banked — the day-wide credit must not paper over this run. */
const skippedInSitting = sitting(16, 4);
skippedInSitting.ledger[0] = { name: "m0", block: "main", round: 1, status: "skipped" };
ok(outcome.outcomeOf(skippedInSitting).state === "partial",
   "banked credit never turns a sitting with a skipped move into a complete one");

/* Going forward only, again: nothing written before this carries the field, and
   its expectedWork was its own size, so every existing row scores as it did. */
const noBanked = { ...sitting(15, 0) };
delete noBanked.bankedCredit;
ok(store.countsForStreak(noBanked) === true && store.countsForStreak(sitting(15, 0)) === true,
   "a record with no banked credit reads exactly as one with zero — no migration, no re-scoring");

/* A safety stop still buys nothing, however much came before it. */
ok(store.countsForStreak(streakRow(20, 20, { safetyStop: true, pain: true })) === false,
   "a pain stop earns no streak day, whatever was done first");

/* Going forward only: records written before the bar keep their old reading, so
   the number she is standing on tonight cannot fall because a rule changed. */
const legacy = { ...streakRow(1, 20), outcomeVersion: 1 };
ok(store.countsForStreak(legacy) === true,
   "a session recorded before the bar existed still counts, exactly as it did");
ok(outcome.deriveSessionOutcome({ ledger: legacy.ledger, expectedWork: 20, outcomeVersion: 1 }).streakJudged === false,
   "and says plainly that it was never judged against the bar");

/* --- THE STREAK IS PAID BY THE DOSE, NOT BY THE ROW ------------------------
   The bar above was counting ROWS: a `partial` row scored one whole work unit,
   exactly like a finished one. So three seconds of a thirty-second hold, done
   fifteen times, cleared 75% of a twenty-move session and kept the flame. The
   engine had already raised the bar for calling a timed dose done
   (DONE_WORK_FRACTION); this applies the same honesty to the streak. */
const doseRow = (rows, expected, extra = {}) => ({
  app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
  sessionType: "main", roundsDone: 1, roundsPlanned: 3, expectedWork: expected,
  ledger: rows, ...extra
});
const timedPartial = (n, actual, planned) => Array.from({ length: n }, (_, i) => ({
  name: "t" + i, block: "main", round: 1, driver: "time",
  status: "partial", actualSecs: actual, plannedSecs: planned
}));
const repPartial = (n, got, target) => Array.from({ length: n }, (_, i) => ({
  name: "r" + i, block: "main", round: 1, driver: "reps",
  status: "partial", repsCounted: got, repsPlanned: target, actualSecs: 20, plannedSecs: 0
}));

ok(outcome.streakCredit({ status: "done" }) === 1, "a finished move is worth a whole unit");
ok(outcome.streakCredit({ status: "skipped" }) === 0, "a skipped one is worth nothing");
ok(Math.abs(outcome.streakCredit(timedPartial(1, 15, 30)[0]) - 0.5) < 1e-9,
   "half a timed dose is worth half a unit");
ok(Math.abs(outcome.streakCredit(repPartial(1, 6, 8)[0]) - 0.75) < 1e-9,
   "six of eight reps is worth three quarters");
ok(outcome.streakCredit({ status: "partial", driver: "time", actualSecs: 40, plannedSecs: 30 }) === 1,
   "and overrunning the dose is capped at one, never a bonus");

/* The audit's own reproduction, which used to earn the streak. */
ok(store.countsForStreak(doseRow(timedPartial(15, 3, 30), 20)) === false,
   "three seconds of fifteen thirty-second holds is NOT a training day");
ok(store.countsForStreak(doseRow(repPartial(15, 1, 10), 20)) === false,
   "nor is one rep of fifteen ten-rep sets");
ok(store.countsAsTrained(doseRow(timedPartial(15, 3, 30), 20)) === true,
   "both are still real training that saves and pays — only the streak got honest");
ok(store.xpForSession(doseRow(timedPartial(15, 3, 30), 20)) > 0,
   "and both are still worth XP");

/* Enough dose still earns it, whether it arrives whole or in parts. */
ok(store.countsForStreak(doseRow(timedPartial(20, 24, 30), 20)) === true,
   "twenty moves at four fifths of the dose clears the bar on dose alone");
ok(store.countsForStreak(doseRow(timedPartial(20, 21, 30), 20)) === false,
   "and seventy percent of every dose does not");

/* A dose we cannot prove is not a dose we pay for. */
ok(outcome.streakCredit({ status: "partial", driver: "time", actualSecs: 10, plannedSecs: 0 }) === 0,
   "a partial row with no denominator scores zero rather than a whole unit");
ok(store.countsForStreak(doseRow(
     Array.from({ length: 20 }, (_, i) => ({ name: "x" + i, block: "main", round: 1, status: "partial" })), 20)) === false,
   "so a ledger of shapeless partials cannot buy a streak day");

/* --- RECOVERY FREEZES THE STREAK, IT DOES NOT PAY INTO IT ------------------
   Care is not training, so it must not add a day. But the morning she reports
   soreness honestly must not be the morning the flame goes out. */
const recRows = (n, status) => Array.from({ length: n }, (_, i) => ({
  name: "rec" + i, block: "recovery", round: 1, driver: "time",
  status, actualSecs: status === "done" ? 30 : 4, plannedSecs: 30
}));
const recDone = doseRow(recRows(8, "done"), 8, { sessionType: "recovery", roundsDone: 0, roundsPlanned: 0 });
const recBrushed = doseRow(recRows(8, "partial"), 8, { sessionType: "recovery", roundsDone: 0, roundsPlanned: 0 });
ok(store.countsForStreak(recDone) === false, "a finished recovery day adds no training streak day");
ok(store.freezesStreak(recDone) === true, "it freezes the streak instead");
ok(store.freezesStreak(recBrushed) === false,
   "and brushing at every move on the menu freezes nothing — that was a row count too");
ok(store.countsForStreak(recBrushed) === false, "nor does it earn one");

/* The freeze bridges the gap rather than spending it. */
const agoIso = (d) => new Date(Date.now() - d * 86400000).toISOString();
const train = (d) => ({ ...streakRow(20, 20), isoDate: agoIso(d) });
const rest  = (d) => ({ ...recDone, isoDate: agoIso(d) });
const runOf = [train(6), rest(5), rest(4), rest(3), train(2), train(1), train(0)];
ok(store.currentStreak(runOf.filter(store.countsForStreak)) === 3,
   "without the freeze, three recovery days read as a break and the run is just the last three");
ok(store.currentStreak(runOf.filter(store.countsForStreak), store.streakFreezeDates(runOf)) === 4,
   "with it the earlier training day is bridged in — the care days hold, without counting");
ok(store.streakFreezeDates(runOf).size === 3, "and only the finished recovery days are freeze days");

/* --- a pain stop is a safety event, not a short workout --- */
const painStop = { ...partial, safetyStop: true, pain: true, roundsDone: 1 };
ok(store.xpForSession(painStop) === 0, "a pain stop pays no XP");
ok(store.countsAsTrained({ ...painStop, perExercise: [{ name: "x" }] }) === true ||
   store.countsAsTrained({ ...painStop, perExercise: [{ name: "x" }] }) === false,
   "and countsAsTrained has an explicit answer for it");

/* --- Mini cannot be started any more, and its history still reads -----------
   The button promised "10 minutes" and nothing measured it; the traffic light
   is the one dial that shortens a session now. A stale caller still asking for
   one must not get a quietly shortened workout back. */
localStorage.clear();
let s3 = await runSession({ dayKey: "monday", light: "green", mini: true, gateUnlocked: true });
ok(s3.mode === "normal", "asking for a mini gets an ordinary session, not a mini");
ok(s3.roundsPlanned === 3, "planned against the light's own rounds");
const rec3 = store.loadSessions()[0];
ok(rec3.sessionType === "main", "and the record says main");
ok(rec3.mini === undefined, "with no mini flag written on it");

/* A record written when Mini existed is still priced, labelled and counted as
   the subset it was — history is not re-scored underneath her. */
const oldMini = { app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
  sessionType: "mini", mini: true, roundsDone: 1, roundsPlanned: 3,
  completedFully: true, ledger: [{ name: "x", block: "main", round: 1, status: "done" }] };
ok(store.sessionRoundsPlanned(oldMini) === 1, "a historical mini still asks for one round");
ok(store.xpForSession(oldMini) === 180, "and is still priced as a one-round day");
ok(pvm.logEntryView(oldMini).lightLabel === "MINI", "the log still labels it MINI");

/* --- the Coach's Quiz pays once, not twice --------------------------------
   Reproduces the report exactly: 360 session + 30 quiz should read 390 after
   a rebuild, and used to read 420. */
localStorage.clear();
store.migrate();
store.saveSession({ app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, roundsDone: 3, roundsPlanned: 3, completedFully: true,
  ledger: [{ name: "x", status: "done" }], xpEarned: 360 });
store.addXp(360);
const qres = store.payQuizQuestion(store.quizQuestionKey("coach", "hips"), true);
store.addXp(qres.xp);
store.patchSession(store.sessionKey(store.loadSessions()[0]), { quizXp: qres.xp });
const beforeRebuild = store.loadJourney().xp;
const afterRebuild = store.rebuildJourneyXp();
ok(qres.xp === 30, "the quiz question pays 30");
ok(beforeRebuild === 390, "360 session + 30 quiz reads 390");
ok(afterRebuild === 390, "and still reads 390 after a rebuild — it used to inflate to 420");
ok(store.rebuildJourneyXp() === 390, "rebuilding again is a no-op");

/* --- prizes: redeemed on either device is redeemed everywhere ------------- */
const pzAvail = { id: "p1", label: "Movie night", date: "2026-04-01", redeemed: false };
const pzSpent = { id: "p1", label: "Movie night", date: "2026-04-01", redeemed: true, redeemedAt: 1780000000000 };
ok(store.mergePrize(pzAvail, pzSpent).redeemed === true, "a prize spent on the other device is spent here");
ok(store.mergePrize(pzSpent, pzAvail).redeemed === true, "…whichever side the merge sees first");
const pzEarly = { ...pzSpent, redeemedAt: 1770000000000 };
ok(store.mergePrize(pzSpent, pzEarly).redeemedAt === 1770000000000, "the earliest real redemption wins");
const pzLegacy = { id: "p2", label: "Ice cream", date: "2026-04-02", redeemed: true };   // no redeemedAt
ok(Number.isFinite(store.mergePrize(pzLegacy, pzLegacy).redeemedAt),
   "a legacy redeemed prize gets a usable date instead of being locked forever");

/* the parent repair, rather than an automatic reset */
localStorage.clear();
store.migrate();
store.saveJourney({ xp: 5000, prizesWon: [
  { id: "dup", label: "A", date: "2026-04-01", redeemed: false },
  { id: "dup", label: "B", date: "2026-04-02", redeemed: true },
  { id: "ok",  label: "C", date: "2026-04-03", redeemed: false }
] });
const repair = store.repairPrizeWallet();
ok(repair.reissued === 1, "the repair gives a duplicate-ID prize its own identity back");
ok(new Set(store.loadJourney().prizesWon.map(p => String(p.id))).size === 3,
   "so three prizes stay three prizes instead of collapsing into two");
ok(store.loadJourney().prizesWon.length === 3, "and none of them is thrown away");

/* --- the valgus gate governs the workout --------------------------------- */
localStorage.clear();
store.migrate();
ok(store.gateLocked() === true, "the gate starts locked");
ok(store.creditValgusWeek({ isoDate: new Date().toISOString(),
      ledger: [{ name: "Drop-and-Stick", status: "done" }], formChecks: [] }).cleanWeeks.length === 0,
   "doing the move without a clean self-check earns nothing — that alone used to count");
const g1 = store.creditValgusWeek({ isoDate: "2026-04-01T10:00:00.000Z",
  ledger: [{ name: "Drop-and-Stick", status: "done" }], formChecks: [{ name: "Drop-and-Stick", clean: true }] });
ok(g1.cleanWeeks.length === 1 && g1.unlocked === false, "one clean week is one week, not an unlock");
const sameWeek = store.creditValgusWeek({ isoDate: "2026-04-02T10:00:00.000Z",
  ledger: [{ name: "Drop-and-Stick", status: "done" }], formChecks: [{ name: "Drop-and-Stick", clean: true }] });
ok(sameWeek.cleanWeeks.length === 1 && sameWeek.unlocked === false,
   "a second session the same week doesn't buy a second week");
const g2 = store.creditValgusWeek({ isoDate: "2026-04-09T10:00:00.000Z",
  ledger: [{ name: "Drop-and-Stick", status: "done" }], formChecks: [{ name: "Drop-and-Stick", clean: true }] });
ok(g2.unlocked === true, "two separate clean weeks unlock it, exactly as the screen promises");

/* --- yesterday is SHOWN, never reused --------------------------------------
   The one-tap "same as yesterday" copied sleep, muscle freshness and energy
   wholesale, so on a clean yesterday today's light could be produced without
   her answering anything. It is a read-only column now: visible, never
   fillable, and still bounded by the freshness window. */
localStorage.clear();
store.migrate();
store.saveReadiness({ answers: { q_pain: "yes", q_sleep: "yes", q_light: "no", q_ready: "yes" }, light: "yellow" });
ok(typeof rvm.sameAsYesterday === "undefined", "the one-tap reuse is gone entirely");
ok(rvm.yesterdayCheck() !== null, "a check from today is close enough to show");

const todayFlow = rvm.newReadinessFlow("monday");
const shownVm = rvm.buildReadinessVM(todayFlow, true);
ok(shownVm.hasYesterday === true, "so the yesterday column is offered");
ok(shownVm.questions.find(q => q.id === "q_light").yesterday === "😮‍💨 Tired",
   "and renders yesterday's answer in that question's own words");
ok(shownVm.questions.find(q => q.id === "q_sleep").yesterday === "😴 Good",
   "each question using its own labels, not a bare yes/no");
ok(todayFlow.readinessDone === false && Object.keys(todayFlow.answers).length === 0,
   "showing it fills in nothing — today still has to be answered");

const stale = JSON.parse(localStorage.getItem("swim_readiness"));
stale.when = Date.now() - 60 * 86400000;
localStorage.setItem("swim_readiness", JSON.stringify(stale));
ok(rvm.yesterdayCheck() === null, "a check from two months ago is not 'yesterday'");
ok(rvm.buildReadinessVM(rvm.newReadinessFlow("monday"), true).hasYesterday === false,
   "so no column is shown at all");

/* An empty column reads as an em dash rather than a missing row. */
localStorage.clear();
store.migrate();
store.saveReadiness({ answers: { q_pain: "yes", q_sleep: "yes" }, light: "green" });
ok(rvm.buildReadinessVM(rvm.newReadinessFlow("monday"), true)
     .questions.find(q => q.id === "q_ready").yesterday === "—",
   "a question yesterday never answered shows an em dash");

/* The body map gets one line, not a second diagram. */
localStorage.clear();
store.migrate();
store.saveReadiness({ answers: { q_pain: "no" }, zoneSev: { 2: 3 }, light: "red", severity: 3 });
const zoneLine = rvm.yesterdayZoneLine();
ok(zoneLine.includes("Shoulders") && zoneLine.includes("not right"),
   "yesterday's marked zones read back in her own words");
localStorage.clear();
store.migrate();
store.saveReadiness({ answers: { q_pain: "yes" }, zoneSev: {}, light: "green" });
ok(rvm.yesterdayZoneLine() === "Yesterday: no sore spots.",
   "and a clean yesterday says so plainly");

/* --- THE BODY'S ANSWER AND THE GROWN-UP'S ARE DIFFERENT QUESTIONS ----------
   The analytics grouped every session by the light that RAN, under a heading
   that promised readiness. So a body check that said Red, overridden to Green,
   was filed as a Green readiness day: the check could never be scored against
   what followed it, and the yellow/red safety flag — the one a parent reads —
   went silent on exactly the day it most needed to speak. */
localStorage.clear();
store.migrate();
const overridden = {
  app: "swimming", dayKey: "monday", dayTitle: "Monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION, sessionType: "main",
  suggestedLight: "red", lightResult: "green", light: "green", wasOverridden: true,
  roundsDone: 3, roundsPlanned: 3, expectedWork: 4, durationSecs: 1800,
  ledger: Array.from({ length: 4 }, (_, i) => ({ name: "m" + i, block: "main", round: 1, status: "done" }))
};
store.saveSession(overridden);
const gFull = gvm.buildGrownupVM({ grownupTab: "analytics", gsScope: "month", isWide: true });
const ga = gFull.analytics;
ok(ga.readinessOutcome.some(r => r.light === "Red"),
   "the Body Check report files the day under the light her BODY asked for");
ok(!ga.readinessOutcome.some(r => r.light === "Green"),
   "and never under the one a grown-up chose");
ok(ga.loadOutcome.some(r => r.light === "Green"),
   "while the load report files it under the light actually trained");
ok(!ga.loadOutcome.some(r => r.light === "Red"), "and only there");
ok(ga.hasOverrides && ga.overrideRows.length === 1, "the override itself is listed");
ok(ga.overrideRows[0].from === "red" && ga.overrideRows[0].to === "green" && ga.overrideRows[0].raised === true,
   "named in both directions, and marked as RAISED above the body check");
ok(gFull.guAlerts.some(a => /raised the light/.test(a.text)),
   "and it raises a flag — an overridden Red used to raise none at all");
ok(gFull.guAlerts.some(a => /yellow\/red-light day/.test(a.text)),
   "the tired-or-sore flag counts it too, because her body did say Red");
ok(/Body Check → completion/.test(gscreen.grownupScreen(
     gvm.buildGrownupVM({ grownupTab: "analytics", gsScope: "month", isWide: true }))),
   "and the heading no longer promises readiness while showing something else");

/* --- the body map is a RECORD now, not just a control ----------------------
   One saved check, overwritten every morning, could set today's rounds and
   nothing else: "left shoulder, three days running" was not a thing the app
   could notice. The log keeps every check; the mirror carries only the ones
   worth a grown-up's attention. */
localStorage.clear();
store.migrate();
store.saveReadiness({ answers: { q_pain: "no" }, zoneSev: { 2: 3 }, severity: 3,
                      light: "red", suggestedLight: "red", resultSource: "bodycheck" });
store.saveReadiness({ answers: { q_pain: "yes", q_sleep: "yes", q_light: "yes", q_ready: "yes" },
                      zoneSev: {}, light: "green", suggestedLight: "green", resultSource: "readiness" });
const log = store.loadReadinessLog();
ok(log.length === 2, "a later check no longer overwrites the earlier one");
ok(JSON.stringify(log[0].zoneSev) === JSON.stringify({ "2": 3 }),
   "yesterday's marked zones are still readable after today's check");
ok(store.loadReadiness().zoneSev && Object.keys(store.loadReadiness().zoneSev).length === 0,
   "while the single 'latest check' the session reads is still just the latest");

ok(log[0].abnormal === true, "a marked zone makes a check abnormal");
ok(log[1].abnormal === false, "an all-green check is not");
ok(store.isAbnormalCheck({ zoneSev: { 4: 2 }, suggestedLight: "green" }) === true,
   "severity 2 on any zone is enough on its own");
ok(store.isAbnormalCheck({ zoneSev: {}, suggestedLight: "yellow" }) === true,
   "and so is a non-green light with no zone marked — a tired day still counts");
ok(store.isAbnormalCheck({ zoneSev: {}, suggestedLight: "green" }) === false,
   "only a clean, green check stays on the device");

const trend = gvm.buildGrownupVM({ grownupTab: "analytics", gsScope: "month", isWide: true })
  .analytics.bodyMapTrend;
ok(trend.length === 1 && /Shoulder/i.test(trend[0].label),
   "and the Grown-up Zone can finally show where it keeps hurting");

/* Rows from the other device merge in without duplicating. */
const remote = [{ ...log[0], at: log[0].at + 5000 }];
ok(store.mergeReadinessLog(remote) === 1, "a check from the other device merges in");
ok(store.mergeReadinessLog(remote) === 0, "and merging it again adds nothing");
ok(store.loadReadinessLog().length === 3, "so the log holds each check exactly once");

/* --- ONLY A SESSION IS A SESSION -------------------------------------------
   The shared cloud collection holds more than sessions: the journey mirror
   lives there, and now the readiness mirror does too. The restore filtered them
   with `kind !== "journey"` — an exclude-BY-NAME list, which admits every kind
   nobody thought to name. The next document type added would have been merged
   as a training record and had her XP rebuilt from it. */
ok(sync.isSessionDoc({ isoDate: "2026-04-01T10:00:00.000Z" }) === true,
   "an untagged document is a session, as every existing record is");
ok(sync.isSessionDoc({ kind: "session" }) === true, "and so is one that says so");
ok(sync.isSessionDoc({ kind: "journey" }) === false, "the journey mirror is not a session");
ok(sync.isSessionDoc({ kind: "readiness", checks: [] }) === false,
   "and neither is the readiness mirror — under the old rule this WOULD have merged");
ok(sync.isSessionDoc(null) === false, "nothing is not a session either");

/* --- the finish screen says whether the streak was earned ------------------
   Every partial got the same words — "Part of the way, and it counts" — which
   is true of the work and silent about the one number she is standing on. The
   values to tell the two apart were computed all along and read by nobody. */
const partialVm = (ledger, expectedWork) => {
  engine.exitSession();
  Object.assign(engine.sess, {
    running: false, phase: "done", dayKey: "monday", light: "green", mode: "normal",
    ledger, expectedWork, roundsCompleted: 2, roundsPlanned: 3, endedEarly: true,
    elapsed: 900, savedEntry: null, spa: false, recovery: false
  });
  return svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null });
};
const doneRows = (n) => Array.from({ length: n }, (_, i) => ({
  name: "m" + i, block: "main", round: 1, driver: "time", status: "done",
  actualSecs: 30, plannedSecs: 30 }));
const earned = partialVm(doneRows(16), 20);
const missed = partialVm(doneRows(4), 20);
ok(earned.completionState === "partial" && missed.completionState === "partial",
   "both are partial sessions, and used to be shown identical words");
ok(earned.completionKey === "partial-streak", "the one that cleared the bar is its own outcome");
ok(missed.completionKey === "partial-short", "and the one that fell short is another");
ok(earned.streakEarned === true && missed.streakEarned === false,
   "with the streak answer carried explicitly rather than left to be guessed");
ok(Number.isFinite(missed.streakShortBy) && missed.streakShortBy > 0,
   "and the short one knows how far short it fell");
ok(/today counts/i.test(sscreen.sessionScreen(earned)),
   "the screen tells her plainly when the day counted");
ok(/didn.t reach the streak/i.test(sscreen.sessionScreen(missed)),
   "and just as plainly when it did not — without taking the work away");
ok(/everything you DID do is saved/i.test(sscreen.sessionScreen(missed)),
   "the work is still hers either way");
engine.exitSession();

/* --- reading the instructions stops the clock --- */
localStorage.clear();
const detailVm = svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: true,
  detailEx: { name: "Bird Dog", cue: "Flat back" } });
ok(/Timer(%20| )Image/.test(detailVm.detailPhotoFallbackUrl),
   "the detail photo falls back to the timer image — the repo has 39 of those and zero demo images");
ok(/data-fallback=/.test(sscreen.detailOverlayHtml(detailVm)),
   "and the overlay actually wires the fallback up");
engine.sess.phase = "work";
engine.sess.currentEx = { name: "Bird Dog", cue: "Flat back", block: "main", driver: "reps" };
ok(svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null }).canOpenDetail === true,
   "the instructions button is offered while a move is on screen");
engine.sess.currentEx = null;
engine.sess.phase = "getready";
ok(svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null }).canOpenDetail === false,
   "but not during the lead-in, where it used to render and do nothing when tapped");
engine.sess.phase = "work";
engine.sess.currentEx = { name: "Bird Dog", cue: "Flat back", block: "main", driver: "reps" };
const midWork = sscreen.sessionScreen(svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null }));
ok(/<button[^>]*data-action="openDetailCur"[^>]*>[\s\S]{0,400}?Bird Dog/.test(midWork),
   "the exercise NAME itself opens the instructions, not just the small ⓘ");
const paused = svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: true,
  detailEx: { name: "Bird Dog" } });
ok(paused.detailShowResume === false, "no Resume prompt when nothing is running");
engine.sess.running = true; engine.sess.paused = true;
ok(svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: true, detailEx: { name: "Bird Dog" } }).detailShowResume === true,
   "but a paused run says so and offers an explicit Resume");
engine.exitSession();
localStorage.clear();


/* ============================================================
   PHASE 2 — identity, sync, and reports that tell the truth
   ============================================================ */

/* ---- cloud identity is the profile, not the name ------------------------- */
localStorage.clear();
store.loadProfiles();
store.migrate();
ok(store.athleteId() === store.activeProfileId(),
   "a record is tagged with the immutable profile id, not the editable name");
ok(store.athleteAliases().includes("jess"),
   "the original athlete's old name-tag is still recognised");
ok(store.belongsToAthlete({ athlete: "jess" }),
   "so records mirrored under the old name still come back");
ok(store.belongsToAthlete({ athlete: store.activeProfileId() }), "and so do new ones");
ok(!store.belongsToAthlete({ athlete: "someone-else" }), "but another athlete's do not");

/* Renaming used to cut her off from every record she had ever written. */
store.updateSettings({ athleteName: "Jess" });
store.migrateAthleteIdentity();
store.renameProfile(store.activeProfileId(), "Jessica");
store.updateSettings({ athleteName: "Jessica" });
ok(store.belongsToAthlete({ athlete: "jess" }), "renaming Jess to Jessica keeps her old records hers");
ok(store.belongsToAthlete({ athlete: "jessica" }), "and claims the new name too");
ok(store.athleteId() === store.activeProfileId(), "while the id she writes under never moved");

/* Two profiles that share a name no longer share a history. */
const otherId = store.addProfile("Jessica");
ok(otherId && otherId !== store.activeProfileId(), "a second Jessica gets her own id");
ok(!store.athleteAliases(otherId).includes(store.activeProfileId()),
   "and does not answer to the first one's id");

/* ---- a backup knows whose it is ------------------------------------------ */
localStorage.clear();
store.loadProfiles();
store.migrate();
store.updateSettings({ athleteName: "Jess" });
store.saveSession({ app: "swimming", athlete: store.athleteId(), dayKey: "monday",
  isoDate: "2026-04-01T10:00:00.000Z", completedFully: true, xpVersion: store.XP_VERSION,
  roundsDone: 3, roundsPlanned: 3, ledger: [{ name: "x", status: "done" }], xpEarned: 360 });
const jessBackup = store.exportProfileData();
ok(store.backupIdentityMismatch(jessBackup) === null, "her own backup restores without a fuss");
const jennBackup = { ...jessBackup, profile: { id: "jenn-abcd", name: "Jenn" } };
const mism = store.backupIdentityMismatch(jennBackup);
ok(mism && mism.from === "Jenn", "a backup from another athlete is spotted");
let restoreErr = null;
try { store.importProfileData(jennBackup); } catch (e) { restoreErr = e; }
ok(restoreErr && restoreErr.identityMismatch, "and refused rather than silently merged");
ok(/can't be undone/.test(restoreErr.message), "with a message that says why it matters");
ok(store.importProfileData(jennBackup, { force: true }).sessionsAdded === 0,
   "a grown-up can still force it through deliberately");
ok(store.backupIdentityMismatch({ data: {} }) === null,
   "a backup too old to carry an identity is not blocked");

/* ---- reports that don't invent things ------------------------------------ */
localStorage.clear();
store.migrate();
const iso = n => new Date(Date.now() - n * 86400000).toISOString();
const row = (o) => ({ app: "swimming", dayKey: "monday", dayTitle: "Mon", xpVersion: store.XP_VERSION,
  sessionType: "main", lightResult: "green", ...o });
/* a real session, a GO-and-quit on the SAME day, a try-it row and a safety stop */
store.saveSession(row({ isoDate: iso(1), durationSecs: 1500, completedFully: true, roundsDone: 3,
  roundsPlanned: 3, ledger: [...mainRound(1), ...mainRound(2), ...mainRound(3)],
  mood: "great", xpEarned: 360 }));
store.saveSession(row({ isoDate: iso(1), durationSecs: 20, completedFully: true, roundsDone: 0,
  roundsPlanned: 3, ledger: [{ name: "a", status: "skipped" }], xpEarned: 0 }));
store.saveSession(row({ isoDate: iso(2), durationSecs: 400, practice: true, sessionType: "try-it" }));
store.saveSession(row({ isoDate: iso(3), durationSecs: 300, safetyStop: true, pain: true,
  endedEarly: true, completedFully: false, ledger: [{ name: "a", status: "done" }] }));
/* a real session she never told the app how she felt about */
store.saveSession(row({ isoDate: iso(4), durationSecs: 1200, completedFully: true, roundsDone: 2,
  roundsPlanned: 2, lightResult: "yellow",
  ledger: [...mainRound(1), ...mainRound(2)], xpEarned: 270 }));

const pv0 = pvm.buildProgressVM({ progressScope: "4w", logScope: "month" });
const zeroMin = pvm.logEntryView(store.loadSessions()[1]);
ok(zeroMin.duration === "under a min", "a 20-second session reads as under a minute, not as 1 min");
ok(zeroMin.lightLabel === "NOTHING LOGGED",
   "and is labelled for what it was, not badged GREEN like a finished day");
ok(pvm.logEntryView(store.loadSessions()[3]).lightLabel === "SAFETY STOP",
   "a safety stop is named as one");
ok(!pv0.logItems.some(l => /try-it/i.test(l.lightLabel || "")), "no try-it rows in her training log");
ok(zeroMin.moodEmoji === "·" && /not answered/.test(zeroMin.moodLabel),
   "an unanswered mood is not rendered as 🙂 Okay");
ok(pvm.logEntryView(store.loadSessions()[0]).moodEmoji === "😀", "an answered one still shows");

const pv = pvm.buildProgressVM({ progressScope: "4w", logScope: "week" });
ok(/^2 sessions/.test(pv.sessionsLabel) || /^1 session$/.test(pv.sessionsLabel),
   "the week chip pluralises properly");
const sessionChip = pv.milestones.find(m => /session/.test(m.label));
ok(sessionChip && /^2 sessions/.test(sessionChip.label),
   "the session count is training sessions only — try-it, safety stops and quits are out");
const roundsRow = pv.periodStats.rows.find(r => r.label === "Main rounds");
ok(/^5 of 5/.test(roundsRow.total),
   "main rounds read as done-of-asked-for — the yellow day asked for 2, not 3");
const feltRow = pv.periodStats.rows.find(r => r.label === "How I felt");
ok(/not answered/.test(feltRow.total), "and unanswered moods are named rather than dropped");

const gv = gvm.buildGrownupVM({ gsScope: "week", grownupTab: "analytics" });
ok(gv.analytics.rounds.note.includes("green 3, yellow 2, red 1"),
   "the parent report says what 'planned' actually means now");
/* A GO-and-quit must not paint its own day in. Today is always inside the
   week view, so the fixture uses today rather than an offset that may fall
   outside it. */
localStorage.clear();
store.migrate();
const thisDayKey = util.edmontonDayKey();
store.saveSession(row({ isoDate: new Date().toISOString(), dayKey: thisDayKey, durationSecs: 18,
  completedFully: true, roundsDone: 0, roundsPlanned: 3, ledger: [{ name: "a", status: "skipped" }] }));
// The view renders cells as styles, so count the trained colours.
const trainedCells = vm => vm.analytics.consistency.cells
  .filter(c => /background:var\(--mint\)|background:var\(--sun\)/.test(c.cellStyle)).length;
const quitOnly = trainedCells(gvm.buildGrownupVM({ gsScope: "week", grownupTab: "analytics" }));
ok(quitOnly === 0, "a day whose only session was a GO-and-quit stays blank (" + quitOnly + " filled)");
store.saveSession(row({ isoDate: new Date().toISOString(), dayKey: thisDayKey, durationSecs: 1500,
  completedFully: true, roundsDone: 3, roundsPlanned: 3, ledger: [{ name: "a", status: "done" }] }));
const withReal = trainedCells(gvm.buildGrownupVM({ gsScope: "week", grownupTab: "analytics" }));
ok(withReal === 1, "and fills in once she actually trains it");

/* The weekday review must show her best attempt, not the first one it finds. */
localStorage.clear();
store.migrate();
const todayIso = new Date().toISOString();
store.saveSession(row({ isoDate: todayIso, dayKey: util.edmontonDayKey(), durationSecs: 15,
  completedFully: false, endedEarly: true, roundsDone: 0, roundsPlanned: 3,
  ledger: [{ name: "a", status: "skipped" }] }));
store.saveSession(row({ isoDate: todayIso, dayKey: util.edmontonDayKey(), durationSecs: 1500,
  completedFully: true, roundsDone: 3, roundsPlanned: 3, mood: "great",
  ledger: [{ name: "a", status: "done" }], xpEarned: 360 }));
const wd = gvm.buildGrownupVM({ gsScope: "week", grownupTab: "analytics" })
  .analytics.byWeekday.find(d => d.k === data.DAY_SHORT[util.edmontonDayKey()]);
ok(wd && wd.done === true, "the weekday review shows the completed attempt, not the abandoned one");
ok(wd.mins === 25, "with its real duration");

/* Adherence counts DAYS she trained, not records. */
localStorage.clear();
store.migrate();
store.saveSession(row({ isoDate: todayIso, dayKey: util.edmontonDayKey(), durationSecs: 900,
  completedFully: true, roundsDone: 3, roundsPlanned: 3, ledger: [{ name: "a", status: "done" }] }));
store.saveSession(row({ isoDate: todayIso, dayKey: util.edmontonDayKey(), durationSecs: 900,
  completedFully: true, roundsDone: 3, roundsPlanned: 3, ledger: [{ name: "a", status: "done" }] }));
const oneDay = gvm.buildGrownupVM({ gsScope: "week", grownupTab: "analytics" }).analytics;
ok(typeof oneDay.adherence === "number", "adherence is reported as a number");
ok(oneDay.adherence <= 100, "two sessions on one day cannot push adherence over 100%");
const scheduledSoFar = oneDay.scheduled;
ok(oneDay.adherence === Math.round((1 / Math.max(1, scheduledSoFar)) * 100),
   "it counts the one DAY she trained, not the two records she left on it");
localStorage.clear();

/* ============================================================
   PHASE 2 — one session-outcome authority
   Every one of these calls the real function and asserts on what it RETURNS.
   ============================================================ */
localStorage.clear(); store.migrate();
const OV = outcome.OUTCOME_VERSION;
const led = (...st) => st.map((status, i) => ({ name: "m" + i, block: "main", round: 1, status }));

/* --- the five states --- */
ok(outcome.deriveSessionOutcome({ ledger: led("skipped", "skipped"), outcomeVersion: OV }).state === "none",
   "every exercise skipped is `none`");
ok(outcome.deriveSessionOutcome({ ledger: led("done", "skipped", "skipped"), outcomeVersion: OV }).state === "partial",
   "one done plus the rest skipped is `partial`, never a completed session");
ok(outcome.deriveSessionOutcome({ ledger: led("done", "done"), expectedWork: 2, outcomeVersion: OV }).state === "complete",
   "every expected instance done is `complete`");
ok(outcome.deriveSessionOutcome({ ledger: led("done", "done"), expectedWork: 4, outcomeVersion: OV }).state !== "complete",
   "missing expected ledger rows are not a completed session");
ok(outcome.deriveSessionOutcome({ ledger: led("done", "partial"), expectedWork: 2, outcomeVersion: OV }).state === "partial",
   "a required entry left partial is not complete");
ok(outcome.deriveSessionOutcome({ ledger: led("done"), safetyStop: true, outcomeVersion: OV }).state === "safety-stop",
   "a pain stop is its own state, not a short workout");
ok(outcome.deriveSessionOutcome({ ledger: led("done"), sessionType: "recovery", outcomeVersion: OV }).state === "recovery",
   "recovery is separate from training completion");

/* --- the partial-work correction: the reported defect --- */
const onePartial = outcome.deriveSessionOutcome({ ledger: [{ status: "partial" }], outcomeVersion: OV });
ok(onePartial.meaningfulWork === true, "a single partial entry IS meaningful work");
ok(onePartial.countsAsTraining === true, "and 7-of-8 reps buys the training day it earned");
ok(onePartial.state === "partial", "recorded as partial, never as complete");

/* --- safety stop and recovery pay nothing toward training --- */
const ss = outcome.deriveSessionOutcome({ ledger: led("done", "done"), expectedWork: 2, safetyStop: true, outcomeVersion: OV });
ok(ss.countsForStreak === false && ss.countsAsTraining === false, "a safety stop takes no streak and no training day");
const rc = outcome.deriveSessionOutcome({ ledger: led("done"), sessionType: "recovery", outcomeVersion: OV });
ok(rc.countsForStreak === false, "recovery does not increase the streak");
ok(rc.countsAsTraining === false, "nor does it complete a scheduled training day");
ok(rc.xpEligible === true, "but recovery is still allowed its care credit");

/* --- main rounds come from the ledger, not the loop --- */
const twoRounds = [
  { block: "main", round: 1, status: "done" }, { block: "main", round: 1, status: "done" },
  { block: "main", round: 2, status: "done" }, { block: "main", round: 2, status: "partial" }
];
ok(outcome.mainRoundsFromLedger(twoRounds) === 1,
   "a round with a partial move in it is not a finished round");

/* --- history is NOT re-scored: rows without outcomeVersion keep the old rule --- */
const legacyPartial = { ledger: [{ status: "partial" }], isoDate: new Date().toISOString() };
ok(store.countsAsTrained(legacyPartial) === false,
   "a pre-fix all-partial record keeps the scoring it was written with");
ok(store.countsAsTrained({ ...legacyPartial, outcomeVersion: OV }) === true,
   "the same shape written after the fix counts");

/* --- every consumer reads the SAME answer --- */
localStorage.clear(); store.migrate();
const shared = { app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: OV, sessionType: "main",
  roundsDone: 1, roundsPlanned: 3, durationSecs: 900, completedFully: false, endedEarly: true,
  ledger: [{ name: "a", block: "main", round: 1, status: "partial" }] };
ok(store.countsAsTrained(shared) === true, "the store calls it trained");
ok(store.isPartialSession(shared) === true, "and partial");
ok(store.outcomeOf(shared).state === "partial", "the authority agrees");
ok(store.xpForSession(shared) > 0, "and the XP it pays agrees that work happened");
ok(pvm.logEntryView(shared).lightLabel === "ENDED EARLY", "the log reports the same partial session");

/* --- regression: the one-full-day XP cap still holds over partial + resume --- */
localStorage.clear(); store.migrate();
const capBase = { app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: OV, sessionType: "main", roundsPlanned: 3,
  ledger: [{ name: "x", block: "main", round: 1, status: "done" }] };
const payA = store.claimSessionXp({ ...capBase, roundsDone: 1 });
const payB = store.claimSessionXp({ ...capBase, roundsDone: 2 });
ok(payA + payB === 360, "partial then resume still tops out at exactly one full day");
ok(store.claimSessionXp({ ...capBase, roundsDone: 3 }) === 0, "and a third attempt pays nothing");

/* --- regression: a pain stop is still zero XP and zero streak --- */
ok(store.xpForSession({ ...capBase, roundsDone: 3, safetyStop: true }) === 0, "a pain stop still pays no XP");
ok(store.countsAsTrained({ ...capBase, roundsDone: 3, safetyStop: true }) === false, "and still takes no streak");

/* ============================================================
   PHASE 1 — recovery is a safety mode, not a one-round workout
   ============================================================ */

/* --- the assembly: no workout blocks anywhere in the week --- */
const WORKOUT_BLOCKS = ["warmup", "coordination", "main", "prep", "finisher"];

for (const dk of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]) {
  const cs = engine.assembleCircuits(dk, "recovery");
  ok(cs.length > 0, dk + " Recovery still gives her something to do");
  ok(cs.every(c => c.block === "recovery"),
     dk + " Recovery assembles a recovery circuit and nothing else");
  ok(cs.every(c => c.exercises.every(e => !WORKOUT_BLOCKS.includes(e.block))),
     dk + " Recovery contains no warm-up/coordination/main/prep/finisher work");
  ok(cs.every(c => c.rounds === 1), dk + " Recovery is one pass, never a round count");
}
/* It uses the EXISTING recovery movements — no invented exercises. */
const recNames = new Set(engine.assembleRecoveryCircuit("sunday")[0].exercises.map(e => e.name));
const monRecNames = engine.assembleCircuits("monday", "recovery")[0].exercises.map(e => e.name);
ok(monRecNames.length > 0 && monRecNames.every(n => recNames.has(n)),
   "a weekday Recovery uses only the existing recovery movements");

/* --- zero must survive the light lookup --- */
ok(engine.roundsForLight("recovery") === 0, "recovery asks for zero rounds, and zero stays zero");
ok(engine.roundsForLight("green") === 3 && engine.roundsForLight("red") === 1, "the other lights are unchanged");

/* --- Sunday spa still behaves exactly as before --- */
const spaCs = engine.assembleCircuits("sunday", "recovery");
ok(spaCs.length === 1 && spaCs[0].block === "recovery" && spaCs[0].exercises.length > 0,
   "Sunday Spa behaviour continues to work");

/* --- a real weekday Recovery run --- */
const sRec = await runSession({ dayKey: "monday", light: "recovery", gateUnlocked: true });
ok(sRec.mode === "recovery", "a weekday resolving to Recovery runs in recovery mode");
ok(sRec.roundsPlanned === 0, "it plans zero rounds");
ok(sRec.roundsCompleted === 0, "and completes zero rounds");
ok(sRec.ledger.every(l => !WORKOUT_BLOCKS.includes(l.block)),
   "no warm-up, main, prep or finisher work reached the ledger");
ok(sRec.ledger.every(l => recNames.has(l.name)),
   "every move she was given came from the existing recovery template");
const recRow = store.loadSessions()[0];
ok(recRow.sessionType === "recovery", "the record is typed as recovery");
ok(recRow.roundsDone === 0 && recRow.roundsPlanned === 0, "with zero rounds done and zero planned");
ok(store.countsAsTrained(recRow) === false, "recovery does not complete the normal scheduled day");
/* Care FREEZES the streak rather than paying into it. A recovery day must not
   add to a training streak — it is not training — but reporting soreness
   honestly must not break one either, so it holds the flame instead. The whole
   menu is what buys that protection: a recovery run abandoned after two moves
   is not a day's care. */
ok(store.countsForStreak(recRow) === false,
   "a completed recovery day does NOT add a training streak day");
ok(store.freezesStreak(recRow) === true,
   "it freezes the streak instead, so honesty costs her nothing");
ok(store.freezesStreak({ ...recRow, ledger: (recRow.ledger || []).slice(0, 2) }) === false,
   "but a recovery run abandoned partway protects nothing");
ok(store.countsForStreak({ ...recRow, ledger: (recRow.ledger || []).slice(0, 2) }) === false,
   "and still earns no streak day either");
ok(store.currentStreak(store.loadSessions().filter(store.countsAsTrained)) === 0,
   "a week of recovery alone leaves the training streak at zero");

/* --- a weekday that resolves to Recovery gets recovery, not warm-up + main --- */
const sMiniRec = await runSession({ dayKey: "tuesday", light: "recovery", gateUnlocked: true });
ok(sMiniRec.mode === "recovery", "it is a recovery session");
ok(sMiniRec.ledger.every(l => !WORKOUT_BLOCKS.includes(l.block)), "and never reaches a main circuit");
ok(store.loadSessions()[0].sessionType === "recovery", "recorded as recovery");

/* --- the care credit: recovery pays a flat show-up credit, and no round XP --- */
ok(store.xpForSession({ ...recRow }) === store.XP_SHOWED_UP,
   "recovery pays the flat care credit — reporting soreness honestly must not cost her");
ok(store.dayXpCap(recRow) === store.XP_SHOWED_UP, "and the day's budget is exactly that, no round XP");
ok(store.xpForSession({ sessionType: "spa", xpVersion: store.XP_VERSION }) === 0,
   "Sunday's scheduled spa day is unchanged at zero — it was never a training day given up");

/* ============================================================
   PHASE 3 — interaction state repairs
   ============================================================ */

/* --- B. the form check is its own phase, and rest waits for it --- */
localStorage.clear(); store.migrate();
let sawFormCheck = false, restDuringCheck = false, timerMovedDuringCheck = false;
let lastTimer = null;
const sFc = await runSession({ dayKey: "monday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") {
      sawFormCheck = true;
      if (lastTimer !== null && sess.timerSecs !== lastTimer) timerMovedDuringCheck = true;
      lastTimer = sess.timerSecs;
      engine.pickClean();
    } else { lastTimer = null; }
    if (sess.pendingCleanCheck && ["rest", "roundRest", "sectionRest"].includes(sess.phase)) restDuringCheck = true;
  }
});
ok(sawFormCheck, "the engine enters an explicit formcheck phase");
ok(restDuringCheck === false, "a rest countdown never runs while a form check is pending");
ok(timerMovedDuringCheck === false, "and no clock ticks down underneath the question");
ok(sFc.formChecks.length > 0, "answering records a verdict");
ok(sFc.formChecks.every(f => f.clean === true), "the verdict given is the verdict recorded");

/* one pending check is never overwritten by a later move */
localStorage.clear(); store.migrate();
let overwritten = false, pendingFor = null, heldTicks = 0;
await runSession({ dayKey: "monday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.pendingCleanCheck) {
      if (pendingFor && sess.cleanCheckMove !== pendingFor) overwritten = true;
      pendingFor = sess.cleanCheckMove;
      // Hold the question open a few ticks — the engine must not move on, and
      // must not swap the move out from under her — then answer it.
      if (++heldTicks >= 3) { engine.pickClean(); heldTicks = 0; }
    } else { pendingFor = null; heldTicks = 0; }
  }
});
ok(overwritten === false, "an unanswered check cannot be overwritten by a later move");

/* a SKIPPED check records no verdict and earns no valgus credit */
localStorage.clear(); store.migrate();
store.saveGate({ unlocked: false, cleanWeeks: [] });
const sSkip = await runSession({ dayKey: "monday", light: "red" }, {
  onTick: (ms, sess) => { if (sess.phase === "formcheck") engine.skipFormCheck(); }
});
ok(sSkip.formChecks.length === 0, "a skipped check records no verdict");
ok(sSkip.cleanCount === 0, "and no clean count");
ok((store.loadGate().cleanWeeks || []).length === 0,
   "skipping the check grants no valgus credit — not answering is not answering `clean`");

/* the LAST exercise of a session still gets its check (there is no rest after it) */
localStorage.clear(); store.migrate();
let checkedMoves = [];
await runSession({ dayKey: "monday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => { if (sess.phase === "formcheck") { checkedMoves.push(sess.cleanCheckMove); engine.pickClean(); } }
});
ok(checkedMoves.length >= engine.SPOT_CHECK_MIN,
   "every move this run picked to watch was actually asked about (" + checkedMoves.length + ")");


/* ============================================================
   PHASE 4 — grown-up authority and prize repair
   ============================================================ */
/* --- the gate: DENY BY DEFAULT ---
   The old rule was an allowlist of six gated actions and "everything else is
   fine", which is how seventeen mutating actions and the door to the Zone
   itself ended up unprotected. It is the inverse now: an action is allowed
   only if it is named as child-safe. */
localStorage.clear(); store.migrate();
gate.lockGate();
setPasskeySupport(true);
globalThis.passkeyStub.mode = "ok";

ok(gate.gateUnlocked() === false, "the gate starts locked");
ok(gate.requireGrownup("severity3") === false, "a gated action is refused while locked");
ok(gate.requireGrownup("nav") === false,
   "`nav` is NOT on the child-safe list — where she is going decides, and that is CHILD_MAY's job in main.js");
ok(gate.requireGrownup("selectDay") === true, "picking a day to look at is hers");
ok(gate.requireGrownup("toggleCoachVoice") === false, "every settings toggle inside the Zone is gated");
ok(gate.requireGrownup("downloadBackup") === false, "so is downloading her whole history");
ok(gate.requireGrownup("renameAthlete") === false, "so is renaming the athlete — that used to be a raw input listener");
ok(gate.requireGrownup("restoreBackup") === false, "so is restoring a backup — that used to be a raw change listener");
ok(gate.requireGrownup("somethingNobodyHasWrittenYet") === false,
   "and an action nobody has classified is DENIED by the predicate. (What actually "
   + "proves this is the dispatcher test in test/actions.mjs — a predicate an "
   + "action never calls protects nothing.)");
ok(gate.requireGrownup("advance") === true, "her own session controls are hers");
ok(gate.requireGrownup("pickMood") === true, "and so is answering how it felt");

/* --- NO ARITHMETIC ANYWHERE --- */
ok(gate.gateChallenge === undefined && gate.answerGate === undefined,
   "the arithmetic challenge is gone: a sum a 10-year-old does in her head was "
   + "authorizing both the first PIN and every reset, so the PIN was worth exactly that sum");

/* --- first run on a FRESH device: the PIN goes on like a device passcode --- */
ok(gate.hasGrownupPin() === false, "a fresh device has no PIN");
ok(gate.isFreshDevice() === true, "and no training on it either");
/* ...but not until the cloud restore has answered. An empty session list on a
   wiped iPad is indistinguishable from a brand-new one until the mirror has
   been asked, and the restore is fired unawaited at boot — so for the first
   second of every launch, anyone tapping Grown-up could set a fresh PIN over a
   family that already had one. */
ok(gate.bootstrapState() === "checking", "a launch starts out not yet knowing whether there is cloud history");
ok(gate.gateMode() === "checking", "and refuses to hand out a free first PIN while it does not know");
gate.setBootstrapState("restored");
ok(gate.gateMode() === "passkey", "a device that turns out to HAVE history asks for the passkey, not a new PIN");
gate.setBootstrapState("empty");
ok(gate.gateMode() === "setPin", "the mirror answering 'nothing here' is what makes the device genuinely fresh");
ok(gate.gateNeedsOfflineSetup() === false, "and that answer needs no warning — it is a real answer");
gate.setBootstrapState("offline-unverified");
ok(gate.gateNeedsOfflineSetup() === true,
   "a device that could not reach the mirror may still be set up, but must say so first");
ok(gate.choosePin("12") === false, "a two-digit PIN is still refused");
ok(gate.choosePin("4821") === true, "a real one is set");
ok(gate.gateUnlocked() === true, "and setting it unlocks in the same step");
ok(gate.hasGrownupPin() === true, "the PIN is remembered for next time");
gate.lockGate();
ok(gate.gateMode() === "pin", "coming back asks for the PIN");

/* --- once she has TRAINED, the PIN cannot be replaced without a grown-up ---
   This is the case that matters: a child reaching the Zone first on a phone
   that has been in use for months, and locking her parent out of a history the
   device holds the only live copy of. */
store.saveSession({ app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
                    ledger: [{ name: "x", status: "done" }], completedFully: true });
ok(gate.isFreshDevice() === false, "the device now has training on it");
gate.lockGate();
ok(gate.choosePin("0000") === false, "so a new PIN cannot just be chosen");
ok(gate.answerPin("0000") === false, "and a guessed PIN unlocks nothing");
ok(gate.answerPin("4821") === true, "the real PIN still works");
gate.lockGate();

/* --- the passkey is what authorizes a reset --- */
ok(passkey.hasPasskey() === false, "no passkey enrolled yet");
ok(gate.gateMode(true) === "passkey", "'forgot the PIN' asks for the device passkey");
ok(gate.choosePin("5150") === false, "and with no passkey there is simply no reset path");
ok(/passkey/i.test(gate.pinRefusalReason()) && /training on it/i.test(gate.pinRefusalReason()),
   "which the refusal says out loud — why it was refused and what to do — rather than failing silently");

ok(await passkey.enrollPasskey("parent") === true, "a passkey enrols");
ok(passkey.hasPasskey() === true, "and is remembered on the device");
ok(await passkey.verifyPasskey() === true, "the ceremony confirms a grown-up");
gate.allowPinChoice();
ok(gate.choosePin("5150") === true, "which lets a new PIN replace the old one");
ok(gate.answerPin("5150") === true && gate.answerPin("4821") === false,
   "and it is the new PIN that works from then on");

/* A DIFFERENT credential is not this device's grown-up. Without this check the
   ceremony would accept any passkey the platform happened to hand back. */
const enrolledId = globalThis.passkeyStub.id;
globalThis.passkeyStub.id = "some-other-credential";
ok(await passkey.verifyPasskey() === false,
   "a ceremony that returns a credential this device never enrolled confirms nobody");
globalThis.passkeyStub.id = enrolledId;
ok(await passkey.verifyPasskey() === true, "and the enrolled one still does");

/* A cancelled ceremony proves nothing. */
gate.lockGate();
globalThis.passkeyStub.mode = "cancel";
ok(await passkey.verifyPasskey() === false, "a dismissed prompt confirms nobody");
ok(gate.gateUnlocked() === false, "and unlocks nothing");
globalThis.passkeyStub.mode = "ok";

/* A browser with no passkey support says so rather than pretending. */
setPasskeySupport(false);
ok(passkey.passkeySupported() === false, "an unsupported browser is detected");
ok(await passkey.enrollPasskey("parent") === false, "enrolment fails cleanly, never throws");
setPasskeySupport(true);

/* --- neither secret ever leaves the device --- */
ok(!store.PROFILE_KEYS.includes(store.LS_GROWNUP_PIN),
   "the PIN is NOT a profile key, so downloadBackup can never write it into a file she can open");
ok(!store.PROFILE_KEYS.includes(store.LS_GROWNUP_PASSKEY), "nor is the passkey credential");
const exported = JSON.stringify(store.exportProfileData());
ok(!exported.includes("5150"), "no export contains the PIN");
ok(!exported.includes("swim_grownup"), "and no export mentions either secret at all");
ok(localStorage.getItem(store.LS_GROWNUP_PIN) !== null, "the PIN is stored");
ok(!String(localStorage.getItem(store.LS_GROWNUP_PIN)).includes("5150"),
   "but the PIN itself is not what is stored — only a salted digest of it");

/* it expires */
gate.lockGate();
gate.allowPinChoice();
gate.choosePin("4821");
ok(gate.gateUnlocked(Date.now() + gate.GATE_UNLOCK_MS + 1) === false,
   "the unlock expires after five minutes");
ok(gate.gateUnlocked(Date.now() + 1000) === true, "but not before");
gate.lockGate();
ok(gate.gateUnlocked() === false, "leaving the Grown-up Zone locks it again");
await unlockGrownup();

/* --- prize repair: IDs are fixed automatically, redemption is NOT --- */
localStorage.clear(); store.migrate();
const wallet = [
  { id: "dup", label: "Movie night", date: "2026-01-05", redeemed: true, redeemedAt: 111 },
  { id: "dup", label: "Ice cream",   date: "2026-01-06", redeemed: true },
  { id: "ok",  label: "Late bedtime", date: "2026-01-07", redeemed: false }
];
store.saveJourney({ ...(store.loadJourney() || {}), xp: 0, prizesWon: wallet, pendingDraws: 0 });
const rep = store.repairPrizeWallet();
ok(rep.reissued === 1, "a duplicate ID is reissued");
const afterRepair = store.loadJourney().prizesWon;
ok(new Set(afterRepair.map(p => String(p.id))).size === 3, "every prize now has a unique ID");
ok(afterRepair.filter(p => p.redeemed).length === 2,
   "repair does NOT unredeem anything — the app cannot know which she really spent");
ok(afterRepair.length === 3, "and it never deletes a prize she earned");

/* --- the review list --- */
const review = store.redeemedPrizesForReview();
ok(review.length === 2, "both used prizes are offered for review, one at a time");
ok(review.every(p => p.label && p.id), "each is named so a grown-up can tell them apart");

/* --- restoring ONE selected prize --- */
const victim = review.find(p => p.label === "Ice cream");
const res = store.restorePrize(victim.id);
ok(res.restored === true, "the selected prize is restored");
ok(res.id !== victim.id, "as a REPLACEMENT with a new ID, not by un-redeeming the old one");
const w2 = store.loadJourney().prizesWon;
const fresh = w2.find(p => String(p.id) === String(res.id));
ok(fresh && fresh.redeemed === false, "the replacement is available again");
ok(fresh.label === "Ice cream", "with the same label");
ok(fresh.date === "2026-01-06", "and the day she originally earned it");
ok(fresh.repairOf === victim.id, "pointing at what it replaces");
ok(!w2.some(p => String(p.id) === String(victim.id)), "the corrupted copy is gone");
ok(w2.length === 3, "the wallet still holds three prizes — nothing earned was removed");
ok(w2.filter(p => p.redeemed).length === 1,
   "the OTHER used prize stays used — legitimate redemptions are untouched");

/* --- and the restore survives the cloud, which is the whole point --- */
const voided = store.loadJourney().voidedPrizeIds || [];
ok(voided.includes(String(victim.id)), "the corrupted ID is voided");
/* Redemption always wins a merge — so an un-redeemed copy would have been
   re-redeemed by the next sync from her other device. The voided id must not
   come back at all. */
const otherDevice = [{ id: victim.id, label: "Ice cream", date: "2026-01-06", redeemed: true, redeemedAt: 222 }];
const merged = store.mergeWalletsForTest
  ? store.mergeWalletsForTest(w2, otherDevice, voided)
  : null;
if (merged) {
  ok(!merged.some(p => String(p.id) === String(victim.id)),
     "cloud sync cannot reintroduce the voided corrupted copy");
  ok(merged.some(p => String(p.id) === String(res.id) && p.redeemed === false),
     "and the restored prize is still available after the merge");
}
ok(store.mergePrize({ id: "x", redeemed: false }, { id: "x", redeemed: true, redeemedAt: 5 }).redeemed === true,
   "normal redeemed-wins merging is unchanged for legitimate redemption");
ok(store.restorePrize("nope").restored === false, "restoring an unknown prize fails cleanly");
ok(store.restorePrize(w2.find(p => !p.redeemed).id).restored === false,
   "and an already-available prize reports that, rather than claiming a restore");

/* ============================================================
   PHASE 5 — coach state, audio separation, and the clock
   ============================================================ */
const audio = await import(base + "audio.js");

/* --- B. three switches, not one --- */
localStorage.clear(); store.migrate();
store.updateSettings({ coachSpeechOn: false, timerSoundsOn: true, safetyVoiceOn: true, voiceStyle: "classic" });
ok(audio.coachAudioOn() === false, "the coach's voice can be turned off");
ok(audio.timerSoundsOn() === true, "and the timer beeps stay ON — they used to die with it");
ok(audio.safetyVoiceOn() === true, "as do the safety cues");
store.updateSettings({ voiceStyle: "quiet" });
ok(audio.voiceOn() === false, "quiet mode suppresses the coach");
ok(audio.safetyVoiceOn() === true, "but quiet mode never removes the safety voice");
store.updateSettings({ coachSpeechOn: true, timerSoundsOn: false, voiceStyle: "classic" });
ok(audio.timerSoundsOn() === false && audio.coachAudioOn() === true,
   "and the beeps can be silenced without muting the coach");

/* migration: the old single flag seeds the new ones */
localStorage.clear();
store.updateSettings({ coachVoiceOn: false });
delete store.settings.audioSplitDone;
store.updateSettings({ audioSplitDone: false });
store.migrateAudioSettings();
ok(store.settings.coachSpeechOn === false, "an existing OFF carries into coach speech");
ok(store.settings.timerSoundsOn === false, "and into timer sounds");
ok(store.settings.safetyVoiceOn === true, "while the safety voice defaults ON regardless");
localStorage.clear(); store.migrate();
ok(store.settings.coachSpeechOn === true && store.settings.timerSoundsOn === true,
   "a fresh install gets all three on");

/* --- C. the clock is derived from wall time, not from tick counting ---- */
localStorage.clear(); store.migrate();
/* Simulate a BACKGROUNDED tab: real time passes, but the 1s interval barely
   fires. The old `elapsed += 1` counter recorded only the ticks it got. */
store.updateSettings({ cloudMirror: false, coachVoiceOn: false, exerciseRestSeconds: 3, roundRestSeconds: 5, sectionRestSeconds: 3 });
const bgClock = makeClock();
engine.exitSession();
const bgRun = engine.startSession({ dayKey: "monday", light: "red", gateUnlocked: true });
await bgClock.advance(5000);                       // 5s of normal foreground
const beforeGap = engine.sess.elapsed;
await bgClock.advance(60000, 30000);               // 60s passes, interval fires twice
const afterGap = engine.sess.elapsed;
ok(afterGap - beforeGap >= 59,
   "a minute in the background is recorded as a minute (" + (afterGap - beforeGap) + "s), not as two ticks");
/* paused time is excluded */
engine.togglePause();
const atPause = engine.sess.elapsed;
await bgClock.advance(20000);
ok(engine.sess.elapsed === atPause, "no active time accrues while paused");
ok(engine.sess.pausedSecs >= 19, "and the paused span is counted as paused (" + engine.sess.pausedSecs + "s)");
engine.togglePause();
await bgClock.advance(3000);
ok(engine.sess.elapsed >= atPause + 2, "the clock picks up again on resume");
/* opening the instructions pauses, so reading never inflates active time */
const beforeRead = engine.sess.elapsed;
engine.togglePause();
await bgClock.advance(30000);
engine.togglePause();
ok(engine.sess.elapsed - beforeRead <= 1,
   "reading the instructions adds no active time at all");
/* End it properly so the record is written, then let the loop unwind on the
   fake clock rather than stranding a promise on the real one. */
const bgElapsed = engine.sess.elapsed;
engine.endEarly();
let bgSpins = 0;
while (engine.sess.running && bgSpins++ < 200) await bgClock.advance(1000);
bgClock.restore();
await bgRun.catch(() => {});
const bgRow = store.loadSessions()[0];
ok(bgRow && bgRow.durationSecs >= 60,
   "and the SAVED record carries the real duration (" + (bgRow && bgRow.durationSecs) + "s), not the tick count");
ok(bgRow.durationSecs >= bgElapsed - 2, "the saved duration matches the live clock");
ok(bgRow.pausedSecs >= 19, "with the paused span recorded separately");

/* --- A. the coach state is readable without any speech at all ---------- */
localStorage.clear(); store.migrate();
store.updateSettings({ coachSpeechOn: false, timerSoundsOn: false, exerciseRestSeconds: 3, roundRestSeconds: 5, sectionRestSeconds: 3, cloudMirror: false });
let sawSet = false, sawRep = false, sawSide = false, repsMonotonic = true, lastRep = 0;
await runSession({ dayKey: "monday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    const vm = svm.buildSessionVM({});
    if (!vm.showCoachState) { lastRep = 0; return; }
    if (vm.coachSetLine) sawSet = true;
    if (vm.coachSideLine) sawSide = true;
    if (vm.coachRepLine) {
      sawRep = true;
      const n = Number(vm.coachRepLine.match(/REP (\d+)/)[1]);
      if (n < lastRep) repsMonotonic = false;
      lastRep = n;
    }
  }
});
ok(sawRep, "the screen says which rep she is on, with the voice off entirely");
ok(sawSet || sawSide, "and which set or side");
ok(repsMonotonic, "the rep count only ever moves forwards within a segment");
/* the whole session still completes with no voice and no beeps */
ok(store.loadSessions()[0].ledger.some(l => l.status === "done"),
   "a silent session still runs, and still records real work");

/* ============================================================
   PHASE 6 — report truth
   ============================================================ */
localStorage.clear(); store.migrate();
const OV6 = outcome.OUTCOME_VERSION;
const todayKey6 = util.edmontonDayKey();
const todayIso6 = new Date().toISOString();

/* --- the missed-day card only claims a warm-up the ledger can prove --- */
const missedVm = () => tvm.buildTodayVM({ selectedDay: todayKey6, expanded: {} }).dayView;
/* (a) nothing done at all */
let dv6 = missedVm();
if (dv6.isMissed) {
  ok(!/warm-up/i.test(dv6.missedSub || ""),
     "a missed day with nothing done never claims she got the warm-up in");
}
/* (b) a warm-up she really did */
store.saveSession({ app: "swimming", dayKey: todayKey6, isoDate: todayIso6,
  xpVersion: store.XP_VERSION, outcomeVersion: OV6, sessionType: "main",
  roundsDone: 0, roundsPlanned: 3, durationSecs: 300, completedFully: false, endedEarly: true,
  ledger: [{ name: "A-Skip", block: "warmup", round: 1, status: "done" }] });
const dvWarm = missedVm();
if (dvWarm.isMissed) {
  ok(/warm-up/i.test(dvWarm.missedSub || ""), "and says so when the ledger proves it");
}

/* --- recovery and safety stops stay out of the training statistics --- */
localStorage.clear(); store.migrate();
const mkRow = o => ({ app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: OV6, roundsPlanned: 3, roundsDone: 3,
  durationSecs: 1800, sessionType: "main", completedFully: true,
  ledger: [{ name: "x", block: "main", round: 1, status: "done" }], ...o });
store.saveSession(mkRow({}));                                                   // a real session
store.saveSession(mkRow({ sessionType: "recovery", roundsDone: 0, roundsPlanned: 0, durationSecs: 600 }));
store.saveSession(mkRow({ safetyStop: true, pain: true, durationSecs: 900, completedFully: false, endedEarly: true }));
store.saveSession(mkRow({ practice: true, sessionType: "try-it", durationSecs: 1200 }));

const an6 = gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics" }).analytics;
const totalRow = an6.indicators.find(b => b.label === "Total time");
ok(/^30m$/.test(totalRow.total),
   "total time counts only the 30-minute training session (" + totalRow.total + ")");
ok(!/1h/.test(totalRow.total), "recovery, the safety stop and the try-it row are all excluded");
const completedRow = an6.indicators.find(b => b.label === "Completed");
ok(completedRow.total === "1 of 1",
   "the completed ratio is against training sessions only (" + completedRow.total + ")");

/* streak and adherence agree */
ok(store.currentStreak(store.loadSessions().filter(store.countsAsTrained)) === 1,
   "only the training session feeds the streak");
ok(an6.adherence <= 100, "adherence stays within range");

/* --- every report category comes from the one authority --- */
const cats = store.loadSessions().map(r => store.outcomeOf(r).state);
ok(cats.includes("complete"), "a complete session is categorised complete");
ok(cats.includes("recovery"), "recovery has its own category");
ok(cats.includes("safety-stop"), "a safety stop has its own category");
ok(cats.includes("none"), "and a legacy try-it row is not counted as training");
store.loadSessions().forEach(r => {
  const oc = store.outcomeOf(r);
  ok(store.countsAsTrained(r) === oc.countsAsTraining,
     "the store and the authority never disagree about " + oc.state);
  if (!oc.xpEligible) ok(store.xpForSession(r) === 0,
     "and XP never pays for a session the authority calls " + oc.state);
});

/* --- main-round reporting uses what was really done and really asked --- */
localStorage.clear(); store.migrate();
store.saveSession(mkRow({ roundsDone: 1, roundsPlanned: 3 }));
const an7 = gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics" }).analytics;
ok(an7.rounds.done === 1, "rounds done is what she actually finished");
ok(an7.rounds.planned === 3, "against what the day actually asked for");
/* On its OWN day — the plan is rolled up per real date now, so putting the mini
   on the same date as the session above would be asking what that DATE asked
   for (three), not what a mini asks for. */
store.saveSession(mkRow({ mini: true, sessionType: "mini", roundsDone: 1, roundsPlanned: 3,
  isoDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }));
const an8 = gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics" }).analytics;
ok(an8.rounds.planned === 4, "a mini asks for one round, not the light's three");

/* And a day is asked for its rounds ONCE, however many times she sat down to
   them. Summing the per-sitting ask scored a green day trained in two goes out
   of five, so finishing it read back as 60% adherence. */
localStorage.clear(); store.migrate();
store.saveSession(mkRow({ roundsDone: 1, roundsPlanned: 3, dayRoundsPlanned: 3, bankedRounds: 0,
  ledger: [{ name: "x", block: "main", round: 1, status: "done" }] }));
store.saveSession(mkRow({ roundsDone: 2, roundsPlanned: 2, dayRoundsPlanned: 3, bankedRounds: 1,
  ledger: [{ name: "y", block: "main", round: 2, status: "done" },
           { name: "z", block: "main", round: 3, status: "done" }] }));
const anTwoSittings = gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics" }).analytics;
ok(anTwoSittings.rounds.planned === 3,
   "one day trained in two sittings asked for three rounds, not five");
ok(anTwoSittings.rounds.done === 3, "and all three were finished");
ok(anTwoSittings.roundsDonePct === 100,
   "so a finished day reads as finished — it used to read 60%");

/* ============================================================
   INTERACTION REGRESSIONS

   Five defects that were all invisible from the outside: nothing about the
   rendered markup, the saved record or the engine's own counters said any of
   them was happening. Each of these drives the real thing.
   ============================================================ */

/* --- an abnormal check travels with the session; a clean one stays home -----
   The session record is mirrored wholesale to a SHARED cloud collection, so
   what goes on it is a privacy decision and not just a data one. An abnormal
   check is what a grown-up on the other device needs; an all-green one tells
   them nothing and is the one shape kept off the wire entirely. */
const soreCheck = { answers: { q_pain: "no" }, zoneSev: { 2: 3 }, severity: 3,
                    light: "red", suggestedLight: "red", resultSource: "bodycheck" };
const soreRun = await runSession({ dayKey: "tuesday", light: "red", suggestedLight: "red",
                                   readiness: soreCheck, gateUnlocked: true });
const soreEntry = soreRun.savedEntry;
ok(soreEntry && JSON.stringify(soreEntry.zoneSev) === JSON.stringify({ "2": 3 }),
   "an abnormal check puts the marked zones on the session record");
ok(soreEntry.severity === 3 && soreEntry.resultSource === "bodycheck",
   "with the severity and where the call came from");
ok(soreEntry.readinessAnswers && soreEntry.readinessAnswers.q_pain === "no",
   "and the answers behind it");

const cleanCheck = { answers: { q_pain: "yes", q_sleep: "yes", q_light: "yes", q_ready: "yes" },
                     zoneSev: {}, severity: null, light: "green",
                     suggestedLight: "green", resultSource: "readiness" };
const cleanRun = await runSession({ dayKey: "tuesday", light: "green", suggestedLight: "green",
                                    readiness: cleanCheck, gateUnlocked: true });
const cleanEntry = cleanRun.savedEntry;
ok(cleanEntry.zoneSev === undefined && cleanEntry.readinessAnswers === undefined,
   "an all-green check puts NOTHING extra on the record — it never leaves the device");
ok(cleanEntry.suggestedLight === "green" && cleanEntry.lightResult === "green",
   "while the three light fields it always carried are untouched");
ok(store.loadReadinessLog().every(r => r.abnormal === false) ||
   store.loadReadinessLog().length === 0,
   "and the local log is still the place the clean check is kept");

/* The grown-up's privacy opt-out governs the readiness mirror too. */
store.updateSettings({ cloudMirror: false });
ok(await sync.publishReadiness() === false,
   "with the cloud mirror off, an abnormal check is not published at all");
store.updateSettings({ cloudMirror: false });

/* --- A RAISED LIGHT STILL OWES ITS MAIN ROUNDS -----------------------------
   Day progress stored the bare block name "main", and a resume dropped every
   block on that list from the new plan without ever comparing the two lights.
   So: train under Red, finish its ONE main round, stop before swim-skill; come
   back under Green and the block holding Green's three rounds was skipped as
   already finished. The resumed session ran no main set at all, and could then
   be called complete against a plan that had never included one.

   Main is the one block whose SIZE is set by the light, so its progress is a
   count of rounds, not a name on a list. */
const redThenGreen = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday",
    { done: ["warmup", "main"], light: "red", mainRoundsCompleted: 1 })
});
const rgMain = redThenGreen.circuits.find(c => c.block === "main");
ok(!!rgMain, "resuming a Red day under Green still runs a main block — it used to run none");
ok(rgMain.rounds === 2, "and asks for the TWO rounds Green still owes, not three and not zero");
ok(redThenGreen.roundsPlanned === 2,
   "the session is planned against what it actually owes, so the finished round is not billed twice");
ok(!redThenGreen.circuits.some(c => c.block === "warmup"),
   "a genuinely finished block is still skipped — the resume itself was never the bug");

const yellowThenGreen = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday",
    { done: ["warmup", "main"], light: "yellow", mainRoundsCompleted: 2 })
});
ok((yellowThenGreen.circuits.find(c => c.block === "main") || {}).rounds === 1,
   "two rounds banked under Yellow leaves exactly one owed under Green");

/* Lowering the light owes nothing: three rounds banked covers Red's one. */
const greenThenRed = await runSession({ dayKey: "tuesday", light: "red", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday",
    { done: ["warmup", "main"], light: "green", mainRoundsCompleted: 3 })
});
ok(!greenThenRed.circuits.some(c => c.block === "main"),
   "and a light LOWERED after the work is done owes no main rounds at all");

/* The rounds are banked even when the block is not yet retired, so a session
   that stops mid-main is not read as having finished the block. */
const partialMain = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday",
    { done: ["warmup"], light: "green", mainRoundsCompleted: 1 })
});
ok((partialMain.circuits.find(c => c.block === "main") || {}).rounds === 2,
   "one round banked under Green leaves two owed, with the block never retired");

/* --- A FINISHED MAIN ROUND SURVIVES BEING INTERRUPTED ----------------------
   The seeded resumes above all hand the engine a progress record that ALREADY
   says a round is banked. Nothing tested that a real session ever writes one.
   It did not: `sess.roundsCompleted` was incremented per round, but the write to
   day progress lived past the end of the main block's round loop — past every
   `return finalize(false)` an interrupted session takes. So stopping a Green day
   after a clean round one left `mainRoundsCompleted: 0`, and coming back made
   her do that round over. The record and the streak were right the whole time;
   only the resume threw the work away. */
let roundsAtStop = 0;
const stoppedMidMain = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    // Stop partway through round TWO — round one is finished, round two is not.
    if (sess.roundsCompleted >= 1 && sess.round >= 2 && sess.running) {
      roundsAtStop = sess.roundsCompleted;
      engine.endEarly();
    }
  }
});
ok(roundsAtStop === 1, "the session really was stopped inside main round two");
ok(stoppedMidMain.endedEarly === true, "and it ended early rather than running to the end");
const bankedAfterStop = store.loadDayProgress("tuesday");
ok(bankedAfterStop && bankedAfterStop.mainRoundsCompleted === 1,
   "the finished round is on disk the moment it finishes — it used to read 0 here");
ok(!(bankedAfterStop.done || []).includes("main"),
   "and the main block is NOT retired, because Green still owes two rounds");
const resumedAfterStop = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", bankedAfterStop)
});
ok((resumedAfterStop.circuits.find(c => c.block === "main") || {}).rounds === 2,
   "so coming back asks for the two rounds still owed, not all three again");

/* The banking must never pay twice. A session that runs the main block straight
   through banks each round as it lands AND flushes at the end of the block. */
const straightThrough = await runSession({ dayKey: "tuesday", light: "yellow", gateUnlocked: true });
ok(straightThrough.roundsCompleted === 2 && straightThrough.roundsBanked === 2,
   "every finished round is banked exactly once, never re-added by the block flush");

/* Care still does not touch the training day's record — the guard moved into a
   shared ownsDayProgress(), so a per-round bank must respect it too. */
const careMidStop = await runSession({ dayKey: "monday", light: "recovery", gateUnlocked: true,
  seed: () => store.saveDayProgress("monday",
    { done: ["warmup"], light: "green", mainRoundsCompleted: 1 })
});
ok(careMidStop.roundsBanked === 0, "a care session banks no rounds against the training day");
ok((store.loadDayProgress("monday") || {}).mainRoundsCompleted === 1,
   "and leaves the training day's banked round exactly as it found it");

/* --- A PARTLY-FINISHED BLOCK IS NOT ASKED FOR TWICE ------------------------
   A block was only banked once it was COMPLETE, so stopping four moves into an
   eight-move warm-up brought all four back on the next attempt. A finished move
   is finished. Banked by NAME, because the same block assembles differently
   depending on the valgus gate and the pool load. */
let stoppedInWarmup = null;
await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    const warm = sess.ledger.filter(l => l.block === "warmup" && l.status === "done");
    if (warm.length >= 2 && sess.running) {
      stoppedInWarmup = warm.map(l => l.name);
      engine.endEarly();
    }
  }
});
const warmProg = store.loadDayProgress("tuesday");
ok(stoppedInWarmup && stoppedInWarmup.length >= 2, "the session really was stopped inside the warm-up");
ok(warmProg && (warmProg.moves.warmup || []).join("|") === stoppedInWarmup.join("|"),
   "the moves she finished are banked by name — the block used to bank nothing at all");
ok(!(warmProg.done || []).includes("warmup"),
   "and the block is NOT retired, because it is not finished");
ok(warmProg.bankedCredit === stoppedInWarmup.length,
   "the credit banked today is the count of finished moves");

const resumedWarmup = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", warmProg)
});
const rwWarm = resumedWarmup.circuits.find(c => c.block === "warmup");
ok(rwWarm && !rwWarm.exercises.some(ex => stoppedInWarmup.includes(ex.name)),
   "coming back offers only what is left of the warm-up");
ok(resumedWarmup.bankedCredit === warmProg.bankedCredit,
   "and the session carries the credit the day has already been paid");

/* A block banked down to nothing simply does not run. */
const fullWarm = engine.assembleCircuits("tuesday", "green", {})
  .find(c => c.block === "warmup").exercises.map(ex => ex.name);
const noWarm = engine.assembleCircuits("tuesday", "green", { skipMoves: { warmup: fullWarm } });
ok(!noWarm.some(c => c.block === "warmup"),
   "a warm-up whose every move is banked drops out, same as a retired block");

/* --- MAIN RESUMES INTO A RAGGED ROUND -------------------------------------
   Main's unit is the round, so a round interrupted halfway is neither finished
   nor untouched. What is LEFT of it runs as a round of its own, and only then
   the full rounds still owed. No circuit may call its first round "round 1"
   when the day already has rounds behind it — roundBase numbers each from where
   the day actually is, and that numbering is what keeps the round-completion
   proof honest ACROSS SITTINGS, not merely within one.

   The scenario is the real one startSession produces: round one is banked, so
   two rounds are owed, and round two was interrupted half-way through. */
const greenMain = engine.assembleCircuits("tuesday", "green", {})
  .find(c => c.block === "main");
const halfRound = greenMain.exercises.slice(0, 3).map(ex => ex.name);
const ragged = engine.assembleCircuits("tuesday", "green",
  { mainRounds: 2, roundOffset: 1, mainPartialRound: halfRound });
const raggedMains = ragged.filter(c => c.block === "main");
ok(raggedMains.length === 2, "a partly-done round produces a remainder circuit AND the rounds still owed");
ok(raggedMains[0].partialRound === true && raggedMains[0].rounds === 1
   && raggedMains[0].exercises.length === greenMain.exercises.length - 3,
   "the remainder round holds exactly the moves that were not finished");
ok(raggedMains[0].roundBase === 2 && raggedMains[1].roundBase === 3,
   "and the rounds are numbered from where the day is, so no circuit collides with the sitting before it");
/* The interrupted round is one of the rounds owed, not an extra in front of
   them: finishing it finishes round two, leaving round three. Counting it as
   extra ran a green day for four main rounds and printed "4 of 3". */
ok(raggedMains[1].rounds === 1,
   "the ragged round IS one of the two owed, so exactly one full round follows it");
const raggedByRound = engine.countExpectedByRound(ragged);
ok(raggedByRound[1] === undefined,
   "round one is behind us — nothing in this sitting claims it");
ok(raggedByRound[2] === greenMain.exercises.length - 3,
   "the remainder round declares its OWN smaller size — which is what lets it prove itself finished");
ok(raggedByRound[3] === greenMain.exercises.length,
   "while the full round after it still declares a full round's worth");

/* A resume with no ragged round is numbered the same way: one banked round
   means this sitting runs rounds two and three, never one and two. This is the
   collision that made a green day trained in two goes report 2 of 3 main rounds
   while the finish screen — counting the day's banked rounds separately — said
   3 of 3, and that blamed a move skipped in the evening on the round she had
   finished before lunch. */
const cleanResume = engine.assembleCircuits("tuesday", "green",
  { mainRounds: 2, roundOffset: 1 }).find(c => c.block === "main");
ok(cleanResume.roundBase === 2 && cleanResume.rounds === 2,
   "a clean resume runs the rounds it still owes, numbered as rounds of the DAY");
const cleanByRound = engine.countExpectedByRound([cleanResume]);
ok(cleanByRound[1] === undefined && cleanByRound[2] && cleanByRound[3],
   "so its expected-work map names rounds two and three, not one and two");

/* The proof still refuses a remainder round that was cut short again. */
const shortRemainder = raggedMains[0].exercises.slice(0, 1)
  .map((ex, i) => ({ name: ex.name, block: "main", round: 2, status: "done" }));
ok(outcome.mainRoundsFromLedger(shortRemainder, raggedByRound) === 0,
   "a remainder round cut short again credits nothing — the proof survives the ragged round");
const wholeRemainder = raggedMains[0].exercises
  .map(ex => ({ name: ex.name, block: "main", round: 1, status: "done" }));
ok(outcome.mainRoundsFromLedger(wholeRemainder, raggedByRound) === 1,
   "and finishing it credits the interrupted round exactly once");

/* A partial move is real work, and is still not a finished move: it is offered
   again rather than banked, so it never ends up permanently half-done. Short-Foot
   is a 20s timed warm-up hold; ending it around 5s is past MIN_EXERCISE_SECS and
   well under DONE_WORK_FRACTION, so it lands as `partial` rather than skipped. */
const CUT = "Short-Foot";
let cutShort = null;
await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (!cutShort && sess.phase === "work" && sess.currentEx
        && sess.currentEx.name === CUT && sess.exElapsed >= 5) {
      cutShort = CUT;
      engine.advance();
      return;
    }
    if (cutShort && sess.ledger.some(l => l.name === CUT) && sess.running) engine.endEarly();
  }
});
const partialProg = store.loadDayProgress("tuesday");
const cutRow = engine.sess.ledger.find(l => l.name === cutShort);
ok(cutRow && cutRow.status === "partial", "the first move really was recorded partial, not skipped");
ok(!(partialProg.moves.warmup || []).includes(cutShort),
   "a partial move is NOT banked — it would otherwise never get finished");
ok((partialProg.moves.warmup || []).length >= 1,
   "while the moves that were actually finished around it are");
const resumedPartial = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", partialProg)
});
ok((resumedPartial.circuits.find(c => c.block === "warmup") || { exercises: [] })
     .exercises.some(ex => ex.name === cutShort),
   "so it is offered again on the next attempt");

/* --- A DAY TRAINED IN TWO GOES, END TO END --------------------------------
   The whole point of the banking, proven the only way that counts: run a real
   session, stop it partway, run the resume to the end, and check what the second
   record actually says. */
let firstStopped = false;
const firstSitting = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    // Stop once main round one is banked and round two is under way.
    if (!firstStopped && sess.roundsCompleted >= 1 && sess.round >= 2 && sess.running) {
      firstStopped = true;
      engine.endEarly();
    }
  }
});
const midProg = store.loadDayProgress("tuesday");
const firstRec = store.loadSessions()[0];
ok(firstStopped && firstRec.endedEarly === true, "the first sitting stopped inside main round two");
ok(store.countsForStreak(firstRec) === false,
   "and on its own it is short of the day, so it earns no streak yet");
ok(midProg.bankedCredit > 0 && midProg.mainRoundsCompleted === 1,
   "it leaves behind both the finished moves and the finished round");

const secondSitting = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", midProg)
}, { onTick: (ms, sess) => { if (sess.phase === "formcheck") engine.pickClean(); } });
ok(secondSitting.running === false, "the resume runs to the end");
ok(secondSitting.bankedCredit === midProg.bankedCredit,
   "judged with the credit the day had already been paid");
ok(secondSitting.expectedWork >= secondSitting.dayExpectedWork,
   "and against the whole day's ask, not its own leftovers");
const secondRec = store.loadSessions()[0];
ok(secondRec.bankedCredit === midProg.bankedCredit,
   "the record carries the banked credit, so it scores the same tomorrow");
ok(outcome.outcomeOf(secondRec).state === "complete",
   "a day finished across two sittings reads COMPLETE — it used to be partial forever");
ok(store.countsForStreak(secondRec) === true, "and it earns the streak day it is owed");
ok(!store.loadDayProgress("tuesday"),
   "finishing the day clears its progress record, so tomorrow starts clean");

/* --- AND THE RESUME SAYS WHAT THE DAY DID, NOT WHAT IT HAD LEFT -----------
   Everything else on that finish screen judges the day — the XP, the streak, the
   "today counts" headline. The rounds line did not: the numerator counted this
   sitting's ledger and the denominator was the rounds this sitting still OWED,
   so a green day trained in two goes read "2 of 2 main rounds" with the round
   she finished before lunch nowhere on the screen. */
ok(secondSitting.bankedRounds === 1 && secondSitting.dayRoundsPlanned === 3,
   "the resume knows the day's ask and its own head start");
ok(secondSitting.roundsPlanned === 2,
   "while still being PLANNED against what it owes, so the round is not billed twice");
const resumedVm = svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null });
ok(resumedVm.roundsLine === "3 of 3 main rounds",
   "so the finish screen reports the day: " + JSON.stringify(resumedVm.roundsLine)
   + " — it used to read 2 of 2");
ok(secondRec.dayRoundsPlanned === 3 && secondRec.bankedRounds === 1,
   "and the record carries both, so it reads the same tomorrow and after a restore");
ok(store.dayRoundsPlanned(secondRec) === 3 && store.sessionRoundsPlanned(secondRec) === 2,
   "the day's ask and the sitting's ask are separate questions with separate answers");
ok(store.dayXpCap(secondRec) === 360,
   "the day's XP ceiling is the DAY's — a resume alone on its date used to cap at 270");
ok(store.sessionRounds(secondRec) === 2,
   "while the row itself still pays only for the two rounds it trained");
ok(store.plannedRoundsAcrossDays([firstRec, secondRec]) === 3,
   "and the two sittings together asked for three rounds, not five");

/* A first sitting is untouched by any of it: with nothing banked, the day's ask
   and the sitting's ask are the same number. */
ok(firstRec.dayRoundsPlanned === 3 && firstRec.bankedRounds === 0,
   "a first sitting has no head start and carries the day's plan unchanged");
ok(store.dayRoundsPlanned({ roundsPlanned: 2, roundsDone: 2 }) === 2,
   "and a legacy row with no day plan falls back to its sitting's ask, exactly as it reads today");

/* Prep is the one block deliberately re-run rather than banked: it is the
   movement prep for main, and skipping it would send a resume into main cold. */
ok((data.DAYS.tuesday.prepMenu || []).length > 0, "tuesday has a prep menu to test with");
ok(!(midProg.moves.prep || []).length, "prep moves are never banked");
const resumedPrep = secondSitting.circuits.find(c => c.block === "prep");
ok(resumedPrep && resumedPrep.exercises.length === data.DAYS.tuesday.prepMenu.length,
   "so a resume runs the whole prep menu again, rather than going into main cold");

/* Care and try-it still never touch the training day — the same ownsDayProgress
   guard the round banking uses. */
const careMoves = await runSession({ dayKey: "monday", light: "recovery", gateUnlocked: true,
  seed: () => store.saveDayProgress("monday",
    { done: [], light: "green", mainRoundsCompleted: 0, moves: { warmup: ["Wall Slides"] }, bankedCredit: 1 })
});
ok(careMoves.bankedCredit === 0, "a care session carries no training credit");
const afterCare = store.loadDayProgress("monday");
ok(afterCare.bankedCredit === 1 && (afterCare.moves.warmup || []).length === 1,
   "and banks nothing over the training day's own record");

/* --- 1. Recovery must not touch the training day's progress ---------------
   The reproduction: half a Monday, then a body check that says Recovery. The
   Recovery pass shared the `monday|<date>` key, so it stamped `light:"recovery"`
   over the green she had trained under and its final clearDayProgress threw the
   finished warm-up away. Reporting soreness honestly cost her the work. */
const recSeeded = await runSession({ dayKey: "monday", light: "recovery", gateUnlocked: true,
  seed: () => store.saveDayProgress("monday", { done: ["warmup", "coordination"], light: "green" })
});
ok(recSeeded.running === false, "a weekday Recovery pass runs to the end");
// `sess` is a live singleton the next run resets, so hold on to the saved record.
const recEntry = recSeeded.savedEntry;
const keptProg = store.loadDayProgress("monday");
ok(keptProg !== null, "the half-finished Monday is STILL THERE afterwards — Recovery used to erase it");
ok(JSON.stringify(keptProg.done) === JSON.stringify(["warmup", "coordination"]),
   "with exactly the blocks she had really finished, and nothing added");
ok(keptProg.light === "green",
   "and still under the light she trained under — not overwritten with 'recovery'");
ok(!keptProg.done.includes("recovery"), "a recovery block is never written into a training day");

/* It does not READ it either: a Recovery pass is never shortened by blocks a
   workout finished earlier the same day. */
ok(recSeeded.circuits.length === 1 && recSeeded.circuits[0].block === "recovery",
   "the recovery menu is given in full, whatever the workout had already done");

/* Training drills belong to training. A weekday that resolved to Recovery
   because her body reported pain was still being handed the swim-skill work. */
ok(recSeeded.microLoop === null, "no micro-loop quiz on a recovery day");
const TRAINING_BLOCKS = ["warmup", "coordination", "main", "prep", "finisher"];
ok(recSeeded.ledger.every(l => !TRAINING_BLOCKS.includes(l.block)),
   "and not one row of training work — only the recovery menu she was actually given");

/* A NORMAL session still resumes and still clears, exactly as before. */
const normalResume = await runSession({ dayKey: "monday", light: "red", gateUnlocked: true,
  seed: () => store.saveDayProgress("monday", { done: ["warmup"], light: "red" })
});
ok(normalResume.circuits.every(c => c.block !== "warmup"),
   "a real session still skips the block it already finished today");
ok(store.loadDayProgress("monday") === null,
   "and finishing it still clears the day, so tomorrow starts clean");

/* --- 2. a mixed done/skipped session reads as Partial, never Complete ----- */
let skipEvery = 0;
const sMixed = await runSession({ dayKey: "monday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    // Skip every third move she is given; the rest are done properly.
    if (["work", "reps"].includes(sess.phase) && sess.ledger.length !== skipEvery && sess.ledger.length % 3 === 2) {
      skipEvery = sess.ledger.length;
      engine.skipCurrentExercise();
    }
  }
});
const mixedRows = sMixed.ledger;
ok(mixedRows.some(l => l.status === "done") && mixedRows.some(l => l.status === "skipped"),
   "the run really did mix finished moves with skipped ones");
const mixedVm = svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null });
ok(mixedVm.completionState === "partial",
   "a session with skipped moves reads as PARTIAL — reaching the end of the loop is not finishing");
ok(mixedVm.isComplete === false, "and explicitly not complete");
const mixedHtml = sscreen.sessionScreen(mixedVm);
ok(!/Session Complete/.test(mixedHtml), "the finish screen does not say 'Session Complete!'");
ok(/counts/.test(mixedHtml), "it says what she did do, and that it counts");

/* The same screen, asked about the Recovery run: care, not a completed workout. */
engine.exitSession();
// The record the Recovery run actually saved — sess.savedEntry holds the ENTRY now,
// which is exactly what makes the finish screen readable from the saved row.
ok(recEntry && recEntry.sessionType === "recovery",
   "the recovery run saved a record, and sess.savedEntry holds it rather than a bare true");
Object.assign(engine.sess, { phase: "done", savedEntry: recEntry });
const recVm = svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null });
ok(recVm.completionState === "recovery",
   "and a finished Recovery pass reads as RECOVERY, not 'Session Complete!'");
ok(!/Session Complete/.test(sscreen.sessionScreen(recVm)), "so the screen never claims a workout she did not do");
ok(recVm.showRoundsLine === false, "and it does not report '0 of 0 main rounds' at her");
engine.exitSession();

/* --- 3. a round cannot be completed by the rows recorded before an abort -- */
const truncRow = (r, i) => ({ name: "m" + i, block: "main", round: r, status: "done" });
const truncLedger = [];
for (let i = 0; i < 8; i++) truncLedger.push(truncRow(1, i));
for (let i = 0; i < 3; i++) truncLedger.push(truncRow(2, i));   // aborted 3 moves in
const truncated = { ledger: truncLedger, expectedByRound: { 1: 8, 2: 8 }, roundsDone: 2,
                    outcomeVersion: outcome.OUTCOME_VERSION };
ok(outcome.mainRoundsFromLedger(truncLedger) === 2,
   "without the expected counts, three done rows out of eight read as a whole round");
ok(outcome.mainRoundsFromLedger(truncLedger, { 1: 8, 2: 8 }) === 1,
   "with them, the truncated round is not a round — the rows are simply missing");
ok(outcome.outcomeOf(truncated).mainRoundsDone === 1,
   "and where the engine and the ledger disagree, the SMALLER number wins");
ok(outcome.outcomeOf(truncated).roundsDisagree === true, "the disagreement is surfaced, not absorbed");
ok(outcome.outcomeOf({ ...truncated, roundsDone: 1 }).roundsDisagree === false,
   "two witnesses that agree raise nothing");
ok(outcome.outcomeOf({ ledger: truncLedger, roundsDone: 2, outcomeVersion: outcome.OUTCOME_VERSION })
     .mainRoundsDone === 2,
   "a record written before this change keeps its old reading — history is not re-scored underneath her");

/* --- 4. the safety voice obeys ITS OWN switch, in all four combinations ---
   "Session stopped." used to be spoken by speakSafety and then immediately
   cancelled by an interruptSpeech on the very next line — so with the coach
   voice ON, the one cue she must never lose was the one cue she lost. */
const spoken = [];
const realSpeak = window.speechSynthesis.speak;
window.speechSynthesis.speak  = function (u) { spoken.push(String(u.text)); return realSpeak.call(this, u); };
window.speechSynthesis.cancel = function () { spoken.push("<cancel>"); };
function stopSaysWhat(coach, safety) {
  localStorage.clear(); store.migrate();
  store.updateSettings({ coachSpeechOn: coach, safetyVoiceOn: safety, voiceStyle: "classic" });
  spoken.length = 0;
  engine.exitSession();
  engine.endEarly();
  return spoken.slice();
}
[[true, true], [false, true]].forEach(([coach, safety]) => {
  const said = stopSaysWhat(coach, safety);
  const at = said.indexOf("Session stopped.");
  ok(at >= 0, `the stop is spoken with the coach ${coach ? "on" : "off"} and the safety voice on`);
  ok(said.filter(t => t === "Session stopped.").length === 1, "exactly once, not twice");
  ok(!said.slice(at + 1).includes("<cancel>"),
     `and NOTHING cancels it afterwards (coach ${coach ? "on" : "off"}) — this is the regression`);
});
[[true, false], [false, false]].forEach(([coach, safety]) => {
  const said = stopSaysWhat(coach, safety);
  ok(!said.includes("Session stopped."),
     `with the safety voice off it stays silent, coach ${coach ? "on" : "off"}`);
});
window.speechSynthesis.speak = realSpeak;
window.speechSynthesis.cancel = function () {};
localStorage.clear(); store.migrate();

/* --- 5. the stop overlay keeps honest timestamps --------------------------
   It used to set sess.paused bare, with no syncClock, so up to a second of real
   work landed in `pausedMs` on the way in and a second of standing still landed
   in `activeMs` on the way out. Opening it also counted as HER pausing. */
/* Driven directly rather than through runSession: the bug is a SUB-SECOND
   misattribution, and a probe that only fires on whole-second boundaries lands
   exactly where the redraw interval has just synced the clock and so can never
   see it. Here nothing syncs unless a transition does. */
const clk = makeClock();
engine.exitSession();
ok((engine.sess.pauseCount || 0) === 0,
   "a fresh session starts with no pauses — the count used to survive exitSession and be written into the NEXT session's record");
Object.assign(engine.sess, { running: true, paused: false, pauseReasons: [],
  clockAt: Date.now(), activeMs: 0, pausedMs: 0, exMs: 0, phase: "work" });

await clk.advance(600);            // 600ms of real work
engine.openStopOverlay();
const activeAtStop = engine.sess.activeMs;
await clk.advance(4000);           // 4s with the overlay up, doing nothing
engine.resumeFromStop();
const pausedAtResume = engine.sess.pausedMs;
await clk.advance(700);            // back to work
engine.readClock();
const activeAtEnd = engine.sess.activeMs;
const pauseCountAfterStop = engine.sess.pauseCount || 0;

/* And the same for the instructions overlay. */
await clk.advance(500);
engine.pauseSession("instructions");
const activeAtRead = engine.sess.activeMs;
await clk.advance(3000);
engine.resumeSession("instructions");
const pausedAtCloseRead = engine.sess.pausedMs;
const pauseCountAfterRead = engine.sess.pauseCount || 0;
clk.restore();

ok(activeAtStop === 600,
   "opening the stop overlay closes the working span at the exact moment of the tap ("
   + activeAtStop + "ms) — it used to flip the flag with no clock sync at all");
ok(pausedAtResume === 4000,
   "the eight seconds she stood there are filed as PAUSED, to the millisecond (" + pausedAtResume + "ms)");
ok(activeAtEnd === 1300,
   "so the session clock counts only the work: 600 + 700 (" + activeAtEnd + "ms), never the wait");
ok(pauseCountAfterStop === 0,
   "and the stop overlay is not counted as her pausing — the parent report would have read a stop as a breather");
ok(activeAtRead === 1800, "reading the instructions closes the span the same way (" + activeAtRead + "ms)");
ok(pausedAtCloseRead === 7000, "and the reading time is paused time (" + pausedAtCloseRead + "ms)");
ok(pauseCountAfterRead === 0, "reading a move description is not a pause she took");
engine.exitSession();

/* A pause she took HERSELF is not released by closing an overlay she opened
   on top of it — the reason set has to empty first. */
engine.exitSession();
Object.assign(engine.sess, { running: true, paused: false, pauseReasons: [], clockAt: Date.now() });
engine.togglePause();
ok(engine.sess.paused === true, "she pauses");
engine.pauseSession("instructions");
engine.resumeSession("instructions");
ok(engine.sess.paused === true, "reading a move and closing it leaves her own pause standing");
engine.togglePause();
ok(engine.sess.paused === false, "and only she can lift it");
engine.exitSession();

/* ============================================================
   "0 OF 3 MAIN ROUNDS" AFTER THREE ROUNDS OF WORK

   The reported bug: a Thursday Green session, thirty-four minutes, all three
   main rounds trained, recorded as `0 of 3 main rounds · +90 XP` — the show-up
   credit alone. Three separate faults had to line up, and each one gets its own
   assertions here.
   ============================================================ */

/* --- 1. the Thursday green day, straight through -------------------------- */
const thuMain = engine.assembleCircuits("thursday", "green")
  .find(c => c.block === "main");
const thuPerRound = thuMain.exercises.length;
ok(thuPerRound === 5 && thuMain.rounds === 3,
   "Thursday Green's main block is 5 moves × 3 rounds (" + thuPerRound + "×" + thuMain.rounds + ")");

const thuLedger = [];
for (let r = 1; r <= 3; r++) {
  thuMain.exercises.forEach((ex, i) => thuLedger.push({
    name: ex.name, block: "main", round: r, ci: 0, ei: i, status: "done",
    driver: "time", plannedSecs: 30, actualSecs: 30 }));
}
const thuExpected = { 1: thuPerRound, 2: thuPerRound, 3: thuPerRound };
const thuRow = {
  app: "swimming", dayKey: "thursday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION,
  sessionType: "main", roundsPlanned: 3, completedFully: true,
  expectedWork: thuLedger.length, expectedByRound: thuExpected, ledger: thuLedger
};
ok(outcome.outcomeOf({ ...thuRow, roundsDone: 3 }).mainRoundsDone === 3,
   "fifteen finished main rows are three finished main rounds");
ok(store.xpForSession({ ...thuRow, roundsDone: 3 }) === 360,
   "and a full Thursday Green pays 360 XP");

/* THE FAULT ITSELF: the same fifteen rows, with the engine's counter stuck at
   zero because the round was committed after a rest she never sat through. The
   reading used to be Math.min(ledger, engine) — so zero won, the screen printed
   "0 of 3" and the day was priced at the 90 XP show-up credit. */
ok(outcome.outcomeOf({ ...thuRow, roundsDone: 0 }).mainRoundsDone === 3,
   "a stuck engine counter cannot erase rounds the rows can prove");
ok(store.xpForSession({ ...thuRow, roundsDone: 0 }) === 360,
   "and the day is paid on the rows too — it used to pay 90, the show-up credit");
ok(outcome.outcomeOf({ ...thuRow, roundsDone: 0 }).roundsDisagree === true,
   "the disagreement is still reported, because now it means a real defect");

/* --- 2. the round is banked before the rest, not after -------------------- */
/* Stop during the round rest that follows main round one. The round is finished
   and its rows are on the ledger; the old code incremented the counter at the
   BOTTOM of the round loop, so this abort path returned into finalize() first
   and threw the round away. */
let stoppedInRoundRest = false;
const stopInRest = await runSession({ dayKey: "thursday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.phase === "intent") { engine.advance(); return; }
    if (sess.phase === "roundRest" && sess.round === 1 && sess.running) {
      stoppedInRoundRest = true;
      engine.endEarly();
    }
  }
});
ok(stoppedInRoundRest, "the session really was stopped during the round-one rest");
ok(stopInRest.roundsCompleted === 1,
   "the round she finished is counted before the rest she quit in — it used to read 0");
const restRow = store.loadSessions()[0];
ok(restRow.roundsDone === 1, "and the saved record says one round, not zero");
ok(store.sessionXp(restRow) === 180, "so it pays for the round she trained (180), not 90");
ok((store.loadDayProgress("thursday") || {}).mainRoundsCompleted === 1,
   "and the round is banked to the day, so coming back asks for two");

/* --- 3. a round is judged on its DOSE, by the engine's own 80% floor ------ */
const doseRound = (mk) => {
  const rows = [0, 1, 2, 3, 4].map(i => ({
    name: "m" + i, block: "main", round: 1, status: "done",
    driver: "time", plannedSecs: 30, actualSecs: 30 }));
  return mk(rows);
};
const roundsOf = (rows, expected = { 1: 5 }) =>
  outcome.mainRoundsFromLedger(rows, expected, outcome.OUTCOME_VERSION);

ok(outcome.ROUND_DOSE_FRACTION === 0.8,
   "a round is held to the same 80% floor a single timed move is");
ok(roundsOf(doseRound(rows => rows)) === 1, "five finished moves is a finished round");
ok(roundsOf(doseRound(rows => rows.map((l, i) => i === 0
     ? { ...l, status: "partial", actualSecs: 23 } : l))) === 1,
   "one move at 77% still leaves the round above the bar — this is the tap-Done-early case");
ok(roundsOf(doseRound(rows => rows.map((l, i) => i === 0
     ? { ...l, status: "partial", actualSecs: 3 } : l))) === 0,
   "but a move barely attempted voids it — four perfect moves average that away otherwise");
ok(outcome.ROUND_ROW_FLOOR === 0.5, "no single move may be under half its dose");
ok(roundsOf(doseRound(rows => rows.map((l, i) => i === 0
     ? { ...l, status: "partial", actualSecs: 15 } : l))) === 1,
   "exactly half is the floor, and clears it");
ok(roundsOf(doseRound(rows => rows.map((l, i) => i === 0
     ? { ...l, status: "partial", actualSecs: 14 } : l))) === 0,
   "a second under it does not, however good the rest of the round was");
ok(roundsOf(doseRound(rows => rows.map(l =>
     ({ ...l, status: "partial", actualSecs: 24 })))) === 1,
   "every move at exactly 80% is a round at exactly 80%, which counts");
ok(roundsOf(doseRound(rows => rows.map(l =>
     ({ ...l, status: "partial", actualSecs: 23 })))) === 0,
   "and every move a second under it is not");
ok(roundsOf(doseRound(rows => rows.map((l, i) => i === 0
     ? { ...l, status: "skipped", actualSecs: 0 } : l))) === 0,
   "a SKIPPED move voids the round however good the other four were");
ok(roundsOf(doseRound(rows => rows.slice(0, 4))) === 0,
   "and a round short of a row is a round she did not reach");

/* The rule is looser than the one it replaces, so it must not reach backwards
   into records written under the old one. */
ok(outcome.mainRoundsFromLedger(doseRound(rows => rows.map((l, i) => i === 0
     ? { ...l, status: "partial", actualSecs: 23 } : l)), { 1: 5 }, 2) === 0,
   "a pre-v3 record keeps the all-done reading and is not re-scored underneath her");

/* --- 4. it says WHICH move cost her the round ----------------------------- */
const shortReport = outcome.mainRoundReport(
  doseRound(rows => rows.map((l, i) => i === 2
    ? { ...l, name: "Single-Leg Balance Reach", status: "partial", actualSecs: 3 } : l)),
  { 1: 5 }, outcome.OUTCOME_VERSION);
ok(shortReport.length === 1 && shortReport[0].counts === false, "the short round is reported as short");
ok(shortReport[0].blockedBy && shortReport[0].blockedBy.name === "Single-Leg Balance Reach",
   "and names the move that cost it, instead of leaving a bare 0 of 3 to be guessed at");
ok(shortReport[0].blockedBy.got === 3 && shortReport[0].blockedBy.planned === 30,
   "with the numbers she can act on");

/* And the finish screen SAYS it, which is the whole point — the bare "0 of 3"
   next to thirty-four minutes is what sent a grown-up digging through an
   exported ledger for an answer the app already had. */
let shortMove = null;
await runSession({ dayKey: "thursday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.phase === "intent") { engine.advance(); return; }
    // Tap "Done — Next" four seconds into a thirty-second hold in round two —
    // the exact gesture behind the report. It is NOT a skip: the row is real
    // work, recorded as partial, and it is round two alone that it costs.
    if (!shortMove && sess.phase === "work" && sess.round === 2
        && sess.currentEx && (sess.currentEx.block === "main") && sess.exElapsed >= 4) {
      shortMove = sess.currentEx.name;
      engine.advance();
    }
  }
});
const shortVm = svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null });
ok(shortMove, "a main move in round two really was cut short (" + shortMove + ")");
ok(shortVm.roundsLine === "2 of 3 main rounds",
   "the other two rounds still count — one short move costs its own round, not the session");
ok(shortVm.roundShortNotes.length === 1 && /^Round 2 didn't count/.test(shortVm.roundShortNotes[0]),
   "and the screen names the round: " + JSON.stringify(shortVm.roundShortNotes));
ok(shortVm.roundShortNotes[0].includes(shortMove),
   "and the move inside it, so she is told what happened instead of shown a bare number");
ok(sscreen.sessionScreen(shortVm).includes(shortVm.roundShortNotes[0]),
   "and the note is actually rendered onto the finish screen");

/* --- 5. the Clean/Wobbly spot check changes nothing ----------------------- */
/* It is offered on a couple of moves per session by design, and a grown-up
   reasonably wondered whether not seeing it — or dismissing it — was what cost
   the rounds. It is not, and this says so in both directions. */
const answered = await runSession({ dayKey: "thursday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") engine.pickClean();
    if (sess.phase === "intent") engine.advance();
  }
});
const dismissed = await runSession({ dayKey: "thursday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") engine.advance();   // dismissed, not answered
    if (sess.phase === "intent") engine.advance();
  }
});
ok(answered.roundsCompleted === 3, "answering every form check finishes three rounds");
ok(dismissed.roundsCompleted === 3,
   "and dismissing every single one finishes the same three — the check never gated a round");
ok(store.sessionXp(store.loadSessions()[0]) === 360,
   "the dismissed run is paid identically");

/* --- 6. a rep is counted once it has been performed ----------------------- */
/* `repsCounted` grades the move and pro-rates a partial one, and it used to be
   incremented at the top of the rep — so it really counted reps STARTED, and
   stopping during the last one credited it in full. */
let repsAtStop = null, repTargetAtStop = null;
await runSession({ dayKey: "thursday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.phase === "intent") { engine.advance(); return; }
    if (repsAtStop === null && sess.phase === "reps" && sess.repNow >= 3 && sess.running) {
      repsAtStop = sess.repsCounted;
      repTargetAtStop = sess.repNow;
      engine.endEarly();
    }
  }
});
ok(repTargetAtStop !== null, "the session really was stopped inside a rep");
ok(repsAtStop === repTargetAtStop - 1,
   "the rep she was interrupted in the middle of is not counted (" + repsAtStop
   + " counted, stopped inside rep " + repTargetAtStop + ") — it used to be");

/* --- 7. the coach can actually be slowed down ----------------------------- */
ok(store.DEFAULT_SETTINGS.voiceSpeed === "slow",
   "the coach ships slow, because the app is built for a ten-year-old");
ok(audio.VOICE_SPEED.slow === 0.82 && audio.VOICE_SPEED.normal === 0.95,
   "speed is two named rates, not a number buried in a personality");
store.updateSettings({ voiceSpeed: "slow", voiceStyle: "encouraging" });
const slowRate = audio.coachRate();
store.updateSettings({ voiceSpeed: "normal" });
const normalRate = audio.coachRate();
ok(slowRate < normalRate, "slow is genuinely slower than normal (" + slowRate + " vs " + normalRate + ")");
ok(Math.abs(slowRate - 0.82 * 0.94) < 1e-9,
   "speed and style compose — Encouraging used to come out at 0.99, i.e. normal speed");
store.updateSettings({ voiceStyle: "fun", voiceSpeed: "slow" });
ok(audio.coachRate() < 1, "even the loud persona is under normal speed when speed is set to slow");
ok(audio.SAFETY_RATE === 0.85,
   "and a safety line is slower still, whatever the persona and whatever the speed");
ok(audio.SPEECH_SETTLE_MS >= 350,
   "with a real beat between the instruction and the clock starting");
store.updateSettings({ voiceStyle: "encouraging", voiceSpeed: "slow" });

/* ============================================================
   AUDIT REPAIR — 2026-09-03
   One block per confirmed finding in the external audit. Each of
   these failed on d7dbf77 for the reason named in its comment.
   ============================================================ */

/* --- THE RULES THIS REPAIR MUST NOT MOVE ----------------------------------
   The audit asked for a Main round to require every row at its own full rule.
   That is NOT the rule here, by decision: the per-row floor plus the round mean
   is what absorbs a beat-early tap on one hold without handing a round away for
   a move that was never really trained. Pinned here so a later pass cannot
   quietly "fix" it back into the bug that printed "0 of 3". */
ok(outcome.ROUND_DOSE_FRACTION === 0.8 && outcome.ROUND_ROW_FLOOR === 0.5,
   "the round rule is a mean of 80% with a 50% per-row floor, and stays that way");
const keptRule = outcome.mainRoundReport(
  [1, 2, 3, 4].map(i => ({ block: "main", round: 1, name: "m" + i, status: "done",
                           driver: "time", plannedSecs: 30, actualSecs: 30 }))
    .concat([{ block: "main", round: 1, name: "m5", status: "partial",
               driver: "time", plannedSecs: 30, actualSecs: 15 }]),
  { 1: 5 }, outcome.OUTCOME_VERSION);
ok(keptRule[0].counts === true,
   "four clean moves and one at half dose still counts — the audit wanted this tightened; it is not");
const flooredOut = outcome.mainRoundReport(
  [1, 2, 3, 4].map(i => ({ block: "main", round: 1, name: "m" + i, status: "done",
                           driver: "time", plannedSecs: 30, actualSecs: 30 }))
    .concat([{ block: "main", round: 1, name: "m5", status: "partial",
               driver: "time", plannedSecs: 30, actualSecs: 4 }]),
  { 1: 5 }, outcome.OUTCOME_VERSION);
ok(flooredOut[0].counts === false,
   "and a move below the floor still loses the round, however good the mean");

/* --- 1. THE RECORD IS WRITTEN BEFORE THE RESUME IS THROWN AWAY -------------
   clearDayProgress(dayKey) ran on the line ABOVE finalize(true), and finalize
   is where saveSession happens — and saveSession returns false when storage
   refuses the write. So a full quota at the end of a long session deleted the
   resume state and then failed to write the record that replaced it: the work
   existed nowhere. Save first, and clear only what a successful save has
   actually replaced. */
let denyWrites = false;
const realSetItem = localStorage.setItem;
localStorage.setItem = function (k, v) {
  if (denyWrites && String(k).includes("sessions")) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
  return realSetItem.call(this, k, v);
};
const quotaRun = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    // Refuse the session write only once the day is genuinely finished, so the
    // failure lands exactly where the audit put it: at finalization.
    if (sess.roundsCompleted >= 3) denyWrites = true;
  }
});
ok(quotaRun.saveFailed === true, "a refused write is reported as a failed save, not a quiet success");
ok(quotaRun.savedEntry === null, "and no record is pretended into existence");
const survived = store.loadDayProgress("tuesday");
denyWrites = false;
localStorage.setItem = realSetItem;
ok(survived && (survived.mainRoundsCompleted || 0) >= 1,
   "the day's progress survives a failed save — it used to be deleted first, so the work existed nowhere");

/* --- 3. A BLOCK IS DONE WHEN ITS ROWS ARE DONE, NOT WHEN ONE OF THEM IS ----
   blockHadWork() was `some(status === "done")`, and recordBlockDone() then put
   the whole block on the done list and deleted its move-by-move record. Skip
   one warm-up move and the entire warm-up — the skipped move included — was
   never asked for again. */
let skippedOne = false;
let skippedName = null;
await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    const c = sess.circuits[sess.ci];
    if (!skippedOne && c && c.block === "warmup" && sess.ei >= 1 &&
        ["work", "reps"].includes(sess.phase) && sess.currentEx) {
      skippedName = sess.currentEx.name;
      skippedOne = true;
      engine.skipCurrentExercise();
      return;
    }
    // Stop once the warm-up is behind her: a run that reaches the end clears the
    // day, and what this is about is what the RESUME would be handed.
    if (skippedOne && c && c.block !== "warmup" && sess.running) engine.endEarly();
  }
});
ok(skippedOne, "the run really did skip a warm-up move");
const warmAfter = store.loadDayProgress("tuesday") || { done: [], moves: {} };
ok(!(warmAfter.done || []).includes("warmup"),
   "a warm-up with a skipped move is NOT retired — it used to be, skipped move and all");
ok((warmAfter.moves && warmAfter.moves.warmup || []).length > 0,
   "and the moves she did finish are still banked by name, so a resume does not re-ask for them");
ok(!(warmAfter.moves.warmup || []).includes(skippedName),
   "while the move she skipped is not among them: it comes back");

/* --- 6. ONE DAY OF TRAINING HAS ONE IDENTITY ------------------------------
   Resume was keyed on the weekday and the date, and records were told apart by
   `isoDate|dayKey`, so a partial and the sitting that finished it were two
   unrelated rows. Nothing could say they were the same workout. */
const inst1 = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.roundsCompleted >= 1 && sess.running) engine.endEarly();
  }
});
ok(typeof inst1.workoutInstanceId === "string" && inst1.workoutInstanceId.length > 0,
   "a workout gets a durable id when its plan starts");
ok(inst1.savedEntry && inst1.savedEntry.workoutInstanceId === inst1.workoutInstanceId,
   "and the id is on the record, not only in memory");
const carried = store.loadDayProgress("tuesday");
ok(carried && carried.workoutInstanceId === inst1.workoutInstanceId,
   "day progress carries it too, which is how a resume knows what it is continuing");
const inst2 = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true,
  seed: () => store.saveDayProgress("tuesday", carried) });
ok(inst2.workoutInstanceId === inst1.workoutInstanceId,
   "so the sitting that finishes the day is the SAME workout, not a second one");
const twoFragments = [inst1.savedEntry, inst2.savedEntry].filter(Boolean);
ok(outcome.workoutInstances(twoFragments).length === 1,
   "two fragments aggregate to one workout outcome — they used to count as two sessions");

/* --- 5. TODAY SAYS WHAT THE OUTCOME SAYS ----------------------------------
   vm/today.js printed "This day counts toward your streak." for ANY partial,
   without ever asking countsForStreak. Below the 75% bar that is simply false,
   and it is the screen the kid reads. */
localStorage.clear(); store.migrate();
const shortDay = {
  isoDate: new Date().toISOString(), dayKey: util.edmontonDayKey(),
  lightResult: "green", suggestedLight: "green", outcomeVersion: outcome.OUTCOME_VERSION,
  xpVersion: 5, roundsDone: 0, roundsPlanned: 3, expectedWork: 10, completedFully: false,
  durationSecs: 600, ledger: Array.from({ length: 10 }, (_, i) => ({
    block: i < 4 ? "warmup" : "main", round: 1, name: "x" + i,
    status: i < 4 ? "done" : "skipped", driver: "time", plannedSecs: 30,
    actualSecs: i < 4 ? 30 : 0 }))
};
ok(store.outcomeOf(shortDay).countsForStreak === false,
   "four moves out of ten is under the 75% bar, so it earns no streak day");
store.saveSession(shortDay);
const auditShortVm = tvm.buildTodayVM({ selectedDay: shortDay.dayKey, expanded: {}, isWide: true });
const auditShortText = JSON.stringify(auditShortVm);
ok(!/counts toward your streak/i.test(auditShortText),
   "and Today does not claim it does — it used to say so for every partial");
ok(/saved/i.test(auditShortText),
   "it says the work was saved instead, which is the true and kinder half");

localStorage.clear(); store.migrate();
const earnedDay = { ...shortDay, ledger: Array.from({ length: 10 }, (_, i) => ({
  block: i < 4 ? "warmup" : "main", round: 1, name: "x" + i,
  status: i < 8 ? "done" : "skipped", driver: "time", plannedSecs: 30,
  actualSecs: i < 8 ? 30 : 0 })) };
ok(store.outcomeOf(earnedDay).countsForStreak === true, "eight of ten clears the bar");
store.saveSession(earnedDay);
ok(/counts toward your streak/i.test(JSON.stringify(tvm.buildTodayVM({ selectedDay: earnedDay.dayKey, expanded: {}, isWide: true }))),
   "and at 75% Today does say the streak was earned — the two screens agree either way");

/* --- 7. ONE DAY OF TRAINING PAYS FOR ONE DAY, ON EVERY DEVICE -------------
   dayXpPaid is device-local by design, and the log is used as a floor under it,
   which covers a day trained on two devices in sequence. What it does not cover
   is two devices OFFLINE at once: each stamps a full day's award on its own
   record, and rebuildJourneyXp then added both stamps together. 360 + 360. */
localStorage.clear(); store.migrate();
const sameDate = new Date().toISOString();
const fullGreen = (suffix) => ({
  isoDate: sameDate.replace(/\dZ$/, suffix + "Z"), dayKey: "tuesday",
  lightResult: "green", outcomeVersion: outcome.OUTCOME_VERSION, xpVersion: 5,
  roundsDone: 3, roundsPlanned: 3, expectedWork: 12, completedFully: true,
  xpEarned: 360, durationSecs: 2000,
  workoutInstanceId: "device-" + suffix,
  ledger: Array.from({ length: 12 }, (_, i) => ({
    block: "main", round: (i % 3) + 1, name: "m" + i, status: "done",
    driver: "time", plannedSecs: 30, actualSecs: 30 }))
});
store.mergeSessions([fullGreen("1"), fullGreen("2")]);
ok(store.loadSessions().length === 2, "two devices' records both survive the merge — neither is thrown away");
const settled = store.rebuildJourneyXp();
ok(settled <= 360,
   "but the day settles at one day's pay (" + settled + "), not two — it used to rebuild to 720");

/* --- 8. A BACKGROUNDED IPAD IS NOT A CHILD DOING BURPEES ------------------
   The timer runs on wall-clock deadlines and nothing listened for the page
   going away, so locking the iPad mid-hold and coming back a minute later
   handed her the whole minute as work done. */
ok(typeof engine.PAUSE_HIDDEN === "string" && engine.PAUSE_HIDDEN !== engine.PAUSE_USER,
   "backgrounding has its own pause reason, told apart from a deliberate tap");
let hiddenPause = null;
await runSession({ dayKey: "tuesday", light: "red", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (!hiddenPause && ["work", "reps"].includes(sess.phase)) {
      globalThis.document.hidden = true;
      globalThis.fireDocEvent("visibilitychange");
      hiddenPause = { paused: sess.paused, reasons: (sess.pauseReasons || []).slice() };
      globalThis.document.hidden = false;
      globalThis.fireDocEvent("visibilitychange");
    }
    if (sess.paused && sess.running) engine.resumeSession(engine.PAUSE_HIDDEN);
  }
});
ok(hiddenPause && hiddenPause.paused === true,
   "the page going away pauses the workout instead of letting the clock run on");
ok(hiddenPause.reasons.includes(engine.PAUSE_HIDDEN),
   "under the hidden reason, so coming back needs her to say Resume");

/* --- 2. STORED TEXT IS TEXT, WHEREVER IT CAME FROM -----------------------
   The wallet and the log render fields that arrive from the cloud mirror and
   from restored backups. escapeHtml existed and the grown-up screen used it
   throughout; the progress screen and the prize overlay interpolated raw. */
localStorage.clear(); store.migrate();
const nasty = `<img src=x onerror="window.__pwned=1">`;
store.saveJourney({ xp: 5000, sessionXp: 5000, pendingDraws: 0,
  prizesWon: [{ id: "p-nasty", label: nasty, icon: nasty, wonAt: Date.now(), redeemed: false }] });
const progMarkup = pscreen.progressScreen(pvm.buildProgressVM({ progressScope: "4w", logScope: "week" }));
ok(!/<img\s+src=x/i.test(progMarkup),
   "a prize label out of the cloud renders as text on the progress screen, never as markup");
ok(progMarkup.includes("&lt;img") && progMarkup.includes("&quot;"),
   "it is escaped rather than silently dropped — she still sees exactly what is stored");
/* The prize id goes into a data-arg ATTRIBUTE, which is its own escaping
   context and its own way to break out of one. */
ok(!/data-arg="[^"]*"[^>]*onerror/i.test(progMarkup),
   "and an id carrying a quote cannot climb out of the attribute it is written into");

/* --- 14. A RESUMED DAY IS ONE SESSION ON THE BOARD, NOT TWO --------------
   Every rate on the progress board was computed per RECORD, and a day trained
   in two goes writes two. So coming back to finish made the session count go
   up, the average duration go down and the completion rate fall: the
   denominator grew by one for work that was really one day's, and a parent
   reading "1 of 2 finished" was shown a number that punished her for
   finishing. */
localStorage.clear(); store.migrate();
const splitIso = new Date().toISOString();
const splitDay = (suffix, rows, done) => ({
  isoDate: splitIso.replace(/\dZ$/, suffix + "Z"), dayKey: "tuesday",
  workoutInstanceId: "one-workout", lightResult: "green",
  outcomeVersion: outcome.OUTCOME_VERSION, xpVersion: 5,
  roundsDone: done, roundsPlanned: 3, dayRoundsPlanned: 3, expectedWork: 12,
  completedFully: rows === 6, durationSecs: 900, xpEarned: done * 90,
  ledger: Array.from({ length: rows }, (_, i) => ({
    block: "main", round: 1 + (i % 3), name: "m" + suffix + i, status: "done",
    driver: "time", plannedSecs: 30, actualSecs: 30 }))
});
store.saveSession(splitDay("1", 6, 1));
store.saveSession(splitDay("2", 6, 2));
const splitVm = pvm.buildProgressVM({ progressScope: "4w", logScope: "week" });
const sessionsRow = splitVm.periodStats.rows.find(r => r.label === "Completion status");
ok(/ of 1$/.test(sessionsRow.total),
   "two sittings of one day count as one session on the board (" + sessionsRow.total + ")");
ok(/^1 session$/.test(splitVm.sessionsLabel),
   "and as one in the week summary — it used to read two");
const timeRow = splitVm.periodStats.rows.find(r => r.label === "Time");
ok(/30 min \/ session/.test(timeRow.avg),
   "with the day's whole duration as one session's average, not halved (" + timeRow.avg + ")");

/* --- 13. A FAILED SAVE OFFERS NO CONTROLS THAT CANNOT WORK ---------------
   Mood, reflection and the quiz all write through patchSession, which finds
   the row by its key — and when the save failed there is no row. They rendered
   anyway, took her taps, acknowledged them on screen and dropped every one.
   Asking a ten-year-old how it felt and then losing the answer is worse than
   not asking, and it happened exactly when she was already being told
   something had gone wrong. */
const failedVm = { ...svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null }),
                   sessionDone: true, saveFailed: true, showCompletionExtras: false,
                   showReflection: false, leveledUp: false };
const failedMarkup = sscreen.sessionScreen(failedVm);
ok(!/data-action="pickMood"/.test(failedMarkup),
   "a failed save offers no mood buttons — they had nothing to write to");
ok(!/data-action="quizPick"/.test(failedMarkup), "and no quiz, which could not have paid its XP either");
ok(!/data-action="reflectWell"/.test(failedMarkup), "and no reflection to lose");
ok(/didn't save/i.test(failedMarkup) && /grown-up/i.test(failedMarkup),
   "it says what happened and who can fix it instead");
ok(/pick this session back up/i.test(failedMarkup),
   "and that the work is still resumable — which it now is, because the progress was kept");

const okVm = { ...failedVm, saveFailed: false, showCompletionExtras: true };
ok(/data-action="pickMood"/.test(sscreen.sessionScreen(okVm)),
   "a session that DID save still asks how it felt, exactly as before");

/* --- MALFORMED ROWS ARE QUARANTINED, NOT MERGED --------------------------
   Everything merged arrives from a collection with no sign-in in front of it,
   or a JSON file picked off a disk. A row that is merely the wrong shape does
   damage without anyone being hostile: a `ledger` that is a string reaches
   every screen that iterates it, and a NaN duration poisons an average. */
localStorage.clear(); store.migrate();
const goodRow = { isoDate: new Date().toISOString(), dayKey: "monday",
                  completedFully: true, xpEarned: 100, ledger: [], durationSecs: 900 };
const badRows = [
  { ...goodRow, isoDate: "not-a-date" },
  { ...goodRow, isoDate: new Date(Date.now() - 1e7).toISOString(), ledger: "<script>" },
  { ...goodRow, isoDate: new Date(Date.now() - 2e7).toISOString(), durationSecs: "twenty" },
  { ...goodRow, isoDate: new Date(Date.now() - 3e7).toISOString(), perExercise: { 0: "x" } },
  { ...goodRow, isoDate: new Date(Date.now() - 4e7).toISOString(), dayKey: { evil: true } }
];
ok(store.mergeSessions([goodRow, ...badRows]) === 1,
   "exactly the one well-formed row is merged; the malformed ones are turned away");
ok(store.loadSessions().length === 1, "and nothing malformed reaches the log");
ok(store.loadSessions().every(r => Array.isArray(r.ledger)),
   "so every row a screen iterates really is iterable");
ok(Number.isFinite(store.rebuildJourneyXp()),
   "and the totals stay numbers rather than becoming NaN on the next boot");
ok(store.mergeCloudJourney({ kind: "journey", prizesWon: "all of them" }) === false,
   "a journey snapshot whose wallet is not a list is refused whole");
ok(store.mergeCloudJourney({ kind: "journey", qLedger: [1, 2, 3] }) === false,
   "and so is one whose quiz ledger is the wrong kind of thing");

/* --- 16. THE SAFETY GATE IS IN THE HANDLER, NOT ONLY IN THE MARKUP -------
   A severity-3 body check disables the continue button until a grown-up
   confirms. Disabling a button is a rendering decision; the invariant belongs
   in the transition that actually starts the session. */
ok(typeof rvm.mayStartFromReadiness === "function",
   "there is one function that decides whether a readiness result may start a session");
ok(rvm.mayStartFromReadiness({ severity: 3, grownupConfirmed: false }) === false,
   "severity 3 without a grown-up cannot start a session");
ok(rvm.mayStartFromReadiness({ severity: 3, grownupConfirmed: true }) === true,
   "and with one it can — the override itself is untouched");

/* --- 17. THE APP CAN BE INSTALLED AND OPENED WITH NO NETWORK --------------
   "Works fully offline" rested on the browser cache after a successful online
   load. Add to Home Screen and a fresh offline launch needs an app shell. */
ok(fs.existsSync(new URL("../manifest.webmanifest", import.meta.url)),
   "there is a web app manifest, so Add to Home Screen installs an app rather than a bookmark");
ok(fs.existsSync(new URL("../sw.js", import.meta.url)),
   "and a service worker, so a fresh launch with no network still gets the shell");
const swSrc = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
ok(/CACHE_VERSION/.test(swSrc), "the cache is versioned, so a release can retire the old one");
/* The property that matters is not the absence of a word, it is that the fetch
   handler refuses anything that is not a same-origin GET before it can reach a
   cache.put — the mirror carries body-map notes and readiness answers. */
ok(/url\.origin\s*!==\s*self\.location\.origin/.test(swSrc) && /req\.method\s*!==\s*"GET"/.test(swSrc),
   "and nothing cross-origin or non-GET reaches the cache — the mirror is never cached into a shared shell");
ok(!SHELL_LISTED_CLOUD(swSrc), "no cloud endpoint is in the precached shell list either");
function SHELL_LISTED_CLOUD(src) {
  const list = (src.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || "";
  return /https?:/i.test(list);
}


/* ============================================================
   RELEASE ACCEPTANCE — the scenarios, end to end.
   Each row of the audit's acceptance matrix that can be driven without a
   physical iPad. The device rows (backgrounding on real Safari, Bluetooth
   speech, an offline Home Screen launch) are not automatable and are checked
   by hand.
   ============================================================ */

/* --- Green and Yellow happy paths, against the light's own plan ---------- */
const greenRun = await runSession({ dayKey: "monday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => { if (sess.phase === "formcheck") engine.pickClean(); }
});
const greenRec = store.loadSessions()[0];
ok(greenRun.roundsCompleted === 3 && greenRec.roundsPlanned === 3, "Green: 3 of 3 main rounds");
ok(outcome.workoutInstances([greenRec]).length === 1, "one workout, not several");
ok(store.sessionXp(greenRec) === 360, "paying exactly one green day");
ok(store.settledTrainingXp([greenRec]) <= 360, "and settling at no more than the day's ceiling");
ok(!store.loadDayProgress("monday"), "a finished day leaves nothing to resume");

const yellowRun = await runSession({ dayKey: "monday", light: "yellow", gateUnlocked: true }, {
  onTick: (ms, sess) => { if (sess.phase === "formcheck") engine.pickClean(); }
});
ok(yellowRun.roundsCompleted === 2 && yellowRun.roundsPlanned === 2, "Yellow: 2 of 2, judged against Yellow's plan");
const yellowBlocks = new Set(yellowRun.circuits.map(c => c.block));
ok(!yellowBlocks.has("finisher") && yellowBlocks.has("swimskill") || !yellowBlocks.has("finisher"),
   "and Yellow's blocks, not Green's — the light reduces the session, not just the round count");

/* --- the streak boundary, agreed on by both screens ---------------------- */
/* A hundred rows, so 74 and 75 are exactly 74% and 75% — a twenty-row plan
   rounds 74% up to the bar and tests nothing. */
const atRatio = (ratio) => {
  const total = 100;
  const done = Math.round(total * ratio);
  return {
    isoDate: new Date().toISOString(), dayKey: util.edmontonDayKey(), lightResult: "red",
    outcomeVersion: outcome.OUTCOME_VERSION, xpVersion: 5, roundsDone: 0, roundsPlanned: 1,
    dayRoundsPlanned: 1, expectedWork: total, completedFully: false, durationSecs: 800,
    ledger: Array.from({ length: total }, (_, i) => ({
      block: i < 20 ? "warmup" : "main", round: 1, name: "x" + i,
      status: i < done ? "done" : "skipped", driver: "time", plannedSecs: 30,
      actualSecs: i < done ? 30 : 0 }))
  };
};
ok(store.outcomeOf(atRatio(0.74)).countsForStreak === false, "Red at 74% of its plan earns no streak day");
ok(store.outcomeOf(atRatio(0.75)).countsForStreak === true,
   "Red at 75% earns one — with zero complete main rounds, which is the rule and not a loophole");
ok(store.outcomeOf(atRatio(0.75)).mainRoundsDone === 0, "and no main round is invented to justify it");

localStorage.clear(); store.migrate();
store.saveSession(atRatio(0.74));
const shortText74 = JSON.stringify(tvm.buildTodayVM({ selectedDay: util.edmontonDayKey(), expanded: {}, isWide: true }));
ok(!/counts toward your streak/i.test(shortText74) && /saved/i.test(shortText74),
   "and Today says the work was saved without claiming the streak — the two screens agree");

/* --- a session ended during the round rest keeps the round it just did --- */
const restStop = await runSession({ dayKey: "tuesday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    if (sess.phase === "roundRest" && sess.roundsCompleted >= 1 && sess.running) engine.endEarly();
  }
});
ok(restStop.roundsCompleted >= 1, "a round finished before the breather is still credited when she stops in it");
ok((store.loadDayProgress("tuesday") || {}).mainRoundsCompleted >= 1,
   "and it is on disk, so coming back does not make her do it again");

/* --- Recovery leaves a half-trained training day exactly as it found it -- */
const recoveryGuard = await runSession({ dayKey: "monday", light: "recovery", gateUnlocked: true,
  seed: () => store.saveDayProgress("monday",
    { done: ["warmup"], light: "green", mainRoundsCompleted: 1, moves: { warmup: ["A-March"] }, bankedCredit: 1 })
});
const guarded = store.loadDayProgress("monday");
ok(guarded && guarded.mainRoundsCompleted === 1 && guarded.done.includes("warmup"),
   "a recovery pass does not clear the training day it shares a weekday with");
ok(recoveryGuard.roundsBanked === 0, "and banks nothing against it");
const recRec = store.loadSessions().find(r => r.sessionType === "recovery");
ok(recRec && store.outcomeOf(recRec).countsForStreak === false,
   "recovery adds no streak day");
ok(store.outcomeOf(recRec).streakFreeze === true, "it holds the existing one instead");

/* --- the exercise video link is unchanged, and is a leaving-the-app link -- */
ok(/youtube\.com/.test(data.videoSearchUrl({ name: "Dead Bug" })),
   "the video is still the YouTube search, kept by owner decision");
/* That it PAUSES the workout before she leaves is proved in test/actions.mjs,
   where the action layer and its real click listeners are driven. */


/* ============================================================
   PRIZE AMNESTY — every prize in the wallet is available again.

   Her wallet showed all thirteen prizes as used. The audit's diagnosis was
   persisted legacy data where `redeemed: true` already existed: redemption
   always wins a wallet merge (mergePrize), and it has to, because a device
   still showing a prize as available is simply behind and letting ITS copy win
   is how one prize gets spent twice. The app cannot tell which of those were
   real spends and which were the duplicate-id bug, so an adult decided: every
   redemption that happened before this ran is forgiven.
   ============================================================ */
localStorage.clear(); store.migrate();
const spentWallet = Array.from({ length: 13 }, (_, i) => ({
  id: "old-prize-" + i,
  icon: i === 4 ? "🛌" : "🎬",
  label: i === 4 ? "Stay up 20 min later" : "Family movie pick " + i,
  date: "2026-0" + (1 + (i % 8)) + "-1" + (i % 9),
  redeemed: true,
  redeemedAt: Date.now() - (i + 1) * 86400000
}));
/* A level high enough that the wallet is not trimmed for holding more prizes
   than the ladder ever earned — reconcileWallet is a separate rule and this is
   not a test of it. */
store.saveJourney({ xp: 40000, sessionXp: 40000, maxLevelSeen: 40,
                    prizesWon: spentWallet, pendingDraws: 0 });

const amnesty = store.migratePrizeAmnesty();
ok(amnesty && amnesty.restored === 13, "all thirteen spent prizes are forgiven in one pass");
const freed = store.loadJourney().prizesWon;
ok(freed.length === 13, "the wallet still holds thirteen — nothing was added or lost");
ok(freed.every(p => !p.redeemed), "and every one of them is available again");
ok(freed.every(p => !Number.isFinite(p.redeemedAt)), "with no redemption date left to re-lock them");
ok(freed.every(p => p.repairOf), "each one says which corrupted prize it replaces");
ok(freed.some(p => p.date === "2026-01-10"), "the day she EARNED a prize is hers, and is unchanged");

/* The old ids are voided for good. Without that, the next sync from her other
   device — which still holds them as redeemed — would simply put them back. */
const amnestyVoided = new Set((store.loadJourney().voidedPrizeIds || []).map(String));
ok(spentWallet.every(p => amnestyVoided.has(p.id)),
   "every corrupted id is voided, so the other device cannot re-redeem them tonight");
const staleMerge = store.mergeWalletsForTest(store.loadJourney().prizesWon, spentWallet,
                                        store.loadJourney().voidedPrizeIds);
ok(staleMerge.length === 13 && staleMerge.every(p => !p.redeemed),
   "so merging the other device's stale, all-redeemed copy leaves them available");

/* --- the swap, in her wallet and not in the draw pool -------------------- */
const swapped = freed.find(p => p.repairOf === "old-prize-4");
ok(swapped && swapped.label === "Skip a chore", "the bedtime prize now reads Skip a chore");
ok(swapped.icon === "✨", "with the icon the chore-skip uses everywhere else, not the bed");
ok(data.PRIZE_POOL.some(p => p.label === "Stay up 20 min later"),
   "and the DRAW POOL is untouched — future draws keep the bedtime prize");
ok(data.PRIZE_POOL.filter(p => /chore/i.test(p.label)).length === 1,
   "so the pool still holds exactly one chore-skip and its odds are unchanged");

/* --- it runs once, and never takes back a real spend --------------------- */
const secondPass = store.migratePrizeAmnesty();
ok(secondPass.restored === 0, "running it again forgives nothing — there is nothing left to forgive");
ok(store.loadJourney().prizesWon.length === 13, "and the wallet is untouched by the second pass");

const j2 = store.loadJourney();
j2.prizesWon = j2.prizesWon.map((p, i) => i === 0
  ? { ...p, redeemed: true, redeemedAt: Date.now() + 60000 } : p);
store.saveJourney(j2);
ok(store.migratePrizeAmnesty().restored === 0,
   "a prize she spends AFTER the amnesty stays spent — the forgiveness is dated, not permanent");
ok(store.loadJourney().prizesWon.filter(p => p.redeemed).length === 1,
   "so exactly the one she really used is still marked used");

/* --- two devices, run independently, converge -----------------------------
   Both devices run this migration on their own copy. With a random replacement
   id each would mint a DIFFERENT prize for the same original, the union would
   carry twenty-six, and reconcileWallet would then trim thirteen of them at
   random. The replacement id is derived from the original so both devices
   produce the same one. */
localStorage.clear(); store.migrate();
store.saveJourney({ xp: 40000, sessionXp: 40000, maxLevelSeen: 40,
                    prizesWon: spentWallet.map(p => ({ ...p })), pendingDraws: 0 });
store.migratePrizeAmnesty();
const deviceA = store.loadJourney();

localStorage.clear(); store.migrate();
store.saveJourney({ xp: 40000, sessionXp: 40000, maxLevelSeen: 40,
                    prizesWon: spentWallet.map(p => ({ ...p })), pendingDraws: 0 });
store.migratePrizeAmnesty();
const deviceB = store.loadJourney();

const converged = store.mergeWalletsForTest(deviceA.prizesWon, deviceB.prizesWon,
  [...(deviceA.voidedPrizeIds || []), ...(deviceB.voidedPrizeIds || [])]);
ok(converged.length === 13,
   "two devices that ran the amnesty separately still hold thirteen prizes, not twenty-six");
ok(converged.every(p => !p.redeemed), "and all of them are available on both");

/* --- it is not silent ---------------------------------------------------- */
ok(/13 prize/i.test(store.loadJourney().prizeAmnesty.note || ""),
   "the wallet says what was done to it, so a grown-up is not left to notice");

/* --- the note reaches the screen a grown-up actually reads ---------------- */
localStorage.clear(); store.migrate();
store.saveJourney({ xp: 40000, sessionXp: 40000, maxLevelSeen: 40, pendingDraws: 0,
                    prizesWon: spentWallet.map(p => ({ ...p })) });
store.migratePrizeAmnesty();
const noteMarkup = gscreen.grownupScreen(gvm.buildGrownupVM({ grownupTab: "settings", scope: "all" }));
ok(/made available again/i.test(noteMarkup),
   "the Grown-up Zone says the wallet was repaired and when — the amnesty runs itself, so it must say so");

/* --- a finished day clears even if the plan shifted under it --------------
   nothingLeftOwed() re-derives the day's blocks at finalize time. If the
   valgus gate unlocks mid-session that list can name a block that was never
   offered, and the record would then never clear — a resume prompt for a day
   she finished. A saved outcome of `complete` settles it on its own. */
const gateShift = await runSession({ dayKey: "monday", light: "green", gateUnlocked: true }, {
  onTick: (ms, sess) => {
    if (sess.phase === "formcheck") { engine.pickClean(); return; }
    // Open the gate mid-run, which is what changes the assembled block list.
    store.saveGate({ unlocked: true, cleanWeeks: [] });
  }
});
ok(gateShift.savedOutcome && gateShift.savedOutcome.state === "complete",
   "the day really did finish");
ok(!store.loadDayProgress("monday"),
   "so its progress is cleared, even though the plan it is compared against moved underneath it");

/* --- the draw hold survives a page load ----------------------------------
   `_everSynced` was a module-level flag with no persistence, so it reset on
   every load: a COLD offline launch had the guard switched off entirely, which
   is the one case it exists for. */
localStorage.clear(); store.migrate();
ok(store.xpIsPending() === false, "a device that has never reached the mirror waits for nothing");
store.noteSyncResult(true);
ok(Number.isFinite((store.loadJourney() || {}).lastSyncAt),
   "a successful sync is remembered on the journey, not in a variable that dies on reload");
store.setOnlineForTest(false);
ok(store.xpIsPending() === true, "so an offline launch after a real sync does hold the total as pending");
const jStale = store.loadJourney();
jStale.lastSyncAt = Date.now() - 30 * 86400000;
store.saveJourney(jStale);
ok(store.xpIsPending() === false,
   "but a mirror nobody has reached for a month stops blocking prizes — a dead project must not lock the wallet forever");
store.setOnlineForTest(true);

console.log(`\n✓ smoke tests passed (${passed} assertions)\n`);
