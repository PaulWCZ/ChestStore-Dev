import * as chest from "@argentic/chest-sdk/chest";
import { contrast } from "@argentic/chest-ui/color";
import { resolveTheme } from "@argentic/chest-ui/runtime";
import { identityOf } from "@argentic/chest-ui/themes";

// The company's brand on the public pages (Proposal (studio): chest.theme(),
// brand mode). When the owner gave the Chest the company's brand, the
// public page wears its logo and its main colour — on the header's mark,
// the main button and links —, derived by the UI kit so every pair stays
// readable (WCAG AA) in light and dark. The five state colours never
// change: they carry meaning, and they are the ones customers learn.
// Any other answer (each tool its own look, a catalogue theme) keeps the
// tool's identity: a theme is for the team's tools, a status page speaks
// for the company only through its brand.

export type BrandLook = { logo: { url: string; alt: string; dark: string | null } | null; css: string | null };

const none: BrandLook = { logo: null, css: null };
const colour = /^#[0-9a-f]{6}$/iu;
// The page's own grounds (app/tokens.css), light and dark: the brand's
// link colour must read on them (4.5:1), not only on the brand's own.
const grounds = { light: ["#eef1f4", "#ffffff"], dark: ["#0c1015", "#141a21"] };

export async function brandLook(): Promise<BrandLook> {
  const own = identityOf("status");
  if (!own) return none;
  const choice = await chest.theme();
  if (choice.mode !== "brand") return none;
  const look = resolveTheme(choice, own);
  if (look.source !== "brand") return none;
  const vars = (scheme: Record<string, string>, on: string[]) => {
    const brand = scheme["accent"], ink = scheme["accent-ink"], text = scheme["accent-text"];
    if (!brand || !ink || !text || !colour.test(brand) || !colour.test(ink) || !colour.test(text)) return null;
    if (contrast(ink, brand) < 4.5 || on.some(g => contrast(text, g) < 4.5)) return null;
    return `--brand:${brand};--brand-ink:${ink};--brand-text:${text};`;
  };
  const light = vars(look.theme.light as Record<string, string>, grounds.light), dark = vars(look.theme.dark as Record<string, string>, grounds.dark);
  const css = light && dark ? `.public{${light}}@media (prefers-color-scheme: dark){.public{${dark}}}` : null;
  return { logo: look.logo ? { url: look.logo.url, alt: look.logo.alt, dark: look.logo.dark ?? null } : null, css };
}
