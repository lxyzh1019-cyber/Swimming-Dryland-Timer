/* THE RUNNER. Every suite, every time, in every timezone that matters.

   `npm test` used to be five commands chained with `&&`: the first failure
   stopped the chain, so a Monday-only assertion in the smoke file hid four
   green suites behind it and nobody could tell whether the app or the test
   was broken. This runs each suite in its own process, under the default
   timezone and again under one a day-boundary bug would show up in, keeps
   going past failures, and reports all of them at the end.

   Usage: node core/test/run.mjs [suite.mjs ...]
   With no arguments it runs every *.mjs under core/test/ (except this file
   and the harness) and every *.mjs under the app's own test/. */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const listed = process.argv.slice(2);
const discover = (dir) => existsSync(dir)
  ? readdirSync(dir).filter(f => f.endsWith(".mjs") && !/^(run|harness)\.mjs$/.test(f)).sort().map(f => path.join(dir, f))
  : [];
const suites = listed.length ? listed.map(s => path.resolve(root, s))
  : [...discover(path.join(root, "test")), ...discover(path.join(root, "core", "test"))];
const zones = [null, "America/New_York"];

const failures = [];
for (const suite of suites) {
  for (const tz of zones) {
    const env = { ...process.env };
    if (tz) env.TZ = tz; else delete env.TZ;
    const r = spawnSync(process.execPath, [suite], { env, encoding: "utf8" });
    const label = path.relative(root, suite) + (tz ? " (TZ=" + tz + ")" : "");
    const summary = (r.stdout.match(/^✓ .*$/m) || [])[0];
    if (r.status === 0 && summary) console.log(summary.replace(/^✓ /, "✓ " + label + ": "));
    else {
      failures.push(label);
      const tail = (r.stderr || r.stdout || "").split("\n").filter(l => /FAIL|Error|error/.test(l) && !/Firebase unavailable|ERR_UNSUPPORTED_ESM_URL_SCHEME|Only URLs with a scheme/.test(l)).slice(0, 4).join("\n    ");
      console.log("✗ " + label + "\n    " + (tail || "(no output — exit " + r.status + ")"));
    }
  }
}
console.log(failures.length ? "\n" + failures.length + " failing: " + failures.join(", ") : "\nall suites green");
process.exit(failures.length ? 1 : 0);
