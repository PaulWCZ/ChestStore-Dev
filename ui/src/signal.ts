// The signal on a region of its own colour (0.2.3): a tool's signature
// accent on its dark band — Timesheets' lime Start button and current tab
// on the instrument panel, Goals' marker under the current tab on the
// map's margin. Before 0.2.3 tools put --highlight there, which is a light
// marker pen in light mode but a dark ground in dark mode (a dark look's
// highlight must carry --ink, a light text): on the dark band it vanished.
//
// --inverse-signal reads at 4.5:1 on --inverse and on --inverse-line (so it
// may be text, a rule, a filled button there); --inverse-signal-ink is the
// text on it (4.5:1). By default the signal is the theme's marker pen when
// it already reads on the band, else the same hue and chroma made as light
// as the band needs; its ink is the band itself (the pair is then the same
// pair, measured once). A theme may set both (Instrument pins its lime).
import { contrast, fit, luminance, oklch, oklchHex, parseColor, toHex } from "./color.js";

type Band = { readonly inverse: string; readonly "inverse-line": string; readonly highlight: string };

export function inverseSignal(scheme: Band): string {
  const grounds = [scheme.inverse, scheme["inverse-line"]];
  if (grounds.every(g => contrast(scheme.highlight, g) >= 4.5)) return toHex(parseColor(scheme.highlight)!);
  const pen = oklch(scheme.highlight)!;
  const away = luminance(scheme.inverse) > 0.18 ? "darker" : "lighter";
  const start = oklchHex({ l: away === "lighter" ? Math.max(0.9, pen.l) : Math.min(0.3, pen.l), c: pen.c, h: pen.h });
  const got = fit(start, grounds, 4.5, away) ?? fit(start, grounds, 4.5, "auto");
  if (got === null) throw new RangeError("no signal reaches 4.5:1 on the band");
  return toHex(parseColor(got)!);
}

// withSignal: a scheme with its two signal tokens — the scheme's own when
// it sets them, the defaults above otherwise (a theme made by hand for
// 0.2.2 has none, and stays valid).
export function withSignal<S extends Band & { readonly "inverse-signal"?: string; readonly "inverse-signal-ink"?: string }>(scheme: S): S & { "inverse-signal": string; "inverse-signal-ink": string } {
  const signal = scheme["inverse-signal"] ?? inverseSignal(scheme);
  return { ...scheme, "inverse-signal": signal, "inverse-signal-ink": scheme["inverse-signal-ink"] ?? toHex(parseColor(scheme.inverse)!) };
}
