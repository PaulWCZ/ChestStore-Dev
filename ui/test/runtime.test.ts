import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { allTokens } from "../src/contract.js";
import { themeCss } from "../src/css.js";
import { ThemeStyle } from "../src/react.js";
import { nonceOf, resolveTheme, themeStyle } from "../src/runtime.js";
import { themeOf } from "../src/themes.js";

const own = themeOf("workshop")!;

test("the stylesheet sets every token, light then dark, and honours reduced motion and more contrast", () => {
  const css = themeCss(own, { fontBase: "/fonts" });
  for (const token of allTokens) assert.ok(css.includes(token + ":"), token);
  assert.match(css, /^@font-face\{font-family:'Space Grotesk Variable';/u);
  assert.match(css, /src:url\(\/fonts\/inter-latin-wght-normal\.woff2\)/u);
  assert.match(css, /:root\{color-scheme:light dark;/u);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\{:root\{--bg:#161512;/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{:root\{--fast:0ms;--slow:0ms\}\}/u);
  assert.match(css, /@media \(prefers-contrast: more\)/u);
  assert.ok(!css.includes("<"));
});

test("a light-only theme says so, and stops the browser faking weights", () => {
  const css = themeCss(themeOf("chest")!);
  assert.match(css, /color-scheme:light;/u);
  assert.ok(!css.includes("prefers-color-scheme"));
  assert.match(css, /font-synthesis:none/u);
  assert.ok(!css.includes("@font-face"), "Suisse has no file of the kit's");
});

test("resolveTheme: the Chest's choice first, the tool's own identity otherwise", () => {
  assert.equal(resolveTheme(null, own).source, "own");
  assert.equal(resolveTheme({ mode: "own", scope: "chest" }, own).theme, own);
  const catalogue = resolveTheme({ mode: "catalogue", theme: "library", fonts: "/_chest/theme/fonts", faces: [], scope: "chest" }, own);
  assert.equal(catalogue.theme.id, "library");
  assert.equal(catalogue.fontBase, "/_chest/theme/fonts");
  assert.match(themeStyle(catalogue, "abcdefgh12345678"), /src:url\(\/_chest\/theme\/fonts\/newsreader-latin-wght-normal\.woff2\)/u);
  const unknown = resolveTheme({ mode: "catalogue", theme: "vaporwave", scope: "chest" }, own);
  assert.equal(unknown.theme, own);
  assert.match(unknown.problem!, /vaporwave/u);
  const brand = resolveTheme({ mode: "brand", brand: { name: "Atelier Martin", primary: "#e4572e", secondary: null, neutral: null, corners: "round", density: "comfortable", display: { id: "fraunces" }, body: null, logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" } }, fonts: "/_chest/theme/fonts", scope: "tool" }, own);
  assert.equal(brand.source, "brand");
  assert.equal(brand.theme.fonts.display.id, "fraunces");
  assert.deepEqual(brand.logo, { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" });
  assert.ok(brand.notes.some(n => n.code === "accent_darkened"));
  const unreadable = resolveTheme({ mode: "brand", brand: { primary: "#zzzzzz" } }, own);
  assert.equal(unreadable.source, "own");
  assert.match(unreadable.problem!, /brand not usable/u);
});

test("fonts the Chest serves for a theme that names them without files join the theme", () => {
  const look = resolveTheme({ mode: "catalogue", theme: "chest", fonts: "/_chest/theme/fonts", faces: [{ family: "Suisse", url: "/_chest/theme/fonts/suisse-intl-regular.woff2", weight: "400", style: "normal" }, { family: "Works", url: "/_chest/theme/fonts/suisse-works-regular.woff2", weight: "400", style: "normal" }] }, own);
  const css = themeStyle(look);
  assert.match(css, /@font-face\{font-family:'Suisse';font-style:normal;font-display:swap;font-weight:400;src:url\(\/_chest\/theme\/fonts\/suisse-intl-regular\.woff2\) format\('woff2'\)\}/u);
  assert.match(css, /font-family:'Works'/u);
});

test("the <style> carries the page's nonce, and a nonce that is not one is refused", () => {
  const html = themeStyle(resolveTheme(null, own), "r4nd0mN0nce+/==");
  assert.match(html, /^<style nonce="r4nd0mN0nce\+\/==" data-chest-theme="workshop">/u);
  assert.throws(() => themeStyle(own, "\"><script>alert(1)</script>"), RangeError);
  assert.equal(nonceOf("default-src 'self'; script-src 'self' 'nonce-QUJDREVGR0g=' 'strict-dynamic'; style-src 'self' 'nonce-QUJDREVGR0g='"), "QUJDREVGR0g=");
  assert.equal(nonceOf(null), null);
});

test("ThemeStyle renders the same element for a React server component", () => {
  const look = resolveTheme({ mode: "catalogue", theme: "seaside" }, own);
  const html = renderToStaticMarkup(createElement(ThemeStyle, { look, nonce: "abcdefgh12345678" }));
  assert.match(html, /^<style nonce="abcdefgh12345678" data-chest-theme="seaside">@font-face/u);
  assert.ok(html.includes("--cat-1-soft:#d6e9fb"));
  assert.throws(() => renderToStaticMarkup(createElement(ThemeStyle, { look, nonce: "bad nonce" })), RangeError);
});
