/* PNG → WebP, same pixels, using the Chromium that Playwright ships — so the
   conversion needs no image library installed. Every PNG a screen shows gets
   a `.webp` twin beside it; the screens ask for the twin first when
   FEATURES.webp is on (see photoSources in core/util.js) and fall back to the
   PNG. A move photo of ~1.1 MB comes out at ~100 KB.

   Usage: node core/tools/webp.mjs [--quality 0.82] <file.png ...>
   e.g.   node core/tools/webp.mjs assets/exercises/*.png assets/poses/*.png

   Needs `playwright` resolvable (npm i -D playwright, or a global install
   named by PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs). */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const qi = args.indexOf("--quality");
const quality = qi >= 0 ? Number(args.splice(qi, 2)[1]) : 0.82;
const files = args.filter(f => /\.png$/i.test(f));
if (!files.length) { console.error("webp: give me some .png files"); process.exit(2); }

let chromium;
try {
  const require = createRequire(import.meta.url);
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || require.resolve("playwright")));
} catch (e) {
  console.error("webp: cannot load playwright — npm i -D playwright, or set PLAYWRIGHT_MODULE. (" + e.message + ")");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
let before = 0, after = 0;
for (const f of files) {
  const b64 = readFileSync(f).toString("base64");
  const [w, h, dataUrl] = await page.evaluate(async ([b64, q]) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return [c.width, c.height, c.toDataURL("image/webp", q)];
  }, [b64, quality]);
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  const dest = f.replace(/\.png$/i, ".webp");
  writeFileSync(dest, buf);
  const was = statSync(f).size;
  before += was; after += buf.length;
  console.log(`${w}×${h}  ${(was / 1024) | 0} KB → ${(buf.length / 1024) | 0} KB  ${dest}`);
}
console.log(`total ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
await browser.close();
