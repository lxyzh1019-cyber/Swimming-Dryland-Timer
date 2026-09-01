/* ============================================================
   SESSION screen — full-screen takeover, wide + narrow, plus a
   targeted per-second updater (updateSessionTick) so the screen
   only fully re-renders on phase changes.
   ============================================================ */

const RING_ZONE_COLOR = {
  work: "var(--aqua)", warmup: "var(--sun)", rest: "var(--mint)", evening: "var(--grape)"
};

/* Recreation of the DS TimerRing: SVG track + progress arc, big Fredoka time. */
function timerRing(vm, size) {
  const stroke = size >= 300 ? 18 : 13;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = vm.timerUrgent ? "var(--stop)" : (RING_ZONE_COLOR[vm.timerZoneType] || "var(--aqua)");
  const offset = c * (1 - Math.max(0, Math.min(1, vm.timerProgress)));
  return `
  <div data-action="advance" title="Tap the ring when you're done" style="width:${size}px;height:${size}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;${vm.timerUrgent ? "animation:splash-pulse-ring 1s ease-in-out infinite;" : ""}">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);position:absolute;inset:0;">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="var(--surface)" stroke="var(--surface-2)" stroke-width="${stroke}"></circle>
      <circle id="s-ring-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset 0.9s linear;"></circle>
    </svg>
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;">
      <span style="font-size:${size >= 300 ? 13 : 11}px;font-weight:900;letter-spacing:0.12em;color:${color};">${vm.timerZone}</span>
      <span id="s-timer-text" style="font-family:var(--font-display);font-weight:600;font-size:${size >= 300 ? 76 : 46}px;line-height:1;color:${vm.timerUrgent ? "var(--stop)" : "var(--ink)"};">${vm.timerDisplay}</span>
      ${vm.timerIsPaused ? `<span style="font-size:12px;font-weight:900;color:var(--sun-ink);">PAUSED</span>` : ""}
    </div>
  </div>`;
}

function repRing(vm, size) {
  const border = size >= 300 ? 10 : 8;
  return `
  <div data-action="advance" title="Tap the ring when you're done" style="cursor:pointer;width:${size}px;height:${size}px;border-radius:50%;background:var(--grape-wash);border:${border}px solid var(--grape);display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;padding:${size >= 300 ? 26 : 14}px;">
    <div style="font-weight:900;font-size:${size >= 300 ? 15 : 11}px;letter-spacing:0.1em;color:var(--grape-deep);">${size >= 300 ? "DO YOUR REPS" : "REPS"}</div>
    <div style="font-family:var(--font-display);font-size:${size >= 300 ? 50 : 32}px;font-weight:600;color:var(--grape);text-align:center;line-height:1.05;margin:${size >= 300 ? 8 : 4}px 0;">${vm.curExDose}</div>
    <div style="font-weight:900;font-size:${size >= 300 ? 20 : 14}px;color:${vm.paceColor};">⏱ <span id="s-timer-text">${vm.exActualDisplay}</span>${size >= 300 ? ` <span style="font-weight:700;opacity:0.65;">/ ${vm.exPlannedDisplay}</span>` : ""}</div>
    <div style="font-size:12px;font-weight:800;color:var(--grape-deep);opacity:0.8;margin-top:6px;">Tap the ring when you're done</div>
  </div>`;
}

/* In-session prompt card (intent word / micro-loop) rendered in the ring's spot. */
function promptCard(vm, size) {
  if (vm.phase === "intent") {
    return `
    <div style="width:${size}px;min-height:${Math.round(size * 0.8)}px;border-radius:26px;background:var(--sun-wash);border:3px solid var(--sun);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:22px;box-sizing:border-box;flex-shrink:0;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--ink);text-align:center;">After Round 1 — pick ONE word</div>
      <div style="font-size:14px;font-weight:700;color:var(--ink-soft);text-align:center;">What fixes what you just felt? Say it out loud for the next rounds.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        ${vm.intentWords.map(w => `<button type="button" data-action="pickIntent" data-arg="${w}" style="min-height:48px;border-radius:var(--radius-pill);border:3px solid var(--sun);background:var(--surface);color:var(--sun-ink);font-weight:900;font-size:16px;padding:0 18px;cursor:pointer;font-family:inherit;">${w}</button>`).join("")}
      </div>
    </div>`;
  }
  if (vm.phase === "microloop") {
    return `
    <div style="width:${size}px;min-height:${Math.round(size * 0.8)}px;border-radius:26px;background:var(--aqua-wash);border:3px solid var(--aqua);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:22px;box-sizing:border-box;flex-shrink:0;">
      <img src="assets/poses/think.png" alt="" style="height:70px;object-fit:contain;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--ink);text-align:center;">${vm.microQ}</div>
      <div style="display:flex;flex-direction:column;gap:8px;width:100%;">
        ${vm.microOpts.map(o => {
          let style = "border-color:var(--hairline);background:var(--surface);color:var(--ink);";
          if (vm.microAnswered) {
            if (o === vm.microCorrectAnswer) style = "border-color:var(--mint);background:var(--mint-wash);color:var(--mint-ink);";
            else if (o === vm.microPicked) style = "border-color:var(--coral);background:color-mix(in srgb, var(--coral) 12%, #fff);color:var(--coral);";
            else style = "border-color:var(--hairline);background:var(--surface);color:var(--ink-faint);";
          }
          return `<button type="button" data-action="answerMicro" data-arg="${o}" style="min-height:48px;border-radius:16px;border:3px solid;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;${style}">${o}</button>`;
        }).join("")}
      </div>
    </div>`;
  }
  // breath rehearsal
  return `
  <div style="width:${size}px;min-height:${Math.round(size * 0.8)}px;border-radius:26px;background:var(--mint-wash);border:3px solid var(--mint);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:22px;box-sizing:border-box;flex-shrink:0;">
    <img src="assets/poses/breath.png" alt="" style="height:90px;object-fit:contain;">
    <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--mint-ink);text-align:center;">Breath rehearsal</div>
    <div style="font-size:15px;font-weight:700;color:var(--ink);text-align:center;line-height:1.45;">${vm.breathText}</div>
  </div>`;
}

/* DS Badge (tinted variant). */
function badge(variant, label) {
  const map = {
    sun:  ["var(--sun-wash)", "var(--sun-ink)"],
    aqua: ["var(--aqua-wash)", "var(--aqua-ink)"],
    mint: ["var(--mint-wash)", "var(--mint-ink)"],
    sea:  ["var(--sea-wash)", "var(--sea-ink)"],
    grape:["var(--grape-wash)", "var(--grape-ink)"]
  };
  const [bg, ink] = map[variant] || map.aqua;
  return `<span style="display:inline-flex;align-items:center;background:${bg};color:${ink};border-radius:var(--radius-pill);padding:4px 12px;font-size:12px;font-weight:900;letter-spacing:0.04em;">${label}</span>`;
}

/* Exercise photo slot — photos land at assets/exercises/<name> - Timer Image.png;
   until then a watercolor-wash placeholder shows through. */
function photoSlot(photoUrl, w, h, radius) {
  return `
  <div style="width:${w}px;height:${h}px;flex-shrink:0;border-radius:${radius}px;overflow:hidden;position:relative;background:linear-gradient(165deg,var(--aqua-wash),var(--bg-deep));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
    <span style="font-size:${Math.round(w / 6)}px;" aria-hidden="true">🏊</span>
    <span style="font-size:12px;font-weight:800;color:var(--aqua-ink);opacity:0.75;text-align:center;padding:0 14px;">Form photo coming soon</span>
    <img src="${photoUrl}" alt="" onerror="this.style.display='none'" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
  </div>`;
}

function stopOverlay() {
  return `
  <div style="position:absolute;inset:0;z-index:20;background:var(--stop-wash);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px;text-align:center;">
    <img src="assets/poses/breath.png" alt="" style="height:180px;object-fit:contain;">
    <div style="font-family:var(--font-display);font-weight:600;font-size:34px;color:var(--stop-ink);">Stopped. Good call.</div>
    <div style="font-size:18px;font-weight:700;color:var(--ink);line-height:1.5;max-width:480px;">If something hurts — sharp pain, pinching, or numbness — <b>tell a grown-up right now</b>. Your body matters more than any streak.</div>
    <div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;justify-content:center;">
      <button type="button" data-action="resumeFromStop" style="min-height:56px;border:none;border-radius:var(--radius-pill);padding:0 26px;background:var(--mint);color:#fff;font-weight:900;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 var(--mint-deep);">I'm okay — keep going</button>
      <button type="button" data-action="endFromStop" style="min-height:56px;border:2px solid var(--stop);border-radius:var(--radius-pill);padding:0 26px;background:var(--surface);color:var(--stop-ink);font-weight:900;font-size:16px;cursor:pointer;font-family:inherit;">End session</button>
    </div>
  </div>`;
}

export function detailOverlayHtml(vm) {
  return `
  <div data-action="closeDetail" style="position:absolute;inset:0;z-index:22;background:rgba(20,59,74,0.55);display:flex;align-items:center;justify-content:center;padding:30px;box-sizing:border-box;">
    <div data-stop-propagation="1" style="background:var(--surface);border-radius:var(--radius-xl);box-shadow:var(--shadow-pop);max-width:680px;width:100%;max-height:100%;overflow-y:auto;box-sizing:border-box;">
      <div style="position:relative;">
        <div style="width:100%;height:330px;position:relative;overflow:hidden;background:linear-gradient(165deg,var(--aqua-wash),var(--bg-deep));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
          <span style="font-size:60px;" aria-hidden="true">🏊</span>
          <span style="font-size:13px;font-weight:800;color:var(--aqua-ink);opacity:0.75;">Demo photo coming soon</span>
          <img src="${vm.detailPhotoUrl}" alt="" data-fallback="${vm.detailPhotoFallbackUrl || ""}" onerror="if(this.dataset.fallback&&this.src.indexOf(this.dataset.fallback)<0){this.src=this.dataset.fallback;}else{this.style.display='none';}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
        </div>
        <button type="button" data-action="closeDetail" style="position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:none;background:rgba(20,59,74,0.55);color:#fff;font-size:16px;font-weight:900;cursor:pointer;" aria-label="Close">✕</button>
      </div>
      <div style="padding:22px 26px 26px;display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="font-family:var(--font-display);font-size:26px;font-weight:600;color:var(--ink);">${vm.detailName}</div>
          <div style="font-family:var(--font-hand);font-size:18px;color:var(--aqua-ink);">${vm.detailDose}</div>
        </div>
        <a href="${vm.detailVideoUrl}" target="_blank" rel="noopener" data-action="watchVideo" style="align-self:flex-start;display:flex;align-items:center;gap:8px;text-decoration:none;background:var(--aqua);color:#fff;font-weight:900;font-size:15px;border-radius:var(--radius-pill);padding:12px 22px;box-shadow:0 4px 0 var(--aqua-deep);">▶ Watch the move</a>
        ${vm.detailCue ? `
        <div style="background:var(--aqua-wash);border-radius:var(--radius-md);padding:12px 14px;">
          <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--aqua-ink);margin-bottom:4px;">Coach tip</div>
          <div style="font-size:16px;font-weight:700;color:var(--ink);line-height:1.4;">${vm.detailCue}</div>
        </div>` : ""}
        ${vm.detailWatchFor ? `
        <div style="background:var(--sun-wash);border-radius:var(--radius-md);padding:12px 14px;">
          <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--sun-ink);margin-bottom:4px;">👀 Watch for</div>
          <div style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.4;">${vm.detailWatchFor}</div>
          ${vm.detailFix ? `<div style="font-size:14px;color:var(--ink-soft);line-height:1.4;margin-top:5px;">🔧 ${vm.detailFix}</div>` : ""}
        </div>` : ""}
        ${vm.detailSwim ? `
        <div style="background:var(--sea-wash);border-radius:var(--radius-md);padding:12px 14px;">
          <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--sea-ink);margin-bottom:4px;">🏊 Swim transfer</div>
          <div style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.4;">${vm.detailSwim}</div>
        </div>` : ""}
        ${vm.detailShowResume ? `
        <div style="display:flex;flex-direction:column;gap:8px;align-items:stretch;border-top:1.5px solid var(--hairline);padding-top:14px;">
          <div style="font-size:13px;font-weight:800;color:var(--ink-soft);text-align:center;">⏸ Your workout is paused while you read.</div>
          <button type="button" data-action="resumeFromDetail" style="width:100%;min-height:54px;border:none;border-radius:var(--radius-pill);background:var(--mint);color:#fff;font-family:var(--font-display);font-weight:600;font-size:20px;cursor:pointer;box-shadow:0 5px 0 var(--mint-deep);">▶ Resume my workout</button>
        </div>` : ""}
      </div>
    </div>
  </div>`;
}

function completeScreen(vm) {
  return `
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:16px;padding:40px;text-align:center;background:${vm.endedEarly ? "var(--sun-wash)" : "var(--mint-wash)"};overflow-y:auto;">
    <img src="assets/poses/${vm.endedEarly ? "seeyou" : "celebrate"}.png" alt="" style="height:${vm.endedEarly ? 170 : 230}px;object-fit:contain;flex-shrink:0;">
    <div style="font-family:var(--font-display);font-weight:600;font-size:34px;color:${vm.endedEarly ? "var(--sun-ink)" : "var(--mint-ink)"};">${vm.saveFailed ? "Session finished — but not saved." : vm.noWorkDone ? "Nothing logged this time." : vm.endedEarly ? "Stopped early — progress saved." : "Session Complete!"}</div>
    ${vm.saveFailed ? `<div role="alert" style="font-size:15px;font-weight:800;color:var(--stop-ink);background:var(--stop-wash);border:2px solid var(--stop);border-radius:16px;padding:10px 16px;max-width:480px;">⚠️ This device is out of storage, so this session could NOT be saved. Show a grown-up — they can free up space so your next one counts.</div>` : ""}
    ${vm.noWorkDone && !vm.painFlag ? `<div style="font-size:15px;font-weight:800;color:var(--sun-ink);background:var(--sun-wash);border-radius:16px;padding:10px 16px;max-width:480px;line-height:1.45;">Every move got skipped, so there's nothing to record — no XP and no streak day. That's fine! Come back when you've got the energy and do it for real. 💛</div>` : ""}
    ${vm.painFlag ? `<div style="font-size:16px;font-weight:800;color:var(--stop-ink);background:var(--stop-wash);border:2px solid var(--stop);border-radius:16px;padding:10px 16px;max-width:480px;">Good call stopping. Tell a grown-up how it felt — that's what champions do.</div>` : ""}
    ${vm.sessionMantra && !vm.endedEarly ? `<div style="font-family:var(--font-hand);font-size:26px;font-weight:700;color:var(--aqua-ink);line-height:1.2;">${vm.sessionMantra}</div>` : ""}
    <div style="font-size:16px;font-weight:700;color:var(--ink-soft);">${vm.sessionDayTitle} · ${vm.sessionMinutes} min · ${vm.roundsLine}${vm.xpEarned ? ` · ⭐ +${vm.xpEarned} XP` : ""}</div>
    ${vm.leveledUp ? `<button type="button" data-action="openPrizeDraw" style="display:flex;align-items:center;gap:10px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:14px 26px;font-family:var(--font-display);font-weight:600;font-size:19px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);">🎁 Level up! Pick your prize</button>` : ""}
    ${vm.sessionDone ? `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:6px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="assets/poses/think.png" alt="" style="height:64px;object-fit:contain;">
        <div style="font-family:var(--font-hand);font-size:24px;font-weight:700;color:var(--ink);">How did it feel?</div>
      </div>
      <div style="display:flex;gap:12px;">
        ${vm.moodOpts.map(mo => `
          <button type="button" data-action="pickMood" data-arg="${mo.key}|${mo.emoji}" style="${mo.style}">
            <span style="font-size:30px;line-height:1;">${mo.emoji}</span>
            <span style="font-size:13px;font-weight:900;color:var(--ink);">${mo.label}</span>
          </button>`).join("")}
      </div>
      ${vm.moodAck ? `<div style="font-family:var(--font-hand);font-size:18px;font-weight:700;color:var(--aqua-ink);line-height:1.3;max-width:420px;text-align:center;">${vm.moodAck}</div>` : ""}
    </div>
    ${vm.showReflection ? `
    <div style="display:flex;flex-direction:column;gap:14px;background:var(--surface);border-radius:20px;padding:16px 22px;box-shadow:var(--shadow-soft);max-width:600px;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:18px;color:var(--ink);">Think &amp; improve 💭</div>
      <div style="display:flex;flex-direction:column;gap:7px;align-items:center;">
        <div style="font-size:12px;font-weight:900;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.05em;">What went well?</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
          ${vm.reflectWellOpts.map(rw => `<button type="button" data-action="reflectWell" data-arg="${rw.label}" style="${rw.style}">${rw.label}</button>`).join("")}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px;align-items:center;">
        <div style="font-size:12px;font-weight:900;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.05em;">Next time I'll…</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
          ${vm.reflectNextOpts.map(rn => `<button type="button" data-action="reflectNext" data-arg="${rn.label}" style="${rn.style}">${rn.label}</button>`).join("")}
        </div>
      </div>
    </div>` : ""}
    <div style="display:flex;flex-direction:column;gap:12px;background:var(--surface);border-radius:20px;padding:18px 22px;box-shadow:var(--shadow-soft);max-width:600px;width:100%;box-sizing:border-box;text-align:left;">
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="assets/swim-marlin.png" style="width:44px;height:44px;object-fit:contain;flex-shrink:0;" alt="">
        <div>
          <div style="font-family:var(--font-display);font-weight:600;font-size:18px;color:var(--ink);">Coach's Quiz 🧠</div>
          <div style="font-size:12px;font-weight:800;color:var(--ink-soft);">How does today's work help you swim?</div>
        </div>
      </div>
      <div style="font-weight:800;font-size:16px;color:var(--ink);line-height:1.4;">${vm.quizQuestion}</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${vm.quizOpts.map(qo => `
          <button type="button" data-action="quizPick" data-arg="${qo.idx}" style="${qo.style}">
            <span style="width:26px;height:26px;border-radius:50%;background:var(--surface-2);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;flex-shrink:0;">${qo.prefix}</span>
            <span style="flex:1;">${qo.label}</span>
          </button>`).join("")}
      </div>
      ${vm.quizAnswered ? `
      <div style="background:var(--aqua-wash);border-radius:14px;padding:12px 14px;">
        <div style="font-weight:900;font-size:15px;color:${vm.quizFeedbackColor};">${vm.quizFeedback}</div>
        <div style="font-size:14px;font-weight:700;color:var(--ink-soft);margin-top:4px;line-height:1.4;">${vm.quizWhy}</div>
      </div>` : ""}
      <button type="button" data-action="startQuizDeck" style="align-self:flex-start;display:flex;align-items:center;gap:8px;background:var(--aqua-wash);border:2px solid var(--aqua-light);border-radius:var(--radius-pill);padding:9px 16px;cursor:pointer;font-weight:900;font-size:14px;color:var(--aqua-ink);font-family:inherit;">🧠 Try the full Quiz Deck (8 moves)</button>
    </div>` : ""}
    <button type="button" data-action="exitSession" style="margin-top:14px;display:flex;align-items:center;gap:10px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:16px 32px;font-family:var(--font-display);font-weight:600;font-size:20px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);flex-shrink:0;">🏠 Back to Today</button>
  </div>`;
}

function centerStack(vm, wide) {
  const ringSize = wide ? 320 : 200;
  const ring = vm.isPrompt ? promptCard(vm, ringSize)
    : vm.timerIsReps ? repRing(vm, ringSize)
    : timerRing(vm, ringSize);
  return `
  <div style="display:flex;gap:${wide ? 24 : 16}px;align-items:center;justify-content:center;width:100%;flex-shrink:0;flex-wrap:wrap;">
    ${vm.notResting && !vm.isPrompt ? photoSlot(vm.curExPhotoUrl, wide ? 360 : 210, wide ? 480 : 280, wide ? 20 : 16) : ""}
    ${ring}
  </div>

  <div style="display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;max-width:480px;flex-shrink:0;text-align:center;">
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
      ${badge(vm.blockBadgeVariant, vm.blockLabel)}
      ${vm.roundLabelText ? `<span style="font-size:12px;font-weight:900;color:var(--ink-soft);background:var(--surface-2);border-radius:var(--radius-pill);padding:3px 10px;">${vm.roundLabelText}</span>` : ""}
    </div>
    ${vm.canOpenDetail ? `
    <button type="button" data-action="openDetailCur" title="See instructions &amp; video" style="display:flex;align-items:center;justify-content:center;gap:8px;background:none;border:none;padding:4px 6px;margin:0;cursor:pointer;font-family:inherit;min-height:44px;">
      <span style="font-family:var(--font-display);font-size:${wide ? 22 : 19}px;font-weight:600;color:var(--ink);line-height:1.15;">${vm.stageTitle}</span>
      <span aria-hidden="true" style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--surface-2);color:var(--ink-soft);font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;">ⓘ</span>
    </button>` : `
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="font-family:var(--font-display);font-size:${wide ? 22 : 19}px;font-weight:600;color:var(--ink);line-height:1.15;">${vm.stageTitle}</div>
    </div>`}
    ${vm.overNudge ? `<div style="font-family:var(--font-hand);font-size:17px;font-weight:700;color:var(--sun-ink);line-height:1.2;">Past the planned time — that's okay. Finish clean, then rest 💛</div>` : ""}
    ${vm.notResting ? `<div style="font-family:var(--font-hand);font-size:${wide ? 16 : 14}px;color:var(--aqua-ink);font-style:italic;line-height:1.2;">${vm.curExDose}</div>` : ""}
    ${vm.upNextName ? `
    <div style="font-size:15px;color:var(--ink-soft);line-height:1.3;">
      <span style="font-weight:900;color:var(--aqua-ink);text-transform:uppercase;letter-spacing:0.04em;">Up next · </span>${vm.upNextName} <span style="font-family:var(--font-hand);">${vm.upNextDose}</span>
    </div>` : ""}
  </div>

  ${vm.isBigRest ? `
  <div style="display:flex;align-items:center;gap:10px;background:var(--sun-wash);border-radius:var(--radius-lg);padding:10px 14px;box-sizing:border-box;width:100%;max-width:480px;flex-shrink:0;">
    <img src="assets/poses/breath.png" style="width:64px;height:58px;object-fit:contain;flex-shrink:0;" alt="">
    <div style="font-family:var(--font-hand);font-size:15px;color:var(--sun-ink);font-style:italic;line-height:1.3;">${vm.cheerMsg}</div>
  </div>` : ""}

  ${vm.showCleanCheck ? `
  <div style="display:flex;align-items:center;gap:12px;background:var(--surface);border:2px solid var(--mint);border-radius:var(--radius-lg);padding:10px 16px;width:100%;max-width:480px;flex-shrink:0;box-sizing:border-box;box-shadow:var(--shadow-soft);">
    <span style="flex:1;font-weight:900;font-size:15px;color:var(--ink);">${vm.cleanCheckQuestion}</span>
    <button type="button" data-action="pickClean" style="min-height:46px;border:none;border-radius:var(--radius-pill);padding:0 18px;background:var(--mint);color:#fff;font-weight:900;font-size:14px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 var(--mint-deep);">✓ Clean</button>
    <button type="button" data-action="pickWobbly" style="min-height:46px;border:none;border-radius:var(--radius-pill);padding:0 18px;background:var(--sun);color:var(--sun-ink);font-weight:900;font-size:14px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 var(--sun-deep);">😅 Wobbly</button>
    <button type="button" data-action="skipFormCheck" style="min-height:46px;border:none;border-radius:var(--radius-pill);padding:0 14px;background:transparent;color:var(--ink-soft);font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;">Skip</button>
  </div>` : ""}

  ${vm.notResting ? `
  <div style="width:100%;max-width:300px;flex-shrink:0;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">
      <span style="font-size:12px;font-weight:900;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.04em;">Elapsed</span>
      <span style="font-weight:900;font-size:15px;color:${vm.paceColor};"><span id="s-ex-actual">${vm.exActualDisplay}</span> <span style="color:var(--ink-faint);font-weight:700;">/ ${vm.exPlannedDisplay}</span></span>
    </div>
    <div style="height:7px;background:var(--surface-2);border-radius:7px;overflow:hidden;">
      <div id="s-ex-fill" style="width:${vm.exPacePct}%;height:100%;background:${vm.paceColor};border-radius:7px;transition:width 0.4s;"></div>
    </div>
  </div>` : ""}`;
}

function controls(vm, wide) {
  return `
  <button type="button" data-action="advance" style="width:100%;min-height:${wide ? 48 : 52}px;border-radius:var(--radius-md);border:none;font-weight:900;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--mint);color:#fff;box-shadow:0 4px 0 var(--mint-deep);font-family:inherit;">${vm.doneLabel}</button>
  ${vm.notConfirmingEnd ? `
  <div style="display:flex;gap:${wide ? 14 : 8}px;">
    <button type="button" data-action="stopNow" style="flex:1;min-height:${wide ? 50 : 48}px;border-radius:var(--radius-md);border:none;font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--stop);color:#fff;box-shadow:0 3px 0 var(--stop-ink);font-family:inherit;">🔴 STOP</button>
    ${vm.timerNotPaused
      ? `<button type="button" data-action="pauseTimer" style="flex:1;min-height:${wide ? 50 : 48}px;border-radius:var(--radius-md);border:2px solid var(--sun-deep);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--sun-wash);color:var(--sun-ink);font-family:inherit;">❚❚ ${wide ? "Pause" : ""}</button>`
      : `<button type="button" data-action="pauseTimer" style="flex:1;min-height:${wide ? 50 : 48}px;border-radius:var(--radius-md);border:2px solid var(--mint-deep);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--mint-wash);color:var(--mint-ink);font-family:inherit;">▶ ${wide ? "Resume" : ""}</button>`}
    <button type="button" data-action="skipEx" style="flex:1;min-height:${wide ? 50 : 48}px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--surface);color:var(--ink-soft);font-family:inherit;">⏭ ${wide ? "Skip" : ""}</button>
    <button type="button" data-action="askEnd" style="flex:1;min-height:${wide ? 50 : 48}px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-weight:900;font-size:${wide ? 14 : 12}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--surface);color:var(--ink-soft);font-family:inherit;">End${wide ? " session" : ""}</button>
  </div>` : `
  <div style="display:flex;${wide ? "align-items:center;gap:14px;" : "flex-direction:column;gap:8px;"}background:var(--surface-2);border-radius:var(--radius-md);padding:10px 14px;">
    ${wide ? `<img src="assets/poses/seeyou.png" alt="" style="height:52px;object-fit:contain;flex-shrink:0;">` : ""}
    <span style="${wide ? "flex:1;" : ""}font-weight:800;font-size:${wide ? 15 : 14}px;color:var(--ink);">End early? Your progress is saved.</span>
    <div style="display:flex;gap:8px;">
      <button type="button" data-action="cancelEnd" style="${wide ? "" : "flex:1;"}min-height:44px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;padding:0 16px;background:var(--surface);color:var(--ink-soft);font-family:inherit;">Keep going</button>
      <button type="button" data-action="confirmEndEarly" style="${wide ? "" : "flex:1;"}min-height:44px;border-radius:var(--radius-md);border:none;font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;padding:0 16px;background:var(--sun);color:var(--sun-ink);box-shadow:0 3px 0 var(--sun-deep);font-family:inherit;">End session</button>
    </div>
  </div>`}`;
}

function exList(vm, wide) {
  return vm.sessionExList.map(sitem => sitem.isHeader ? `
    <div style="display:flex;align-items:center;gap:8px;padding:${wide ? "12px 0 4px" : "10px 0 4px"};">
      <span style="width:${wide ? 10 : 9}px;height:${wide ? 10 : 9}px;border-radius:50%;background:${sitem.color};flex-shrink:0;"></span>
      <span style="font-weight:900;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:${sitem.color};">${sitem.name}</span>
    </div>` : `
    <div style="${sitem.cardStyle}">
      <span style="${sitem.numStyle}">${sitem.num}</span>
      <span style="${sitem.nameStyle}font-size:${wide ? 16 : 14}px;">${sitem.name}</span>
      <button type="button" data-action="openDetailAt" data-arg="${sitem.ci}|${sitem.ei}" title="See detail photo &amp; video" style="flex-shrink:0;width:${wide ? 22 : 20}px;height:${wide ? 22 : 20}px;border-radius:50%;border:none;background:var(--surface-2);color:var(--ink-soft);font-size:${wide ? 13 : 12}px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">ⓘ</button>
      <span style="font-size:${wide ? 16 : 14}px;flex-shrink:0;width:${wide ? 18 : 16}px;text-align:center;color:${sitem.secColor};">${sitem.statusIcon}</span>
    </div>`).join("");
}

function tipsSafety(vm) {
  return `
  <div style="flex-shrink:0;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);box-shadow:var(--shadow-soft);box-sizing:border-box;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
    <div style="font-weight:900;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-soft);">Tips &amp; Safety</div>
    ${vm.curExCue ? `
    <div style="background:var(--aqua-wash);border-radius:var(--radius-md);padding:12px 14px;box-sizing:border-box;display:flex;align-items:center;gap:12px;">
      <img src="assets/poses/keepgoing.png" alt="" style="width:68px;height:52px;object-fit:contain;flex-shrink:0;">
      <div style="min-width:0;">
        <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--aqua-ink);margin-bottom:6px;">Coach tip</div>
        <div style="font-size:16px;font-weight:700;color:var(--ink);line-height:1.4;">${vm.curExCue}</div>
      </div>
    </div>` : ""}
    ${vm.wobblyBanner ? `<div style="background:var(--sun-wash);border-radius:var(--radius-md);padding:10px 14px;font-family:var(--font-hand);font-size:18px;font-weight:700;color:var(--sun-ink);line-height:1.3;">Fewer, slower — quality first. You've got this 💛</div>` : ""}
    ${vm.curExWatchFor && vm.notResting ? `
    <div style="background:var(--sun-wash);border-radius:var(--radius-md);padding:12px 14px;box-sizing:border-box;">
      <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--sun-ink);margin-bottom:4px;">👀 Watch for</div>
      <div style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.4;">${vm.curExWatchFor}</div>
      ${vm.curExFix ? `<div style="font-size:14px;color:var(--ink-soft);line-height:1.4;margin-top:5px;">🔧 ${vm.curExFix}</div>` : ""}
    </div>` : ""}
    ${vm.curExSwim && vm.notResting ? `<div style="background:var(--sea-wash);border-radius:var(--radius-md);padding:10px 14px;font-size:14px;font-weight:700;color:var(--sea-ink);">🏊 Builds: ${vm.curExSwim}</div>` : ""}
    <div style="background:var(--stop-wash);border:2px solid var(--stop);border-radius:var(--radius-md);padding:11px 14px;box-sizing:border-box;display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;flex-shrink:0;">🔴</span>
      <span style="font-size:15px;font-weight:700;color:var(--stop-ink);line-height:1.3;">Sharp pain, pinching, or numbness → STOP and tell a grown-up.</span>
    </div>
  </div>`;
}

export function sessionScreen(vm) {
  const overlays = `
    ${vm.detailOverlay ? detailOverlayHtml(vm) : ""}
    ${vm.stopOverlay ? stopOverlay() : ""}`;

  if (vm.sessionDone) {
    return `
    <div style="display:flex;background:var(--surface);border-radius:30px;box-shadow:0 18px 44px rgba(20,59,74,0.16);overflow:hidden;min-height:${vm.isWide ? 800 : 640}px;position:relative;">
      ${overlays}
      ${completeScreen(vm)}
    </div>`;
  }

  if (vm.isWide) {
    return `
    <div style="display:flex;background:var(--surface);border-radius:30px;box-shadow:0 18px 44px rgba(20,59,74,0.16);overflow:hidden;height:800px;position:relative;">
      ${overlays}
      <div style="width:32%;flex-shrink:0;overflow-y:auto;padding:18px 16px;background:var(--surface-2);border-right:1.5px solid var(--hairline);box-sizing:border-box;display:flex;flex-direction:column;gap:14px;">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <span style="font-weight:900;font-size:12px;letter-spacing:0.06em;color:var(--ink-soft);text-transform:uppercase;">${vm.sessionDayTitle} · <span id="s-elapsed">${vm.elapsedDisplay}</span></span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:900;color:var(--ink-soft);margin-bottom:4px;"><span>EXERCISES</span><span>${vm.progressLabel}</span></div>
          <div style="height:8px;background:var(--surface);border:1px solid var(--hairline);border-radius:8px;overflow:hidden;">
            <div style="width:${Math.round(vm.progressValue / vm.progressMax * 100)}%;height:100%;background:var(--mint);border-radius:8px;"></div>
          </div>
        </div>

        <div style="flex-shrink:0;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);padding:12px 14px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:8px;box-sizing:border-box;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-soft);">Session time</span>
            <span style="font-weight:900;font-size:14px;color:var(--aqua-ink);"><span id="s-elapsed2">${vm.elapsedDisplay}</span> <span style="color:var(--ink-faint);font-weight:700;">/ ~${vm.sessionPlannedDisplay}</span></span>
          </div>
          <div style="height:8px;background:var(--surface-2);border-radius:8px;overflow:hidden;">
            <div id="s-sess-fill" style="width:${vm.sessionTimePct}%;height:100%;background:var(--aqua);border-radius:8px;transition:width 0.4s;"></div>
          </div>
          ${vm.roundLine ? `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-size:12px;font-weight:900;color:var(--ink-soft);">${vm.roundLine}</span>
            <div style="display:flex;gap:5px;">${vm.roundDots.map(rd => `<span style="${rd.style}"></span>`).join("")}</div>
          </div>` : ""}
        </div>

        <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);box-shadow:var(--shadow-soft);box-sizing:border-box;padding:14px 16px;">
          <div style="font-weight:900;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;flex-shrink:0;">Today's exercises</div>
          <div style="flex:1;min-height:0;overflow-y:auto;">${exList(vm, true)}</div>
        </div>

        ${tipsSafety(vm)}
      </div>

      <div style="width:68%;min-width:0;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;overflow:hidden;">
        <div style="flex:1;min-height:0;padding:22px 28px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;box-sizing:border-box;overflow-y:auto;">
          ${centerStack(vm, true)}
        </div>
        <div style="flex:none;padding:14px 28px 18px;border-top:1.5px solid var(--hairline);background:var(--surface);display:flex;flex-direction:column;gap:12px;">
          ${controls(vm, true)}
        </div>
      </div>
    </div>`;
  }

  // narrow
  return `
  <div style="display:flex;flex-direction:column;background:var(--surface);border-radius:24px;box-shadow:0 14px 34px rgba(20,59,74,0.16);overflow:hidden;min-height:640px;position:relative;">
    ${overlays}
    <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto;box-sizing:border-box;">
      <div style="padding:14px 16px 0;flex-shrink:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-weight:900;font-size:12px;letter-spacing:0.06em;color:var(--ink-soft);text-transform:uppercase;">${vm.sessionDayTitle} · <span id="s-elapsed">${vm.elapsedDisplay}</span> / ~${vm.sessionPlannedDisplay}</span>
        </div>
        <div style="height:8px;background:var(--surface-2);border-radius:8px;overflow:hidden;">
          <div id="s-sess-fill" style="width:${vm.sessionTimePct}%;height:100%;background:var(--aqua);border-radius:8px;"></div>
        </div>
        ${vm.roundLine ? `<div style="font-size:12px;font-weight:900;color:var(--ink-soft);padding-top:6px;">${vm.roundLine}</div>` : ""}
      </div>

      <div style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;flex-shrink:0;">
        ${centerStack(vm, false)}
      </div>

      <div style="flex-shrink:0;padding:0 16px 14px;display:flex;flex-direction:column;gap:10px;">
        ${controls(vm, false)}
      </div>

      <div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:10px;">
        ${tipsSafety(vm)}
        <div style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);padding:12px 14px;">
          <div style="font-weight:900;font-size:11px;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;">Today's exercises</div>
          ${exList(vm, false)}
        </div>
      </div>
    </div>
  </div>`;
}

/* Targeted per-second DOM writes — no re-render, no image flicker. */
export function updateSessionTick(vm) {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set("s-timer-text", vm.timerIsReps ? vm.exActualDisplay : vm.timerDisplay);
  set("s-elapsed", vm.elapsedDisplay);
  set("s-elapsed2", vm.elapsedDisplay);
  set("s-ex-actual", vm.exActualDisplay);
  const sf = document.getElementById("s-sess-fill");
  if (sf) sf.style.width = vm.sessionTimePct + "%";
  const ef = document.getElementById("s-ex-fill");
  if (ef) ef.style.width = vm.exPacePct + "%";
  const arc = document.getElementById("s-ring-arc");
  if (arc) {
    const c = Number(arc.getAttribute("stroke-dasharray"));
    arc.setAttribute("stroke-dashoffset", String(c * (1 - Math.max(0, Math.min(1, vm.timerProgress)))));
    if (vm.timerUrgent) arc.setAttribute("stroke", "var(--stop)");
  }
}
