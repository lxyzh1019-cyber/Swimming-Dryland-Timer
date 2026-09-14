/* THE OFFLINE SHELL EXISTS. The service worker precaches a LIST of files; a
   module renamed without the list following it is a file that only fails
   offline — the one condition nobody tests by accident. Every path the core
   lists and every path the app adds must be a real file, and the two halves
   must be the only places the list lives. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const coreSrc = readFileSync(path.join(root, "core", "sw-core.js"), "utf8");
const appSrc = readFileSync(path.join(root, "sw.js"), "utf8");
const list = (src, re) => [...((src.match(re) || [])[1] || "").matchAll(/"(\.\/[^"]+)"/g)].map(m => m[1]);
const coreShell = list(coreSrc, /CORE_SHELL = \[([\s\S]*?)\]/);
const appShell = list(appSrc, /shell: \[([\s\S]*?)\]/);
ok(coreShell.length > 20, "the core lists its own shell (" + coreShell.length + " files)");
ok(appShell.length >= 5, "the app lists its own files (" + appShell.length + ")");
for (const f of [...coreShell, ...appShell]) {
  if (f === "./") continue;
  ok(existsSync(path.join(root, f)), "shell file exists on disk: " + f);
}
ok(/importScripts\("core\/sw-core\.js"\)/.test(appSrc), "the app's worker hands over to the core's");
ok(/cachePrefix: "[a-z]+-"/.test(appSrc) && /version: "v\d+"/.test(appSrc), "the app names its cache prefix and version");
ok(!/firebase\.js/.test(coreSrc.split("CORE_SHELL")[1].split("]")[0]), "firebase.js is never precached");
console.log("✓ offline shell passed (" + passed + " assertions)");
