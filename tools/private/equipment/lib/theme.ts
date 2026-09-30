import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Tool crib": steel shelves, utility
// orange tags, printed labels. It is a theme of the kit's contract, checked
// like the catalogue's (test/theme.test.ts), and the very same source as the
// catalogue's "labels" theme (the test holds the two equal), so Equipment in
// its own look and another tool wearing "Tool crib" look alike. Its fonts
// are the tool's own files in public/fonts/ (served at /fonts). Every colour
// of the tool is here; its CSS names only the contract's tokens (and its own
// tokens defined from them, app/tokens.css).
export const identity = defineTheme({
  id: "labels", tool: "equipment",
  name: { en: "Tool crib", fr: "Magasin d’outillage" },
  description: { en: "Sturdy and orderly: steel shelves, utility orange tags, printed labels.", fr: "Solide et rangé : étagères d’acier, étiquettes orange, marquages imprimés." },
  fonts: { display: "ibm-plex-sans", body: "ibm-plex-sans", mono: "ibm-plex-mono" },
  display: { weight: 700 },
  radius: { s: 4, m: 6, l: 10 },
  light: { bg: "#f4f2ee", surface: "#ffffff", "surface-2": "#eceae4", ink: "#1b1f22", "ink-2": "#56606a", line: "#d9d5cc", "line-strong": "#1b1f22", accent: "#c2410c", "accent-ink": "#ffffff", "accent-soft": "#fde6d6", focus: "#1f6fb2", danger: "#b3261e", "danger-soft": "#fbe3e1", ok: "#1e7a45", "ok-soft": "#e1f2e7", wait: "#9a4a00", "wait-soft": "#fdebd8", "shadow-1": "0px 1px 0px rgb(27 31 34 / 0.08)", "shadow-2": "0px 12px 32px rgb(20 25 30 / 0.22)" },
  dark: { bg: "#14181b", surface: "#1d2226", "surface-2": "#262c31", ink: "#eef1f3", "ink-2": "#a9b4bd", line: "#353d44", "line-strong": "#8c99a4", accent: "#ff8a4c", "accent-ink": "#1b1f22", "accent-soft": "#3a2a20", focus: "#8cc2f0", danger: "#ff9b93", "danger-soft": "#3b2020", ok: "#7fd6a0", "ok-soft": "#1f3328", wait: "#ffb37a", "wait-soft": "#3a2a1c" },
  palette: {
    // The statuses' tags: in use (blue), retired (steel).
    light: { 1: { solid: "#245a86", soft: "#e0ebf5" }, 8: { solid: "#5b636a", soft: "#e9e9e7" } },
    dark: { 1: { solid: "#8cc2f0", soft: "#1e2d3b" }, 8: { solid: "#b7bfc6", soft: "#2b3035" } },
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
