/* ============================================================
   MAIN — app state, render dispatcher, event delegation, boot.
   Screens are innerHTML render functions in js/screens/*; their
   dynamic values come from pure view-model builders in js/vm/*.
   Buttons carry data-action / data-arg attributes handled by one
   delegated click listener below.
   ============================================================ */

import { migrate, settings, updateSettings, saveReadiness, addXp, patchSession, pendingDrawCount, noteSessionXpAwarded, onStorageError, payQuizQuestion, quizQuestionKey } from "./store.js";
import { edmontonDayKey, escapeHtml } from "./util.js";
import { restoreFromCloud } from "./sync.js";
import { downloadBackup, restoreBackupFile } from "./backup.js";
import { buildTodayVM, journeyPathScrollIntoView } from "./vm/today.js";
import { todayWide, todayNarrow } from "./screens/today.js";
import { page, shellWithRail, bottomNav } from "./screens/shell.js";
import { newReadinessFlow, answerQuestion, sameAsYesterday, setZoneSev, resetBodyCheck, confirmGrownup, buildReadinessVM } from "./vm/readiness.js";
import { readinessScreen } from "./screens/readiness.js";
import * as engine from "./engine.js";
import { buildSessionVM, sessionQuizFor } from "./vm/session.js";
import { sessionScreen, updateSessionTick } from "./screens/session.js";
import { buildQuizDeck, answerQuizDeck, finishQuizDeck, quizDeckHtml, newPrizeDraw, claimPrize, prizeDrawHtml } from "./screens/overlays.js";
import { buildProgressVM, toggleRedeem } from "./vm/progress.js";
import { progressScreen } from "./screens/progress.js";
import { buildGrownupVM, exportCsv } from "./vm/grownup.js";
import { grownupScreen } from "./screens/grownup.js";
import { loadGate, saveGate, loadLadderRungs, saveLadderRungs, loadTracker, saveTracker, getCurrentTrackerWeek, setEngagementPick, switchProfile, addProfile, renameProfile, activeProfileId, LS_SESSIONS } from "./store.js";

export const state = {
  nav: "today",                 // 'today' | 'progress' | 'grownup'
  grownupTab: "overview",       // 'overview' | 'analytics' | 'library' | 'settings' | 'coaching'
  gsScope: "week",
  logScope: "week",
  expanded: {},                 // day-card block expansion
  selectedDay: null,            // monday..sunday
  practiceMode: false,
  inSession: false,
  readiness: null,              // active readiness-check flow state (null = not in flow)
  pendingSession: null,         // { light, dayKey, mini?, practice? } — readiness → session handoff
  quizDeck: null,
  prizeDraw: null,
  detailOverlay: false,
  detailEx: null,
  weather: null,                // { icon, temp, caption } once fetched
  backupNote: "", backupNoteOk: false,   // result line under Backup & restore
  storageError: null,           // { name } — set when a write is rejected (disk full)
  isWide: true
};

const root = document.getElementById("app");

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

function overlaysHtml() {
  let html = storageBannerHtml();
  if (state.quizDeck) html += quizDeckHtml(state.quizDeck);
  if (state.prizeDraw) html += prizeDrawHtml(state.prizeDraw);
  return html;
}

export function render() {
  state.isWide = computeIsWide();
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

const actions = {
  nav(arg) { state.nav = arg; render(); },
  dismissStorageError() { state.storageError = null; render(); },
  // Switching athlete swaps every storage namespace; a reload is the only way
  // to be sure no module is still holding the previous kid's data.
  pickAthlete(arg) { if (arg !== activeProfileId() && switchProfile(arg)) location.reload(); },
  addAthlete() {
    const inp = root.querySelector('[data-input="newProfile"]');
    const name = (inp && inp.value || "").trim();
    if (!name) return;
    const id = addProfile(name);
    if (id && switchProfile(id)) location.reload();
  },
  selectDay(arg) { state.selectedDay = arg; state.expanded = {}; render(); },
  toggleBlock(arg) { state.expanded[arg] = !state.expanded[arg]; render(); },
  toggleCoachVoice() { updateSettings({ coachVoiceOn: !settings.coachVoiceOn }); render(); },
  togglePractice() { state.practiceMode = !state.practiceMode; render(); },
  goSession(arg) {
    state.readiness = newReadinessFlow(arg || state.selectedDay || edmontonDayKey(), state.practiceMode);
    render();
  },
  goSessionPractice(arg) {
    state.readiness = newReadinessFlow(arg || state.selectedDay || edmontonDayKey(), true);
    render();
  },
  startMini(arg) {
    startPendingSession({ light: "green", dayKey: arg || state.selectedDay, mini: true, practice: state.practiceMode });
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
    if (qd.idx >= qd.qs.length - 1) { qd.done = true; finishQuizDeck(qd); }
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
  rGrownupOk() { confirmGrownup(state.readiness); render(); },
  rPickLight(arg) { state.readiness.light = arg; state.readiness.overridden = true; render(); },
  rExit() { state.readiness = null; render(); },
  rResultCta(arg) {
    const r = state.readiness;
    if (arg === "back") { state.readiness = null; render(); return; }
    if (arg === "retry") { resetBodyCheck(r); render(); return; }
    // continue: persist the check (try-it runs don't overwrite the real day's
    // check), then hand the resolved light to the session
    if (!r.practice) saveReadiness({ answers: r.answers, zoneSev: r.zoneSev, light: r.light, overridden: r.overridden });
    startPendingSession({ light: r.light || "green", dayKey: r.dayKey, practice: r.practice });
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
    if (first && !engine.sess.practice && engine.sess.savedEntry) {
      const q = sessionQuizFor(engine.sess.dayKey);
      const correct = !!(q.opts[i] && q.opts[i].ok);
      const { xp, capped } = payQuizQuestion(quizQuestionKey("coach", q.id), correct);
      engine.sess.quizXp = xp;    // the done screen quotes what was actually banked
      engine.sess.quizCapped = capped;
      if (xp > 0) {
        engine.sess.xpEarned = (engine.sess.xpEarned || 0) + xp;
        if (addXp(xp).leveledUp) engine.sess.leveledUp = true;
        noteSessionXpAwarded(xp);   // it lands on the session record via xpEarned below
        patchSession(engine.sess.savedKey, { xpEarned: engine.sess.xpEarned });
      }
      render();
    }
  },
  openDetailCur() { state.detailEx = engine.sess.currentEx; state.detailOverlay = true; render(); },
  openDetailAt(arg) {
    const [ci, ei] = arg.split("|").map(Number);
    const c = engine.sess.circuits[ci];
    if (c && c.exercises[ei]) { state.detailEx = c.exercises[ei]; state.detailOverlay = true; render(); }
  },
  closeDetail() { state.detailOverlay = false; state.detailEx = null; render(); },
  openPrizeDraw() {
    if (pendingDrawCount() < 1) return;
    state.prizeDraw = newPrizeDraw();
    render();
  },
  redeemPrize(arg) { toggleRedeem(arg); render(); },
  logScope(arg) { state.logScope = arg; render(); },

  /* ---- grown-up zone ---- */
  setGuTab(arg) { state.grownupTab = arg; render(); },
  setGsScope(arg) { state.gsScope = arg; render(); },
  setVoiceStyle(arg) { updateSettings({ voiceStyle: arg }); render(); },
  bumpRest(arg) {
    const [key, step, min, max] = arg.split("|");
    const next = Math.min(Number(max), Math.max(Number(min), (settings[key] || 0) + Number(step)));
    updateSettings({ [key]: next });
    render();
  },
  exportCsv() { exportCsv(); },
  downloadBackup() {
    const p = downloadBackup();
    const n = (p.data[LS_SESSIONS] || []).length;
    state.backupNote = `Backup downloaded — ${n} session${n === 1 ? "" : "s"} and everything ${p.profile.name} has earned.`;
    state.backupNoteOk = true;
    render();
  },
  toggleGate() {
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
  exitSession() {
    engine.exitSession();
    state.inSession = false;
    state.pendingSession = null;
    state.detailOverlay = false;
    state.nav = "today";
    state.selectedDay = edmontonDayKey();
    render();
  }
};

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
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset.arg, el); }
});

// Settings name edits flow straight back into the greeting. Saved on every
// keystroke; the greeting picks it up on the next render (no re-render here —
// replacing the DOM mid-blur would swallow the tap that moved focus away).
root.addEventListener("input", e => {
  if (e.target.matches && e.target.matches('[data-input="athleteName"]')) {
    const name = e.target.value.trim() || "Jess";
    updateSettings({ athleteName: name });
    renameProfile(activeProfileId(), name);
  }
});

/* Restoring a backup rewrites storage under the app's feet — settings and the
   engine hold module-level copies — so the page reloads once the merge lands. */
root.addEventListener("change", e => {
  if (!(e.target.matches && e.target.matches('[data-input="restoreBackup"]'))) return;
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  restoreBackupFile(file).then(res => {
    state.backupNote = res.message;
    state.backupNoteOk = true;
    render();
    if (res.sessionsAdded || res.filled.length) setTimeout(() => location.reload(), 1200);
  }).catch(err => {
    state.backupNote = err.message || "That restore didn't work.";
    state.backupNoteOk = false;
    render();
  });
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
  if (!state.selectedDay) state.selectedDay = edmontonDayKey();
  render();
  fetchWeather();
  // Pull anything this device is missing back out of the cloud mirror (a wiped
  // or brand-new browser starts empty, but the history is still up there), then
  // repaint so the restored streak / XP / log show up straight away.
  restoreFromCloud().then(({ added }) => {
    if (added && !state.inSession) render();
  });
}

boot();
