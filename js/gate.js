/* ============================================================
   THE GROWN-UP BOUNDARY

   Everything behind the 🧑 button is a grown-up's to decide: clearing a
   severity-3 pain report, overriding the traffic light the body check produced,
   unlocking the valgus gate, restoring a prize the app marked used, writing a
   backup over live history, changing the safety and coaching settings, grading
   her form, editing the prize pool, adding or switching athletes, downloading
   everything she has ever done.

   Until now essentially none of that was protected. The Grown-up Zone had NO
   door at all — a tap on the rail button opened it — and exactly six actions
   inside asked an arithmetic question. The other seventeen asked nothing. The
   `grownupUnlocked` flag the view-model computed was read by no screen. Hiding
   controls was never the mechanism, and it would not have been enough if it
   had been: the actions are reachable directly.

   So the boundary is now two things, and the second is the real one:

     1. Entry to the Zone is gated.
     2. EVERY mutating action re-checks, whatever screen it was invoked from.

   `requireGrownup` denies by DEFAULT. Actions that are safe for a child to take
   are named in UNGATED_ACTIONS; anything not on that list is gated. An action
   added to the Grown-up Zone next month is therefore protected by omission
   rather than exposed by it, which is the failure mode this module just had.

   ---- What the secret is, and what it is honestly worth ----

   A parent-set PIN (4–8 digits), stored device-level and salted-digested, never
   exported in a backup and never mirrored to the cloud (js/store.js).

   With, deliberately, the generated arithmetic question as a "Forgot PIN"
   fallback. That fallback is only child-deterrence — a determined 10-year-old
   with a calculator gets through it — and it is here anyway, because the
   alternative is a parent locked out of the only live copy of their child's
   training history by a PIN they set once and forgot. Losing that history is a
   worse outcome than a child who finds a way to change her own rest timer.

   The unlock is held in memory only. It expires, it dies with the tab, and it
   is dropped the moment she leaves the Zone.
   ============================================================ */

import { hasGrownupPin, verifyGrownupPin, setGrownupPin,
         isValidPinFormat, PIN_MIN_DIGITS, PIN_MAX_DIGITS } from "./store.js";

export { hasGrownupPin, isValidPinFormat, PIN_MIN_DIGITS, PIN_MAX_DIGITS };

export const GATE_UNLOCK_MS = 5 * 60 * 1000;   // five minutes, then ask again

/* Actions a child may take on her own. Everything else needs a grown-up.
   Deny-by-default: adding an action here is a deliberate decision to expose it,
   and forgetting to add one only ever makes the app safer. */
export const UNGATED_ACTIONS = [
  // moving around the app
  "nav", "selectDay", "toggleBlock", "logScope", "progressScope",
  "setGuTab", "setGsScope", "formCheckMonth", "dismissStorageError",
  // her own session, start to finish
  "goSession", "startMini", "goTryIt", "exitTryIt", "tryItDetail",
  "advance", "pauseTimer", "skipEx", "stopNow", "resumeFromStop", "endFromStop",
  "askEnd", "cancelEnd", "confirmEndEarly", "pickIntent", "answerMicro",
  "pickClean", "pickWobbly", "skipFormCheck", "pickMood", "reflectWell",
  "reflectNext", "quizPick", "exitSession",
  "openDetail", "openDetailCur", "openDetailAt", "watchVideo", "closeDetail", "resumeFromDetail",
  // her body check (the two adult decisions inside it are gated by name)
  "rAnswer", "rSameYesterday", "rPickZone", "rSetZoneSev", "rClosePopup",
  "rGoBack", "rExit", "rResultCta", "rResultSecondary",
  // things she has earned
  "startQuizDeck", "answerQuizDeck", "nextQuizDeck", "exitQuizDeck",
  "openPrizeDraw", "pickPrize", "claimPrize", "redeemPrize",
  // the gate's own controls
  "cancelGate", "submitGate", "answerGate", "forgotPin", "closePrizeReview",
  "cancelRestore"
];

/* What the grown-up is being asked to approve, in their own words — shown with
   the question, so an adult handed the phone knows what they are agreeing to. */
export const GATE_REASON = {
  grownupZone:    "open the Grown-up Zone",
  severity3:      "clear a pain report that changed how she moves",
  lightOverride:  "override the light her body check produced",
  safetySettings: "change the safety settings",
  reviewPrizes:   "review the prizes marked used",
  restorePrize:   "restore a prize the app marked used",
  confirmRestore: "write a backup over her live history",
  toggleGate:     "change the jump-landing gate",
  toggleCoachVoice: "change the coaching settings",
  toggleTimerSounds: "change the coaching settings",
  setVoiceStyle:  "change the coach's voice",
  bumpRest:       "change how long her rests are",
  togglePractice: "arm Try-It, so the next run is not recorded",
  pickAthlete:    "switch to a different athlete",
  addAthlete:     "add a new athlete to this device",
  setLadderRung:  "change where she is on the independence ladder",
  saveTrackerWeek: "record her personal-best numbers",
  formCheckPass:  "record a form verdict",
  formCheckFail:  "record a form verdict",
  pickEngagement: "answer the monthly engagement check",
  repairWallet:   "repair the prize wallet",
  addPrizePoolItem: "change the prize pool",
  removePrizePoolItem: "change the prize pool",
  resetPrizePool: "reset the prize pool",
  downloadBackup: "download everything she has done",
  exportCsv:      "export her training history"
};

let unlockedAt = 0;
let challenge = null;
/* Set only by answering the fallback question correctly. It is what buys the
   right to CHOOSE a PIN — without it, "no PIN is set" would itself be the way
   in, and clearing the PIN would be a bypass rather than a recovery. */
let mayChoosePin = false;

/* Deliberately awkward for a child and trivial for an adult: a two-digit
   number times a single digit, neither of them 0, 1 or 10. */
function newChallenge(rnd = Math.random) {
  const a = 12 + Math.floor(rnd() * 87);          // 12..98
  const b = 3 + Math.floor(rnd() * 7);            // 3..9
  return { a, b, answer: a * b, question: a + " × " + b + " = ?" };
}

/* The question to put in front of the grown-up. Stable until it is answered or
   explicitly reset, so a re-render does not change the sum mid-typing. */
export function gateChallenge(rnd = Math.random) {
  if (!challenge) challenge = newChallenge(rnd);
  return { question: challenge.question };
}

export function gateUnlocked(now = Date.now()) {
  return unlockedAt > 0 && (now - unlockedAt) < GATE_UNLOCK_MS;
}

/* How the app should ask right now:
     "pin"    — a PIN is set; type it
     "math"   — the fallback question: first run, or Forgot-PIN
     "setPin" — the question has just been answered; choose the PIN

   Note the ordering. On a device with no PIN yet, the FIRST thing asked is the
   arithmetic question, not the PIN form — otherwise "no PIN is set" would be the
   easiest way in of all, and the child would simply set her own. */
export function gateMode(fallback = false) {
  if (mayChoosePin) return "setPin";
  if (fallback || !hasGrownupPin()) return "math";
  return "pin";
}

/* Unlock by PIN. A wrong PIN unlocks nothing and says nothing about why. */
export function answerPin(input, now = Date.now()) {
  if (!verifyGrownupPin(input)) return false;
  challenge = null;
  unlockedAt = now;
  return true;
}

/* Answer the fallback question. This does NOT unlock: it earns the right to
   choose a PIN, and unlocking happens when one is chosen. A wrong answer draws
   a fresh question, so the same sum cannot be brute-forced by guessing. */
export function answerGate(input) {
  if (!challenge) challenge = newChallenge();
  const given = Number(String(input).trim());
  if (!Number.isFinite(given) || given !== challenge.answer) {
    challenge = newChallenge();
    return false;
  }
  challenge = null;
  mayChoosePin = true;
  return true;
}

/* Choose the PIN and unlock in the same step, so setting one is never a dead
   end that immediately asks for it. Refused unless the fallback question has
   just been answered — which is what stops clearGrownupPin from being a way in
   rather than a way back. */
export function choosePin(pin, now = Date.now()) {
  if (!mayChoosePin) return false;
  if (!setGrownupPin(pin)) return false;      // overwrites any existing PIN
  challenge = null;
  mayChoosePin = false;
  unlockedAt = now;
  return true;
}

/* "Forgot the PIN?" — switch to the fallback question. The existing PIN is
   deliberately left in place until a new one actually replaces it: clearing it
   up front would mean cancelling here left the app with no PIN at all, which is
   a bypass, not a recovery. */
export function beginPinReset() {
  challenge = null;
  mayChoosePin = false;
}

/* Called on leaving the Grown-up Zone, and any time the unlock should end. */
export function lockGate() {
  unlockedAt = 0;
  challenge = null;
  mayChoosePin = false;
}

/* The one call every action makes. Returns true when the action may proceed;
   false means the caller must show the challenge and DO NOTHING. */
export function requireGrownup(action, now = Date.now()) {
  if (UNGATED_ACTIONS.includes(action)) return true;   // safe for a child, by name
  return gateUnlocked(now);
}
