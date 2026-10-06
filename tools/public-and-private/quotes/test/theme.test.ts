import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { checkTheme, identityOf, validateTheme } from "@argentic/chest-ui";
import { fontFiles } from "@argentic/chest-ui/fonts";
import { lookCss, resolveTheme } from "@argentic/chest-ui/runtime";
import { identity, sheetOf } from "../src/theme.ts";

const root = join(import.meta.dirname, "..");

test("the tool's own identity is a valid theme and passes every pair of the contract", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
});

// Quotes in its own look and any tool wearing the catalogue's "Letterpress"
// must look alike: one source, twice.
test("the identity is the catalogue's Letterpress theme, exactly", () => {
  assert.deepEqual(identity, identityOf("quotes"));
  assert.equal(identity.id, "letterpress");
});

test("its fonts are the tool's own files, served at /assets/fonts (build.static)", () => {
  const present = new Set(readdirSync(join(root, "public", "assets", "fonts")));
  const needed = fontFiles([identity.fonts.display, identity.fonts.body, identity.fonts.mono, identity.fonts.accent]);
  assert.ok(needed.length > 0);
  for (const file of needed) assert.ok(present.has(file), file);
  const css = lookCss(resolveTheme({ mode: "own", scope: "default" }, identity, { ownFonts: "/assets/fonts" }));
  assert.match(css, /url\(\/assets\/fonts\/hanken-grotesk-latin-wght-normal\.woff2\)/u);
  assert.match(css, /url\(\/assets\/fonts\/libre-caslon-text-latin-400-normal\.woff2\)/u);
});

test("the look follows the Chest: the company's choice for all tools, this tool's override, the identity otherwise", async () => {
  const chest = await fakeChest({ theme: { all: { mode: "catalogue", theme: "newsprint" } } });
  try {
    let look = (await sheetOf("team")).look;
    assert.equal(look.source, "catalogue");
    assert.equal(look.theme.id, "newsprint");
    assert.equal(look.fontBase, "/_chest/theme/fonts");
    chest.theme.tools[chest.tool] = { mode: "brand", brand: { name: "Atelier Martin", primary: "#0e7c66", secondary: "#f2b134", corners: "round", display: { id: "young-serif" }, logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" } } };
    look = (await sheetOf("team")).look;
    assert.equal(look.source, "brand");
    assert.deepEqual(look.logo, { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" });
    assert.deepEqual(checkTheme(look.theme), []);
    chest.theme.tools[chest.tool] = { mode: "own" };
    assert.equal((await sheetOf("team")).look.theme, identity);
    // The client's page: the company's brand, else the tool's own — never a
    // catalogue theme chosen for the team.
    chest.theme.all = { mode: "catalogue", theme: "newsprint" };
    assert.equal((await sheetOf("public")).look.theme, identity);
    chest.theme.tools[chest.tool] = { mode: "catalogue", theme: "no-such-theme" };
    assert.equal((await sheetOf("team")).look.theme, identity, "a theme the kit does not know is the identity");
  } finally {
    await chest.close();
  }
  forgetTheme();
  assert.equal((await sheetOf("team")).look.theme, identity, "outside a Chest: the identity");
});

// A colour written in the tool's CSS would not follow the theme.
test("no colour is written in the tool's stylesheets: only contract tokens", () => {
  const found: string[] = [];
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (["node_modules", "dist", "vendor", "public"].includes(name)) return [];
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".css") ? [path] : [];
  });
  for (const file of walk(root)) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?<![-\w])(white|black)(?![-\w])/gu)) found.push(`${relative(root, file)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

// The PDF is a legal document: it keeps its own neutral print design
// (black on white, Liberation fonts) whatever the look the company chose.
// Nothing that draws it may read the look.
test("the PDF never reads the look: src/pdf and the archive import no theme", () => {
  const found: string[] = [];
  const lib = join(root, "src", "lib");
  const pdf = join(root, "src", "pdf");
  const sources = [...readdirSync(pdf).filter(n => n.endsWith(".ts")).map(n => join(pdf, n)), join(lib, "archive.ts"), join(lib, "einvoice.ts")];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    if (/@argentic\/chest-ui|theme\.ts|chest\.theme\(/u.test(source)) found.push(relative(root, file));
  }
  assert.deepEqual(found, []);
});
