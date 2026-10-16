/* "STILL TIGHT?" — the recovery check after every move (Oct 2026).

   On a recovery session (Sunday, or a weekday the Body Check turned into
   Recovery) every move she did is followed by "Is your <area> still tight?".
   "Still tight" runs the move again, at most TIGHT_MAX_EXTRA extra rounds; a
   zone she marked sore in today's Body Check gets no extra round. Extra rounds
   are care, not owed work: no ledger row, no change to the day's completion.
   The answers go on the session record (`tightness`) and into the Grown-up
   Zone's "Still tight after recovery" card. Nothing here names a move, so it
   holds for both apps. Run by `npm test`. */
import { engine, store, data, svm, sscreen, gvm, gscreen, rvm, tvm, tscreen, runSession } from "./harness.mjs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const same = (a, b, msg) => ok(a === b, msg + " (got " + JSON.stringify(a) + ", wanted " + JSON.stringify(b) + ")");

const menu = engine.assembleRecoveryCircuit("sunday")[0].exercises;
const MOVES = menu.length;

/* Answer every card the same way; count what the card asked. */
function answering(answer, seen = []) {
  return { onTick: (ms, s) => {
    if (s.phase === "formcheck") engine.pickClean();
    if (s.phase === "repcheck") engine.answerRepCheck("all");
    if (s.phase === "tightcheck" && s.tightResolver) {
      const v = svm.buildSessionVM ? svm.buildSessionVM({}) : null;
      seen.push({ move: s.tightMove, q: v ? v.tightQuestion : "" });
      engine.answerTight(typeof answer === "function" ? answer(s) : answer);
    }
  } };
}
const last = () => { const h = store.loadSessions(); return h[h.length - 1]; };

// 1. Every recovery move carries an area, except the ones with none (D6).
ok(menu.every(ex => ex.area === null || data.BODY_ZONES.some(z => z.n === ex.area)), "every recovery move names a real body zone or none");
ok(menu.filter(ex => ex.area != null).length >= MOVES - 2, "at most two recovery moves have no single area");

// 2. "Loose now" after every move: asked once per move, no extra round.
{
  const seen = [];
  const s = await runSession({ dayKey: "sunday", light: "recovery" }, answering("loose", seen));
  same(seen.length, MOVES, "Loose now: the card is asked once per move");
  const rec = last();
  ok(rec.tightness, "the answers ride on the saved session");
  same(Object.keys(rec.tightness).length, MOVES, "one answer record per move");
  ok(Object.values(rec.tightness).every(t => t.asked === 1 && t.extra === 0 && t.stillTight === false), "Loose now: asked 1, extra 0, not still tight");
  same(rec.ledger.length, MOVES, "the ledger holds one row per move");
  ok(seen.some(x => /^Is your .+ still tight\?$/.test(x.q)), "a move with an area asks about that area");
  ok(seen.some(x => x.q === "Is anything still tight?"), "a move with no single area asks about anything (D6)");
}

// 3. "Still tight" every time: 2 extra rounds per move, then "tell a grown-up".
let tightSecs = 0, looseSecs = 0;
{
  const base = await runSession({ dayKey: "sunday", light: "recovery" }, answering("loose"));
  looseSecs = last().durationSecs;
  const seen = [];
  await runSession({ dayKey: "sunday", light: "recovery", limitMs: 7200000 }, answering("tight", seen));
  const rec = last();
  tightSecs = rec.durationSecs;
  same(seen.length, MOVES * (engine.TIGHT_MAX_EXTRA + 1), "Still tight: asked 1 + 2 times per move");
  ok(Object.values(rec.tightness).every(t => t.extra === engine.TIGHT_MAX_EXTRA && t.stillTight === true), "Still tight: 2 extra rounds each, still tight at the end");
  same(rec.ledger.length, MOVES, "extra rounds add no ledger row — 'N of N moves' unchanged");
  ok(rec.ledger.every(r => r.status === "done"), "every move still reads done");
  ok(tightSecs > looseSecs + 60, "the extra rounds really ran (" + looseSecs + "s → " + tightSecs + "s)");
}

// 4. A zone marked sore today: still tight, but no extra round on it.
{
  const sore = menu.find(ex => ex.area != null);
  const readiness = { answers: { q_pain: "no" }, zoneSev: { [sore.area]: 2 }, severity: 2, resultSource: "bodycheck" };
  await runSession({ dayKey: "sunday", light: "recovery", readiness }, answering("tight"));
  const t = last().tightness[sore.name];
  ok(t && t.sore === true && t.extra === 0 && t.stillTight === true, "a sore zone: recorded tight and sore, no extra round");
  const other = menu.find(ex => ex.area != null && ex.area !== sore.area);
  ok(last().tightness[other.name].extra === engine.TIGHT_MAX_EXTRA, "a zone not marked sore still gets its extra rounds");
}

// 5. Done on the card ("Move on →") records nothing and runs nothing.
{
  const seen = [];
  await runSession({ dayKey: "sunday", light: "recovery" }, { onTick: (ms, s) => {
    if (s.phase === "repcheck") engine.answerRepCheck("all");
    if (s.phase === "tightcheck" && s.tightResolver) { seen.push(1); engine.advance(); }
  } });
  same(seen.length, MOVES, "Move on: asked once per move");
  ok(Object.values(last().tightness).every(t => t.asked === 0 && t.extra === 0), "Move on: no answer recorded, no extra round");
}

// 6. A weekday the check turned into Recovery asks too; a training day never does.
{
  const seen = [];
  await runSession({ dayKey: "wednesday", light: "recovery" }, answering("loose", seen));
  ok(seen.length > 0, "a weekday recovery asks the card");
  let asked = 0;
  await runSession({ dayKey: "wednesday", light: "green" }, { onTick: (ms, s) => {
    if (s.phase === "formcheck") engine.pickClean();
    if (s.phase === "repcheck") engine.answerRepCheck("all");
    if (s.phase === "tightcheck") asked++;
  } });
  same(asked, 0, "a training day never asks the card");
  ok(!last().tightness, "and its record has no tightness field");
}

// 7. The card on screen: question, two 56px answers, Done reads "Move on →".
{
  let html = "", vm = null;
  await runSession({ dayKey: "sunday", light: "recovery" }, { onTick: (ms, s) => {
    if (s.phase === "repcheck") engine.answerRepCheck("all");
    if (s.phase === "tightcheck" && s.tightResolver) {
      if (!html) { vm = svm.buildSessionVM({ isWide: true }); html = sscreen.sessionScreen(vm); }
      engine.answerTight("loose");
    }
  } });
  ok(/data-tight-check/.test(html), "the card is drawn");
  same((html.match(/data-action="answerTight"/g) || []).length, 2, "exactly two answers");
  ok(/😌 Loose now/.test(html) && /😣 Still tight/.test(html), "the two answers read Loose now / Still tight");
  same(vm.doneLabel, "Move on →", "Done on the card reads Move on →");
}

// 8. Grown-up Zone: a still-tight spot is listed for the coach or physio.
{
  await runSession({ dayKey: "sunday", light: "recovery", wipe: true }, answering("tight"));
  const a = gvm.buildGrownupVM({ gsScope: "week", grownupTab: "overview", isWide: true }).analytics;
  ok(a.hasStillTight, "the Still tight list has rows");
  const zoneLabel = data.BODY_ZONES.find(z => z.n === menu.find(ex => ex.area != null).area).label;
  ok(a.stillTight.some(t => t.label === zoneLabel && /1 recovery day · 2 extra rounds/.test(t.note)), "the row names the zone, the day and the extra rounds");
  const html = gscreen.grownupScreen({ ...gvm.buildGrownupVM({ gsScope: "week", grownupTab: "overview", isWide: true }), grownupUnlocked: true });
  ok(/Still tight after recovery/.test(html), "the card shows on Overview");
}

// 9. Sunday's Body Check shows the Recovery card — never "Full 3 rounds".
{
  const r = { step: "questions", dayKey: "sunday", light: "green", suggestedLight: "green", readinessDone: true, answers: { q_sleep: "yes", q_muscles: "yes", q_energy: "yes", q_pain: "yes" } };
  const v = rvm.buildReadinessVM(r, true);
  same(v.light.label, data.LIGHT_META.recovery.label, "Sunday: the card shows the Recovery light");
  same(v.resultCta.label, data.LIGHT_META.recovery.btnLabel, "Sunday: the button starts recovery");
  ok(!/3 rounds/.test(v.resultDesc), "Sunday: no 'Full 3 rounds' promise");
  ok(v.hideLightOverride === true, "Sunday: no light to change");
  ok(/before recovery/.test(v.introLine), "Sunday: a rest-day intro line");
  const w = rvm.buildReadinessVM({ ...r, dayKey: "wednesday" }, true);
  ok(w.light.label === data.LIGHT_META.green.label && w.hideLightOverride === false, "a weekday keeps its own light and the override");
}

// 10. Today on Sunday: the day's mantra; no weather chip without a reading.
{
  store.migrate();
  const v = tvm.buildTodayVM({ selectedDay: "sunday", expanded: {}, isWide: true });
  same(v.echoLine, data.DAYS.sunday.mantra || "Rest IS training.", "Sunday shows the day's mantra");
  same(v.weather, null, "no weather reading → no chip data");
  ok(!/aria-label="Weather"/.test(tscreen.todayWide(v)), "and no chip is drawn");
}

console.log("✓ still-tight check passed (" + passed + " assertions)");
