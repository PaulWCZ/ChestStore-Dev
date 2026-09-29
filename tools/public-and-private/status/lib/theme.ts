import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// The tool's own identity (DESIGN.md), "Control room": calm and exact —
// cool grey paper, near-black ink, and state colours that never go alone.
// It is a theme of the kit's contract, checked like the catalogue's
// (test/theme.test.ts), and the very same source as the catalogue's
// "control-room" theme (the test holds the two equal), so Status in its own
// look and another tool wearing "Control room" look alike. Its fonts are
// the tool's own files in public/fonts/ (served at /fonts). Every colour of
// the look is here; the CSS names only the contract's tokens (and
// app/tokens.css, defined from them). The five state colours are not part
// of any look: they are meaning, fixed in every theme (lib/states.ts).
export const identity = defineTheme({
  id: "control-room", tool: "status",
  name: { en: "Control room", fr: "Salle de contrôle" },
  description: { en: "Calm and exact: cool grey, near-black ink, state colours that never go alone.", fr: "Calme et exact : gris froid, encre presque noire, des couleurs d’état jamais seules." },
  fonts: { display: "red-hat-text", body: "red-hat-text", mono: "red-hat-mono" },
  display: { weight: 700 },
  type: { xl: 1.625, xxl: 2.125 },
  radius: { s: 4, m: 6, l: 10 },
  motion: { slow: 220 },
  light: { bg: "#eef1f4", surface: "#ffffff", "surface-2": "#e3e8ed", ink: "#0f1419", "ink-2": "#4a5561", line: "#d3dae1", accent: "#0f1419", "accent-ink": "#ffffff", "accent-soft": "#d8e4f3", "accent-text": "#0b5cad", focus: "#1f66c7", ok: "#0a6b4a", "ok-soft": "#e3f4ec", wait: "#7d5800", "wait-soft": "#fbf3dc", danger: "#b3261e", "danger-soft": "#fde8e4", "danger-ink": "#a8260f", "shadow-1": "0px 1px 0px rgb(15 20 25 / 0.04), 0px 1px 3px rgb(15 20 25 / 0.06)", "shadow-2": "0px 8px 24px rgb(15 20 25 / 0.16)" },
  dark: { bg: "#0c1015", surface: "#141a21", "surface-2": "#1c232c", ink: "#e7ecf1", "ink-2": "#9aa7b4", line: "#26303b", accent: "#e7ecf1", "accent-ink": "#0f1419", "accent-soft": "#1f3552", "accent-text": "#7cb4ff", focus: "#7cb4ff", ok: "#5fd3a2", "ok-soft": "#10261d", wait: "#eac767", "wait-soft": "#2a2210", danger: "#f2665a", "danger-soft": "#2e1412", "danger-ink": "#f78b81", "shadow-1": "0px 1px 0px rgb(0 0 0 / 0.3)", "shadow-2": "0px 8px 24px rgb(0 0 0 / 0.5)" },
  palette: {
    // The Okabe–Ito states, as categories. Slot 5 is the kit's pink: the
    // status page's vermilion is its danger, and a red slot 5 left the
    // pink family (0.2.1).
    light: { 1: { solid: "#1f66c7", soft: "#e2ecfa", ink: "#1a55a6" }, 2: { solid: "#0a7f58", soft: "#e3f4ec", ink: "#0a6b4a" }, 3: { solid: "#c95a0a", soft: "#fdeee3", ink: "#a54808" }, 7: { solid: "#a87700", soft: "#fbf3dc", ink: "#7d5800" } },
    dark: { 1: { solid: "#5b9cf0", soft: "#111f33", ink: "#8bbaf6" }, 2: { solid: "#3fbf8a", soft: "#10261d", ink: "#5fd3a2" }, 3: { solid: "#f08a3c", soft: "#2d1b0f", ink: "#f6a769" }, 7: { solid: "#e0b33a", soft: "#2a2210", ink: "#eac767" } },
  },});

// The look of this request, for every page of the tool. The team's pages
// (a member is asserted): the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. The public
// pages (the status page, its incidents and history, /embed, the badge):
// the company's brand when it has one, else Status's own look — never a
// catalogue theme chosen for the team's tools, never the Chest's sheet
// (kit 0.2.3, `surface: "public"`; critique round 2, N5). Never throws:
// the Chest unreachable, or a choice the kit cannot honour, is the
// identity. Asked once per request, however many components need it.
export async function lookOf(surface: "team" | "public"): Promise<Look> {
  const look = resolveTheme(await chest.theme(), identity, { surface });
  if (look.problem) console.warn(`theme: ${look.problem}; the tool's own look is used`);
  return look;
}

// (session.ts is loaded here, not at the top: it needs a request, and the
// tests read lookOf without one.)
export const currentLook = cache(async (): Promise<Look> => {
  const { currentMember } = await import("./session.ts");
  return lookOf((await currentMember()) ? "team" : "public");
});
