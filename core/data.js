/* The app's content, seen from the shared core.

   `core/` is sport-agnostic and byte-identical in every app built on it. What
   differs between apps — the plan, the ranks, the prizes, the readiness copy —
   lives in the app's own `js/data.js`, and the pure mechanism those tables are
   built with (the X() move factory, prescription parsing, the level curve)
   lives in `./plan.js`. This shim is the one place core reaches across the
   boundary, so no core file ever names an app. */
export * from "../js/data.js";
export * from "./plan.js";
