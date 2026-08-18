/* ============================================================
   SYNC — keep this device and the cloud mirror in agreement.

   The mirror used to be write-only: sessions went up and nothing
   ever read them, so a cleared localStorage (Safari evicts it
   after ~7 idle days) wiped everything the kid had earned while a
   full copy sat intact in the cloud. This closes that loop.

   Reading it back fixed the wipe but not the disagreement: only
   SESSIONS were mirrored, so a second device could rebuild the XP
   that came from training and nothing else, and a session that
   failed to upload lived on one device forever. (The skate app hit
   exactly this — 26 on the iPad, 18 on the desktop.)

   So a boot now does three things, all best-effort, all additive:

     1. pull    — merge in sessions this device is missing
     2. push    — upload sessions the cloud is missing
     3. journey — merge the quiz ledger and prize wallet, then
                  publish the merged result and rebuild the XP total
                  from those two shared sources

   Local-first still holds. Nothing is overwritten or deleted on
   either side; every step can only ADD.
   ============================================================ */

import { settings, mergeSessions, loadSessions, sessionKey, belongsToAthlete, athleteId,
         journeySnapshot, mergeCloudJourney, rebuildJourneyXp, logEvent } from "./store.js";

let _done = false;

/* Cap the catch-up upload so a device with a long history doesn't fire
   hundreds of writes on one boot; the rest go up on later boots. */
const BACKFILL_LIMIT = 40;

/* Runs once per app load, after the first paint. Never throws: an offline
   device, blocked Firestore rules or a mirror opt-out all just mean "nothing
   restored", and the app carries on with whatever is on the device.
   Returns { added, uploaded, xp }. */
export async function restoreFromCloud() {
  const idle = { added: 0, uploaded: 0, xp: 0 };
  if (_done) return idle;
  _done = true;
  // Mirroring off (privacy opt-out) means there is nothing of ours up there,
  // and reading would contradict the setting the grown-up chose.
  if (settings.cloudMirror === false) return idle;
  try {
    const { fsGetAll, fsAddSession, fsGetJourney, fsSaveJourney } = await import("./firebase.js");
    const me = athleteId();
    const remote = await fsGetAll();
    // The collection is shared between the athletes, so filter to this one's
    // sessions. The journey docs live here too and are skipped by kind.
    const mine = (remote || []).filter(d => d && d.kind !== "journey" && belongsToAthlete(d));

    // 1. pull
    const added = mergeSessions(mine);

    // 2. push — anything this device has that the cloud doesn't
    const remoteKeys = new Set(mine.map(sessionKey));
    const missing = loadSessions().filter(s => s.isoDate && !remoteKeys.has(sessionKey(s)));
    let uploaded = 0;
    for (const s of missing.slice(0, BACKFILL_LIMIT)) {
      if (await fsAddSession(s)) uploaded++;
    }

    // 3. journey — merge the ledger and wallet, publish the merged result for
    // the other device, then recompute the total from the two shared sources.
    // Every device that gets here lands on the same number.
    const journeyChanged = mergeCloudJourney(await fsGetJourney(me));
    await fsSaveJourney(me, journeySnapshot());
    const xp = rebuildJourneyXp();

    if (added || uploaded || journeyChanged) {
      logEvent("cloud_sync", { added, uploaded, xp });
    }
    return { added, uploaded, xp };
  } catch (e) {
    console.warn("Cloud sync skipped:", e);
    return idle;
  }
}
