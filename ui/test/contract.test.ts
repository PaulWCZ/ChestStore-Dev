import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { allTokens, checkTheme, colorTokens, pairs, validateTheme, type Theme } from "../src/contract.js";
import { themeOf } from "../src/themes.js";

const root = join(import.meta.dirname, "..", "..");

test("the contract names each token once, and tokens/CONTRACT.md documents every one", () => {
  assert.equal(new Set(allTokens).size, allTokens.length);
  const doc = readFileSync(join(root, "tokens", "CONTRACT.md"), "utf8");
  const missing = allTokens.filter(t => !doc.includes("`" + t + "`") && !(t.startsWith("--cat-") && doc.includes("`--cat-N")));
  assert.deepEqual(missing, []);
  for (const pair of pairs) for (const on of pair.on) assert.ok(colorTokens.includes(on) && colorTokens.includes(pair.fg));
});

test("checkTheme finds a pair below AA, in the mode where it is", () => {
  const base = themeOf("library")!;
  const broken: Theme = { ...base, dark: { ...base.dark, "ink-2": "#3a3630" } };
  const failures = checkTheme(broken);
  assert.ok(failures.length >= 3);
  assert.ok(failures.every(f => f.mode === "dark" && f.fg === "ink-2" && f.ratio < f.min));
});

test("validateTheme refuses anything that could escape the stylesheet", () => {
  const base = themeOf("library")!;
  const cases: [string, Theme][] = [
    ["stack", { ...base, fonts: { ...base.fonts, body: { family: "", stack: "Inter; } body { background: url(https://evil.example/x)" } } }],
    ["style end", { ...base, fonts: { ...base.fonts, display: { family: "", stack: "'</style><script>'" } } }],
    ["colour", { ...base, light: { ...base.light, accent: "red;background:url(x)" } }],
    ["shadow", { ...base, light: { ...base.light, "shadow-2": "0px 1px 2px url(https://evil.example)" } }],
    ["overlay", { ...base, dark: { ...base.dark, overlay: "rgb(0 0 0 / 0.6)); x: y" } }],
    ["ease", { ...base, motion: { ...base.motion, ease: "linear; --x: 1" } }],
    ["id", { ...base, id: "Library Theme" }],
    ["target size", { ...base, type: { ...base.type, m: 0.75 } }],
  ];
  for (const [what, theme] of cases) assert.ok(validateTheme(theme).length > 0, what);
  assert.deepEqual(validateTheme(base), []);
});
