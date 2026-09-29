import * as chest from "@argentic/chest-sdk/chest";
import { defineTheme, type Theme } from "@argentic/chest-ui";
import { resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { cache } from "react";

// Support's own identity (DESIGN.md), "Calm counter": mint-white paper,
// deep teal, a coral warmth for customers, butter-yellow team notes, and
// Atkinson Hyperlegible everywhere — made to be read by everyone. It is a
// theme of the kit's contract, the same as the catalogue's "counter"
// (test/theme.test.ts holds them equal), checked like every theme. Every
// colour of the tool is here; its CSS names only the contract's tokens.
export const identity: Theme = defineTheme({
  id: "counter", tool: "helpdesk",
  name: { en: "Calm counter", fr: "Comptoir calme" },
  description: { en: "Calm and legible: mint-white paper, deep teal, coral warmth, a typeface made for everyone.", fr: "Calme et lisible : papier blanc menthe, sarcelle profond, chaleur corail, une police faite pour tous." },
  fonts: { display: "atkinson-hyperlegible", body: "atkinson-hyperlegible" },
  display: { weight: 700 },
  type: { xs: 0.8125, s: 0.9, m: 1.0625, l: 1.3, xl: 1.75, xxl: 2.25 },
  radius: { s: 8, m: 14, l: 22 },
  motion: { ease: "cubic-bezier(0.2, 0.8, 0.2, 1)", slow: 220 },
  light: { bg: "#f3f7f6", surface: "#ffffff", "surface-2": "#e8f1ef", ink: "#12302f", "ink-2": "#4a6361", line: "#d3e2df", accent: "#0b6e69", "accent-ink": "#ffffff", "accent-soft": "#ddefec", danger: "#b3261e", focus: "#0b6e69", highlight: "#fff1b8", overlay: "rgb(18 48 47 / 0.4)", "shadow-1": "0px 1px 2px rgb(18 48 47 / 0.06), 0px 4px 16px rgb(18 48 47 / 0.06)", "shadow-2": "0px 10px 30px rgb(18 48 47 / 0.14)" },
  dark: { bg: "#0f1c1c", surface: "#172726", "surface-2": "#1e3a37", ink: "#e6f2f0", "ink-2": "#a7c1be", line: "#2b4744", accent: "#5fd3c8", "accent-ink": "#0f1c1c", "accent-soft": "#1e3a37", danger: "#ff9a85", focus: "#5fd3c8", highlight: "#2f2a14", "shadow-1": "none" },
  palette: {
    // The customer's coral (slot 3, the orange family) and the team's
    // butter notes (slot 7, ochre).
    light: { 3: { soft: "#ffd9cf" }, 7: { soft: "#fff1b8" } },
    dark: { 3: { soft: "#3b2a26" }, 7: { soft: "#2f2a14" } },
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

// The look of a public page (the contact form, a request's follow-up): the
// company's brand when it has one, else the tool's own identity — never a
// catalogue theme chosen for the team, never the Chest's sheet (kit 0.2.3,
// surface "public").
export const publicLook = cache(async (): Promise<Look> => resolveTheme(await chest.theme(), identity, { surface: "public" }));
