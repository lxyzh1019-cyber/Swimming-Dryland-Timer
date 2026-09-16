/* ============================================================
   Which layout a viewport gets. Pure, so the breakpoint is a thing a test
   can ask about rather than a line that only runs in a browser.

   It used to be `width >= 900 && width > height`, which is every desktop and
   every tablet ON ITS SIDE — and so every iPad HELD UPRIGHT (744-1024px wide
   but taller than it is wide) fell through to the phone layout: phone type
   stretched across a tablet, with the exercise list run out full-length at
   the bottom of a four-thousand-pixel page.

   Two clauses, because "wide" is two different shapes:
   - a landscape screen at least 900px across (desktop, tablet on its side,
     and a phone on its side, which is how it has always behaved), and
   - a TALL screen at least 740px across (every iPad upright, down to the
     mini's 744; a phone is 430 at the widest and never qualifies).

   `isTablet` is the second shape's problem: wide enough for two columns, not
   wide enough for the desktop's proportions. It buys the rail more of the
   width and the ring a little less of it.
   ============================================================ */

export const TABLET_MIN_W = 740;   // iPad mini upright is 744
export const TABLET_MIN_H = 1000;  // ... and 1133 tall; a phone never is
export const WIDE_MIN_W   = 900;
export const ROOMY_MIN_W  = 1100;  // above this, the desktop proportions fit

export function layoutFor(w, h) {
  const landscape = w >= WIDE_MIN_W && w > h;
  const uprightTablet = w >= TABLET_MIN_W && h >= TABLET_MIN_H;
  const isWide = landscape || uprightTablet;
  /* Two columns, but the right-hand one is only ~500px — phone-sized. The same
     reasoning that takes the form photo off a phone applies here: at this width
     the picture and the clock each get half of not-very-much, and the cue under
     the ring wraps to three lines with dead space beside it. The photo is one
     tap away on the ⓘ, and the countdown is what the screen is for. */
  const tightColumn = isWide && w < WIDE_MIN_W;
  return { isWide, isTablet: isWide && w < ROOMY_MIN_W, tightColumn };
}
