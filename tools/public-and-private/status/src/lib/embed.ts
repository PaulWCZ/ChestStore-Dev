import { contrast } from "@argentic/chest-ui/color";
import type { Look } from "@argentic/chest-ui/runtime";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { Incident } from "./incidents.ts";
import type { State } from "./model.ts";
import { stateColours } from "./states.ts";
import { pick } from "./texts.ts";

// The status banner: one line — the page's state and what is happening —
// that the company's own site shows in a frame:
//   <iframe src="https://status…/embed" title="Service status" height="64"></iframe>
// Only the sites an editor listed (Settings) may frame it: they are its
// Content-Security-Policy's frame-ancestors, 'none' until one is listed
// (src/app.tsx). No script, no inline style: its small stylesheet is
// /embed.css; light or dark as the reader's system says, or
// ?theme=light|dark; ?lang=en|fr, else the browser's languages. Its link
// opens the status page in a new tab. It is a small picture of the state,
// like the badge: its own neutral grounds and the state colours
// (lib/states.ts, the same in every look); only its focus ring wears the
// company's colour, when the Chest gives its brand and that colour is seen
// on the banner's ground (3:1).
const solid = (mode: "light" | "dark") => Object.fromEntries(Object.entries(stateColours[mode]).flatMap(([k, v]) => (typeof v === "string" ? [] : [[k, v.solid]])));
const colours = {
  light: { bg: "#ffffff", ink: "#0f1419", ink2: "#4a5561", line: "#d3dae1", focus: stateColours.light.maintenance.solid, ...solid("light"), none: "#8a96a3" },
  dark: { bg: "#141a21", ink: "#e7ecf1", ink2: "#9aa7b4", line: "#2c3642", focus: stateColours.dark.maintenance.solid, ...solid("dark"), none: "#6b7785" },
};
type Palette = Record<string, string>;
export type EmbedTheme = "light" | "dark" | "auto";

const escape = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const vars = (c: Palette) => Object.entries(c).map(([k, v]) => `--${k}:${v}`).join(";");

export const embedTheme = (value: string | undefined): EmbedTheme => (value === "light" || value === "dark" ? value : "auto");

// The banner's stylesheet, for a look (its brand's focus colour) and a theme.
export function embedCss(look: Look, theme: EmbedTheme): string {
  const focus = (mode: "light" | "dark") => {
    const brand = look.source === "brand" ? look.theme[mode].focus : null;
    return brand && /^#[0-9a-f]{6}$/iu.test(brand) && contrast(brand, colours[mode].bg) >= 3 ? { ...colours[mode], focus: brand } : colours[mode];
  };
  const palette = { light: focus("light"), dark: focus("dark") };
  const scheme = theme === "dark" ? `:root{${vars(palette.dark)}}` : theme === "light" ? `:root{${vars(palette.light)}}` : `:root{${vars(palette.light)}}@media (prefers-color-scheme: dark){:root{${vars(palette.dark)}}}`;
  return `${scheme}*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:500 14px/1.35 "Red Hat Text Variable","Segoe UI",system-ui,sans-serif}`
    + `a{display:flex;align-items:center;gap:10px;min-height:44px;padding:10px 14px;color:inherit;text-decoration:none;border:1px solid var(--line);border-left:6px solid var(--s);border-radius:8px;background:var(--bg)}`
    + `a:hover strong,a:focus-visible strong{text-decoration:underline}a:focus-visible{outline:3px solid var(--focus);outline-offset:-3px}`
    + `svg{flex:none;width:18px;height:18px;color:var(--s)}strong{display:block;font-weight:700;color:var(--ink)}span{display:block;color:var(--ink2);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`
    + `.w{min-width:0}.s-operational{--s:var(--operational)}.s-maintenance{--s:var(--maintenance)}.s-degraded{--s:var(--degraded)}.s-partial{--s:var(--partial)}.s-major{--s:var(--major)}.s-none{--s:var(--none)}`;
}

// The banner's page: its stylesheet's address carries the theme and the
// language (a cache keeps one per pair) and the hash of the sheet (a new
// brand colour is a new address).
export function embedHtml({ state, open, origin, locale, t, theme, sheet }: { state: State | "none"; open: Incident[]; origin: string; locale: Locale; t: Catalogue; theme: EmbedTheme; sheet: string }): string {
  const first = open[0];
  const title = state === "none" ? t.public.setupTitle : t.banner[state];
  const line = first ? pick(first.title, first.titleSecond, first, locale) : { text: t.public.widgetOpen, lang: locale };
  const icon = state === "operational"
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7v6M12 16.5v.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(t.public.widgetTitle)}</title><link rel="stylesheet" href="/embed.css?theme=${theme}&amp;v=${escape(sheet)}"></head>`
    + `<body><a class="s-${state}" href="${escape(origin)}/" target="_blank" rel="noopener">${icon}<span class="w"><strong>${escape(title)}</strong><span${line.lang !== locale ? ` lang="${line.lang}"` : ""}>${escape(line.text)}</span></span></a></body></html>`;
}
