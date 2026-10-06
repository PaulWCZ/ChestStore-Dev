import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogue as themes } from "@argentic/chest-ui/themes";
import { contrast } from "@argentic/chest-ui/color";
import { deriveTheme } from "@argentic/chest-ui/derive";
import type { Theme } from "@argentic/chest-ui/contract";
import { badgeColours } from "../src/lib/badge.ts";
import { stateColours, stateCss, stateNames } from "../src/lib/states.ts";
import { identity } from "../src/lib/theme.ts";

// The five state colours are meaning: the same in every look. So they must
// read on every look's grounds — each theme of the catalogue, light and
// dark, and the brands a company may derive (random, seeded, and extreme).
function failures(name: string, theme: Theme): string[] {
  const out: string[] = [];
  const modes = theme.modes === "light" ? (["light"] as const) : (["light", "dark"] as const);
  for (const mode of modes) {
    const ground = theme[mode] as Record<string, string>;
    const s = stateColours[mode];
    for (const state of stateNames) {
      const { solid, ink, tint } = s[state];
      const need = (what: string, ratio: number, min: number) => { if (!(ratio >= min)) out.push(`${name} ${mode} ${state}: ${what} ${ratio.toFixed(2)} < ${min}`); };
      // A tick, an icon, a bar, the edge of a field: seen (3:1).
      for (const g of ["bg", "surface", "surface-2"]) need(`solid on --${g}`, contrast(solid, ground[g]!), 3);
      // A state's word in its colour: read (4.5:1).
      for (const g of ["bg", "surface"]) need(`ink on --${g}`, contrast(ink, ground[g]!), 4.5);
      // A banner's heading and line on the state's tint.
      for (const t of ["ink", "ink-2"]) need(`--${t} on the tint`, contrast(ground[t]!, tint), 4.5);
    }
  }
  return out;
}

test("the state colours read on every theme of the catalogue, light and dark", () => {
  assert.ok(themes.length >= 19);
  assert.deepEqual(themes.flatMap(t => failures(t.id, t)), []);
});

test("… and on the brands a company may give its Chest: 400 random ones and the extremes", () => {
  let seed = 20260929;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hex = () => "#" + Array.from({ length: 3 }, () => Math.floor(random() * 256).toString(16).padStart(2, "0")).join("");
  const brands = [
    ...["#000000", "#ffffff", "#ffff00", "#808080", "#ff0000", "#00ff00", "#0000ff", "#0e7c66"].map(primary => ({ primary })),
    ...Array.from({ length: 400 }, () => ({ primary: hex(), ...(random() < 0.5 ? { secondary: hex() } : {}), ...(random() < 0.5 ? { neutral: hex() } : {}) })),
  ];
  assert.deepEqual(brands.flatMap(b => failures(`brand ${JSON.stringify(b)}`, deriveTheme(b).theme)), []);
});

test("each state's own pairs: ink on its tint, the icon on its tint, the text of a solid state button, and the badge's white text", () => {
  for (const mode of ["light", "dark"] as const) {
    const s = stateColours[mode];
    for (const state of stateNames) {
      assert.ok(contrast(s[state].ink, s[state].tint) >= 4.5, `${mode} ${state} ink on tint`);
      assert.ok(contrast(s[state].solid, s[state].tint) >= 3, `${mode} ${state} icon on tint`);
    }
    // "Resolve" and "Finish": the operational solid and its hover (ink).
    assert.ok(contrast(s.on, s.operational.solid) >= 4.5, `${mode} text on the resolve button`);
    assert.ok(contrast(s.on, s.operational.ink) >= 4.5, `${mode} text on the resolve button, hovered`);
  }
  for (const [state, colour] of Object.entries(badgeColours)) assert.ok(contrast("#ffffff", colour) >= 4.5, `badge ${state}`);
});

test("the state tokens reach the page as custom properties; a light-only look keeps its states light", () => {
  const both = stateCss(identity.modes);
  for (const state of stateNames) for (const suffix of ["", "-ink", "-tint"]) assert.match(both, new RegExp(`--s-${state}${suffix}:#[0-9a-f]{6};`, "u"));
  assert.match(both, /@media \(prefers-color-scheme: dark\)/u);
  const light = stateCss(themes.find(t => t.id === "chest")!.modes);
  assert.doesNotMatch(light, /prefers-color-scheme/u);
  assert.doesNotMatch(both + light, /</u, "nothing can close its <style>");
});
