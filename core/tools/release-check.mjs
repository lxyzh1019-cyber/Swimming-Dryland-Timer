/* THE VERSION MOVES WHEN THE SHELL DOES. The service worker precaches a list
   of files and retires the old cache only when `version` in sw.js changes.
   The comment above it says "bump on every release", and nothing checked. A
   shell file changed without a bump is an app that keeps booting from the
   stale shell on every device that already has it — the one failure that
   never shows up on the developer's own machine.

   Usage: node core/tools/release-check.mjs <base-ref>     (CI, on pull requests)
   Exits non-zero when a precached file differs from the base and the version
   does not. Run from either app; the core half of the list is the same file. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = process.argv[2] || "origin/main";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

const list = (src, re) => [...((src.match(re) || [])[1] || "").matchAll(/"(\.\/[^"]+)"/g)]
  .map(m => m[1].replace(/^\.\//, "")).filter(f => f && f !== "./" && f !== "");
const shell = new Set([
  ...list(readFileSync(path.join(root, "core", "sw-core.js"), "utf8"), /CORE_SHELL = \[([\s\S]*?)\]/),
  ...list(readFileSync(path.join(root, "sw.js"), "utf8"), /shell: \[([\s\S]*?)\]/),
  "core/sw-core.js"
]);
const version = src => ((src.match(/version:\s*"([^"]+)"/) || [])[1] || "");

let baseSw = null;
try { baseSw = git("show", base + ":sw.js"); } catch (e) { baseSw = null; }
if (baseSw === null) { console.log("release-check: no sw.js at " + base + " — nothing to compare"); process.exit(0); }

const changed = git("diff", "--name-only", base + "...HEAD").split("\n").map(s => s.trim()).filter(Boolean);
const touched = changed.filter(f => shell.has(f));
const from = version(baseSw), to = version(readFileSync(path.join(root, "sw.js"), "utf8"));

if (touched.length && from === to) {
  console.error("release-check: " + touched.length + " precached file(s) changed since " + base
    + " but sw.js version is still \"" + to + "\":\n  " + touched.join("\n  ")
    + "\nBump `version` in sw.js so devices retire the stale shell.");
  process.exit(1);
}
console.log("release-check: " + (touched.length ? touched.length + " shell file(s) changed, version " + from + " → " + to : "no shell files changed") + " — ok");
