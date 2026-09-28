import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast, oklch } from "../src/color.js";
import { checkTheme, validateTheme } from "../src/contract.js";
import { BrandError, deriveTheme, type Brand } from "../src/derive.js";

// A seeded generator: the same brands on every run.
function random(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const colour = (r: () => number) => "#" + Math.floor(r() * 0xffffff).toString(16).padStart(6, "0");

test("any brand gives a theme that passes every pair of the contract, light and dark", () => {
  const r = random(20260928);
  const corners = ["sharp", "soft", "round"] as const, densities = ["comfortable", "compact"] as const;
  for (let i = 0; i < 1500; i++) {
    const brand: Brand = { primary: colour(r), corners: corners[i % 3]!, density: densities[i % 2]!, ...(i % 2 ? { secondary: colour(r) } : {}), ...(i % 3 === 0 ? { neutral: colour(r) } : {}) };
    const { theme, notes } = deriveTheme(brand);
    assert.deepEqual(checkTheme(theme), [], JSON.stringify(brand));
    assert.deepEqual(validateTheme(theme), []);
    for (const n of notes) assert.ok(n.en.length > 0 && n.fr.length > 0 && !/\{\w+\}/u.test(n.en + n.fr), n.code);
  }
  for (const extreme of ["#000000", "#ffffff", "#ffff00", "#00ff00", "#0000ff", "#ff0000", "#808080", "#010101", "#fefefe"]) {
    assert.deepEqual(checkTheme(deriveTheme({ primary: extreme, secondary: extreme, neutral: extreme }).theme), [], extreme);
  }
});

test("a colour that reads is kept as given; one that does not is moved, and the note says so", () => {
  const kept = deriveTheme({ primary: "#1d5b43" });
  assert.equal(kept.theme.light.accent, "#1d5b43");
  assert.equal(kept.theme.light["accent-ink"], "#ffffff");
  assert.ok(!kept.notes.some(n => n.code === "accent_darkened"));

  const orange = deriveTheme({ primary: "#e4572e" });
  assert.notEqual(orange.theme.light.accent, "#e4572e");
  assert.ok(contrast(orange.theme.light.accent, "#ffffff") >= 4.5);
  assert.ok(Math.abs(oklch(orange.theme.light.accent)!.h - oklch("#e4572e")!.h) < 8, "the hue is kept");
  const darkened = orange.notes.find(n => n.code === "accent_darkened")!;
  assert.equal(darkened.en, "Your red was darkened a little so the white text on buttons is easy to read.");
  assert.equal(darkened.fr, "Votre rouge a été un peu foncé pour que le texte blanc des boutons se lise facilement.");
  assert.ok(orange.notes.some(n => n.code === "dark_lighter"));
  assert.ok(orange.notes.some(n => n.code === "accent_like_danger"));
});

test("a light brand colour keeps its fill, with dark text and a dark edge", () => {
  const { theme, notes } = deriveTheme({ primary: "#ffd84d" });
  assert.equal(theme.light.accent, "#ffd84d");
  assert.equal(theme.light["accent-ink"], theme.light.ink);
  assert.equal(theme.light["accent-line"], theme.light.ink);
  assert.ok(contrast(theme.light["accent-text"], theme.light.surface) >= 4.5);
  assert.deepEqual(notes.map(n => n.code).sort(), ["accent_dark_text", "accent_edge", "accent_text"]);
});

test("the second colour marks highlights and joins the palette; the grey tint colours the greys", () => {
  const { theme, notes } = deriveTheme({ primary: "#2f5bea", secondary: "#f5a824", neutral: "#7d776c" });
  assert.ok(Math.abs(oklch(theme.light.highlight)!.h - oklch("#f5a824")!.h) < 15);
  assert.ok(notes.some(n => n.code === "secondary_used" && n.en.includes("orange") || n.en.includes("yellow")));
  assert.ok(notes.some(n => n.code === "neutral_used"));
  assert.ok(Math.abs(oklch(theme.light["surface-2"])!.h - oklch("#7d776c")!.h) < 20);
});

test("corners, density, fonts and logo come through; the theme follows the system's dark mode", () => {
  const derived = deriveTheme({ name: "Atelier Martin", primary: "#0e7c66", corners: "sharp", density: "compact", display: { id: "young-serif" }, body: { family: "Atelier Sans", files: [{ url: "/_chest/theme/brand/atelier-sans.woff2", weight: "400 700", style: "normal" }] }, logo: { url: "/_chest/theme/brand/logo.svg" } });
  const t = derived.theme;
  assert.deepEqual(t.radius, { s: 2, m: 3, l: 4 });
  assert.equal(t.type.m, 0.9375);
  assert.equal(t.space[3], 12);
  assert.equal(t.fonts.display.id, "young-serif");
  assert.equal(t.display.weight, 400);
  assert.equal(t.fonts.body.family, "Brand Atelier Sans");
  assert.equal(t.modes, "both");
  assert.equal(t.name.en, "Atelier Martin");
  assert.deepEqual(derived.logo, { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin" });
  const unknown = deriveTheme({ primary: "#0e7c66", display: { id: "comic-sans" } });
  assert.equal(unknown.theme.fonts.display.id, "inter");
  assert.ok(unknown.notes.some(n => n.code === "font_unknown"));
});

test("a brand that cannot be read is refused with a code", () => {
  const refused: [Brand, string][] = [
    [{ primary: "blurple" }, "invalid_primary"],
    [{ primary: "#123456", secondary: "nope" }, "invalid_secondary"],
    [{ primary: "#123456", neutral: "#12" }, "invalid_neutral"],
    [{ primary: "#123456", logo: { url: "https://evil.example/logo.svg" } }, "invalid_logo"],
    [{ primary: "#123456", logo: { url: "/_chest/theme/../files/x.svg" } }, "invalid_logo"],
    [{ primary: "#123456", body: { family: "X'; } *{", files: [] } }, "invalid_font"],
    [{ primary: "#123456", body: { family: "Atelier", files: [{ url: "https://evil.example/a.woff2", weight: "400", style: "normal" }] } }, "invalid_font"],
    [{ primary: "#123456", corners: "blobby" as never }, "invalid_option"],
    [{ primary: "#123456", name: "x".repeat(81) }, "invalid_name"],
  ];
  for (const [brand, code] of refused) assert.throws(() => deriveTheme(brand), (e: unknown) => e instanceof BrandError && e.code === code, code);
});
