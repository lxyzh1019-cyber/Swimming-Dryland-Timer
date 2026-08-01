/* ============================================================
   SYNC — pull the Firestore mirror back down.

   The mirror used to be write-only: sessions went up and nothing
   ever read them, so a cleared localStorage (Safari evicts it
   after ~7 idle days) wiped everything the kid had earned while a
   full copy sat intact in the cloud. This closes that loop.

   Local-first still holds: the cloud can only ADD sessions the
   device doesn't have. Nothing local is overwritten or deleted.
   ============================================================ */

import { settings, mergeSessions, reconcileJourneyWithSessions, belongsToAthlete, logEvent } from "./store.js";

let _done = false;

/* Runs once per app load, after the first paint. Never throws: an offline
   device, blocked Firestore rules or a mirror opt-out all just mean "nothing
   restored", and the app carries on with whatever is on the device.
   Returns { added, xpAdded }. */
export async function restoreFromCloud() {
  if (_done) return { added: 0, xpAdded: 0 };
  _done = true;
  // Mirroring off (privacy opt-out) means there is nothing of ours up there,
  // and reading would contradict the setting the grown-up chose.
  if (settings.cloudMirror === false) return { added: 0, xpAdded: 0 };
  try {
    const { fsGetAll } = await import("./firebase.js");
    const remote = await fsGetAll();
    const mine = (remote || []).filter(belongsToAthlete);
    const added = mergeSessions(mine);
    const xpAdded = added ? reconcileJourneyWithSessions() : 0;
    if (added) logEvent("cloud_restore", { added, xpAdded });
    return { added, xpAdded };
  } catch (e) {
    console.warn("Cloud restore skipped:", e);
    return { added: 0, xpAdded: 0 };
  }
}
