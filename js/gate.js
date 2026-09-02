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

   A parent-set PIN (4-8 digits), stored device-level as a salted digest, never
   exported in a backup and never mirrored to the cloud (js/store.js).

   Behind it, a WebAuthn PASSKEY — Face ID, Touch ID, the device passcode — is
   what authorizes setting or resetting that PIN. It replaced a generated
   two-digit multiplication, which a 10-year-old answers in her head and which
   was authorizing both the first PIN and every reset: the PIN was worth exactly
   that sum, however carefully it was stored. js/passkey.js is candid about what
   the passkey is and is not worth (no server, so no signature verification; and
   only as strong as whose biometrics are enrolled on the device).

   The first PIN on a device with NO training history can be set freely, the way
   a device passcode is — there is nothing yet to protect and nobody to ask.
   Once she has trained even once, setting or changing the PIN needs the
   passkey. That is the case that matters: a child reaching the Zone first on a
   phone that has been in use for months, and locking her parent out of a
   history the device holds the only live copy of.

   ============================================================ */

import { hasGrownupPin, verifyGrownupPin, setGrownupPin, loadSessions,
         isValidPinFormat, PIN_MIN_DIGITS, PIN_MAX_DIGITS } from "./store.js";
import { hasPasskey, passkeySupported } from "./passkey.js";

export { hasGrownupPin, isValidPinFormat, PIN_MIN_DIGITS, PIN_MAX_DIGITS };

export const GATE_UNLOCK_MS = 5 * 60 * 1000;   // five minutes, then ask again

/* Actions a child may take on her own. Everything else needs a grown-up.
   Deny-by-default: adding an action here is a deliberate decision to expose it,
   and forgetting to add one only ever makes the app safer. */
export const UNGATED_ACTIONS = [
  // moving around the app. NOTE `nav` is deliberately absent: whether it is
  // child-safe depends on WHERE she is navigating, so it is decided by
  // CHILD_MAY in js/main.js. An action named in both places would be a bug.
  "selectDay", "toggleBlock", "logScope", "progressScope",
  "setGuTab", "setGsScope", "formCheckMonth", "dismissStorageError",
  // her own session, start to finish
  "goSession", "goTryIt", "exitTryIt", "tryItDetail",
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
  // the gate's own controls — these ARE the authorization, so gating them
  // would be circular. None of them mutates anything on its own.
  "cancelGate", "submitGate", "answerGate", "forgotPin", "unlockWithPasskey",
  "enrollPasskey", "closePrizeReview", "cancelRestore"
];

/* What the grown-up is being asked to approve, in their own words — shown with
   the question, so an adult handed the phone knows what they are agreeing to. */
export const GATE_REASON = {
  nav:            "open the Grown-up Zone",
  renameAthlete:  "change the athlete's name",
  restoreBackup:  "write a backup over her live history",
  forgetPasskey:  "remove the grown-up passkey from this device",
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
/* Set only by a successful passkey ceremony, or by the device having no history
   at all. It is what buys the right to CHOOSE a PIN — without it, "no PIN is
   set" would itself be the way in. */
let mayChoosePin = false;

export function gateUnlocked(now = Date.now()) {
  return unlockedAt > 0 && (now - unlockedAt) < GATE_UNLOCK_MS;
}

/* A device with no training on it yet has nothing to protect and nobody to ask,
   so the first PIN goes on the way a device passcode does. The moment there is
   history, the passkey is the only way to set or change one. */
export function isFreshDevice() { return (loadSessions() || []).length === 0; }

/* How the app should ask right now:
     "setPin"  — allowed to choose a PIN (fresh device, or the passkey just said so)
     "pin"     — a PIN is set; type it
     "passkey" — no PIN may be chosen and none is set to type, or she asked to
                 reset one: the ceremony is the only way through */
export function gateMode(wantsNewPin = false) {
  if (mayChoosePin) return "setPin";
  if (!hasGrownupPin() && isFreshDevice()) { mayChoosePin = true; return "setPin"; }
  if (wantsNewPin) return "passkey";
  return hasGrownupPin() ? "pin" : "passkey";
}

/* Why a PIN was refused — shown under the field, so "nothing happened" never
   has to be guessed at. */
export function pinRefusalReason() {
  if (!mayChoosePin) {
    return hasPasskey()
      ? "Confirm a grown-up first."
      : passkeySupported()
        ? "This device already has training on it, so setting a PIN needs a grown-up passkey. Set one up first."
        : "This device already has training on it and this browser has no passkey, so the PIN cannot be changed here. Restore a backup on a fresh device instead.";
  }
  return "A PIN is " + PIN_MIN_DIGITS + "-" + PIN_MAX_DIGITS + " digits.";
}

/* Called by the app after a successful passkey ceremony. */
export function allowPinChoice() { mayChoosePin = true; }
export function clearPinChoice() { mayChoosePin = false; }

/* Unlock by PIN. A wrong PIN unlocks nothing and says nothing about why. */
export function answerPin(input, now = Date.now()) {
  if (!verifyGrownupPin(input)) return false;
  unlockedAt = now;
  return true;
}

/* The passkey ceremony itself lives in js/passkey.js (it is async); this is
   what the app calls once it has succeeded. */
export function unlockByPasskey(now = Date.now()) { unlockedAt = now; }

/* Choose the PIN and unlock in the same step, so setting one is never a dead
   end that immediately asks for it. Refused unless a grown-up has been
   established — which is what stops "no PIN set" from being a way in. */
export function choosePin(pin, now = Date.now()) {
  if (!mayChoosePin) return false;
  if (!setGrownupPin(pin)) return false;      // overwrites any existing PIN
  mayChoosePin = false;
  unlockedAt = now;
  return true;
}

/* Called on leaving the Grown-up Zone, and any time the unlock should end. */
export function lockGate() {
  unlockedAt = 0;
  mayChoosePin = false;
}

/* The one call every action makes. Returns true when the action may proceed;
   false means the caller must show the challenge and DO NOTHING. */
export function requireGrownup(action, now = Date.now()) {
  if (UNGATED_ACTIONS.includes(action)) return true;   // safe for a child, by name
  return gateUnlocked(now);
}
