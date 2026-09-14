/* ============================================================
   Shared shell pieces — page wrapper, left rail (wide),
   bottom nav (narrow). Transcribed from the design markup.
   ============================================================ */

/* Page wrapper (max-width 1242 canvas on aqua bg). */
export function page(inner) {
  return `<div style="width:100%;max-width:1242px;margin:0 auto;box-sizing:border-box;padding:18px;background:var(--bg,#E2F8FE);font-family:var(--font-ui);color:var(--ink);">${inner}</div>`;
}

/* White shell card with the 96px left nav rail (wide layouts). */
export function shellWithRail(vm, contentHtml, { minHeight = 800 } = {}) {
  return `
  <div style="display:flex;background:var(--surface);border-radius:30px;box-shadow:0 18px 44px rgba(20,59,74,0.16);overflow:hidden;min-height:${minHeight}px;position:relative;">
    <div style="width:96px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding:22px 0;border-right:2px solid var(--hairline);">
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:26px;align-items:center;">
        ${railBtn("today", "🏠", "Today", vm.railToday)}
        ${railBtn("progress", "📊", "Progress", vm.railProgress)}
        ${railBtn("grownup", "🧑", "Grown-up", vm.railGrownup)}
      </div>
    </div>
    ${contentHtml}
  </div>`;
}

function railBtn(nav, icon, label, r) {
  return `
  <button type="button" data-action="nav" data-arg="${nav}" style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;">
    <div style="${r.iconWrap}${nav === "grownup" ? "position:relative;" : ""}">
      <span style="font-size:22px;">${icon}</span>
    </div>
    <span style="font-size:11px;font-weight:900;color:${r.labelColor};">${label}</span>
    <span style="${r.dotStyle}"></span>
  </button>`;
}

/* Bottom nav (portrait; hidden mid-session). */
export function bottomNav(vm) {
  const tab = (nav, icon, label, r) => `
    <button type="button" data-action="nav" data-arg="${nav}" style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:84px;min-height:48px;">
      <span style="${r.tabIconWrap}">${icon}</span>
      <span style="font-size:11px;font-weight:900;color:${r.labelColor};">${label}</span>
    </button>`;
  return `
  <div style="height:78px;"></div>
  <nav aria-label="Main" style="position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:2px solid var(--hairline);box-shadow:0 -8px 22px rgba(20,59,74,0.10);display:flex;justify-content:space-around;align-items:center;padding:6px 8px 10px;z-index:60;">
    ${tab("today", "🏠", "Today", vm.railToday)}
    ${tab("progress", "📊", "Progress", vm.railProgress)}
    ${tab("grownup", "🧑", "Grown-up", vm.railGrownup)}
  </nav>`;
}
