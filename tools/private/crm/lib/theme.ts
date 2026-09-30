import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Sales desk": dense and precise —
// cool slate, one electric blue, figures in IBM Plex Mono. It is a theme of
// the kit's contract, checked like the catalogue's (test/theme.test.ts),
// and the very same source as the catalogue's "sales-desk" theme (the test
// holds the two equal), so Clients in its own look and another tool
// wearing "Sales desk" look alike. Its fonts are the tool's own files in
// public/fonts/ (served at /fonts). Every colour of the tool is here; its
// CSS names only the contract's tokens (and app/tokens.css, defined from
// them).
export const identity = defineTheme({
  id: "sales-desk", tool: "crm",
  name: { en: "Sales desk", fr: "Bureau des ventes" },
  description: { en: "Dense and precise: cool slate, one electric blue, figures in a monospace.", fr: "Dense et précis : ardoise froide, un bleu électrique, chiffres en chasse fixe." },
  fonts: { display: "ibm-plex-sans", body: "ibm-plex-sans", mono: "ibm-plex-mono" },
  display: { weight: 600 },
  type: { xs: 0.75, s: 0.8125, m: 0.9375, l: 1.125, xl: 1.5, xxl: 2 },
  radius: { s: 3, m: 6, l: 10 },
  light: { bg: "#f4f6f9", surface: "#ffffff", "surface-2": "#eef1f5", ink: "#0f1722", "ink-2": "#3b4656", line: "#d5dbe3", accent: "#2152ff", "accent-ink": "#ffffff", "accent-soft": "#e6ecff", "accent-text": "#1a3fe0", ok: "#0f7a3d", "ok-soft": "#e3f5ea", danger: "#c4231c", "danger-soft": "#fde8e7", wait: "#9a5200", "wait-soft": "#fff1db", overlay: "rgb(11 15 21 / 0.45)", "shadow-1": "0px 1px 0px rgb(15 23 34 / 0.06), 0px 1px 2px rgb(15 23 34 / 0.06)", "shadow-2": "0px 8px 24px rgb(15 23 34 / 0.14), 0px 2px 6px rgb(15 23 34 / 0.08)" },
  dark: { bg: "#0b0f15", surface: "#121821", "surface-2": "#19212c", ink: "#e6ebf2", "ink-2": "#b3bdca", line: "#263140", accent: "#6f8cff", "accent-ink": "#0b0f15", "accent-soft": "#19213a", "accent-text": "#9db0ff", ok: "#4ade80", "ok-soft": "#0f2a1a", danger: "#ff7b72", "danger-soft": "#2d1414", wait: "#f0b35a", "wait-soft": "#2a1f0d", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.4)", "shadow-2": "0px 10px 30px rgb(0 0 0 / 0.55)" },
  palette: { chroma: 1.05 },
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
