import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { checkTheme, identityOf, validateTheme } from "@argentic/chest-ui";
import { fontFiles } from "@argentic/chest-ui/fonts";
import { themeStyle } from "@argentic/chest-ui/runtime";
import { badge, brandLabel, labelColour } from "../lib/badge.ts";
import { moveWindow } from "../lib/zone.ts";
import { currentLook, identity } from "../lib/theme.ts";

const root = join(import.meta.dirname, "..");
const brand = { name: "Atelier Martin", primary: "#0e7c66", secondary: "#f2b134", corners: "round" as const, display: { id: "young-serif" }, logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" } };

test("the tool's own identity is a valid theme and passes every pair of the contract", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
});

// Status in its own look and any tool wearing the catalogue's "Control
// room" must look alike: one source, twice.
test("the identity is the catalogue's Control room theme, exactly", () => {
  assert.deepEqual(identity, identityOf("status"));
  assert.equal(identity.id, "control-room");
});

test("its fonts are the tool's own files, served at /fonts", () => {
  const present = new Set(readdirSync(join(root, "public", "fonts")));
  const needed = fontFiles([identity.fonts.display, identity.fonts.body, identity.fonts.mono, identity.fonts.accent]);
  assert.ok(needed.length > 0);
  for (const file of needed) assert.ok(present.has(file), file);
  assert.match(themeStyle(identity), /url\(\/fonts\/red-hat-text-latin-wght-normal\.woff2\)/u);
  assert.match(themeStyle(identity), /url\(\/fonts\/red-hat-mono-latin-wght-normal\.woff2\)/u);
});

test("the look follows the Chest — one mechanism for the team's and the public pages: the company's choice for all tools, this tool's override, the identity otherwise", async () => {
  const chest = await fakeChest({ theme: { all: { mode: "catalogue", theme: "newsprint" } } });
  try {
    let look = await currentLook();
    assert.equal(look.source, "catalogue");
    assert.equal(look.theme.id, "newsprint");
    assert.equal(look.fontBase, "/_chest/theme/fonts");
    assert.equal(brandLabel(look), null, "a catalogue theme leaves the badge as it is");
    chest.theme.tools[chest.tool] = { mode: "brand", brand };
    look = await currentLook();
    assert.equal(look.source, "brand");
    assert.deepEqual(look.logo, brand.logo);
    assert.deepEqual(checkTheme(look.theme), []);
    // The badge's label wears the brand's colour (white reads on it).
    const ground = brandLabel(look);
    assert.equal(ground, look.theme.light.accent);
    assert.ok(badge("status", "All systems operational", "operational", "t", ground ?? labelColour).includes(`fill="${ground}"`));
    chest.theme.tools[chest.tool] = { mode: "brand", brand: { ...brand, primary: "#ffe600" } };
    assert.equal(brandLabel(await currentLook()), null, "a light brand colour: the badge keeps its dark label");
    chest.theme.tools[chest.tool] = { mode: "own" };
    assert.equal((await currentLook()).theme, identity);
    chest.theme.tools[chest.tool] = { mode: "catalogue", theme: "no-such-theme" };
    assert.equal((await currentLook()).theme, identity, "a theme the kit does not know is the identity");
  } finally {
    await chest.close();
  }
  forgetTheme();
  assert.equal((await currentLook()).theme, identity, "outside a Chest: the identity");
});

test("a badge never carries a label ground it was not meant to (only #rrggbb)", () => {
  assert.ok(badge("status", "ok", "operational", "t", "red;x").includes(`fill="${labelColour}"`));
});

// A colour written in the tool's CSS would not follow the theme.
test("no colour is written in the tool's stylesheets: only contract tokens", () => {
  const found: string[] = [];
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (["node_modules", ".next", "vendor", "public"].includes(name)) return [];
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".css") ? [path] : [];
  });
  for (const file of walk(root)) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?<![-\w])(white|black)(?![-\w])|in (srgb|oklch)\b/gu)) found.push(`${relative(root, file)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

test("a maintenance window keeps its length when its start moves, across days", () => {
  const start = { day: "2026-10-01", minutes: 22 * 60 }, end = { day: "2026-10-01", minutes: 23 * 60 };
  assert.deepEqual(moveWindow(start, end, { day: "2026-10-01", minutes: 23 * 60 + 30 }).end, { day: "2026-10-02", minutes: 30 });
  assert.deepEqual(moveWindow(start, end, { day: "2026-10-05", minutes: 22 * 60 }).end, { day: "2026-10-05", minutes: 23 * 60 });
  assert.deepEqual(moveWindow(start, { day: "2026-09-30", minutes: 0 }, { day: "2026-10-03", minutes: 60 }).end, { day: "2026-10-03", minutes: 60 }, "an end before the start: no length");
  assert.deepEqual(moveWindow({ day: "", minutes: 0 }, end, { day: "2026-10-03", minutes: 60 }).end, end, "no start yet: the end stays");
});
