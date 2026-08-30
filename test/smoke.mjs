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
const tscreen = await import(base + "screens/today.js");
const effort  = await import(base + "effort.js");
const pvm     = await import(base + "vm/progress.js");
const pscreen = await import(base + "screens/progress.js");
const rscreen = await import(base + "screens/readiness.js");
const overlays = await import(base + "screens/overlays.js");

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
ok(/Try-It/.test(tryVM.dayView.ctaLabel) || tryVM.dayView.ctaAction === "goSessionPractice",
   "and the start button itself says what it will launch");

engine.sess.practice = true;
ok(/TRY-IT RUN/.test(sscreen.sessionScreen(svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null }))),
   "a band stands through the whole run, not just the finish screen");
engine.sess.practice = false;
ok(!/TRY-IT RUN/.test(sscreen.sessionScreen(svm.buildSessionVM({ inSession: true, isWide: true, detailOverlay: false, detailEx: null }))),
   "and never appears on a real run");

/* Pain is the one thing that escapes the sandbox: a stop she reported is real
   whether or not the run counted, and it used to vanish before reaching the
   grown-up. It carries no training credit with it. */
localStorage.clear();
store.migrate();
store.saveSession({ app: "swimming", practice: true, dayKey: "monday", dayTitle: "Mon",
                    isoDate: new Date().toISOString(), durationSecs: 300, sessionType: "try-it",
                    pain: true, endedEarly: true, completedFully: false, safetyOnly: true });
const painRow = store.loadSessions()[0];
ok(painRow && painRow.pain === true, "a pain stop during try-it is recorded for Safety & Flags");
ok(store.countsAsTrained(painRow) === false, "but it is not a trained day");
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

console.log(`\n✓ smoke tests passed (${passed} assertions)\n`);
