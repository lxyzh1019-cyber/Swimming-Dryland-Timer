/* ============================================================
   MAIN — app state, render dispatcher, event delegation, boot.
   Screens are innerHTML render functions in js/screens/*; their
   dynamic values come from pure view-model builders in js/vm/*.
   Buttons carry data-action / data-arg attributes handled by one
   delegated click listener below.
   ============================================================ */

import { migrate, settings, updateSettings, saveReadiness, addXp, patchSession, pendingDrawCount, onStorageError, payQuizQuestion, quizQuestionKey, REDEEM_UNDO_MS } from "./store.js";
import { edmontonDayKey, escapeHtml } from "./util.js";
import { restoreFromCloud, publishJourney } from "./sync.js";
import { downloadBackup, restoreBackupFile } from "./backup.js";
import { buildTodayVM, journeyPathScrollIntoView } from "./vm/today.js";
import { todayWide, todayNarrow } from "./screens/today.js";
import { page, shellWithRail, bottomNav } from "./screens/shell.js";
import { newReadinessFlow, answerQuestion, sameAsYesterday, setZoneSev, resetBodyCheck, confirmGrownup, buildReadinessVM } from "./vm/readiness.js";
import { readinessScreen } from "./screens/readiness.js";
import * as engine from "./engine.js";
import { buildSessionVM, sessionQuizFor } from "./vm/session.js";
import { buildTryItVM, tryItMoves } from "./vm/tryit.js";
import { tryItScreen } from "./screens/tryit.js";
import { sessionScreen, updateSessionTick } from "./screens/session.js";
import { buildQuizDeck, answerQuizDeck, finishQuizDeck, quizDeckHtml, newPrizeDraw, claimPrize, prizeDrawHtml } from "./screens/overlays.js";
import { buildProgressVM, toggleRedeem } from "./vm/progress.js";
import { progressScreen } from "./screens/progress.js";
import { buildGrownupVM, exportCsv } from "./vm/grownup.js";
import { grownupScreen } from "./screens/grownup.js";
import { requireGrownup, answerPin, choosePin, allowPinChoice, clearPinChoice,
         pinRefusalReason, gateMode, lockGate, gateUnlocked, unlockByPasskey,
         hasGrownupPin, isFreshDevice, PIN_MIN_DIGITS, PIN_MAX_DIGITS,
         GATE_REASON } from "./gate.js";
import { passkeySupported, hasPasskey, enrollPasskey, verifyPasskey, forgetPasskey } from "./passkey.js";
import { loadGate, saveGate, loadLadderRungs, saveLadderRungs, loadTracker, saveTracker, getCurrentTrackerWeek, setEngagementPick, switchProfile, addProfile, renameProfile, activeProfileId, LS_SESSIONS, recordFormVerdict, repairPrizeWallet, redeemedPrizesForReview, restorePrize } from "./store.js";

export const state = {
  nav: "today",                 // 'today' | 'progress' | 'grownup'
  grownupTab: "overview",       // 'overview' | 'analytics' | 'library' | 'settings' | 'coaching'
  gateAsk: null,                // the pending grown-up action, or null
  gateError: "",                // "that's not it" after a wrong answer
  gatePayload: null,            // the argument the pending action was called with
  pendingAction: null,          // { name, arg } — re-run once a grown-up is here
  gateWantsNewPin: false,       // "Forgot the PIN?" — the passkey is the way through
  gateBusy: false,              // a passkey ceremony is in flight
  passkeyNote: "", passkeyNoteOk: false,   // result line under the passkey row
  prizeReviewOpen: false,       // the redeemed-prize review list
  gsScope: "week",
  logScope: "week",
  progressScope: "4w",          // '4w' | 'month' | 'quarter' — Progress period board
  formCheckMonth: null,         // 'YYYY-MM' — Form Check month being reviewed (null = current)
  expanded: {},                 // day-card block expansion
  selectedDay: null,            // monday..sunday
  tryIt: null,                  // dayKey while the Try-It browse screen is open
  inSession: false,
  readiness: null,              // active readiness-check flow state (null = not in flow)
  pendingSession: null,         // { light, dayKey } — readiness → session handoff
  quizDeck: null,
  prizeDraw: null,
  detailOverlay: false,
  detailEx: null,
  weather: null,                // { icon, temp, caption } once fetched
  backupNote: "", backupNoteOk: false,   // result line under Backup & restore
  walletRepairNote: "",         // result line under the prize wallet repair
  pendingRestore: null,         // { file, from, to } — a backup from another athlete, awaiting confirmation
  storageError: null,           // { name } — set when a write is rejected (disk full)
  isWide: true
};

const root = document.getElementById("app");
let undoTimer = null;              // repaints the prize wallet when an undo window closes

function computeIsWide() {
  return window.innerWidth >= 900 && window.innerWidth > window.innerHeight;
}

/* ---- screen renderers (filled in phase by phase) ---- */

function renderToday() {
  const vm = buildTodayVM(state);
  const inner = state.isWide
    ? shellWithRail(vm, todayWide(vm))
    : todayNarrow(vm) + bottomNav(vm);
  root.innerHTML = page(inner);
  journeyPathScrollIntoView(root);
}

function renderReadiness() {
  const vm = buildReadinessVM(state.readiness, state.isWide);
  root.innerHTML = page(readinessScreen(vm));
}

function renderSession() {
  const vm = buildSessionVM(state);
  root.innerHTML = page(sessionScreen(vm));
}

engine.onSessionUpdate(kind => {
  if (!state.inSession) return;
  if (kind === "tick") updateSessionTick(buildSessionVM(state));
  else renderSession();
});

/* A write that never reached storage used to be invisible. It now surfaces
   here until the app is reloaded, so nobody keeps training into a full disk
   believing it's being recorded. */
function storageBannerHtml() {
  if (!state.storageError) return "";
  return `<div role="alert" style="position:fixed;left:0;right:0;bottom:0;z-index:200;background:var(--stop-wash);border-top:3px solid var(--stop);padding:12px 16px;display:flex;align-items:center;gap:12px;justify-content:center;font-family:var(--font-ui);">
    <span style="font-size:20px;">⚠️</span>
    <span style="font-weight:800;font-size:14px;color:var(--stop-ink);line-height:1.4;max-width:640px;">This device's storage is full, so the last thing ${escapeHtml(state.storageError.name)} did wasn't saved. Free up space on the device (or clear other sites' data) — sessions won't be recorded until then.</span>
    <button type="button" data-action="dismissStorageError" style="min-height:36px;border:none;background:var(--stop);color:#fff;border-radius:var(--radius-pill);font-weight:900;font-size:13px;padding:0 14px;cursor:pointer;font-family:inherit;">Dismiss</button>
  </div>`;
}

/* The grown-up gate, drawn over whatever screen asked for it — the pain-severity
   confirmation lives on her readiness screen, the prize repair in the Grown-up
   Zone, and both need the same question. */
function gateHtml() {
  if (!state.gateAsk) return "";
  const reason = GATE_REASON[state.gateAsk] || "continue";
  const mode = gateMode(state.gateWantsNewPin);
  const inputStyle = "width:100%;min-height:48px;border:2px solid var(--hairline);border-radius:12px;padding:0 14px;font-size:18px;font-weight:900;font-family:inherit;box-sizing:border-box;";
  const btn = (action, label, primary) => `<button type="button" data-action="${action}"${state.gateBusy ? " disabled" : ""} style="${primary
    ? "flex:1;min-height:46px;border:none;border-radius:var(--radius-pill);background:var(--mint);color:#fff;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;"
    : "min-height:46px;border:2px solid var(--hairline);border-radius:var(--radius-pill);background:transparent;color:var(--ink-soft);font-weight:900;font-size:14px;padding:0 16px;cursor:pointer;font-family:inherit;"}">${label}</button>`;

  /* Three shapes, one card: confirm with the device passkey, type the PIN, or
     choose one. There is no arithmetic question any more — see js/gate.js. */
  const body =
    mode === "pin" ? `
      <div style="font-size:15px;font-weight:800;color:var(--ink);margin-bottom:10px;">Enter the grown-up PIN.</div>
      <input type="password" inputmode="numeric" autocomplete="off" data-input="gatePin" style="${inputStyle}" placeholder="PIN">`
    : mode === "setPin" ? `
      <div style="font-size:15px;font-weight:800;color:var(--ink);margin-bottom:4px;">Choose a grown-up PIN.</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.5;margin-bottom:10px;">${PIN_MIN_DIGITS}–${PIN_MAX_DIGITS} digits. It stays on this device — never in a backup file, never sent anywhere. Pick one she doesn't know.${hasPasskey() ? "" : ` <strong>There is no passkey on this device yet, so a forgotten PIN could not be reset.</strong> Set one up below, or write the PIN down.`}</div>
      <input type="password" inputmode="numeric" autocomplete="off" data-input="gateNewPin" style="${inputStyle}" placeholder="New PIN">
      ${passkeySupported() && !hasPasskey() ? `<div style="margin-top:10px;">${btn("enrollPasskey", "🔐 Set up a passkey on this device", false)}</div>` : ""}
      ${state.passkeyNote ? `<div style="margin-top:8px;font-size:13px;font-weight:800;line-height:1.45;color:${state.passkeyNoteOk ? "var(--mint-ink)" : "var(--stop-ink)"};">${escapeHtml(state.passkeyNote)}</div>` : ""}`
    : /* passkey */ `
      <div style="font-size:15px;font-weight:800;color:var(--ink);margin-bottom:4px;">${state.gateWantsNewPin ? "Confirm you're the grown-up, then pick a new PIN." : "Confirm you're the grown-up."}</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.5;margin-bottom:10px;">${hasPasskey()
        ? "This device will ask for your face, fingerprint or passcode."
        : passkeySupported()
          ? "No passkey is set up on this device, so there is nothing to confirm with. Set one up on a device that already has a grown-up unlocked, or restore a backup."
          : "This browser has no passkey support, so a forgotten PIN cannot be reset here. Restore a backup on another device instead."}</div>
      ${hasPasskey() ? btn("unlockWithPasskey", state.gateBusy ? "Waiting for the device…" : "🔐 Confirm with this device", true) : ""}`;

  return `<div style="position:fixed;inset:0;z-index:210;background:rgba(20,59,74,0.62);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--font-ui);">
    <div data-stop-propagation="1" style="background:var(--surface);border-radius:20px;padding:22px 24px;max-width:380px;width:100%;box-shadow:0 18px 40px rgba(20,59,74,0.3);">
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--ink);margin-bottom:6px;">Grown-up check</div>
      <div style="font-size:13px;font-weight:800;color:var(--ink-soft);line-height:1.5;margin-bottom:14px;">A grown-up needs to be here to ${escapeHtml(reason)}.</div>
      ${body}
      ${state.gateError ? `<div role="alert" style="margin-top:8px;font-size:13px;font-weight:800;color:var(--stop-ink);line-height:1.45;">${escapeHtml(state.gateError)}</div>` : ""}
      <div style="display:flex;gap:10px;margin-top:14px;">
        ${mode === "passkey" ? "" : btn("submitGate", mode === "setPin" ? "Set PIN" : "Unlock", true)}
        ${btn("cancelGate", "Cancel", false)}
      </div>
      ${mode === "pin" ? `<button type="button" data-action="forgotPin" style="margin-top:10px;background:none;border:none;padding:4px;color:var(--ink-soft);font-weight:800;font-size:13px;text-decoration:underline;cursor:pointer;font-family:inherit;">Forgot the PIN?</button>` : ""}
    </div>
  </div>`;
}

function overlaysHtml() {
  let html = storageBannerHtml();
  html += gateHtml();
  if (state.quizDeck) html += quizDeckHtml(state.quizDeck);
  if (state.prizeDraw) html += prizeDrawHtml(state.prizeDraw);
  return html;
}

export function render() {
  state.isWide = computeIsWide();
  if (state.tryIt) { root.innerHTML = page(tryItScreen(buildTryItVM(state))); }
  else if (state.readiness) { renderReadiness(); }
  else if (state.inSession) { renderSession(); }
  else if (state.nav === "progress") {
    const railVm = buildTodayVM(state);
    const pvm = buildProgressVM(state);
    root.innerHTML = page(state.isWide
      ? shellWithRail(railVm, progressScreen(pvm))
      : `<div style="display:flex;background:var(--surface);border-radius:24px;box-shadow:0 14px 34px rgba(20,59,74,0.16);overflow:hidden;">${progressScreen(pvm)}</div>` + bottomNav(railVm));
  }
  else if (state.nav === "grownup") {
    const railVm = buildTodayVM(state);
    const gvm = buildGrownupVM(state);
    root.innerHTML = page(state.isWide
      ? shellWithRail(railVm, grownupScreen(gvm))
      : `<div style="display:flex;background:var(--surface);border-radius:24px;box-shadow:0 14px 34px rgba(20,59,74,0.16);overflow:hidden;">${grownupScreen(gvm)}</div>` + bottomNav(railVm));
  }
  else { renderToday(); }
  const ov = overlaysHtml();
  if (ov) root.insertAdjacentHTML("beforeend", ov);
}

/* ---- delegated actions ---- */

/* ---- the action layer, and the ONE place authorization happens ----------

   Every mutating action used to carry its own `gate("…")` call, backed by a
   hand-maintained 23-entry re-run table. That made protection opt-in: the click
   dispatcher looked an action up and invoked it with no check of its own, so
   `requireGrownup`'s deny-by-default never ran for an action whose author
   forgot the line. Two handlers — the athlete-name field and the backup-file
   picker — never went through the action layer at all, which is how restoring a
   backup over live history came to ask nobody.

   So there is now exactly one way in. `dispatch` is it: the click listener, the
   input and change listeners, and a direct call from a test all arrive here,
   and an action's body cannot run until this function says so. Adding an action
   to RAW without a thought about authorization gets you a GATED action, because
   deny-by-default is applied here rather than remembered per action. */
const RAW = {};

/* Actions whose answer depends on the ARGUMENT, not just the name. A rule here
   is the WHOLE answer for that action — none of them appears in
   UNGATED_ACTIONS, because "sometimes safe" is not the same as "safe", and an
   action listed in both places would be permanently open. */
const CHILD_MAY = {
  // Moving around the app is hers; opening the Grown-up Zone is not.
  nav: arg => arg !== "grownup",
  // Turning the safety voice back ON never needs a grown-up. Turning it off does.
  toggleSafetyVoice: () => settings.safetyVoiceOn === false,
  // Withdrawing a severity-3 confirmation is always allowed; giving one is not.
  rGrownupOk: () => !!(state.readiness && state.readiness.grownupOk)
};

function childMay(name, arg) {
  const rule = CHILD_MAY[name];
  return typeof rule === "function" ? !!rule(arg) : false;
}

/* True when this call may proceed with no grown-up present. */
function mayProceed(name, arg) {
  return childMay(name, arg) || requireGrownup(name);
}

/* Put the challenge up and remember what she was trying to do, so a grown-up
   who unlocks does not then have to go and find the button again. */
function askGrownup(name, arg) {
  state.gateAsk = name;
  state.gatePayload = arg;
  state.pendingAction = { name, arg };
  state.gateError = "";
  render();
}

export function dispatch(name, arg, el) {
  const fn = RAW[name];
  if (!fn) return;                    // a typo'd data-action: nothing to authorize
  if (!mayProceed(name, arg)) { askGrownup(name, arg); return; }
  return fn(arg, el);
}

/* The only way an action gets into the table. Registration cannot bypass the
   guard, because the guard is on dispatch rather than on registration — which
   is what lets a test register a brand-new mutating action and prove it is
   blocked, rather than asserting that requireGrownup("unknown") returns false
   and calling that a boundary. */
export function defineAction(name, fn) { RAW[name] = fn; }
export function actionNames() { return Object.keys(RAW); }

/* Exported so the test suite can drive the action layer directly — several of
   the defects this app has shipped lived here and are invisible from rendered
   markup. Every property is a call into `dispatch`, so driving it directly is
   driving the real path, not a shortcut around it. */
export const actions = new Proxy(RAW, {
  get: (_t, name) => (typeof name === "string" ? (arg, el) => dispatch(name, arg, el) : undefined)
});

/* Close the challenge and re-run whatever she asked for, now that a grown-up is
   here. The re-run goes back through dispatch, so an unlock that somehow did not
   take cannot slip an action past. */
function finishUnlock() {
  const p = state.pendingAction;
  state.gateAsk = null;
  state.gateError = "";
  state.pendingAction = null;
  state.gatePayload = null;
  state.gateWantsNewPin = false;
  state.gateBusy = false;
  if (p) dispatch(p.name, p.arg);
  render();
}

/* The actions themselves. Not one of them checks authorization: that is
   dispatch's job, above, and duplicating it here is exactly the arrangement
   that let seventeen of them forget. */
Object.assign(RAW, {
  nav(arg) {
    // Leaving drops the unlock, so coming back asks again — the five-minute
    // expiry is a backstop, not the mechanism. (Getting IN is CHILD_MAY's job.)
    if (arg !== "grownup" && state.nav === "grownup") {
      lockGate();
      state.prizeReviewOpen = false;
      state.walletRepairNote = ""; state.backupNote = "";
    }
    state.nav = arg;
    render();
  },
  dismissStorageError() { state.storageError = null; render(); },
  // Switching athlete swaps every storage namespace; a reload is the only way
  // to be sure no module is still holding the previous kid's data.
  pickAthlete(arg) {
    if (arg !== activeProfileId() && switchProfile(arg)) location.reload();
  },
  addAthlete() {
    // Gated BEFORE the input is read, so the re-run after unlocking reads the
    // field as it stands then rather than replaying a stale value.
    const inp = root.querySelector('[data-input="newProfile"]');
    const name = (inp && inp.value || "").trim();
    if (!name) return;
    const id = addProfile(name);
    if (id && switchProfile(id)) location.reload();
  },
  selectDay(arg) { state.selectedDay = arg; state.expanded = {}; render(); },
  toggleBlock(arg) { state.expanded[arg] = !state.expanded[arg]; render(); },
  /* Every one of these lives in the Grown-up Zone and changes how her sessions
     run or what gets recorded. All of them were reachable by anyone holding the
     phone; the gate is on the ACTION, so hiding the control was never what was
     protecting them — and now doesn't need to be. */
  toggleCoachVoice() {
    updateSettings({ coachSpeechOn: settings.coachSpeechOn === false }); render();
  },
  toggleTimerSounds() {
    updateSettings({ timerSoundsOn: settings.timerSoundsOn === false }); render();
  },
  toggleSafetyVoice() {
    // Safety cues are the point of the readiness system, so turning them OFF is
    // a grown-up decision. Turning them back on never needs one.
    updateSettings({ safetyVoiceOn: settings.safetyVoiceOn === false });
    render();
  },
  goSession(arg) {
    const dayKey = arg || state.selectedDay || edmontonDayKey();
    // GO always means GO. Looking at the moves has its own button, so nothing
    // can re-point this one at the move list behind her.
    state.readiness = newReadinessFlow(dayKey);
    render();
  },
  goTryIt(arg) {
    state.tryIt = arg || state.selectedDay || edmontonDayKey();
    state.detailOverlay = false; state.detailEx = null;
    render();
  },
  exitTryIt() {
    // Closing the list is the whole of leaving: there is no mode to stand down.
    state.tryIt = null;
    state.detailOverlay = false; state.detailEx = null;
    render();
  },
  tryItDetail(arg) {
    const moves = tryItMoves(state.tryIt);
    const ex = moves[Number(arg)];
    if (!ex) return;
    state.detailEx = ex; state.detailOverlay = true;
    render();
  },
  startQuizDeck() {
    state.quizDeck = buildQuizDeck(8);
    render();
  },
  answerQuizDeck(arg) {
    answerQuizDeck(state.quizDeck, Number(arg));
    render();
  },
  nextQuizDeck() {
    const qd = state.quizDeck;
    if (!qd) return;
    if (qd.idx >= qd.qs.length - 1) { qd.done = true; finishQuizDeck(qd); publishJourney(); }
    else qd.idx += 1;
    render();
  },
  exitQuizDeck() { state.quizDeck = null; render(); },
  pickPrize(arg) {
    if (state.prizeDraw && state.prizeDraw.picked == null) { state.prizeDraw.picked = Number(arg); render(); }
  },
  claimPrize() {
    claimPrize(state.prizeDraw);
    state.prizeDraw = null;
    publishJourney();   // a prize won here must not be invisible on her other device
    // One prize per level gained: once every pending draw is claimed, retire
    // the "Pick your prize" buttons so the draw can't be re-farmed.
    if (pendingDrawCount() < 1) {
      engine.sess.leveledUp = false;
      if (state.quizDeck) state.quizDeck.leveledUp = false;
    }
    render();
  },

  /* ---- readiness flow ---- */
  rAnswer(arg) {
    const [id, val] = arg.split("|");
    answerQuestion(state.readiness, id, val);
    render();
  },
  rSameYesterday() { sameAsYesterday(state.readiness); render(); },
  rPickZone(arg) { state.readiness.pendingZone = Number(arg); render(); },
  rSetZoneSev(arg) {
    const [num, level] = arg.split("|").map(Number);
    setZoneSev(state.readiness, num, level);
    render();
  },
  rClosePopup() { state.readiness.pendingZone = null; render(); },
  rGoBack() { state.readiness.step = "questions"; render(); },
  /* "A grown-up said it's OK" used to be a checkbox on her own screen — the app
     asked whether an adult had cleared a severity-3 pain report and took the
     answer from whoever was holding the phone. */
  rGrownupOk() {
    confirmGrownup(state.readiness);
    render();
  },
  rPickLight(arg) {
    // Overriding the light the body check produced is an adult decision.
    state.readiness.light = arg; state.readiness.overridden = true; render();
  },
  rExit() { state.readiness = null; render(); },
  rResultCta(arg) {
    const r = state.readiness;
    if (arg === "back") { state.readiness = null; render(); return; }
    if (arg === "retry") { resetBodyCheck(r); render(); return; }
    // continue: persist the check (try-it runs don't overwrite the real day's
    // check), then hand the resolved light to the session
    // Both decisions are saved: what the check produced, and what actually ran.
    // Storing only the final light is what made a grown-up's override
    // indistinguishable from the body's own answer in the history.
    const suggested = r.suggestedLight || r.light || "green";
    saveReadiness({ answers: r.answers, zoneSev: r.zoneSev, light: r.light,
                    suggestedLight: suggested, overridden: r.light !== suggested });
    startPendingSession({ light: r.light || "green", dayKey: r.dayKey,
                          suggestedLight: suggested });
  },
  rResultSecondary(arg) {
    if (arg === "retry") { resetBodyCheck(state.readiness); render(); }
    else { state.readiness = null; render(); }
  },

  /* ---- session controls (delegate to the engine) ---- */
  advance() { engine.advance(); },
  pauseTimer() { engine.togglePause(); },
  skipEx() { engine.skipCurrentExercise(); },
  stopNow() { engine.openStopOverlay(); },
  resumeFromStop() { engine.resumeFromStop(); },
  endFromStop() { engine.endFromStop(); },
  askEnd() { engine.sess.confirmEnd = true; render(); },
  cancelEnd() { engine.sess.confirmEnd = false; render(); },
  confirmEndEarly() { engine.endEarly(); },
  pickIntent(arg) { engine.pickIntentWord(arg); },
  answerMicro(arg) { engine.answerMicroLoop(arg); },
  pickClean() { engine.pickClean(); },
  pickWobbly() { engine.pickWobbly(); },
  skipFormCheck() { engine.skipFormCheck(); },
  pickMood(arg) { const [key, emoji] = arg.split("|"); engine.setMood(key, emoji); },
  reflectWell(arg) { engine.setReflect("wentWell", arg); },
  reflectNext(arg) { engine.setReflect("nextTime", arg); },
  quizPick(arg) {
    const i = Number(arg);
    const first = engine.sess.quizPick == null;
    engine.setQuizPick(i);
    // Priced off the same ledger as the Quiz Deck: a question pays +10 the
    // first time it's attempted and +25 the first time it's answered right,
    // and never again. The Coach's Quiz question rotates but the bank is only
    // six deep, so without the ledger this paid 25 XP a session forever for
    // re-answering questions the kid already knew.
    if (first && engine.sess.savedEntry) {
      const q = sessionQuizFor(engine.sess.dayKey);
      const correct = !!(q.opts[i] && q.opts[i].ok);
      const { xp, capped } = payQuizQuestion(quizQuestionKey("coach", q.id), correct);
      engine.sess.quizXp = xp;    // the done screen quotes what was actually banked
      engine.sess.quizCapped = capped;
      if (xp > 0) {
        // Quiz XP is priced by the quiz LEDGER, and rebuildJourneyXp adds the
        // ledger to the session log. Folding it into the session's xpEarned as
        // well meant every rebuild counted it twice — 360 + 30 came back as
        // 420. It rides on the record as its own field, for display only.
        if (addXp(xp).leveledUp && pendingDrawCount() > 0) engine.sess.leveledUp = true;
        patchSession(engine.sess.savedKey, { quizXp: xp });
        engine.mirrorSessionPatch({ quizXp: xp });
        publishJourney();
      }
      render();
    }
  },
  /* Reading the instructions PAUSES the run. The countdown is derived from a
     wall-clock deadline, so it used to keep going — and could finish the
     exercise, or the whole block — while she was reading, or off in a YouTube
     tab watching the demo. Closing asks for a deliberate Resume rather than
     dropping her back into a clock that never stopped. */
  openDetail(ex) {
    if (!ex) return;
    state.detailEx = ex;
    state.detailOverlay = true;
    // Named reason, not a borrowed user pause: reading a move must not be
    // announced out loud, and must not count as her stopping for a breather.
    engine.pauseSession("instructions");
    render();
  },
  openDetailCur() { actions.openDetail(engine.sess.currentEx); },
  openDetailAt(arg) {
    const [ci, ei] = arg.split("|").map(Number);
    const c = engine.sess.circuits[ci];
    if (c && c.exercises[ei]) actions.openDetail(c.exercises[ei]);
  },
  watchVideo() {
    // The link opens in a new tab on its own; all this has to do is make sure
    // the clock is stopped before she leaves.
    engine.pauseSession("video");
  },
  /* Closing the instructions and RESUMING the workout are two different
     intentions. The ✕ and a tap on the backdrop are how you dismiss something
     you opened by accident, or close it to keep reading the move on the card —
     they must not start the clock again. Only the Resume button does that. */
  closeDetail() {
    state.detailOverlay = false; state.detailEx = null;
    render();
  },
  resumeFromDetail() {
    state.detailOverlay = false; state.detailEx = null;
    // Releases only the pause the instructions took. A session she had already
    // paused herself, or left open on a video, stays paused.
    engine.resumeSession("instructions");
    engine.resumeSession("video");
    render();
  },
  openPrizeDraw() {
    if (pendingDrawCount() < 1) return;
    state.prizeDraw = newPrizeDraw();
    render();
  },
  redeemPrize(arg) {
    toggleRedeem(arg);
    render();
    // Redemption is the half of a prize's life that must reach the other
    // device promptly — until it did, the same prize could be spent twice.
    publishJourney();
    // The undo window closes on a timer, not on a tap, so schedule the repaint
    // that retires the button — otherwise it keeps offering an undo the store
    // would refuse.
    clearTimeout(undoTimer);
    undoTimer = setTimeout(render, REDEEM_UNDO_MS + 1000);
  },
  logScope(arg) { state.logScope = arg; render(); },
  progressScope(arg) { state.progressScope = arg; render(); },

  /* ---- grown-up zone ---- */
  setGuTab(arg) { state.grownupTab = arg; render(); },

  /* ---- the grown-up gate --------------------------------------------------
     See js/gate.js for what the PIN and the passkey are each worth. There is no
     arithmetic here any more: a sum a 10-year-old can do was authorizing both
     the first PIN and every reset, which made the PIN worth exactly that sum. */

  /* One place where an unlock becomes real, whichever way it was proved. */
  answerGate(arg) {
    if (!state.gateAsk) return;
    const mode = gateMode();
    let opened = false;
    if (mode === "pin") {
      opened = answerPin(arg);
      if (!opened) state.gateError = "That's not the PIN.";
    } else if (mode === "setPin") {
      opened = choosePin(arg);
      if (!opened) state.gateError = pinRefusalReason();
    } else {
      // "passkey" — nothing to type; the ceremony is the answer.
      return;
    }
    if (!opened) { render(); return; }
    finishUnlock();
  },
  submitGate() {
    const mode = gateMode();
    const inp = root.querySelector(`[data-input="${mode === "pin" ? "gatePin" : "gateNewPin"}"]`);
    dispatch("answerGate", inp ? inp.value : "");
  },

  /* The passkey ceremony: Face ID / Touch ID / the device's own passcode. It is
     async, which is why it is its own action rather than a branch of answerGate
     — the guard itself stays synchronous. */
  unlockWithPasskey() {
    if (!state.gateAsk || state.gateBusy) return;
    state.gateBusy = true;
    state.gateError = "";
    render();
    verifyPasskey().then(ok => {
      state.gateBusy = false;
      if (!ok) { state.gateError = "That didn't confirm a grown-up. Try again."; render(); return; }
      // A passkey proves an adult is here. If there is no PIN yet, or she came
      // in through "Forgot the PIN", the next thing to do is choose one.
      if (state.gateWantsNewPin || !hasGrownupPin()) { allowPinChoice(); state.gateWantsNewPin = true; render(); return; }
      finishUnlock();
    }).catch(() => {
      state.gateBusy = false;
      state.gateError = "That didn't confirm a grown-up. Try again.";
      render();
    });
  },

  /* Enrol this device's passkey. Offered from the Zone's settings, and from the
     gate card on first setup — a PIN with no passkey behind it has NO reset. */
  enrollPasskey() {
    if (state.gateBusy) return;
    state.gateBusy = true;
    state.passkeyNote = "";
    render();
    enrollPasskey(settings.athleteName || "Splash").then(ok => {
      state.gateBusy = false;
      state.passkeyNote = ok
        ? "Passkey enrolled on this device. If the PIN is ever forgotten, this is how you get back in."
        : "This device or browser wouldn't set up a passkey. The PIN still works — but there is no way to reset it if it is forgotten, so write it down.";
      state.passkeyNoteOk = !!ok;
      render();
    }).catch(() => {
      state.gateBusy = false;
      state.passkeyNote = "This device or browser wouldn't set up a passkey. The PIN still works — but there is no way to reset it if it is forgotten, so write it down.";
      state.passkeyNoteOk = false;
      render();
    });
  },
  forgetPasskey() {
    forgetPasskey();
    state.passkeyNote = "Passkey removed from this device.";
    state.passkeyNoteOk = true;
    render();
  },

  /* "Forgot the PIN?" — the passkey is the only way through. The old PIN stays
     put until a new one actually replaces it, so cancelling here cannot leave
     the app with no PIN at all, which would be a bypass rather than a recovery. */
  forgotPin() {
    state.gateWantsNewPin = true;
    state.gateError = "";
    render();
  },
  cancelGate() {
    state.gateAsk = null; state.gateError = ""; state.gatePayload = null;
    state.pendingAction = null; state.gateWantsNewPin = false; state.gateBusy = false;
    clearPinChoice();
    render();
  },
  confirmRestore() {
    const p = state.pendingRestore;
    if (!p || !p.file) return;
    runRestore(p.file, { force: true });
  },
  cancelRestore() { state.pendingRestore = null; state.backupNote = ""; render(); },
  /* Repairing IDs and repairing a wrongly-redeemed prize are two different
     jobs, and the app used to report the first as if it were the second:
     backfilling a missing timestamp was announced as a "stuck used prize
     unstuck" while the prize stayed firmly used. */
  repairWallet() {
    const { reissued, dated } = repairPrizeWallet();
    publishJourney();
    const parts = [];
    if (reissued) parts.push(reissued + " duplicate or missing ID" + (reissued === 1 ? "" : "s") + " fixed");
    if (dated) parts.push(dated + " redemption date" + (dated === 1 ? "" : "s") + " filled in");
    const stillRedeemed = redeemedPrizesForReview().length;
    state.walletRepairNote = parts.length
      ? "Repaired: " + parts.join(", ") + ". Nothing she earned was removed."
      : "Nothing to repair — every prize already has a unique ID and a proper redemption date.";
    if (stillRedeemed) {
      state.walletRepairNote += " " + stillRedeemed + " prize" + (stillRedeemed === 1 ? " is" : "s are")
        + " marked used. The app can't tell which of those she actually spent — open the review to restore any that are wrong.";
    }
    render();
  },
  reviewPrizes() {
    state.prizeReviewOpen = true;
    render();
  },
  closePrizeReview() { state.prizeReviewOpen = false; state.walletRepairNote = ""; render(); },
  restorePrize(arg) {
    const r = restorePrize(arg);
    publishJourney();
    state.walletRepairNote = r.restored
      ? "Restored “" + (r.label || "that prize") + "”. It is available again on every device, and the corrupted copy can't come back."
      : r.reason === "not-redeemed" ? "That prize was already available — nothing to restore."
      : "Couldn't find that prize to restore.";
    render();
  },
  setGsScope(arg) { state.gsScope = arg; render(); },
  formCheckMonth(arg) { state.formCheckMonth = arg; render(); },
  // A form verdict is the parent's own observation of how she moves — it feeds
  // the valgus gate and the technique reports, so she cannot grade herself.
  formCheckPass(arg) { recordFormVerdict(arg, true, state.formCheckMonth); render(); },
  formCheckFail(arg) { recordFormVerdict(arg, false, state.formCheckMonth); render(); },
  setVoiceStyle(arg) { updateSettings({ voiceStyle: arg }); render(); },
  bumpRest(arg) {
    const [key, step, min, max] = arg.split("|");
    const next = Math.min(Number(max), Math.max(Number(min), (settings[key] || 0) + Number(step)));
    updateSettings({ [key]: next });
    render();
  },
  // Both of these hand her entire training history to whoever asked for it.
  exportCsv() { exportCsv(); },
  downloadBackup() {
    const p = downloadBackup();
    const n = (p.data[LS_SESSIONS] || []).length;
    state.backupNote = `Backup downloaded — ${n} session${n === 1 ? "" : "s"} and everything ${p.profile.name} has earned.`;
    state.backupNoteOk = true;
    render();
  },
  toggleGate() {
    // The valgus gate decides whether she is jumping at all. That is not hers.
    const g = loadGate();
    g.unlocked = !g.unlocked;
    saveGate(g);
    render();
  },
  setLadderRung(arg) {
    const [name, lvl] = arg.split("|");
    const rungs = loadLadderRungs();
    rungs[name] = Number(lvl);
    saveLadderRungs(rungs);
    render();
  },
  saveTrackerWeek() {
    const t = loadTracker();
    const wk = "week" + getCurrentTrackerWeek();
    t[wk] = t[wk] || {};
    root.querySelectorAll('[data-input="pr"]').forEach(inp => {
      if (inp.value !== "") t[wk][inp.dataset.key] = Number(inp.value);
      else delete t[wk][inp.dataset.key];
    });
    saveTracker(t);
    render();
  },
  pickEngagement(arg) { setEngagementPick(arg); render(); },
  addPrizePoolItem() {
    const inp = root.querySelector('[data-input="newPrize"]');
    const text = (inp && inp.value || "").trim();
    if (!text) return;
    const m = text.match(/^(\p{Extended_Pictographic}(?:️)?)\s*(.*)$/u);
    const item = m && m[2] ? { icon: m[1], label: m[2] } : { icon: "🎁", label: text };
    const pool = (Array.isArray(settings.prizePool) && settings.prizePool.length)
      ? settings.prizePool.slice() : buildGrownupVM(state).prizePool.slice();
    pool.push(item);
    updateSettings({ prizePool: pool });
    render();
  },
  removePrizePoolItem(arg) {
    const pool = buildGrownupVM(state).prizePool.slice();
    pool.splice(Number(arg), 1);
    updateSettings({ prizePool: pool });
    render();
  },
  resetPrizePool() { updateSettings({ prizePool: null }); render(); },
  /* These two used to live in raw DOM listeners, outside the action layer
     entirely — which is how renaming the athlete asked nobody, and how
     restoring a backup OVER LIVE HISTORY asked nobody. They are ordinary
     actions now, so they are authorized by the same dispatch as everything
     else and cannot be reached any other way. */
  renameAthlete(arg) {
    const name = String(arg == null ? "" : arg).trim() || "Jess";
    updateSettings({ athleteName: name });
    renameProfile(activeProfileId(), name);
  },
  restoreBackup(arg) {
    if (!arg) return;
    state.pendingRestore = null;
    runRestore(arg, {});
  },

  exitSession() {
    engine.exitSession();
    // The engine disarms try-it when a run finalizes; mirror that into the view
    // state so the button and badges are right the moment we leave the session.
    state.inSession = false;
    state.pendingSession = null;
    state.detailOverlay = false;
    state.nav = "today";
    state.selectedDay = edmontonDayKey();
    // The unlock does not follow her back out of the Grown-up Zone.
    lockGate();
    state.gateAsk = null; state.prizeReviewOpen = false;
    render();
  }
});

function startPendingSession(pending) {
  state.readiness = null;
  state.pendingSession = pending;
  state.inSession = true;
  render();
  engine.startSession(pending);
}

root.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el || !root.contains(el)) return;
  // A data-stop-propagation wrapper (e.g. a modal card inside a click-to-close
  // overlay) swallows clicks that would otherwise trigger its ancestor's action.
  const stopEl = e.target.closest("[data-stop-propagation]");
  if (stopEl && el.contains(stopEl) && el !== stopEl) return;
  // A real link (the "watch the move" demo) must still navigate — its action
  // only stops the clock before she leaves the tab.
  const isLink = el.tagName === "A" && el.getAttribute("href");
  if (!isLink) e.preventDefault();
  // By NAME, through the one guard. This listener used to look the function up
  // and call it with no check of its own.
  dispatch(el.dataset.action, el.dataset.arg, el);
});

// Settings name edits flow straight back into the greeting. Saved on every
// keystroke; the greeting picks it up on the next render (no re-render here —
// replacing the DOM mid-blur would swallow the tap that moved focus away).
root.addEventListener("input", e => {
  if (e.target.matches && e.target.matches('[data-input="athleteName"]')) {
    dispatch("renameAthlete", e.target.value);
  }
});

/* Restoring a backup rewrites storage under the app's feet — settings and the
   engine hold module-level copies — so the page reloads once the merge lands. */
function runRestore(file, opts) {
  restoreBackupFile(file, opts).then(res => {
    state.backupNote = res.message;
    state.backupNoteOk = true;
    state.pendingRestore = null;
    render();
    if (res.sessionsAdded || res.filled.length) setTimeout(() => location.reload(), 1200);
  }).catch(err => {
    state.backupNote = err.message || "That restore didn't work.";
    state.backupNoteOk = false;
    // A backup belonging to the OTHER athlete isn't rejected outright — a
    // grown-up may genuinely be moving her onto this device — but it takes a
    // deliberate second tap, because the merge cannot be undone.
    state.pendingRestore = err.identityMismatch ? { file, ...err.identityMismatch } : null;
    render();
  });
}

root.addEventListener("change", e => {
  if (!(e.target.matches && e.target.matches('[data-input="restoreBackup"]'))) return;
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  // The File rides along as the argument, so a deferred re-run after the
  // grown-up unlocks restores the file she actually chose.
  dispatch("restoreBackup", file);
});

window.addEventListener("resize", () => {
  const wide = computeIsWide();
  if (wide !== state.isWide) render();
});

/* Weather chip (Red Deer, same source as the old app) — cosmetic, fails silently. */
async function fetchWeather() {
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=52.1833&longitude=-113.8&current=temperature_2m,weather_code&timezone=America/Edmonton");
    const data = await r.json();
    const code = data.current.weather_code;
    const icon = code <= 1 ? "☀️" : code <= 3 ? "⛅" : code <= 48 ? "🌤" : code <= 67 ? "🌧" : code <= 86 ? "🌨" : "🌦";
    state.weather = { icon, temp: Math.round(data.current.temperature_2m), caption: "Pool day!" };
    if (!state.inSession) render();
  } catch { /* keep the placeholder chip */ }
}

function boot() {
  onStorageError(() => {
    state.storageError = { name: settings.athleteName || "your athlete" };
    if (!state.inSession) render();
  });
  migrate();
  // Try-it survives a reload now (it lives in settings), and expires on its own
  // if it was armed hours ago and never used.
  if (!state.selectedDay) state.selectedDay = edmontonDayKey();
  render();
  fetchWeather();
  // Pull anything this device is missing back out of the cloud mirror (a wiped
  // or brand-new browser starts empty, but the history is still up there), then
  // repaint so the restored streak / XP / log show up straight away.
  restoreFromCloud().then(() => {
    // The XP total is rebuilt from the synced sources, so repaint regardless.
    if (!state.inSession) render();
  });
}

boot();
