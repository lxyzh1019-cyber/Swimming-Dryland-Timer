/* This app's service worker. The worker itself is the shared core's, in
   core/sw-core.js; this file only says what is specific to this app and hands
   it over on a global, because a worker has no module imports.

   BUMP `version` ON EVERY RELEASE — it is what retires the old cache. */
self.SW_APP = {
  cachePrefix: "splash-",
  version: "v21",
  /* The files that are this app's own, on top of the core shell. */
  shell: [
    "./css/fonts.css",
    "./css/tokens/colors.css",
    "./css/tokens/typography.css",
    "./css/tokens/spacing.css",
    "./css/app.css",
    "./js/data.js",
    "./js/sport.js",
    "./assets/icon-192.png",
    "./assets/icon-512.png",
    "./assets/apple-touch-icon.png",
    /* THE FACES AND THE LETTERS, TOO. A cold Add-to-Home-Screen launch opened
       offline used to boot in system fonts with every picture missing: the
       fonts, the mascot, the body maps and every pose were reached only by the
       runtime cache-on-fetch, which has nothing in it until a first ONLINE
       view. They are also release-checked now, so replacing a pose without
       bumping the version below can no longer leave devices on the old one. */
    "./assets/fonts/caveat-latin.woff2",
    "./assets/fonts/fredoka-latin.woff2",
    "./assets/fonts/nunito-latin.woff2",
    "./assets/swim-marlin.webp",
    "./assets/swim-marlin.png",
    "./assets/swimmer-face.webp",
    "./assets/swimmer-face.png",
    "./assets/swimmer-front.webp",
    "./assets/swimmer-front.png",
    "./assets/swimmer-back.webp",
    "./assets/swimmer-back.png",
    "./assets/poses/welcome.webp",
    "./assets/poses/welcome.png",
    "./assets/poses/greatwork.webp",
    "./assets/poses/greatwork.png",
    "./assets/poses/celebrate.webp",
    "./assets/poses/celebrate.png",
    "./assets/poses/keepgoing.webp",
    "./assets/poses/keepgoing.png",
    "./assets/poses/breath.webp",
    "./assets/poses/breath.png",
    "./assets/poses/think.webp",
    "./assets/poses/think.png",
    "./assets/poses/seeyou.webp",
    "./assets/poses/seeyou.png",
    "./assets/poses/remember.webp",
    "./assets/poses/remember.png"
  ]
};
importScripts("core/sw-core.js");
