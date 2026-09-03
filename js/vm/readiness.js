/* ============================================================
   READINESS view-model — port of the Assessment prototype's
   logic class + renderVals. Flow state lives at state.readiness:
   { dayKey, practice, answers, step, zoneSev, pendingZone,
     severity, light, overridden, resultSource, readinessDone }
   ============================================================ */

import { READINESS_QS, BODY_ZONES, SEVERITY_LEVELS, LIGHT_META, BODY_RESULTS, LIGHT_ROUNDS } from "../data.js";
import { settings, loadReadiness } from "../store.js";

export function newReadinessFlow(dayKey, practice) {
  return {
    dayKey, practice: !!practice,
    answers: {}, step: "questions", zoneSev: {}, pendingZone: null,
    // `light` is the FINAL light — what the session actually runs. `suggestedLight`
    // is what the check itself produced, kept so the app can show both decisions
    // and so a grown-up's override is never mistaken for the body's own answer.
    severity: null, light: "green", suggestedLight: "green", overridden: false,
    // The two signals the check produces, kept SEPARATELY so the final light can
    // be the more cautious of them rather than whichever spoke last.
    readinessLight: null, bodyLight: null,
    resultSource: "readiness", readinessDone: false, grownupOk: false
  };
}

/* Caution, in order. A light is never quietly downgraded by a second opinion:
   where the two signals disagree, the session runs the smaller day. */
export const LIGHT_ORDER = ["green", "yellow", "red", "recovery"];

export function moreCautious(a, b) {
  const ia = LIGHT_ORDER.indexOf(a), ib = LIGHT_ORDER.indexOf(b);
  if (ia < 0) return ib < 0 ? "green" : b;
  if (ib < 0) return a;
  return ia >= ib ? a : b;
}

/* Toggle the "a grown-up said it's OK" confirmation (pain severity 3 gate). */
export function confirmGrownup(r) { r.grownupOk = !r.grownupOk; }

/* ---- flow transitions (called from main.js actions) ---- */

export function answerQuestion(r, id, val) {
  r.answers[id] = val;
  // Score FIRST, then route. Routing first is what threw the general readiness
  // answers away on every sore morning — see READINESS_QS in js/data.js.
  scoreReadiness(r);
  if (id === "q_pain" && val === "no") { r.step = "bodyArea"; return; }
  maybeFinish(r);
}

/* The general-readiness verdict on its own: three yes/no answers about sleep,
   muscles and energy. Computed whenever those three are in, whatever the pain
   answer was, so the body map has something to be weighed against. Stays null
   until all three are there — a saved flow from before this, or a test that taps
   only the pain question, has no readiness signal and the body map decides
   alone, exactly as it used to. */
function scoreReadiness(r) {
  const need = ["q_sleep", "q_light", "q_ready"];
  if (!need.every(k => r.answers[k] != null)) return;
  const yes = need.filter(k => r.answers[k] === "yes").length;
  r.readinessLight = yes >= 3 ? "green" : yes === 2 ? "yellow" : yes === 1 ? "red" : "recovery";
}

function maybeFinish(r) {
  const need = ["q_pain", "q_sleep", "q_light", "q_ready"];
  if (!need.every(k => r.answers[k] != null) || r.answers.q_pain !== "yes") return;
  r.light = r.readinessLight || "green";
  r.suggestedLight = r.light;
  r.readinessDone = true;
  r.resultSource = "readiness";
}

/* How old a saved check can be and still be "yesterday". Long enough to cover
   an evening check followed by a morning one, short enough that a record from
   last month can never be reused. */
export const SAME_AS_YESTERDAY_MAX_MS = 36 * 60 * 60 * 1000;

/* Yesterday is SHOWN, never reused.

   This was a one-tap "feel the same as yesterday?" button that copied the
   answers wholesale. It had already been narrowed twice — a freshness window,
   then a re-ask of the soreness question when yesterday reported any — and the
   hole it left was still the whole point of the screen: on a clean yesterday,
   sleep, muscle freshness and energy all carried over, so today's light could
   be produced entirely from yesterday's body without her answering anything.

   A check that reads yesterday's body is not a check. So yesterday now sits
   BESIDE today as a read-only column: she can see what she said, and she still
   has to say what is true now. The freshness window survives — a check from
   last month is not "yesterday" — the copying does not. */
export function yesterdayCheck(now = Date.now()) {
  const prev = loadReadiness();
  if (!prev || !prev.answers || !Number.isFinite(prev.when)) return null;
  if (now - prev.when > SAME_AS_YESTERDAY_MAX_MS) return null;
  return prev;
}

/* One line for the body map: the zones she marked, in her own words. Not a
   second diagram — the map is busy enough with today's marks on it. */
export function yesterdayZoneLine(now = Date.now()) {
  const prev = yesterdayCheck(now);
  if (!prev) return "";
  const sev = prev.zoneSev || {};
  const nums = Object.keys(sev).map(Number).filter(n => Number.isFinite(sev[n]));
  if (!nums.length) return "Yesterday: no sore spots.";
  const SEV_WORD = { 2: "tired", 3: "not right", 4: "pain" };
  const named = nums.map(n => {
    const z = BODY_ZONES.find(b => b.n === n);
    return (z ? z.label : "Zone " + n) + " — " + (SEV_WORD[sev[n]] || "marked");
  });
  return "Yesterday: " + named.join(", ") + ".";
}

export function setZoneSev(r, num, level) {
  const zs = { ...(r.zoneSev || {}) };
  if (level) zs[num] = level; else delete zs[num];
  const worst = Object.values(zs).length ? Math.max(...Object.values(zs)) : 0;
  const map = { 2: "yellow", 3: "red", 4: "recovery" };
  r.zoneSev = zs;
  r.pendingZone = null;
  r.severity = worst || null;
  r.bodyLight = worst ? map[worst] : "green";
  /* Both signals, and we run the smaller day. The body map used to simply
     OVERWRITE the light, so a Recovery-grade set of readiness answers came out
     Yellow because one shoulder was merely tired. Neither reading is wrong —
     they are about different things — so neither gets to cancel the other. */
  r.light = moreCautious(r.bodyLight, r.readinessLight);
  r.suggestedLight = r.light;      // a new mark replaces any earlier override
  r.overridden = false;
  // Which signal actually produced the light, so the result card can show the
  // body-check copy only when the body check is the one being acted on.
  r.resultSource = worst && r.light === r.bodyLight ? "bodycheck" : "readiness";
  r.grownupOk = false;   // any change re-requires the grown-up confirm
}

export function resetBodyCheck(r) {
  // "Rest 1–2 min, then re-check": clear the MARKS so she can redo the body
  // check. Her readiness answers are not marks and are not cleared — re-checking
  // a sore shoulder must not quietly discard a Red night's sleep.
  r.severity = null; r.zoneSev = {}; r.resultSource = "readiness";
  r.bodyLight = null;
  r.light = r.readinessLight || "green";
  r.suggestedLight = r.light; r.overridden = false; r.grownupOk = false;
}

/* ---- view-model ---- */

const LIGHT_NAME = { green: "Green", yellow: "Yellow", red: "Red", recovery: "Recovery" };

/* "Yellow — 2 rounds", and "Recovery — recovery only" rather than "0 rounds". */
function lightWord(key) {
  const n = LIGHT_ROUNDS[key];
  const dose = n ? n + (n === 1 ? " round" : " rounds") : "recovery only";
  return (LIGHT_NAME[key] || key) + " — " + dose;
}

export function buildReadinessVM(r, isWide) {
  const ans = r.answers;
  const step = r.step;
  const baseBtn = "min-width:58px;min-height:44px;border-radius:var(--radius-pill);border:2px solid;font-weight:900;font-size:13px;cursor:pointer;background:var(--surface);";

  /* Yesterday's answers, rendered with each question's OWN words — "😴 Good"
     rather than a bare yes, so the column reads as an answer and not as a
     verdict. An em dash where there is nothing recent to show. */
  const prevCheck = yesterdayCheck();
  const questions = READINESS_QS.map(q => {
    const v = ans[q.id];
    const prevV = prevCheck ? prevCheck.answers[q.id] : null;
    return {
      id: q.id,
      text: q.text,
      yesLabel: q.yesLabel || "✓ Yes",
      noLabel: q.noLabel || "✗ No",
      yesterday: prevV === "yes" ? (q.yesLabel || "✓ Yes")
        : prevV === "no" ? (q.noLabel || "✗ No") : "—",
      yesStyle: baseBtn + (v === "yes" ? "border-color:var(--mint);background:var(--mint-wash);color:var(--mint-ink);" : "border-color:var(--hairline);color:var(--ink-soft);"),
      noStyle: baseBtn + (v === "no" ? "border-color:var(--sun);background:var(--sun-wash);color:var(--sun-ink);" : "border-color:var(--hairline);color:var(--ink-soft);")
    };
  });

  const zoneSev = r.zoneSev || {};
  const selectedNums = Object.keys(zoneSev).map(Number);
  const SEV_COLOR = { 2: "var(--sun)", 3: "var(--coral)", 4: "var(--stop)" };
  const SEV_SHORT = { 2: "Tired", 3: "Not right", 4: "Pain" };
  const zoneHighlight = {}, zoneBadge = {}, zoneBadgeBg = {};
  BODY_ZONES.forEach(z => {
    const key = "n" + z.n;
    const sev = zoneSev[z.n];
    zoneHighlight[key] = sev
      ? "background:color-mix(in srgb, " + SEV_COLOR[sev] + " 38%, transparent);border:3px solid " + SEV_COLOR[sev] + ";box-shadow:0 0 0 2px rgba(255,255,255,0.85);"
      : "background:rgba(255,255,255,0.10);border:2px dashed rgba(20,59,74,0.65);box-shadow:0 0 0 1.5px rgba(255,255,255,0.75);";
    zoneBadge[key] = sev ? "!" : String(z.n);
    zoneBadgeBg[key] = sev ? SEV_COLOR[sev] : "var(--ink)";
  });

  const GROUP_HEADERS = { shared: "Both views", front: "Front only", back: "Back only" };
  const legendRows = [];
  let lastGroup = null;
  BODY_ZONES.forEach(z => {
    if (z.group !== lastGroup) {
      legendRows.push({ isHeader: true, label: GROUP_HEADERS[z.group] });
      lastGroup = z.group;
    }
    const sev = zoneSev[z.n];
    legendRows.push({
      isHeader: false,
      num: z.n,
      label: sev ? z.label + " — " + SEV_SHORT[sev] : z.label,
      rowStyle: "display:flex;align-items:center;gap:10px;background:none;border:2px solid;border-radius:14px;padding:8px 10px;cursor:pointer;text-align:left;min-height:44px;"
        + (sev ? "border-color:" + SEV_COLOR[sev] + ";background:color-mix(in srgb, " + SEV_COLOR[sev] + " 14%, #fff);" : "border-color:transparent;"),
      badgeStyle: "width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;background:" + (sev ? SEV_COLOR[sev] : "var(--ink)") + ";"
    });
  });

  const pendingZone = r.pendingZone;
  const pz = BODY_ZONES.find(z => z.n === pendingZone);
  const popupOptions = SEVERITY_LEVELS.filter(s => s.level >= 2).map(sv => ({ ...sv }));

  const lightKey = r.light;
  const L = LIGHT_META[lightKey];
  const light = { ...L };
  const LIGHT_OPTS = [
    { key: "green", emoji: "🟢", label: "Green" },
    { key: "yellow", emoji: "🟡", label: "Yellow" },
    { key: "red", emoji: "🔴", label: "Red" },
    { key: "recovery", emoji: "🟣", label: "Recovery" }
  ];
  const lightOptions = LIGHT_OPTS.map(o => ({
    ...o,
    style: "display:flex;align-items:center;gap:6px;border-radius:var(--radius-pill);padding:8px 14px;cursor:pointer;border:2px solid;background:var(--surface);"
      + (o.key === lightKey ? "border-color:" + L.color + ";background:" + L.color + ";color:#fff;" : "border-color:var(--hairline);color:var(--ink-soft);")
  }));

  const sevLevel = r.severity || 1;
  const BR = BODY_RESULTS[sevLevel];
  const isBodyResultPath = r.resultSource === "bodycheck";

  /* Did a grown-up actually move the light? Derived from the two values rather
     than trusted from the `overridden` flag, so picking the suggested light back
     out of the list is not recorded as an override. */
  const suggested = r.suggestedLight || lightKey;
  const wasOverridden = lightKey !== suggested;

  /* The whole card follows the FINAL light once a grown-up has moved it.
     It used to keep taking the description and the button from the body-check
     SEVERITY, which never changes on an override — so overriding a sore-shoulder
     Yellow to Green drew a green "Full power!" header directly above "2 rounds
     max" and a button reading "Start easy — Yellow light", and then ran three
     rounds. Worse, severity 4 carries action "back": overriding a pain report
     left a button that quietly EXITED instead of starting, which is the one
     case a grown-up is most likely to be using the override for. */
  const showBodyResult = isBodyResultPath && !wasOverridden;
  /* The two inputs, named, whenever they differed — otherwise a Recovery light
     sitting over a Yellow body map looks like the app got the severity wrong. */
  const bodyLight = r.bodyLight || null;
  const readinessLight = r.readinessLight || null;
  const combinedLine = bodyLight && readinessLight && bodyLight !== readinessLight
    ? "Body Check said " + lightWord(bodyLight) + ". Quick check said "
      + lightWord(readinessLight) + ". Today runs the smaller one."
    : "";
  const resultDesc = showBodyResult ? BR.desc : light.desc;
  // action encoded for the delegated handler: continue | retry | back
  const resultCta = showBodyResult
    ? { color: BR.ctaColor, deep: BR.ctaDeep, text: BR.ctaText || "#fff", icon: BR.ctaIcon, label: BR.cta,
        action: BR.action, secondaryLabel: BR.secondaryLabel || "", secondaryAction: BR.secondary || "" }
    : { color: light.btnColor, deep: light.btnDeep, text: light.btnText || "#fff", icon: light.btnIcon, label: light.btnLabel,
        action: "continue", secondaryLabel: "", secondaryAction: "" };

  /* Two decisions were made, so the card says both. Hiding the suggestion would
     make the grown-up's choice look like the body's own answer. */
  const suggestionLine = wasOverridden
    ? (isBodyResultPath ? "Body Check" : "Quick check") + " suggested " + lightWord(suggested)
      + ". Grown-up selected " + lightWord(lightKey) + "."
    : "";

  const showInlineReadinessResult = step === "questions" && r.readinessDone && !isBodyResultPath;
  const showInlineBodyResult = step === "bodyArea" && r.severity != null && selectedNums.length > 0;

  const bodyBranch = step === "bodyArea" || r.resultSource === "bodycheck";
  const STEPS = bodyBranch
    ? [{ label: "Quick check-in" }, { label: "Body check" }, { label: "Your light" }]
    : [{ label: "Quick check-in" }, { label: "Your light" }];
  let currentStepNum = 1;
  if (step === "questions" && showInlineReadinessResult) currentStepNum = STEPS.length;
  else if (step === "bodyArea") currentStepNum = showInlineBodyResult ? 3 : 2;
  const stepperRows = STEPS.map((s, i) => {
    const num = i + 1;
    const done = num < currentStepNum;
    const active = num === currentStepNum;
    return {
      icon: done ? "✓" : String(num),
      circleStyle: "width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;"
        + (done ? "background:var(--mint);color:#fff;" : active ? "background:#fff;color:var(--aqua-deep);" : "background:rgba(255,255,255,0.25);color:#fff;"),
      labelStyle: "font-size:13px;font-weight:800;letter-spacing:0.02em;white-space:nowrap;" + (active ? "color:#fff;" : "color:rgba(255,255,255,0.75);"),
      label: s.label
    };
  });

  const prev = loadReadiness();

  return {
    athleteName: settings.athleteName || "Jess",
    stepperRows,
    isWide, isNarrow: !isWide,
    cardDir: isWide ? "row" : "column",
    mapsRow: isWide
      ? "display:flex;gap:16px;align-items:stretch;"
      : "display:flex;flex-direction:column;gap:16px;",
    legendStyle: isWide
      ? "width:250px;flex-shrink:0;background:var(--bg);border:2px solid var(--hairline);border-radius:22px;padding:12px 14px;display:flex;flex-direction:column;gap:5px;overflow-y:auto;max-height:560px;"
      : "width:100%;box-sizing:border-box;background:var(--bg);border:2px solid var(--hairline);border-radius:22px;padding:12px 14px;display:flex;flex-direction:column;gap:5px;",
    bodyContentStyle: isWide
      ? "flex:1;min-width:0;padding:30px 36px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;align-items:center;"
      : "flex:1;min-width:0;padding:22px 18px 26px;display:flex;flex-direction:column;align-items:center;",
    isQuestionsStep: step === "questions",
    showBodyArea: step === "bodyArea",
    showInlineReadinessResult, showInlineBodyResult,
    noZonesYet: step === "bodyArea" && selectedNums.length === 0,
    isBodyResultPath, resultDesc, resultCta,
    suggestionLine, combinedLine, wasOverridden, suggestedLight: suggested,
    bodyLight, readinessLight,
    // Pain severity 3 ("changed movement") must not be self-cleared: require an
    // explicit grown-up confirmation before the Continue button is enabled.
    /* The severity-3 pain gate is about the PAIN, not about which signal won.
       Keying it to the body-result path meant a readiness score strict enough to
       drive the light past Red took the grown-up confirmation away with it —
       exactly backwards, since that is a day with pain AND a flat body. */
    needsGrownupConfirm: (r.severity || 0) >= 3 && !!BODY_RESULTS[3].needsGrownup,
    grownupConfirmed: !!r.grownupOk,
    questions,
    // Only offer the one-tap reuse when there is genuinely a recent check to
    // reuse. It used to appear whenever ANY previous record existed, so
    // "same as yesterday" could copy a body check from months ago.
    hasYesterday: !!prevCheck && step === "questions" && !showInlineReadinessResult,
    yesterdayZoneLine: yesterdayZoneLine(),
    areaLabel: BODY_ZONES.filter(z => zoneSev[z.n]).map(z => z.label + " — " + SEV_SHORT[zoneSev[z.n]]).join(" · "),
    zoneHighlight, zoneBadge, zoneBadgeBg, legendRows,
    showZonePopup: !!pz,
    pendingZone,
    pendingZoneLabel: pz ? pz.label : "",
    popupOptions,
    popupHasMark: !!(pz && zoneSev[pendingZone]),
    light, lightOptions
  };
}
