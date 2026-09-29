import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The wiki's own identity (DESIGN.md), "Library": warm paper, ink, one deep
// green, a reading serif (Newsreader) for titles and pages and a sober sans
// (Source Sans 3) for the interface around them. It is a theme of the kit's
// contract, checked like the catalogue's (test/theme.test.ts), and the same
// as the catalogue's "library" (the test holds them equal): a company that
// picks Library for all its tools gets exactly this. Every colour of the
// tool is here; its CSS names only the contract's tokens (app/tokens.css).
//
// The spaces' colours are the categorical slots (green 2, blue 1, plum 4,
// rust 3, ochre 7, slate 8), tuned here to the spines the wiki always had.
// Its fonts are the tool's own files in public/fonts/ (served at /fonts).
export const identity = defineTheme({
  id: "library", tool: "wiki",
  name: { en: "Library", fr: "Bibliothèque" },
  description: { en: "Calm and literate: warm paper, a reading serif, one deep green.", fr: "Calme et lettré : papier chaud, un sérif de lecture, un vert profond." },
  fonts: { display: "newsreader", body: "source-sans-3", accent: "newsreader" },
  display: { weight: 600, tracking: "-0.01em" },
  type: { xs: 0.8125, s: 0.9375, m: 1.0625, l: 1.3125, xl: 1.75, xxl: 2.5 },
  radius: { s: 5, m: 8, l: 14 },
  light: { bg: "#faf6ee", surface: "#fffdf8", "surface-2": "#f3eee2", ink: "#23201a", "ink-2": "#5d574b", line: "#e2d9c7", accent: "#1d5b43", "accent-ink": "#ffffff", "accent-soft": "#e3ede5", danger: "#a93226", "danger-soft": "#f8e1dc", ok: "#1d6b3a", "ok-soft": "#e3f0e2", focus: "#1d5b43", highlight: "#f6e3a1", "shadow-1": "0px 1px 0px rgb(60 45 20 / 0.06)", "shadow-2": "0px 10px 30px rgb(60 45 20 / 0.14), 0px 2px 6px rgb(60 45 20 / 0.06)" },
  dark: { bg: "#16140f", surface: "#211e18", "surface-2": "#2a261e", ink: "#ece5d6", "ink-2": "#b3aa98", line: "#343026", accent: "#8fcfae", "accent-ink": "#0d2419", "accent-soft": "#22362b", danger: "#ff9b8a", "danger-soft": "#3d201b", ok: "#9fdcad", "ok-soft": "#1f3524", focus: "#8fcfae", highlight: "#5c4a14" },
  palette: {
    chroma: 0.8,
    // The spaces' spines.
    light: { 1: { solid: "#2d5b8a" }, 2: { solid: "#2f6e4f" }, 3: { solid: "#a2502c" }, 4: { solid: "#7a3f6b" }, 7: { solid: "#a0700f" }, 8: { solid: "#55616c" } },
    dark: { 1: { solid: "#7fa9d6" }, 2: { solid: "#74b793" }, 3: { solid: "#df8e68" }, 4: { solid: "#c690b8" }, 7: { solid: "#d9ad55" }, 8: { solid: "#9aa8b4" } },
  },
});

// The look of this request: the company's choice as the Chest tells it
// (for all its tools, or for this one), else the identity above. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request, however many components need it.
export const currentLook = cache(async (): Promise<Look> => {
  const look = resolveTheme(await chest.theme(), identity);
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
});
