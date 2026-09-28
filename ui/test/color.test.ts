import assert from "node:assert/strict";
import { test } from "node:test";
import { colourWord, contrast, fit, hex, luminance, mix, oklch, oklchHex, parseColor } from "../src/color.js";

test("colours are read as CSS writes them, and anything else is not a colour", () => {
  assert.equal(hex("#1D5B43"), "#1d5b43");
  assert.equal(hex("#abc"), "#aabbcc");
  assert.equal(hex("#11223380"), "#112233");
  assert.equal(hex("rgb(29, 91, 67)"), "#1d5b43");
  assert.equal(hex("rgb(29 91 67 / 50%)"), "#1d5b43");
  assert.equal(hex("hsl(0 100% 50%)"), "#ff0000");
  assert.equal(hex("hsl(120deg, 100%, 25%)"), "#008000");
  assert.equal(hex("white"), "#ffffff");
  assert.equal(hex("oklch(62.8% 0.2577 29.23)"), "#ff0000");
  for (const nope of ["", "var(--x)", "linear-gradient(red, blue)", "#12345", "rgb(1,2)", "transparent-ish", "#".padEnd(80, "f")]) assert.equal(parseColor(nope), null, nope);
});

test("contrast is WCAG 2's, measured on the rendered colour", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.equal(Math.round(contrast("#767676", "#ffffff") * 100) / 100, 4.54);
  assert.equal(Math.round(contrast("#2b59c3", "#ffffff") * 10) / 10, 6.3);
  assert.equal(luminance("#ffffff"), 1);
  assert.throws(() => luminance("nope"), TypeError);
});

test("OKLCH round-trips sRGB colours and keeps out-of-gamut ones in gamut", () => {
  for (const c of ["#1d5b43", "#ffd84d", "#2152ff", "#000000", "#ffffff", "#808080"]) assert.equal(oklchHex(oklch(c)!), c);
  const vivid = oklchHex({ l: 0.7, c: 0.4, h: 150 });
  assert.match(vivid, /^#[0-9a-f]{6}$/u);
  assert.ok(Math.abs(oklch(vivid)!.l - 0.7) < 0.01, "lightness kept while chroma is reduced");
});

test("fit moves lightness only as far as the contrast asked, keeping the hue", () => {
  const darker = fit("#ffd84d", ["#ffffff"], 4.5)!;
  assert.ok(contrast(darker, "#ffffff") >= 4.5);
  assert.ok(Math.abs(oklch(darker)!.h - oklch("#ffd84d")!.h) < 6, "same hue");
  assert.equal(fit("#1d5b43", ["#ffffff"], 4.5), "#1d5b43", "a passing colour is left as it is");
  const lighter = fit("#1d5b43", ["#16140f"], 4.5)!;
  assert.ok(contrast(lighter, "#16140f") >= 4.5 && oklch(lighter)!.l > oklch("#1d5b43")!.l);
  assert.equal(fit("#777777", ["#777777"], 21, "darker"), null, "no lightness reaches 21:1 against grey");
});

test("mix is color-mix in oklch, and a grey takes the other's hue", () => {
  assert.equal(mix("#ff0000", "#ff0000", 0.3), "#ff0000");
  const tint = mix("#2366a8", "#ffffff", 0.14);
  assert.ok(oklch(tint)!.l > 0.9 && Math.abs(oklch(tint)!.h - oklch("#2366a8")!.h) < 12);
});

test("a colour is named in plain words, in English and French", () => {
  assert.equal(colourWord("#2f5bea", "en"), "blue");
  assert.equal(colourWord("#2f5bea", "fr"), "bleu");
  assert.equal(colourWord("#0e2a5c", "en"), "dark blue");
  assert.equal(colourWord("#0e2a5c", "fr"), "bleu foncé");
  assert.equal(colourWord("#ffd84d", "en"), "light yellow");
  assert.equal(colourWord("#7a2e1d", "fr"), "rouge foncé");
  assert.equal(colourWord("#808080", "en"), "grey");
  assert.equal(colourWord("#ffffff", "fr"), "blanc");
  assert.equal(colourWord("#138a55", "en"), "green");
});
