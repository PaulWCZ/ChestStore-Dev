import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { checkTheme, themeOf, validateTheme } from "@argentic/chest-ui";
import { fontFiles } from "@argentic/chest-ui/fonts";
import { themeStyle } from "@argentic/chest-ui/runtime";
import { currentLook, identity, publicLook, sheetOf } from "../src/theme.ts";

const root = join(import.meta.dirname, "..");

test("Support's own identity is a valid theme, passes every pair of the contract, and is the catalogue's Calm counter", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
  // The tool's own look and the theme any other tool may wear stay one.
  assert.deepEqual(identity, themeOf("counter"));
});

test("its fonts are the tool's own files, served at /assets/fonts (a private host serves nothing at its root)", async () => {
  const present = new Set(readdirSync(join(root, "public", "assets", "fonts")));
  const needed = fontFiles([identity.fonts.display, identity.fonts.body, identity.fonts.mono, identity.fonts.accent]);
  assert.ok(needed.length > 0);
  for (const file of needed) assert.ok(present.has(file), file);
  assert.match((await sheetOf("team")).css, /url\(\/assets\/fonts\/atkinson-hyperlegible-latin-400-normal\.woff2\)/u);
});

test("the public pages wear the company's brand or Support's own look — never a catalogue theme chosen for the team", async () => {
  const chest = await fakeChest({ network: {}, theme: { all: { mode: "catalogue", theme: "newsprint" } } });
  try {
    assert.equal((await currentLook()).theme.id, "newsprint", "the team's pages: the catalogue theme");
    assert.equal((await publicLook()).theme, identity, "the public pages: Support's own look");
    chest.theme.all = { mode: "brand", brand: { name: "Atelier Martin", primary: "#0e7c66", secondary: null, neutral: null, corners: "round", density: "comfortable", display: null, body: null, logo: null } };
    assert.equal((await publicLook()).source, "brand", "the company's brand shows on its public pages");
  } finally {
    await chest.close();
    forgetTheme();
  }
});

test("the look follows the Chest: the company's choice for all tools, this tool's override, the identity otherwise", async () => {
  const chest = await fakeChest({ network: {}, theme: { all: { mode: "catalogue", theme: "newsprint" } } });
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

// A colour written in the tool's CSS (or in its drawings) would not
// follow the theme: every colour lives in src/theme.ts.
test("no colour is written in the tool's stylesheets or components: only contract tokens", () => {
  const found: string[] = [];
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (["node_modules", "dist", "vendor", "public", "test", "docs", "chest"].includes(name)) return [];
    return statSync(path).isDirectory() ? walk(path) : /\.(css|tsx)$/u.test(path) ? [path] : [];
  });
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?<![-\w])(white|black)(?![-\w"])/gu)) found.push(`${relative(root, file)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

test("every var() of the stylesheets is a contract token or one of the tool's own", () => {
  const own = new Set([...readFileSync(join(root, "src", "tokens.css"), "utf8").matchAll(/(--[\w-]+)\s*:/gu)].map(m => m[1]!));
  const contract = new Set([...themeStyle(identity).matchAll(/(--[\w-]+):/gu)].map(m => m[1]!));
  const unknown = new Set<string>();
  for (const file of ["src/styles.css", "src/tokens.css"]) {
    for (const m of readFileSync(join(root, file), "utf8").matchAll(/var\((--[\w-]+)/gu)) if (!own.has(m[1]!) && !contract.has(m[1]!)) unknown.add(m[1]!);
  }
  assert.deepEqual([...unknown], []);
});
