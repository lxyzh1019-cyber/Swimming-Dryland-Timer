/* ============================================================
   SERVICE WORKER — the app shell, so a locked front door is not a
   locked app.

   "Works fully offline" used to rest entirely on the browser's HTTP cache
   after a successful online load. That is not a promise anyone can keep: iOS
   evicts a home-screen web app's cache after a stretch of not being opened,
   and a kid tapping the icon in a car on the way to practice got a blank page
   and no explanation. Everything the app NEEDS to run is a fixed, small set of
   files that never change between releases, so they are cached at install and
   served from there first.

   THE RULES THIS FILE KEEPS:

     · Only the shell is cached — the app's own HTML, CSS, JS, fonts and
       images. Nothing from Firestore, ever. The mirror carries body-map notes
       and readiness answers, and a shared cache is the wrong place for those;
       it would also serve a stale copy of data whose whole point is being
       current. Requests that are not same-origin GETs go straight to the
       network and are never stored.

     · The cache is VERSIONED, and activating a new version deletes every older
       one OF THIS APP'S. A half-updated app — new JS against an old HTML — is a
       class of bug nobody can debug from a bug report by a ten-year-old. But
       Cache Storage is per ORIGIN, not per app, and this is deployed to GitHub
       Pages: "delete every key that is not mine" was deleting the caches of
       whatever else lives on the same origin. Only keys under this app's own
       prefix are ever touched.

     · Cache-first for the shell, because the shell is what has to work with no
       network at all; a release changes CACHE_VERSION, which fetches the lot
       again on the next load.

   BUMP THE VERSION IN THE APP'S sw.js ON EVERY RELEASE. Nothing here needs touching.
   ============================================================ */

/* This file is the shared core's worker and is byte-identical in every app
   built on it. The app registers its own sw.js, which sets self.SW_APP —
   the cache prefix, the version and the app-owned files — and then
   importScripts() this one. A service worker has no module imports, so the
   hand-off is a global by design. */
const APP = self.SW_APP || {};

/* One prefix, so activation can tell this app's caches apart from a neighbour's
   on the same origin — see the activate handler. Every version name starts
   with it. BUMP THE VERSION (in the app's sw.js), NEVER THE PREFIX. */
const CACHE_PREFIX = APP.cachePrefix || "dryland-";
const CACHE_VERSION = CACHE_PREFIX + (APP.version || "v0");

/* Everything needed to boot and run a whole workout with no network. Listed
   rather than discovered: a service worker cannot read a directory, and a
   silent miss here is a file that only fails offline — the one condition
   nobody tests by accident. The core's own files are listed here; the app
   adds its CSS, content, config and icons in its sw.js. */
const CORE_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",

  "./core/main.js",
  "./core/engine.js",
  "./core/store.js",
  "./core/outcome.js",
  "./core/plan.js",
  "./core/data.js",
  "./core/sport.js",
  "./core/util.js",
  "./core/layout.js",
  "./core/audio.js",
  "./core/effort.js",
  "./core/gate.js",
  "./core/passkey.js",
  "./core/backup.js",
  "./core/sync.js",
  "./core/screens/shell.js",
  "./core/screens/today.js",
  "./core/screens/session.js",
  "./core/screens/readiness.js",
  "./core/screens/progress.js",
  "./core/screens/grownup.js",
  "./core/screens/overlays.js",
  "./core/vm/today.js",
  "./core/vm/session.js",
  "./core/vm/readiness.js",
  "./core/vm/progress.js",
  "./core/vm/grownup.js"
];
const SHELL = CORE_SHELL.concat(Array.isArray(APP.shell) ? APP.shell : []);

/* core/firebase.js is deliberately NOT in the list. It is imported dynamically
   and only when the mirror is on, it pulls the SDK off the network anyway, and
   an offline launch must not wait on it to start a workout. */

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    /* One at a time rather than cache.addAll: addAll rejects the whole install
       if any single file 404s, which would leave the app with no worker at all
       over one renamed image. A file that fails here simply falls through to
       the network later. */
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: "reload" })); }
      catch (e) { console.warn("[sw] shell miss:", url, e && e.message); }
    }));
    // The point of a new version is to BE the new version.
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Ours, and older than this one. A key belonging to another project on the
    // same origin is none of this worker's business.
    await Promise.all(keys.map(k =>
      (k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Cross-origin is the cloud mirror, the Firebase SDK and the weather call.
  // None of it belongs in a shell cache — see the rules at the top.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      /* Fill in the shell's own files as they are asked for — an exercise photo
         opened for the first time online is then there the next time she is on
         a deck with no signal. Only same-origin successes, and only basic
         responses: an opaque one has an unknown status and could poison the
         cache with an error page. */
      if (res && res.ok && res.type === "basic") {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      /* Offline and not in the cache. For a navigation that means the shell
         itself: hand back index.html so the app boots and can say what it
         knows, rather than the browser's dinosaur. */
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
