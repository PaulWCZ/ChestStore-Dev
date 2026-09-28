// importBrand: a company's brand guidelines, as its designers export them,
// read into a Brand (derive.ts) with best-effort guesses and plain notes of
// each guess. Four shapes:
//
//   - W3C Design Tokens (DTCG, https://tr.designtokens.org/format/, read
//     2026-09-28): "$value", "$type" (inherited from groups), aliases
//     "{group.token}", colours as strings or {colorSpace, components, hex};
//   - Tokens Studio for Figma: "value" and "type" (color, fontFamilies,
//     borderRadius, typography), sets at the top, aliases without the set;
//   - a CSS file of custom properties (--brand-primary: #1d5b43), and its
//     font-family and border-radius declarations;
//   - a plain list of colours ("Primary: #1d5b43", or colours one by line).
//
// Pure text in, data out: no network, no file system, nothing evaluated.
import { hex, hueDistance, oklch } from "./color.js";
import type { Brand, Corners } from "./derive.js";
import { closestFont, registry } from "./fonts.js";
import { note, type Note } from "./notes.js";

export type ImportFormat = "dtcg" | "tokens-studio" | "css" | "list";
export type Imported = { brand: Brand | null; notes: Note[]; format: ImportFormat; colours: { name: string; value: string }[]; fonts: { name: string; family: string }[] };

export const maxImportSize = 1 << 20;
const maxTokens = 5000;

type Raw = { path: string; type: string; value: unknown };

function walkJson(root: unknown): { tokens: Raw[]; format: "dtcg" | "tokens-studio" } {
  const tokens: Raw[] = [];
  let dtcg = 0, studio = 0;
  const visit = (node: unknown, path: string[], inherited: string, depth: number) => {
    if (tokens.length >= maxTokens || depth > 32 || typeof node !== "object" || node === null || Array.isArray(node)) return;
    const o = node as Record<string, unknown>;
    if ("$value" in o) {
      dtcg++;
      tokens.push({ path: path.join("."), type: typeof o["$type"] === "string" ? o["$type"] : inherited, value: o["$value"] });
      return;
    }
    if ("value" in o && (typeof o["type"] === "string" || typeof o["value"] === "string")) {
      studio++;
      tokens.push({ path: path.join("."), type: typeof o["type"] === "string" ? o["type"] : inherited, value: o["value"] });
      return;
    }
    const type = typeof o["$type"] === "string" ? o["$type"] : inherited;
    for (const [key, child] of Object.entries(o)) {
      if (key.startsWith("$")) continue;
      visit(child, [...path, key], type, depth + 1);
    }
  };
  visit(root, [], "", 0);
  return { tokens, format: dtcg >= studio ? "dtcg" : "tokens-studio" };
}

// resolve follows aliases ("{colors.brand.500}") through the file's own
// tokens: the path itself, or a token whose path ends with it (a Tokens
// Studio set name comes first in the file, not in the alias).
function resolver(tokens: Raw[]) {
  const byPath = new Map(tokens.map(t => [t.path, t]));
  const find = (alias: string): Raw | undefined => byPath.get(alias) ?? tokens.find(t => t.path.endsWith("." + alias));
  const resolve = (value: unknown, depth = 0): unknown => {
    if (depth > 8) return undefined;
    if (typeof value === "string") {
      const alias = /^\{([^{}]{1,200})\}$/u.exec(value.trim());
      if (alias) {
        const target = find(alias[1]!);
        return target ? resolve(target.value, depth + 1) : undefined;
      }
    }
    return value;
  };
  return resolve;
}

const colourOf = (value: unknown): string | null => {
  if (typeof value === "string") return hex(value);
  if (typeof value === "object" && value !== null) {
    const o = value as Record<string, unknown>;
    if (typeof o["hex"] === "string") return hex(o["hex"]);
    const c = o["components"];
    if (o["colorSpace"] === "srgb" && Array.isArray(c) && c.length === 3 && c.every(x => typeof x === "number")) return hex(`rgb(${(c as number[]).map(x => Math.round(Math.min(1, Math.max(0, x)) * 255)).join(" ")})`);
  }
  return null;
};
const familyOf = (value: unknown): string | null => {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return null;
  const name = first.split(",")[0]!.trim().replace(/^["']|["']$/gu, "").trim();
  return name && name.length <= 64 && !/^(inherit|initial|sans-serif|serif|monospace|system-ui)$/iu.test(name) ? name : null;
};
const pxOf = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)["value"] === "number") {
    const o = value as { value: number; unit?: string };
    return o.unit === "rem" ? o.value * 16 : o.value;
  }
  if (typeof value !== "string") return null;
  const m = /^(\d+(\.\d+)?)(px|rem)?$/u.exec(value.trim());
  if (!m) return null;
  return m[3] === "rem" ? parseFloat(m[1]!) * 16 : parseFloat(m[1]!);
};

type Found = { colours: { name: string; value: string }[]; fonts: { name: string; family: string }[]; radii: number[]; skipped: number };

function fromTokens(tokens: Raw[]): Found {
  const resolve = resolver(tokens);
  const found: Found = { colours: [], fonts: [], radii: [], skipped: 0 };
  for (const t of tokens) {
    const type = t.type.toLowerCase();
    const value = resolve(t.value);
    if (value === undefined) { found.skipped++; continue; }
    if (type === "color") {
      const c = colourOf(value);
      if (c) found.colours.push({ name: t.path, value: c });
    } else if (type === "fontfamily" || type === "fontfamilies") {
      const f = familyOf(value);
      if (f) found.fonts.push({ name: t.path, family: f });
    } else if (type === "typography" && typeof value === "object" && value !== null) {
      const f = familyOf(resolve((value as Record<string, unknown>)["fontFamily"]));
      if (f) found.fonts.push({ name: t.path, family: f });
    } else if (type === "borderradius" || (type === "dimension" && /radius|corner/iu.test(t.path))) {
      const px = pxOf(value);
      if (px !== null) found.radii.push(px);
    } else if (!type) {
      // Untyped: a colour if it reads as one.
      const c = typeof value === "string" ? hex(value) : null;
      if (c) found.colours.push({ name: t.path, value: c });
    }
  }
  return found;
}

function fromCss(text: string): Found {
  const clean = text.replace(/\/\*[\s\S]*?\*\//gu, "");
  const vars = new Map<string, string>();
  for (const m of clean.matchAll(/(--[A-Za-z0-9_-]{1,80})\s*:\s*([^;{}]{1,300})/gu)) if (!vars.has(m[1]!)) vars.set(m[1]!, m[2]!.trim().replace(/\s*!important$/u, ""));
  const resolve = (value: string, depth = 0): string | undefined => {
    const ref = /^var\(\s*(--[A-Za-z0-9_-]{1,80})\s*(,\s*([^)]*))?\)$/u.exec(value);
    if (!ref) return value;
    if (depth > 8) return undefined;
    const next = vars.get(ref[1]!) ?? ref[3];
    return next === undefined ? undefined : resolve(next.trim(), depth + 1);
  };
  const found: Found = { colours: [], fonts: [], radii: [], skipped: 0 };
  for (const [name, raw] of vars) {
    const value = resolve(raw);
    if (value === undefined) { found.skipped++; continue; }
    const c = hex(value);
    if (c) { found.colours.push({ name: name.slice(2), value: c }); continue; }
    if (/font|family|typeface|police|typo/iu.test(name)) {
      const f = familyOf(value);
      if (f && !/^\d/u.test(f)) found.fonts.push({ name: name.slice(2), family: f });
    } else if (/radius|corner|rounded|arrondi|coin/iu.test(name)) {
      const px = pxOf(value);
      if (px !== null) found.radii.push(px);
    }
  }
  // Rules: h1–h3 and body's fonts, and corners.
  for (const m of clean.matchAll(/([^{}]{1,200})\{([^{}]{0,4000})\}/gu)) {
    const selector = m[1]!.trim(), body = m[2]!;
    const family = /(?:^|;)\s*font-family\s*:\s*([^;]+)/u.exec(body)?.[1];
    if (family && !family.trim().startsWith("var(")) {
      const f = familyOf(family);
      if (f) found.fonts.push({ name: /\bh[1-3]\b|title|heading|display/iu.test(selector) ? "heading" : /\b(body|html|:root|p)\b/iu.test(selector) ? "body" : selector.slice(0, 40), family: f });
    }
    const radius = /(?:^|;)\s*border-radius\s*:\s*([^;\s]+)/u.exec(body)?.[1];
    if (radius) { const px = pxOf(radius); if (px !== null) found.radii.push(px); }
  }
  return found;
}

function fromList(text: string): Found {
  const found: Found = { colours: [], fonts: [], radii: [], skipped: 0 };
  let n = 0;
  for (const line of text.split(/\r?\n/u).slice(0, maxTokens)) {
    for (const m of line.matchAll(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|(?:rgba?|hsla?|oklch)\([^()]{1,80}\)/gu)) {
      const c = hex(m[0]);
      if (!c) continue;
      n++;
      const label = line.slice(0, m.index).replace(/[-*•:=|,\t]+/gu, " ").replace(/\s+/gu, " ").trim();
      found.colours.push({ name: /^[\p{L}][\p{L}\p{N} ()'’&/.]{0,59}$/u.test(label) ? label : `colour ${n}`, value: c });
    }
  }
  return found;
}

const words = (name: string) => name.toLowerCase().replace(/([a-z])([A-Z])/gu, "$1 $2").split(/[^a-z0-9éèàç]+/u).filter(Boolean);
const has = (name: string, list: string[]) => { const w = words(name); return list.some(x => w.includes(x)); };
const stateWords = ["success", "error", "danger", "warning", "warn", "info", "positive", "negative", "critical", "erreur", "succes", "alerte", "attention", "valid", "invalid", "disabled"];
const scale = (name: string): number => {
  const m = /(?:^|[^0-9])(50|[1-9]00|950)(?:$|[^0-9])/u.exec(name);
  if (m) return Math.abs(Number(m[1]) - 550);
  return /\b(base|default|main|500|600)\b/iu.test(name) || !/\b(light|lighter|dark|darker|soft|muted|subtle|hover|pressed|active|bg|background|surface|text|on)\b/iu.test(name.replace(/[._-]/gu, " ")) ? 0 : 300;
};
const vivid = (value: string) => { const c = oklch(value)!; return c.l > 0.25 && c.l < 0.92 ? c.c : c.c * 0.3; };

// pick chooses among named candidates: the scale's middle, the most vivid.
function pick(candidates: { name: string; value: string }[]): { name: string; value: string } | undefined {
  return [...candidates].sort((a, b) => scale(a.name) - scale(b.name) || vivid(b.value) - vivid(a.value))[0];
}

// importBrand reads a file's text (its name gives a hint of its shape).
export function importBrand(text: string, filename = ""): Imported {
  const notes: Note[] = [];
  if (typeof text !== "string" || text.length > maxImportSize) return { brand: null, notes: [note("too_large")], format: "list", colours: [], fonts: [] };
  const trimmed = text.replace(/^﻿/u, "").trim();
  let format: ImportFormat = "list";
  let found: Found;
  const looksJson = /\.json$/iu.test(filename) || trimmed.startsWith("{");
  let parsed: unknown = undefined;
  if (looksJson) {
    try { parsed = JSON.parse(trimmed); } catch { notes.push(note("not_json")); }
  }
  if (parsed !== undefined) {
    const walked = walkJson(parsed);
    format = walked.format;
    found = fromTokens(walked.tokens);
  } else if (/\.(css|scss|less)$/iu.test(filename) || /--[A-Za-z0-9_-]+\s*:/u.test(trimmed)) {
    format = "css";
    found = fromCss(trimmed);
  } else {
    found = fromList(trimmed);
  }
  // One entry per colour value, the first name kept.
  const seen = new Set<string>();
  const colours = found.colours.filter(c => (seen.has(c.value) ? false : (seen.add(c.value), true)));
  notes.push(note("format", { format, count: colours.length }));
  if (found.skipped > 0) notes.push(note("aliases_skipped", { count: found.skipped }));
  if (colours.length === 0) {
    notes.push(note("nothing_found"));
    return { brand: null, notes, format, colours, fonts: found.fonts };
  }

  // Every name counts for the guesses (an alias "brand.primary" has the
  // value of "blue.500"); the count and the vivid ones, once per value.
  const usable = found.colours.filter(c => !has(c.name, stateWords));
  const distinct = colours.filter(c => !has(c.name, stateWords));
  const named = (list: string[]) => usable.filter(c => has(c.name, list));
  let primary = pick(named(["primary", "primaire", "principal", "principale"])) ?? pick(named(["brand", "marque"])) ?? pick(named(["main", "accent"]));
  let secondary = pick(named(["secondary", "secondaire", "second"]).filter(c => c.value !== primary?.value))
    ?? (primary && !has(primary.name, ["accent"]) ? pick(named(["accent", "tertiary"]).filter(c => c.value !== primary!.value)) : undefined);
  if (primary) notes.push(note("primary_named", { name: primary.name.slice(0, 60), colour: primary.value }));
  const chromatic = distinct.filter(c => oklch(c.value)!.c >= 0.04).sort((a, b) => vivid(b.value) - vivid(a.value));
  if (!primary) {
    primary = chromatic[0] ?? distinct.filter(c => { const o = oklch(c.value)!; return o.l > 0.15 && o.l < 0.9; })[0] ?? distinct[0] ?? colours[0]!;
    notes.push(note("primary_guessed", { colour: primary.value }));
  }
  if (secondary) notes.push(note("secondary_named", { name: secondary.name.slice(0, 60), colour: secondary.value }));
  else {
    const p = oklch(primary.value)!;
    secondary = chromatic.find(c => c.value !== primary!.value && hueDistance(oklch(c.value)!.h, p.h) >= 35);
    if (secondary) notes.push(note("secondary_guessed", { colour: secondary.value }));
  }
  const neutral = pick(named(["neutral", "grey", "gray", "gris", "slate", "stone", "neutre"]).filter(c => { const o = oklch(c.value)!; return o.l > 0.2 && o.l < 0.95; }));
  if (neutral) notes.push(note("neutral_named", { name: neutral.name.slice(0, 60), colour: neutral.value }));

  // Fonts: headings and text, by their names; one font for both otherwise.
  const heading = found.fonts.find(f => has(f.name, ["heading", "headings", "display", "title", "titles", "headline", "h1", "titre", "titres"]));
  const text_ = found.fonts.find(f => has(f.name, ["body", "text", "base", "paragraph", "copy", "texte", "default", "sans", "ui"])) ?? found.fonts.find(f => f !== heading);
  const brand: Brand = { primary: primary.value, ...(secondary ? { secondary: secondary.value } : {}), ...(neutral ? { neutral: neutral.value } : {}) };
  for (const [role, f] of [["display", heading], ["body", text_ ?? heading]] as const) {
    if (!f) continue;
    const match = closestFont(f.family);
    brand[role] = { id: match.id };
    const family = registry.get(match.id)!.family.replace(/ Variable$/u, "");
    if (match.exact) notes.push(note("font_found", { role, font: family }));
    else notes.push(note("font_unknown", { font: f.family, fallback: family }));
  }
  // Corners: the typical radius of the file (pills and circles left out).
  const radii = found.radii.filter(r => r > 0 && r < 100).sort((a, b) => a - b);
  if (radii.length > 0) {
    const typical = radii[Math.floor(radii.length / 2)]!;
    const corners: Corners = typical <= 3 ? "sharp" : typical <= 11 ? "soft" : "round";
    brand.corners = corners;
    notes.push(note("corners_found", { corners, radius: `${Math.round(typical)} px` }));
  }
  return { brand, notes, format, colours, fonts: found.fonts };
}
