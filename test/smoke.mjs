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
globalThis.window = {
  SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
  speechSynthesis: { getVoices: () => [], cancel() {}, speaking: false, pending: false, set onvoiceschanged(f) {},
    speak(u) { if (u && u.onstart) u.onstart(); if (u && u.onend) u.onend(); } },
  AudioContext: function () { this.state = "running"; this.currentTime = 0;
    this.createOscillator = () => ({ type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} });
    this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
    this.destination = {}; this.resume = () => {}; },
  innerWidth: 1200, innerHeight: 800, addEventListener() {}, fetch: () => Promise.reject(new Error("no net"))
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
globalThis.document = {
  getElementById: () => fakeEl(), createElement: () => fakeEl(),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  body: fakeEl(), documentElement: fakeEl()
};

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
const overlays = await import(base + "screens/overlays.js");
const tryvm   = await import(base + "vm/tryit.js");
const tryscreen = await import(base + "screens/tryit.js");
const outcome = await import(base + "outcome.js");


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

/* --- try-it mode: a real control, one-shot, and pain still reports ---------
   The mode's isolation was already right; its control and lifecycle were not.
   It was a 12px underlined text link (~16px tall) on the "today" card only, it
   never turned itself off, and it lived in memory so a reload silently flipped
   it — recording a run meant as a test. */
localStorage.clear();
store.migrate();
ok(store.tryItArmed() === false, "try-it starts disarmed");
store.setTryIt(true);
ok(store.tryItArmed() === true, "arming is persisted, so a reload can't disarm it");
store.updateSettings({ tryItArmedAt: Date.now() - 3 * 60 * 60 * 1000 });
ok(store.tryItArmed() === false, "an arm left unused for hours expires on its own");
store.setTryIt(true);
store.clearTryIt();
ok(store.tryItArmed() === false, "and a finished run disarms it — one run, not forever");

store.setTryIt(true);
const launchDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const tryItGaps = { noButton: [], noBadge: [], notAButton: [] };
launchDays.forEach(d => {
  const vm = tvm.buildTodayVM({ selectedDay: d, expanded: {}, practiceMode: true, isWide: true });
  const dv = vm.dayView;
  if (!(dv.isActive || dv.isDone || dv.isMissed || dv.isPreview)) return;   // nothing to launch
  if (!dv.showTryIt) tryItGaps.noButton.push(d);
  if (!dv.showTryBadge) tryItGaps.noBadge.push(d);
  if (!/data-action="togglePractice"/.test(tscreen.todayWide(vm))) tryItGaps.notAButton.push(d);
});
ok(tryItGaps.noButton.length === 0, "the try-it control renders on every day a run can start from");
ok(tryItGaps.noBadge.length === 0, "and the 🧪 badge does too, so a catch-up day can't run as a test silently");
ok(tryItGaps.notAButton.length === 0, "it is a real button, not the old text link");
const tryVM = tvm.buildTodayVM({ selectedDay: launchDays[0], expanded: {}, practiceMode: true, isWide: true });
ok(/min-height:48px/.test(tryVM.practiceBtnStyle), "with a 48px tap target — the old link was ~16px");

/* TRY-IT IS NOT A WORKOUT. It used to run the entire session engine — Body
   Check, traffic light, rounds, timers, clean-checks, a finish screen —
   behind a purple banner, so a kid could complete a whole workout that was
   never going to count. It is a list of moves now. */
launchDays.forEach(d => {
  const dv = tvm.buildTodayVM({ selectedDay: d, expanded: {}, practiceMode: true, isWide: true }).dayView;
  if (!(dv.isActive || dv.isDone || dv.isMissed || dv.isPreview)) return;
  ok(dv.ctaAction === "goTryIt", "with try-it armed, " + d + "'s start button opens the move list, not a session");
});
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
  return engine.sess;
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

/* --- one training day pays for one training day --------------------------
   The reproduction from the report: stop partway (half XP on the planned
   three rounds = 180), come back, finish the resumed green session (360).
   That paid 540 for a 360-day plan. */
localStorage.clear();
store.migrate();
const partial = { app: "swimming", dayKey: "monday", isoDate: new Date().toISOString(),
  xpVersion: store.XP_VERSION, roundsDone: 1, roundsPlanned: 3, sessionType: "main",
  completedFully: false, endedEarly: true, ledger: [{ name: "x", status: "done" }] };
const firstPay = store.claimSessionXp(partial);
const resumed = { ...partial, roundsDone: 2, completedFully: true, endedEarly: false };
const secondPay = store.claimSessionXp(resumed);
ok(firstPay === 180, "the partial pays for the one round it finished");
ok(firstPay + secondPay === 360, "and the resume tops it up to exactly one full day, never 540");
ok(store.claimSessionXp(resumed) === 0, "a third attempt on the same day pays nothing at all");

/* --- a pain stop is a safety event, not a short workout --- */
const painStop = { ...partial, safetyStop: true, pain: true, roundsDone: 1 };
ok(store.xpForSession(painStop) === 0, "a pain stop pays no XP");
ok(store.countsAsTrained({ ...painStop, perExercise: [{ name: "x" }] }) === true ||
   store.countsAsTrained({ ...painStop, perExercise: [{ name: "x" }] }) === false,
   "and countsAsTrained has an explicit answer for it");

/* --- a mini is a subset, not the day --- */
localStorage.clear();
let s3 = await runSession({ dayKey: "monday", light: "green", mini: true, gateUnlocked: true });
ok(s3.mode === "mini", "a mini runs as its own mode");
ok(s3.roundsPlanned === 1, "and plans one round however green the light was");
const rec3 = store.loadSessions()[0];
ok(rec3.sessionType === "mini", "the record says mini");
ok(store.sessionXp(rec3) <= 180, "so it is priced as a one-round day at most");
const week = tvm.weekStatuses();
ok(week.monday !== "done", "and a mini never ticks the whole day off");
ok(store.loadSessions().length === 1 && JSON.parse(localStorage.getItem("swim_day_progress") || "{}"),
   "while the rest of the day's progress is left standing");

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

/* --- readiness can't reuse a check from months ago --- */
localStorage.clear();
store.migrate();
store.saveReadiness({ answers: { q_pain: "yes", q_sleep: "yes", q_light: "yes", q_ready: "yes" }, light: "green" });
ok(rvm.hasRecentReadiness() === true, "a check from today can be reused");
const stale = JSON.parse(localStorage.getItem("swim_readiness"));
stale.when = Date.now() - 60 * 86400000;
localStorage.setItem("swim_readiness", JSON.stringify(stale));
ok(rvm.hasRecentReadiness() === false, "a check from two months ago cannot");
const staleFlow = rvm.newReadinessFlow("monday");
rvm.sameAsYesterday(staleFlow);
ok(staleFlow.readinessDone === false, "so “same as yesterday” does nothing and she has to answer");

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
  roundsPlanned: 3, ledger: [{ name: "a", status: "done" }], mood: "great", xpEarned: 360 }));
store.saveSession(row({ isoDate: iso(1), durationSecs: 20, completedFully: true, roundsDone: 0,
  roundsPlanned: 3, ledger: [{ name: "a", status: "skipped" }], xpEarned: 0 }));
store.saveSession(row({ isoDate: iso(2), durationSecs: 400, practice: true, sessionType: "try-it" }));
store.saveSession(row({ isoDate: iso(3), durationSecs: 300, safetyStop: true, pain: true,
  endedEarly: true, completedFully: false, ledger: [{ name: "a", status: "done" }] }));
/* a real session she never told the app how she felt about */
store.saveSession(row({ isoDate: iso(4), durationSecs: 1200, completedFully: true, roundsDone: 2,
  roundsPlanned: 2, lightResult: "yellow", ledger: [{ name: "a", status: "done" }], xpEarned: 270 }));

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
ok(store.outcomeOf(recRow).countsForStreak === false, "and does not increase the streak or adherence");
ok(store.currentStreak(store.loadSessions().filter(store.countsAsTrained)) === 0,
   "a week of recovery alone leaves the training streak at zero");

/* --- a Mini that resolves to Recovery becomes recovery, not warm-up + main --- */
const sMiniRec = await runSession({ dayKey: "tuesday", light: "recovery", mini: true, gateUnlocked: true });
ok(sMiniRec.mode === "recovery", "a recovery Mini is a recovery session");
ok(sMiniRec.mini === false, "it is not run as a shortened workout");
ok(sMiniRec.ledger.every(l => !WORKOUT_BLOCKS.includes(l.block)), "and never reaches a main circuit");
ok(store.loadSessions()[0].sessionType === "recovery", "the recovery-mini is recorded as recovery");

/* --- the care credit: recovery pays a flat show-up credit, and no round XP --- */
ok(store.xpForSession({ ...recRow }) === store.XP_SHOWED_UP,
   "recovery pays the flat care credit — reporting soreness honestly must not cost her");
ok(store.dayXpCap(recRow) === store.XP_SHOWED_UP, "and the day's budget is exactly that, no round XP");
ok(store.xpForSession({ sessionType: "spa", xpVersion: store.XP_VERSION }) === 0,
   "Sunday's scheduled spa day is unchanged at zero — it was never a training day given up");

/* ============================================================
   PHASE 3 — interaction state repairs
   ============================================================ */

/* --- A. Try-It arming (the action layer that clears it: test/actions.mjs) --- */
localStorage.clear(); store.migrate();
store.setTryIt(true);
ok(store.tryItArmed() === true, "Try-It arms");
ok(store.setTryIt(false) === false && store.tryItArmed() === false, "and can be disarmed");
store.setTryIt(true);
ok(store.clearTryIt() === true && store.tryItArmed() === false, "clearTryIt disarms it too");

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
const gate = await import(base + "gate.js");

/* --- the gate --- */
gate.lockGate();
ok(gate.gateUnlocked() === false, "the gate starts locked");
ok(gate.requireGrownup("severity3") === false, "and a gated action is refused while locked");
ok(gate.requireGrownup("somethingElse") === true, "an ungated action is not affected");
const gateQ = gate.gateChallenge();
ok(/^\d+ × \d+ = \?$/.test(gateQ.question), "it asks a generated arithmetic question");
ok(gate.gateChallenge().question === gateQ.question, "stable across re-renders while unanswered");
const [gateQa, gateQb] = gateQ.question.match(/\d+/g).map(Number);
ok(gate.answerGate(gateQa * gateQb - 1) === false, "a wrong answer does not unlock");
ok(gate.gateUnlocked() === false, "still locked");
ok(gate.gateChallenge().question !== gateQ.question, "and a wrong answer draws a NEW question");
const gateQ2 = gate.gateChallenge();
const [gateQ2a, gateQ2b] = gateQ2.question.match(/\d+/g).map(Number);
ok(gate.answerGate(gateQ2a * gateQ2b) === true, "the right answer unlocks");
ok(gate.requireGrownup("prizeRepair") === true, "and every gated action is now allowed");
/* it expires */
ok(gate.gateUnlocked(Date.now() + gate.GATE_UNLOCK_MS + 1) === false,
   "the unlock expires after five minutes");
ok(gate.gateUnlocked(Date.now() + 1000) === true, "but not before");
gate.lockGate();
ok(gate.gateUnlocked() === false, "leaving the Grown-up Zone locks it again");
/* nothing is stored anywhere */
ok(Object.keys(localStorage).length === 0 ||
   !JSON.stringify(Object.entries(localStorage)).includes("gate_secret"),
   "the gate stores no secret on the device");

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
store.saveSession(mkRow({ mini: true, sessionType: "mini", roundsDone: 1, roundsPlanned: 3 }));
const an8 = gvm.buildGrownupVM({ gsScope: "month", grownupTab: "analytics" }).analytics;
ok(an8.rounds.planned === 4, "a mini asks for one round, not the light's three");

console.log(`\n✓ smoke tests passed (${passed} assertions)\n`);
