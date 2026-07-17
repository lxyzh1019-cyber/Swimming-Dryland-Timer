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
globalThis.window = {
  speechSynthesis: { getVoices: () => [], speak() {}, cancel() {}, speaking: false, pending: false, set onvoiceschanged(f) {} },
  AudioContext: function () { this.state = "running"; this.currentTime = 0;
    this.createOscillator = () => ({ type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} });
    this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
    this.destination = {}; this.resume = () => {}; },
  innerWidth: 1200, innerHeight: 800, addEventListener() {}, fetch: () => Promise.reject(new Error("no net"))
};
globalThis.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };

const base = new URL("../js/", import.meta.url).href;
const util   = await import(base + "util.js");
const data   = await import(base + "data.js");
const store  = await import(base + "store.js");
const engine = await import(base + "engine.js");
const rvm    = await import(base + "vm/readiness.js");
const svm    = await import(base + "vm/session.js");
const tvm    = await import(base + "vm/today.js");
const sscreen = await import(base + "screens/session.js");
const rscreen = await import(base + "screens/readiness.js");

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

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

/* --- XP --- */
ok(store.xpForSession({ perExercise: [1,2,3,4,5,6] }) === 100, "6 moves = 100 XP");
ok(store.xpForSession({ sessionType: "spa" }) === 0, "spa earns no XP");

/* --- defaults --- */
ok(store.DEFAULT_SETTINGS.voiceStyle === "encouraging", "default voice is process-praise");
ok(store.DEFAULT_SETTINGS.cloudMirror === true, "cloudMirror default on");

/* --- prize pool defaults avoid food / screen-time --- */
const prizeText = data.PRIZE_POOL.map(p => p.label.toLowerCase()).join("|");
ok(!/dinner|dessert|ice ?cream|ipad|screen/.test(prizeText), "no food/screen default prizes");

/* --- traffic-light colour survives to the CTA --- */
ok(data.LIGHT_META.red.btnColor !== data.LIGHT_META.green.btnColor, "red CTA differs from green");
ok(data.LIGHT_META.green.emoji === "🟢", "unified circle light icons");

/* --- readiness scoring --- */
const scored = rvm.newReadinessFlow("monday", false);
rvm.answerQuestion(scored, "q_pain", "yes");
["q_sleep", "q_light", "q_ready"].forEach(q => rvm.answerQuestion(scored, q, "yes"));
ok(scored.light === "green", "all-good readiness → green");

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

/* --- view-models + screens render to strings without throwing --- */
const state = { selectedDay: null, expanded: {}, practiceMode: false, nav: "today", weather: null, isWide: true, detailEx: null, detailOverlay: false };
ok(typeof tvm.buildTodayVM(state).dayView === "object", "today VM builds");
ok(typeof sscreen.sessionScreen(svm.buildSessionVM(state)) === "string", "session screen renders");

console.log(`\n✓ smoke tests passed (${passed} assertions)\n`);
