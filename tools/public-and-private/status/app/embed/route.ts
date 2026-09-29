import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { db } from "../../lib/db.ts";
import { catalogue, isLocale, publicLocale } from "../../lib/i18n/index.ts";
import { pageSettings } from "../../lib/page-settings.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { publicSummary } from "../../lib/public-summary.ts";
import { pick } from "../../lib/texts.ts";

// The status widget: one line — the page's state and what is happening —
// that the company's own site shows in a frame:
//   <iframe src="https://status…/embed" title="Service status" height="64"></iframe>
// Only the sites an editor listed (Settings) may frame it: they are its
// Content-Security-Policy's frame-ancestors, 'none' until one is listed.
// No script; its own small style sheet (with a nonce); light or dark as the
// reader's system says, or ?theme=light|dark; ?lang=en|fr, else the
// browser's languages. Its link opens the status page in a new tab.
const colours = {
  light: { bg: "#ffffff", ink: "#0f1419", ink2: "#4a5561", line: "#d3dae1", operational: "#0a7f58", maintenance: "#1f66c7", degraded: "#a87700", partial: "#c95a0a", major: "#c42d17", none: "#8a96a3" },
  dark: { bg: "#141a21", ink: "#e7ecf1", ink2: "#9aa7b4", line: "#2c3642", operational: "#3fbf8a", maintenance: "#5b9cf0", degraded: "#e0b33a", partial: "#f08a3c", major: "#f2665a", none: "#6b7785" },
};
type Palette = (typeof colours)["light"];

const escape = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const vars = (c: Palette) => Object.entries(c).map(([k, v]) => `--${k}:${v}`).join(";");

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const asked = query.get("lang");
  const locale = isLocale(asked) ? asked : publicLocale(undefined, request.headers.get("accept-language"));
  const theme = query.get("theme");
  const t = catalogue(locale);
  const [{ state, open }, settings] = await Promise.all([publicSummary(), pageSettings(db())]);
  const origin = publicOrigin(await headers()) ?? "";
  const first = open[0];
  const title = state === "none" ? t.public.setupTitle : t.banner[state];
  const line = first ? pick(first.title, first.titleSecond, first, locale) : { text: t.public.widgetOpen, lang: locale };
  const nonce = randomBytes(16).toString("base64");
  const scheme = theme === "dark" ? `:root{${vars(colours.dark)}}` : theme === "light" ? `:root{${vars(colours.light)}}` : `:root{${vars(colours.light)}}@media (prefers-color-scheme: dark){:root{${vars(colours.dark)}}}`;
  const css = `${scheme}*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:500 14px/1.35 "Red Hat Text Variable","Segoe UI",system-ui,sans-serif}`
    + `a{display:flex;align-items:center;gap:10px;min-height:44px;padding:10px 14px;color:inherit;text-decoration:none;border:1px solid var(--line);border-left:6px solid var(--s);border-radius:8px;background:var(--bg)}`
    + `a:hover strong,a:focus-visible strong{text-decoration:underline}a:focus-visible{outline:3px solid var(--maintenance);outline-offset:-3px}`
    + `svg{flex:none;width:18px;height:18px;color:var(--s)}strong{display:block;font-weight:700}span{display:block;color:var(--ink2);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`
    + `.w{min-width:0}.s-operational{--s:var(--operational)}.s-maintenance{--s:var(--maintenance)}.s-degraded{--s:var(--degraded)}.s-partial{--s:var(--partial)}.s-major{--s:var(--major)}.s-none{--s:var(--none)}`;
  const icon = state === "operational"
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7v6M12 16.5v.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(t.public.widgetTitle)}</title><style nonce="${nonce}">${css}</style></head>`
    + `<body><a class="s-${state}" href="${escape(origin)}/" target="_blank" rel="noopener">${icon}<span class="w"><strong>${escape(title)}</strong><span${line.lang !== locale ? ` lang="${line.lang}"` : ""}>${escape(line.text)}</span></span></a></body></html>`;
  const ancestors = settings.embedSites.length ? settings.embedSites.join(" ") : "'none'";
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`,
      "Cache-Control": "public, max-age=30",
      ...(isLocale(asked) ? {} : { Vary: "Accept-Language" }),
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
