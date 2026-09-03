/* ============================================================
   READINESS screen — 4 questions + body-map branch.
   Markup transcribed from the Assessment prototype; the zone
   rectangle/badge coordinates are encoded as data tables so the
   front/back maps share one renderer.
   ============================================================ */

import { escapeHtml } from "../util.js";

/* Zone hit-areas & highlights: percent coords per view. A zone can appear
   twice in a view (shoulders, arms). r = border-radius px. */
const FRONT_RECTS = [
  { n: 1,  l: 25.7, t: 1.0,  w: 48.0, h: 19.0, r: 50, label: "Head" },
  { n: 17, l: 38,   t: 20.0, w: 24,   h: 4.5,  r: 30, label: "Neck" },
  { n: 2,  l: 15,   t: 22.5, w: 26,   h: 6.5,  r: 30, label: "Shoulders" },
  { n: 2,  l: 59,   t: 22.5, w: 26,   h: 6.5,  r: 30, label: "Shoulders" },
  { n: 3,  l: 3.4,  t: 30.3, w: 27.4, h: 27.1, r: 30, label: "Arms" },
  { n: 3,  l: 69.5, t: 30.3, w: 27.4, h: 27.1, r: 30, label: "Arms" },
  { n: 5,  l: 31.7, t: 24.8, w: 36.0, h: 11.2, r: 24, label: "Chest / Ribs" },
  { n: 6,  l: 25.4, t: 36.4, w: 48.4, h: 7.2,  r: 24, label: "Abs / Core" },
  { n: 7,  l: 24.0, t: 43.6, w: 50.6, h: 5.4,  r: 24, label: "Hip / Groin" },
  { n: 8,  l: 24.9, t: 48.8, w: 49.7, h: 16.3, r: 30, label: "Quads (Front Thigh)" },
  { n: 4,  l: 26.6, t: 66.0, w: 46.3, h: 5.4,  r: 20, label: "Knees" },
  { n: 9,  l: 26.6, t: 72.5, w: 46.3, h: 12.7, r: 24, label: "Shin" },
  { n: 10, l: 19.7, t: 85.2, w: 58.3, h: 12.9, r: 24, label: "Ankle / Foot" }
];
const FRONT_BADGES = [
  { n: 1, l: 49.7, t: 10.5 }, { n: 17, l: 50, t: 22.25 },
  { n: 2, l: 28, t: 25.75 }, { n: 2, l: 72, t: 25.75 },
  { n: 3, l: 17.1, t: 43.85 }, { n: 3, l: 83.2, t: 43.85 },
  { n: 5, l: 49.7, t: 30.4 }, { n: 6, l: 49.6, t: 40.0 },
  { n: 7, l: 49.3, t: 46.3 }, { n: 8, l: 49.75, t: 56.95 },
  { n: 4, l: 49.75, t: 68.7 }, { n: 9, l: 49.75, t: 78.85 },
  { n: 10, l: 48.85, t: 91.65 }
];
const BACK_RECTS = [
  { n: 1,  l: 19.6, t: 1.2,  w: 59.4, h: 19.0, r: 50, label: "Head" },
  { n: 17, l: 34,   t: 20.2, w: 26,   h: 4.8,  r: 30, label: "Neck" },
  { n: 2,  l: 14,   t: 22.5, w: 27,   h: 6.5,  r: 30, label: "Shoulders" },
  { n: 2,  l: 59,   t: 22.5, w: 27,   h: 6.5,  r: 30, label: "Shoulders" },
  { n: 3,  l: 2.2,  t: 32.0, w: 30.9, h: 24.3, r: 30, label: "Arms" },
  { n: 3,  l: 69.1, t: 32.0, w: 28.5, h: 24.3, r: 30, label: "Arms" },
  { n: 11, l: 24.8, t: 27.1, w: 49.5, h: 9.4,  r: 24, label: "Upper Back" },
  { n: 12, l: 23.5, t: 36.8, w: 52.0, h: 8,    r: 24, label: "Lower Back" },
  { n: 13, l: 24.8, t: 44.8, w: 49.5, h: 8,    r: 24, label: "Glutes" },
  { n: 14, l: 29,   t: 54.4, w: 41,   h: 12.7, r: 24, label: "Hamstrings (Back Thigh)" },
  { n: 4,  l: 33,   t: 66.0, w: 34,   h: 5.4,  r: 20, label: "Knees" },
  { n: 15, l: 33,   t: 72.5, w: 33,   h: 12.7, r: 24, label: "Calf" },
  { n: 16, l: 37,   t: 85.2, w: 26,   h: 12.9, r: 20, label: "Achilles / Heel" }
];
const BACK_BADGES = [
  { n: 1, l: 49.3, t: 10.7 }, { n: 17, l: 49, t: 22.6 },
  { n: 2, l: 27.5, t: 25.75 }, { n: 2, l: 72.5, t: 25.75 },
  { n: 3, l: 17.65, t: 44.15 }, { n: 3, l: 83.35, t: 44.15 },
  { n: 11, l: 49.55, t: 31.8 }, { n: 12, l: 49.5, t: 40.8 },
  { n: 13, l: 49.55, t: 48.8 }, { n: 14, l: 49.5, t: 60.75 },
  { n: 4, l: 50, t: 68.7 }, { n: 15, l: 49.5, t: 78.85 },
  { n: 16, l: 50, t: 91.65 }
];

function bodyMap(vm, view) {
  const rects = view === "front" ? FRONT_RECTS : BACK_RECTS;
  const badges = view === "front" ? FRONT_BADGES : BACK_BADGES;
  const img = view === "front" ? "assets/swimmer-front.png" : "assets/swimmer-back.png";
  const pill = view === "front"
    ? `<span style="background:var(--aqua);color:#fff;font-size:12px;font-weight:900;letter-spacing:0.06em;padding:6px 16px;border-radius:var(--radius-pill);margin-bottom:8px;">FRONT VIEW</span>`
    : `<span style="background:var(--sea);color:#fff;font-size:12px;font-weight:900;letter-spacing:0.06em;padding:6px 16px;border-radius:var(--radius-pill);margin-bottom:8px;">BACK VIEW</span>`;
  return `
  <div style="flex:1;background:var(--bg);border:2px solid var(--hairline);border-radius:22px;padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
    ${pill}
    <div style="position:relative;height:480px;width:fit-content;">
      <img src="${img}" alt="${view === "front" ? "Front" : "Back"} view swimmer body map" style="height:100%;width:auto;display:block;pointer-events:none;">
      ${rects.map(z => `<div style="position:absolute;left:${z.l}%;top:${z.t}%;width:${z.w}%;height:${z.h}%;border-radius:${z.r}px;pointer-events:none;${vm.zoneHighlight["n" + z.n]}"></div>`).join("")}
      ${badges.map(b => `<div style="position:absolute;left:${b.l}%;top:${b.t}%;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;pointer-events:none;background:${vm.zoneBadgeBg["n" + b.n]};">${vm.zoneBadge["n" + b.n]}</div>`).join("")}
      ${rects.map(z => `<button type="button" data-action="rPickZone" data-arg="${z.n}" style="position:absolute;left:${z.l}%;top:${z.t}%;width:${z.w}%;height:${z.h}%;background:none;border:none;padding:0;cursor:pointer;" aria-label="${z.label}"></button>`).join("")}
    </div>
  </div>`;
}

/* Result card (shared by the readiness path and the body-check path). */
function resultCard(vm, { areaLabel = "" } = {}) {
  const c = vm.resultCta;
  return `
  <div style="width:100%;max-width:${areaLabel ? 680 : 720}px;box-sizing:border-box;margin-top:${areaLabel ? "18px" : "40px"};${areaLabel ? "margin-left:auto;margin-right:auto;" : ""}background:var(--surface);border-radius:var(--radius-xl);padding:24px;box-shadow:var(--shadow-lift);border-top:6px solid ${vm.light.color};">
    ${areaLabel ? `<div style="font-size:12px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:10px;">${areaLabel}</div>` : ""}
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
      <div style="font-size:56px;line-height:1;">${vm.light.emoji}</div>
      <div>
        <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:${vm.light.color};line-height:1.1;">${vm.light.label}</div>
        <div style="font-size:15px;font-weight:700;color:var(--ink-soft);margin-top:5px;line-height:1.45;">${vm.resultDesc}</div>
      </div>
    </div>
    ${vm.combinedLine ? `<div style="display:flex;align-items:flex-start;gap:8px;background:var(--surface-2);border-left:4px solid ${vm.light.color};border-radius:10px;padding:10px 12px;margin-bottom:16px;">
      <span style="font-size:14px;flex-shrink:0;line-height:1.45;" aria-hidden="true">⚖️</span>
      <span style="font-size:13px;font-weight:800;color:var(--ink-soft);line-height:1.45;">${vm.combinedLine}</span>
    </div>` : ""}
    ${vm.suggestionLine ? `<div style="display:flex;align-items:flex-start;gap:8px;background:var(--surface-2);border-left:4px solid ${vm.light.color};border-radius:10px;padding:10px 12px;margin-bottom:16px;">
      <span style="font-size:14px;flex-shrink:0;line-height:1.45;" aria-hidden="true">🧑</span>
      <span style="font-size:13px;font-weight:800;color:var(--ink-soft);line-height:1.45;">${vm.suggestionLine}</span>
    </div>` : ""}
    <div style="background:var(--surface-2);border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:18px;">
      <div style="font-size:12px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:9px;">Coach suggests this light — a grown-up can change it:</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${vm.lightOptions.map(lo => `
          <button type="button" data-action="rPickLight" data-arg="${lo.key}" style="${lo.style}">
            <span style="font-size:18px;line-height:1;">${lo.emoji}</span>
            <span style="font-weight:800;font-size:13px;letter-spacing:0.02em;">${lo.label}</span>
          </button>`).join("")}
      </div>
    </div>
    ${vm.needsGrownupConfirm ? `
    <button type="button" data-action="rGrownupOk" style="width:100%;display:flex;align-items:center;gap:12px;background:${vm.grownupConfirmed ? "var(--mint-wash)" : "var(--surface-2)"};border:2px solid ${vm.grownupConfirmed ? "var(--mint)" : "var(--hairline)"};border-radius:var(--radius-lg);padding:14px 16px;cursor:pointer;text-align:left;margin-bottom:14px;min-height:56px;">
      <span style="font-size:24px;flex-shrink:0;">${vm.grownupConfirmed ? "☑️" : "⬜"}</span>
      <span style="font-weight:800;font-size:15px;color:var(--ink);line-height:1.35;">A grown-up said it's OK to do a light day. <span style="color:var(--ink-soft);font-weight:700;">Tap after you've checked in.</span></span>
    </button>` : ""}
    <button type="button" ${vm.needsGrownupConfirm && !vm.grownupConfirmed ? "disabled" : `data-action="rResultCta" data-arg="${c.action}"`} style="width:100%;display:flex;align-items:center;justify-content:center;gap:12px;background:${c.color};color:${c.text};border:none;border-radius:var(--radius-pill);padding:18px;font-family:var(--font-display);font-weight:600;font-size:22px;${vm.needsGrownupConfirm && !vm.grownupConfirmed ? "opacity:0.45;cursor:default;" : "cursor:pointer;box-shadow:0 5px 0 " + c.deep + ";"}">
      <span style="font-size:22px;">${c.icon}</span> ${c.label}
    </button>
    ${c.secondaryLabel ? `<button type="button" data-action="rResultSecondary" data-arg="${c.secondaryAction}" style="width:100%;background:none;border:none;cursor:pointer;font-weight:800;font-size:14px;color:var(--ink-soft);text-decoration:underline;padding:12px 6px 2px;min-height:44px;">${c.secondaryLabel}</button>` : ""}
  </div>`;
}

function stepper(vm, gap) {
  return vm.stepperRows.map(st => `
    <div style="display:flex;align-items:center;gap:${gap}px;">
      <span style="${st.circleStyle}">${st.icon}</span>
      <span style="${st.labelStyle}">${st.label}</span>
    </div>`).join("");
}

export function readinessScreen(vm) {
  const name = escapeHtml(vm.athleteName);
  const backBtn = `<button type="button" data-action="rExit" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.22);display:flex;align-items:center;justify-content:center;font-size:18px;border:none;cursor:pointer;color:#fff;flex-shrink:0;" aria-label="Back to Today">←</button>`;

  const questionsStep = vm.isQuestionsStep ? `
    ${vm.isNarrow ? `
      <div style="background:linear-gradient(165deg,var(--aqua-light) 0%,var(--aqua) 60%,var(--aqua-deep) 100%);color:#fff;padding:18px 20px 16px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${backBtn}
          <img src="assets/swim-marlin.png" style="width:56px;height:56px;object-fit:contain;flex-shrink:0;" alt="">
          <div style="min-width:0;">
            <div style="font-family:var(--font-display);font-weight:600;font-size:24px;line-height:1.1;display:flex;align-items:center;gap:8px;">Body Check <span style="width:24px;height:24px;border-radius:50%;background:var(--mint);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:#fff;font-size:14px;font-weight:900;">✓</span></span></div>
            <div style="font-size:13px;font-weight:700;opacity:0.9;margin-top:3px;line-height:1.3;">A few quick checks before we dive in, ${name}!</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">${stepper(vm, 7)}</div>
      </div>` : `
      <div style="width:340px;flex-shrink:0;background:linear-gradient(165deg,var(--aqua-light) 0%,var(--aqua) 60%,var(--aqua-deep) 100%);color:#fff;display:flex;flex-direction:column;padding:26px 28px;">
        ${backBtn}
        <img src="assets/swim-marlin.png" style="width:140px;height:140px;object-fit:contain;margin:22px 0 10px;" alt="">
        <div style="font-family:var(--font-display);font-weight:600;font-size:32px;line-height:1.1;display:flex;align-items:center;gap:12px;">Body Check <span style="width:30px;height:30px;border-radius:50%;background:var(--mint);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="color:#fff;font-size:17px;font-weight:900;">✓</span></span></div>
        <div style="font-size:15px;font-weight:700;opacity:0.9;margin-top:8px;line-height:1.4;">A few quick checks before we dive in, ${name}!</div>
        <div style="margin-top:26px;display:flex;flex-direction:column;gap:12px;">${stepper(vm, 10)}</div>
        <div style="flex:1;"></div>
      </div>`}

    <div style="${vm.bodyContentStyle}">
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:720px;">
        ${vm.hasYesterday ? `
          <div style="display:flex;align-items:center;gap:8px;font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);padding:0 4px;">
            <span style="font-size:15px;">📋</span> Yesterday — for reference. Today still needs your answer.
          </div>` : ""}
        ${vm.questions.map(q => `
          <div style="background:var(--bg);border:2px solid var(--hairline);border-radius:var(--radius-lg);padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;">
            <div style="flex:1 1 200px;font-weight:700;font-size:17px;line-height:1.4;color:var(--ink);">${q.text}</div>
            ${vm.hasYesterday ? `
              <div style="flex-shrink:0;min-width:92px;text-align:center;opacity:0.62;">
                <div style="font-size:10px;font-weight:900;letter-spacing:0.05em;text-transform:uppercase;color:var(--ink-soft);">Yesterday</div>
                <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-top:2px;">${q.yesterday}</div>
              </div>` : ""}
            <div style="display:flex;gap:8px;flex-shrink:0;">
              <button type="button" data-action="rAnswer" data-arg="${q.id}|yes" style="${q.yesStyle}">${q.yesLabel}</button>
              <button type="button" data-action="rAnswer" data-arg="${q.id}|no" style="${q.noStyle}">${q.noLabel}</button>
            </div>
          </div>`).join("")}
        ${vm.hasYesterday && vm.yesterdayZoneLine ? `
          <div style="font-size:13px;font-weight:700;color:var(--ink-soft);opacity:0.75;padding:0 4px;">${vm.yesterdayZoneLine}</div>` : ""}
        <div style="text-align:center;font-family:var(--font-hand);font-size:20px;font-weight:700;color:var(--ink-soft);padding-top:4px;">No wrong answers — Coach picks the right workout for today.</div>
      </div>
      ${vm.showInlineReadinessResult ? resultCard(vm) : ""}
    </div>` : "";

  const bodyStep = vm.showBodyArea ? `
    <div style="width:100%;display:flex;flex-direction:column;padding:24px 30px;box-sizing:border-box;">
      <div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px 16px;margin-bottom:12px;">
        <button type="button" data-action="rGoBack" style="width:46px;height:46px;border-radius:50%;background:var(--bg);border:2px solid var(--hairline);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--aqua-ink);cursor:pointer;flex-shrink:0;" aria-label="Back">←</button>
        <div style="text-align:center;flex:1;">
          <div style="font-family:var(--font-display);font-weight:600;font-size:34px;color:var(--ink);line-height:1.1;">Where does it feel different?</div>
          <div style="font-size:15px;font-weight:700;color:var(--ink-soft);margin-top:6px;">Tap each spot that feels off — Coach will ask how it feels. Tap again to change it.</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;background:var(--sun-wash);border:2px solid var(--sun);border-radius:18px;padding:10px 14px;flex-shrink:0;max-width:180px;">
          <span style="font-size:18px;">⭐</span>
          <span style="font-size:12px;font-weight:800;color:var(--sun-ink);line-height:1.3;">If unsure, ask a coach or parent.</span>
        </div>
      </div>

      <div style="${vm.mapsRow}">
        ${bodyMap(vm, "front")}
        ${bodyMap(vm, "back")}
        <div style="${vm.legendStyle}">
          ${vm.legendRows.map(lg => lg.isHeader
            ? `<div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-faint);padding:10px 4px 2px;">${lg.label}</div>`
            : `<button type="button" data-action="rPickZone" data-arg="${lg.num}" style="${lg.rowStyle}">
                 <span style="${lg.badgeStyle}">${lg.num}</span>
                 <span style="font-size:14px;font-weight:800;color:var(--ink);text-align:left;line-height:1.2;">${lg.label}</span>
               </button>`).join("")}
        </div>
      </div>

      ${vm.noZonesYet ? `<div style="text-align:center;font-family:var(--font-hand);font-size:22px;font-weight:700;color:var(--ink-soft);margin-top:16px;">Tap the spot that feels different — Coach will ask how it feels.</div>` : ""}
      ${vm.showInlineBodyResult ? resultCard(vm, { areaLabel: vm.areaLabel }) : ""}

      ${vm.showZonePopup ? `
        <div data-action="rClosePopup" style="position:fixed;inset:0;background:rgba(20,59,74,0.45);z-index:50;display:flex;align-items:center;justify-content:center;">
          <div data-stop-propagation="1" style="background:var(--surface);border-radius:22px;padding:22px 24px;width:420px;max-width:90vw;box-sizing:border-box;box-shadow:var(--shadow-pop);display:flex;flex-direction:column;gap:10px;">
            <div style="font-family:var(--font-display);font-weight:600;font-size:24px;color:var(--ink);">${vm.pendingZoneLabel} — how does it feel?</div>
            ${vm.popupOptions.map(po => `
              <button type="button" data-action="rSetZoneSev" data-arg="${vm.pendingZone}|${po.level}" style="display:flex;align-items:center;gap:12px;background:var(--bg);border:3px solid ${po.color};border-radius:var(--radius-lg);padding:12px 14px;cursor:pointer;text-align:left;min-height:60px;">
                <span style="font-size:28px;line-height:1;flex-shrink:0;">${po.emoji}</span>
                <div>
                  <div style="font-weight:900;font-size:16px;color:${po.color};">${po.label}</div>
                  <div style="font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.3;margin-top:2px;">${po.desc}</div>
                </div>
              </button>`).join("")}
            ${vm.popupHasMark ? `<button type="button" data-action="rSetZoneSev" data-arg="${vm.pendingZone}|0" style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--mint-wash);border:2px solid var(--mint);border-radius:var(--radius-pill);padding:12px;cursor:pointer;font-weight:900;font-size:14px;color:var(--mint-ink);min-height:48px;">✨ Feels fine now — remove mark</button>` : ""}
            <button type="button" data-action="rClosePopup" style="background:none;border:none;cursor:pointer;font-weight:800;font-size:14px;color:var(--ink-soft);text-decoration:underline;padding:6px;">Cancel</button>
          </div>
        </div>` : ""}
    </div>` : "";

  return `
  <div style="display:flex;flex-direction:${vm.cardDir};background:var(--surface);border-radius:30px;box-shadow:0 18px 44px rgba(20,59,74,0.16);overflow:hidden;min-height:800px;">
    ${questionsStep}
    ${bodyStep}
  </div>`;
}
