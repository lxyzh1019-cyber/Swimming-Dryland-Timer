/* ============================================================
   GROWN-UP ZONE screen — Overview / Analytics / Coaching /
   Move Library / Settings. Transcribed from the design; the
   Coaching tab is new (PR board, Independence Ladder, valgus
   gate, engagement systems — carried over from the old app).
   ============================================================ */

import { escapeHtml } from "../util.js";

const card = (inner, extra = "") => `<div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);${extra}">${inner}</div>`;
const secTitle = (t) => `<div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--ink-soft);text-transform:uppercase;">${t}</div>`;
const divider = (t) => `
  <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
    <span style="font-family:var(--font-display);font-weight:600;font-size:19px;color:var(--ink);white-space:nowrap;flex-shrink:0;">${t}</span>
    <div style="flex:1;height:1.5px;background:var(--hairline);"></div>
  </div>`;

function flagsCard(a, scopeLabel) {
  return a.flags ? `
  <div style="background:var(--surface);border:2px solid var(--sun);border-radius:var(--radius-xl);padding:16px 18px;box-shadow:var(--shadow-soft);">
    ${secTitle("⚑ Watch list · " + scopeLabel)}
    ${a.flags.map(fl => `
      <div style="${fl.rowStyle}">
        <span style="font-size:18px;line-height:1;flex-shrink:0;">${fl.icon}</span>
        <span style="font-size:14px;font-weight:700;color:var(--ink);line-height:1.4;">${fl.text}</span>
      </div>`).join("")}
  </div>` : "";
}

function stopsCard(a, scopeLabel) {
  return a.hasStops ? `
  <div style="background:var(--stop-wash);border:2px solid var(--stop);border-radius:var(--radius-xl);padding:16px 18px;box-shadow:var(--shadow-soft);">
    <div style="font-weight:900;font-size:12px;letter-spacing:0.05em;color:var(--stop-ink);text-transform:uppercase;">🔴 Stop-rule events · ${scopeLabel}</div>
    ${a.stopEvents.map(se => `
      <div style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;">
        <span style="font-size:16px;line-height:1.3;flex-shrink:0;">🛑</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:900;color:var(--ink);">${se.date} · ${se.move}</div>
          <div style="font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.4;margin-top:2px;">${se.note}</div>
        </div>
      </div>`).join("")}
  </div>` : `
  <div style="display:flex;align-items:center;gap:10px;background:var(--mint-wash);border-radius:var(--radius-xl);padding:13px 18px;">
    <span style="font-size:17px;">🔴</span>
    <span style="font-size:14px;font-weight:800;color:var(--mint-ink);">No stop-rule events · ${scopeLabel} — the stop rule wasn't needed. ✓</span>
  </div>`;
}

function readinessCard(a, scopeLabel, withSub) {
  return card(`
    ${secTitle("Readiness → completion · " + scopeLabel)}
    ${withSub ? `<div style="font-size:13px;color:var(--ink-faint);margin:4px 0 14px;line-height:1.3;">Did the traffic-light call predict how the session actually went? Bar = % of those sessions finished.</div>` : `<div style="margin-bottom:14px;"></div>`}
    ${a.hasReadiness ? `
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${a.readinessOutcome.map(ro => `
        <div>
          <div style="display:flex;align-items:center;gap:11px;">
            <span style="${ro.dotStyle}"></span>
            <span style="width:74px;font-size:14px;font-weight:900;color:var(--ink);flex-shrink:0;">${ro.light}</span>
            <div style="flex:1;height:12px;background:var(--surface-2);border-radius:8px;overflow:hidden;"><div style="${ro.barStyle}"></div></div>
            <span style="width:96px;font-size:12px;font-weight:800;color:var(--ink-soft);text-align:right;flex-shrink:0;">${ro.ratio}</span>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--ink-faint);margin:3px 0 0 85px;line-height:1.3;">${ro.note}</div>
        </div>`).join("")}
    </div>` : `<div style="font-size:14px;font-weight:700;color:var(--ink-faint);">Not enough sessions yet — this fills in as the log grows.</div>`}`);
}

function overviewTab(vm) {
  const a = vm.analytics;
  return `
  <div style="display:flex;flex-direction:column;gap:14px;">
    ${flagsCard(a, vm.scopeLabel)}
    ${stopsCard(a, vm.scopeLabel)}
    <div style="background:var(--surface);border:2px solid var(--aqua-light);border-radius:var(--radius-xl);padding:16px 18px;box-shadow:var(--shadow-soft);">
      ${secTitle("Messages from training 📣")}
      ${vm.guAlerts.map(ga => `
        <div style="${ga.rowStyle}">
          <span style="font-size:18px;line-height:1;flex-shrink:0;">${ga.icon}</span>
          <span style="font-size:14px;font-weight:700;color:var(--ink);line-height:1.4;">${ga.text}</span>
        </div>`).join("")}
    </div>
    <div style="${vm.guStatsGrid}">
      <div style="background:var(--aqua-wash);border-radius:var(--radius-lg);padding:16px;text-align:center;">
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;color:var(--aqua-ink);line-height:1;">${a.adherence}%</div>
        <div style="font-size:12px;font-weight:900;color:var(--aqua-ink);letter-spacing:0.04em;text-transform:uppercase;margin-top:5px;">Adherence · ${vm.scopeLabel}</div>
      </div>
      <div style="background:var(--surface-2);border-radius:var(--radius-lg);padding:16px;text-align:center;">
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;color:var(--ink);line-height:1;">${a.sessions}/${a.scheduled}</div>
        <div style="font-size:12px;font-weight:900;color:var(--ink-soft);letter-spacing:0.04em;text-transform:uppercase;margin-top:5px;">Sessions done</div>
      </div>
      <div style="background:var(--mint-wash);border-radius:var(--radius-lg);padding:16px;text-align:center;">
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;color:var(--mint-ink);line-height:1;">${a.avgMins}</div>
        <div style="font-size:12px;font-weight:900;color:var(--mint-ink);letter-spacing:0.04em;text-transform:uppercase;margin-top:5px;">Avg min/session</div>
      </div>
      <div style="background:var(--surface-2);border-radius:var(--radius-lg);padding:16px;text-align:center;">
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;color:var(--ink);line-height:1;">${a.totalMins}</div>
        <div style="font-size:12px;font-weight:900;color:var(--ink-soft);letter-spacing:0.04em;text-transform:uppercase;margin-top:5px;">Total minutes</div>
      </div>
    </div>
    ${readinessCard(a, vm.scopeLabel, false)}
    <div style="background:var(--aqua-wash);border-radius:var(--radius-xl);padding:16px 18px;display:flex;gap:12px;align-items:flex-start;">
      <span style="font-size:22px;flex-shrink:0;">🧑‍🏫</span>
      <div>
        <div style="font-weight:900;font-size:13px;color:var(--aqua-ink);text-transform:uppercase;letter-spacing:0.04em;">Coach's read</div>
        <div style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.5;margin-top:3px;">${a.read}</div>
      </div>
    </div>
    ${card(`
      ${secTitle("Standing rules")}
      <div style="margin-top:10px;">
      ${vm.standingRules.map(sr => `<div style="padding:8px 0;border-bottom:1px solid var(--hairline);font-size:15px;color:var(--ink);line-height:1.4;">${sr}</div>`).join("")}
      </div>`)}
  </div>`;
}

function formCheckTab(vm) {
  const f = vm.formCheck;
  return `
  <div style="display:flex;flex-direction:column;gap:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <span style="font-family:var(--font-display);font-weight:600;font-size:20px;color:var(--ink);">Form check</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" data-action="formCheckMonth" data-arg="${f.prevMonth}" style="min-height:38px;width:38px;border-radius:50%;border:2px solid var(--hairline);background:var(--surface);font-size:15px;font-weight:900;cursor:pointer;font-family:inherit;" aria-label="Previous month">◀</button>
        <span style="font-weight:900;font-size:14px;color:var(--ink);min-width:120px;text-align:center;">${f.monthLabel}</span>
        <button type="button" data-action="formCheckMonth" data-arg="${f.nextMonth}" ${f.atCurrentMonth ? "disabled" : ""} style="min-height:38px;width:38px;border-radius:50%;border:2px solid var(--hairline);background:var(--surface);font-size:15px;font-weight:900;cursor:${f.atCurrentMonth ? "default" : "pointer"};opacity:${f.atCurrentMonth ? "0.4" : "1"};font-family:inherit;" aria-label="Next month">▶</button>
      </div>
    </div>

    ${card(`
      ${secTitle("What she claims vs what you saw")}
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-top:10px;">
        <div style="display:flex;flex-direction:column;align-items:center;background:var(--surface-2);border-radius:16px;padding:11px 18px;">
          <span style="font-family:var(--font-display);font-weight:600;font-size:28px;color:var(--ink);line-height:1;">${f.selfPct == null ? "—" : f.selfPct + "%"}</span>
          <span style="font-size:11px;font-weight:900;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.04em;">she reports</span>
        </div>
        <span style="font-size:20px;color:var(--ink-faint);">vs</span>
        <div style="display:flex;flex-direction:column;align-items:center;background:${f.gap != null && f.gap <= -15 ? "color-mix(in srgb, var(--coral) 12%, #fff)" : "var(--mint-wash)"};border-radius:16px;padding:11px 18px;">
          <span style="font-family:var(--font-display);font-weight:600;font-size:28px;color:${f.gap != null && f.gap <= -15 ? "var(--coral)" : "var(--mint-ink)"};line-height:1;">${f.verifiedPct == null ? "—" : f.verifiedPct + "%"}</span>
          <span style="font-size:11px;font-weight:900;color:${f.gap != null && f.gap <= -15 ? "var(--coral)" : "var(--mint-ink)"};text-transform:uppercase;letter-spacing:0.04em;">you verified</span>
        </div>
        <div style="flex:1;min-width:220px;font-size:14px;font-weight:800;color:var(--ink);line-height:1.45;">${f.headline}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--ink-faint);margin-top:12px;">${f.doneCount} of ${f.total} checked this month.</div>`)}

    ${divider("👁 Watch these")}
    ${f.queue.length ? f.queue.map(c => `
      <div style="${c.cardStyle}">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <span style="font-family:var(--font-display);font-weight:600;font-size:19px;color:var(--ink);">${escapeHtml(c.name)}</span>
          <span style="font-size:12px;font-weight:800;color:var(--ink-soft);">${escapeHtml(c.selfLabel)}</span>
        </div>
        <div style="display:flex;gap:9px;align-items:flex-start;background:var(--surface-2);border-radius:12px;padding:10px 12px;">
          <span style="font-size:15px;flex-shrink:0;">👁</span>
          <div><span style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-faint);text-transform:uppercase;">Watch for</span>
          <div style="font-size:14px;font-weight:800;color:var(--ink);line-height:1.4;">${escapeHtml(c.watch)}</div></div>
        </div>
        ${c.fix ? `
        <div style="display:flex;gap:9px;align-items:flex-start;background:var(--aqua-wash);border-radius:12px;padding:10px 12px;">
          <span style="font-size:15px;flex-shrink:0;">🔧</span>
          <div><span style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--aqua-ink);text-transform:uppercase;">The fix</span>
          <div style="font-size:14px;font-weight:800;color:var(--aqua-ink);line-height:1.4;">${escapeHtml(c.fix)}</div></div>
        </div>` : ""}
        <div style="display:flex;gap:9px;">
          <button type="button" data-action="formCheckPass" data-arg="${escapeHtml(c.name)}" style="${c.passStyle}">✓ Meets criteria</button>
          <button type="button" data-action="formCheckFail" data-arg="${escapeHtml(c.name)}" style="${c.failStyle}">✗ Not yet</button>
        </div>
        <div style="font-size:11px;font-weight:700;color:var(--ink-faint);">Picked because: ${escapeHtml(c.why)}</div>
      </div>`).join("")
      : `<div style="font-size:14px;font-weight:700;color:var(--ink-soft);line-height:1.5;">No moves with written criteria yet — once she has trained a few sessions they'll queue up here.</div>`}

    ${f.flagged.length ? card(`
      ${secTitle("⚠️ Flagged for re-teaching")}
      <div style="font-size:14px;font-weight:800;color:var(--ink);line-height:1.5;margin-top:8px;">${f.flagged.map(escapeHtml).join(" · ")}</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.45;margin-top:6px;">These go to the front of the next session's random spot-checks.</div>`) : ""}

    <div style="font-size:12px;font-weight:700;color:var(--ink-faint);line-height:1.5;background:var(--surface-2);border-radius:12px;padding:11px 13px;">${f.note}</div>
  </div>`;
}

function analyticsTab(vm) {
  const a = vm.analytics;
  return `
  <div style="display:flex;flex-direction:column;gap:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-family:var(--font-display);font-weight:600;font-size:20px;color:var(--ink);">Coach analytics</span>
        <span style="font-size:12px;font-weight:900;letter-spacing:0.04em;background:var(--aqua-wash);color:var(--aqua-ink);border-radius:var(--radius-pill);padding:5px 12px;text-transform:uppercase;">${vm.scopeLabel}</span>
      </div>
      <button type="button" data-action="exportCsv" style="min-height:40px;border:2px solid var(--aqua);background:var(--aqua-wash);color:var(--aqua-ink);border-radius:var(--radius-pill);font-weight:900;font-size:13px;padding:0 16px;cursor:pointer;font-family:inherit;">⬇︎ Export CSV</button>
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--ink-faint);margin-top:-6px;">${a.periodCovered}</div>

    ${card(`
      ${secTitle("At a glance · " + vm.scopeLabel)}
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 12px;line-height:1.3;">Every number here answers to the period toggle above.</div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:0 14px;align-items:baseline;">
        <div></div>
        <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-faint);text-transform:uppercase;text-align:right;padding-bottom:6px;">Total</div>
        <div style="font-size:10px;font-weight:900;letter-spacing:0.06em;color:var(--ink-faint);text-transform:uppercase;text-align:right;padding-bottom:6px;">Average</div>
        ${a.indicators.map(ind => `
          <div style="font-size:13px;font-weight:800;color:var(--ink-soft);padding:7px 0;border-top:1px solid var(--hairline);">${ind.label}</div>
          <div style="font-size:15px;font-weight:900;color:var(--ink);text-align:right;padding:7px 0;border-top:1px solid var(--hairline);white-space:nowrap;">${ind.total}</div>
          <div style="font-size:13px;font-weight:800;color:var(--aqua-ink);text-align:right;padding:7px 0;border-top:1px solid var(--hairline);white-space:nowrap;">${ind.avg}</div>`).join("")}
      </div>`)}

    ${card(`
      ${secTitle("🧭 Is she trying?")}
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:10px;">
        <div style="display:flex;flex-direction:column;align-items:center;background:var(--aqua-wash);border-radius:18px;padding:12px 18px;flex-shrink:0;">
          <span style="font-family:var(--font-display);font-weight:600;font-size:34px;color:var(--aqua-ink);line-height:1;">${a.isSheTrying.avg == null ? "—" : a.isSheTrying.avg}</span>
          <span style="font-size:11px;font-weight:900;letter-spacing:0.04em;color:var(--aqua-ink);text-transform:uppercase;">${a.isSheTrying.band}</span>
        </div>
        ${a.isSheTrying.hasTrend ? `
        <div style="display:flex;align-items:flex-end;gap:5px;height:74px;flex:1;min-width:120px;max-width:280px;">
          ${a.isSheTrying.trend.map(t => `<div style="flex:1;display:flex;align-items:flex-end;height:100%;"><div style="${t.barStyle}"></div></div>`).join("")}
        </div>` : ""}
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px;">
          ${a.isSheTrying.lines.map(l => `<div style="font-size:14px;font-weight:800;color:var(--ink);line-height:1.4;">${l}</div>`).join("")}
          ${a.isSheTrying.gapNote ? `<div style="font-size:13px;font-weight:800;color:${a.isSheTrying.formGap != null && a.isSheTrying.formGap <= -15 ? "var(--coral)" : "var(--mint-ink)"};line-height:1.4;">${a.isSheTrying.gapNote}</div>` : ""}
        </div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--ink-faint);line-height:1.45;margin-top:12px;background:var(--surface-2);border-radius:12px;padding:9px 12px;">${a.isSheTrying.note}</div>`)}

    ${divider("🚨 Safety &amp; flags")}
    ${flagsCard(a, vm.scopeLabel)}
    ${stopsCard(a, vm.scopeLabel)}

    ${divider("📅 Consistency &amp; load")}
    <div style="${vm.grid2}">
      ${card(`
        ${secTitle("Consistency")}
        <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 12px;line-height:1.3;">${a.consistency.subtitle}</div>
        ${a.consistency.showDows ? `
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:5px;">
          ${["M","T","W","T","F","S","S"].map(d => `<span style="text-align:center;font-size:10px;font-weight:900;color:var(--ink-faint);">${d}</span>`).join("")}
        </div>` : ""}
        <div style="${a.consistency.gridStyle}">
          ${a.consistency.cells.map(cd => `<div style="${cd.cellStyle}">${cd.d}</div>`).join("")}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;">
          ${a.consistency.legend.map(lg => `<span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:var(--ink-soft);"><span style="width:10px;height:10px;border-radius:4px;background:${lg.c};"></span>${lg.label}</span>`).join("")}
        </div>`)}
      <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:18px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          ${secTitle(a.loadTitle)}
          ${a.loadHeadline.hasDelta ? `<span style="${a.loadHeadline.deltaStyle}">${a.loadHeadline.deltaLabel}</span>` : ""}
        </div>
        <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 6px;line-height:1.3;">${a.loadSubtitle}</div>
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px;">
          <span style="font-family:var(--font-display);font-size:26px;font-weight:600;color:var(--aqua-ink);line-height:1;">${a.loadHeadline.total}</span>
          <span style="font-size:12px;font-weight:800;color:var(--ink-faint);">${a.loadHeadline.unit}</span>
        </div>
        <div style="flex:1;display:flex;gap:8px;align-items:flex-end;justify-content:space-around;min-height:110px;">
          ${a.loadTrend.map(lt => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;">
              <span style="font-size:10px;font-weight:900;color:var(--ink-soft);">${lt.minsLabel}</span>
              <div style="display:flex;align-items:flex-end;gap:2px;">
                <div style="${lt.ghostStyle}"></div>
                <div style="${lt.barStyle}"></div>
              </div>
              <span style="font-size:10px;font-weight:900;color:var(--ink-faint);">${lt.k}</span>
            </div>`).join("")}
        </div>
        <div style="display:flex;gap:14px;margin-top:10px;">
          <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:var(--ink-soft);"><span style="width:9px;height:9px;border-radius:3px;background:var(--aqua);"></span>This period</span>
          <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:var(--ink-soft);"><span style="width:9px;height:9px;border-radius:3px;background:var(--aqua);opacity:0.22;"></span>Previous</span>
        </div>
      </div>
    </div>

    ${card(`
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div>
          ${secTitle("Load ratio (ACWR)")}
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:8px;">
            <span style="font-family:var(--font-display);font-size:38px;font-weight:600;color:${a.acwr.color};line-height:1;">${a.acwr.value}</span>
            <span style="font-size:14px;font-weight:900;color:${a.acwr.color};">${a.acwr.label}</span>
          </div>
        </div>
        <div style="flex:1;min-width:220px;font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.45;">${a.acwr.note}</div>
      </div>`)}

    <div style="${vm.grid2}">
      ${card(`
        ${secTitle("Planned vs actual duration")}
        <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 14px;line-height:1.3;">Chronic overruns = plan too long. Big underruns = rushing (a form risk).</div>
        ${a.pace.rows.length ? `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${a.pace.rows.map(pr => `
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:42px;font-size:13px;font-weight:900;color:var(--ink);flex-shrink:0;">${pr.label}</span>
              <div style="flex:1;height:12px;background:var(--surface-2);border-radius:8px;overflow:hidden;"><div style="${pr.fillStyle}"></div></div>
              <span style="width:92px;font-size:12px;font-weight:800;color:var(--ink-soft);text-align:right;flex-shrink:0;">${pr.valueLabel}</span>
            </div>`).join("")}
        </div>` : ""}
        <div style="font-size:12px;font-weight:700;color:var(--ink-faint);margin-top:10px;line-height:1.4;">${a.pace.note}</div>`)}
      ${card(`
        ${secTitle("Pauses mid-session")}
        <div style="display:flex;align-items:baseline;gap:8px;margin:10px 0 10px;flex-wrap:wrap;">
          <span style="font-family:var(--font-display);font-size:34px;font-weight:600;color:var(--coral);line-height:1;">${a.pauses.total}</span>
          <span style="font-size:15px;font-weight:800;color:var(--ink-soft);white-space:nowrap;">pauses · ${vm.scopeLabel}</span>
        </div>
        ${a.pauses.where.length ? `
        <div style="font-size:11px;font-weight:900;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.04em;margin:8px 0 8px;">Where they happen</div>
        <div style="display:flex;flex-direction:column;gap:9px;">
          ${a.pauses.where.map(pw => `
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:96px;font-size:14px;font-weight:700;color:var(--ink);flex-shrink:0;">${pw.label}</span>
              <div style="${pw.barStyle}"></div>
              <span style="font-size:13px;font-weight:900;color:var(--coral);flex-shrink:0;">×${pw.count}</span>
            </div>`).join("")}
        </div>` : ""}
        <div style="font-size:12px;font-weight:700;color:var(--ink-faint);margin-top:10px;line-height:1.4;">${a.pauses.note}</div>`)}
    </div>

    <div style="${vm.grid2}">
      ${card(`
        ${secTitle("Skipped moves · " + vm.scopeLabel)}
        <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 14px;line-height:1.3;">The exact exercises she tapped past — a recurring skip is a move to scale or move earlier.</div>
        ${a.hasSkippedMoves ? `
        <div style="display:flex;flex-direction:column;gap:11px;">
          ${a.skippedMoves.map(sm => `
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sm.name}</div>
                <div style="font-size:11px;font-weight:800;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.03em;">${sm.block}</div>
              </div>
              <div style="${sm.barStyle}"></div>
              <span style="font-size:13px;font-weight:900;color:var(--grape-ink);flex-shrink:0;width:24px;text-align:right;">×${sm.count}</span>
            </div>`).join("")}
        </div>` : `<div style="font-size:14px;font-weight:800;color:var(--mint-ink);">No moves skipped — every exercise got done. ✓</div>`}`)}
      ${card(`
        ${secTitle("Skips by block")}
        <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 14px;line-height:1.3;">Which block gets cut when time runs short.</div>
        ${a.skips.length ? `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${a.skips.map(sk => `
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:96px;font-size:14px;font-weight:700;color:var(--ink);flex-shrink:0;">${sk.label}</span>
              <div style="${sk.barStyle}"></div>
              <span style="font-size:13px;font-weight:900;color:var(--grape-ink);flex-shrink:0;">×${sk.count}</span>
            </div>`).join("")}
        </div>` : `<div style="font-size:14px;font-weight:800;color:var(--mint-ink);">No blocks getting cut. ✓</div>`}`)}
    </div>

    ${divider("⭐ Quality &amp; readiness")}
    ${readinessCard(a, vm.scopeLabel, true)}

    ${card(`
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        ${secTitle("Mood before → after")}
        ${a.hasMood ? `<span style="font-size:14px;font-weight:900;color:var(--mint-ink);white-space:nowrap;">Mood held or improved ${a.moodUpPct}% of sessions</span>` : ""}
      </div>
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 14px;line-height:1.3;">Before ≈ the readiness light · After = how she felt at the end. Shown per session (never averaged — one bad day matters).</div>
      ${a.hasMood ? `
      <div class="rail-wrap"><div style="display:flex;gap:10px;overflow-x:auto;padding:2px 2px 10px;" data-rail="1">
        ${a.mood.map(md => `
          <div style="min-width:96px;flex-shrink:0;background:var(--surface-2);border-radius:16px;padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;">
            <span style="font-size:11px;font-weight:900;color:var(--ink-soft);text-transform:uppercase;">${md.day}</span>
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="font-size:24px;">${md.before}</span>
              <span style="font-size:16px;font-weight:900;color:${md.arrowColor};">${md.arrow}</span>
              <span style="font-size:24px;">${md.after}</span>
            </div>
          </div>`).join("")}
      </div></div>` : `<div style="font-size:14px;font-weight:700;color:var(--ink-faint);">Mood check-ins land here after the first completed sessions.</div>`}`)}

    <div style="${vm.grid2}">
      ${card(`
        ${secTitle("Main-set rounds")}
        <div style="display:flex;align-items:baseline;gap:8px;margin:10px 0 10px;flex-wrap:wrap;">
          <span style="font-family:var(--font-display);font-size:34px;font-weight:600;color:var(--aqua);line-height:1;">${a.rounds.done}</span>
          <span style="font-size:15px;font-weight:800;color:var(--ink-soft);white-space:nowrap;">/ ${a.rounds.planned} planned · ${a.roundsDonePct}%</span>
        </div>
        <div style="height:10px;background:var(--surface-2);border-radius:10px;overflow:hidden;margin-bottom:10px;"><div style="width:${a.roundsDonePct}%;height:100%;background:var(--aqua);border-radius:10px;"></div></div>
        <div style="font-size:12px;font-weight:700;color:var(--ink-faint);line-height:1.4;">${a.rounds.note}</div>`)}
      ${card(`
        ${secTitle("Form quality")}
        ${a.hasForm ? `
        <div style="display:flex;align-items:baseline;gap:8px;margin:10px 0 10px;flex-wrap:wrap;">
          <span style="font-family:var(--font-display);font-size:34px;font-weight:600;color:var(--mint-ink);line-height:1;">${a.formCleanPct}%</span>
          <span style="font-size:15px;font-weight:800;color:var(--ink-soft);white-space:nowrap;">clean reps (${a.form.clean} clean · ${a.form.wobbly} wobbly)</span>
        </div>
        ${a.formTrend.length > 1 ? `
        <div style="display:flex;gap:7px;align-items:flex-end;height:90px;margin-top:8px;">
          ${a.formTrend.map(ft => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;">
              <span style="font-size:10px;font-weight:900;color:var(--mint-ink);">${ft.pctLabel}</span>
              <div style="${ft.barStyle}"></div>
              <span style="font-size:10px;font-weight:900;color:var(--ink-faint);">${ft.k}</span>
            </div>`).join("")}
        </div>` : ""}` : `<div style="font-size:14px;font-weight:700;color:var(--ink-faint);margin-top:8px;">Tallied from the “clean / wobbly” self-check after each main-set move — it fills in as sessions land.</div>`}
        <div style="display:flex;gap:8px;align-items:flex-start;background:var(--surface-2);border-radius:12px;padding:11px 13px;margin-top:14px;">
          <span style="font-size:15px;flex-shrink:0;">ℹ️</span>
          <div style="font-size:12px;font-weight:700;color:var(--ink-soft);line-height:1.45;">Clean vs. wobbly comes from the per-move <b style="color:var(--ink);">“clean / wobbly” self-check</b>. It's a self-report — a coach eyeballing a wobble still overrides it.</div>
        </div>`)}
    </div>

    ${divider("🧠 Focus &amp; learning")}
    ${a.byWeekday ? card(`
      ${secTitle("By weekday")}
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 14px;line-height:1.3;">Each day has a training topic. Which days land, and how she feels on them.</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${a.byWeekday.map(wd => `
          <div style="display:flex;align-items:center;gap:12px;background:${wd.rowBg};border-radius:12px;padding:10px 13px;">
            <span style="width:36px;font-size:13px;font-weight:900;color:var(--ink);flex-shrink:0;">${wd.k}</span>
            <span style="flex:1;min-width:0;font-size:14px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${wd.topic}</span>
            <span style="font-size:20px;flex-shrink:0;">${wd.mood}</span>
            <span style="${wd.statusStyle}">${wd.statusChip}</span>
          </div>`).join("")}
      </div>`) : ""}
    ${a.byTopic ? card(`
      ${secTitle("By training topic")}
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 14px;line-height:1.3;">Completion rate + typical mood per training focus — this is where to decide what to redesign.</div>
      ${a.byTopic.length ? `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${a.byTopic.map(tp => `
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;">
              <span style="flex:1;min-width:0;font-size:14px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tp.k}</span>
              <span style="font-size:18px;flex-shrink:0;">${tp.mood}</span>
              <span style="font-size:13px;font-weight:900;color:var(--ink-soft);flex-shrink:0;width:64px;text-align:right;">${tp.ratio} · ${tp.pct}%</span>
            </div>
            <div style="height:10px;background:var(--surface-2);border-radius:10px;overflow:hidden;"><div style="${tp.barStyle}"></div></div>
          </div>`).join("")}
      </div>` : `<div style="font-size:14px;font-weight:700;color:var(--ink-faint);">No sessions in this period yet.</div>`}`) : ""}

    ${card(`
      ${secTitle("Quiz score trend")}
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 12px;line-height:1.3;">${a.quizSubtitle} Is the “why we do this” knowledge sticking?</div>
      ${a.hasQuiz ? `
      <div style="display:flex;gap:7px;align-items:flex-end;height:110px;">
        ${a.quizTrend.map(qt => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;">
            <span style="font-size:10px;font-weight:900;color:var(--grape-ink);">${qt.pctLabel}</span>
            <div style="${qt.barStyle}"></div>
            <span style="font-size:10px;font-weight:900;color:var(--ink-faint);">${qt.k}</span>
          </div>`).join("")}
      </div>` : `<div style="font-size:14px;font-weight:700;color:var(--ink-faint);">No Quiz Deck runs yet — scores land here after the first one.</div>`}
      <div style="margin-top:16px;padding-top:14px;border-top:2px solid var(--hairline);">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <span style="font-size:12px;font-weight:900;letter-spacing:0.05em;color:var(--ink-soft);">QUIZ XP BUDGET</span>
          <span style="font-size:13px;font-weight:900;color:var(--grape-ink);">${a.quizBudget.xpSpent} / ${a.quizBudget.xpTotal} XP · ${a.quizBudget.mastered}/${a.quizBudget.total} mastered</span>
        </div>
        <div style="height:10px;background:var(--surface-2);border-radius:10px;overflow:hidden;margin:8px 0 8px;">
          <div style="${a.quizBudget.barStyle}"></div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--ink-faint);line-height:1.4;">${a.quizBudget.note}</div>
        <div style="font-size:12px;font-weight:800;color:${a.quizBudget.paidToday ? "var(--ink-faint)" : "var(--mint-ink)"};margin-top:6px;">${a.quizBudget.paidToday ? "✓ Today’s paying deck is already used — further runs are free practice." : "○ Today’s paying deck is still available."}</div>
        <div style="font-size:12px;font-weight:800;color:var(--ink-faint);margin-top:3px;">Quiz XP banked today: ${a.quizBudget.todayXp} / ${a.quizBudget.dailyCap}</div>
      </div>`)}

    <div style="${vm.grid2}">
      <div style="background:var(--aqua-wash);border-radius:var(--radius-xl);padding:16px 18px;display:flex;gap:12px;align-items:flex-start;">
        <span style="font-size:22px;flex-shrink:0;">🧑‍🏫</span>
        <div>
          <div style="font-weight:900;font-size:13px;color:var(--aqua-ink);text-transform:uppercase;letter-spacing:0.04em;">Coach's read</div>
          <div style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.5;margin-top:3px;">${a.read}</div>
        </div>
      </div>
      <div style="background:var(--mint-wash);border-radius:var(--radius-xl);padding:16px 18px;display:flex;gap:12px;align-items:flex-start;">
        <span style="font-size:22px;flex-shrink:0;">🎯</span>
        <div>
          <div style="font-weight:900;font-size:13px;color:var(--mint-ink);text-transform:uppercase;letter-spacing:0.04em;">Coach's next-step suggestion</div>
          <div style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.5;margin-top:3px;">${a.suggest}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function libraryTab(vm) {
  return `
  <div style="display:flex;flex-direction:column;gap:14px;">
    <div style="font-size:15px;color:var(--ink-soft);line-height:1.4;">Every move in this week's plan — photo, form cues and a demo video, for whenever you want to check in on a move together.</div>
    <div style="${vm.libGrid}">
      ${vm.libraryList.map(lib => `
        <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);box-shadow:var(--shadow-soft);overflow:hidden;display:flex;flex-direction:column;">
          <div style="width:100%;height:180px;position:relative;overflow:hidden;background:linear-gradient(165deg,var(--aqua-wash),var(--bg-deep));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
            <span style="font-size:44px;" aria-hidden="true">🏊</span>
            <span style="font-size:12px;font-weight:800;color:var(--aqua-ink);opacity:0.75;">Demo photo coming soon</span>
            <img src="${lib.photoUrl}" alt="" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
          </div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;">
              <div style="font-weight:900;font-size:16px;color:var(--ink);">${lib.name}</div>
              <div style="font-family:var(--font-hand);font-size:15px;color:var(--aqua-ink);flex-shrink:0;">${lib.dose}</div>
            </div>
            <a href="${lib.videoUrl}" target="_blank" rel="noopener" style="align-self:flex-start;display:flex;align-items:center;gap:6px;text-decoration:none;background:var(--aqua-wash);color:var(--aqua-ink);font-weight:900;font-size:13px;border-radius:var(--radius-pill);padding:7px 14px;">▶ Watch the move</a>
            ${lib.cue ? `<div style="font-size:13px;color:var(--ink);line-height:1.4;"><span style="font-weight:900;color:var(--aqua-ink);">Cue · </span>${lib.cue}</div>` : ""}
            ${lib.parentWatch ? `<div style="font-size:13px;color:var(--ink);line-height:1.4;"><span style="font-weight:900;color:var(--sun-ink);">👀 Watch for · </span>${lib.parentWatch}${lib.fix ? ` <span style="color:var(--ink-soft);">🔧 ${lib.fix}</span>` : ""}</div>` : ""}
            ${lib.swim ? `<div style="font-size:13px;color:var(--ink);line-height:1.4;"><span style="font-weight:900;color:var(--sea-ink);">🏊 Swim transfer · </span>${lib.swim}</div>` : ""}
          </div>
        </div>`).join("")}
    </div>
  </div>`;
}

function settingsTab(vm) {
  return `
  <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-xl);padding:22px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:22px;max-width:520px;">
    <div>
      <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:7px;">Athlete name</div>
      <input type="text" value="${escapeHtml(vm.settingsName)}" data-input="athleteName" style="width:100%;padding:13px 15px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-size:16px;font-weight:700;color:var(--ink);background:var(--surface-2);box-sizing:border-box;font-family:var(--font-ui);">
    </div>
    <div>
      <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:7px;">Who's training 🧑‍🤝‍🧑</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-bottom:9px;line-height:1.5;">Each athlete keeps her own sessions, XP, streak and prizes. Switching reloads the app.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${vm.profiles.map(p => `<button type="button" data-action="pickAthlete" data-arg="${escapeHtml(p.id)}" style="${p.style}">${p.active ? "✓ " : ""}${escapeHtml(p.name)}</button>`).join("")}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <input type="text" placeholder="Add another athlete…" data-input="newProfile" style="flex:1;padding:10px 13px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-size:14px;font-weight:700;color:var(--ink);background:var(--surface-2);box-sizing:border-box;font-family:var(--font-ui);">
        <button type="button" data-action="addAthlete" style="min-height:44px;border:none;background:var(--aqua);color:#fff;border-radius:var(--radius-pill);font-weight:900;font-size:13px;padding:0 16px;cursor:pointer;font-family:inherit;">Add</button>
      </div>
    </div>
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);">Coach voice 🎧</div>
        <button type="button" data-action="toggleCoachVoice" aria-label="Toggle coach voice" style="${vm.coachTrack}"><span style="${vm.coachKnob}"></span></button>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-top:6px;line-height:1.5;">The coach will: count your time · announce the next exercise · remind you to breathe · warn about common mistakes · prompt a self-check.</div>
    </div>
    <div>
      <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:9px;">Voice style</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${vm.voiceStyleOpts.map(vs => `<button type="button" data-action="setVoiceStyle" data-arg="${vs.key}" style="${vs.style}">${vs.label}</button>`).join("")}
      </div>
    </div>
    ${[["Rest between exercises", "exerciseRestSeconds", vm.settingsExRest, 1, 3, 15],
       ["Rest between rounds", "roundRestSeconds", vm.settingsRndRest, 5, 10, 90],
       ["Rest between sections", "sectionRestSeconds", vm.settingsSecRest, 5, 10, 90]].map(([label, key, val, step, min, max]) => `
    <div>
      <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:9px;">${label}</div>
      <div style="display:flex;align-items:center;gap:16px;">
        <button type="button" data-action="bumpRest" data-arg="${key}|-${step}|${min}|${max}" style="${vm.stepperBtn}">−</button>
        <span style="font-weight:900;font-size:20px;min-width:56px;text-align:center;color:var(--ink);">${val}s</span>
        <button type="button" data-action="bumpRest" data-arg="${key}|${step}|${min}|${max}" style="${vm.stepperBtn}">+</button>
      </div>
    </div>`).join("")}
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);">Try-it mode 🧪</div>
        <button type="button" data-action="togglePractice" aria-label="Toggle try-it mode" style="${vm.practiceTrack}"><span style="${vm.practiceKnob}"></span></button>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-top:6px;">${vm.practiceHint}</div>
    </div>
    <div>
      <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:9px;">Prize pool 🎁 ${vm.isDefaultPool ? '<span style="color:var(--ink-faint);">(default)</span>' : ""}</div>
      <div class="list-wrap">
        <div data-list="1" style="max-height:240px;display:flex;flex-direction:column;gap:6px;padding-bottom:8px;">
          ${vm.prizePool.map((p, i) => `
            <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);border-radius:12px;padding:8px 12px;">
              <span style="font-size:18px;">${p.icon}</span>
              <span style="flex:1;font-size:14px;font-weight:700;color:var(--ink);">${escapeHtml(p.label)}</span>
              <button type="button" data-action="removePrizePoolItem" data-arg="${i}" style="border:none;background:none;color:var(--ink-faint);font-weight:900;cursor:pointer;font-size:15px;" aria-label="Remove prize">✕</button>
            </div>`).join("")}
        </div>
      </div>
      ${vm.walletTrimNote ? `<div style="margin-top:8px;font-size:13px;font-weight:700;color:var(--ink-soft);background:var(--surface-2);border-radius:12px;padding:9px 12px;line-height:1.45;">${escapeHtml(vm.walletTrimNote)}</div>` : ""}
      <div style="margin-top:10px;border-top:1.5px solid var(--hairline);padding-top:10px;">
        <div style="font-size:13px;font-weight:700;color:var(--ink-soft);line-height:1.45;">Prizes stuck on “✓ Used” that she never redeemed, or several going used at once, come from wallets written before prizes had unique IDs. This repairs those without resetting anything she has earned.</div>
        <button type="button" data-action="repairWallet" style="margin-top:8px;min-height:44px;border:2px solid var(--hairline);background:var(--surface);border-radius:var(--radius-pill);padding:0 18px;font-weight:900;font-size:13px;color:var(--ink);cursor:pointer;font-family:inherit;">🔧 Repair prize wallet</button>
        <button type="button" data-action="reviewPrizes" style="margin-top:8px;margin-left:8px;min-height:44px;border:2px solid var(--hairline);background:var(--surface);border-radius:var(--radius-pill);padding:0 18px;font-weight:900;font-size:13px;color:var(--ink);cursor:pointer;font-family:inherit;">🎁 Review used prizes</button>
        ${vm.walletRepairNote ? `<div style="margin-top:8px;font-size:13px;font-weight:800;color:var(--mint-ink);background:var(--mint-wash);border-radius:12px;padding:9px 12px;line-height:1.45;">${escapeHtml(vm.walletRepairNote)}</div>` : ""}
        ${vm.prizeReviewOpen ? `
        <div style="margin-top:10px;border:2px solid var(--hairline);border-radius:12px;padding:10px 12px;">
          <div style="font-size:12px;font-weight:900;color:var(--ink-soft);line-height:1.45;margin-bottom:8px;">These prizes are marked used. The app can't tell which she actually spent, so it won't guess — restore only the ones you know are wrong.</div>
          ${vm.noRedeemedPrizes ? `<div style="font-size:13px;font-weight:800;color:var(--ink-faint);">No prizes are marked used.</div>` : ""}
          ${vm.redeemedPrizes.map(p => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--hairline);">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:900;font-size:14px;color:var(--ink);">${escapeHtml(p.label)}</div>
              <div style="font-size:11px;font-weight:800;color:var(--ink-faint);">${escapeHtml(p.dateLine)}</div>
            </div>
            <button type="button" data-action="restorePrize" data-arg="${escapeHtml(p.id)}" style="min-height:38px;border:none;border-radius:var(--radius-pill);padding:0 14px;background:var(--mint);color:#fff;font-weight:900;font-size:12px;cursor:pointer;font-family:inherit;">Restore</button>
          </div>`).join("")}
          <button type="button" data-action="closePrizeReview" style="margin-top:9px;min-height:38px;border:none;background:transparent;font-weight:900;font-size:12px;color:var(--ink-soft);cursor:pointer;font-family:inherit;">Done</button>
        </div>` : ""}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <input type="text" placeholder="Add a prize… (e.g. 🎨 Craft afternoon)" data-input="newPrize" style="flex:1;padding:10px 13px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-size:14px;font-weight:700;color:var(--ink);background:var(--surface-2);box-sizing:border-box;font-family:var(--font-ui);">
        <button type="button" data-action="addPrizePoolItem" style="min-height:44px;border:none;background:var(--sun);color:var(--sun-ink);border-radius:var(--radius-pill);font-weight:900;font-size:13px;padding:0 16px;cursor:pointer;font-family:inherit;">Add</button>
      </div>
      ${!vm.isDefaultPool ? `<button type="button" data-action="resetPrizePool" style="margin-top:8px;border:none;background:none;color:var(--ink-soft);font-weight:800;font-size:13px;text-decoration:underline;cursor:pointer;font-family:inherit;">Reset to default pool</button>` : ""}
    </div>
    <div style="border-top:1.5px solid var(--hairline);padding-top:16px;">
      <div style="font-weight:900;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:7px;">Backup &amp; restore 💾</div>
      <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-bottom:9px;line-height:1.5;">A full copy of <strong>${escapeHtml(vm.settingsName)}</strong>'s data — sessions, XP, prizes, quiz mastery, trackers. Restoring only adds; nothing already on this device is overwritten. Each athlete backs up separately.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button type="button" data-action="downloadBackup" style="min-height:44px;border:2px solid var(--aqua);background:var(--aqua-wash);color:var(--aqua-ink);border-radius:var(--radius-pill);font-weight:900;font-size:13px;padding:0 16px;cursor:pointer;font-family:inherit;">⬇︎ Download backup</button>
        <label style="min-height:44px;display:inline-flex;align-items:center;border:2px solid var(--hairline);background:var(--surface-2);color:var(--ink);border-radius:var(--radius-pill);font-weight:900;font-size:13px;padding:0 16px;cursor:pointer;">⬆︎ Restore from file
          <input type="file" accept="application/json,.json" data-input="restoreBackup" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
        </label>
      </div>
      ${vm.backupNote ? `<div role="status" style="margin-top:10px;font-size:13px;font-weight:800;line-height:1.5;color:${vm.backupNoteOk ? "var(--mint-ink)" : "var(--stop-ink)"};background:${vm.backupNoteOk ? "var(--mint-wash)" : "var(--stop-wash)"};border-radius:12px;padding:9px 12px;">${escapeHtml(vm.backupNote)}</div>` : ""}
      ${vm.pendingRestore ? `
      <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <button type="button" data-action="confirmRestore" style="min-height:44px;border:none;border-radius:var(--radius-pill);background:var(--stop);color:#fff;font-weight:900;font-size:13px;padding:0 18px;cursor:pointer;font-family:inherit;">Merge ${escapeHtml(vm.pendingRestore.from)}’s data into ${escapeHtml(vm.pendingRestore.to)} anyway</button>
        <button type="button" data-action="cancelRestore" style="min-height:44px;border:2px solid var(--hairline);border-radius:var(--radius-pill);background:var(--surface);color:var(--ink-soft);font-weight:900;font-size:13px;padding:0 18px;cursor:pointer;font-family:inherit;">Cancel</button>
      </div>` : ""}
    </div>
    <div style="border-top:1.5px solid var(--hairline);padding-top:16px;">
      <div style="font-size:15px;color:var(--stop);line-height:1.5;font-weight:700;">🔴 Sharp pain, pinching, or numbness → STOP immediately and tell a grown-up.</div>
    </div>
  </div>`;
}

function coachingTab(vm) {
  const c = vm.coaching;
  const rungBtn = (name, lvl, cur) => `<button type="button" data-action="setLadderRung" data-arg="${escapeHtml(name)}|${lvl}" style="width:36px;height:36px;border-radius:50%;border:2px solid ${lvl <= cur ? "var(--aqua)" : "var(--hairline)"};background:${lvl <= cur ? "var(--aqua)" : "var(--surface)"};color:${lvl <= cur ? "#fff" : "var(--ink-soft)"};font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;">${lvl}</button>`;
  return `
  <div style="display:flex;flex-direction:column;gap:14px;">
    ${card(`
      ${secTitle("Valgus gate 🔒")}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;">
          <div style="font-size:15px;font-weight:900;color:${c.gate.unlocked ? "var(--mint-ink)" : "var(--sun-ink)"};">${c.gate.unlocked ? "🔓" : "🔒"} ${c.gateLabel}</div>
          <div style="font-size:13px;font-weight:700;color:var(--ink-soft);margin-top:4px;">${c.gateProgress}</div>
        </div>
        <button type="button" data-action="toggleGate" style="min-height:44px;border:2px solid ${c.gate.unlocked ? "var(--sun)" : "var(--mint)"};background:${c.gate.unlocked ? "var(--sun-wash)" : "var(--mint-wash)"};color:${c.gate.unlocked ? "var(--sun-ink)" : "var(--mint-ink)"};border-radius:var(--radius-pill);font-weight:900;font-size:13px;padding:0 16px;cursor:pointer;font-family:inherit;">${c.gate.unlocked ? "Re-lock the gate" : "Coach unlock"}</button>
      </div>`)}
    ${card(`
      ${secTitle("Independence Ladder · Top 7")}
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 12px;line-height:1.3;">L1 guided → L5 fully independent. Tap the rung she's earned for each move.</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${c.ladderRows.map(r => `
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="flex:1;min-width:180px;font-size:14px;font-weight:800;color:var(--ink);">${r.name}</span>
            <div style="display:flex;gap:6px;">${[1, 2, 3, 4, 5].map(l => rungBtn(r.name, l, r.level)).join("")}</div>
          </div>`).join("")}
      </div>`)}
    ${card(`
      ${secTitle("PR board · Week " + c.trackerWeek + " of 4")}
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 12px;line-height:1.3;">Each day's PR sentinel, tracked over a 4-week window. Enter this week's best.</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${c.prFields.map(f => {
          const cur = (c.tracker["week" + c.trackerWeek] || {})[f.key] || "";
          const history = [1, 2, 3, 4].map(w => (c.tracker["week" + w] || {})[f.key]).map(v => v == null || v === "" ? "·" : v).join(" / ");
          return `
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="flex:1;min-width:220px;font-size:14px;font-weight:800;color:var(--ink);">${f.label}</span>
            <span style="font-size:12px;font-weight:800;color:var(--ink-faint);">W1–4: ${history}</span>
            <input type="number" value="${escapeHtml(String(cur))}" data-input="pr" data-key="${f.key}" placeholder="—" style="width:80px;padding:9px 11px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-size:15px;font-weight:800;color:var(--ink);background:var(--surface-2);box-sizing:border-box;font-family:var(--font-ui);">
          </div>`;
        }).join("")}
      </div>
      <button type="button" data-action="saveTrackerWeek" style="margin-top:12px;min-height:44px;border:none;background:var(--aqua);color:#fff;border-radius:var(--radius-pill);font-weight:900;font-size:14px;padding:0 20px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 var(--aqua-deep);">Save week ${c.trackerWeek}</button>`)}
    ${card(`
      ${secTitle("Engagement system · this week")}
      <div style="font-size:13px;color:var(--ink-faint);margin:4px 0 12px;line-height:1.3;">One shared game per week keeps a grown-up genuinely in it.</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${Object.entries(c.engagementSystems).map(([key, sys]) => `
          <button type="button" data-action="pickEngagement" data-arg="${key}" style="display:flex;align-items:flex-start;gap:10px;text-align:left;background:${c.engagement === key ? "var(--aqua-wash)" : "var(--surface-2)"};border:2px solid ${c.engagement === key ? "var(--aqua)" : "transparent"};border-radius:14px;padding:12px 14px;cursor:pointer;font-family:inherit;">
            <span style="font-size:18px;">${c.engagement === key ? "✅" : "🎲"}</span>
            <span>
              <span style="display:block;font-size:14px;font-weight:900;color:var(--ink);">${sys.label}</span>
              <span style="display:block;font-size:13px;font-weight:700;color:var(--ink-soft);margin-top:2px;">${sys.desc}</span>
            </span>
          </button>`).join("")}
      </div>`)}
  </div>`;
}

export function grownupScreen(vm) {
  const tab = vm.guTab;
  return `
    <div style="flex:1;min-width:0;padding:24px 26px;overflow-y:auto;box-sizing:border-box;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:32px;color:var(--ink);margin-bottom:18px;">Grown-up Zone 🧑</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
        <div style="display:flex;background:var(--surface-2);border-radius:var(--radius-pill);padding:4px;gap:4px;overflow-x:auto;scrollbar-width:none;" data-tab-scroll="1">
          ${vm.tabs.map(t => `<button type="button" data-action="setGuTab" data-arg="${t.key}" style="${t.style}">${t.label}</button>`).join("")}
        </div>
        ${(tab === "overview" || tab === "analytics") ? `
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="font-size:11px;font-weight:900;letter-spacing:0.04em;color:var(--ink-faint);text-transform:uppercase;">Period</span>
          <div style="display:flex;background:var(--surface-2);border-radius:var(--radius-pill);padding:3px;gap:3px;min-width:210px;">
            ${vm.scopeTabs.map(st => `<button type="button" data-action="setGsScope" data-arg="${st.key}" style="${st.style}">${st.label}</button>`).join("")}
          </div>
        </div>` : ""}
      </div>
      ${tab === "overview" ? overviewTab(vm)
        : tab === "analytics" ? analyticsTab(vm)
        : tab === "formcheck" ? formCheckTab(vm)
        : tab === "coaching" ? coachingTab(vm)
        : tab === "library" ? libraryTab(vm)
        : settingsTab(vm)}
    </div>`;
}
