/* ============================================================
   MAIN — app state, render dispatcher, event delegation, boot.
   Screens are innerHTML render functions in js/screens/*; their
   dynamic values come from pure view-model builders in js/vm/*.
   ============================================================ */

import { migrate, settings } from "./store.js";
import { edmontonDayKey } from "./util.js";

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
  pendingSession: null,         // { light, dayKey } — readiness → session handoff
  quizDeck: null,
  prizeDraw: null,
  detailOverlay: false,
  detailEx: null,
  isWide: true
};

const root = document.getElementById("app");

function computeIsWide() {
  return window.innerWidth >= 900 && window.innerWidth > window.innerHeight;
}

export function render() {
  state.isWide = computeIsWide();
  // Screen renderers land here phase by phase; placeholder shell for now.
  root.innerHTML = `
    <div style="width:100%;max-width:1242px;margin:0 auto;box-sizing:border-box;padding:18px;background:var(--bg,#E2F8FE);font-family:var(--font-ui);color:var(--ink);">
      <div style="display:flex;align-items:center;justify-content:center;background:var(--surface);border-radius:30px;box-shadow:0 18px 44px rgba(20,59,74,0.16);min-height:${state.isWide ? 800 : 560}px;">
        <div style="text-align:center;padding:40px;">
          <img src="assets/poses/welcome.png" alt="" aria-hidden="true" style="height:140px;object-fit:contain;">
          <div style="font-family:var(--font-display);font-weight:600;font-size:40px;color:var(--ink);margin-top:14px;">Hi, ${settings.athleteName}!</div>
          <div style="font-family:var(--font-hand);font-weight:700;font-size:24px;color:var(--aqua-ink);margin-top:6px;">Splash is getting ready to make a splash…</div>
        </div>
      </div>
    </div>`;
}

window.addEventListener("resize", () => {
  const wide = computeIsWide();
  if (wide !== state.isWide) render();
});

function boot() {
  migrate();
  if (!state.selectedDay) state.selectedDay = edmontonDayKey();
  render();
}

boot();
