import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkTheme } from "../src/contract.js";
import { deriveTheme } from "../src/derive.js";
import { importBrand, maxImportSize } from "../src/import.js";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "..", "..", "test", "fixtures", name), "utf8");
const codes = (r: { notes: { code: string }[] }) => r.notes.map(n => n.code);

test("W3C design tokens: groups, inherited types, aliases, colour objects, fonts and radii", () => {
  const r = importBrand(fixture("dtcg.tokens.json"), "dtcg.tokens.json");
  assert.equal(r.format, "dtcg");
  assert.deepEqual(r.brand, { primary: "#2f5bea", secondary: "#f5a824", neutral: "#7d776c", display: { id: "fraunces" }, body: { id: "inter" }, corners: "soft" });
  assert.ok(r.colours.some(c => c.value === "#f5a824"), "the colour object was read by its hex");
  assert.ok(codes(r).includes("aliases_skipped"), "the alias to a missing token is said");
  assert.equal(r.notes.find(n => n.code === "primary_named")!.en, "Main colour: “color.brand.primary” (blue).");
  assert.deepEqual(checkTheme(deriveTheme(r.brand!).theme), []);
});

test("Tokens Studio: sets, aliases without the set, font families, border radius", () => {
  const r = importBrand(fixture("tokens-studio.json"), "tokens.json");
  assert.equal(r.format, "tokens-studio");
  assert.deepEqual(r.brand, { primary: "#138a55", secondary: "#e0573a", neutral: "#6c7a75", display: { id: "bricolage-grotesque" }, body: { id: "nunito-sans" }, corners: "round" });
});

test("a CSS file: custom properties, var() references, font rules, corners — in French names", () => {
  const r = importBrand(fixture("brand.css"), "charte.css");
  assert.equal(r.format, "css");
  assert.deepEqual(r.brand, { primary: "#7a2e1d", secondary: "#e9b949", neutral: "#8a8178", display: { id: "young-serif" }, body: { id: "figtree" }, corners: "sharp" });
  assert.ok(codes(r).includes("aliases_skipped"));
  assert.ok(r.notes.find(n => n.code === "corners_found")!.fr.startsWith("Coins : droits"));
});

test("a list of colours, named on their lines or not at all", () => {
  const named = importBrand(fixture("palette.txt"), "palette.txt");
  assert.equal(named.format, "list");
  assert.deepEqual(named.brand, { primary: "#0e7c66", secondary: "#f2b134", neutral: "#5e6b68" });
  const bare = importBrand(fixture("colours-only.txt"));
  assert.deepEqual(bare.brand, { primary: "#6d28d9", secondary: "#10b981" });
  assert.ok(codes(bare).includes("primary_guessed") && codes(bare).includes("secondary_guessed"));
});

test("a broken file is still read for its colours; an empty or huge one is said so", () => {
  const broken = importBrand(fixture("broken.json"), "broken.json");
  assert.ok(codes(broken).includes("not_json"));
  assert.equal(broken.brand?.primary, "#ff5500");
  const empty = importBrand("Our brand is friendly and blue.", "notes.txt");
  assert.equal(empty.brand, null);
  assert.ok(codes(empty).includes("nothing_found"));
  assert.deepEqual(codes(importBrand("#".repeat(maxImportSize + 1))), ["too_large"]);
});

test("an unknown font is replaced by one of the same kind, and the note says which", () => {
  const r = importBrand(JSON.stringify({ brand: { $type: "color", primary: { $value: "#224488" } }, font: { $type: "fontFamily", heading: { $value: "Playfair Display" }, body: { $value: "Helvetica Neue" } } }), "t.json");
  assert.deepEqual(r.brand?.display, { id: "newsreader" });
  assert.deepEqual(r.brand?.body, { id: "inter" });
  const unknown = r.notes.filter(n => n.code === "font_unknown");
  assert.equal(unknown.length, 2);
  assert.equal(unknown[0]!.en, "We don’t have the font “Playfair Display”: Newsreader is used instead. Upload its files to use it.");
});
