/* ============================================================
   INTEGRITY — the XP total, the prize wallet and a restore must
   agree with themselves across boots, devices and midnight.
   Every case here is a defect the 2026-09 audit found in the code.
   ============================================================ */
import { store, outcome, util } from "./harness.mjs";
import { claimPrize } from "../screens/overlays.js";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const mainRound = (r) => Array.from({ length: 5 }, (_, i) =>
  ({ block: "main", round: r, name: "Move " + (i + 1), status: "done", credit: 1, actualSecs: 30, plannedSecs: 30 }));
const fullDay = (isoDate, extra = {}) => ({ app: "swimming", dayKey: "monday", isoDate,
  xpVersion: store.XP_VERSION, outcomeVersion: outcome.OUTCOME_VERSION, sessionType: "main",
  roundsDone: 3, roundsPlanned: 3, dayRoundsPlanned: 3, completedFully: true, xpEarned: 360,
  expectedWork: 15, ledger: [...mainRound(1), ...mainRound(2), ...mainRound(3)], ...extra });

/* --- 1. A capped date does not pay again on the next boot --- */
localStorage.clear(); store.migrate();
// Two devices offline on the same date, both stamped a full day: settled = 360.
store.saveSession(fullDay("2026-03-02T17:00:00.000Z", { workoutInstanceId: "a" }));
store.saveSession(fullDay("2026-03-02T18:30:00.000Z", { workoutInstanceId: "b" }));
store.rebuildJourneyXp();
const xp1 = store.loadJourney().xp, lvl1 = store.loadJourney().maxLevelSeen || 1;
ok(xp1 === 360, "two rows on one date settle to one day: " + xp1);
const added = store.reconcileJourneyWithSessions();
ok(added === 0, "reconcile after rebuild adds nothing (was re-granting the capped 360 every boot): " + added);
store.migrate();   // a second boot
ok(store.loadJourney().xp === 360, "a second boot leaves the total alone: " + store.loadJourney().xp);
ok((store.loadJourney().maxLevelSeen || 1) === lvl1, "the level high-water does not ratchet");
ok(store.pendingDrawCount() === 0, "no phantom prize draw is minted");

/* --- 2. A claim while the day is unsettled waits, and says so --- */
localStorage.clear(); store.migrate();
store.updateSettings({ cloudMirror: true });
store.setOnlineForTest(true);
store.saveSession(fullDay("2026-03-02T17:00:00.000Z"));
store.saveSession(fullDay("2026-03-03T17:00:00.000Z"));
store.rebuildJourneyXp();
{ const j = store.loadJourney(); j.lastSyncAt = Date.now(); store.saveJourney(j); }
store.resetSyncStateForTest();               // a fresh page load: the restore has not answered
ok(store.pendingDrawCount() === 1, "a level-up draw is owed");
ok(store.xpIsPending(), "before the boot restore answers, the total is unsettled");
const pd = { cards: [{ icon: "🎁", label: "A" }, { icon: "🎁", label: "B" }, { icon: "🎁", label: "C" }], picked: 0 };
const r = claimPrize(pd);
ok(r && r.waiting === true && pd.waiting === true && !pd.claimed, "the claim reports that it is waiting");
ok(store.loadJourney().prizesWon.length === 0, "and the wallet is untouched");
ok(!store.loadEvents().some(e => e.type === "prize_won"), "and no win is logged");
store.noteSyncResult(true);                  // the mirror answered
const r2 = claimPrize(pd);
ok(r2 && r2.prizesWon && r2.prizesWon.length === 1 && pd.claimed && !pd.waiting, "once settled the same draw claims");
ok(store.loadEvents().some(e => e.type === "prize_won"), "and the win is logged once");
store.setOnlineForTest(null);

/* --- 3. A workout that crosses midnight shares one XP budget --- */
localStorage.clear(); store.migrate();
const first = fullDay("2026-03-03T06:40:00.000Z", { dayIso: "2026-03-02", roundsDone: 2, dayRoundsPlanned: 3, ledger: [...mainRound(1), ...mainRound(2)] });
// 23:40 Edmonton on the 2nd
ok(store.dayXpKey(first) === "2026-03-02", "the budget key follows the workout's start date");
const paid1 = store.claimSessionXp(first);
store.saveSession({ ...first, xpEarned: paid1 });
const resume = fullDay("2026-03-03T07:10:00.000Z", { dayIso: "2026-03-02", roundsDone: 1, bankedRounds: 2, dayRoundsPlanned: 3, ledger: mainRound(3) });
const paid2 = store.claimSessionXp(resume);
ok(paid1 + paid2 <= 360, "the two sittings together cannot exceed one day: " + paid1 + " + " + paid2);
ok(paid1 + paid2 === 360, "and together they earn exactly the day: " + (paid1 + paid2));
const legacy = fullDay("2026-03-05T06:40:00.000Z");
ok(store.dayXpKey(legacy) === util.edmontonISO(legacy.isoDate), "a row without the field keys on its saved date");

/* --- 4. Restore onto a device that already has learning keeps both --- */
localStorage.clear(); store.migrate();
store.saveSession(fullDay("2026-03-01T17:00:00.000Z"));
store.payQuizQuestion(store.quizQuestionKey("Superman", "cue"), true);
store.payQuizQuestion(store.quizQuestionKey("Superman", "fix"), true);
store.rebuildJourneyXp();
const backup = store.exportProfileData();
const backupXp = store.loadJourney().xp;
ok(backup.profiles && backup.profiles.list.length >= 1, "the athlete registry rides on the backup");

localStorage.clear(); store.migrate();
store.saveSession(fullDay("2026-03-08T17:00:00.000Z"));
store.payQuizQuestion(store.quizQuestionKey("Dead Bug", "cue"), true);   // this device's own learning
store.rebuildJourneyXp();
const localOnlyXp = store.loadJourney().xp;
store.importProfileData(backup, { force: true });
const led = store.loadQuiz().qLedger;
ok(led[store.quizQuestionKey("Superman", "cue")] && led[store.quizQuestionKey("Superman", "cue")].mastered, "the backup's mastery is merged in");
ok(led[store.quizQuestionKey("Dead Bug", "cue")] && led[store.quizQuestionKey("Dead Bug", "cue")].mastered, "and this device's own mastery survives");
const afterRebuild = store.rebuildJourneyXp();
ok(afterRebuild > localOnlyXp && afterRebuild >= backupXp, "the XP the backup's learning justified survives a rebuild: " + afterRebuild);

/* --- 5. A second athlete's registry entry comes back with her backup --- */
localStorage.clear(); store.migrate();
const foreign = { ...backup, profile: { id: "jenn-ab12", name: "Jenn" }, profiles: { list: [{ id: "jenn-ab12", name: "Jenn" }] } };
store.importProfileData(foreign, { force: true });
ok(store.profileList().some(p => p.id === "jenn-ab12" && p.name === "Jenn"), "an unknown athlete id is added to the registry");
ok(store.importProfileData(foreign, { force: true }) && store.profileList().filter(p => p.id === "jenn-ab12").length === 1, "and never twice");

/* --- 6. The amnesty relabel corrects old prizes only --- */
localStorage.clear(); store.migrate();
{ const j = store.loadJourney();
  j.prizesWon = [
    { id: "old-1", icon: "🌙", label: "Stay up 20 min later", date: "2026-01-05", redeemed: false },
    { id: "new-1", icon: "🌙", label: "Stay up 20 min later", date: "2099-01-05", redeemed: false }
  ];
  store.saveJourney(j); }
store.migratePrizeAmnesty(Date.parse("2026-06-01T00:00:00Z"));
const labels = Object.fromEntries(store.loadJourney().prizesWon.map(p => [p.id, p.label]));
ok(labels["old-1"] === "Skip a chore", "a prize earned before the amnesty is relabelled");
ok(labels["new-1"] === "Stay up 20 min later", "a prize drawn after it keeps the label the pool offers");

/* --- 7. A patch whose record is gone lands nowhere --- */
localStorage.clear(); store.migrate();
store.saveSession(fullDay("2026-03-01T17:00:00.000Z", { mood: null }));
ok(store.patchSession("2099-01-01T00:00:00.000Z|monday", { mood: "tired" }) === false, "an unknown key is refused");
ok(store.loadSessions()[0].mood === null, "and the last row is not patched by accident");

console.log("✓ integrity passed (" + passed + " assertions)");
