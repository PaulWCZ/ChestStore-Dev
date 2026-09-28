import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { checkTheme, validateTheme } from "@argentic/chest-ui";
import { fontFiles } from "@argentic/chest-ui/fonts";
import { themeStyle } from "@argentic/chest-ui/runtime";
import { currentLook, identity } from "../lib/theme.ts";

const root = join(import.meta.dirname, "..");

test("the tool's own identity is a valid theme and passes every pair of the contract", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
});

test("its fonts are the tool's own files, served at /fonts", () => {
  const present = new Set(readdirSync(join(root, "public", "fonts")));
  const needed = fontFiles([identity.fonts.display, identity.fonts.body, identity.fonts.mono, identity.fonts.accent]);
  assert.ok(needed.length > 0);
  for (const file of needed) assert.ok(present.has(file), file);
  assert.match(themeStyle(identity), /url\(\/fonts\/figtree-latin-wght-normal\.woff2\)/u);
});

test("the look follows the Chest: the company's choice for all tools, this tool's override, the identity otherwise", async () => {
  const chest = await fakeChest({ theme: { all: { mode: "catalogue", theme: "newsprint" } } });
  try {
    let look = await currentLook();
    assert.equal(look.source, "catalogue");
    assert.equal(look.theme.id, "newsprint");
    assert.equal(look.fontBase, "/_chest/theme/fonts");
    chest.theme.tools[chest.tool] = { mode: "brand", brand: { name: "Atelier Martin", primary: "#0e7c66", secondary: "#f2b134", corners: "round", display: { id: "young-serif" }, logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" } } };
    look = await currentLook();
    assert.equal(look.source, "brand");
    assert.deepEqual(look.logo, { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" });
    assert.deepEqual(checkTheme(look.theme), []);
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
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?<![-\w])(white|black)(?![-\w])/gu)) found.push(`${relative(root, file)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});
