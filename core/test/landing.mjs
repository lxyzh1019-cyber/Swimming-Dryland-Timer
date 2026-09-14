/* THE LANDING RULE — on in the app that has one, silent in the app that
   does not. Both are asserted here, from the same file, against whichever
   app's content this core is running under.

   A sport with a landing rule grades every gated jump: clean and frozen, or a
   bit wobbly. Two wobbly in a row drop the highest remaining main round, never
   the one in progress, and the day's plan is lowered with it — so XP, the
   finish screen and a same-day resume all agree on what the day asked for. */
import { engine, store, data, sport, runSession } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };

/* --- the rule itself, pure --- */
ok(engine.tierDroppedRounds(3, 2, 1) === 2, "two wobbly in a row drops a round");
ok(engine.tierDroppedRounds(3, 1, 1) === 3, "one wobbly does not");
ok(engine.tierDroppedRounds(2, 2, 2) === 2, "never below the round in progress");
ok(engine.tierDroppedRounds(3, 2, 3) === 3, "nor when the last round is the one in progress");

const gatedDay = Object.keys(data.DAYS).find(k =>
  ((data.DAYS[k].blocks || {}).main || []).some(e => e.gate === "valgus"));
ok(gatedDay, "the plan has a day with a gated jump in its main block: " + gatedDay);
const gatedMoves = data.DAYS[gatedDay].blocks.main.filter(e => e.gate === "valgus").map(e => e.name);

let landingPrompts = 0, formPrompts = 0;
const grade = (verdict) => ({
  onTick: (ms, sess) => {
    if (sess.phase !== "formcheck" || !sess.pendingCleanCheck) return;
    if (sess.checkKind === "landing") { landingPrompts++; verdict === "wobbly" ? engine.pickWobbly() : engine.pickClean(); }
    else { formPrompts++; engine.pickClean(); }
  }
});

if (sport.FEATURES.landingCheck) {
  /* --- every gated jump is graded, and grades are kept per move --- */
  const clean = await runSession({ dayKey: gatedDay, light: "green", gateUnlocked: true }, grade("clean"));
  ok(landingPrompts === gatedMoves.length * 3, "every gated jump in every round asked for a landing grade (" + landingPrompts + " for " + gatedMoves.length + " moves × 3 rounds)");
  ok(gatedMoves.every(m => (clean.landings[m] || {}).clean === 3), "and each move remembers its three clean landings");
  ok(clean.tierDropped === 0 && clean.savedEntry.roundsDone === 3, "clean landings drop nothing: three rounds trained");
  ok(clean.savedEntry.tierDropped === 0 && clean.savedEntry.landings[gatedMoves[0]].clean === 3, "the record carries the landings and the drop count");

  /* --- two wobbly in a row drops a round, and the day's plan drops with it --- */
  landingPrompts = 0;
  const wobbly = await runSession({ dayKey: gatedDay, light: "green", gateUnlocked: true }, grade("wobbly"));
  ok(wobbly.tierDropped >= 1, "two wobbly landings in a row dropped a round");
  const e = wobbly.savedEntry;
  ok(e.roundsDone === e.roundsPlanned && e.roundsPlanned < 3, "she trained every round the shortened plan asked for (" + e.roundsDone + " of " + e.roundsPlanned + ")");
  ok(e.dayRoundsPlanned === e.roundsPlanned, "and the DAY asks for the same number, so a resume cannot ask the round back");
  ok(store.outcomeOf(e).state === "complete", "the shortened day reads complete, not partial: " + store.outcomeOf(e).state);
  ok(e.xpEarned === store.SESSION_XP[e.roundsDone], "and pays the flat rate for the rounds actually trained — no more, no less (" + e.xpEarned + ")");
  ok(store.loadEvents().some(ev => ev.type === "tier_drop"), "the drop is logged for the grown-up");
} else {
  /* --- no landing rule: a gated jump is an ordinary move --- */
  await runSession({ dayKey: gatedDay, light: "green", gateUnlocked: true }, grade("wobbly"));
  ok(landingPrompts === 0, "an app without a landing rule never asks for a landing grade");
  const j = engine.sess;
  ok(!("landings" in (j.savedEntry || {})) && !("tierDropped" in (j.savedEntry || {})), "and its session rows carry no landing fields");
}

console.log("✓ landing rule passed (" + passed + " assertions)");
