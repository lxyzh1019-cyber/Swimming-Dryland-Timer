/* ============================================================
   PROGRESS screen — streak hero, prize wallet, milestones,
   training log rail, LVL hero + Ocean Story rank cards.
   ============================================================ */

export function progressScreen(vm) {
  return `
    <div style="flex:1;min-width:0;padding:24px 26px;overflow-y:auto;box-sizing:border-box;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:32px;color:var(--ink);margin-bottom:18px;">Your Progress 🏅</div>

      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:2;min-width:280px;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);display:flex;align-items:center;gap:18px;">
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--coral-wash);border-radius:20px;padding:12px 16px;flex-shrink:0;">
            <span style="font-size:30px;line-height:1;">🔥</span>
            <span style="font-family:var(--font-display);font-weight:600;font-size:28px;color:var(--coral);line-height:1;">${vm.dayStreakVal}</span>
            <span style="font-size:11px;font-weight:900;color:var(--coral);letter-spacing:0.03em;">DAY STREAK</span>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">
              <span style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);text-transform:uppercase;">This week</span>
              <span style="font-size:13px;font-weight:800;color:var(--ink-soft);">${vm.sessionsVal} sessions · ${vm.minAvgVal} min avg</span>
            </div>
            <div style="display:flex;gap:6px;align-items:flex-end;height:64px;">
              ${vm.analyticsWeek.map(ab => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;">
                  <div style="${ab.barStyle}"></div>
                  <span style="font-size:11px;font-weight:900;color:var(--ink-soft);text-transform:uppercase;">${ab.short}</span>
                </div>`).join("")}
            </div>
          </div>
        </div>
        <div style="flex:1;min-width:220px;background:var(--sun-wash);border:2px solid var(--sun);border-radius:var(--radius-xl);padding:16px 18px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:8px;">
          <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--sun-ink);text-transform:uppercase;">My prizes 🎁</div>
          ${vm.hasPrizes ? vm.prizesWon.map(pz => `
            <div style="${pz.cardStyle}">
              <span style="font-size:22px;flex-shrink:0;">${pz.icon}</span>
              <span style="flex:1;font-size:14px;font-weight:800;color:var(--ink);line-height:1.2;">${pz.label}</span>
              <button type="button" data-action="redeemPrize" data-arg="${pz.id}" style="${pz.redeemBtnStyle}">${pz.redeemLabel}</button>
            </div>`).join("")
          : `<div style="font-size:13px;font-weight:700;color:var(--sun-ink);line-height:1.4;">Level up to earn a prize! Pick a sealed envelope each time you rank up. 🌟</div>`}
        </div>
      </div>

      <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);margin-bottom:16px;">
        <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);margin-bottom:14px;text-transform:uppercase;">Milestones</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${vm.milestones.map(ms => `<div style="${ms.style}">${ms.icon} ${ms.label}</div>`).join("")}
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
                  <span style="font-size:26px;line-height:1;">${hi.moodEmoji}</span>
                  <span style="${hi.lightChipStyle}">${hi.lightLabel}</span>
                </div>
                <div style="font-weight:900;font-size:14px;color:var(--ink);line-height:1.25;">${hi.dayTitle}</div>
                <div style="font-size:12px;font-weight:700;color:var(--ink-soft);">${hi.dateStr} · ${hi.duration}</div>
                ${hi.note ? `<div style="font-size:12px;font-weight:700;color:var(--sun-ink);line-height:1.35;">${hi.note}</div>` : ""}
              </div>`).join("")
            : `<div style="padding:14px;font-size:14px;font-weight:700;color:var(--ink-soft);">No sessions yet — your first one lands here. 🌊</div>`}
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
          <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);text-transform:uppercase;">Your ocean story</div>
          <div style="font-family:var(--font-hand);font-size:19px;font-weight:700;color:var(--aqua-ink);">Every level is a new sea friend 🌊</div>
        </div>
        <div class="rail-wrap">
          <div style="display:flex;gap:14px;overflow-x:auto;padding:12px 2px 12px;scroll-snap-type:x mandatory;" data-rail="1">
            ${vm.oceanStory.map(os => `
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
                  <span style="font-size:15px;flex-shrink:0;">🏊</span>
                  <span style="font-size:13px;font-weight:800;color:var(--aqua-ink);line-height:1.4;">${os.swim}</span>
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
