import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme, type Theme, type ThemeSource } from "@argentic/chest-ui";
import type { FontSpec } from "@argentic/chest-ui/fonts";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// Forms' own identity (DESIGN.md), "Invitation": a conversation on paper —
// lavender mist, aubergine ink, one berry that says "this is the one thing
// to do", a marigold dot of warmth, a generous serif for the questions. A
// theme of the kit's contract (ui/tokens/CONTRACT.md), checked like the
// catalogue's (test/theme.test.ts). Every colour of the tool is here; its
// CSS names only the contract's tokens and its own tokens made of them
// (app/tokens.css).
//
// The six colours a form may take (Settings → How it looks) are slots of
// the categorical palette (lib/model.ts formSlots): here they are set to
// the exact colours Forms always had — berry is the pink family, indigo
// the blue, teal the teal, tangerine the orange, forest the green, ink
// the slate — so a form keeps its colour in any theme, in that theme's
// own shade of the family.
//
// The catalogue of the kit does not hold Forms yet (it has the 17 other
// identities): until it does, the fonts are declared from the tool's own
// files (public/fonts/, served at /fonts). Latin files only: a face given
// by files carries no unicode-range, and two files of one face without a
// range would hide each other. When the catalogue registers "dm-sans" and
// "dm-serif-display", these become `fonts: { display: "dm-serif-display",
// body: "dm-sans" }` and the identity is `identityOf("forms")`
// (reports/04-themes-and-kit.md; this tool's README, "Looks").
const serif: FontSpec = {
  family: "DM Serif Display",
  stack: "'DM Serif Display', Georgia, 'Times New Roman', serif",
  files: [
    { url: "/fonts/dm-serif-display-latin-400-normal.woff2", weight: "400", style: "normal" },
    { url: "/fonts/dm-serif-display-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
};
const sans: FontSpec = {
  family: "DM Sans",
  stack: "'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  files: [{ url: "/fonts/dm-sans-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
};

export const source: ThemeSource = {
  id: "forms", tool: "forms",
  name: { en: "Invitation", fr: "Invitation" },
  description: { en: "Warm, lively, clear: lavender mist, aubergine ink, one berry, a generous serif for the questions.", fr: "Chaleureux, vivant, clair : brume lavande, encre aubergine, une seule baie, une serif généreuse pour les questions." },
  fonts: { display: serif, body: sans },
  display: { weight: 400, tracking: "-0.005em" },
  strong: 600,
  radius: { s: 8, m: 12, l: 20 },
  motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", fast: 140, slow: 320 },
  light: {
    bg: "#f5f3fa", surface: "#ffffff", "surface-2": "#eeebf6", ink: "#1d1631", "ink-2": "#574d6b",
    // The old field border (#b9b0cf) was 2.1:1 on white: a field must be
    // seen at 3:1 (WCAG 1.4.11). The same lavender, darker.
    line: "#dcd6ea", "line-strong": "#8b80a3",
    accent: "#b0124f", "accent-ink": "#ffffff", "accent-soft": "#fbe3ec",
    ok: "#1f7a4d", "ok-soft": "#e4f4ea", wait: "#7a4f00", "wait-soft": "#fff3d6", danger: "#b3261e", "danger-soft": "#fdecea",
    focus: "#5b3fd6", highlight: "#f6c945",
    overlay: "rgb(29 22 49 / 0.45)",
    "shadow-1": "0px 1px 2px rgb(29 22 49 / 0.06), 0px 1px 1px rgb(29 22 49 / 0.04)",
    "shadow-2": "0px 12px 32px -20px rgb(29 22 49 / 0.35), 0px 2px 6px rgb(29 22 49 / 0.06)",
  },
  dark: {
    bg: "#16121f", surface: "#201a2c", "surface-2": "#2a2338", ink: "#f3effa", "ink-2": "#bdb3cf",
    line: "#3b3350", "line-strong": "#7a6f96",
    accent: "#ff8fb8", "accent-ink": "#2a0716", "accent-soft": "#4a1f33",
    ok: "#6fd6a0", "ok-soft": "#173326", wait: "#ffd27a", "wait-soft": "#3a2d10", danger: "#ff8a80", "danger-soft": "#3d1a1c",
    focus: "#b9a6ff",
    // The marigold cannot carry light text: the dark marker is derived
    // (the mark's dot and the stars use the ochre slot, app/tokens.css).
    "shadow-1": "0px 1px 2px rgb(0 0 0 / 0.4)",
    "shadow-2": "0px 12px 32px -12px rgb(0 0 0 / 0.7)",
  },
  palette: {
    // The form colours (text on their page, a form's button) and the kinds
    // of questions in the builder share these slots.
    light: {
      1: { solid: "#3d3fc4", soft: "#f1f1fd", ink: "#3d3fc4" }, // indigo
      2: { solid: "#2c6a31", soft: "#f0f7ee", ink: "#2c6a31" }, // forest
      3: { solid: "#b3470b", soft: "#fff4ec", ink: "#b3470b" }, // tangerine
      5: { solid: "#b0124f", soft: "#fdf0f5", ink: "#b0124f" }, // berry
      6: { solid: "#0b6b6b", soft: "#eef8f7", ink: "#0b6b6b" }, // teal
      8: { solid: "#1d1631", soft: "#f3f2f6", ink: "#1d1631" }, // ink
    },
    dark: {
      1: { solid: "#a9abff", soft: "#15162e", ink: "#a9abff" },
      2: { solid: "#8fd694", soft: "#13200f", ink: "#8fd694" },
      3: { solid: "#ffb07a", soft: "#231710", ink: "#ffb07a" },
      5: { solid: "#ff8fb8", soft: "#221019", ink: "#ff8fb8" },
      6: { solid: "#6fd8d2", soft: "#0f1f1f", ink: "#6fd8d2" },
      7: { solid: "#f6c945" }, // marigold, where it is seen on a dark ground
      8: { solid: "#e8e3f5", soft: "#1a1722", ink: "#e8e3f5" },
    },
  },
};

export const identity: Theme = defineTheme(source);

// The look of this request: the company's choice as the Chest tells it
// (for all its tools, or for this one), else the identity above. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => {
  const look = resolveTheme(await chest.theme(), identity);
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
});

// Whether the page wears Forms' own identity (itself, or the catalogue's
// copy of it once it is there): a form's default colour is then its berry;
// in any other look, the look's own action colour (lib/model.ts shownAccent).
export const ownLook = (look: Look): boolean => look.theme.id === identity.id;
