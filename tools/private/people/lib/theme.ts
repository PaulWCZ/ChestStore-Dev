import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Portrait gallery": cream walls,
// terracotta, deep plum ink, and portraits set in arches of warm tints. It
// is a theme of the kit's contract, checked like the catalogue's
// (test/theme.test.ts), and the very same source as the catalogue's
// "gallery" theme (the test holds the two equal): a company that picks
// "Portrait gallery" for all its tools gets exactly People's look. Every
// colour of the tool is here; its CSS names only the contract's tokens and
// the tool's own tokens of app/tokens.css, defined from them.
//
// The arches behind portraits are the categorical palette's soft grounds
// (slots 2 to 7: green, terracotta, violet, pink, teal, ochre), so a team
// keeps its family of colour in any theme. Its font (Outfit) is the tool's
// own file in public/fonts/ (served at /fonts).
export const identity = defineTheme({
  id: "gallery", tool: "people",
  name: { en: "Portrait gallery", fr: "Galerie de portraits" },
  description: { en: "Warm and welcoming: cream walls, terracotta, deep plum ink.", fr: "Chaleureux et accueillant : murs crème, terre cuite, encre prune." },
  fonts: { display: "outfit", body: "outfit" },
  display: { weight: 600, tracking: "-0.01em" },
  type: { xs: 0.8125, s: 0.9375, m: 1.0625, l: 1.3125, xl: 1.875, xxl: 2.5 },
  radius: { s: 10, m: 14, l: 24 },
  motion: { fast: 140, slow: 260 },
  light: { bg: "#fbf5ec", surface: "#fffdf9", "surface-2": "#f4ebdf", ink: "#3a1f3d", "ink-2": "#6b5169", line: "#eadfd0", accent: "#b4472a", "accent-ink": "#ffffff", "accent-text": "#a3401f", "accent-soft": "#f7e3d6", danger: "#b3261e", ok: "#2f6b4a", "ok-soft": "#dcebdf", focus: "#b4472a", "shadow-1": "0px 1px 2px rgb(58 31 61 / 0.06), 0px 2px 8px rgb(58 31 61 / 0.04)", "shadow-2": "0px 12px 32px rgb(58 31 61 / 0.14)" },
  dark: { bg: "#1d1420", surface: "#281c2c", "surface-2": "#332537", ink: "#f6ede4", "ink-2": "#cbb8c8", line: "#3f2f43", accent: "#f08e6a", "accent-ink": "#2a1410", "accent-text": "#f08e6a", "accent-soft": "#432a2b", danger: "#ff9a8a", ok: "#7fc79c", "ok-soft": "#22382b", focus: "#f08e6a" },
  palette: {
    chroma: 0.85,
    // The arches behind portraits.
    light: { 2: { soft: "#d8e5d0" }, 3: { soft: "#f3d9c9" }, 4: { soft: "#e6d6e6" }, 5: { soft: "#f4d4d9" }, 6: { soft: "#d3e3e6" }, 7: { soft: "#f1e2b8" } },
    dark: { 2: { soft: "#2f4632" }, 3: { soft: "#5a3226" }, 4: { soft: "#4a3350" }, 5: { soft: "#56303a" }, 6: { soft: "#28444a" }, 7: { soft: "#54452a" } },
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
