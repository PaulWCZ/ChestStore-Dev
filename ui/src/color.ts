// Colour, as the kit reasons about it: parse what people and files write
// (hex, rgb(), hsl(), oklch(), a few names), convert to OKLCH — a space where
// lightness is what the eye sees, so "darker" keeps the hue — and measure
// WCAG 2 contrast on the colour that will actually be rendered (8-bit sRGB).
//
// The OKLab matrices are Björn Ottosson's published definition of the space
// (https://bottosson.github.io/posts/oklab/, read 2026-09-28); the contrast
// ratio is WCAG 2.2's (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio).
// Written for this kit, no code copied.

export type Rgb = { r: number; g: number; b: number }; // 0..1, gamma-encoded sRGB
export type Oklch = { l: number; c: number; h: number }; // l 0..1, c ≥ 0, h degrees

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// A small list of names people write in brand files; anything else is not a
// colour for the kit (it says so rather than guessing).
const names: Record<string, string> = {
  white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff", navy: "#000080",
  teal: "#008080", orange: "#ffa500", purple: "#800080", gray: "#808080", grey: "#808080", yellow: "#ffff00",
  maroon: "#800000", olive: "#808000", silver: "#c0c0c0", pink: "#ffc0cb", gold: "#ffd700", coral: "#ff7f50",
  crimson: "#dc143c", indigo: "#4b0082", tomato: "#ff6347", salmon: "#fa8072", turquoise: "#40e0d0",
};

const number = (s: string, percentOf: number): number | null => {
  const t = s.trim();
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?%?$/iu.test(t)) return null;
  return t.endsWith("%") ? (parseFloat(t) / 100) * percentOf : parseFloat(t);
};
const angle = (s: string): number | null => {
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(deg|turn|rad|grad)?$/iu.exec(s.trim());
  if (!m) return null;
  const v = parseFloat(m[1]!);
  const unit = (m[2] ?? "deg").toLowerCase();
  return unit === "turn" ? v * 360 : unit === "rad" ? (v * 180) / Math.PI : unit === "grad" ? v * 0.9 : v;
};
const args = (inner: string): string[] => inner.replace(/\s*\/\s*/gu, " / ").split(/[\s,]+/u).filter(Boolean);

// parseColor reads one colour as CSS writes it; null when it is not one
// (or uses var(), a gradient, a system colour: nothing the kit can measure).
// The alpha of a translucent colour is dropped — a brand colour is opaque.
export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  if (s.length > 64) return null;
  const named = names[s];
  if (named) return parseColor(named);
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/u.exec(s);
  if (hex) {
    let v = hex[1]!;
    if (v.length <= 4) v = [...v].map(x => x + x).join("");
    return { r: parseInt(v.slice(0, 2), 16) / 255, g: parseInt(v.slice(2, 4), 16) / 255, b: parseInt(v.slice(4, 6), 16) / 255 };
  }
  const fn = /^(rgba?|hsla?|oklch)\(([^()]*)\)$/u.exec(s);
  if (!fn) return null;
  const parts = args(fn[2]!).filter(p => p !== "/");
  if (parts.length < 3) return null;
  if (fn[1]!.startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map(p => number(p, 255));
    if (r == null || g == null || b == null) return null;
    return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255) };
  }
  if (fn[1]!.startsWith("hsl")) {
    const h = angle(parts[0]!), sat = number(parts[1]!.endsWith("%") ? parts[1]! : parts[1]! + "%", 1), light = number(parts[2]!.endsWith("%") ? parts[2]! : parts[2]! + "%", 1);
    if (h == null || sat == null || light == null) return null;
    return hslToRgb(((h % 360) + 360) % 360, clamp01(sat), clamp01(light));
  }
  const l = number(parts[0]!, 1), c = number(parts[1]!, 0.4), h = angle(parts[2]!);
  if (l == null || c == null || h == null) return null;
  return oklchToRgb({ l: parts[0]!.endsWith("%") ? l : l > 1 ? l / 100 : l, c: Math.max(0, c), h });
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4) };
}

export function toHex(rgb: Rgb): string {
  const h = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

// hex normalises any colour the kit reads to "#rrggbb"; null otherwise.
export function hex(input: string): string | null {
  const rgb = parseColor(input);
  return rgb ? toHex(rgb) : null;
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r), g = toLinear(rgb.g), b = toLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

// The linear sRGB of an OKLCH colour, possibly outside [0, 1] (out of gamut).
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180), B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function inGamut(color: Oklch): boolean {
  return oklchToLinear(color).every(v => v >= -1e-4 && v <= 1 + 1e-4);
}

// oklchToRgb maps a colour into sRGB keeping its lightness and hue: chroma is
// reduced until it fits (the CSS Color 4 idea of gamut mapping, simplified).
export function oklchToRgb(color: Oklch): Rgb {
  const l = Math.min(1, Math.max(0, color.l));
  let c = Math.max(0, color.c);
  if (!inGamut({ l, c, h: color.h })) {
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut({ l, c: mid, h: color.h })) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const [r, g, b] = oklchToLinear({ l, c, h: color.h });
  return { r: clamp01(toGamma(clamp01(r))), g: clamp01(toGamma(clamp01(g))), b: clamp01(toGamma(clamp01(b))) };
}

export const oklchHex = (color: Oklch): string => toHex(oklchToRgb(color));

// oklch reads a colour as OKLCH (null when it is not a colour).
export function oklch(input: string): Oklch | null {
  const rgb = parseColor(input);
  return rgb ? rgbToOklch(rgb) : null;
}

// luminance is WCAG's relative luminance of the rendered (8-bit) colour.
export function luminance(input: string): number {
  const rgb = parseColor(input);
  if (!rgb) throw new TypeError(`not a colour: ${input}`);
  const q = (v: number) => toLinear(Math.round(clamp01(v) * 255) / 255);
  return 0.2126 * q(rgb.r) + 0.7152 * q(rgb.g) + 0.0722 * q(rgb.b);
}

// contrast is the WCAG 2 contrast ratio of two colours (1 to 21).
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

// mix is a colour between two, in OKLCH (hue the short way round), as CSS
// color-mix(in oklch, a p, b) would give; p is the share of a (0..1).
export function mix(a: string, b: string, p: number): string {
  const x = oklch(a), y = oklch(b);
  if (!x || !y) throw new TypeError(`not a colour: ${x ? b : a}`);
  // A grey has no hue: take the other's, so a tint does not swing through red.
  const hx = x.c < 0.01 ? y.h : x.h, hy = y.c < 0.01 ? x.h : y.h;
  let d = hy - hx;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return oklchHex({ l: x.l * p + y.l * (1 - p), c: x.c * p + y.c * (1 - p), h: (hx + d * (1 - p) + 360) % 360 });
}

// fit moves a colour's lightness — hue kept, chroma kept where sRGB allows —
// until it reaches min contrast against every colour of against. It goes
// the way that works (darker on light grounds, lighter on dark ones, or as
// asked), by the smallest step that passes. null when no lightness can.
export function fit(input: string, against: string[], min: number, way: "auto" | "darker" | "lighter" = "auto"): string | null {
  const start = oklch(input);
  if (!start) throw new TypeError(`not a colour: ${input}`);
  const passes = (h: string) => against.every(bg => contrast(h, bg) >= min);
  const first = oklchHex(start);
  if (passes(first)) return first;
  const ways: ("darker" | "lighter")[] = way === "auto" ? (against.every(bg => luminance(bg) > 0.18) ? ["darker", "lighter"] : ["lighter", "darker"]) : [way];
  for (const w of ways) {
    for (let step = 1; step <= 200; step++) {
      const l = start.l + (w === "darker" ? -1 : 1) * step * 0.005;
      if (l < 0 || l > 1) break;
      const candidate = oklchHex({ ...start, l });
      if (passes(candidate)) return candidate;
    }
  }
  return null;
}

// hueDistance is the angle between two hues (0..180).
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// colourWord names a colour in a few plain words ("blue", "dark green",
// "light grey"), in English or French, for notes a person reads.
export function colourWord(input: string, locale: "en" | "fr"): string {
  const c = oklch(input);
  if (!c) return locale === "fr" ? "couleur" : "colour";
  const fr = locale === "fr";
  let base: string;
  if (c.c < 0.03) base = c.l > 0.95 ? (fr ? "blanc" : "white") : c.l < 0.2 ? (fr ? "noir" : "black") : fr ? "gris" : "grey";
  else {
    const h = c.h;
    const table: [number, string, string][] = [[15, "pink", "rose"], [45, "red", "rouge"], [70, "orange", "orange"], [110, "yellow", "jaune"], [165, "green", "vert"], [210, "teal", "turquoise"], [265, "blue", "bleu"], [300, "violet", "violet"], [345, "purple", "pourpre"], [360, "pink", "rose"]];
    const hit = table.find(([limit]) => h < limit) ?? table[table.length - 1]!;
    base = fr ? hit[2] : hit[1];
    if (base === "orange" && c.l < 0.55) base = fr ? "brun" : "brown";
    if ((base === "yellow" || base === "jaune") && c.l < 0.6) base = fr ? "ocre" : "ochre";
  }
  if (base === "white" || base === "black" || base === "blanc" || base === "noir") return base;
  const shade = c.l < 0.42 ? (fr ? "foncé" : "dark") : c.l > 0.85 ? (fr ? "clair" : "light") : "";
  if (!shade) return base;
  return fr ? `${base} ${shade}` : `${shade} ${base}`;
}
