import { imgWithFallbacks, photoSources, escapeHtml } from "../util.js";
import { POSES } from "../data.js";
import { COPY, IMAGES, EMOJI } from "../sport.js";
/* ============================================================
   SESSION screen — full-screen takeover, wide + narrow, plus a
   targeted per-second updater (updateSessionTick) so the screen
   only fully re-renders on phase changes.
   ============================================================ */

const RING_ZONE_COLOR = {
  work: "var(--aqua)", warmup: "var(--sun)", rest: "var(--mint)", evening: "var(--grape)"
};

/* Recreation of the DS TimerRing: SVG track + progress arc, big Fredoka time. */
function timerRing(vm, size, capVh) {
  const stroke = size >= 300 ? 18 : 13;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = vm.timerUrgent ? "var(--stop)" : (RING_ZONE_COLOR[vm.timerZoneType] || "var(--aqua)");
  const offset = c * (1 - Math.max(0, Math.min(1, vm.timerProgress)));
  return `
  <div data-action="advance" title="Tap the ring when you're done" style="flex:0 1 ${size}px;max-width:${capVh ? `min(${size}px, ${capVh}vh)` : `${size}px`};min-width:${size >= 300 ? 200 : 140}px;aspect-ratio:1;display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;${vm.timerUrgent ? "animation:pulse-ring 1s ease-in-out infinite;" : ""}">
    <svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" style="transform:rotate(-90deg);position:absolute;inset:0;">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="var(--surface)" stroke="var(--surface-2)" stroke-width="${stroke}"></circle>
      <circle id="s-ring-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset 0.9s linear;"></circle>
    </svg>
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;">
      <span style="font-size:${size >= 300 ? 13 : 11}px;font-weight:900;letter-spacing:0.12em;color:${color};text-align:center;">${vm.timerZone}${vm.timerSideWord ? ` · ${vm.timerSideWord}` : ""}</span>
      <span id="s-timer-text" style="font-family:var(--font-display);font-weight:600;font-size:${size >= 300 ? "clamp(44px, 6.5vw, 76px)" : "46px"};line-height:1;color:${vm.timerUrgent ? "var(--stop)" : "var(--ink)"};">${vm.timerDisplay}</span>
      ${vm.timerIsPaused ? `<span style="font-size:12px;font-weight:900;color:var(--sun-ink);">PAUSED</span>` : ""}
    </div>
  </div>`;
}

function repRing(vm, size, capVh) {
  const border = size >= 300 ? 10 : 8;
  return `
  <div data-action="advance" title="Tap the ring when you're done" style="cursor:pointer;flex:0 1 ${size}px;max-width:${capVh ? `min(${size}px, ${capVh}vh)` : `${size}px`};min-width:${size >= 300 ? 220 : 160}px;aspect-ratio:1;border-radius:50%;background:var(--grape-wash);border:${border}px solid var(--grape);display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:${size >= 300 ? 26 : 14}px;">
    <div style="font-weight:900;font-size:${size >= 300 ? 15 : 11}px;letter-spacing:0.1em;color:var(--grape-deep);">BY REPS</div>
    <div style="font-family:var(--font-display);font-size:${size >= 300 ? 50 : 32}px;font-weight:600;color:var(--grape);text-align:center;line-height:1.05;margin:${size >= 300 ? 8 : 4}px 0;">${vm.curExDose}</div>
    ${vm.showClock ? `<div style="font-weight:900;font-size:${size >= 300 ? 20 : 14}px;color:var(--grape-deep);">⏱ <span id="s-timer-text">${vm.exActualDisplay}</span></div>` : ""}
    <div style="font-size:12px;font-weight:800;color:var(--grape-deep);opacity:0.8;margin-top:6px;">${vm.explore ? "No clock here — tap Next when you've had a look" : "Tap the ring when you're done"}</div>
  </div>`;
}

/* In-session prompt card (intent word / micro-loop) rendered in the ring's spot. */
function promptCard(vm, size) {
  if (vm.phase === "intent") {
    return `
    <div style="flex:0 1 ${size}px;max-width:${size}px;min-width:240px;min-height:${Math.round(size * 0.8)}px;border-radius:26px;background:var(--sun-wash);border:3px solid var(--sun);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:22px;box-sizing:border-box;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--ink);text-align:center;">After Round 1 — pick ONE word</div>
      <div style="font-size:14px;font-weight:700;color:var(--ink-soft);text-align:center;">What fixes what you just felt? Say it out loud for the next rounds.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        ${vm.intentWords.map(w => `<button type="button" data-action="pickIntent" data-arg="${w}" style="min-height:48px;border-radius:var(--radius-pill);border:3px solid var(--sun);background:var(--surface);color:var(--sun-ink);font-weight:900;font-size:16px;padding:0 18px;cursor:pointer;font-family:inherit;">${w}</button>`).join("")}
      </div>
    </div>`;
  }
  if (vm.phase === "microloop") {
    return `
    <div style="flex:0 1 ${size}px;max-width:${size}px;min-width:240px;min-height:${Math.round(size * 0.8)}px;border-radius:26px;background:var(--aqua-wash);border:3px solid var(--aqua);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:22px;box-sizing:border-box;">
      ${imgWithFallbacks(photoSources(POSES.think), `alt="" style="height:70px;object-fit:contain;"`)}
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
  if (vm.phase === "formcheck") {
    return `
    <div style="flex:0 1 ${size}px;max-width:${size}px;min-width:240px;min-height:${Math.round(size * 0.6)}px;border-radius:26px;background:var(--mint-wash);border:3px solid var(--mint);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:22px;box-sizing:border-box;">
      ${imgWithFallbacks(photoSources(POSES.think), `alt="" style="height:70px;object-fit:contain;"`)}
      <div style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--mint-ink);text-align:center;">${vm.formCheckTitle}</div>
      <div style="font-size:15px;font-weight:700;color:var(--ink);text-align:center;line-height:1.45;">${vm.cleanCheckQuestion}<br><span style="font-size:13px;color:var(--ink-soft);">${vm.checkNote}</span></div>
    </div>`;
  }
  /* Done before the coach's count finished. The card takes the rep ring's
     place — same grape, so it reads as part of the move — and asks once. */
  if (vm.phase === "repcheck") {
    return `
    <div data-rep-check style="flex:0 1 ${size}px;max-width:${size}px;min-width:240px;min-height:${Math.round(size * 0.8)}px;border-radius:26px;background:var(--grape-wash);border:3px solid var(--grape);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:22px;box-sizing:border-box;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:24px;color:var(--ink);text-align:center;">${vm.repCheckQuestion}</div>
      <div style="display:flex;flex-direction:column;gap:8px;width:100%;">
        ${vm.repCheckOpts.map(o => `<button type="button" data-action="answerRepCheck" data-arg="${o.arg}" style="min-height:52px;border-radius:16px;border:3px solid ${o.edge};background:${o.bg};color:${o.ink};font-weight:900;font-size:17px;cursor:pointer;font-family:inherit;">${o.label}</button>`).join("")}
      </div>
      <div style="font-size:13px;font-weight:800;color:var(--grape-deep);text-align:center;">${vm.repCheckRule}</div>
    </div>`;
  }
  // breath rehearsal
  return `
  <div style="flex:0 1 ${size}px;max-width:${size}px;min-width:240px;min-height:${Math.round(size * 0.8)}px;border-radius:26px;background:var(--mint-wash);border:3px solid var(--mint);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:22px;box-sizing:border-box;">
    ${imgWithFallbacks(photoSources(POSES.breath), `alt="" style="height:90px;object-fit:contain;"`)}
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
function photoSlot(photoUrl, w, h, radius, fill) {   // photoUrl: the list of sources, WebP first
  /* On a wide screen the picture is the tallest thing on the page, and a
     laptop at 780px has less room than the 900px this was drawn for. Sizing it
     by HEIGHT (capped in vh) and letting aspect-ratio derive the width means
     the cue underneath it stays on screen instead of falling off the bottom. */
  const box = fill
    ? `align-self:flex-start;width:100%;max-width:${w}px;min-width:0;aspect-ratio:${w} / ${h};`
    : `flex:1 1 ${w}px;max-width:${w}px;min-width:0;aspect-ratio:${w} / ${h};`;
  return `
  <div style="${box}border-radius:${radius}px;overflow:hidden;position:relative;background:linear-gradient(165deg,var(--aqua-wash),var(--bg-deep));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
    <span style="font-size:${Math.round(w / 6)}px;" aria-hidden="true">${EMOJI.sport}</span>
    <span style="font-size:12px;font-weight:800;color:var(--aqua-ink);opacity:0.75;text-align:center;padding:0 14px;">Form photo coming soon</span>
    ${imgWithFallbacks(photoUrl, `alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"`)}
  </div>`;
}

function stopOverlay(vm) {
  if (vm && vm.confirmRestart) return restartWarning(vm);
  return stopReasons();
}

/* Starting over is the one stop that throws work away, so it is the one stop
   that has to say so BEFORE it happens — in the number she actually cares
   about, not the word "progress". The XP is not lost forever: the same day is
   about to be worth the same again. */
function restartWarning(vm) {
  const n = vm.restartExercises;
  const did = n === 1 ? "1 move" : n + " moves";
  return `
  <div style="position:absolute;inset:0;z-index:20;background:var(--sun-wash);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px;text-align:center;">
    <span style="font-size:56px;" aria-hidden="true">🔄</span>
    <div style="font-family:var(--font-display);font-weight:600;font-size:32px;color:var(--ink);">Start this session over?</div>
    <div style="font-size:18px;font-weight:700;color:var(--ink);line-height:1.5;max-width:520px;">
      The ${did} you've already done ${n === 1 ? "is" : "are"} erased, and so is the XP for them — this attempt won't be saved at all.
    </div>
    <div style="font-size:16px;font-weight:700;color:var(--sun-ink);line-height:1.5;max-width:520px;">
      You can earn all of it back: the same session starts again from the top, worth exactly the same. 💛
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:8px;">
      <button type="button" data-action="cancelRestart" style="min-height:56px;border:none;border-radius:var(--radius-pill);padding:0 26px;background:var(--mint);color:#fff;font-weight:900;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 var(--mint-deep);">Keep what I've done</button>
      <button type="button" data-action="doRestart" style="min-height:56px;border:2px solid var(--sun-deep);border-radius:var(--radius-pill);padding:0 24px;background:var(--surface);color:var(--sun-ink);font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;">🔄 Yes, erase it and start over</button>
    </div>
  </div>`;
}

function stopReasons() {
  return `
  <div style="position:absolute;inset:0;z-index:20;background:var(--stop-wash);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px;text-align:center;">
    ${imgWithFallbacks(photoSources(POSES.breath), `alt="" style="height:180px;object-fit:contain;"`)}
    <div style="font-family:var(--font-display);font-weight:600;font-size:34px;color:var(--stop-ink);">Stopped. Good call.</div>
    <div style="font-size:18px;font-weight:700;color:var(--ink);line-height:1.5;max-width:480px;">If something hurts — sharp pain, pinching, or numbness — <b>tell a grown-up right now</b>. Your body matters more than any streak.</div>
    <div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;justify-content:center;">
      <button type="button" data-action="resumeFromStop" style="min-height:56px;border:none;border-radius:var(--radius-pill);padding:0 26px;background:var(--mint);color:#fff;font-weight:900;font-size:16px;cursor:pointer;font-family:inherit;box-shadow:0 4px 0 var(--mint-deep);">I'm okay — keep going</button>
    </div>
    <div style="font-size:14px;font-weight:800;color:var(--ink-soft);margin-top:6px;">Or end the session — what happened?</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
      <button type="button" data-action="endFromStop" data-arg="pain" style="min-height:56px;border:2px solid var(--stop);border-radius:var(--radius-pill);padding:0 22px;background:var(--surface);color:var(--stop-ink);font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;">🤕 Something hurts</button>
      <button type="button" data-action="endFromStop" data-arg="break" style="min-height:56px;border:2px solid var(--hairline);border-radius:var(--radius-pill);padding:0 22px;background:var(--surface);color:var(--ink);font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;">⏰ No time — I'm fine, just stopping today</button>
      <button type="button" data-action="askRestart" style="min-height:56px;border:2px solid var(--hairline);border-radius:var(--radius-pill);padding:0 22px;background:var(--surface);color:var(--ink);font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;">🔄 I need to start over</button>
    </div>
  </div>`;
}

export function detailOverlayHtml(vm) {
  return `
  <div data-action="closeDetail" style="position:fixed;inset:0;z-index:100;background:rgba(20,59,74,0.55);display:flex;align-items:center;justify-content:center;padding:30px;box-sizing:border-box;">
    <div data-stop-propagation="1" style="background:var(--surface);border-radius:var(--radius-xl);box-shadow:var(--shadow-pop);max-width:680px;width:100%;max-height:100%;overflow-y:auto;box-sizing:border-box;">
      <div style="position:relative;">
        <div style="width:100%;height:330px;position:relative;overflow:hidden;background:linear-gradient(165deg,var(--aqua-wash),var(--bg-deep));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
          <span style="font-size:60px;" aria-hidden="true">${EMOJI.sport}</span>
          <span style="font-size:13px;font-weight:800;color:var(--aqua-ink);opacity:0.75;">Demo photo coming soon</span>
          ${imgWithFallbacks(vm.detailPhotoSources, `alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"`)}
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
        ${vm.detailTransfer ? `
        <div style="background:var(--sea-wash);border-radius:var(--radius-md);padding:12px 14px;">
          <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--sea-ink);margin-bottom:4px;">${COPY.transferHeading}</div>
          <div style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.4;">${vm.detailTransfer}</div>
        </div>` : ""}
        ${vm.detailShowResume ? `
        <div style="display:flex;flex-direction:column;gap:8px;align-items:stretch;border-top:1.5px solid var(--hairline);padding-top:14px;">
          <div style="font-size:13px;font-weight:800;color:var(--ink-soft);text-align:center;">⏸ Your session is paused while you read.</div>
          <button type="button" data-action="resumeFromDetail" style="width:100%;min-height:54px;border:none;border-radius:var(--radius-pill);background:var(--mint);color:#fff;font-family:var(--font-display);font-weight:600;font-size:20px;cursor:pointer;box-shadow:0 5px 0 var(--mint-deep);">▶ Resume my session</button>
        </div>` : ""}
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------
   How the finish screen looks, per OUTCOME state. One row per state,
   chosen by vm.completionState, which comes from the saved record via
   outcomeOf() — never from `endedEarly === false`, which only ever meant
   "the loop reached its end" and so called a Recovery pass, and a session
   of nothing but skips, a completed workout.

   `mantra` is the celebratory line: it belongs to a day that was actually
   trained, and would read as praise she did not earn on the others.
   ------------------------------------------------------------------ */
const COMPLETION = {
  complete: {
    bg: "var(--mint-wash)", ink: "var(--mint-ink)", pose: "celebrate", poseH: 230,
    title: "Session Complete!", mantra: true,
    note: ""
  },
  /* One "partial" said the same thing to a day that earned the streak and a day
     that fell short of it — true about the work, silent about the one thing she
     is standing on. They are separate rows now, and the short one says how far. */
  "partial-streak": {
    bg: "var(--sun-wash)", ink: "var(--sun-ink)", pose: "keepgoing", poseH: 190,
    title: "Part of the way — and today counts.", mantra: false,
    noteStyle: "color:var(--mint-ink);background:var(--mint-wash);",
    note: "You didn't finish the whole thing, and everything you DID do is saved — the moves, the minutes and the XP for them. You did enough of today's plan to keep your streak. 🔥"
  },
  "partial-short": {
    bg: "var(--sun-wash)", ink: "var(--sun-ink)", pose: "keepgoing", poseH: 190,
    title: "Part of the way — and it counts.", mantra: false,
    noteStyle: "color:var(--sun-ink);background:var(--sun-wash);",
    note: "You didn't finish the whole thing, and everything you DID do is saved — the moves, the minutes and the XP for them. Today didn't reach the streak, and it doesn't erase anything either. Coming back and finishing the rest is how it's meant to work. 💛"
  },
  /* The freeze is earned by finishing the menu, so only the finished pass may
     promise it. A recovery run abandoned after two moves is not a day's care,
     and telling her it held the streak would be a promise the streak breaks. */
  "recovery-held": {
    bg: "var(--aqua-wash)", ink: "var(--aqua-ink)", pose: "breath", poseH: 200,
    title: "Recovery done. That was care.", mantra: false,
    noteStyle: "color:var(--aqua-ink);background:var(--aqua-wash);",
    note: "Recovery isn't a session, so it doesn't add a training day or a streak day — and it isn't supposed to. It holds your streak right where it is. Listening to your body is the whole point, and you did it. ❄️"
  },
  "recovery-short": {
    bg: "var(--aqua-wash)", ink: "var(--aqua-ink)", pose: "breath", poseH: 200,
    title: "Some care is better than none.", mantra: false,
    noteStyle: "color:var(--aqua-ink);background:var(--aqua-wash);",
    note: "You started the recovery menu and stopped partway. What you did is saved. Finishing the whole menu is what keeps your streak safe on a sore day — it's short and gentle, and it's worth coming back for. ❄️"
  },
  "safety-stop": {
    bg: "var(--stop-wash)", ink: "var(--stop-ink)", pose: "seeyou", poseH: 170,
    title: "You stopped. That was the right call.", mantra: false,
    noteStyle: "color:var(--stop-ink);background:var(--stop-wash);border:2px solid var(--stop);",
    note: "Good call stopping. Tell a grown-up how it felt — that's what champions do."
  },
  none: {
    bg: "var(--sun-wash)", ink: "var(--sun-ink)", pose: "seeyou", poseH: 170,
    title: "Nothing logged this time.", mantra: false,
    noteStyle: "color:var(--sun-ink);background:var(--sun-wash);",
    note: "Every move got skipped, so there's nothing to record — no XP and no streak day. That's fine! Come back when you've got the energy and do it for real. 💛"
  },
  /* Explore is not a session at all: there is no record to describe, and no
     praise to give or withhold. It says what it was and points at GO. */
  explore: {
    bg: "var(--aqua-wash)", ink: "var(--aqua-ink)", pose: "seeyou", poseH: 170,
    title: "That's every move.", mantra: false,
    noteStyle: "color:var(--aqua-ink);background:var(--aqua-wash);",
    note: "Nothing was recorded — this was just a look. When you're ready to train for real, go back and tap GO. 🧪"
  },
  "save-failed": {
    bg: "var(--stop-wash)", ink: "var(--stop-ink)", pose: "seeyou", poseH: 170,
    title: "Session finished — but not saved.", mantra: false, alert: true,
    noteStyle: "color:var(--stop-ink);background:var(--stop-wash);border:2px solid var(--stop);",
    note: "⚠️ This device is out of storage, so this session could NOT be saved. Show a grown-up — they can free up space so your next one counts."
  }
};

function completeScreen(vm) {
  const c = COMPLETION[vm.completionKey] || COMPLETION[vm.completionState] || COMPLETION.none;
  // The note the VM built for this particular day — the percentage she reached,
  // what got skipped and today's second chance — in place of the fixed sentence
  // the row carries. The row's own words are the fallback, for a record with no
  // expected size to measure against.
  const note = vm.completionNote || c.note;
  // Coming back to finish a day is harder than doing it in one go, and the
  // screen should say which one just happened.
  const title = vm.finishedAResume ? "You came back and finished it! 🎉" : c.title;
  return `
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:16px;padding:40px;text-align:center;background:${c.bg};overflow-y:auto;">
    ${imgWithFallbacks(photoSources(POSES[c.pose]), `alt="" style="height:${c.poseH}px;object-fit:contain;flex-shrink:0;"`)}
    <div style="font-family:var(--font-display);font-weight:600;font-size:34px;color:${c.ink};">${title}</div>
    ${note ? `<div${c.alert ? ` role="alert"` : ""} style="font-size:15px;font-weight:800;${c.noteStyle || "color:var(--mint-ink);background:var(--mint-wash);"}border-radius:16px;padding:10px 16px;max-width:480px;line-height:1.45;">${note}</div>` : ""}
    ${vm.paceNote ? `
    <div style="display:flex;align-items:flex-start;gap:9px;max-width:480px;text-align:left;border-radius:16px;padding:10px 14px;font-size:14px;font-weight:800;line-height:1.45;${
      vm.paceBand === "red" ? "background:var(--stop-wash);color:var(--stop-ink);"
      : vm.paceBand === "yellow" ? "background:var(--coral-wash);color:var(--coral-ink);"
      : vm.paceBand === "amber" ? "background:var(--sun-wash);color:var(--sun-ink);"
      : "background:var(--mint-wash);color:var(--mint-ink);"}">
      <span style="flex-shrink:0;font-size:16px;">${vm.paceBand === "red" ? "⚠️" : vm.paceBand === "yellow" ? "🟡" : vm.paceBand === "amber" ? "🟠" : "✅"}</span>
      <span>${escapeHtml(vm.paceNote)}</span>
    </div>` : ""}
    ${vm.sessionMantra && c.mantra ? `<div style="font-family:var(--font-hand);font-size:26px;font-weight:700;color:var(--aqua-ink);line-height:1.2;">${vm.sessionMantra}</div>` : ""}
    <div style="font-size:16px;font-weight:700;color:var(--ink-soft);">${vm.sessionDayTitle}${vm.explore ? "" : ` · ${vm.sessionMinutes} min`}${vm.showRoundsLine ? ` · ${vm.roundsLine}` : ""}${vm.xpLine ? ` · ⭐ ${escapeHtml(vm.xpLine)}` : ""}</div>
    ${vm.showRoundsLine && (vm.roundShortNotes || []).length ? `
    <div style="font-size:14px;font-weight:700;color:var(--ink-soft);max-width:480px;line-height:1.5;">
      ${vm.roundShortNotes.map(n => `<div>${n}</div>`).join("")}
    </div>` : ""}
    ${vm.notFull && vm.notFull.length ? `
    <div style="max-width:520px;width:100%;box-sizing:border-box;text-align:left;background:var(--surface);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:8px;" data-not-full-list="1">
      <div style="font-family:var(--font-display);font-weight:600;font-size:17px;color:var(--ink);">Not done in full</div>
      ${vm.notFull.map(r => `
      <div style="display:flex;align-items:baseline;gap:10px;font-size:14px;font-weight:800;color:var(--ink);" data-not-full="${escapeHtml(r.name)}">
        <span style="flex:1;min-width:0;">${escapeHtml(r.name)}</span>
        <span style="font-weight:800;color:${r.anySkipped ? "var(--coral)" : "var(--sun-ink)"};white-space:nowrap;">${escapeHtml(r.label)}</span>
      </div>`).join("")}
      <button type="button" data-action="goSessionRedo" data-arg="${escapeHtml(vm.redoDayKey)}" style="align-self:flex-start;margin-top:4px;background:var(--aqua);color:#fff;border:none;border-radius:var(--radius-pill);padding:11px 20px;font-weight:900;font-size:14px;cursor:pointer;font-family:inherit;min-height:44px;box-shadow:0 4px 0 var(--aqua-ink,var(--sea));">Redo these</button>
    </div>` : ""}
    ${vm.allInFull ? `
    <div style="font-size:14px;font-weight:800;color:var(--ink-soft);max-width:480px;line-height:1.5;">Every move was done in full.</div>` : ""}
    ${vm.leveledUp ? `<button type="button" data-action="openPrizeDraw" style="display:flex;align-items:center;gap:10px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:14px 26px;font-family:var(--font-display);font-weight:600;font-size:19px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);">🎁 Level up! Pick your prize</button>` : ""}
    ${vm.saveFailed ? `
    <div style="display:flex;flex-direction:column;gap:10px;background:var(--stop-wash, var(--surface));border:2px solid var(--stop);border-radius:20px;padding:18px 22px;max-width:600px;width:100%;box-sizing:border-box;text-align:left;">
      <div style="font-family:var(--font-display);font-weight:600;font-size:19px;color:var(--stop-ink);">This one didn't save 😕</div>
      <div style="font-size:14px;font-weight:700;color:var(--ink);line-height:1.5;">You did the work — the iPad just had no room left to write it down. Nothing has been counted for it yet, so there's no XP or streak from this session.</div>
      <div style="font-size:14px;font-weight:700;color:var(--ink);line-height:1.5;"><strong>Show this to a grown-up.</strong> In the Grown-up Zone they can free up space, and your progress for today is still saved — you can pick this session back up where you left it.</div>
    </div>` : ""}
    ${vm.showCompletionExtras ? `
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:6px;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${imgWithFallbacks(photoSources(POSES.think), `alt="" style="height:64px;object-fit:contain;"`)}
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
        ${imgWithFallbacks(photoSources(IMAGES.mascot), `style="width:44px;height:44px;object-fit:contain;flex-shrink:0;" alt=""`)}
        <div>
          <div style="font-family:var(--font-display);font-weight:600;font-size:18px;color:var(--ink);">Coach's Quiz 🧠</div>
          <div style="font-size:12px;font-weight:800;color:var(--ink-soft);">${vm.quizIntro || COPY.sessionQuizIntro}</div>
        </div>
      </div>
      <div style="font-weight:800;font-size:16px;color:var(--ink);line-height:1.4;">${vm.quizQuestion}</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${vm.quizOpts.map(qo => `
          <button type="button" data-action="quizPick" data-arg="${qo.idx}"${qo.disabled ? " disabled" : ""} style="${qo.style}">
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
    <button type="button" data-action="exitSession" style="margin-top:14px;display:flex;align-items:center;gap:10px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:16px 32px;font-family:var(--font-display);font-weight:600;font-size:20px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);flex-shrink:0;">🏠 ${vm.explore ? "Done looking" : "Back to Today"}</button>
  </div>`;
}

/* The move's NAME is the headline now, above the picture and the ring, at a
   size you can read from across the room. It used to sit under the ring at
   22px, smaller than the "UP NEXT" line and a third of the countdown, which
   is a strange thing to do to the one word that says what she is doing.

   It is NOT inside the ring. Names here run to 41 characters ("Lats / upper
   back — roller, arms overhead") and 23 of the 79 are 19 or more; the ring's
   interior is already carrying a countdown at up to 76px. Either the name
   truncates or the number shrinks, and neither is worth it. */
function nameHeadline(vm, wide, tablet) {
  const size = tablet ? 26 : wide ? 30 : 22;
  const title = `<span style="font-family:var(--font-display);font-size:${size}px;font-weight:600;color:var(--ink);line-height:1.15;">${vm.stageTitle}</span>`;
  return `
  <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;flex-shrink:0;text-align:center;">
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
      ${badge(vm.blockBadgeVariant, vm.blockLabel)}
      ${vm.roundShort ? `<span style="display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:900;color:var(--ink-soft);background:var(--surface-2);border-radius:var(--radius-pill);padding:4px 11px;">${vm.roundShort}${(vm.roundDots || []).length ? `<span style="display:inline-flex;gap:4px;">${vm.roundDots.map(rd => `<span style="${rd.style}"></span>`).join("")}</span>` : ""}</span>` : ""}
    </div>
    ${vm.canOpenDetail ? `
    <button type="button" data-action="openDetailCur" title="See instructions &amp; video" style="display:flex;align-items:center;justify-content:center;gap:10px;background:none;border:none;padding:2px 6px;margin:0;cursor:pointer;font-family:inherit;min-height:44px;max-width:100%;">
      ${title}
      <span aria-hidden="true" style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:var(--surface-2);color:var(--ink-soft);font-size:17px;font-weight:900;display:flex;align-items:center;justify-content:center;">ⓘ</span>
    </button>` : `<div style="max-width:100%;">${title}</div>`}
  </div>`;
}

/* The cue, directly under the ring — where she is already looking. It used to
   live at the bottom of the left rail, a third of a screen away from the only
   thing on this page she is watching.

   Beside it, the form warning as a single ❗ that opens on tap. "Watch for" is
   a grown-up's line, and a kid does not need it shouting through every rep;
   one tap is the right distance for it. The always-on pain rule is NOT here —
   it never changes, and a warning that is permanently on screen is wallpaper
   by the second week. That one stays in the rail. */
function coachStrip(vm, wide) {
  if (!vm.curExCue && !(vm.curExWatchFor && vm.notResting)) return "";
  const hasWarn = !!(vm.curExWatchFor && vm.notResting);
  const open = hasWarn && vm.watchOpen;
  return `
  <div style="width:100%;max-width:${wide ? 560 : 480}px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;">
    <div style="display:flex;align-items:stretch;gap:8px;">
      ${vm.curExCue ? `
      <div style="flex:1;min-width:0;background:var(--aqua-wash);border-radius:var(--radius-md);padding:10px 14px;box-sizing:border-box;">
        <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--aqua-ink);margin-bottom:3px;">Coach tip</div>
        <div style="font-size:17px;font-weight:700;color:var(--ink);line-height:1.35;">${vm.curExCue}</div>
      </div>` : `<div style="flex:1;"></div>`}
      ${hasWarn ? `
      <button type="button" data-action="toggleWatch" aria-expanded="${open}" aria-controls="s-watch"
        title="${open ? "Hide what to watch for" : "What to watch for"}"
        style="flex-shrink:0;width:52px;min-height:52px;border-radius:var(--radius-md);border:2px solid var(--sun);background:${open ? "var(--sun)" : "var(--sun-wash)"};color:var(--sun-ink);font-size:24px;font-weight:900;line-height:1;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;">
        <span aria-hidden="true">${open ? "×" : "❗"}</span>
        <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;">What to watch for</span>
      </button>` : ""}
    </div>
    ${open ? `
    <div id="s-watch" style="background:var(--sun-wash);border:2px solid var(--sun);border-radius:var(--radius-md);padding:12px 14px;box-sizing:border-box;text-align:left;">
      <div style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--sun-ink);margin-bottom:4px;">👀 Watch for</div>
      <div style="font-size:16px;font-weight:700;color:var(--ink);line-height:1.4;">${vm.curExWatchFor}</div>
      ${vm.curExFix ? `<div style="font-size:15px;color:var(--ink-soft);line-height:1.4;margin-top:5px;">🔧 ${vm.curExFix}</div>` : ""}
    </div>` : ""}
  </div>`;
}

/* What is COMING sits under the picture; what is HAPPENING sits under the
   ring. They were stacked together under the clock, which put the next move
   between the athlete and her own pace bar — and left the space below the
   photo empty. With no photo (a phone, an upright iPad) it goes back under
   the clock, because there is no other column to put it in. */
function upNext(vm, wide) {
  const label = wide ? 15 : 12;
  return `
  <div style="width:100%;flex-shrink:0;display:flex;align-items:baseline;justify-content:center;gap:${wide ? 14 : 8}px;flex-wrap:wrap;text-align:center;${wide ? "border-top:1.5px solid var(--hairline);padding-top:10px;" : ""}">
    <span style="font-size:${label}px;font-weight:900;color:var(--aqua-ink);text-transform:uppercase;letter-spacing:0.08em;">Up next</span>
    <span style="font-family:var(--font-display);font-size:${wide ? 24 : 17}px;font-weight:600;color:var(--ink);line-height:1.2;">${vm.upNextName}</span>
    <span style="font-family:var(--font-hand);font-size:${wide ? 20 : 16}px;color:var(--aqua-ink);line-height:1.2;">${vm.upNextDose}</span>
  </div>`;
}

function centerStack(vm, wide, tablet) {
  const ringSize = !wide ? 240 : vm.tightColumn ? 330 : tablet ? 300 : 320;
  const photoW = tablet ? 240 : 360;
  const photoH = tablet ? 320 : 480;
  /* A picture only on a wide screen. On a phone the ring IS the app, and a
     form photo above it pushed the countdown into the middle of a scrolling
     page; the ⓘ by the name opens the same photo (bigger, with the video)
     whenever she actually wants to look at it. */
  const showPhoto = wide && !vm.tightColumn && vm.notResting && (!vm.isPrompt || vm.isFormCheck);
  const capVh = wide ? (tablet ? 40 : 46) : 0;
  const ring = vm.isPrompt ? promptCard(vm, ringSize)
    : vm.timerIsReps ? repRing(vm, ringSize, capVh)
    : timerRing(vm, ringSize, capVh);

  /* Everything that belongs to the CLOCK sits in one column under the ring —
     the cue, the ❗, the dose, what is next. It used to be laid out full-width
     under the picture AND the ring, which left a dead strip down each outside
     edge and put the cue a picture's width from the timer.

     There is no per-move "Elapsed" pace bar here any more. A rep move's
     planned time is reps × 3 s — an estimate — while the grade is the coach's
     spoken count, which is slower. The bar filled before the coach finished,
     so she tapped Done at "100%" and got a ½. The rep ring follows the count,
     so on it "full" means full. */
  const ringColumn = `
  <div style="flex:1 1 ${showPhoto ? (tablet ? "56%" : "51%") : "100%"};min-width:0;display:flex;flex-direction:column;align-items:center;gap:${tablet ? 10 : 12}px;">
    ${ring}
    ${coachStrip(vm, wide)}
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;text-align:center;">
      ${vm.overNudge ? `<div style="font-family:var(--font-hand);font-size:17px;font-weight:700;color:var(--sun-ink);line-height:1.2;">Past the planned time — that's okay. Finish clean, then rest 💛</div>` : ""}
      ${vm.notResting ? `<div style="font-family:var(--font-hand);font-size:${wide ? 16 : 15}px;color:var(--aqua-ink);font-style:italic;line-height:1.2;">${vm.curExDose}</div>` : ""}
    </div>
  </div>`;

  return `
  ${nameHeadline(vm, wide, tablet)}

  <div style="display:flex;gap:${tablet ? 16 : 22}px;align-items:flex-start;justify-content:center;width:100%;min-width:0;flex-shrink:0;">
    ${showPhoto ? `<div style="flex:1 1 ${tablet ? 44 : 49}%;min-width:0;align-self:stretch;display:flex;flex-direction:column;gap:8px;">
      ${photoSlot(vm.curExPhotoSources, photoW, photoH, 20, true)}
    </div>` : ""}
    ${ringColumn}
  </div>

  ${vm.upNextName ? upNext(vm, wide) : ""}

  ${vm.isBigRest ? `
  <div style="display:flex;align-items:center;gap:10px;background:var(--sun-wash);border-radius:var(--radius-lg);padding:10px 14px;box-sizing:border-box;width:100%;max-width:480px;flex-shrink:0;">
    ${imgWithFallbacks(photoSources(POSES.breath), `style="width:64px;height:58px;object-fit:contain;flex-shrink:0;" alt=""`)}
    <div style="font-family:var(--font-hand);font-size:15px;color:var(--sun-ink);font-style:italic;line-height:1.3;">${vm.cheerMsg}</div>
  </div>` : ""}

  ${vm.showCoachState ? `
  <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;width:100%;max-width:480px;flex-shrink:0;">
    ${[vm.coachSetLine, vm.coachSideLine, vm.coachDirectionLine, vm.coachRepLine].filter(Boolean).map(t =>
      `<span style="font-size:11px;font-weight:900;letter-spacing:0.06em;border-radius:var(--radius-pill);padding:4px 11px;background:var(--surface-2);color:var(--ink-soft);white-space:nowrap;">${t}</span>`).join("")}
    ${vm.coachNextLine ? `<span style="font-size:11px;font-weight:900;letter-spacing:0.06em;border-radius:var(--radius-pill);padding:4px 11px;background:var(--sun-wash);color:var(--sun-ink);white-space:nowrap;">${vm.coachNextLine}</span>` : ""}
  </div>` : ""}

  ${vm.showCleanCheck ? `
  <div style="display:flex;align-items:center;gap:12px;background:var(--surface);border:2px solid var(--mint);border-radius:var(--radius-lg);padding:10px 16px;width:100%;max-width:480px;flex-shrink:0;box-sizing:border-box;box-shadow:var(--shadow-soft);">
    <span style="flex:1;font-weight:900;font-size:15px;color:var(--ink);">${vm.cleanCheckQuestion}</span>
    <button type="button" data-action="pickClean" style="min-height:46px;border:none;border-radius:var(--radius-pill);padding:0 18px;background:var(--mint);color:#fff;font-weight:900;font-size:14px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 var(--mint-deep);">${vm.checkCleanLabel}</button>
    <button type="button" data-action="pickWobbly" style="min-height:46px;border:none;border-radius:var(--radius-pill);padding:0 18px;background:var(--sun);color:var(--sun-ink);font-weight:900;font-size:14px;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 var(--sun-deep);">${vm.checkWobblyLabel}</button>
    <button type="button" data-action="skipFormCheck" style="min-height:46px;border:none;border-radius:var(--radius-pill);padding:0 14px;background:transparent;color:var(--ink-soft);font-weight:900;font-size:13px;cursor:pointer;font-family:inherit;">Skip</button>
  </div>` : ""}`;
}

/* The one line that must never be more than a glance away. It used to live at
   the bottom of the left rail, a full column from the ring — the side of the
   screen nobody watching a countdown is looking at. Here it sits directly
   under the buttons her hand is already on. Static, so it is deliberately
   quiet: a thin strip, not a card. */
function painRule(wide) {
  return `<div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--stop-wash);border:1.5px solid var(--stop-light);border-radius:var(--radius-pill);padding:6px 14px;box-sizing:border-box;">
    <span style="font-size:15px;flex-shrink:0;" aria-hidden="true">🔴</span>
    <span style="font-size:${wide ? 14 : 13}px;font-weight:800;color:var(--stop-ink);line-height:1.3;text-align:center;">Sharp pain, pinching, or numbness → STOP and tell a grown-up.</span>
  </div>`;
}

function controls(vm, wide) {
  const rowBtn = (action, label, extra) => `<button type="button" data-action="${action}" style="flex:1;min-height:${wide ? 44 : 46}px;border-radius:var(--radius-md);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;font-family:inherit;${extra}">${label}</button>`;
  const backBtn = vm.canGoBack
    ? rowBtn("goBack", "◀ Back a move", "border:2px solid var(--hairline);background:var(--surface);color:var(--ink-soft);")
    : "";

  /* EXPLORE: Next, Back, Skip, Done looking. Nothing here pauses, stops or
     needs confirming, because nothing here is running or being saved. */
  if (vm.explore) {
    return `
  <button type="button" data-action="advance" style="width:100%;min-height:${wide ? 44 : 50}px;border-radius:var(--radius-md);border:none;font-weight:900;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--mint);color:#fff;box-shadow:0 4px 0 var(--mint-deep);font-family:inherit;">${vm.doneLabel}</button>
  <div style="display:flex;gap:${wide ? 14 : 8}px;">
    ${backBtn}
    ${rowBtn("skipEx", "⏭ Skip", "border:2px solid var(--hairline);background:var(--surface);color:var(--ink-soft);")}
    ${rowBtn("exitExplore", "✕ Done looking", "border:2px solid var(--sun-deep);background:var(--sun-wash);color:var(--sun-ink);")}
  </div>`;
  }

  return `
  ${vm.pausedByBackground ? `
  <div style="background:var(--sun-wash);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:8px;font-size:13px;font-weight:800;color:var(--sun-ink);line-height:1.4;text-align:center;">
    ⏸ You left the app, so I stopped the clock. Nothing was counted while you were away — tap Resume when you're ready.
  </div>` : ""}
  <button type="button" data-action="advance" style="width:100%;min-height:${wide ? 48 : 52}px;border-radius:var(--radius-md);border:none;font-weight:900;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--mint);color:#fff;box-shadow:0 4px 0 var(--mint-deep);font-family:inherit;">${vm.doneLabel}</button>
  <div style="display:flex;gap:${wide ? 14 : 8}px;">
    <button type="button" data-action="stopNow" style="flex:1;min-height:${wide ? 44 : 46}px;border-radius:var(--radius-md);border:none;font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--stop);color:#fff;box-shadow:0 3px 0 var(--stop-ink);font-family:inherit;">🔴 STOP</button>
    ${vm.timerNotPaused
      ? `<button type="button" data-action="pauseTimer" style="flex:1;min-height:${wide ? 44 : 46}px;border-radius:var(--radius-md);border:2px solid var(--sun-deep);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--sun-wash);color:var(--sun-ink);font-family:inherit;">❚❚ Pause</button>`
      : `<button type="button" data-action="pauseTimer" style="flex:1;min-height:${wide ? 44 : 46}px;border-radius:var(--radius-md);border:2px solid var(--mint-deep);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--mint-wash);color:var(--mint-ink);font-family:inherit;">▶ Resume</button>`}
    ${vm.canSkipExercise
      ? `<button type="button" data-action="askSkip" style="flex:1;min-height:${wide ? 44 : 46}px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-weight:900;font-size:${wide ? 14 : 12}px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--surface);color:var(--ink-soft);font-family:inherit;">⏭ Skip${wide ? " this move" : ""}</button>`
      : ""}
  </div>
  ${vm.confirmSkip ? `
  <div style="display:flex;${wide ? "align-items:center;gap:12px;" : "flex-direction:column;gap:8px;"}background:var(--sun-wash);border:2px solid var(--sun);border-radius:var(--radius-md);padding:10px 14px;box-sizing:border-box;">
    <span style="${wide ? "flex:1;" : ""}font-weight:800;font-size:${wide ? 15 : 14}px;color:var(--sun-ink);">Skip this move? It won&#39;t count.</span>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      <button type="button" data-action="cancelSkip" style="${wide ? "" : "flex:1;"}min-height:44px;border-radius:var(--radius-md);border:none;font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;padding:0 18px;background:var(--mint);color:#fff;box-shadow:0 3px 0 var(--mint-deep);font-family:inherit;">Keep going</button>
      <button type="button" data-action="confirmSkipEx" style="${wide ? "" : "flex:1;"}min-height:44px;border-radius:var(--radius-md);border:2px solid var(--hairline);font-weight:900;font-size:${wide ? 14 : 13}px;cursor:pointer;padding:0 16px;background:var(--surface);color:var(--ink-soft);font-family:inherit;">⏭ Skip it</button>
    </div>
  </div>` : ""}
  <div style="display:flex;align-items:center;gap:${wide ? 12 : 8}px;border-top:1.5px solid var(--hairline);padding-top:10px;${wide ? "" : "flex-direction:column;"}">
    ${vm.canGoBack ? `<button type="button" data-action="goBack" style="flex:0 0 auto;min-height:44px;border-radius:var(--radius-pill);border:none;font-weight:900;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 16px;background:transparent;color:var(--ink-faint);font-family:inherit;">◀ Back a move</button>` : ""}
    ${painRule(wide)}
  </div>`;
}

function exList(vm, wide, tablet) {
  const nameSize = tablet ? 16 : wide ? 17 : 15;
  const iconSize = tablet ? 24 : wide ? 26 : 24;
  /* The number and the name are a BUTTON where the list is navigable — which
     is explore only, where nothing is recorded and walking in order is not the
     point. The number is the status pill, so the tap target is the thing she is
     already reading. The ⓘ stays a sibling: a button cannot hold a button. */
  const jumpOpen = "flex:1;min-width:0;display:flex;align-items:center;gap:9px;background:none;border:none;padding:0;margin:0;cursor:pointer;font-family:inherit;text-align:left;min-height:44px;";
  const legend = vm.exListLegend ? `
    <div style="font-size:${wide ? 12 : 11}px;font-weight:800;color:var(--ink-faint);line-height:1.35;padding:${wide ? "2px 0 6px" : "2px 0 5px"};">${vm.exListLegend}</div>` : "";
  return legend + vm.sessionExList.map(sitem => sitem.isHeader ? `
    <div style="display:flex;align-items:center;gap:8px;padding:${wide ? "12px 0 4px" : "10px 0 4px"};">
      <span style="width:${wide ? 10 : 9}px;height:${wide ? 10 : 9}px;border-radius:50%;background:${sitem.color};flex-shrink:0;"></span>
      <span style="font-weight:900;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;color:${sitem.color};">${sitem.name}</span>
      ${(sitem.roundDots || []).length ? `<div style="display:flex;gap:4px;margin-left:auto;">${sitem.roundDots.map(rd => `<span style="${rd.style}"></span>`).join("")}</div>` : ""}
    </div>` : `
    <div ${sitem.isCur ? 'data-ex-cur="1" ' : ""}style="${sitem.cardStyle}">
      ${sitem.jumpAction ? `<button type="button" data-action="goToMove" data-arg="${sitem.ci}|${sitem.ei}" title="Jump to this move" style="${jumpOpen}">` : ""}
      <span style="${sitem.numStyle}">${sitem.num}</span>
      <span style="${sitem.nameStyle}font-size:${nameSize}px;">${sitem.name}</span>
      ${sitem.jumpAction ? "</button>" : ""}
      <button type="button" data-action="openDetailAt" data-arg="${sitem.ci}|${sitem.ei}" title="See detail photo &amp; video" style="flex-shrink:0;width:${iconSize}px;height:${iconSize}px;border-radius:50%;border:none;background:var(--surface-2);color:var(--ink-soft);font-size:${tablet ? 13 : wide ? 14 : 13}px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">ⓘ</button>
      <span style="font-size:${nameSize}px;flex-shrink:0;width:${wide ? 18 : 16}px;text-align:center;color:${sitem.secColor};">${sitem.statusIcon}</span>
    </div>`).join("");
}

/* What is LEFT for the rail once the cue, the warning and the pain rule have
   moved next to the ring: only the nudge that follows a wobbly form check.
   The "Builds:" transfer line went with them — it is already in the ⓘ detail
   overlay, under the same heading, with the photo and the video. */
function tipsSafety(vm) {
  if (!vm.wobblyBanner) return "";
  return `
  <div style="flex-shrink:0;background:var(--sun-wash);border-radius:var(--radius-lg);padding:12px 14px;font-family:var(--font-hand);font-size:18px;font-weight:700;color:var(--sun-ink);line-height:1.3;">Fewer, slower — quality first. You've got this 💛</div>`;
}

/* Collapse the rail BY HAND, never on a timer. Auto-hiding it would have
   reflowed the whole pane — ring resizing, buttons sliding under her thumb —
   every time a work phase started, and the rail answers "how much is left",
   which is exactly the rest-phase question. So: a chevron, and it stays where
   she put it. */
function railToggle(collapsed) {
  return `<button type="button" data-action="toggleRail"
    aria-expanded="${!collapsed}" title="${collapsed ? "Show today’s moves" : "Hide this panel"}"
    style="flex-shrink:0;width:32px;height:32px;border-radius:50%;border:1.5px solid var(--hairline);background:var(--surface);color:var(--ink-soft);font-size:14px;font-weight:900;line-height:1;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;padding:0;">
    <span aria-hidden="true">${collapsed ? "›" : "‹"}</span>
    <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;">${collapsed ? "Show today’s moves" : "Hide today’s moves"}</span>
  </button>`;
}

export function sessionScreen(vm) {
  const overlays = `
    ${vm.detailOverlay ? detailOverlayHtml(vm) : ""}
    ${vm.stopOverlay ? stopOverlay(vm) : ""}`;

  if (vm.sessionDone) {
    return `
    <div style="display:flex;background:var(--surface);border-radius:30px;box-shadow:0 18px 44px rgba(20,59,74,0.16);overflow:hidden;min-height:${vm.isWide ? 800 : 640}px;position:relative;">
      ${overlays}
      ${completeScreen(vm)}
    </div>`;
  }

  const banner = vm.exploreBanner ? `
    <div role="status" style="background:var(--grape,#7C5BC7);color:#fff;padding:10px 18px;display:flex;align-items:center;justify-content:center;gap:9px;font-weight:900;font-size:${vm.isWide ? 14 : 12}px;letter-spacing:0.02em;text-align:center;line-height:1.35;flex-shrink:0;">${vm.exploreBanner}</div>` : "";

  if (vm.isWide) {
    /* An iPad held upright is wide enough for two columns and NOT wide enough
       for the desktop's proportions: at 810px the 32% rail is 259px, which
       wraps a four-word cue onto five lines. It also has 1080px of height to
       spend, so the 800px cap was letterboxing a third of the screen. */
    const tablet = !!vm.isTablet;
    const railW = vm.tightColumn ? "38%" : "32%";
    const mainW = vm.tightColumn ? "62%" : "68%";
    const capPx = tablet ? 1040 : 900;
    return `
    <div style="display:flex;flex-direction:column;background:var(--surface);border-radius:30px;box-shadow:0 18px 44px rgba(20,59,74,0.16);overflow:hidden;height:min(${capPx}px, calc(100dvh - 36px));min-height:600px;position:relative;">
      ${overlays}
      ${banner}
      <div style="display:flex;flex:1;min-height:0;">
      ${vm.railOpen ? "" : `
      <div style="width:46px;flex-shrink:0;background:var(--surface-2);border-right:1.5px solid var(--hairline);display:flex;flex-direction:column;align-items:center;padding:14px 0;gap:12px;">
        ${railToggle(true)}
        <span style="writing-mode:vertical-rl;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-faint);">${vm.progressLabel}</span>
      </div>`}
      <div style="width:${railW};flex-shrink:0;overflow-y:auto;padding:18px 16px;background:var(--surface-2);border-right:1.5px solid var(--hairline);box-sizing:border-box;display:${vm.railOpen ? "flex" : "none"};flex-direction:column;gap:14px;">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <span style="font-weight:900;font-size:12px;letter-spacing:0.06em;color:var(--ink-soft);text-transform:uppercase;">${vm.sessionDayTitle}${vm.explore ? " · Explore" : ` · <span id="s-elapsed">${vm.elapsedDisplay}</span>`}</span>
            ${railToggle(false)}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:900;color:var(--ink-soft);margin-bottom:4px;"><span>MOVES</span><span>${vm.progressLabel}</span></div>
          <div style="height:8px;background:var(--surface);border:1px solid var(--hairline);border-radius:8px;overflow:hidden;">
            <div style="width:${Math.round(vm.progressValue / vm.progressMax * 100)}%;height:100%;background:var(--mint);border-radius:8px;"></div>
          </div>
        </div>

        ${vm.showClock ? `
        <div style="flex-shrink:0;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);padding:12px 14px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:8px;box-sizing:border-box;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <span style="font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-soft);">Session time</span>
            <span style="font-weight:900;font-size:14px;color:var(--aqua-ink);"><span id="s-elapsed2">${vm.elapsedDisplay}</span> <span style="color:var(--ink-faint);font-weight:700;">/ ~${vm.sessionPlannedDisplay} · estimate</span></span>
          </div>
          <div style="height:8px;background:var(--surface-2);border-radius:8px;overflow:hidden;">
            <div id="s-sess-fill" style="width:${vm.sessionTimePct}%;height:100%;background:var(--aqua);border-radius:8px;transition:width 0.4s;"></div>
          </div>
        </div>` : ""}

        <div style="flex:1 1 auto;min-height:220px;display:flex;flex-direction:column;background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);box-shadow:var(--shadow-soft);box-sizing:border-box;padding:14px 16px;">
          <div style="font-weight:900;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;flex-shrink:0;">Today's moves</div>
          <div data-ex-list style="flex:1;min-height:0;overflow-y:auto;">${exList(vm, true, tablet)}</div>
        </div>

        ${tipsSafety(vm)}
      </div>

      <div style="${vm.railOpen ? `width:${mainW};` : "flex:1 1 0;"}min-width:0;display:flex;flex-direction:column;min-height:0;box-sizing:border-box;overflow:hidden;">
        <div style="flex:1;min-height:0;padding:${tablet ? "16px 20px" : "22px 28px"};display:flex;flex-direction:column;align-items:center;justify-content:safe center;gap:${tablet ? 10 : 14}px;box-sizing:border-box;overflow-y:auto;">
          ${centerStack(vm, true, tablet)}
        </div>
        <div style="flex:none;padding:10px 28px 12px;border-top:1.5px solid var(--hairline);background:var(--surface);display:flex;flex-direction:column;gap:12px;">
          ${controls(vm, true)}
        </div>
      </div>
      </div>
    </div>`;
  }

  // narrow
  return `
  <div style="display:flex;flex-direction:column;background:var(--surface);border-radius:24px;box-shadow:0 14px 34px rgba(20,59,74,0.16);overflow:hidden;min-height:640px;position:relative;">
    ${overlays}
    ${banner}
    <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto;box-sizing:border-box;">
      <div style="padding:14px 16px 0;flex-shrink:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-weight:900;font-size:12px;letter-spacing:0.06em;color:var(--ink-soft);text-transform:uppercase;">${vm.sessionDayTitle}${vm.explore ? ` · ${vm.progressLabel}` : ` · <span id="s-elapsed">${vm.elapsedDisplay}</span> / ~${vm.sessionPlannedDisplay} · estimate`}</span>
        </div>
        <div style="height:8px;background:var(--surface-2);border-radius:8px;overflow:hidden;">
          <div id="s-sess-fill" style="width:${vm.explore ? Math.round(vm.progressValue / vm.progressMax * 100) : vm.sessionTimePct}%;height:100%;background:var(--aqua);border-radius:8px;"></div>
        </div>
      </div>

      <div style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px;flex-shrink:0;">
        ${centerStack(vm, false, false)}
      </div>

      <div style="flex-shrink:0;padding:0 16px 14px;display:flex;flex-direction:column;gap:16px;">
        ${controls(vm, false)}
      </div>

      <div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:10px;">
        ${tipsSafety(vm)}
        <div class="list-wrap" style="background:var(--surface);border:1.5px solid var(--hairline);border-radius:var(--radius-lg);padding:12px 14px;--fade-to:var(--surface);">
          <div style="font-weight:900;font-size:11px;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;">Today's moves</div>
          <div data-list data-ex-list style="max-height:46vh;">${exList(vm, false, false)}</div>
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
  const sf = document.getElementById("s-sess-fill");
  if (sf) sf.style.width = vm.sessionTimePct + "%";
  const arc = document.getElementById("s-ring-arc");
  if (arc) {
    const c = Number(arc.getAttribute("stroke-dasharray"));
    arc.setAttribute("stroke-dashoffset", String(c * (1 - Math.max(0, Math.min(1, vm.timerProgress)))));
    if (vm.timerUrgent) arc.setAttribute("stroke", "var(--stop)");
  }
}
