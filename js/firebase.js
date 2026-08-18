/* ============================================================
   FIREBASE — Firestore mirror for completed sessions.
   The CDN modules are loaded lazily inside a catch so the app
   still boots and saves locally when offline.
   ============================================================ */

const SESSIONS_COL = "jess_swimming_sessions"; // dedicated collection for this app

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
      return null;
    });
  }
  return _fbPromise;
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
  if (!f) return null;
  try {
    const snap = await f.getDoc(f.doc(f.db, SESSIONS_COL, journeyDocId(athlete)));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Journey mirror read failed:", e);
    return null;
  }
}

export async function fsGetRecent(n = 7) {
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, SESSIONS_COL), f.orderBy("createdAt", "desc"), f.limit(n));
    const snap = await f.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Firestore read failed:", e);
    return [];
  }
}

export async function fsGetAll() {
  const f = await fb();
  if (!f) return [];
  try {
    const q = f.query(f.collection(f.db, SESSIONS_COL), f.orderBy("createdAt", "asc"));
    const snap = await f.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Firestore read failed:", e);
    return [];
  }
}
