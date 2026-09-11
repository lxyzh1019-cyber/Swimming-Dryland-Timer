/* Every move the plan references must produce a valid photo filename, and
   the committed manifest must match the plan. Missing files are a warning,
   not a failure — the photos are supplied by hand. */
import { expectedPhotos, unmatchedFiles, manifestText } from "../scripts/photo-manifest.mjs";
import { readFileSync } from "node:fs";
let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const rows = expectedPhotos();
ok(rows.length >= 50, "the plan references a full set of moves: " + rows.length);
ok(rows.every(r => /^[^/]+ - Timer Image\.png$/.test(r.timer)), "every timer filename is well formed");
ok(new Set(rows.map(r => r.name)).size === rows.length, "no move is listed twice");
const manifest = readFileSync(new URL("../assets/exercises/EXPECTED_FILES.md", import.meta.url), "utf8");
ok(manifest === manifestText(), "assets/exercises/EXPECTED_FILES.md matches the plan (run node scripts/photo-manifest.mjs)");
const missing = rows.filter(r => !r.timerExists).map(r => r.name);
if (missing.length) console.warn("  ⚠ Timer images missing for " + missing.length + " moves — see EXPECTED_FILES.md");
const orphans = unmatchedFiles(rows);
if (orphans.length) console.warn("  ⚠ files no move asks for: " + orphans.join(", "));
console.log("✓ photos passed (" + passed + " assertions)");
