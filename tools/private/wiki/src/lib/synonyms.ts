import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { words } from "./search.ts";

// Words that mean the same thing, for search (migrations/0004): one group
// per line — "congés, vacances, holidays", "notes de frais, remboursement,
// expenses", "tt, télétravail, remote". A search for one term finds pages
// holding any of them. The wiki starts with about thirty office groups in
// French and English; its editors add, change and delete groups (a group
// deleted comes back with Undo). Everyone's search uses them.

export const synonymLimits = { groups: 200, terms: 12, term: 40 } as const;

// fold writes a word as search compares it: lower case, no accents.
export const fold = (w: string): string => w.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

// A term as search uses it: its words as typed ("d’accueil" is one), to
// find it in a query; and its words as the index keeps them ("d",
// "accueil"), for the phrase that finds it in a page.
export type Term = { tokens: string[]; words: string[] };

export function termOf(text: string): Term {
  const parts = words(text);
  return { tokens: parts.map(p => fold(p.join(""))), words: parts.flat().map(fold) };
}

// phrase is a term as to_tsquery reads it: its words one after the other,
// the last by its beginning when it is long enough ("note <-> de <->
// frais:*"; "tt" is only "tt"). Letters and digits only (lib/search.ts
// words()): nothing an editor writes changes the query's meaning.
export function phrase(list: string[]): string {
  const clean = list.filter(w => /^[\p{L}\p{N}]+$/u.test(w));
  if (clean.length === 0) return "";
  const last = clean.at(-1)!;
  const end = last.length >= 3 ? `${last}:*` : last;
  return clean.length === 1 ? end : `(${[...clean.slice(0, -1), end].join(" <-> ")})`;
}

// The groups as search uses them: each a list of terms.
export async function synonymTerms(sql: Query): Promise<Term[][]> {
  const rows = await sql<{ words: string[] }[]>`select words from synonyms order by id limit ${synonymLimits.groups}`;
  return rows.map(r => r.words.map(termOf).filter(t => t.tokens.length > 0 && phrase(t.words) !== ""));
}

export type SynonymGroup = { id: string; words: string[] };

export async function listSynonyms(sql: Query, actor: Member | null): Promise<SynonymGroup[]> {
  if (!can(actor, "write")) throw new AppError("forbidden");
  const rows = await sql<{ id: string; words: string[] }[]>`select id, words from synonyms order by id limit ${synonymLimits.groups}`;
  return rows.map(r => ({ id: String(r.id), words: r.words }));
}

// parseTerms reads what an editor typed: terms separated by commas (or
// lines), each trimmed, the same term once; two to twelve.
export function parseTerms(value: unknown): string[] {
  if (typeof value !== "string" && !Array.isArray(value)) throw new AppError("invalid");
  const raw = typeof value === "string" ? value.split(/[,;\n]+/u) : value;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") throw new AppError("invalid");
    const term = item.replace(/\s+/gu, " ").trim();
    if (!term) continue;
    if ([...term].length > synonymLimits.term) throw new AppError("too_long", { max: synonymLimits.term });
    const key = fold(term);
    if (seen.has(key) || termOf(term).tokens.length === 0) continue;
    seen.add(key);
    out.push(term);
  }
  if (out.length < 2) throw new AppError("synonyms_few");
  if (out.length > synonymLimits.terms) throw new AppError("too_many", { max: synonymLimits.terms });
  return out;
}

// saveSynonyms adds a group (id null) or changes one, by an editor.
export async function saveSynonyms(sql: Sql, actor: Member | null, groupId: string | null, value: unknown): Promise<SynonymGroup> {
  if (!can(actor, "write")) throw new AppError("forbidden");
  const terms = parseTerms(value);
  if (groupId === null) {
    const [count] = await sql<{ n: number }[]>`select count(*)::int as n from synonyms`;
    if ((count?.n ?? 0) >= synonymLimits.groups) throw new AppError("too_many", { max: synonymLimits.groups });
    const [row] = await sql<{ id: string }[]>`insert into synonyms (words, updated_by) values (${terms}, ${actor!.id}) returning id`;
    return { id: String(row!.id), words: terms };
  }
  if (!/^[1-9][0-9]{0,17}$/u.test(groupId)) throw new AppError("not_found");
  const [row] = await sql<{ id: string }[]>`update synonyms set words = ${terms}, updated_by = ${actor!.id}, updated_at = now() where id = ${groupId} returning id`;
  if (!row) throw new AppError("not_found");
  return { id: String(row.id), words: terms };
}

// deleteSynonyms takes a group away; it answers its words (Undo adds them
// back as a new group).
export async function deleteSynonyms(sql: Sql, actor: Member | null, groupId: string): Promise<string[]> {
  if (!can(actor, "write")) throw new AppError("forbidden");
  if (!/^[1-9][0-9]{0,17}$/u.test(groupId)) throw new AppError("not_found");
  const [row] = await sql<{ words: string[] }[]>`delete from synonyms where id = ${groupId} returning words`;
  if (!row) throw new AppError("not_found");
  return row.words;
}
