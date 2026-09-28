// Safe in the browser: no SDK here.
// What a search looks for, and how a result shows it: pure, tested alone.
// The database finds (lib/search.ts); this marks the words found, with the
// same rule — case and accents aside ("equipe" marks "Équipe"), each word
// by its beginning ("dem" marks "déménagement").
import { limits } from "./model.ts";

export type Segment = { text: string; hit: boolean };

// fold is a word as search compares it: lower case, without accents, the
// ligatures spelt out (as PostgreSQL's unaccent does).
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/œ/gu, "oe").replace(/æ/gu, "ae").replace(/ß/gu, "ss");
}

// terms are the words of a query: letters and digits only, so nothing a
// person types changes the query's meaning; one-letter words ("l'équipe")
// only when nothing else is left.
export function terms(query: unknown): string[] {
  if (typeof query !== "string") return [];
  const words = [...new Set(fold(query.slice(0, limits.query)).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 0))];
  const longer = words.filter(w => w.length > 1);
  return (longer.length > 0 ? longer : words).slice(0, limits.queryWords);
}

// highlight cuts a text into what matched and what did not.
export function highlight(text: string, words: string[]): Segment[] {
  const out: Segment[] = [];
  const push = (piece: string, hit: boolean) => {
    if (!piece) return;
    const last = out.at(-1);
    if (last && last.hit === hit) last.text += piece;
    else out.push({ text: piece, hit });
  };
  let at = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    push(text.slice(at, m.index), false);
    const word = fold(m[0]);
    push(m[0], words.some(w => word.startsWith(w)));
    at = m.index + m[0].length;
  }
  push(text.slice(at), false);
  return out;
}

export const hasHit = (segments: Segment[]): boolean => segments.some(s => s.hit);

// snippet is the passage around the first word found, on one line, about
// max characters, cut at words; without a word found, the start.
export function snippet(text: string, words: string[], max = 220): Segment[] {
  const flat = text.replace(/\s+/gu, " ").trim();
  const all = highlight(flat, words);
  let first = 0;
  let offset = 0;
  for (const s of all) {
    if (s.hit) { first = offset; break; }
    offset += s.text.length;
  }
  let start = Math.max(0, first - Math.round(max / 3));
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    start = space === -1 || space > first ? start : space + 1;
  }
  let end = Math.min(flat.length, start + max);
  if (end < flat.length) {
    const space = flat.lastIndexOf(" ", end);
    if (space > first) end = space;
  }
  const piece = (start > 0 ? "…" : "") + flat.slice(start, end).replace(/[\s.,;:!?-]+$/u, "") + (end < flat.length ? "…" : "");
  return highlight(piece, words);
}
