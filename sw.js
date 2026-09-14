/* This app's service worker. The worker itself is the shared core's, in
   core/sw-core.js; this file only says what is specific to this app and hands
   it over on a global, because a worker has no module imports.

   BUMP `version` ON EVERY RELEASE — it is what retires the old cache. */
self.SW_APP = {
  cachePrefix: "splash-",
  version: "v5",
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
    "./assets/apple-touch-icon.png"
  ]
};
importScripts("core/sw-core.js");
