/* ============================================================
   FIREBASE — Firestore mirror for completed sessions.
   The CDN modules are loaded lazily inside a catch so the app
   still boots and saves locally when offline.
   ============================================================ */

import { SESSIONS_COLLECTION } from "./sport.js";
const SESSIONS_COL = SESSIONS_COLLECTION; // dedicated collection for this app

let _fbPromise = null;
function fb() {
  if (!_fbPromise) {
    _fbPromise = (async () => {
      const { initializeApp } =
        await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const fs =
        await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const app = initializeApp({
        apiKey:            "AIzaSyBvasH4OqU76196ZmZSXX_e8-L2PYnvyaY",
        authDomain:        "chore-tracker-a461b.firebaseapp.com",
        projectId:         "chore-tracker-a461b",
        storageBucket:     "chore-tracker-a461b.firebasestorage.app",
        messagingSenderId: "282740057913",
        appId:             "1:282740057913:web:72defcf2e53ae13237eae8"
      });
      return { db: fs.getFirestore(app), ...fs };
    })().catch(e => {
      console.warn("Firebase unavailable (offline?):", e);
      // Not remembered: the network can come back while the app is open, and a
      // single failed load must not make the mirror unreachable for the rest
      // of the session.
      _fbPromise = null;
      return null;
    });
  }
  return _fbPromise;
}

/* WHAT "NOTHING CAME BACK" MEANS ------------------------------------------
   Every helper here swallowed its own failure and handed back a neutral value
   — null, [], false — so "the mirror answered and holds nothing" and "we never
   reached the mirror at all" were the same answer. The boot sync read that as
   reached-and-empty on a device with no network, which is two real failures:
   a wiped iPad was offered a fresh grown-up PIN with none of the warning the
   gate has for exactly that case, and every boot stamped a successful sync
   time, so prize draws waited on a second device that was never asked.

   A READ that could not be made now throws this. Writes keep their
   fire-and-forget shape — a write that did not land is not evidence about the
   connection, and the next boot backfills it. */
export class MirrorUnreachable extends Error {
  constructor(cause) {
    super("The cloud mirror could not be reached.");
    this.name = "MirrorUnreachable";
    this.cause = cause;
  }
}

/* ---- Fire-and-forget Firestore helpers ---- */
// Returns the new doc ID (or null on failure) — caller decides whether to store it
export async function fsAddSession(entry) {
  const f = await fb();
  if (!f) return null;
  try {
    const ref = await f.addDoc(f.collection(f.db, SESSIONS_COL), {
      ...entry,
      createdAt: f.serverTimestamp()
    });
    return ref.id;
  } catch (e) {
    console.warn("Firestore write failed:", e);
    return null;
  }
}

export async function fsUpdateSession(fsId, patch) {
  if (!fsId) return;
  const f = await fb();
  if (!f) return;
  try {
    await f.updateDoc(f.doc(f.db, SESSIONS_COL, fsId), patch);
  } catch (e) {
    console.warn("Firestore update failed:", e);
  }
}

/* ---- journey mirror --------------------------------------------------------
   Sessions were the only thing ever mirrored, so a second device could rebuild
   the training log but not the quiz ledger or the prize wallet — two devices
   therefore showed two different levels for the same kid (the skate app hit
   exactly this: 26 on the iPad, 18 on the desktop). This doc carries what the
   session log cannot re-derive. It lives in the same collection so it needs no
   new Firestore rule, is tagged kind:"journey" so the session readers skip it,
   and is keyed per athlete because this collection is shared between them. */
const journeyDocId = (athlete) => "journey-" + String(athlete || "legacy");

export async function fsSaveJourney(athlete, snapshot) {
  const f = await fb();
  if (!f) return false;
  try {
    await f.setDoc(f.doc(f.db, SESSIONS_COL, journeyDocId(athlete)),
                   { ...snapshot, athlete, savedAt: f.serverTimestamp() });
    return true;
  } catch (e) {
    console.warn("Journey mirror write failed:", e);
    return false;
  }
}

export async function fsGetJourney(athlete) {
  const f = await fb();
  if (!f) throw new MirrorUnreachable();
  try {
    const snap = await f.getDoc(f.doc(f.db, SESSIONS_COL, journeyDocId(athlete)));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Journey mirror read failed:", e);
    throw new MirrorUnreachable(e);
  }
}

/* ---- readiness mirror ------------------------------------------------------
   The body map was a control and never a record: one saved check, overwritten
   the next morning. Now that it IS a record, the abnormal ones have to reach
   the grown-up's other device — and crucially they must do so whether or not a
   session follows. A Red or Recovery morning she does not go on to train
   produces no session document at all, so riding the session mirror would have
   dropped exactly the check most worth seeing.

   Same collection, so no new Firestore rule; tagged kind:"readiness" so the
   session readers skip it; keyed per athlete because the collection is shared.
   All-green checks are never sent — they stay on the device that wrote them. */
const readinessDocId = (athlete) => "readiness-" + String(athlete || "legacy");

export async function fsSaveReadiness(athlete, rows) {
  const f = await fb();
  if (!f) return false;
  try {
    await f.setDoc(f.doc(f.db, SESSIONS_COL, readinessDocId(athlete)),
                   { kind: "readiness", athlete, checks: rows, savedAt: f.serverTimestamp() });
    return true;
  } catch (e) {
    console.warn("Readiness mirror write failed:", e);
    return false;
  }
}

export async function fsGetReadiness(athlete) {
  const f = await fb();
  if (!f) throw new MirrorUnreachable();
  try {
    const snap = await f.getDoc(f.doc(f.db, SESSIONS_COL, readinessDocId(athlete)));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Readiness mirror read failed:", e);
    throw new MirrorUnreachable(e);
  }
}

export async function fsGetRecent(n = 7) {
  const f = await fb();
  if (!f) throw new MirrorUnreachable();
  try {
    const q = f.query(f.collection(f.db, SESSIONS_COL), f.orderBy("createdAt", "desc"), f.limit(n));
    const snap = await f.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Firestore read failed:", e);
    throw new MirrorUnreachable(e);
  }
}

/* The reachability probe as well as the pull: an empty array from here means
   the mirror answered and holds nothing for this collection, and nothing else. */
export async function fsGetAll() {
  const f = await fb();
  if (!f) throw new MirrorUnreachable();
  try {
    const q = f.query(f.collection(f.db, SESSIONS_COL), f.orderBy("createdAt", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Firestore read failed:", e);
    throw new MirrorUnreachable(e);
  }
}
