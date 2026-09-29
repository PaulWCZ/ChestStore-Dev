import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { forgetTheme } from "@argentic/chest-sdk/chest";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { catalogue, checkPalette, checkTheme, contrast, deriveTheme, validateTheme, type Theme } from "@argentic/chest-ui";
import { themeStyle } from "@argentic/chest-ui/runtime";
import { identityOf } from "@argentic/chest-ui/themes";
import { accents, formSlots } from "../lib/model.ts";
import { currentLook, identity, ownLook } from "../lib/theme.ts";

const root = join(import.meta.dirname, "..");

test("Forms' own identity is a valid theme and passes every pair of the contract and the palette's families", () => {
  assert.deepEqual(validateTheme(identity), []);
  assert.deepEqual(checkTheme(identity), []);
  assert.deepEqual(checkPalette(identity), []);
  assert.equal(identity.id, "forms");
  assert.equal(identity.tool, "forms");
});

// One source: a company that picks Invitation from the catalogue for all
// its tools gets exactly Forms' own look.
test("the identity is the catalogue's Invitation, value for value", () => {
  assert.deepEqual(identity, identityOf("forms"));
  assert.ok(catalogue.some(theme => theme.id === "forms"), "Invitation is in the catalogue");
});

test("its signature colours are the ones Forms always had", () => {
  const l = identity.light, d = identity.dark;
  assert.deepEqual([l.bg, l.surface, l.ink, l.accent, l["accent-soft"], l.highlight], ["#f5f3fa", "#ffffff", "#1d1631", "#b0124f", "#fbe3ec", "#f6c945"]);
  assert.deepEqual([d.bg, d.surface, d.ink, d.accent], ["#16121f", "#201a2c", "#f3effa", "#ff8fb8"]);
  // A form's six colours, on their page (light): text and page ground.
  const pages: Record<string, [string, string]> = { 5: ["#b0124f", "#fdf0f5"], 1: ["#3d3fc4", "#f1f1fd"], 6: ["#0b6b6b", "#eef8f7"], 3: ["#b3470b", "#fff4ec"], 2: ["#2c6a31", "#f0f7ee"], 8: ["#1d1631", "#f3f2f6"] };
  for (const [slot, [ink, soft]] of Object.entries(pages)) {
    assert.equal(l[`cat-${slot}-ink` as keyof typeof l], ink, `slot ${slot}`);
    assert.equal(l[`cat-${slot}-soft` as keyof typeof l], soft, `slot ${slot}`);
  }
  // The marigold of the mark, seen on dark grounds too.
  assert.equal(d["cat-7"], "#f6c945");
});

test("its fonts are the tool's own files, served at /fonts, and the look's style names them", () => {
  const present = new Set(readdirSync(join(root, "public", "fonts")));
  const css = themeStyle(identity);
  const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/gu)].map(m => m[1]!);
  assert.ok(urls.length >= 3, "the display and body faces");
  for (const url of urls) assert.ok(present.has(url.slice("/fonts/".length)), url);
  assert.match(css, /font-family:'DM Serif Display'/u);
  assert.match(css, /font-family:'DM Sans Variable'/u); // the registry's name of the variable face
});

test("the look follows the Chest: the company's choice for all tools, this tool's override, the identity otherwise", async () => {
  const chest = await fakeChest({ theme: { all: { mode: "catalogue", theme: "newsprint" } } });
  try {
    let look = await currentLook();
    assert.equal(look.source, "catalogue");
    assert.equal(look.theme.id, "newsprint");
    assert.equal(ownLook(look), false);
    assert.equal(look.fontBase, "/_chest/theme/fonts");
    chest.theme.tools[chest.tool] = { mode: "brand", brand: { name: "Atelier Martin", primary: "#0e7c66", secondary: "#f2b134", corners: "round", display: { id: "young-serif" }, logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" } } };
    look = await currentLook();
    assert.equal(look.source, "brand");
    assert.deepEqual(look.logo, { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" });
    assert.deepEqual(checkTheme(look.theme), []);
    chest.theme.tools[chest.tool] = { mode: "own" };
    look = await currentLook();
    assert.equal(look.theme, identity);
    assert.equal(ownLook(look), true);
    chest.theme.tools[chest.tool] = { mode: "catalogue", theme: "no-such-theme" };
    assert.equal((await currentLook()).theme, identity, "a theme the kit does not know is the identity");
  } finally {
    await chest.close();
  }
  forgetTheme();
  assert.equal((await currentLook()).theme, identity, "outside a Chest: the identity");
});

// A form's page (app/tokens.css): the colour chosen is a slot of the
// palette (berry the look's own action colour outside Forms' look); its
// ground is the slot's soft ground in Forms' own look, the surface in any
// other. Every text on it must read (4.5:1): the questions (ink), the
// hints (ink-2), the errors (danger), the form's colour as text; and the
// ink on a choice's whisper of colour (7 %, 14 % under the pointer).
const srgbMix = (a: string, b: string, share: number) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * share + parseInt(b.slice(i, i + 2), 16) * (1 - share)).toString(16).padStart(2, "0")).join("");

function formFailures(theme: Theme): string[] {
  const own = theme.id === identity.id;
  const failures: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    const s = theme[mode] as unknown as Record<string, string>;
    for (const accent of accents) {
      const slot = formSlots[accent];
      const byLook = accent === "berry" && !own;
      const fill = byLook ? s["accent"]! : s[`cat-${slot}-ink`]!;
      const fillInk = byLook ? s["accent-ink"]! : s["surface"]!;
      const text = byLook ? s["accent-text"]! : s[`cat-${slot}-ink`]!;
      const soft = byLook ? s["accent-soft"]! : s[`cat-${slot}-soft`]!;
      const ground = own ? soft : s["surface"]!;
      const pairs: [string, string, string, number][] = [
        ["ink on the page", s["ink"]!, ground, 4.5],
        ["hints on the page", s["ink-2"]!, ground, 4.5],
        ["errors on the page", s["danger"]!, ground, 4.5],
        ["the form's colour as text", text, ground, 4.5],
        ["the form's colour on the surface", text, s["surface"]!, 4.5],
        ["a button's words", fillInk, fill, 4.5],
        ["a choice's words", s["ink"]!, srgbMix(fill, s["surface"]!, 0.14), 4.5],
      ];
      for (const [what, fg, bg, min] of pairs) if (contrast(fg, bg) < min) failures.push(`${theme.id} ${mode} ${accent}: ${what} ${contrast(fg, bg).toFixed(2)}`);
    }
  }
  return failures;
}

test("a form's page reads in every colour, in Forms' look and in every theme of the catalogue", () => {
  assert.deepEqual([identity, ...catalogue].flatMap(formFailures), []);
});

test("a form's page reads in every colour whatever a company's brand", () => {
  let seed = 20260929;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const colour = () => "#" + Array.from({ length: 3 }, () => Math.floor(random() * 256).toString(16).padStart(2, "0")).join("");
  const failures: string[] = [];
  for (let i = 0; i < 300; i++) failures.push(...formFailures(deriveTheme({ name: `Brand ${i}`, primary: colour(), secondary: colour() }).theme));
  assert.deepEqual(failures, []);
});

// A colour written in the tool's CSS (or in its drawings) would not follow
// the theme: every colour lives in lib/theme.ts.
function sources(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (["node_modules", ".next", "vendor", "public", "test", "docs", "chest"].includes(name)) return [];
    return statSync(path).isDirectory() ? sources(path, pattern) : pattern.test(path) ? [path] : [];
  });
}

test("no colour is written in the tool's stylesheets or components: only contract tokens", () => {
  const found: string[] = [];
  for (const file of sources(root, /\.(css|tsx)$/u)) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(|(?<![-\w])(white|black)(?![-\w"])/gu)) found.push(`${relative(root, file)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

test("every var() of the stylesheets is a contract token or one of the tool's own", () => {
  const css = ["app/tokens.css", "app/globals.css"].map(f => readFileSync(join(root, f), "utf8")).join("\n");
  const own = new Set([...css.matchAll(/(--[\w-]+)\s*:/gu)].map(m => m[1]!));
  // Set by the pages on an element's style: a bar's share, a grid's size.
  for (const name of ["--share", "--cols", "--cells"]) own.add(name);
  const contract = new Set([...themeStyle(identity).matchAll(/(--[\w-]+):/gu)].map(m => m[1]!));
  const unknown = new Set<string>();
  for (const m of css.matchAll(/var\((--[\w-]+)/gu)) if (!own.has(m[1]!) && !contract.has(m[1]!)) unknown.add(m[1]!);
  assert.deepEqual([...unknown], []);
});

test("the tool's own font stylesheets are gone: the look writes the faces", () => {
  assert.equal(existsSync(join(root, "app", "fonts")), false);
});
