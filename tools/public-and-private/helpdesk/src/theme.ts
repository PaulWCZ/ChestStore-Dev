import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import { defineTheme, type Theme } from "@argentic/chest-ui";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { log } from "@argentic/chest-app";

// Support's own identity (DESIGN.md), "Calm counter": mint-white paper,
// deep teal, a coral warmth for customers, butter-yellow team notes, and
// Atkinson Hyperlegible everywhere — made to be read by everyone. It is a
// theme of the kit's contract, the same as the catalogue's "counter"
// (test/theme.test.ts holds them equal), checked like every theme. Every
// colour of the tool is here; its CSS names only the contract's tokens
// (src/tokens.css, src/styles.css). Its font is the tool's own files in
// public/assets/fonts/ (served at /assets/fonts).
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

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. The public
// pages (the contact form, a request's follow-up) wear the company's brand
// when it has one, else Support's own identity — never a catalogue theme
// chosen for the team, never the Chest's sheet (kit surface "public"):
// the customer is on the company's page. Never throws: the Chest
// unreachable, or a choice the kit cannot honour, is the identity.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the public ones (createApp's look,
// src/app.tsx) —, never an inline <style>: the strictest policy admits it.
// Its link carries the sheet's hash (?v=…), so a browser keeps it until
// the company chooses another look. chest.theme() keeps the Chest's answer
// a minute; the sheet of one answer is written once and kept beside it.
export type Sheet = { look: Look; css: string; etag: string; colors: { media: string; color: string }[] };
type Surface = "team" | "public";
const written = new WeakMap<object, Partial<Record<Surface, Sheet>>>();

export async function sheetOf(surface: Surface): Promise<Sheet> {
  const choice = await chest.theme();
  const kept = written.get(choice) ?? {};
  const found = kept[surface];
  if (found) return found;
  const look = resolveTheme(choice, identity, { surface, ownFonts: "/assets/fonts" });
  if (look.problem) log.warn("theme not usable: the tool's own look is used", { problem: look.problem });
  const css = lookCss(look);
  const sheet: Sheet = { look, css, etag: createHash("sha256").update(css).digest("base64url").slice(0, 16), colors: lookColors(look) };
  written.set(choice, { ...kept, [surface]: sheet });
  return sheet;
}

// The look as createApp serves it: the sheet, the browser bar's colours,
// the company's logo (brand mode) for the layouts.
export async function lookOf(surface: Surface): Promise<{ css: string; colors: { media: string; color: string }[]; logo: Look["logo"] }> {
  const sheet = await sheetOf(surface);
  return { css: sheet.css, colors: sheet.colors, logo: sheet.look.logo };
}

// The looks as the tests and the pages read them.
export const currentLook = async (): Promise<Look> => (await sheetOf("team")).look;
export const publicLook = async (): Promise<Look> => (await sheetOf("public")).look;
