/* ============================================================
   TODAY screen — wide (iPad landscape 2-pane) + narrow (stacked).
   Markup transcribed from the design prototype; all dynamic
   values come from buildTodayVM.
   ============================================================ */

import { escapeHtml, imgWithFallbacks, photoSources, plural, heroDecor, heroShadow, HERO_HOST, kidButton } from "../util.js";
import { POSES } from "../data.js";
import { COPY, IMAGES, EMOJI } from "../sport.js";
import { emojiPresentation } from "../vm/today.js";

/* ---- shared fragments (both layouts) ---- */

function weekStrip(vm, wide) {
  return `
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:${wide ? 8 : 5}px;">
    ${vm.week.map(d => `
      <button type="button" data-action="selectDay" data-arg="${d.key}" style="${d.cellStyle}">
        <div style="font-size:13px;font-weight:900;letter-spacing:0.0${wide ? 4 : 3}em;color:${d.labelColor};text-transform:uppercase;">${d.short}</div>
        <div style="${d.iconWrap}">${d.icon}</div>
        <div style="font-size:15px;font-weight:800;color:var(--ink-soft);">${d.date}</div>
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
        <span style="font-size:13px;font-weight:800;color:var(--ink-soft);">${sc.label}</span>
      </div>`).join("")}
  </div>`;
}

function quizDeckLaunch(wide) {
  return wide ? `
  <button type="button" data-action="startQuizDeck" style="display:flex;align-items:center;gap:12px;background:var(--ring-work-fill,var(--aqua-wash));border:2px solid var(--ring-work,var(--aqua));border-radius:var(--radius-lg);padding:13px 16px;margin-bottom:16px;cursor:pointer;font-family:inherit;text-align:left;">
    <span style="width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🧠</span>
    <div style="flex:1;min-width:0;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:17px;color:var(--ink);">Quiz Deck</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);">8 quick questions on your moves — cues, watch-outs & fixes</div>
    </div>
    <span style="font-size:20px;color:var(--ring-work-ink,var(--aqua-ink));flex-shrink:0;">›</span>
  </button>` : `
  <button type="button" data-action="startQuizDeck" style="display:flex;align-items:center;gap:11px;background:var(--ring-work-fill,var(--aqua-wash));border:2px solid var(--ring-work,var(--aqua));border-radius:var(--radius-lg);padding:12px 14px;cursor:pointer;font-family:inherit;text-align:left;width:100%;box-sizing:border-box;">
    <span style="width:40px;height:40px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🧠</span>
    <div style="flex:1;min-width:0;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:16px;color:var(--ink);">Quiz Deck</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);">8 questions on your moves</div>
    </div>
    <span style="font-size:19px;color:var(--ring-work-ink,var(--aqua-ink));flex-shrink:0;">›</span>
  </button>`;
}

/* THE JOURNEY CARD (R5): painted with one slot, --journey-bg (swim the hero's
   sky → pink, skate rose → peach → soft yellow), with the ripples / snow behind
   it when they are on. The painted SVG sky, its blurred ellipses and the dark
   band over the header are gone; the path, the pips, the ranks and the white
   "You are here" pill stay. Small words sit on the hero-chip so they read on
   every part of the gradient. */
const JOURNEY_CHIP = "display:inline-block;background:var(--hero-chip,transparent);border-radius:var(--radius-pill);";

function journeyRail(j, headerOffset) {
  return `
  <div data-journey-rail="1" style="position:relative;z-index:2;height:calc(100% - ${headerOffset}px);overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.4) transparent;">
    <div style="text-align:center;padding:8px 0 4px;"><span style="${JOURNEY_CHIP}padding:3px 10px;font-size:13px;font-weight:900;color:var(--journey-text,#fff);letter-spacing:0.08em;">${COPY.journeyMore}</span></div>
    <div style="position:relative;height:${j.pathHeight}px;">
      ${j.habitats.map(hb => `<div style="${hb.style}"></div>`).join("")}
      <svg viewBox="0 0 100 ${j.pathHeight}" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;">
        <path d="${j.dashedPathD}" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="3" stroke-dasharray="7 7" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
        <path d="${j.solidPathD}" fill="none" stroke="var(--sun)" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
      </svg>
      ${j.levelPips.map(lp => `<div style="${lp.style}"></div>`).join("")}
      ${j.waypoints.map(wp => `
        <div data-way="${wp.stateAttr}" style="${wp.circleStyle}">
          ${wp.showAvatar ? `${imgWithFallbacks(photoSources(IMAGES.avatar), `alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"`)}` : ""}
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

/* The XP bar: the points slot on a white 55% track. */
const journeyXpBar = (j, h) => `
      <div style="height:${h}px;background:rgba(255,255,255,0.55);border-radius:9px;overflow:hidden;">
        <div style="width:${j.levelPct}%;height:100%;background:var(--xp-bar,var(--sun));border-radius:9px;"></div>
      </div>`;

function journeyMapWide(vm) {
  const j = vm.journey;
  return `
  <div id="journey-map-card" data-action="nav" data-arg="progress" style="flex:1;min-height:420px;${HERO_HOST}border-radius:var(--radius-lg);overflow:hidden;cursor:pointer;box-shadow:var(--shadow-lift);background:var(--journey-bg,var(--aqua));transition:transform 0.2s var(--ease-out,ease),box-shadow 0.2s var(--ease-out,ease);">
    ${heroDecor(vm.heroDecorOn)}
    <div style="position:relative;z-index:2;padding:18px 22px 10px;color:var(--journey-text,#fff);">
      <div><span style="${JOURNEY_CHIP}padding:3px 10px;font-size:13px;font-weight:900;letter-spacing:0.08em;${heroShadow(vm.heroDecorOn)}">${j.chapter}</span></div>
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;line-height:1.2;margin:4px 0 8px;${heroShadow(vm.heroDecorOn)}">LVL ${j.level} · ${j.rankName}${j.atSummit ? " — top of the ladder 🏔️" : ` — ${j.xpToNextRank} XP to ${j.nextRankName}`}</div>
      ${journeyXpBar(j, 9)}
    </div>
    ${journeyRail(j, 98)}
  </div>`;
}

function journeyMapNarrow(vm) {
  const j = vm.journey;
  return `
  <div id="journey-map-card" data-action="nav" data-arg="progress" style="height:420px;flex-shrink:0;${HERO_HOST}border-radius:var(--radius-lg);overflow:hidden;cursor:pointer;box-shadow:var(--shadow-lift);background:var(--journey-bg,var(--aqua));">
    ${heroDecor(vm.heroDecorOn)}
    <div style="position:relative;z-index:2;padding:16px 18px 8px;color:var(--journey-text,#fff);">
      <div><span style="${JOURNEY_CHIP}padding:3px 10px;font-size:13px;font-weight:900;letter-spacing:0.08em;${heroShadow(vm.heroDecorOn)}">${j.chapter}</span></div>
      <div style="font-family:var(--font-display);font-weight:600;font-size:17px;line-height:1.2;margin:4px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${heroShadow(vm.heroDecorOn)}">LVL ${j.level} · ${j.rankName}</div>
      <div style="margin-bottom:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="${JOURNEY_CHIP}padding:2px 10px;font-size:13px;font-weight:800;">${j.atSummit ? COPY.summit : `${j.xpToNextRank} XP to ${j.nextRankName}`}</span></div>
      ${journeyXpBar(j, 8)}
    </div>
    ${journeyRail(j, 112)}
  </div>`;
}

/* ---- The aqua day pane (wide right pane / narrow session card) ---- */
function dayPane(vm, wide) {
  const dv = vm.dayView;
  const pad = wide ? "24px 26px 0" : "20px 20px 0";
  const titleSize = wide ? 38 : 30;
  const chipPad = wide ? "7px 14px" : "6px 12px";
  const chipFs = 13;

  const chips = dv.showChips ? `
    <div style="display:flex;gap:${wide ? 10 : 8}px;margin-bottom:14px;flex-wrap:wrap;">
      <span style="display:inline-flex;align-items:center;gap:6px;background:var(--hero-chip,rgba(255,255,255,0.18));border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>${emojiPresentation("⏱")}</span> ${dv.minsLabel || (dv.mins + " min")}</span>
      <span style="display:inline-flex;align-items:center;gap:6px;background:var(--hero-chip,rgba(255,255,255,0.18));border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>${emojiPresentation("⚡")}</span> ${dv.movesLabel}</span>
      ${dv.roundsLabel ? `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--hero-chip,rgba(255,255,255,0.18));border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>🔁</span> ${escapeHtml(dv.roundsLabel)}</span>` : ""}
      ${vm.gearLabel ? `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--hero-chip,rgba(255,255,255,0.18));border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>🎒</span> ${vm.gearLabel}</span>` : ""}
      ${dv.earnedXpLabel ? `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--hero-chip,rgba(255,255,255,0.28));border-radius:var(--radius-pill);padding:${chipPad};font-size:${chipFs}px;font-weight:800;"><span>⭐</span> ${dv.earnedXpLabel}</span>` : ""}
    </div>` : "";

  /* WHAT THE GROWN-UP IS BEING ASKED TO LOOK AT, on the screen they already
     open. A move held for twelve seconds of thirty used to look exactly like
     one held the whole way, and the only way to know was to have watched it.
     Yellow for short, red for very short — the same two words the session
     screen and the Grown-up Zone use, so nobody has to translate. */
  /* On the white row slot, ringed in the band's colour, so it reads on any
     hero (R5). */
  const paceFlag = dv.paceNote ? `
    <div style="display:flex;gap:9px;align-items:flex-start;background:var(--hero-row-bg,rgba(255,255,255,0.7));color:var(--hero-row-text,var(--ink));border:2px solid ${dv.paceBand === "red" ? "var(--stop)" : "var(--sun)"};border-radius:var(--radius-md);padding:10px 12px;margin-bottom:12px;">
      <span style="font-size:15px;flex-shrink:0;">${dv.paceBand === "red" ? "⚠️" : "🟡"}</span>
      <span style="font-size:13px;font-weight:700;line-height:1.4;">${escapeHtml(dv.paceNote)}</span>
    </div>` : "";

  const focus = dv.showFocus ? `
    <div style="background:var(--hero-chip,rgba(255,255,255,0.16));border-radius:var(--radius-md);padding:${wide ? "11px 15px" : "10px 14px"};margin-bottom:${wide ? 16 : 14}px;display:flex;align-items:center;gap:9px;">
      <span style="font-size:16px;flex-shrink:0;">⭐</span>
      <span style="font-weight:800;font-size:${wide ? 14 : 13}px;line-height:1.35;">Focus: ${vm.focusCue}</span>
    </div>` : "";

  const done = dv.isDone ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;background:var(--hero-chip,transparent);border-radius:var(--radius-md);padding:8px 12px;">
      ${imgWithFallbacks(photoSources(POSES.greatwork), `alt="" style="height:${wide ? 72 : 64}px;object-fit:contain;flex-shrink:0;"`)}
      <div style="display:flex;flex-direction:column;gap:1px;">
        <span style="font-weight:900;font-size:${wide ? 16 : 15}px;">✅ ${dv.doneHeadline}</span>
        <span style="font-size:${wide ? 14 : 13}px;font-weight:700;">${dv.doneSub}</span>
        ${dv.xpNote ? `<span style="font-size:13px;font-weight:700;">${escapeHtml(dv.xpNote)}</span>` : ""}
      </div>
    </div>` : "";

  const missed = dv.isMissed ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;background:var(--hero-chip,transparent);border-radius:var(--radius-md);padding:8px 12px;">
      <span style="font-size:20px;flex-shrink:0;">✕</span>
      <div style="display:flex;flex-direction:column;gap:1px;">
        <span style="font-weight:900;font-size:${wide ? 16 : 15}px;">This one slipped by — that's okay!</span>
        <span style="font-size:${wide ? 14 : 13}px;font-weight:700;">${dv.missedSub || "Every streak has bumps. Pick it back up whenever you\u2019re ready."}</span>
      </div>
    </div>` : "";

  const rest = dv.isRest ? `
    <div style="background:var(--hero-chip,rgba(255,255,255,0.16));border-radius:var(--radius-md);padding:${wide ? "16px 18px" : "14px 16px"};display:flex;flex-direction:column;gap:9px;margin-bottom:14px;">
      <div style="font-size:13px;font-weight:900;letter-spacing:0.06em;">TODAY'S RECOVERY</div>
      ${(dv.recoveryItems || []).map(r => `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:15px;flex-shrink:0;">🧘</span>
          <span style="font-size:14px;font-weight:700;">${r.text}</span>
        </div>`).join("")}
      <div style="font-size:${wide ? 14 : 13}px;font-weight:700;">No XP needed — recovery is part of the plan.</div>
    </div>` : "";

  /* PHONE: the blocks fold behind one row, so "Let's go" is on the first
     screen. Open/closed lives in main.js (toggleBlocks, ungated, not saved):
     every block tap repaints the screen, and a native <details> would snap
     shut each time. iPad keeps the list open, with no fold. */
  const blocksOpen = wide || !!vm.blocksOpen;
  const blocksFold = dv.showBlocksList && !wide ? `
    <button type="button" data-action="toggleBlocks" aria-expanded="${blocksOpen ? "true" : "false"}" style="width:100%;min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 16px;margin-bottom:${blocksOpen ? 10 : 16}px;background:var(--hero-chip,rgba(255,255,255,0.24));border:none;border-radius:var(--radius-md);cursor:pointer;color:var(--hero-text,#fff);font-family:inherit;font-weight:900;font-size:16px;text-align:left;">
      <span>${blocksOpen ? "Hide the blocks" : "See the " + plural(vm.blocks.length, "block")}</span><span aria-hidden="true" style="font-size:18px;">${blocksOpen ? "▴" : "▾"}</span>
    </button>` : "";

  const blocksList = dv.showBlocksList && blocksOpen ? `
    <div style="margin-bottom:9px;"><span style="display:inline-block;background:var(--hero-chip,transparent);border-radius:var(--radius-pill);padding:4px 12px;font-size:13px;font-weight:900;letter-spacing:0.08em;">${dv.blocksHint}</span></div>
    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:${wide ? 18 : 16}px;">
      ${vm.blocks.map(b => `
        <div style="background:${b.rowBg};color:var(--hero-row-text,var(--hero-text,#fff));border-radius:var(--radius-md);overflow:hidden;transition:background 0.15s ease;">
          <button type="button" data-action="toggleBlock" data-arg="${b.key}" style="width:100%;min-height:56px;display:flex;align-items:center;gap:${wide ? 11 : 10}px;padding:${wide ? "13px 15px" : "12px 14px"};background:none;border:none;cursor:pointer;color:var(--hero-row-text,var(--hero-text,#fff));transition:transform 0.1s ease;">
            <span style="width:${wide ? 34 : 32}px;height:${wide ? 34 : 32}px;border-radius:50%;background:rgba(255,255,255,0.94);display:flex;align-items:center;justify-content:center;font-size:${wide ? 18 : 17}px;flex-shrink:0;box-shadow:var(--shadow-soft);">${b.icon}</span>
            <span style="font-weight:900;font-size:${wide ? 15 : 14}px;flex:1;text-align:left;display:flex;align-items:center;gap:6px;">${b.name}${b.isBlockDone ? `<span style="font-size:13px;">✓</span>` : b.isBlockSkipped ? `<span style="font-size:13px;font-weight:800;">skipped</span>` : ""}</span>
            <!-- Under "REVIEW WHAT YOU DID", what she DID leads; what the block
                 asked for follows it. The panel used to show only the ask. -->
            <span style="font-size:13px;font-weight:800;opacity:0.85;text-align:right;">${b.doneLabel ? escapeHtml(b.doneLabel) + " · " : ""}${b.countLabel} · ${b.mins} min</span>
            <span style="font-size:13px;transition:transform 0.2s;transform:rotate(${b.rot}deg);">▾</span>
          </button>
          <div style="${b.bodyStyle}">
            ${(b.review || []).length ? `
              <!-- THE PER-MOVE REVIEW: what counted and why, one line each,
                   with the rule stated once at the top. Factual, never
                   scolding — see moveReviewReason in js/outcome.js. -->
              <div style="font-size:13px;font-weight:800;line-height:1.35;padding:4px 0 6px;">${escapeHtml(vm.reviewLegend || "")}</div>
              ${b.review.map(r => `
              <div style="display:flex;align-items:flex-start;gap:9px;padding:5px 0;font-size:${wide ? 14 : 13}px;font-weight:700;" data-move-review="${escapeHtml(r.status)}">
                <span style="flex:1;min-width:0;">
                  ${(r.shortRounds || []).length ? `
                  <!-- More than one round: one line per short round, each
                       naming its slot, instead of round one's reason alone. -->
                  <span>${escapeHtml(r.name)}</span>
                  ${r.shortRounds.map(l => `<span style="display:block;font-size:13px;font-weight:700;line-height:1.35;" data-short-round="${l.slot}">${escapeHtml(l.text)}</span>`).join("")}` : `
                  <span>${escapeHtml(r.name)}${r.doseLabel ? ` <span style="font-weight:800;">· ${escapeHtml(r.doseLabel)}</span>` : ""}</span>
                  ${r.reason ? `<span style="display:block;font-size:13px;font-weight:700;line-height:1.35;">${escapeHtml(r.reason)}</span>` : ""}`}
                </span>
                <span style="display:flex;gap:4px;flex-shrink:0;" data-round-slots="${r.slots.length}">
                  ${r.slots.map(sl => `<span style="${sl.style}" title="${escapeHtml(sl.title)}" aria-label="${escapeHtml(sl.title)}" data-round-slot="${sl.slot}">${sl.icon}</span>`).join("")}
                </span>
              </div>`).join("")}`
            : b.moves.map(m => `
              <div style="padding:6px 0;">
                <div style="display:flex;align-items:flex-start;gap:9px;font-size:${wide ? 15 : 14}px;font-weight:700;">
                  <span style="flex-shrink:0;">•</span><span style="flex:1;min-width:0;">${m.text}</span>
                </div>
                ${m.cue ? `<div style="font-family:var(--font-hand);font-size:14px;font-style:italic;margin:2px 0 0 18px;">"${m.cue}"</div>` : ""}
                ${m.transfer ? `<div style="font-size:13px;font-weight:800;margin:2px 0 0 18px;">${COPY.transferMove} ${m.transfer}</div>` : ""}
              </div>`).join("")}
          </div>
        </div>`).join("")}
    </div>` : "";

  /* The coach's line sits at the bottom of the card, above "Let's go" (R5). */
  const echo = dv.isActive ? `
    <div style="margin-top:auto;padding:${wide ? "8px 26px 10px" : "8px 20px 4px"};position:relative;z-index:2;font-family:var(--font-hand);font-size:${wide ? 20 : 18}px;font-weight:700;line-height:1.3;color:var(--hero-mantra,inherit);">${vm.echoLine}</div>` : "";

  const future = dv.isFuture ? `
    <div style="background:var(--hero-chip,rgba(255,255,255,0.16));border-radius:var(--radius-md);padding:${wide ? 20 : 18}px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;margin-bottom:6px;">
      <span style="font-size:${wide ? 36 : 32}px;">🔒</span>
      <div style="font-weight:900;font-size:${wide ? 16 : 15}px;">${dv.futureHeadline}</div>
      <div style="font-size:13px;font-weight:700;">Come back on this day to see the plan.</div>
    </div>` : "";

  const footer = `
  <div style="padding:${wide ? "0 26px 24px" : "14px 20px 20px"};position:relative;z-index:2;">
    ${dv.showCta ? `
      <button type="button" data-action="${dv.ctaAction}" data-arg="${vm.selectedKey}" style="${dv.ctaButtonStyle}width:100%;">
        <span style="font-size:22px;">${dv.ctaIcon}</span> ${dv.ctaLabel}
      </button>
      ${dv.ctaSubtext ? `<div style="text-align:center;padding-top:8px;"><span style="display:inline-block;background:var(--hero-chip,transparent);border-radius:var(--radius-md);padding:4px 10px;font-size:${wide ? 14 : 13}px;font-weight:700;">${dv.ctaSubtext}</span></div>` : ""}
      ${dv.partialSkipLabel ? `
        <div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding-top:8px;text-align:center;">
          <span style="background:var(--hero-chip,transparent);border-radius:var(--radius-pill);padding:4px 10px;font-size:${wide ? 14 : 13}px;font-weight:700;">${dv.partialSkipLabel}</span>
          <button type="button" data-action="goSessionRedo" data-arg="${vm.selectedKey}" style="${kidButton("neutral")}padding:0 16px;">+ Add them back</button>
        </div>` : ""}` : ""}
    ${dv.startNote ? `<div role="status" style="margin-bottom:10px;background:var(--hero-chip,rgba(255,255,255,0.18));border:2px solid rgba(255,255,255,0.55);border-radius:var(--radius-md);padding:10px 14px;font-size:13px;font-weight:800;line-height:1.4;">ℹ️ ${dv.startNote}</div>` : ""}
    ${dv.showExplore ? `
      <div style="padding-top:${wide ? 10 : 8}px;">
        <button type="button" data-action="goExplore" data-arg="${vm.selectedKey}" style="${vm.practiceBtnStyle}">
          ${vm.practiceLinkLabel}
        </button>
        <div style="text-align:center;padding-top:6px;"><span style="display:inline-block;background:var(--hero-chip,transparent);border-radius:var(--radius-md);padding:4px 10px;font-size:13px;font-weight:700;">${vm.practiceHintLine}</span></div>
      </div>` : ""}
  </div>`;

  return `
  <div style="padding:${pad};position:relative;z-index:2;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
      <span style="display:inline-block;background:var(--hero-chip,rgba(255,255,255,0.22));border-radius:var(--radius-pill);padding:6px 14px;font-size:13px;font-weight:900;letter-spacing:0.08em;">${dv.badgeLabel}</span>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:5px;background:var(--hero-chip,rgba(255,255,255,0.22));border-radius:var(--radius-pill);padding:6px 12px;" aria-label="Weather">
          <span style="font-size:15px;line-height:1;">${vm.weather.icon}</span>
          <span style="font-size:13px;font-weight:900;">${wide ? vm.weather.caption + " " : ""}${vm.weather.temp}°</span>
        </div>
      </div>
    </div>
    <div style="font-family:var(--font-display);font-weight:600;font-size:${titleSize}px;line-height:1.${wide ? "05" : "1"};margin:12px 0 12px;${heroShadow(vm.heroDecorOn)}">${dv.title}</div>
    ${dv.showBackToToday ? `<button type="button" data-action="selectDay" data-arg="${vm.todayKey}" style="background:var(--hero-chip,none);border:none;border-radius:var(--radius-pill);color:var(--hero-text,rgba(255,255,255,0.85));font-size:13px;font-weight:800;text-decoration:underline;cursor:pointer;padding:4px 10px;margin:0 0 12px;text-align:left;">← Back to today</button>` : ""}
    ${chips}
    ${focus}
    ${done}
    ${paceFlag}
    ${missed}
    ${rest}
    ${blocksFold}
    ${blocksList}
    ${future}
  </div>
  ${echo || `<div style="flex:1;min-height:8px;"></div>`}
  ${footer}`;
}

/* ---- layouts ---- */

export function todayWide(vm) {
  const name = escapeHtml(vm.athleteName);
  /* An upright iPad is "wide" now, and this layout was drawn for a desktop: the
     day card is a HARD 452px that refuses to shrink, so at 810px the column
     beside it collapsed to about 200 and set the greeting, the week strip and
     the Quiz Deck one word per line. Above 900 the two columns are unchanged;
     at 810 they stack, which is the only honest thing to do with that width. */
  const tight = !!vm.tightColumn;
  const greeting = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="font-family:var(--font-display);font-weight:600;font-size:${tight ? 32 : 42}px;line-height:1;color:var(--ink);white-space:nowrap;">Hi, ${name}!</div>
            <span style="font-size:30px;">${EMOJI.world}</span>
          </div>
          <div style="font-family:var(--font-hand);font-weight:700;font-size:${tight ? 20 : 24}px;line-height:1.1;color:var(--aqua-ink);margin-top:5px;">${COPY.greeting}</div>
        </div>
        ${imgWithFallbacks(photoSources(POSES.welcome), `alt="" aria-hidden="true" style="height:104px;margin:-10px 8px -14px 0;object-fit:contain;flex-shrink:0;"`)}
      </div>`;
  const week = `
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
      </div>`;
  /* The hero card (R5): each app fills --hero-bg (swim sky blue → palest
     pink, skate dark rose → light rose) and --hero-text; the fallback is the
     old Card A gradient. The ripples / snow sit behind it when they are on. */
  const dayCard = (place) => `
    <div style="${place}border-radius:var(--radius-lg);background:var(--hero-bg,linear-gradient(165deg,var(--aqua-light) 0%,var(--aqua) 70%));color:var(--hero-text,#fff);display:flex;flex-direction:column;${HERO_HOST}overflow:hidden;">
      ${heroDecor(vm.heroDecorOn)}
      ${dayPane(vm, true)}
    </div>`;
  /* Upright iPad: the day card straight after the greeting, so "Let's go" is on
     the first screen; the week, stats, Quiz Deck and journey follow it. */
  if (tight) return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;">
    <div style="padding:18px 20px 0;">${greeting}</div>
    ${dayCard("width:auto;margin:0 20px 16px;")}
    <div style="flex:0 0 auto;min-width:0;padding:0 20px 20px;display:flex;flex-direction:column;">
      ${week}
      ${statChipsRow(vm, true)}
      ${quizDeckLaunch(true)}
      ${journeyMapWide(vm)}
    </div>
  </div>`;
  return `
    <div style="flex:1;min-width:0;padding:24px 26px;display:flex;flex-direction:column;">
      ${greeting}
      ${week}
      ${statChipsRow(vm, true)}
      ${quizDeckLaunch(true)}
      ${journeyMapWide(vm)}
    </div>
    ${dayCard("width:452px;flex-shrink:0;margin:14px;")}`;
}

/* Phone: greeting, then the day card first, then the week, stats, Quiz Deck and journey. */
export function todayNarrow(vm) {
  const name = escapeHtml(vm.athleteName);
  return `
  <div style="display:flex;flex-direction:column;gap:16px;">

    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 4px 0;">
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-family:var(--font-display);font-weight:600;font-size:32px;line-height:1;color:var(--ink);white-space:nowrap;">Hi, ${name}!</div>
          <span style="font-size:24px;">${EMOJI.world}</span>
        </div>
        <div style="font-family:var(--font-hand);font-weight:700;font-size:20px;line-height:1.1;color:var(--aqua-ink);margin-top:4px;">${COPY.greeting}</div>
      </div>
      ${imgWithFallbacks(photoSources(POSES.welcome), `alt="" aria-hidden="true" style="height:88px;object-fit:contain;flex-shrink:0;"`)}
    </div>

    <div style="border-radius:var(--radius-lg);background:var(--hero-bg,linear-gradient(165deg,var(--aqua-light) 0%,var(--aqua) 70%));color:var(--hero-text,#fff);box-shadow:var(--shadow-lift);${HERO_HOST}overflow:hidden;display:flex;flex-direction:column;">
      ${heroDecor(vm.heroDecorOn)}
      ${dayPane(vm, false)}
    </div>

    <div style="background:var(--surface);border-radius:var(--radius-lg);box-shadow:var(--shadow-soft);padding:14px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
        <span style="font-family:var(--font-display);font-weight:600;font-size:17px;color:var(--ink);">This week</span>
        <span style="font-size:13px;font-weight:800;color:var(--ink-soft);white-space:nowrap;flex-shrink:0;">${vm.dateLine}</span>
      </div>
      ${weekStrip(vm, false)}
    </div>

    ${statChipsRow(vm, false)}
    ${quizDeckLaunch(false)}
    ${journeyMapNarrow(vm)}
  </div>`;
}
