import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { checkTheme, identityOf, validateTheme } from "@argentic/chest-ui";
import { fontFiles } from "@argentic/chest-ui/fonts";
import { atLeast } from "@argentic/chest-app/testing";
import { lookCss } from "@argentic/chest-ui/runtime";
import { currentLook, identity, ownLook, pageLook } from "../src/theme.ts";

atLeast(6);

const root = join(import.meta.dirname, "..");

test("the tool's own identity is a valid theme and passes every pair of the contract", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
});

// Expenses in its own look and any tool wearing the catalogue's "Receipt"
// must look alike: one source, twice.
test("the identity is the catalogue's Receipt theme, exactly", () => {
  assert.deepEqual(identity, identityOf("expenses"));
  assert.equal(identity.id, "receipt");
});

test("its fonts are the tool's own files, served at /assets/fonts", async () => {
  const present = new Set(readdirSync(join(root, "public", "assets", "fonts")));
  const needed = fontFiles([identity.fonts.display, identity.fonts.body, identity.fonts.mono, identity.fonts.accent]);
  assert.ok(needed.length > 0);
  for (const file of needed) assert.ok(present.has(file), file);
  assert.match(lookCss(ownLook()), /url\(\/assets\/fonts\/public-sans-latin-wght-normal\.woff2\)/u);
  assert.match(lookCss(ownLook()), /url\(\/assets\/fonts\/jetbrains-mono-latin-wght-normal\.woff2\)/u);
  // Outside /chest (an error page), the tool's own look, as a stylesheet.
  assert.equal((await pageLook(false)).css, lookCss(ownLook()));
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

// The tool's own tokens name only contract tokens (or each other), and
// every var() of its stylesheets is defined somewhere: a token the theme
// does not set would silently fall back to nothing.
test("every custom property the stylesheets read is a contract token or a tool token", async () => {
  const { allTokens } = await import("@argentic/chest-ui/contract");
  const own = readFileSync(join(root, "src", "tokens.css"), "utf8");
  const defined = new Set([...allTokens.map(t => t.startsWith("--") ? t : "--" + t), ...[...own.matchAll(/(--[\w-]+)\s*:/gu)].map(m => m[1]!)]);
  const missing: string[] = [];
  for (const file of ["src/tokens.css", "src/styles.css"]) {
    const css = readFileSync(join(root, file), "utf8");
    for (const m of css.matchAll(/var\((--[\w-]+)/gu)) if (!defined.has(m[1]!)) missing.push(`${file}: ${m[1]}`);
  }
  assert.deepEqual([...new Set(missing)], []);
});
