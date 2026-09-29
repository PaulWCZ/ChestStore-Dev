import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Workshop": warm paper, ink
// outlines, sun yellow, hard shadows. It is a theme of the kit's contract,
// checked like the catalogue's (test/theme.test.ts), and the very same
// source as the catalogue's "workshop" theme (the test holds the two
// equal), so Tasks in its own look and another tool wearing "Workshop"
// look alike. Its fonts are the tool's own files in public/fonts/ (served
// at /fonts). Every colour of the tool is here; its CSS names only the
// contract's tokens.
export const identity = defineTheme({
  id: "workshop", tool: "tasks",
  name: { en: "Workshop", fr: "Atelier" },
  description: { en: "Bright and sturdy: warm paper, ink outlines, sun yellow, hard shadows.", fr: "Vif et solide : papier chaud, contours à l’encre, jaune soleil, ombres franches." },
  fonts: { display: "space-grotesk", body: "inter" },
  display: { weight: 700, tracking: "-0.01em" },
  radius: { s: 6, m: 10, l: 14 }, border: 2,
  motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", slow: 220 },
  type: { xl: 1.75, xxl: 2.25 },
  light: { bg: "#fff8e7", surface: "#ffffff", "surface-2": "#fdf0cf", ink: "#151515", "ink-2": "#5b574e", line: "#e6dcc4", "line-strong": "#151515", accent: "#ffd84d", "accent-ink": "#151515", "accent-line": "#151515", "accent-soft": "#fff1bf", "accent-text": "#1f4bff", ok: "#1d7a3a", danger: "#c2290f", focus: "#1f4bff", overlay: "rgb(21 21 21 / 0.45)", "shadow-1": "3px 3px 0px #151515", "shadow-2": "5px 5px 0px #151515" },
  dark: { bg: "#161512", surface: "#201f1b", "surface-2": "#2b2923", ink: "#f4efe3", "ink-2": "#b9b2a3", line: "#3a372f", "line-strong": "#f4efe3", accent: "#ffd84d", "accent-ink": "#151515", "accent-soft": "#33301f", "accent-text": "#8fa8ff", ok: "#7bd98f", danger: "#ff8c73", focus: "#8fa8ff", overlay: "rgb(0 0 0 / 0.6)", "shadow-1": "3px 3px 0px #000000", "shadow-2": "5px 5px 0px #000000" },
  palette: {
    chroma: 1.25,
    // The board and label colours: bright fills with ink on them. Slots
    // (the same families in every theme): 1 sky, 2 leaf, 3 tomato,
    // 4 grape, 5 berry, 6 sea, 7 sun, 8 slate (and sand: app/tokens.css).
    light: { 1: { soft: "#5bb4ff", ink: "#151515" }, 2: { soft: "#7bd05b", ink: "#151515" }, 3: { soft: "#ff7a59", ink: "#151515" }, 4: { soft: "#b9a3ff", ink: "#151515" }, 5: { soft: "#f266a8", ink: "#151515" }, 6: { soft: "#2fc6b5", ink: "#151515" }, 7: { soft: "#ffd84d", ink: "#151515" }, 8: { soft: "#c3cad2", ink: "#151515" } },
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
