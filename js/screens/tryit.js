/* ============================================================
   TRY-IT screen — banner, move list, tap for instructions, exit.
   Deliberately has no timer, no rounds, no controls and no
   finish screen: there is nothing running to control.
   ============================================================ */

import { detailOverlayHtml } from "./session.js";

function moveRow(m, wide) {
  return `
  <button type="button" data-action="tryItDetail" data-arg="${m.idx}" style="width:100%;display:flex;align-items:center;gap:${wide ? 14 : 11}px;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);padding:${wide ? 12 : 10}px ${wide ? 14 : 12}px;cursor:pointer;font-family:inherit;text-align:left;box-shadow:var(--shadow-soft);min-height:64px;box-sizing:border-box;">
    <div style="width:${wide ? 56 : 48}px;height:${wide ? 56 : 48}px;flex-shrink:0;border-radius:12px;overflow:hidden;position:relative;background:linear-gradient(165deg,var(--aqua-wash),var(--bg-deep));display:flex;align-items:center;justify-content:center;">
      <span style="font-size:${wide ? 22 : 19}px;" aria-hidden="true">🏊</span>
      <img src="${m.photoUrl}" alt="" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
    </div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
      <span style="font-size:10px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-faint);">${m.blockLabel}</span>
      <span style="font-weight:800;font-size:${wide ? 16 : 15}px;color:var(--ink);">${m.name}</span>
      ${m.cue ? `<span style="font-size:${wide ? 13 : 12}px;font-weight:600;color:var(--ink-soft);line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${m.cue}</span>` : ""}
    </div>
    <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
      <span style="font-family:var(--font-hand);font-size:${wide ? 17 : 15}px;font-weight:700;color:var(--aqua-ink);white-space:nowrap;">${m.dose}</span>
      <span style="font-size:11px;font-weight:900;color:var(--aqua);">▶ how to</span>
    </div>
  </button>`;
}

export function tryItScreen(vm) {
  const wide = vm.isWide;
  return `
  <div style="display:flex;flex-direction:column;background:var(--surface);border-radius:${wide ? 30 : 24}px;box-shadow:0 18px 44px rgba(20,59,74,0.16);overflow:hidden;position:relative;min-height:${wide ? 720 : 560}px;">
    ${vm.detailOverlay ? detailOverlayHtml(vm) : ""}

    <div role="status" style="background:var(--grape,#7C5BC7);color:#fff;padding:12px 18px;display:flex;align-items:center;justify-content:center;gap:9px;font-family:var(--font-ui);font-weight:900;font-size:${wide ? 14 : 13}px;letter-spacing:0.02em;text-align:center;line-height:1.35;">
      <span style="font-size:17px;flex-shrink:0;">🧪</span>TRY-IT — just looking. No timer, no rounds, nothing saved.
    </div>

    <div style="flex:1;overflow-y:auto;padding:${wide ? 24 : 16}px;display:flex;flex-direction:column;gap:${wide ? 16 : 12}px;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:3px;min-width:0;">
          <span style="font-family:var(--font-display);font-weight:600;font-size:${wide ? 30 : 25}px;color:var(--ink);">${vm.dayTitle}</span>
          <span style="font-size:13px;font-weight:700;color:var(--ink-soft);">${vm.moveCount} moves to explore${vm.daySubtitle ? " · " + vm.daySubtitle : ""}</span>
        </div>
        <button type="button" data-action="exitTryIt" style="flex-shrink:0;min-height:44px;border:2px solid var(--hairline);border-radius:var(--radius-pill);background:var(--surface);color:var(--ink-soft);font-weight:900;font-size:14px;padding:0 20px;cursor:pointer;font-family:inherit;">✕ Done looking</button>
      </div>

      <div style="background:var(--aqua-wash);border-radius:var(--radius-lg);padding:13px 16px;font-size:${wide ? 15 : 14}px;font-weight:700;color:var(--aqua-ink);line-height:1.45;">
        Tap any move to see how it's done and watch a video. When you're ready to actually train, come back and press GO.
      </div>

      <div style="display:flex;flex-direction:column;gap:${wide ? 10 : 8}px;">
        ${vm.moves.map(m => moveRow(m, wide)).join("")}
      </div>
    </div>
  </div>`;
}
