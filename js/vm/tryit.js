/* ============================================================
   TRY-IT view-model — the explore mode, with no workout in it.

   Try-It used to run the whole session engine: Body Check, the
   traffic light, rounds, timers, progression, the clean-check,
   even a finish screen. The only sign it wasn't real was a
   banner, so a kid could complete an entire workout that was
   never going to count. "Let me look at the moves" is not a
   workout, and it should never have needed a state machine.

   So this is a list. Tap a move, read how to do it, watch the
   video, come back. No timer, no rounds, no Body Check, no
   record, no XP, nothing to finish.
   ============================================================ */

import { DAYS, BLOCK_ORDER, BLOCK_LABEL, exDose, videoSearchUrl, channelForBlock } from "../data.js";
import { exercisePhotoUrl } from "../util.js";

/* Every move in a day, flat and in the order she would meet them. Unlike the
   session assembly this includes prepMenu — in Try-It there is nothing to
   assemble, so nothing should be hidden. */
export function tryItMoves(dayKey) {
  const day = DAYS[dayKey];
  if (!day) return [];
  if (day.spa) {
    return (day.recovery || []).concat(day.recoveryHolds || []).map(ex => ({
      ...ex, blockLabel: "Recovery", block: "recovery"
    }));
  }
  const out = [];
  BLOCK_ORDER.forEach(bk => {
    (day.blocks[bk] || []).forEach(ex => out.push({ ...ex, blockLabel: BLOCK_LABEL[bk] || bk }));
    if (bk === "main") {
      (day.prepMenu || []).forEach(ex => out.push({ ...ex, blockLabel: BLOCK_LABEL.prep || "Prep" }));
    }
  });
  return out;
}

export function buildTryItVM(state) {
  const dayKey = state.tryIt || state.selectedDay;
  const day = DAYS[dayKey] || {};
  const moves = tryItMoves(dayKey).map((ex, i) => ({
    idx: i,
    name: ex.name,
    blockLabel: ex.blockLabel,
    dose: exDose(ex) || ex.dose || "",
    cue: ex.cue || "",
    photoUrl: exercisePhotoUrl(ex.name, "Timer"),
    channel: (channelForBlock(ex.block) || {}).label || "",
    videoUrl: videoSearchUrl(ex)
  }));
  const de = state.detailEx || {};
  return {
    isWide: state.isWide, isNarrow: !state.isWide,
    dayKey,
    dayTitle: day.title || "Today",
    daySubtitle: day.theme || day.subtitle || "",
    moves, moveCount: moves.length,
    detailOverlay: state.detailOverlay,
    detailName: de.name || "", detailDose: exDose(de) || de.dose || "",
    detailCue: de.cue || "",
    detailWatchFor: de.parentWatch || "", detailFix: de.redFlag || "",
    detailSwim: de.swimTransfer || "",
    // 39 timer photos exist in the repo and zero demo photos, so asking for a
    // demo image guaranteed the placeholder on every single move.
    detailPhotoUrl: exercisePhotoUrl(de.name, "Timer"),
    detailVideoUrl: videoSearchUrl(de),
    // Nothing here pauses, because nothing here is running.
    detailShowResume: false
  };
}
