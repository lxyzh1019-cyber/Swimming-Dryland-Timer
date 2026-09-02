/* ============================================================
   GROWN-UP GATE

   Some decisions in this app are a grown-up's to make: clearing a severity-3
   pain report, overriding the traffic light the body check produced, unlocking
   the valgus gate, restoring a prize the app marked used, restoring a backup
   over the top of live history, and changing the safety and coaching settings.

   Until now there was nothing at all in the way of any of them. The pain
   severity-3 confirmation was a plain checkbox on the child's own screen — the
   app asked "has a grown-up said this is OK?" and accepted the answer from
   whoever was holding the phone, which is the one person it was not asking.

   This is a CHILD-DETERRENCE gate, and it is deliberately not more than that.
   A generated arithmetic question is enough to stop a 10-year-old acting as her
   own adult, and it has properties a PIN does not: there is nothing to set up,
   nothing to forget, nothing stored on the device, nothing to sync between
   devices, and nothing that could leak in a backup or an export. A parent who
   can do two-digit multiplication is always already enrolled.

   The unlock is held in memory only. It expires, and it dies with the tab.
   ============================================================ */

export const GATE_UNLOCK_MS = 5 * 60 * 1000;   // five minutes, then ask again

/* The actions a grown-up has to be present for. */
export const GATED_ACTIONS = [
  "severity3",        // clearing a "changed how she moves" pain report
  "lightOverride",    // manually overriding the readiness result
  "valgusGate",       // unlocking / relocking the jump progression
  "prizeRepair",      // restoring a prize the app marked used
  "backupRestore",    // writing a backup over live history
  "safetySettings"    // safety + coaching settings
];

/* What the grown-up is being asked to approve, in their own words — shown with
   the question, so an adult handed the phone knows what they are agreeing to. */
export const GATE_REASON = {
  severity3: "clear a pain report that changed how she moves",
  lightOverride: "override the light her body check produced",
  valgusGate: "change the jump-landing gate",
  prizeRepair: "restore a prize the app marked used",
  backupRestore: "write a backup over her live history",
  safetySettings: "change the safety settings"
};

let unlockedAt = 0;
let challenge = null;

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

/* Returns true if the answer was right. A wrong answer draws a fresh question
   so the same one cannot be brute-forced by repeated guessing. */
export function answerGate(input, now = Date.now()) {
  if (!challenge) return false;
  const given = Number(String(input).trim());
  if (!Number.isFinite(given) || given !== challenge.answer) {
    challenge = newChallenge();
    return false;
  }
  challenge = null;
  unlockedAt = now;
  return true;
}

/* Called on leaving the Grown-up Zone, and any time the unlock should end. */
export function lockGate() {
  unlockedAt = 0;
  challenge = null;
}

/* The one call every gated action makes. Returns true when the action may
   proceed; false means the caller must show the challenge and do nothing. */
export function requireGrownup(action, now = Date.now()) {
  if (!GATED_ACTIONS.includes(action)) return true;   // ungated by design
  return gateUnlocked(now);
}
