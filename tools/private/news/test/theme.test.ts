import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { allTokens, checkTheme, identityOf, validateTheme } from "@argentic/chest-ui";
import { fontFiles } from "@argentic/chest-ui/fonts";
import { identity, sheetOf } from "../src/theme.ts";

const currentLook = async () => (await sheetOf("team")).look;

const root = join(import.meta.dirname, "..");

test("the tool's own identity is a valid theme and passes every pair of the contract", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
});

// News in its own look and any tool wearing the catalogue's "Newsprint"
// must look alike: one source, twice.
test("the identity is the catalogue's Newsprint theme, exactly", () => {
  assert.deepEqual(identity, identityOf("news"));
  assert.equal(identity.id, "newsprint");
});

test("its fonts are the tool's own files, served at /assets/fonts", async () => {
  const present = new Set(readdirSync(join(root, "public", "assets", "fonts")));
  const needed = fontFiles([identity.fonts.display, identity.fonts.body, identity.fonts.mono, identity.fonts.accent]);
  assert.ok(needed.length > 0);
  for (const file of needed) assert.ok(present.has(file), file);
  const { css } = await sheetOf("team");
  assert.match(css, /url\(\/assets\/fonts\/fraunces-latin-wght-normal\.woff2\)/u);
  assert.match(css, /url\(\/assets\/fonts\/libre-franklin-latin-wght-normal\.woff2\)/u);
});

test("the look follows the Chest: the company's choice for all tools, this tool's override, the identity otherwise", async () => {
  const chest = await fakeChest({ network: {}, theme: { all: { mode: "catalogue", theme: "library" } } });
  try {
    let look = await currentLook();
    assert.equal(look.source, "catalogue");
    assert.equal(look.theme.id, "library");
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
    if (["node_modules", "dist", "vendor", "public"].includes(name)) return [];
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".css") ? [path] : [];
  });
  for (const file of walk(root)) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?<![-\w])(white|black)(?![-\w])/gu)) found.push(`${relative(root, file)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

// Every custom property the CSS reads is the contract's, or one of the
// tool's own tokens (src/tokens.css), defined from the contract's.
test("the stylesheets read only contract tokens and the tool's own", () => {
  const own = new Set([...readFileSync(join(root, "src", "tokens.css"), "utf8").matchAll(/(--[\w-]+)\s*:/gu)].map(m => m[1]!));
  const known = new Set<string>([...allTokens, ...own]);
  const unknown: string[] = [];
  for (const file of ["src/tokens.css", "src/styles.css"]) {
    for (const m of readFileSync(join(root, file), "utf8").matchAll(/var\((--[\w-]+)/gu)) if (!known.has(m[1]!)) unknown.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual(unknown, []);
});

// A weight written as a number would not follow a theme whose hierarchy is
// size alone (the Chest theme's 400): weights come from tokens, 400 aside.
test("weights come from the theme's tokens", () => {
  const css = readFileSync(join(root, "src", "styles.css"), "utf8");
  assert.deepEqual([...css.matchAll(/font-weight:\s*(\d+)/gu)].map(m => m[1]).filter(w => w !== "400"), []);
});
