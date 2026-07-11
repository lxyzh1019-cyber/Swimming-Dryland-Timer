/* ============================================================
   QUIZ DECK + PRIZE DRAW overlays — logic + markup ports.
   Quiz questions are generated from the real DAYS content
   (cue / parentWatch / fix asked three ways per move).
   ============================================================ */

import { DAYS, PRIZE_POOL } from "../data.js";
import { settings, loadQuiz, saveQuiz, logEvent, addXp, addPrize } from "../store.js";

/* ---- quiz engine (port of _movePool/_makeQ/_buildQuizDeck) ---- */
let _movePoolCache = null;
export function movePool() {
  if (_movePoolCache) return _movePoolCache;
  const seen = {}, pool = [];
  Object.values(DAYS).forEach(day => {
    const blocks = day.blocks || {}; const rec = day.recovery || [];
    [].concat(...Object.values(blocks), day.prepMenu || [], rec).forEach(ex => {
      if (!ex || !ex.name || seen[ex.name]) return; seen[ex.name] = true;
      pool.push({ name: ex.name, cue: ex.cue || "", watch: ex.parentWatch || "", fix: ex.redFlag || "", block: ex.block || "" });
    });
  });
  _movePoolCache = pool; return pool;
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makeQ(move, kind, pool) {
  const field = kind === "cue" ? "cue" : kind === "watch" ? "watch" : "fix";
  const others = pool.filter(m => m.name !== move.name && m[field]);
  const distractors = shuffle(others).slice(0, 2).map(m => m[field]);
  const correct = move[field];
  const opts = shuffle([{ t: correct, ok: true }, ...distractors.map(d => ({ t: d, ok: false }))]);
  const prompt = kind === "cue" ? ("What’s the key coaching cue for “" + move.name + "”?")
    : kind === "watch" ? ("When you do “" + move.name + "”, what should you watch out for?")
    : ("If “" + move.name + "” feels wrong, what’s the fix?");
  const tag = kind === "cue" ? "KEY CUE" : kind === "watch" ? "WATCH-OUT" : "THE FIX";
  return { move: move.name, block: move.block, kind, tag, prompt, opts,
    why: (kind === "cue" ? "Cue · " : kind === "watch" ? "👀 Watch for · " : "Fix · ") + correct };
}
export function buildQuizDeck(n = 8) {
  const pool = movePool();
  const bank = [];
  pool.forEach(m => { if (m.cue) bank.push([m, "cue"]); if (m.watch) bank.push([m, "watch"]); if (m.fix) bank.push([m, "fix"]); });
  return { qs: shuffle(bank).slice(0, n).map(([m, k]) => makeQ(m, k, pool)), idx: 0, picks: [], done: false, scored: false };
}

export function answerQuizDeck(qd, i) {
  if (!qd || qd.picks[qd.idx] != null) return;
  qd.picks[qd.idx] = i;
  const q = qd.qs[qd.idx];
  const ok = !!(q.opts[i] && q.opts[i].ok);
  // per-move mastery record (swim_quiz_v1)
  const quiz = loadQuiz();
  const item = quiz.items[q.move] || { right: 0, wrong: 0, seen: 0 };
  item.seen += 1; if (ok) item.right += 1; else item.wrong += 1;
  quiz.items[q.move] = item;
  saveQuiz(quiz);
}

export function finishQuizDeck(qd) {
  if (qd.scored) return;
  qd.scored = true;
  const score = qd.picks.reduce((s, pk, ix) => s + (pk != null && qd.qs[ix].opts[pk] && qd.qs[ix].opts[pk].ok ? 1 : 0), 0);
  const answered = qd.picks.filter(p => p != null).length;
  const quiz = loadQuiz();
  quiz.results = [...(quiz.results || []), { t: Date.now(), score, total: qd.qs.length }].slice(-40);
  quiz.streak = score === qd.qs.length ? (quiz.streak || 0) + 1 : 0;
  saveQuiz(quiz);
  logEvent("quiz_deck", { score, total: qd.qs.length });
  const xp = score * 25 + answered * 10;
  qd.xpEarned = xp;
  if (xp > 0) qd.leveledUp = addXp(xp).leveledUp;
}

/* ---- quiz deck view ---- */
export function quizDeckHtml(qd) {
  const cur = qd.qs[qd.idx] || {};
  const picked = qd.picks[qd.idx];
  const answered = picked != null;
  const score = qd.picks.reduce((s, pk, ix) => s + (pk != null && qd.qs[ix].opts[pk] && qd.qs[ix].opts[pk].ok ? 1 : 0), 0);

  if (qd.done) {
    const scoreVerdict = score >= qd.qs.length - 1 ? "Amazing! You really know your moves. 🏆"
      : score >= Math.ceil(qd.qs.length * 0.6) ? "Great job! A few to polish. 💪"
      : "Good try — now you’ve seen the answers. Run it again! 🌊";
    return `
    <div style="position:fixed;inset:0;z-index:80;background:linear-gradient(180deg,var(--aqua-wash),var(--bg));display:flex;flex-direction:column;align-items:center;padding:20px;box-sizing:border-box;overflow-y:auto;">
      <div style="width:100%;max-width:620px;display:flex;flex-direction:column;gap:16px;">
        <div style="background:var(--surface);border-radius:var(--radius-xl);box-shadow:var(--shadow-lift);padding:26px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;">
          <img src="assets/swim-marlin.png" style="width:96px;height:96px;object-fit:contain;" alt="">
          <div style="font-family:var(--font-display);font-weight:600;font-size:30px;color:var(--ink);">Quiz complete!</div>
          <div style="font-family:var(--font-display);font-weight:600;font-size:48px;color:var(--aqua);line-height:1;">${score} / ${qd.qs.length} correct</div>
          <div style="font-family:var(--font-hand);font-size:22px;font-weight:700;color:var(--aqua-ink);">${scoreVerdict}</div>
          ${qd.xpEarned ? `<div style="font-size:15px;font-weight:900;color:var(--sun-ink);background:var(--sun-wash);border-radius:var(--radius-pill);padding:7px 16px;">⭐ +${qd.xpEarned} XP</div>` : ""}
          ${qd.leveledUp ? `<button type="button" data-action="openPrizeDraw" style="min-height:52px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:0 24px;font-family:var(--font-display);font-weight:600;font-size:18px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);">🎁 Level up! Pick your prize</button>` : ""}
          <div style="width:100%;display:flex;flex-direction:column;gap:8px;margin-top:6px;text-align:left;">
            ${qd.qs.map((q, ix) => `
              <div style="display:flex;align-items:flex-start;gap:10px;background:var(--surface-2);border-radius:12px;padding:10px 12px;">
                <span style="font-size:16px;flex-shrink:0;">${qd.picks[ix] != null && q.opts[qd.picks[ix]] && q.opts[qd.picks[ix]].ok ? "✓" : "✕"}</span>
                <div>
                  <div style="font-weight:800;font-size:14px;color:var(--ink);line-height:1.35;">${q.prompt}</div>
                  <div style="font-size:13px;font-weight:700;color:var(--aqua-ink);margin-top:2px;">${q.why}</div>
                </div>
              </div>`).join("")}
          </div>
          <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;justify-content:center;">
            <button type="button" data-action="startQuizDeck" style="min-height:56px;background:var(--aqua);color:#fff;border:none;border-radius:var(--radius-pill);padding:0 26px;font-family:var(--font-display);font-weight:600;font-size:19px;cursor:pointer;box-shadow:0 5px 0 var(--aqua-deep);font-family:var(--font-display);">🔁 Play again</button>
            <button type="button" data-action="exitQuizDeck" style="min-height:56px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:0 26px;font-family:var(--font-display);font-weight:600;font-size:19px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);">🏠 Done</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  const optStyle = (o, i) => "display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:14px 16px;border-radius:16px;border:3px solid;cursor:pointer;font-weight:800;font-size:16px;font-family:inherit;box-sizing:border-box;"
    + (!answered ? "border-color:var(--hairline);background:var(--surface);color:var(--ink);"
      : o.ok ? "border-color:var(--mint);background:var(--mint-wash);color:var(--mint-ink);"
      : picked === i ? "border-color:var(--coral);background:color-mix(in srgb, var(--coral) 12%, #fff);color:var(--coral);"
      : "border-color:var(--hairline);background:var(--surface);color:var(--ink-faint);");

  return `
  <div style="position:fixed;inset:0;z-index:80;background:linear-gradient(180deg,var(--aqua-wash),var(--bg));display:flex;flex-direction:column;align-items:center;padding:20px;box-sizing:border-box;overflow-y:auto;">
    <div style="width:100%;max-width:620px;display:flex;flex-direction:column;gap:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <button type="button" data-action="exitQuizDeck" style="width:44px;height:44px;border-radius:50%;background:var(--surface);border:2px solid var(--hairline);font-size:20px;cursor:pointer;flex-shrink:0;" aria-label="Exit quiz">✕</button>
        <div style="flex:1;height:10px;background:var(--surface-2);border-radius:10px;overflow:hidden;">
          <div style="width:${Math.round(((qd.idx + (answered ? 1 : 0)) / qd.qs.length) * 100)}%;height:100%;background:var(--aqua);border-radius:10px;transition:width 0.3s;"></div>
        </div>
        <span style="font-weight:900;font-size:14px;color:var(--ink-soft);flex-shrink:0;">${qd.idx + 1}/${qd.qs.length}</span>
      </div>

      <div style="background:var(--surface);border-radius:var(--radius-xl);box-shadow:var(--shadow-lift);padding:24px;display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:11px;font-weight:900;letter-spacing:0.06em;background:var(--aqua-wash);color:var(--aqua-ink);border-radius:var(--radius-pill);padding:5px 12px;">${cur.tag}</span>
          <span style="font-size:13px;font-weight:800;color:var(--ink-soft);">${cur.move}</span>
        </div>
        <div style="font-family:var(--font-display);font-weight:600;font-size:23px;color:var(--ink);line-height:1.25;">${cur.prompt}</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${(cur.opts || []).map((o, i) => `
            <button type="button" data-action="answerQuizDeck" data-arg="${i}" style="${optStyle(o, i)}">
              <span style="width:28px;height:28px;border-radius:50%;background:var(--surface-2);display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;flex-shrink:0;">${answered ? (o.ok ? "✓" : (picked === i ? "✕" : "")) : String.fromCharCode(65 + i)}</span>
              <span style="flex:1;">${o.t}</span>
            </button>`).join("")}
        </div>
        ${answered ? `
        <div style="background:var(--aqua-wash);border-radius:14px;padding:13px 15px;">
          <div style="font-weight:900;font-size:15px;color:var(--aqua-ink);">${cur.why}</div>
        </div>
        <button type="button" data-action="nextQuizDeck" style="min-height:56px;background:var(--aqua);color:#fff;border:none;border-radius:var(--radius-pill);padding:0 26px;font-family:var(--font-display);font-weight:600;font-size:19px;cursor:pointer;box-shadow:0 5px 0 var(--aqua-deep);align-self:flex-end;">Next →</button>` : ""}
      </div>
    </div>
  </div>`;
}

/* ---- prize draw ---- */
export function newPrizeDraw() {
  const pool = (Array.isArray(settings.prizePool) && settings.prizePool.length) ? settings.prizePool : PRIZE_POOL;
  return { cards: shuffle(pool).slice(0, 3), picked: null };
}

export function claimPrize(pd) {
  if (!pd || pd.picked == null) return null;
  const won = pd.cards[pd.picked];
  logEvent("prize_won", { label: won.label });
  return addPrize(won);
}

export function prizeDrawHtml(pd) {
  const hasPicked = pd.picked != null;
  return `
  <div style="position:fixed;inset:0;z-index:85;background:rgba(20,59,74,0.55);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;">
    <div style="background:var(--surface);border-radius:var(--radius-xl);box-shadow:var(--shadow-pop);padding:26px;width:100%;max-width:540px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;">
      <div style="font-size:11px;font-weight:900;letter-spacing:0.08em;color:var(--sun-ink);background:var(--sun-wash);border-radius:var(--radius-pill);padding:6px 14px;">🎉 LEVEL UP REWARD</div>
      <div style="font-family:var(--font-display);font-weight:600;font-size:28px;color:var(--ink);line-height:1.1;">Pick a prize envelope!</div>
      ${hasPicked ? `<div style="font-family:var(--font-hand);font-size:22px;font-weight:700;color:var(--aqua-ink);">You picked — enjoy it! 🌟</div>` : ""}
      <div style="display:flex;gap:12px;width:100%;justify-content:center;flex-wrap:wrap;">
        ${pd.cards.map((c, i) => {
          const revealed = pd.picked === i;
          const dim = hasPicked && !revealed ? "opacity:0.45;" : "";
          return `
          <button type="button" data-action="pickPrize" data-arg="${i}" style="width:140px;height:170px;border-radius:20px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px;box-sizing:border-box;transition:transform 0.2s;border:3px solid ${revealed ? "var(--sun)" : "var(--hairline)"};background:${revealed ? "var(--sun-wash)" : "var(--aqua-wash)"};${dim}font-family:inherit;">
            ${revealed
              ? `<span style="font-size:46px;line-height:1;">${c.icon}</span><span style="font-size:14px;font-weight:900;color:var(--ink);line-height:1.25;">${c.label}</span>`
              : `<span style="font-size:46px;line-height:1;">✉️</span><span style="font-size:13px;font-weight:900;color:var(--ink-soft);">Tap to open</span>`}
          </button>`;
        }).join("")}
      </div>
      ${hasPicked ? `<button type="button" data-action="claimPrize" style="min-height:56px;background:var(--sun);color:var(--sun-ink);border:none;border-radius:var(--radius-pill);padding:0 34px;font-family:var(--font-display);font-weight:600;font-size:20px;cursor:pointer;box-shadow:0 5px 0 var(--sun-deep);">Add to my prizes ⭐</button>` : ""}
    </div>
  </div>`;
}
