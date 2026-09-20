import { COPY, EMOJI } from "../sport.js";
/* ============================================================
   PROGRESS screen — streak hero, prize wallet, milestones,
   training log rail, LVL hero + rank story cards.

   EVERY STORED STRING ON THIS SCREEN GOES THROUGH escapeHtml.

   Prize labels and icons, the athlete's own reflection notes and the day
   titles all arrive from persisted state — the local store, a restored backup,
   or the cloud mirror, which is a shared collection with no sign-in in front of
   it. They were interpolated raw into innerHTML here, so a stored string
   containing markup ran as markup on the screen a kid and a parent read. The
   grown-up screen escaped its fields throughout; this one did not.

   The rule is the whole rule: nothing that was ever written to storage or
   arrived over a wire is interpolated without escaping it, and that includes
   values going into attributes.
   ============================================================ */

import { escapeHtml } from "../util.js";

/* ============================================================
   THE WEEK, AS ONE TABLE

   The bars and the day-by-day figures are the same seven days, so they are one
   <table> and the bars live in its <thead>. That is not a stylistic choice: a
   chart laid out beside a table is two grids, and two grids over the same seven
   columns drift apart the moment a label grows, a translation lands or a
   browser rounds a fraction differently — which is exactly what happened when
   this was tried as a chart above a table. Inside one table, a bar physically
   cannot sit anywhere but over its own column.

   The streak sits in the corner cell rather than floating above it, because
   putting the chart in the header opens a dead rectangle there — bounded by the
   label column, the caption and the first row — and an empty rectangle that
   size reads as a mistake.

   Every cell is a field already on the saved record. Nothing new is stored.
   ============================================================ */
const PACE_CHIP = {
  green: "background:var(--mint-wash);color:var(--mint-ink);",
  amber: "background:var(--sun-wash);color:var(--sun-ink);",
  yellow: "background:var(--coral-wash);color:var(--coral-ink);",
  red: "background:var(--stop-wash);color:var(--stop-ink);",
  care: "background:var(--grape-wash);color:var(--grape-ink);"
};

function weekTable(vm) {
  const days = vm.weekDays || [];
  const th = (d) => `<th scope="col" style="padding:1px 5px 5px;text-align:center;font-size:11px;font-weight:900;text-transform:uppercase;color:${d.isToday ? "var(--sea)" : "var(--ink-soft)"};border-bottom:1.5px solid var(--hairline);">${escapeHtml(d.short)}</th>`;
  const row = (label, pick) => `
    <tr>
      <th scope="row" style="padding:6px 6px 6px 0;text-align:left;font-size:12px;font-weight:700;color:var(--ink-soft);white-space:nowrap;">${label}</th>
      ${days.map(d => {
        const v = pick(d);
        const dim = v === "—" || v === "spa";
        return `<td style="padding:6px 5px;text-align:center;font-size:12px;font-weight:${dim ? "400" : "800"};font-variant-numeric:tabular-nums;color:${dim ? "var(--ink-faint)" : "var(--ink)"};border-bottom:1px solid var(--hairline);">${v}</td>`;
      }).join("")}
    </tr>`;
  const chip = (d) => d.paceBand
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:var(--radius-pill);font-size:11px;font-weight:900;${PACE_CHIP[d.paceBand] || ""}">${escapeHtml(d.paceLabel)}</span>`
    : "—";
  return `
    <div style="overflow-x:auto;">
    <table style="width:100%;min-width:440px;border-collapse:collapse;">
      <caption class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;">Minutes trained and what each day did, Monday to Sunday</caption>
      <thead>
        <tr>
          <th scope="col" style="padding:0 6px 3px 0;vertical-align:bottom;text-align:left;">
            <span style="display:inline-flex;align-items:center;gap:7px;background:var(--coral-wash);border-radius:14px;padding:7px 10px;">
              <span style="font-size:20px;line-height:1;">🔥</span>
              <span style="display:inline-flex;flex-direction:column;align-items:flex-start;">
                <span style="font-family:var(--font-display);font-weight:600;font-size:20px;color:var(--coral);line-height:1;">${vm.dayStreakVal}</span>
                <span style="font-size:8.5px;font-weight:900;color:var(--coral);letter-spacing:0.03em;line-height:1.1;">DAY STREAK</span>
              </span>
            </span>
          </th>
          ${days.map(d => `
            <th scope="col" style="padding:0 5px 3px;vertical-align:bottom;height:68px;">
              <span style="display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;height:64px;gap:2px;">
                <span style="font-size:9px;font-weight:900;color:var(--ink-soft);font-variant-numeric:tabular-nums;">${escapeHtml(d.minsLabel)}</span>
                <span style="${d.barStyle}"></span>
              </span>
            </th>`).join("")}
        </tr>
        <tr><th></th>${days.map(th).join("")}</tr>
      </thead>
      <tbody>
        ${row("Planned", d => escapeHtml(d.plannedLabel))}
        <!-- Two facts, two plain names. One row called "Movements" used to hold a
             times-done count while the day card called distinct moves by
             the same word. -->
        ${row("Times done", d => escapeHtml(d.performancesLabel))}
        ${row("Moves", d => escapeHtml(d.movementsLabel) + (d.forLabel ? `<div style="font-size:9px;font-weight:800;color:var(--ink-faint);">${escapeHtml(d.forLabel)}</div>` : ""))}
        ${row("Skipped", d => escapeHtml(d.skippedLabel))}
        ${row("Main rounds", d => escapeHtml(d.roundsLabel))}
        ${row("Ended early", d => escapeHtml(d.earlyLabel))}
        ${row("Pace", chip)}
        ${row("Streak", d => d.streakMark || "—")}
      </tbody>
    </table>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:9px;font-size:11px;color:var(--ink-soft);">
      ${[["var(--mint)", "Full pace"], ["var(--sun)", "Almost"], ["var(--coral)", "Short"],
         ["var(--stop)", "Very short"], ["var(--grape)", "Recovery"], ["var(--hairline)", "Nothing logged"]]
        .map(([c, t]) => `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:${c};"></span>${t}</span>`).join("")}
      <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:var(--surface);box-shadow:0 0 0 2px var(--ink);"></span>Today</span>
    </div>
    <div style="font-size:11px;color:var(--ink-soft);margin-top:5px;">🔥 earned the day · ❄️ recovery held it · — didn't earn it</div>`;
}

export function progressScreen(vm) {
  return `
    <div style="flex:1;min-width:0;padding:24px 26px;overflow-y:auto;box-sizing:border-box;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:32px;color:var(--ink);margin-bottom:18px;">Your Progress 🏅</div>

      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:2;min-width:280px;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:2px;">
            <span style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);text-transform:uppercase;">This week</span>
            <span style="font-size:13px;font-weight:800;color:var(--ink-soft);">${vm.sessionsLabel} · ${vm.minAvgVal} min avg</span>
          </div>
          ${weekTable(vm)}
        </div>
        <div style="flex:1;min-width:220px;background:var(--sun-wash);border:2px solid var(--sun);border-radius:var(--radius-xl);padding:16px 18px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:8px;">
          <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--sun-ink);text-transform:uppercase;">My prizes 🎁</div>
          ${vm.pendingDraws > 0 ? `
          <button type="button" data-action="openPrizeDraw" style="width:100%;flex-shrink:0;min-height:48px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:10px 16px;font-family:var(--font-display);font-weight:600;font-size:17px;cursor:pointer;box-shadow:0 4px 0 var(--sun-deep);">${escapeHtml(vm.pendingDrawLabel)}</button>` : ""}
          ${vm.hasPrizes ? `
          <div class="list-wrap" style="--fade-to:var(--sun-wash);flex:1 1 auto;min-height:260px;">
            <div data-list="1" style="position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;padding-bottom:8px;">
              ${vm.prizesWon.map(pz => `
              <div style="${pz.cardStyle}">
                <span style="font-size:22px;flex-shrink:0;">${escapeHtml(pz.icon)}</span>
                <span style="flex:1;font-size:14px;font-weight:800;color:var(--ink);line-height:1.2;">${escapeHtml(pz.label)}</span>
                ${pz.spent
                  ? `<span style="${pz.redeemBtnStyle}display:inline-flex;align-items:center;">${escapeHtml(pz.redeemLabel)}</span>`
                  : `<button type="button" data-action="redeemPrize" data-arg="${escapeHtml(pz.id)}" style="${pz.redeemBtnStyle}">${escapeHtml(pz.redeemLabel)}</button>`}
              </div>`).join("")}
            </div>
          </div>`
          : `<div style="font-size:13px;font-weight:700;color:var(--sun-ink);line-height:1.4;">Level up to earn a prize! Pick a sealed envelope each time you rank up. 🌟</div>`}
        </div>
      </div>

      <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
          <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);text-transform:uppercase;">How it's going</div>
          <div style="display:flex;background:var(--surface-2);border-radius:var(--radius-pill);padding:3px;gap:3px;">
            ${vm.periodStats.tabs.map(t => `<button type="button" data-action="progressScope" data-arg="${t.key}" style="${t.style}">${t.label}</button>`).join("")}
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--ink-faint);margin-bottom:12px;">${vm.periodStats.rangeLabel}</div>
        ${vm.periodStats.hasData ? `
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:0 14px;align-items:baseline;">
          <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-faint);text-transform:uppercase;padding-bottom:6px;"></div>
          <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-faint);text-transform:uppercase;text-align:right;padding-bottom:6px;">Total</div>
          <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-faint);text-transform:uppercase;text-align:right;padding-bottom:6px;">Average</div>
          ${vm.periodStats.rows.map(r => `
            <div style="font-size:13px;font-weight:800;color:var(--ink-soft);padding:7px 0;border-top:1px solid var(--hairline);">${r.label}</div>
            <div style="font-size:15px;font-weight:900;color:var(--ink);text-align:right;padding:7px 0;border-top:1px solid var(--hairline);white-space:nowrap;">${r.total}</div>
            <div style="font-size:13px;font-weight:800;color:var(--aqua-ink);text-align:right;padding:7px 0;border-top:1px solid var(--hairline);white-space:nowrap;">${r.avg}</div>`).join("")}
        </div>
        <div style="margin-top:16px;">
          <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-faint);text-transform:uppercase;margin-bottom:6px;">XP per day</div>
          <div style="display:flex;align-items:flex-end;gap:2px;height:48px;">
            ${vm.periodStats.xpByDay.map(d => `<div style="${d.barStyle}" title="${d.iso}: ${d.xp} XP"></div>`).join("")}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--ink-faint);padding-top:4px;">
            <span>${vm.periodStats.xpFirstLabel}</span><span>${vm.periodStats.xpLastLabel}</span>
          </div>
        </div>` : `
        <div style="font-size:14px;font-weight:700;color:var(--ink-soft);line-height:1.5;">No sessions in this window yet — train a day and the numbers land here. ${EMOJI.world}</div>`}
      </div>

      <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);margin-bottom:16px;">
        <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);margin-bottom:14px;text-transform:uppercase;">Milestones</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${vm.milestones.map(ms => `<div style="${ms.style}">${escapeHtml(ms.icon)} ${escapeHtml(ms.label)}</div>`).join("")}
        </div>
      </div>

      <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);text-transform:uppercase;">Training log</div>
          <div style="display:flex;background:var(--surface-2);border-radius:var(--radius-pill);padding:3px;gap:3px;">
            ${vm.logScopeTabs.map(lt => `<button type="button" data-action="logScope" data-arg="${lt.key}" style="${lt.style}">${lt.label}</button>`).join("")}
          </div>
        </div>
        <div class="rail-wrap">
          <div style="display:flex;gap:10px;overflow-x:auto;padding:12px 2px 10px;scroll-snap-type:x proximity;" data-rail="1">
            ${vm.hasLog ? vm.logItems.map(hi => `
              <div style="width:200px;flex-shrink:0;background:var(--surface-2);border-radius:var(--radius-lg);padding:14px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;scroll-snap-align:start;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span style="font-size:26px;line-height:1;" title="${escapeHtml(hi.moodLabel)}" aria-label="${escapeHtml(hi.moodLabel)}">${escapeHtml(hi.moodEmoji)}</span>
                  <span style="${hi.lightChipStyle}">${escapeHtml(hi.lightLabel)}</span>
                </div>
                <div style="font-weight:900;font-size:14px;color:var(--ink);line-height:1.25;">${escapeHtml(hi.dayTitle)}</div>
                <div style="font-size:12px;font-weight:700;color:var(--ink-soft);">${escapeHtml(hi.dateStr)} · ${escapeHtml(hi.duration)}${hi.sittingsLabel ? ` · ${escapeHtml(hi.sittingsLabel)}` : ""}</div>
                ${hi.painNote ? `<div style="font-size:11px;font-weight:800;color:var(--stop);">🛑 ${escapeHtml(hi.painNote)}</div>` : ""}
                ${hi.note ? `<div style="font-size:12px;font-weight:700;color:var(--sun-ink);line-height:1.35;">${escapeHtml(hi.note)}</div>` : ""}
              </div>`).join("")
            : `<div style="padding:14px;font-size:14px;font-weight:700;color:var(--ink-soft);">No sessions yet — your first one lands here. ${EMOJI.world}</div>`}
            <button type="button" data-action="nav" data-arg="grownup" style="width:150px;flex-shrink:0;background:var(--aqua-wash);border:2px dashed var(--aqua-light);border-radius:var(--radius-lg);padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;scroll-snap-align:start;">
              <span style="font-size:26px;">📖</span>
              <span style="font-size:13px;font-weight:900;color:var(--aqua-ink);text-align:center;line-height:1.2;">Full logbook<br>in Grown-up →</span>
            </button>
          </div>
        </div>
      </div>

      <div style="background:linear-gradient(160deg,var(--aqua-wash),var(--surface));border:1.5px solid var(--aqua-light);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);">
        <div style="display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,#143B4A,var(--aqua));border-radius:var(--radius-lg);padding:16px 18px;color:#fff;flex-wrap:wrap;">
          <div style="width:66px;height:66px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;border:3px solid rgba(255,255,255,0.5);">
            <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;opacity:0.85;">LVL</div>
            <div style="font-family:var(--font-display);font-size:28px;font-weight:600;line-height:1;">${vm.level.levelNum}</div>
          </div>
          <div style="flex:1;min-width:200px;">
            <div style="font-family:var(--font-display);font-size:24px;font-weight:600;line-height:1.1;">${vm.level.rankIcon} ${vm.level.rankName}</div>
            <div style="font-size:14px;opacity:0.9;margin:3px 0 9px;font-weight:700;">${vm.level.xp} XP${vm.level.atSummit ? " · top of the ladder 🏔️" : ` · ${vm.level.xpToNext} XP to ${vm.level.nextRank} →`}</div>
            <div style="height:10px;background:rgba(255,255,255,0.22);border-radius:10px;overflow:hidden;">
              <div style="width:${vm.level.levelPct}%;height:100%;background:#fff;border-radius:10px;transition:width 0.5s;"></div>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:16px;">
          <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);text-transform:uppercase;">${COPY.storyTitle}</div>
          <div style="font-family:var(--font-hand);font-size:19px;font-weight:700;color:var(--aqua-ink);">${COPY.storyTagline}</div>
        </div>
        <div class="rail-wrap">
          <div style="display:flex;gap:14px;overflow-x:auto;padding:12px 2px 12px;scroll-snap-type:x mandatory;" data-rail="1">
            ${vm.rankStory.map(os => `
              <div style="${os.cardStyle}">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="${os.iconBubbleStyle}">${os.icon}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:10px;font-weight:900;letter-spacing:0.05em;color:var(--aqua-ink);text-transform:uppercase;">${os.chapter}</div>
                    <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--ink);line-height:1;margin-top:2px;">${os.name}</div>
                  </div>
                </div>
                <span style="${os.badgeStyle}margin-top:12px;align-self:flex-start;">${os.badge}</span>
                <div style="font-size:14px;font-weight:700;color:var(--ink);line-height:1.5;margin-top:10px;flex:1;">${os.story}</div>
                ${os.unlocked ? `
                <div style="background:var(--aqua-wash);border-radius:12px;padding:9px 11px;margin-top:12px;display:flex;gap:8px;align-items:flex-start;">
                  <span style="font-size:15px;flex-shrink:0;">${COPY.transferIcon}</span>
                  <span style="font-size:13px;font-weight:800;color:var(--aqua-ink);line-height:1.4;">${os.transfer}</span>
                </div>
                <div style="background:var(--surface-2);border-radius:12px;padding:9px 11px;margin-top:8px;">
                  <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-soft);text-transform:uppercase;">Did you know?</div>
                  <div style="font-size:13px;font-weight:700;color:var(--ink);line-height:1.4;margin-top:3px;">${os.fact}</div>
                </div>` : ""}
              </div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;
}
