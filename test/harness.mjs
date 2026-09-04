/* ============================================================
   Shared test harness — the browser globals the ES modules touch at load,
   a fake clock, and one function that runs a whole session on it.

   Kept separate from the suites so an invariant test does not have to
   re-stub a browser to ask a question about a number.
   ============================================================ */

globalThis.localStorage = (() => { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)),
  removeItem: k => m.delete(k), clear: () => m.clear() }; })();

/* An utterance that starts and ends IMMEDIATELY — the real behaviour of a
   device with no installed voices. */
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.window = {
  SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
  speechSynthesis: { getVoices: () => [], cancel() {}, speaking: false, pending: false,
    set onvoiceschanged(f) {},
    speak(u) { if (u && u.onstart) u.onstart(); if (u && u.onend) u.onend(); } },
  AudioContext: function () { this.state = "running"; this.currentTime = 0;
    this.createOscillator = () => ({ type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} });
    this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
    this.destination = {}; this.resume = () => {}; },
  innerWidth: 1200, innerHeight: 800,
  addEventListener() {}, removeEventListener() {}, fetch: () => Promise.reject(new Error("no net"))
};
const fakeEl = () => ({
  innerHTML: "", scrollIntoView() {}, addEventListener() {}, removeEventListener() {},
  contains: () => true, closest: () => null, insertAdjacentHTML() {},
  querySelector: () => null, querySelectorAll: () => [],
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
  style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, value: ""
});
globalThis.document = {
  hidden: false, visibilityState: "visible",
  getElementById: () => fakeEl(), createElement: () => fakeEl(),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: fakeEl(), documentElement: fakeEl()
};
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });

const base = new URL("../js/", import.meta.url).href;
export const util    = await import(base + "util.js");
export const data    = await import(base + "data.js");
export const store   = await import(base + "store.js");
export const engine  = await import(base + "engine.js");
export const outcome = await import(base + "outcome.js");
export const svm     = await import(base + "vm/session.js");
export const tvm     = await import(base + "vm/today.js");
export const pvm     = await import(base + "vm/progress.js");
export const gvm     = await import(base + "vm/grownup.js");
export const gscreen = await import(base + "screens/grownup.js");
export const pscreen = await import(base + "screens/progress.js");

const realNow = Date.now;
const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
const realSetTimeout = globalThis.setTimeout,   realClearTimeout = globalThis.clearTimeout;

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
        await new Promise(r => process.nextTick(r));
      }
    },
    restore() {
      Date.now = realNow;
      globalThis.setInterval = realSetInterval; globalThis.clearInterval = realClearInterval;
      globalThis.setTimeout = realSetTimeout;   globalThis.clearTimeout = realClearTimeout;
    }
  };
}

/* Run a session to completion (or until the script stops it) on the fake clock.
   `wipe: false` keeps whatever is already on the device, which is what a resume
   needs — the day's progress record from the sitting before it.

   Returns a SNAPSHOT. `engine.sess` is a module-level singleton, so returning it
   directly makes two runs the same object, and a test that then builds "two
   fragments" out of it is comparing one record with itself. */
export async function runSession(opts, script = {}) {
  if (opts.wipe !== false) { localStorage.clear(); store.migrate(); }
  store.updateSettings({ coachVoiceOn: false, exerciseRestSeconds: 3,
    roundRestSeconds: 10, sectionRestSeconds: 5, cloudMirror: false });
  if (opts.gateUnlocked) store.saveGate({ unlocked: true, cleanWeeks: [] });
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
  return { ...engine.sess };
}

/* Answer every form spot-check so a run reaches its end. */
export const answerChecks = () => ({
  onTick: (ms, sess) => { if (sess.phase === "formcheck") engine.pickClean(); }
});
