import type { State } from "./model.ts";

// The five states' colours. They are not part of any look: a company may
// dress the tool in any theme or its own brand, but "Major outage" stays
// vermilion, "Degraded" yellow, "Operational" bluish green — customers and
// editors learn them, the badge and the widget speak them, and they must
// mean the same on every page. They follow the Okabe–Ito palette (told
// apart by people with any common colour blindness), darkened for 3:1 as
// graphics, with a darker "ink" twin for 4.5:1 as text and a pale "tint"
// for banners. And they never go alone: each state has its own shape
// (components/icons.tsx) and its word.
//
// Fixed colours on grounds that change with the look: every pair is
// measured by test/states.test.ts against every theme of the catalogue
// (light and dark) and hundreds of derived brands — the solid 3:1 on
// --bg, --surface and --surface-2; the ink 4.5:1 on --bg and --surface;
// --ink and --ink-2 4.5:1 on each tint; the text on a solid state button
// 4.5:1. They reach the page as custom properties (stateCss, in a <style>
// with the page's nonce, beside the theme's): the stylesheets name only
// tokens.

export type Shades = { readonly solid: string; readonly ink: string; readonly tint: string };
export type Scheme = { readonly [S in State]: Shades } & { readonly on: string };

export const stateColours: { readonly light: Scheme; readonly dark: Scheme } = {
  light: {
    operational: { solid: "#0a7f58", ink: "#0a6b4a", tint: "#e3f4ec" },
    maintenance: { solid: "#1f66c7", ink: "#1a55a6", tint: "#e2ecfa" },
    degraded: { solid: "#a87700", ink: "#7d5800", tint: "#fbf3dc" },
    partial: { solid: "#c95a0a", ink: "#a54808", tint: "#fdeee3" },
    major: { solid: "#c42d17", ink: "#a8260f", tint: "#fde8e4" },
    // Text and icons on a solid state (the green "Resolve" button).
    on: "#ffffff",
  },
  dark: {
    operational: { solid: "#3fbf8a", ink: "#5fd3a2", tint: "#10261d" },
    maintenance: { solid: "#5b9cf0", ink: "#8bbaf6", tint: "#111f33" },
    degraded: { solid: "#e0b33a", ink: "#eac767", tint: "#2a2210" },
    partial: { solid: "#f08a3c", ink: "#f6a769", tint: "#2d1b0f" },
    major: { solid: "#f2665a", ink: "#f78b81", tint: "#2e1412" },
    on: "#0c1015",
  },
};

export const stateNames = ["operational", "maintenance", "degraded", "partial", "major"] as const satisfies readonly State[];

const declarations = (scheme: Scheme) =>
  stateNames.map(s => `--s-${s}:${scheme[s].solid};--s-${s}-ink:${scheme[s].ink};--s-${s}-tint:${scheme[s].tint};`).join("") + `--s-on:${scheme.on};`;

// The stylesheet of the state tokens. A look without a dark mode (the Chest
// theme) keeps its light pages under a dark system: so do the states.
export function stateCss(modes: "both" | "light"): string {
  const light = `:root{${declarations(stateColours.light)}}`;
  return modes === "light" ? light : `${light}@media (prefers-color-scheme: dark){:root{${declarations(stateColours.dark)}}}`;
}
