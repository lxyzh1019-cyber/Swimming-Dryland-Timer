/* ============================================================
   MAIN — app state, render dispatcher, event delegation, boot.
   Screens are innerHTML render functions in js/screens/*; their
   dynamic values come from pure view-model builders in js/vm/*.
   Buttons carry data-action / data-arg attributes handled by one
   delegated click listener below.
   ============================================================ */

import { migrate, settings, updateSettings, saveReadiness, addXp, patchSession, pendingDrawCount, onStorageError, payQuizQuestion, quizQuestionKey, REDEEM_UNDO_MS, migratePrizeAmnesty } from "./store.js";
import { edmontonDayKey, escapeHtml } from "./util.js";
import { APP_NAME, ATHLETE_DEFAULT, COPY } from "./sport.js";
import { DAYS } from "./data.js";
import { restoreFromCloud, publishJourney, publishReadiness } from "./sync.js";
import { downloadBackup, restoreBackupFile } from "./backup.js";
import { buildTodayVM, journeyPathScrollIntoView } from "./vm/today.js";
import { layoutFor } from "./layout.js";
import { todayWide, todayNarrow } from "./screens/today.js";
import { page, shellWithRail, bottomNav } from "./screens/shell.js";
import { newReadinessFlow, answerQuestion, setZoneSev, resetBodyCheck, confirmGrownup, buildReadinessVM, mayStartFromReadiness } from "./vm/readiness.js";
import { readinessScreen } from "./screens/readiness.js";
import * as engine from "./engine.js";
import { buildSessionVM, sessionQuizFor, sessionListScrollIntoView } from "./vm/session.js";
import { sessionScreen, updateSessionTick } from "./screens/session.js";
import { buildQuizDeck, answerQuizDeck, finishQuizDeck, quizDeckHtml, newPrizeDraw, claimPrize, prizeDrawHtml } from "./screens/overlays.js";
import { buildProgressVM, toggleRedeem } from "./vm/progress.js";
import { progressScreen } from "./screens/progress.js";
import { buildGrownupVM, exportCsv } from "./vm/grownup.js";
import { grownupScreen } from "./screens/grownup.js";
import { requireGrownup, answerPin, choosePin, allowPinChoice, clearPinChoice,
         pinRefusalReason, gateMode, lockGate, gateUnlocked, unlockByPasskey,
         hasGrownupPin, isFreshDevice, PIN_MIN_DIGITS, PIN_MAX_DIGITS,
         GATE_REASON, GATE_UNLOCK_MS, setBootstrapState, bootstrapState, gateNeedsOfflineSetup } from "./gate.js";
import { passkeySupported, hasPasskey, enrollPasskey, verifyPasskey, forgetPasskey } from "./passkey.js";
import { loadSessions } from "./store.js";
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
  startNote: "",                // one-line reason a GO could not start, shown on the day card
  redoPartials: false,          // this GO also wants back the moves she cut short
  inSession: false,
  readiness: null,              // active readiness-check flow state (null = not in flow)
  pendingSession: null,         // { light, dayKey } — readiness → session handoff
  quizDeck: null,
  prizeDraw: null,
  detailOverlay: false,
  detailEx: null,
  moveReviewOpen: false,        // the finish screen's "See every move" list
  weather: null,                // { icon, temp, caption } once fetched
  backupNote: "", backupNoteOk: false,   // result line under Backup & restore
  walletRepairNote: "",         // result line under the prize wallet repair
  pendingRestore: null,         // { file, from, to } — a backup from another athlete, awaiting confirmation
  storageError: null,           // { name } — set when a write is rejected (disk full)
  /* Set from layoutFor() on every paint — see computeLayout. isTablet and
     tightColumn used to be absent entirely, which read as `undefined` and so as
     false: the session screen asked for them, got nothing, and every iPad drew
     the desktop proportions or the phone layout. */
  isWide: true, isTablet: false, tightColumn: false,
  railOpen: true,               // the session rail; collapsed by hand, never on its own
  watchOpen: false              // the ❗ beside the coach tip
};

const root = document.getElementById("app");
let undoTimer = null;              // repaints the prize wallet when an undo window closes

/* The one place the viewport is measured. The rule itself lives in layout.js so
   a test can ask it about a device without a browser — but a pure function
   nothing calls is just a well-tested opinion, so this is the call. */
function computeLayout() {
  return layoutFor(window.innerWidth, window.innerHeight);
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
  // The whole screen is replaced on every phase change, so the exercise list
  // comes back scrolled to the top unless something puts it back.
  sessionListScrollIntoView(root);
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
    : mode === "checking" ? `
      <div style="font-size:15px;font-weight:800;color:var(--ink);margin-bottom:4px;">Checking for this family's history…</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.5;">This device has no training on it yet. Before it offers to set a new grown-up PIN, it checks whether the family already has one — a wiped or brand-new iPad looks identical to a first-ever setup until that answer comes back. One moment.</div>`
    : mode === "setPin" ? `
      ${gateNeedsOfflineSetup() ? `<div style="background:var(--sun-wash);border:2px solid var(--sun);border-radius:12px;padding:11px 13px;margin-bottom:10px;font-size:13px;font-weight:800;color:var(--sun-ink);line-height:1.45;">⚠️ This device could not reach the family's saved history, so it cannot tell whether a grown-up PIN already exists somewhere else. Setting one here creates a NEW setup. If this family has used the app before, connect to the internet and reopen the app instead.</div>` : ""}
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
          /* THE RESTORED-DEVICE DEAD END. The PIN and the passkey are both
             device-local by design, so a second iPad, a reinstall or cleared
             browser data restores the family's history from the cloud and has
             neither. This card used to say "set one up on a device that
             already has a grown-up unlocked" — impossible, a passkey cannot
             travel — and offered only Cancel. Enrolling a passkey HERE is the
             honest way through: the platform demands Face ID / Touch ID / the
             device passcode to enrol, which is the same adult proof the
             ceremony gives, and the enrol handler then grants the PIN choice. */
          ? (state.gateWantsNewPin
              ? "There is no passkey on this device, so there is nothing yet to confirm with. Set one up now: confirming with Face ID, Touch ID or the device passcode proves a grown-up is here, and then you choose a new PIN for this device."
              : "This device has the family's training history, but no grown-up PIN has been set on it yet — the PIN and the passkey stay on the device they were made on, so a restored device starts without them. Set up a passkey now: confirming with Face ID, Touch ID or the device passcode proves a grown-up is here, and then you choose a PIN for this device.")
          : (state.gateWantsNewPin
              ? "This browser has no passkey support, so a forgotten PIN cannot be reset here. Open the app in Safari or Chrome on this device, or restore on a device that has one."
              : "This device has the family's training history but no grown-up PIN yet, and this browser has no passkey support, so there is no way to prove a grown-up is here. Open the app in Safari or Chrome on this device, or restore on a device that has one.")}</div>
      ${hasPasskey() ? btn("unlockWithPasskey", state.gateBusy ? "Waiting for the device…" : "🔐 Confirm with this device", true)
        : passkeySupported() ? btn("enrollPasskey", state.gateBusy ? "Waiting for the device…" : "🔐 Set up a passkey on this device", true) : ""}
      ${state.passkeyNote ? `<div style="margin-top:8px;font-size:13px;font-weight:800;line-height:1.45;color:${state.passkeyNoteOk ? "var(--mint-ink)" : "var(--stop-ink)"};">${escapeHtml(state.passkeyNote)}</div>` : ""}`;

  return `<div style="position:fixed;inset:0;z-index:210;background:rgba(20,59,74,0.62);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--font-ui);">
    <div data-stop-propagation="1" style="background:var(--surface);border-radius:20px;padding:22px 24px;max-width:380px;width:100%;box-shadow:0 18px 40px rgba(20,59,74,0.3);">
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--ink);margin-bottom:6px;">Grown-up check</div>
      <div style="font-size:13px;font-weight:800;color:var(--ink-soft);line-height:1.5;margin-bottom:14px;">A grown-up needs to be here to ${escapeHtml(reason)}.</div>
      ${body}
      ${state.gateError ? `<div role="alert" style="margin-top:8px;font-size:13px;font-weight:800;color:var(--stop-ink);line-height:1.45;">${escapeHtml(state.gateError)}</div>` : ""}
      <div style="display:flex;gap:10px;margin-top:14px;">
        ${mode === "passkey" || mode === "checking" ? "" : btn("submitGate", mode === "setPin" ? "Set PIN" : "Unlock", true)}
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

/* WHAT A FULL RE-RENDER WOULD LOSE, and how it is given back.

   Every render replaces the whole page. That is the simplest possible model
   and it has one cost: anything the DOM was holding that the state was not.
   A half-typed athlete name, a prize being written, the caret position, the
   scrolled position of a tab strip — a background render (the weather
   arriving, a cloud restore finishing, the redeem-undo timer retiring a
   button, a passkey ceremony completing) wiped all of them mid-keystroke.
   Inputs are addressed by `data-input` (and `data-key` where one name covers a
   row of fields), so the same field can be found again in the new page. */
function captureFocus() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el || !el.dataset || !el.dataset.input || el.type === "file") return null;
  return { input: el.dataset.input, key: el.dataset.key || "", value: el.value,
           start: el.selectionStart, end: el.selectionEnd };
}
function captureScroll() {
  return [...(root.querySelectorAll("[data-tab-scroll]") || [])].map(el => el.scrollLeft || 0);
}
function restoreView(focus, scroll) {
  [...(root.querySelectorAll("[data-tab-scroll]") || [])].forEach((el, i) => { if (scroll[i]) el.scrollLeft = scroll[i]; });
  if (!focus) return;
  const sel = `[data-input="${focus.input}"]` + (focus.key ? `[data-key="${focus.key}"]` : "");
  const el = root.querySelector(sel);
  if (!el) return;
  if (el.value !== focus.value) el.value = focus.value;
  try {
    el.focus({ preventScroll: true });
    if (focus.start != null && typeof el.setSelectionRange === "function") el.setSelectionRange(focus.start, focus.end);
  } catch (e) { /* a field that cannot take a selection (number inputs in some browsers) — the value is what matters */ }
}

export function render() {
  const focus = captureFocus();
  const scroll = captureScroll();
  paint();
  restoreView(focus, scroll);
}

function paint() {
  Object.assign(state, computeLayout());
  if (state.readiness) { renderReadiness(); }
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
  rGrownupOk: () => !!(state.readiness && state.readiness.grownupOk),
  // "Rest 1–2 min, then re-check" wipes the marks. A mild report (1–2) is hers
  // to redo; a severity-3 report is a pain record a grown-up has to see, and
  // clearing it used to be one ungated tap on the same button.
  rRetryCheck: () => { const s = Number(state.readiness && state.readiness.severity) || 0; return s > 0 && s < 3; }
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

/* THE UNLOCK ENDS ON SCREEN, not at the next tap. gateUnlocked() answers by
   the clock, so a page rendered while unlocked stayed up — Settings, the
   backup button, the prize review — until something else caused a render,
   however long after the five minutes that was. The timer repaints the moment
   the unlock lapses; the repaint then shows the locked Zone, because the
   screens ask gateUnlocked() themselves. Exported for the test that proves
   the timer is armed on unlock and dropped on lock. */
let gateTimer = null;
function armGateExpiry() {
  clearTimeout(gateTimer);
  gateTimer = setTimeout(() => { gateTimer = null; if (!gateUnlocked()) render(); }, GATE_UNLOCK_MS + 250);
}
function dropGateExpiry() { clearTimeout(gateTimer); gateTimer = null; }
export function gateExpiryArmed() { return gateTimer != null; }

/* Close the challenge and re-run whatever she asked for, now that a grown-up is
   here. The re-run goes back through dispatch, so an unlock that somehow did not
   take cannot slip an action past. */
function finishUnlock() {
  if (gateUnlocked()) armGateExpiry();
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
      lockGate(); dropGateExpiry();
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
  selectDay(arg) { state.selectedDay = arg; state.expanded = {}; state.startNote = ""; state.redoPartials = false; render(); },
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
    state.startNote = "";
    state.redoPartials = false;
    state.readiness = newReadinessFlow(dayKey);
    render();
  },
  /* "+ Add them back" — the same start, asking for the moves she tapped Done on
     early as well. They are held back by default (see bankMove and planResume
     in js/engine.js) so a rushed warm-up is not handed to her all over again;
     this is how she says she wants one back. */
  goSessionRedo(arg) {
    const dayKey = arg || state.selectedDay || edmontonDayKey();
    state.startNote = "";
    state.redoPartials = true;
    state.readiness = newReadinessFlow(dayKey);
    render();
  },
  /* EXPLORE — the workout screen with nothing counting down and nothing
     saved. Straight in, no Body Check: there is no load to check a body
     against. See runExplore in js/engine.js. */
  goExplore(arg) {
    const dayKey = arg || state.selectedDay || edmontonDayKey();
    state.startNote = "";
    state.redoPartials = false;
    state.readiness = null;
    state.selectedDay = dayKey;   // Done looking lands back on this day
    state.detailOverlay = false; state.detailEx = null;
    launchSession({ dayKey, mode: "explore" });
  },
  /* "✕ Done looking" — nothing to confirm and nothing to save. */
  exitExplore() {
    engine.endEarly();
    leaveSession({ keepDay: true });
  },
  goBack() { engine.goBackExercise(); },
  /* A tap on a move in the side list. Explore only — the engine refuses it
     anywhere else, because a real session's ledger is written in step order. */
  goToMove(arg) {
    const [ci, ei] = String(arg).split("|").map(Number);
    engine.jumpToExercise(ci, ei);
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
  closePrizeDraw() { state.prizeDraw = null; render(); },
  claimPrize() {
    const r = claimPrize(state.prizeDraw);
    // The draw is owed but cannot be settled yet: keep it open, say why.
    if (r && r.waiting) { render(); return; }
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
    // Re-checking goes back through dispatch, so the severity-3 rule applies
    // however the retry was reached.
    if (arg === "retry") { dispatch("rRetryCheck"); return; }
    /* THE SAFETY GATE, IN THE TRANSITION AND NOT ONLY IN THE MARKUP.

       A severity-3 body check needs a grown-up to say so before she trains.
       That was enforced by rendering the Continue button `disabled`, which is
       what a normal tap meets and nothing else: a stale screen, a replayed
       action or any future caller reached this handler with the gate wide open.
       The rule is asked here, of the one function that states it. */
    if (!mayStartFromReadiness(r)) { render(); return; }
    // continue: persist the check (try-it runs don't overwrite the real day's
    // check), then hand the resolved light to the session
    // Both decisions are saved: what the check produced, and what actually ran.
    // Storing only the final light is what made a grown-up's override
    // indistinguishable from the body's own answer in the history.
    const suggested = r.suggestedLight || r.light || "green";
    // Both inputs are stored, not just the one that won: a Yellow body map that
    // lost to a Recovery readiness score is the interesting part of that morning.
    const check = { answers: r.answers, zoneSev: r.zoneSev, light: r.light,
                    suggestedLight: suggested, severity: r.severity,
                    readinessLight: r.readinessLight || null,
                    bodyLight: r.bodyLight || null,
                    resultSource: r.resultSource, overridden: r.light !== suggested };
    saveReadiness(check);
    // A sore or non-green morning belongs on the grown-up's other device, and it
    // must get there whether or not a session follows this tap.
    publishReadiness();
    startPendingSession({ light: r.light || "green", dayKey: r.dayKey,
                          suggestedLight: suggested, readiness: check,
                          redoPartials: !!state.redoPartials });
  },
  rResultSecondary(arg) {
    if (arg === "retry") dispatch("rRetryCheck");
    else { state.readiness = null; render(); }
  },
  rRetryCheck() {
    if (!state.readiness) return;
    resetBodyCheck(state.readiness);
    render();
  },

  /* ---- session controls (delegate to the engine) ---- */
  advance() { engine.advance(); },
  pauseTimer() { engine.togglePause(); },
  skipEx() { engine.skipCurrentExercise(); },
  stopNow() { engine.openStopOverlay(); },
  resumeFromStop() { engine.resumeFromStop(); },
  endFromStop(arg) { engine.endFromStop(arg || "pain"); },
  toggleWatch() { state.watchOpen = !state.watchOpen; render(); },
  // "See every move" on the finish screen — the per-move review, collapsed by default.
  toggleMoveReview() { state.moveReviewOpen = !state.moveReviewOpen; render(); },
  toggleRail() { state.railOpen = state.railOpen === false; render(); },
  askRestart() { engine.sess.confirmRestart = true; render(); },
  cancelRestart() { engine.sess.confirmRestart = false; render(); },
  doRestart() { restartDay(); },
  askSkip() { engine.sess.confirmSkip = true; render(); },
  cancelSkip() { engine.sess.confirmSkip = false; render(); },
  confirmSkipEx() { engine.sess.confirmSkip = false; engine.skipCurrentExercise(); },
  pickIntent(arg) { engine.pickIntentWord(arg); },
  answerMicro(arg) { engine.answerMicroLoop(arg); },
  answerRepCheck(arg) { engine.answerRepCheck(arg); },
  pickClean() { engine.pickClean(); },
  pickWobbly() { engine.pickWobbly(); },
  skipFormCheck() { engine.skipFormCheck(); },
  pickMood(arg) { const [key, emoji] = arg.split("|"); engine.setMood(key, emoji); },
  reflectWell(arg) { engine.setReflect("wentWell", arg); },
  reflectNext(arg) { engine.setReflect("nextTime", arg); },
  quizPick(arg) {
    const i = Number(arg);
    // The first tap locks the card (setQuizPick refuses a second one too), so
    // a later tap on the green answer cannot turn a wrong pick into a right
    // one on screen while the ledger remembers the truth.
    const first = engine.sess.quizPick == null;
    if (!first) return;
    // No saved row means nothing to pay against — and a pick consumed here
    // wasted the question's XP for good. The finish screen is already showing
    // the "didn't save" note; the question stays open to pay another time.
    if (!engine.sess.savedEntry) return;
    engine.setQuizPick(i);
    // Priced off the same ledger as the Quiz Deck: a question pays +10 the
    // first time it's attempted and +25 the first time it's answered right,
    // and never again. The Coach's Quiz question rotates but the bank is only
    // six deep, so without the ledger this paid 25 XP a session forever for
    // re-answering questions the kid already knew.
    if (first && engine.sess.savedEntry) {
      const q = sessionQuizFor(engine.sess.dayKey);
      const correct = !!(q.opts[i] && q.opts[i].ok);
      // The question's OWN key, not always "coach". A training principle is
      // asked both here and in the Quiz Deck; keying it by where it was asked
      // would pay for the same understanding twice and count it twice toward
      // mastery.
      const { xp, capped } = payQuizQuestion(q.ledgerKey || quizQuestionKey("coach", q.id), correct);
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
    // (In explore the engine ignores this — nothing there is counting.)
    engine.pauseSession("instructions");
    render();
  },
  openDetailCur() { actions.openDetail(engine.sess.currentEx); },
  openDetailAt(arg) {
    const [ci, ei] = arg.split("|").map(Number);
    // The list is the DAY on a resume, not this sitting's remainder, so the row
    // index addresses `listCircuits` — the array the row was rendered from.
    const from = (engine.sess.listCircuits && engine.sess.listCircuits.length)
      ? engine.sess.listCircuits : engine.sess.circuits;
    const c = from[ci];
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
  /* The hold this leaves behind is released by the workout screen's own Resume
     (see togglePause) — it used to name only two reasons and left this one
     stranded, which is what made Resume inert after a ✕. */
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
    // If the iPad also went to sleep while the card was open, that hold is hers
    // to release too — this button says "resume my workout", and it has to mean
    // it however many reasons are stacked behind it.
    engine.resumeSession(engine.PAUSE_HIDDEN);
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
    /* From the gate card with no PIN to type (a device restored from the cloud
       has the history but neither PIN nor passkey), or from "Forgot the PIN?",
       a successful enrolment IS the adult proof: the platform demanded Face ID /
       Touch ID / the device passcode to create the credential, exactly what
       unlockWithPasskey would ask for next. So it earns the PIN choice the same
       way, and the card re-renders as "Choose a grown-up PIN". */
    const earnsPin = !!state.gateAsk && (state.gateWantsNewPin || !hasGrownupPin());
    const failNote = earnsPin
      ? "This device or browser wouldn't set up a passkey. Try again, or open the app in Safari or Chrome on this device."
      : "This device or browser wouldn't set up a passkey. The PIN still works — but there is no way to reset it if it is forgotten, so write it down.";
    enrollPasskey(settings.athleteName || APP_NAME).then(ok => {
      state.gateBusy = false;
      state.passkeyNote = ok
        ? (earnsPin ? "Passkey enrolled on this device. Now choose a PIN." : "Passkey enrolled on this device. If the PIN is ever forgotten, this is how you get back in.")
        : failNote;
      state.passkeyNoteOk = !!ok;
      if (ok && earnsPin) allowPinChoice();
      render();
    }).catch(() => {
      state.gateBusy = false;
      state.passkeyNote = failNote;
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
  setVoiceSpeed(arg) { updateSettings({ voiceSpeed: arg }); render(); },
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
    const name = String(arg == null ? "" : arg).trim() || ATHLETE_DEFAULT;
    updateSettings({ athleteName: name });
    renameProfile(activeProfileId(), name);
  },
  restoreBackup(arg) {
    if (!arg) return;
    state.pendingRestore = null;
    runRestore(arg, {});
  },

  exitSession() {
    // An explore walk-through ends on the day she was looking at; a real
    // session always lands back on today.
    leaveSession({ keepDay: !!engine.sess.explore });
  }
});

/* Back to Today from any session screen, with the engine reset first. */
function leaveSession({ keepDay = false } = {}) {
  engine.exitSession();
  state.inSession = false;
  state.pendingSession = null;
  state.detailOverlay = false; state.detailEx = null;
  state.nav = "today";
  if (!keepDay) state.selectedDay = edmontonDayKey();
  // The unlock does not follow her back out of the Grown-up Zone.
  lockGate(); dropGateExpiry();
  state.gateAsk = null; state.prizeReviewOpen = false;
  render();
}

/* THE ONE DOOR INTO A SESSION SCREEN, real or explore.

   The engine can refuse to start — a day whose every block is already banked
   under its light assembles nothing — and it says so by leaving `sess.running`
   false BEFORE its first await (see startSession). This used to be ignored:
   the screen had already been switched to the session, and she was left on a
   dead "Ready?" with a clock at zero and buttons wired to a runner that did not
   exist. A reload was the only way out. Now a refusal steps straight back to
   Today and says why. */
/* "I need to start over": bin this attempt and run the same day again.

   The relaunch cannot be the next statement — discardSession only ASKS the
   runner to stop, and the runner is several awaits from noticing. Starting
   here would hit startSession's `if (sess.running) return` and quietly do
   nothing, leaving her on a dead finish screen. So we wait on the run's own
   promise, which resolves after finalize has cleaned up. */
async function restartDay() {
  const again = state.pendingSession ? { ...state.pendingSession } : null;
  const finished = sessionRun;
  engine.discardSession();
  await finished;
  engine.exitSession();
  if (!again) { leaveSession(); return; }
  state.detailOverlay = false; state.detailEx = null;
  state.watchOpen = false;
  launchSession(again);
  render();
}

let sessionRun = null;
function launchSession(pending) {
  state.pendingSession = pending;
  state.inSession = true;
  render();
  /* Kept, because "start over" has to WAIT for this run to unwind before it
     can begin another: startSession refuses outright while one is running. */
  sessionRun = engine.startSession(pending);
  if (engine.sess.running) return;
  state.inSession = false;
  state.pendingSession = null;
  const day = DAYS[pending.dayKey];
  state.startNote = pending.mode === "explore"
    ? "There are no moves to look at for that day."
    : "Every block of " + ((day && day.title) || "that day") + " is already done for today's light — nothing left to finish. Tap Explore to look at the moves.";
  render();
}

function startPendingSession(pending) {
  state.readiness = null;
  launchSession(pending);
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
  const next = computeLayout();
  if (next.isWide !== state.isWide || next.isTablet !== state.isTablet
      || next.tightColumn !== state.tightColumn) render();
});

/* Weather chip (Red Deer, same source as the old app) — cosmetic, fails silently. */
async function fetchWeather() {
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=52.1833&longitude=-113.8&current=temperature_2m,weather_code&timezone=America/Edmonton");
    const data = await r.json();
    const code = data.current.weather_code;
    const icon = code <= 1 ? "☀️" : code <= 3 ? "⛅" : code <= 48 ? "🌤" : code <= 67 ? "🌧" : code <= 86 ? "🌨" : "🌦";
    state.weather = { icon, temp: Math.round(data.current.temperature_2m), caption: COPY.weatherCaption };
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
  settleBootstrap(restoreFromCloud());
}

/* WHAT THE RESTORE ACTUALLY ESTABLISHED, handed to the gate.

   Until the restore resolves, an empty session list says nothing about whether
   this family is new — see setBootstrapState in js/gate.js. A restore that
   brought rows back, or found the device already holding history, proves it
   is not; one that reached the mirror and found nothing proves it is; one
   that could not reach the mirror at all proves neither, and says so.

   It ALWAYS resolves. restoreFromCloud is written never to throw, but the gate
   card's "Checking for this family's history…" has no way out except this
   call, so a rejection — a thrown import, a bug in a merge step, anything —
   used to leave the gate on "checking" for the rest of the launch, with no
   button at all. A rejected restore is treated as "could not reach the
   mirror": the honest answer, and the one that still lets an adult set the
   device up. Exported so the rule can be tested without a live boot. */
export function settleBootstrap(restore) {
  const settle = (result) => {
    const reached = !!(result && result.reachedCloud);
    const hasHistory = (loadSessions() || []).length > 0;
    setBootstrapState(hasHistory ? "restored" : reached ? "empty" : "offline-unverified");
  };
  return Promise.resolve(restore).then(settle, (e) => {
    console.warn("Cloud restore failed:", e);
    settle(null);
  }).then(() => {
    /* A second amnesty pass, now that the other device's wallet has merged in:
       prizes it still held as spent have only just arrived. The cutoff was
       stamped on the first pass, so this forgives exactly the same set and
       cannot reach anything redeemed since. */
    try { migratePrizeAmnesty(); } catch (e) { console.warn("Prize amnesty skipped:", e); }
  }).finally(() => {
    // The XP total is rebuilt from the synced sources, and the gate may have
    // been waiting on this answer, so repaint regardless.
    if (!state.inSession) render();
  });
}

boot();
