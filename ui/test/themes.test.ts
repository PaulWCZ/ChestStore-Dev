import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkTheme, ratios, validateTheme } from "../src/contract.js";
import { fontFiles, registry } from "../src/fonts.js";
import { catalogue, catalogueFonts, identityOf, themeOf } from "../src/themes.js";

const root = join(import.meta.dirname, "..", "..");
const tools = ["tasks", "wiki", "leave", "news", "people", "crm", "expenses", "helpdesk", "rooms", "timesheets", "booking", "hiring", "equipment", "polls", "goals", "quotes", "status", "forms"];

test("the catalogue holds the eighteen identities, the Chest's look and high contrast", () => {
  assert.equal(catalogue.length, 20);
  assert.equal(new Set(catalogue.map(t => t.id)).size, 20);
  for (const tool of tools) assert.ok(identityOf(tool), `an identity for ${tool}`);
  assert.ok(themeOf("chest") && themeOf("high-contrast"));
  assert.equal(themeOf("plain"), undefined);
});

test("every theme of the catalogue passes every pair of the contract, light and dark", () => {
  for (const theme of catalogue) {
    assert.deepEqual(validateTheme(theme), [], theme.id);
    assert.deepEqual(checkTheme(theme), [], theme.id);
    assert.ok(ratios(theme.light).every(r => r.ratio >= r.min));
    for (const w of [theme.name, theme.description]) assert.ok(w.en && w.fr && w.en !== "" && w.fr !== "");
  }
});

test("the Chest's look is light only, weight 400, square, and states and categories are not colours", () => {
  const chest = themeOf("chest")!;
  assert.equal(chest.modes, "light");
  assert.equal(chest.dark, chest.light);
  assert.equal(chest.strong, 400);
  assert.equal(chest.display.weight, 400);
  assert.equal(chest.synthesis, false);
  assert.deepEqual(chest.radius, { s: 0, m: 0, l: 0 });
  assert.equal(chest.fonts.body.stack, "'Suisse', Arial, sans-serif");
  assert.equal(chest.fonts.accent.stack, "'Works', Georgia, serif");
  assert.equal(chest.light.focus, "#0061fe");
  assert.equal(chest.light.danger, "#8a3028");
  assert.equal(chest.light["shadow-1"], "none");
  // Warm greys only: no category has a hue.
  for (let i = 1; i <= 8; i++) for (const s of ["", "-soft", "-ink"]) {
    const v = chest.light[`cat-${i}${s}` as keyof typeof chest.light];
    const [r, g, b] = [1, 3, 5].map(k => parseInt(v.slice(k, k + 2), 16)) as [number, number, number];
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 12, `cat-${i}${s} ${v} is a grey`);
  }
});

test("every font the catalogue names is registered, with its files and licence in fonts/", () => {
  const dir = join(root, "fonts");
  const present = new Set(readdirSync(dir));
  for (const spec of catalogueFonts) assert.ok(spec.id && registry.has(spec.id), spec.family);
  for (const file of fontFiles([...catalogueFonts])) assert.ok(present.has(file), file);
  for (const entry of registry.values()) {
    assert.equal(entry.licence, "OFL-1.1", entry.id);
    assert.ok(existsSync(join(dir, `LICENSE-${entry.id}.txt`)), entry.id);
    assert.ok(entry.files.some(f => f.subset === "latin") && entry.files.some(f => f.subset === "latin-ext"), entry.id);
  }
});
