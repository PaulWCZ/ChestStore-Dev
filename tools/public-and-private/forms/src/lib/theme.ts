import { createHash } from "node:crypto";
import { chest } from "@argentic/chest-sdk/chest";
import type { Theme } from "@argentic/chest-ui/contract";
import { lookColors, lookCss, resolveTheme, type Look } from "@argentic/chest-ui/runtime";
import { identityOf } from "@argentic/chest-ui/themes";
import { log } from "@argentic/chest-app";

// Forms' own identity (DESIGN.md), "Invitation": a conversation on paper —
// lavender mist, aubergine ink, one berry that says "this is the one thing
// to do", a marigold dot of warmth, a generous serif for the questions. It
// is the catalogue's theme of the same name (the kit's 20th, 0.2.2) — one
// source, so the tool's own look and the look a company picks from the
// catalogue are the same (checked against the contract in
// test/theme.test.ts). Its fonts, DM Serif Display and DM Sans, are in the
// kit's registry; the files are the tool's own in public/assets/fonts/ (served at
// /assets/fonts), the kit writes their @font-face (with a unicode-range, so the
// latin and latin-ext files of one face no longer hide each other).
//
// The six colours a form may take (Settings → How it looks) are slots of
// the categorical palette (lib/model.ts formSlots): the catalogue sets them
// to the exact colours Forms always had — berry is the pink family, indigo
// the blue, teal the teal, tangerine the orange, forest the green, ink
// the slate — so a form keeps its colour in any theme, in that theme's
// own shade of the family. Every colour of the tool is there; its CSS
// names only the contract's tokens and its own tokens made of them
// (app/tokens.css).
const own = identityOf("forms");
if (!own) throw new Error("the UI kit's catalogue has no identity for forms");
export const identity: Theme = own;

// The look of a surface: the company's choice as the Chest tells it (for
// all its tools, or for this one), else the identity above. The public
// pages (a public form, the button a website pastes) wear the company's
// brand when it has one, else Forms' own identity — never a catalogue
// theme chosen for the team, never the Chest's sheet (kit surface
// "public"). A team form in the Chest is the team's surface. Never
// throws: the Chest unreachable, or a choice the kit cannot honour, is
// the identity.
//
// The look is a stylesheet the tool serves itself — /chest/look.css for
// the team's pages, /look.css for the public ones (createApp's look,
// src/app.tsx) —, never an inline <style>: the strictest policy admits it.
// Its link carries the sheet's hash (?v=…), so a browser keeps it until the
// company chooses another look. chest.theme() keeps the Chest's answer a
// minute; the sheet of one answer is written once and kept beside it.
export type Sheet = { look: Look; css: string; etag: string; colors: { media: string; color: string }[] };
export type Surface = "team" | "public";
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

export const publicLook = async (): Promise<Look> => (await sheetOf("public")).look;
export const teamLook = async (): Promise<Look> => (await sheetOf("team")).look;

// Whether the page wears Forms' own identity (its own look, or Invitation
// chosen from the catalogue: one and the same): a form's default colour is
// then its berry; in any other look, the look's own action colour
// (src/shared/model.ts shownAccent), and its pages say data-look="chosen".
export const ownLook = (look: Look): boolean => look.theme.id === identity.id;
