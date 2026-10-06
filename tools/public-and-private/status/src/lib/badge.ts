import { contrast } from "@argentic/chest-ui/color";
import type { Look } from "@argentic/chest-ui/runtime";
import type { State } from "./model.ts";
import { stateColours } from "./states.ts";

// A status badge: a small picture any site, README or intranet shows with
// an <img>, in the style of the badges developers know ("status | All
// systems operational"). An SVG with no script, no link, no style sheet and
// no outside reference: it is only a picture. Its colours are the state
// colours (lib/states.ts: the same in every look) — the solid for
// "operational", the dark "ink" twins for the others —, each with white
// text at 4.5:1 or more (test/states.test.ts); a picture has no theme, so
// they are written in it. The label's ground is near-black, or the
// company's own colour when the Chest gives its brand and white text reads
// on it (src/app.tsx, /badge.svg). The words are measured roughly, then
// fitted with textLength so no font on the reader's side can overflow them.

export const badgeColours: Record<State | "none", string> = {
  operational: stateColours.light.operational.solid,
  maintenance: stateColours.light.maintenance.ink,
  degraded: stateColours.light.degraded.ink,
  partial: stateColours.light.partial.ink,
  major: stateColours.light.major.ink,
  none: "#4a5561",
};
export const labelColour = "#0f1419";

const escape = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

// A rough width, in pixels at 11 px: narrow and wide letters apart.
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[iljtfrI.,:;'!|]/u.test(ch) ? 3.6 : /[mwMW@%]/u.test(ch) ? 9.6 : /[A-Z0-9]/u.test(ch) ? 7.4 : /\s/u.test(ch) ? 3.3 : 6.3;
  return Math.ceil(w);
}

export function badge(label: string, message: string, state: State | "none", title: string, labelGround = labelColour): string {
  const l = [...label].slice(0, 40).join(""), m = [...message].slice(0, 60).join("");
  const lw = textWidth(l) + 16, mw = textWidth(m) + 16, width = lw + mw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${escape(title)}">`
    + `<title>${escape(title)}</title>`
    + `<rect width="${lw}" height="20" rx="3" fill="${/^#[0-9a-f]{6}$/iu.test(labelGround) ? labelGround : labelColour}"/>`
    + `<rect x="${lw}" width="${mw}" height="20" rx="3" fill="${badgeColours[state]}"/>`
    + `<rect x="${lw - 3}" width="6" height="20" fill="${badgeColours[state]}"/>`
    + `<g fill="#ffffff" font-family="'Red Hat Text','DejaVu Sans',Verdana,Geneva,sans-serif" font-size="11" font-weight="600">`
    + `<text x="8" y="14" textLength="${lw - 16}" lengthAdjust="spacingAndGlyphs">${escape(l)}</text>`
    + `<text x="${lw + 8}" y="14" textLength="${mw - 16}" lengthAdjust="spacingAndGlyphs">${escape(m)}</text>`
    + `</g></svg>`;
}

// The company's colour behind the badge's label, when the Chest gives its
// brand and white text reads on it (4.5:1); otherwise null (near-black).
export function brandLabel(look: Look): string | null {
  if (look.source !== "brand") return null;
  const accent = look.theme.light.accent;
  return /^#[0-9a-f]{6}$/iu.test(accent) && contrast("#ffffff", accent) >= 4.5 ? accent : null;
}
