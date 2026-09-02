/* ============================================================
   TODAY screen — wide (iPad landscape 2-pane) + narrow (stacked).
   Markup transcribed from the design prototype; all dynamic
   values come from buildTodayVM.
   ============================================================ */

import { escapeHtml } from "../util.js";

/* ---- shared fragments (both layouts) ---- */

function weekStrip(vm, wide) {
  return `
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:${wide ? 8 : 5}px;">
    ${vm.week.map(d => `
      <button type="button" data-action="selectDay" data-arg="${d.key}" style="${d.cellStyle}">
        <div style="font-size:${wide ? 11 : 10}px;font-weight:900;letter-spacing:0.0${wide ? 4 : 3}em;color:${d.labelColor};text-transform:uppercase;">${d.short}</div>
        <div style="${d.iconWrap}">${d.icon}</div>
        <div style="font-size:${wide ? 12 : 11}px;font-weight:800;color:var(--ink-soft);">${d.date}</div>
      </button>`).join("")}
  </div>`;
}

function statChipsRow(vm, wide) {
  return `
  <div style="display:flex;gap:${wide ? 10 : 8}px;${wide ? "margin-bottom:16px;" : ""}">
    ${vm.statChips.map(sc => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2px;background:var(--surface);border:2px solid var(--hairline);border-radius:var(--radius-pill);padding:${wide ? "10px 12px" : "9px 8px"};min-width:0;">
        <div style="display:flex;align-items:center;justify-content:center;gap:${wide ? 6 : 5}px;">
          <span style="font-size:${wide ? 18 : 16}px;line-height:1;flex-shrink:0;">${sc.icon}</span>
          <span style="font-family:var(--font-display);font-weight:600;font-size:${wide ? 18 : 16}px;color:${sc.color};line-height:1;">${sc.value}</span>
        </div>
        <span style="font-size:${wide ? 13 : 12}px;font-weight:800;color:var(--ink-soft);">${sc.label}</span>
      </div>`).join("")}
  </div>`;
}

function quizDeckLaunch(wide) {
  return wide ? `
  <button type="button" data-action="startQuizDeck" style="display:flex;align-items:center;gap:12px;background:var(--grape-wash,#EFE9FB);border:2px solid var(--grape,#8B6FC7);border-radius:var(--radius-lg);padding:13px 16px;margin-bottom:16px;cursor:pointer;font-family:inherit;text-align:left;">
    <span style="width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🧠</span>
    <div style="flex:1;min-width:0;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:17px;color:var(--ink);">Quiz Deck</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);">8 quick questions on your moves — cues, watch-outs & fixes</div>
    </div>
    <span style="font-size:20px;color:var(--grape,#8B6FC7);flex-shrink:0;">›</span>
  </button>` : `
  <button type="button" data-action="startQuizDeck" style="display:flex;align-items:center;gap:11px;background:var(--grape-wash,#EFE9FB);border:2px solid var(--grape,#8B6FC7);border-radius:var(--radius-lg);padding:12px 14px;cursor:pointer;font-family:inherit;text-align:left;width:100%;box-sizing:border-box;">
    <span style="width:40px;height:40px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🧠</span>
    <div style="flex:1;min-width:0;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:16px;color:var(--ink);">Quiz Deck</div>
      <div style="font-size:12px;font-weight:700;color:var(--ink-soft);">8 questions on your moves</div>
    </div>
    <span style="font-size:19px;color:var(--grape,#8B6FC7);flex-shrink:0;">›</span>
  </button>`;
}

function journeySvgBg(idSuffix) {
  return `
  <svg viewBox="0 0 400 1200" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;">
    <defs>
      <linearGradient id="mapGrad${idSuffix}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:#0E4A73"></stop>
        <stop offset="28%" style="stop-color:#1B7FAD"></stop>
        <stop offset="56%" style="stop-color:#4FC3D9"></stop>
        <stop offset="80%" style="stop-color:#CDEDE7"></stop>
        <stop offset="100%" style="stop-color:#F2D9A6"></stop>
      </linearGradient>
      <filter id="mapGrain${idSuffix}" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.9" numOctaves="2" seed="11" result="n"></feTurbulence>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0"></feColorMatrix>
      </filter>
      <filter id="mapBlur${idSuffix}" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="70"></feGaussianBlur>
      </filter>
    </defs>
    <rect x="0" y="0" width="400" height="1200" fill="url(#mapGrad${idSuffix})"></rect>
    <g filter="url(#mapBlur${idSuffix})" opacity="0.55">
      <ellipse cx="90" cy="170" rx="150" ry="110"  fill="#0A3E63"></ellipse>
      <ellipse cx="330" cy="430" rx="160" ry="120" fill="#2E9BC0"></ellipse>
      <ellipse cx="110" cy="700" rx="170" ry="130" fill="#78CFC6"></ellipse>
      <ellipse cx="300" cy="990" rx="160" ry="120" fill="#E9C88E"></ellipse>
    </g>
    <rect x="0" y="0" width="400" height="1200" fill="#ffffff" filter="url(#mapGrain${idSuffix})"></rect>
  </svg>`;
}

function journeyRail(j, headerOffset) {
  return `
  <div data-journey-rail="1" style="position:relative;z-index:2;height:calc(100% - ${headerOffset}px);overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.4) transparent;">
    <div style="text-align:center;font-size:11px;font-weight:900;color:rgba(255,255,255,0.75);letter-spacing:0.08em;padding:8px 0 4px;text-shadow:0 1px 4px rgba(10,30,40,0.6);">↑ MORE OF THE OCEAN AWAITS</div>
    <div style="position:relative;height:${j.pathHeight}px;">
      ${j.habitats.map(hb => `<div style="${hb.style}"></div>`).join("")}
      <svg viewBox="0 0 100 ${j.pathHeight}" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;">
        <path d="${j.dashedPathD}" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="3" stroke-dasharray="7 7" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
        <path d="${j.solidPathD}" fill="none" stroke="var(--sun)" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
      </svg>
      ${j.levelPips.map(lp => `<div style="${lp.style}"></div>`).join("")}
      ${j.waypoints.map(wp => `
        <div data-way="${wp.stateAttr}" style="${wp.circleStyle}">
          ${wp.showAvatar ? `<img src="assets/swimmer-face.png" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : ""}
          ${wp.showCheck ? `<span>✓</span>` : ""}
          ${wp.showIcon ? `<span>${wp.icon}</span>` : ""}
        </div>
        <div style="${wp.labelPosStyle}">
          <span style="${wp.nameStyle}">${wp.name}</span>
          ${wp.caption ? `<span style="${wp.captionStyle}">${wp.caption}</span>` : ""}
        </div>`).join("")}
    </div>
  </div>`;
}

function journeyMapWide(vm) {
  const j = vm.journey;
  return `
  <div id="journey-map-card" data-action="nav" data-arg="progress" style="flex:1;min-height:420px;position:relative;border-radius:26px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow-lift);background:#1B7FAD;transition:transform 0.2s var(--ease-out,ease),box-shadow 0.2s var(--ease-out,ease);">
    ${journeySvgBg("W")}
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,62,99,0.55) 0%,rgba(10,62,99,0.15) 32%,transparent 55%);pointer-events:none;"></div>
    <div style="position:relative;z-index:2;padding:18px 22px 10px;color:#fff;">
      <div style="font-size:12px;font-weight:900;letter-spacing:0.08em;opacity:0.9;">${j.chapter}</div>
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;line-height:1.2;margin:4px 0 8px;">LVL ${j.level} · ${j.rankName}${j.atSummit ? " — top of the ladder 🏔️" : ` — ${j.xpToNextRank} XP to ${j.nextRankName}`}</div>
      <div style="height:9px;background:rgba(255,255,255,0.28);border-radius:9px;overflow:hidden;">
        <div style="width:${j.levelPct}%;height:100%;background:#fff;border-radius:9px;"></div>
      </div>
    </div>
    ${journeyRail(j, 92)}
  </div>`;
}

function journeyMapNarrow(vm) {
  const j = vm.journey;
  return `
  <div id="journey-map-card" data-action="nav" data-arg="progress" style="height:420px;flex-shrink:0;position:relative;border-radius:24px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow-lift);background:#1B7FAD;">
    ${journeySvgBg("N")}
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,62,99,0.55) 0%,rgba(10,62,99,0.15) 32%,transparent 55%);pointer-events:none;"></div>
    <div style="position:relative;z-index:2;padding:16px 18px 8px;color:#fff;">
      <div style="font-size:11px;font-weight:900;letter-spacing:0.08em;opacity:0.9;">${j.chapter}</div>
      <div style="font-family:var(--font-display);font-weight:600;font-size:17px;line-height:1.2;margin:4px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">LVL ${j.level} · ${j.rankName}</div>
      <div style="font-size:12px;font-weight:800;opacity:0.9;margin-bottom:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${j.atSummit ? "Top of the ladder 🏔️ swim for the love of it" : `${j.xpToNextRank} XP to ${j.nextRankName}`}</div>
      <div style="height:8px;background:rgba(255,255,255,0.28);border-radius:9px;overflow:hidden;">
        <div style="width:${j.levelPct}%;height:100%;background:#fff;border-radius:9px;"></div>
      </div>
    </div>
    ${journeyRail(j, 104)}
  </div>`;
}

/* ---- The aqua day pane (wide right pane / narrow session card) ---- */
function dayPane(vm, wide) {
  const dv = vm.dayView;
  const pad = wide ? "24px 26px 0" : "20px 20px 0";
  const titleSize = wide ? 38 : 30;
  const chipPad = wide ? "7px 14px" : "6px 12px";
  const chipFs = wide ? 13 : 12;

  const chips = dv.showChips ? `
    <div style="display:flex;gap:${wide ? 10 : 8}px;margin-bottom:14px;flex-wrap:wrap;">
      <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.18);border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>⏱</span> ${dv.mins} min</span>
      <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.18);border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>⚡</span> ${dv.movesLabel}</span>
      ${vm.gearLabel ? `<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.18);border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>🎒</span> ${vm.gearLabel}</span>` : ""}
      ${dv.earnedXpLabel ? `<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.28);border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>⭐</span> ${dv.earnedXpLabel}</span>` : ""}
    </div>` : "";

  const focus = dv.showFocus ? `
    <div style="background:rgba(255,255,255,0.16);border-radius:14px;padding:${wide ? "11px 15px" : "10px 14px"};margin-bottom:${wide ? 16 : 14}px;display:flex;align-items:center;gap:9px;">
      <span style="font-size:16px;flex-shrink:0;">⭐</span>
      <span style="font-weight:800;font-size:${wide ? 14 : 13}px;line-height:1.35;">Focus: ${vm.focusCue}</span>
    </div>` : "";

  const done = dv.isDone ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <img src="assets/poses/greatwork.png" alt="" style="height:${wide ? 72 : 64}px;object-fit:contain;flex-shrink:0;">
      <div style="display:flex;flex-direction:column;gap:1px;">
        <span style="font-weight:900;font-size:${wide ? 16 : 15}px;">✅ ${dv.doneHeadline}</span>
        <span style="font-size:${wide ? 14 : 13}px;font-weight:700;opacity:0.85;">${dv.doneSub}</span>
      </div>
    </div>` : "";

  const missed = dv.isMissed ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <span style="font-size:20px;flex-shrink:0;">✕</span>
      <div style="display:flex;flex-direction:column;gap:1px;">
        <span style="font-weight:900;font-size:${wide ? 16 : 15}px;">This one slipped by — that's okay!</span>
        <span style="font-size:${wide ? 14 : 13}px;font-weight:700;opacity:0.85;">${dv.missedSub || "Every streak has bumps. Pick it back up whenever you\u2019re ready."}</span>
      </div>
    </div>` : "";

  const rest = dv.isRest ? `
    <div style="background:rgba(255,255,255,0.16);border-radius:18px;padding:${wide ? "16px 18px" : "14px 16px"};display:flex;flex-direction:column;gap:9px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;opacity:0.85;">TODAY'S RECOVERY</div>
      ${(dv.recoveryItems || []).map(r => `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:15px;flex-shrink:0;">🧘</span>
          <span style="font-size:14px;font-weight:700;">${r.text}</span>
        </div>`).join("")}
      <div style="font-size:${wide ? 14 : 13}px;font-weight:700;opacity:0.8;">No XP needed — recovery is part of the plan.</div>
    </div>` : "";

  const blocksList = dv.showBlocksList ? `
    <div style="font-size:11px;font-weight:900;letter-spacing:0.08em;opacity:0.85;margin-bottom:9px;">${dv.blocksHint}</div>
    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:${wide ? 18 : 16}px;">
      ${vm.blocks.map(b => `
        <div style="background:${b.rowBg};border-radius:16px;overflow:hidden;transition:background 0.15s ease;">
          <button type="button" data-action="toggleBlock" data-arg="${b.key}" style="width:100%;display:flex;align-items:center;gap:${wide ? 11 : 10}px;padding:${wide ? "13px 15px" : "12px 14px"};background:none;border:none;cursor:pointer;color:#fff;transition:transform 0.1s ease;">
            <span style="width:${wide ? 34 : 32}px;height:${wide ? 34 : 32}px;border-radius:50%;background:rgba(255,255,255,0.94);display:flex;align-items:center;justify-content:center;font-size:${wide ? 18 : 17}px;flex-shrink:0;box-shadow:0 2px 5px rgba(10,40,55,0.18);">${b.icon}</span>
            <span style="font-weight:900;font-size:${wide ? 15 : 14}px;flex:1;text-align:left;display:flex;align-items:center;gap:6px;">${b.name}${b.isBlockDone ? `<span style="font-size:${wide ? 13 : 12}px;">✓</span>` : ""}</span>
            <span style="font-size:${wide ? 12 : 11}px;font-weight:800;opacity:0.85;">${b.countLabel} · ${b.mins} min</span>
            <span style="font-size:13px;transition:transform 0.2s;transform:rotate(${b.rot}deg);">▾</span>
          </button>
          <div style="${b.bodyStyle}">
            ${b.moves.map(m => `
              <div style="padding:6px 0;">
                <div style="display:flex;align-items:flex-start;gap:9px;font-size:${wide ? 15 : 14}px;font-weight:700;">
                  <span style="opacity:0.7;flex-shrink:0;">•</span><span style="flex:1;min-width:0;">${m.text}</span>
                </div>
                ${m.cue ? `<div style="font-family:var(--font-hand);font-size:14px;font-style:italic;opacity:0.85;margin:2px 0 0 18px;">"${m.cue}"</div>` : ""}
                ${m.swimTransfer ? `<div style="font-size:12px;font-weight:800;opacity:0.8;margin:2px 0 0 18px;">🏊 pool: ${m.swimTransfer}</div>` : ""}
              </div>`).join("")}
          </div>
        </div>`).join("")}
    </div>` : "";

  const echo = dv.isActive ? `
    <div style="font-family:var(--font-hand);font-size:${wide ? 20 : 18}px;font-weight:700;opacity:0.95;line-height:1.3;padding-top:2px;">${vm.echoLine}</div>` : "";

  const future = dv.isFuture ? `
    <div style="background:rgba(255,255,255,0.16);border-radius:18px;padding:${wide ? 20 : 18}px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;margin-bottom:6px;">
      <span style="font-size:${wide ? 36 : 32}px;">🔒</span>
      <div style="font-weight:900;font-size:${wide ? 16 : 15}px;">${dv.futureHeadline}</div>
      <div style="font-size:13px;font-weight:700;opacity:0.85;">Come back on this day to see the plan.</div>
    </div>` : "";

  const footer = `
  <div style="padding:${wide ? "0 26px 24px" : "14px 20px 20px"};position:relative;z-index:2;">
    ${dv.showCta ? `
      <button type="button" data-action="${dv.ctaAction}" data-arg="${vm.selectedKey}" style="${dv.ctaButtonStyle}width:100%;">
        <span style="font-size:22px;">${dv.ctaIcon}</span> ${dv.ctaLabel}
      </button>
      ${dv.ctaSubtext ? `<div style="text-align:center;font-size:${wide ? 14 : 13}px;font-weight:700;opacity:0.8;padding-top:8px;">${dv.ctaSubtext}</div>` : ""}` : ""}
    ${dv.showTryIt ? `
      <div style="padding-top:${wide ? 10 : 8}px;">
        <button type="button" data-action="togglePractice" aria-pressed="${vm.practiceMode}" style="${vm.practiceBtnStyle}">
          <span style="font-size:16px;">🧪</span>${vm.practiceLinkLabel}
          <span style="display:inline-flex;align-items:center;width:32px;height:18px;border-radius:9px;padding:2px;flex-shrink:0;background:${vm.practiceMode ? "var(--aqua)" : "rgba(255,255,255,0.3)"};">
            <span style="width:14px;height:14px;border-radius:50%;background:#fff;display:block;transform:translateX(${vm.practiceMode ? "14px" : "0"});transition:transform 0.15s;"></span>
          </span>
        </button>
        <div style="text-align:center;font-size:12px;font-weight:700;opacity:0.8;padding-top:6px;">${vm.practiceHintLine}</div>
      </div>` : ""}
  </div>`;

  return `
  <div style="padding:${pad};position:relative;z-index:2;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
      <span style="display:inline-block;background:rgba(255,255,255,0.22);border-radius:var(--radius-pill);padding:6px 14px;font-size:11px;font-weight:900;letter-spacing:0.08em;">${dv.badgeLabel}</span>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.22);border-radius:var(--radius-pill);padding:6px 12px;" aria-label="Weather">
          <span style="font-size:15px;line-height:1;">${vm.weather.icon}</span>
          <span style="font-size:13px;font-weight:900;">${wide ? vm.weather.caption + " " : ""}${vm.weather.temp}°</span>
        </div>
        ${dv.showSettings ? `<button type="button" data-action="toggleCoachVoice" aria-label="Toggle coach voice" style="${vm.coachIconBtnStyle}">🎧</button>` : ""}
      </div>
    </div>
    ${dv.showTryBadge ? `<span style="display:inline-block;background:rgba(255,255,255,0.3);border-radius:var(--radius-pill);padding:6px 14px;font-size:11px;font-weight:900;letter-spacing:0.08em;margin-top:8px;">🧪 TRY-IT</span>` : ""}
    <div style="font-family:var(--font-display);font-weight:600;font-size:${titleSize}px;line-height:1.${wide ? "05" : "1"};margin:12px 0 12px;">${dv.title}</div>
    ${dv.showBackToToday ? `<button type="button" data-action="selectDay" data-arg="${vm.todayKey}" style="background:none;border:none;color:rgba(255,255,255,0.85);font-size:13px;font-weight:800;text-decoration:underline;cursor:pointer;padding:0 0 12px;text-align:left;">← Back to today</button>` : ""}
    ${chips}
    ${focus}
    ${done}
    ${missed}
    ${rest}
    ${blocksList}
    ${echo}
    ${future}
  </div>
  <div style="flex:1;min-height:8px;"></div>
  ${footer}`;
}

/* ---- layouts ---- */

export function todayWide(vm) {
  const name = escapeHtml(vm.athleteName);
  return `
    <div style="flex:1;min-width:0;padding:24px 26px;display:flex;flex-direction:column;">

      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="font-family:var(--font-display);font-weight:600;font-size:42px;line-height:1;color:var(--ink);white-space:nowrap;">Hi, ${name}!</div>
            <span style="font-size:30px;">🌊</span>
          </div>
          <div style="font-family:var(--font-hand);font-weight:700;font-size:24px;line-height:1.1;color:var(--aqua-ink);margin-top:5px;">Ready to make a splash?</div>
        </div>
        <img src="assets/poses/welcome.png" alt="" aria-hidden="true" style="height:104px;margin:-10px 8px -14px 0;object-fit:contain;flex-shrink:0;">
      </div>

      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
          <span style="font-family:var(--font-display);font-weight:600;font-size:20px;color:var(--ink);">This week</span>
          <span style="font-size:13px;font-weight:800;color:var(--ink-soft);white-space:nowrap;flex-shrink:0;">${vm.dateLine}</span>
        </div>
        ${weekStrip(vm, true)}
        <div style="display:flex;gap:14px;margin-top:11px;flex-wrap:wrap;">
          ${vm.legend.map(lg => `
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="${lg.iconStyle}">${lg.icon}</span>
              <span style="font-size:13px;font-weight:800;color:var(--ink-soft);">${lg.label}</span>
            </div>`).join("")}
        </div>
      </div>

      ${statChipsRow(vm, true)}
      ${quizDeckLaunch(true)}
      ${journeyMapWide(vm)}
    </div>

    <div style="width:452px;flex-shrink:0;margin:14px;border-radius:26px;background:linear-gradient(165deg,var(--aqua-light) 0%,var(--aqua) 60%,var(--aqua-deep) 100%);color:#fff;display:flex;flex-direction:column;position:relative;overflow:hidden;">
      ${dayPane(vm, true)}
    </div>`;
}

export function todayNarrow(vm) {
  const name = escapeHtml(vm.athleteName);
  return `
  <div style="display:flex;flex-direction:column;gap:16px;">

    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 4px 0;">
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-family:var(--font-display);font-weight:600;font-size:32px;line-height:1;color:var(--ink);white-space:nowrap;">Hi, ${name}!</div>
          <span style="font-size:24px;">🌊</span>
        </div>
        <div style="font-family:var(--font-hand);font-weight:700;font-size:20px;line-height:1.1;color:var(--aqua-ink);margin-top:4px;">Ready to make a splash?</div>
      </div>
      <img src="assets/poses/welcome.png" alt="" aria-hidden="true" style="height:88px;object-fit:contain;flex-shrink:0;">
    </div>

    <div style="background:var(--surface);border-radius:20px;box-shadow:0 10px 26px rgba(20,59,74,0.12);padding:14px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
        <span style="font-family:var(--font-display);font-weight:600;font-size:17px;color:var(--ink);">This week</span>
        <span style="font-size:12px;font-weight:800;color:var(--ink-soft);white-space:nowrap;flex-shrink:0;">${vm.dateLine}</span>
      </div>
      ${weekStrip(vm, false)}
    </div>

    <div style="border-radius:24px;background:linear-gradient(165deg,var(--aqua-light) 0%,var(--aqua) 60%,var(--aqua-deep) 100%);color:#fff;box-shadow:0 14px 34px rgba(20,59,74,0.22);overflow:hidden;display:flex;flex-direction:column;">
      ${dayPane(vm, false)}
    </div>

    ${statChipsRow(vm, false)}
    ${quizDeckLaunch(false)}
    ${journeyMapNarrow(vm)}
  </div>`;
}
