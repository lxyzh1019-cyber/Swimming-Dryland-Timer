/* THIS APP'S LEAD-IN MOVES — every move that starts hanging from a bar gets a
   five-second "Get on the bar" before its first rep or its work clock (see the
   lead-in in core/engine.js and core/test/leadin.mjs for the behaviour). The
   field is an explicit opt-in per move, never a name rule, so this checks that
   every Swim move that needs it actually carries it — at load, and in the source,
   so a copy of the move added to another day cannot slip through unflagged. */
import { data } from "../core/test/harness.mjs";
import { readFileSync } from "node:fs";

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; };
const NAMES = ["Clean Pull-Ups", "Scap Pull-Up + Dead Hang"];

const moves = [];
Object.values(data.DAYS).forEach(day => {
  Object.values(day.blocks || {}).flat().concat(day.prepMenu || [], day.recovery || [])
    .forEach(ex => ex && ex.name && moves.push(ex));
});
NAMES.forEach(name => {
  const found = moves.filter(ex => ex.name === name);
  ok(found.length > 0, name + " is in the week");
  found.forEach(ex => ok(ex.leadInSeconds === 5, name + " carries a 5s lead-in (" + ex.leadInSeconds + ")"));
});

// Every X({ name: "<one of these>" ... }) call in the source, not just the ones a day happens to use.
const src = readFileSync(new URL("../js/data.js", import.meta.url), "utf8");
NAMES.forEach(name => {
  const re = new RegExp("X\\(\\{\\s*name:\\s*\"" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\"", "g");
  let m, calls = 0;
  while ((m = re.exec(src))) {
    calls++;
    // The call runs to its closing "})" — no move literal nests one.
    const body = src.slice(m.index, src.indexOf("})", m.index));
    ok(/leadInSeconds:\s*5\b/.test(body), name + " call at offset " + m.index + " sets leadInSeconds: 5");
  }
  ok(calls > 0, name + " is authored at least once");
});

// And nothing else is quietly given one.
moves.filter(ex => ex.leadInSeconds && !NAMES.includes(ex.name))
  .forEach(ex => ok(false, ex.name + " has a lead-in it was not meant to have"));

console.log("✓ lead-in moves: " + passed + " checks passed");
