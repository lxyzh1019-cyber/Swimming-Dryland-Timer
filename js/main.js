/* ============================================================
   MAIN — app state, render dispatcher, event delegation, boot.
   Screens are innerHTML render functions in js/screens/*; their
   dynamic values come from pure view-model builders in js/vm/*.
   Buttons carry data-action / data-arg attributes handled by one
   delegated click listener below.
   ============================================================ */

import { migrate, settings, updateSettings } from "./store.js";
import { edmontonDayKey } from "./util.js";
import { buildTodayVM, journeyPathScrollIntoView } from "./vm/today.js";
import { todayWide, todayNarrow } from "./screens/today.js";
import { page, shellWithRail, bottomNav } from "./screens/shell.js";

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

function renderPlaceholder(title) {
  const vm = buildTodayVM(state);   // for the rail
  const inner = `
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px;">
      <div style="text-align:center;">
        <img src="assets/poses/think.png" alt="" aria-hidden="true" style="height:120px;object-fit:contain;">
        <div style="font-family:var(--font-display);font-weight:600;font-size:30px;color:var(--ink);margin-top:12px;">${title}</div>
        <div style="font-size:15px;font-weight:700;color:var(--ink-soft);margin-top:6px;">Coming in the next build phase.</div>
      </div>
    </div>`;
  root.innerHTML = page(state.isWide
    ? shellWithRail(vm, inner)
    : `<div style="background:var(--surface);border-radius:24px;box-shadow:0 14px 34px rgba(20,59,74,0.16);display:flex;">${inner}</div>` + bottomNav(vm));
}

export function render() {
  state.isWide = computeIsWide();
  if (state.readiness) { renderPlaceholder("Readiness check"); return; }
  if (state.inSession) { renderPlaceholder("Session"); return; }
  if (state.nav === "progress") { renderPlaceholder("Progress"); return; }
  if (state.nav === "grownup") { renderPlaceholder("Grown-up zone"); return; }
  renderToday();
}

/* ---- delegated actions ---- */

const actions = {
  nav(arg) { state.nav = arg; render(); },
  selectDay(arg) { state.selectedDay = arg; state.expanded = {}; render(); },
  toggleBlock(arg) { state.expanded[arg] = !state.expanded[arg]; render(); },
  toggleCoachVoice() { updateSettings({ coachVoiceOn: !settings.coachVoiceOn }); render(); },
  togglePractice() { state.practiceMode = !state.practiceMode; render(); },
  goSession(arg) {
    state.readiness = { dayKey: arg || state.selectedDay || edmontonDayKey(), practice: state.practiceMode };
    render();
  },
  goSessionPractice(arg) {
    state.readiness = { dayKey: arg || state.selectedDay || edmontonDayKey(), practice: true };
    render();
  },
  startMini(arg) {
    state.pendingSession = { light: "green", dayKey: arg || state.selectedDay, mini: true, practice: state.practiceMode };
    render();
  },
  startQuizDeck() {
    state.quizDeck = { pending: true };   // built out in Phase 4
    render();
  }
};

root.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el || !root.contains(el)) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset.arg, el); }
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
  migrate();
  if (!state.selectedDay) state.selectedDay = edmontonDayKey();
  render();
  fetchWeather();
}

boot();
