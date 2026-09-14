#!/usr/bin/env node
/* ============================================================
   Serves the repo so the compare page can be opened ON THE IPAD.

     npm run voice:serve

   The only reason this exists rather than a line of documentation saying
   "run python3 -m http.server": the hard part was never starting a server, it
   was finding the address to type into the iPad. So this prints the LAN URL
   straight to the compare page, and there is nothing to look up.

   Zero dependencies — the repo has no build step and this must not add one.
   ============================================================ */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join, resolve, extname, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".mp3": "audio/mpeg",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2"
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    /* Normalise first, then confirm the result is still under ROOT — a path of
       "../../etc/passwd" must not escape the repo just because it is being
       served from a laptop on a home network. */
    const path = resolve(join(ROOT, normalize(url)));
    if (!path.startsWith(ROOT)) { res.writeHead(403).end("Forbidden"); return; }
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, "index.html") : path;
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(PORT, "0.0.0.0", () => {
  const lan = Object.values(networkInterfaces()).flat()
    .filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address);
  console.log("\nCoach voice A/B — open this on the iPad:\n");
  if (lan.length) lan.forEach(ip => console.log(`  http://${ip}:${PORT}/tools/voice/compare.html`));
  else console.log("  (no LAN address found — is this machine on Wi-Fi?)");
  console.log(`\nOn this machine:  http://localhost:${PORT}/tools/voice/compare.html`);
  console.log("\nThe iPad must be on the same Wi-Fi. Ctrl-C to stop.\n");
});
