/* THE OFFLINE SHELL EXISTS. The service worker precaches a LIST of files; a
   module renamed without the list following it is a file that only fails
   offline — the one condition nobody tests by accident. Every path the core
   lists and every path the app adds must be a real file, and the two halves
   must be the only places the list lives. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
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

/* ...AND THE LIST IS COMPLETE. Everything above proves each listed path is a
   real file. It says nothing about the other direction, and the other direction
   is the one that bites: core/layout.js was added, imported by core/main.js,
   and left off the list. It loads perfectly every time there is a network, and
   breaks a cold offline launch OUTRIGHT — a static import that 404s fails the
   whole module graph, so the app does not come up at all. Renaming a module is
   the case the list was written for; ADDING one is the case nobody remembers.
   So walk the graph from the entry module and insist the list covers every
   in-repo file it reaches. The middle of the pattern cannot cross a semicolon,
   which is what keeps a multi-line `import { a, b } from "..."` in and an
   `export const x = 1;` out. A dynamic `import(...)` has no `from` and is
   deliberately not matched — core/firebase.js is reached only that way. */
const listed = new Set([...coreShell, ...appShell]);
const walked = new Set();
const walk = (rel) => {
  if (walked.has(rel)) return;
  walked.add(rel);
  const src = readFileSync(path.join(root, rel), "utf8");
  const dir = path.posix.dirname(rel);
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;            // a bare specifier is not ours to cache
    const target = path.posix.normalize(path.posix.join(dir, spec));
    if (target.startsWith("..")) continue;          // outside the app
    ok(listed.has("./" + target), "precached: " + target + " (imported by " + rel + ")");
    walk(target);
  }
};
walk("core/main.js");
ok(walked.size > 15, "the walk reached the whole module graph (" + walked.size + " files)");

/* THE PICTURES SHE DOWNLOADS. An app that says it ships WebP twins
   (FEATURES.webp) must ship one for every PNG a screen can ask for — the
   mascot and body maps, every pose, every move photo — or the screens fall
   back to the megabyte PNGs and nobody notices. An app that does not say so
   must ask for the PNGs alone, or every photo 404s once before it loads. */
const { FEATURES, IMAGES } = await import(new URL("../sport.js", import.meta.url).href);
const { POSES } = await import(new URL("../data.js", import.meta.url).href);
const { photoSources, imgWithFallbacks, exercisePhotoUrl } = await import(new URL("../util.js", import.meta.url).href);
const shown = [...Object.values(IMAGES || {}), ...Object.values(POSES || {})].filter(p => /\.png$/i.test(p));
const exDir = path.join(root, "assets", "exercises");
const photos = existsSync(exDir) ? readdirSync(exDir).filter(f => /\.png$/i.test(f)).map(f => "assets/exercises/" + f) : [];
if (FEATURES.webp) {
  ok(photoSources("assets/x.png").join(",") === "assets/x.webp,assets/x.png", "a PNG is asked for as its WebP twin first, the PNG second");
  for (const p of [...shown, ...photos]) ok(existsSync(path.join(root, p.replace(/\.png$/i, ".webp"))), "WebP twin exists on disk: " + p);
  ok(/\.webp$/.test(photoSources(exercisePhotoUrl("Dead Bug", "Timer"))[0]), "a move photo is asked for as WebP first");
} else {
  ok(photoSources("assets/x.png").join(",") === "assets/x.png", "with no twins shipped, only the PNG is asked for");
}
const tag = imgWithFallbacks(["a.webp", "a.png"], 'alt=""');
ok(/^<img src="a\.webp" data-fallback="a\.png" onerror="/.test(tag) && /alt=""/.test(tag), "the fallback chain rides on the element: " + tag.slice(0, 60));
ok(/this\.style\.display='none'/.test(tag), "and a picture nobody has hides its slot, as before");
ok(imgWithFallbacks([], "") === "", "no sources, no tag");
console.log("✓ offline shell passed (" + passed + " assertions)");
