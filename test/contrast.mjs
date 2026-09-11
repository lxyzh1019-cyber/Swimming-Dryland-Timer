/* ============================================================
   CONTRAST — every text-on-fill pairing the screens use must
   clear WCAG AA (4.5:1). Read straight off css/tokens/colors.css
   so a re-tuned token cannot quietly fail on the next commit.
   ============================================================ */
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../css/tokens/colors.css", import.meta.url), "utf8");
const tokens = {};
for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6}|var\(--[a-z0-9-]+\))/g)) tokens[m[1]] = m[2];
const resolve = v => { let n = 0; while (v && v.startsWith("var(") && n++ < 8) v = tokens[v.slice(6, -1)]; return v; };
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a, b) => { const [l1, l2] = [lum(resolve(a)), lum(resolve(b))].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
const t = k => tokens[k] || (() => { throw new Error("no token --" + k); })();

/* [text, fill, where it is used] */
const PAIRS = [
  ["#FFFFFF", t("aqua"),  "primary candy button, Next, Add athlete, tabs"],
  ["#FFFFFF", t("mint"),  "Done ✓ badges, Clean, Resume, Restore prize"],
  ["#FFFFFF", t("coral"), "GO / action token"],
  ["#FFFFFF", t("grape"), "explore banner"],
  ["#FFFFFF", t("sea"),   "BACK VIEW pill"],
  ["#FFFFFF", t("stop"),  "STOP button"],
  ["#FFFFFF", t("gum"),   "side-switch accents"],
  [t("ink"),  t("sun"),   "GO button, week-strip today/catch-up badges (ink text — sun cannot carry white)"],
  [t("ink-faint"), "#FFFFFF", "hints, Back/Skip labels"],
  [t("ink-faint"), t("surface-2"), "faint labels inside inset cards"],
  [t("ink-soft"),  "#FFFFFF", "secondary text"],
  [t("aqua-ink"),  t("aqua-wash"), "aqua chips"],
  [t("mint-ink"),  t("mint-wash"), "mint chips"],
  [t("sun-ink"),   t("sun-wash"),  "sun chips"],
  [t("coral-ink"), t("coral-wash"), "coral chips"],
  [t("grape-ink"), t("grape-wash"), "grape chips"],
  [t("stop-ink"),  t("stop-wash"),  "stop chips"],
  [t("sea-ink"),   t("sea-wash"),   "sea chips"],
  [t("text-on-aqua"), t("action-bg"), "--action-text on --action-bg"],
  [t("go-text"),   t("go-bg"),     "--go-text on --go-bg"],
  [t("reward-text"), t("reward-bg"), "--reward-text on --reward-bg"],
  [t("text-on-mint"), t("mint"),  "--text-on-mint"],
  [t("text-on-grape"), t("grape"), "--text-on-grape"]
];
let passed = 0; const failures = [];
for (const [text, fill, where] of PAIRS) {
  const r = ratio(text, fill);
  if (r >= 4.5) passed++; else failures.push(`${resolve(text)} on ${resolve(fill)} = ${r.toFixed(2)}:1 — ${where}`);
}
if (failures.length) { console.error("FAIL: contrast\n  " + failures.join("\n  ")); process.exit(1); }
console.log("✓ contrast passed (" + passed + " pairs ≥ 4.5:1)");
