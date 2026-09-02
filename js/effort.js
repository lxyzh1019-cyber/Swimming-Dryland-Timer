/* ============================================================
   EFFORT — "did she actually try?"

   Every other number in the app measures the PLAN: minutes, rounds,
   adherence, completion. Those all reward an easy day. Finishing one
   round on a red-light day is more effort than coasting through three
   on a green one, but volume scores the green day higher — so none of
   it answers the question a parent is actually asking.

   Effort is scored only on what she CONTROLS, normalised to what that
   day asked of her:

     form on the spot-checks    30   doing it properly, not just doing it
     finished the day's target  30   the day's own target, not a fixed one
     showed up on a hard day    15   red 15 · yellow 12 · recovery 10 · green 8
     didn't skip moves          15   staying with the plan
     worked the clock           10   not rushing; running long is never docked

   Two deliberate exemptions:

     · A PAIN STOP never costs effort. Stopping for pain is the correct
       call — scoring it down would teach her to push through pain,
       which is exactly backwards from the app's safety rule. Those
       sessions are excluded from averages and labelled as the right call.
     · Effort is normalised to the day, so a red-light session is scored
       against a red-light target. Otherwise the number just measures how
       good she happened to feel, which she does not control.

   Grown-up-facing only. A score the kid can see is a score to game.
   ============================================================ */

import { LIGHT_ROUNDS } from "./data.js";
import { outcomeOf } from "./outcome.js";

export const EFFORT_WEIGHTS = { form: 30, finish: 30, hardDay: 15, stuckWithIt: 15, clock: 10 };
const LIGHT_CREDIT = { red: 15, yellow: 12, recovery: 10, green: 8 };

export const EFFORT_BANDS = [
  { min: 85, band: "All in",        tone: "mint"  },
  { min: 70, band: "Solid",         tone: "aqua"  },
  { min: 50, band: "Going through the motions", tone: "sun" },
  { min: 0,  band: "Barely there",  tone: "coral" }
];
export function effortBand(score) {
  return (EFFORT_BANDS.find(b => score >= b.min) || EFFORT_BANDS[EFFORT_BANDS.length - 1]).band;
}

/* Spot-check verdicts for one session. Falls back to the clean/wobbly tallies
   for rows written before per-move verdicts were recorded. */
export function formChecksOf(s) {
  const fc = (s && s.formChecks) || [];
  if (fc.length) return { asked: fc.length, clean: fc.filter(f => f.clean).length };
  const clean = (s && s.clean) || 0, wobbly = (s && s.wobbly) || 0;
  return { asked: clean + wobbly, clean };
}

/* Effort for one session: { score, band, reasons[], painStop, counted }.
   A pain stop returns counted:false — it is never averaged and never blamed. */
export function sessionEffort(s) {
  if (!s) return { score: 0, band: "—", reasons: [], painStop: false, counted: false };
  if (s.pain) {
    return { score: null, band: "Right call", counted: false, painStop: true,
             reasons: ["Stopped for pain — that's the rule working, not a lapse."] };
  }
  const reasons = [];
  const moves = (s.perExercise || []).length;
  const skipped = (s.perExercise || []).filter(p => p.skipped).length || s.skippedCount || 0;

  // finished what the day asked
  let finish;
  if (outcomeOf(s).state === "complete") { finish = 1; reasons.push("Finished the whole session."); }
  else {
    const did = Math.max(0, moves - skipped);
    finish = moves ? Math.min(1, did / moves) : 0.4;
    reasons.push("Ended early after " + did + " of " + moves + " moves.");
  }

  // showed up on a hard day
  const light = s.lightResult || s.light || "green";
  const hardPts = LIGHT_CREDIT[light] != null ? LIGHT_CREDIT[light] : LIGHT_CREDIT.green;
  if (light === "red" || light === "yellow") reasons.push("Trained on a " + light + "-light day.");

  // stayed with it
  const stuck = moves ? Math.max(0, 1 - skipped / moves) : 1;
  if (skipped) reasons.push("Skipped " + skipped + " move" + (skipped === 1 ? "" : "s") + ".");

  // worked the clock — overruns are never penalised
  const planned = s.plannedSecs || 0;
  const actual = s.durationSecs || 0;
  const clockRatio = planned > 0 ? Math.min(1, (actual / planned) / 0.85) : 1;
  if (planned > 0 && actual / planned < 0.6) reasons.push("Ran well short of the planned time.");

  // form on the spot-checks — no answers means no evidence, so score it neutral
  // rather than punishing a run that was never asked
  const fc = formChecksOf(s);
  const formRatio = fc.asked ? fc.clean / fc.asked : 0.7;
  if (fc.asked) reasons.push(fc.clean + " of " + fc.asked + " form checks clean.");

  const score = Math.round(
    formRatio * EFFORT_WEIGHTS.form +
    finish * EFFORT_WEIGHTS.finish +
    hardPts +
    stuck * EFFORT_WEIGHTS.stuckWithIt +
    clockRatio * EFFORT_WEIGHTS.clock
  );
  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, band: effortBand(clamped), reasons, painStop: false, counted: true };
}

/* Effort across a set of sessions, plus the two lines that actually answer
   "did she try": how often she trained on a day she felt bad, and what the
   spot-checks say. Pain stops are surfaced, never averaged. */
export function effortSummary(sessions) {
  const rows = (sessions || []).filter(s => s && s.sessionType !== "spa" && !s.practice);
  const scored = rows.map(s => ({ s, e: sessionEffort(s) }));
  const counted = scored.filter(x => x.e.counted);
  const avg = counted.length ? Math.round(counted.reduce((a, x) => a + x.e.score, 0) / counted.length) : null;

  const toughDays = rows.filter(s => ["yellow", "red"].includes(s.lightResult || s.light));
  const toughFinished = toughDays.filter(s => outcomeOf(s).state === "complete").length;
  const skips = rows.reduce((a, s) => a + ((s.perExercise || []).filter(p => p.skipped).length || s.skippedCount || 0), 0);
  const form = rows.reduce((a, s) => { const f = formChecksOf(s); a.asked += f.asked; a.clean += f.clean; return a; }, { asked: 0, clean: 0 });
  const painStops = scored.filter(x => x.e.painStop).length;

  return {
    avg, band: avg == null ? "—" : effortBand(avg), sessions: counted.length,
    toughDays: toughDays.length, toughFinished, skips, painStops,
    formAsked: form.asked, formClean: form.clean,
    formPct: form.asked ? Math.round((form.clean / form.asked) * 100) : null,
    trend: counted.slice(-10).map(x => x.e.score),
    lines: [
      toughDays.length
        ? "Trained on " + toughDays.length + " day" + (toughDays.length === 1 ? "" : "s") + " she felt tired or sore, and finished " + toughFinished + " of them."
        : "No yellow or red days in this window — she hasn't had to push through one.",
      form.asked
        ? "Skipped " + skips + " move" + (skips === 1 ? "" : "s") + " across " + rows.length + " session" + (rows.length === 1 ? "" : "s") + ". Form " + Math.round((form.clean / form.asked) * 100) + "% clean on " + form.asked + " spot-check" + (form.asked === 1 ? "" : "s") + "."
        : "Skipped " + skips + " move" + (skips === 1 ? "" : "s") + " across " + rows.length + " session" + (rows.length === 1 ? "" : "s") + ". No form spot-checks answered yet.",
      painStops ? painStops + " pain stop" + (painStops === 1 ? "" : "s") + " — excluded from the score, because stopping was the right call." : ""
    ].filter(Boolean)
  };
}
