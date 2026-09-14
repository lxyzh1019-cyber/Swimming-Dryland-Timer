/* The app's identity, seen from the shared core: names, storage keys, the
   Firestore collection, illustrations and the handful of copy lines that say
   which sport this is. Every value is defined once, in the app's own
   `js/sport.js`; this shim is how core reads it without naming an app. */
export * from "../js/sport.js";
