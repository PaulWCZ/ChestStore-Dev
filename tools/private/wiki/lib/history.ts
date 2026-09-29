import type { Member } from "@argentic/chest-sdk/member";
import { diffArrays, diffWords } from "diff";
import type { Sql, Query } from "./db.ts";
import { lines, normalize, type Doc } from "./doc.ts";
import { AppError } from "./errors.ts";
import { limits, lockIdleMinutes, lockLeaseSeconds } from "./model.ts";
import { page, writeContent } from "./pages.ts";

// A page's history: every save is a version, kept whole. The history lists
// them, shows one, compares it with the one before in plain words (a line
// per paragraph, the changed words marked) and restores it — a restore is
// a new version, so it can be undone by restoring again.

export type VersionSummary = { number: number; title: string; author: string; createdAt: Date; kind: string; restoredFrom: number | null };
export type Version = VersionSummary & { doc: Doc; body: string };

export async function versions(sql: Query, actor: Member | null, pageId: unknown): Promise<VersionSummary[]> {
  const p = await page(sql, actor, pageId);
  const found = await sql<{ number: number; title: string; author: string; created_at: Date; kind: string; restored_from: number | null }[]>`
    select number, title, author, created_at, kind, restored_from from page_versions where page_id = ${p.id} order by number desc limit ${limits.versionsShown}`;
  return found.map(r => ({ number: r.number, title: r.title, author: r.author, createdAt: r.created_at, kind: r.kind, restoredFrom: r.restored_from }));
}

export async function version(sql: Query, actor: Member | null, pageId: unknown, number: unknown): Promise<Version> {
  const p = await page(sql, actor, pageId);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) throw new AppError("not_found");
  const [r] = await sql<{ number: number; title: string; author: string; created_at: Date; kind: string; restored_from: number | null; doc: unknown; body: string }[]>`
    select number, title, author, created_at, kind, restored_from, doc, body from page_versions where page_id = ${p.id} and number = ${n}`;
  if (!r) throw new AppError("not_found");
  return { number: r.number, title: r.title, author: r.author, createdAt: r.created_at, kind: r.kind, restoredFrom: r.restored_from, doc: normalize(r.doc), body: r.body };
}

// restore makes an old version the page's newest one.
export async function restore(sql: Sql, actor: Member | null, pageId: unknown, number: unknown): Promise<{ version: number }> {
  const p = await page(sql, actor, pageId, "write");
  const old = await version(sql, actor, p.id, number);
  return sql.begin(async tx => {
    const [lock] = await tx<{ member_id: string; idle: boolean }[]>`
      select member_id, active_at < now() - make_interval(mins => ${lockIdleMinutes})
        or seen_at < now() - make_interval(secs => ${lockLeaseSeconds}) as idle
      from page_locks where page_id = ${p.id} for update`;
    if (lock && lock.member_id !== actor!.id && !lock.idle) throw new AppError("locked");
    await tx`select 1 from pages where id = ${p.id} for update`;
    return { version: await writeContent(tx, p.id, actor!.id, { title: old.title, doc: old.doc, kind: "restored", restoredFrom: old.number }) };
  });
}

// The comparison of two versions, for people: each block a line; a line
// changed in place shows its words taken out and put in; long runs of
// unchanged lines fold, with a line of context on each side.
export type Part = { text: string; change: "same" | "added" | "removed" };
export type Row =
  | { kind: "same" | "added" | "removed"; text: string }
  | { kind: "changed"; parts: Part[] }
  | { kind: "fold"; count: number };

function likeness(a: string, b: string): number {
  const words = diffWords(a, b);
  const same = words.filter(w => !w.added && !w.removed).reduce((n, w) => n + w.value.length, 0);
  return (2 * same) / Math.max(a.length + b.length, 1);
}

export function compare(before: string[], after: string[]): Row[] {
  const rows: Row[] = [];
  const chunks = diffArrays(before, after);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const next = chunks[i + 1];
    if (c.removed && next?.added) {
      const removed = c.value as string[];
      const added = next.value as string[];
      const pairs = Math.min(removed.length, added.length);
      for (let k = 0; k < pairs; k++) {
        const a = removed[k]!;
        const b = added[k]!;
        if (likeness(a, b) >= 0.4) rows.push({ kind: "changed", parts: diffWords(a, b).map(w => ({ text: w.value, change: w.added ? "added" : w.removed ? "removed" : "same" })) });
        else rows.push({ kind: "removed", text: a }, { kind: "added", text: b });
      }
      for (const a of removed.slice(pairs)) rows.push({ kind: "removed", text: a });
      for (const b of added.slice(pairs)) rows.push({ kind: "added", text: b });
      i++;
      continue;
    }
    for (const text of c.value as string[]) rows.push({ kind: c.added ? "added" : c.removed ? "removed" : "same", text });
  }
  // Fold what did not change, keeping one line around each change.
  const out: Row[] = [];
  const keep = rows.map((r, k) => r.kind !== "same" || rows[k - 1]?.kind !== undefined && rows[k - 1]!.kind !== "same" || rows[k + 1]?.kind !== undefined && rows[k + 1]!.kind !== "same");
  for (let k = 0; k < rows.length; ) {
    if (keep[k]) {
      out.push(rows[k]!);
      k++;
      continue;
    }
    let n = 0;
    while (k + n < rows.length && !keep[k + n]) n++;
    if (n === 1) out.push(rows[k]!);
    else out.push({ kind: "fold", count: n });
    k += n;
  }
  return out;
}

// diff compares a version with the one before it (the first with nothing).
export async function diff(sql: Query, actor: Member | null, pageId: unknown, number: unknown): Promise<{ version: Version; previous: VersionSummary | null; rows: Row[]; titleChanged: { from: string; to: string } | null }> {
  const v = await version(sql, actor, pageId, number);
  const previous = v.number > 1 ? await version(sql, actor, pageId, v.number - 1).catch(() => null) : null;
  const before = previous ? lines(previous.doc) : [];
  const rows = compare(before, lines(v.doc));
  return {
    version: v,
    previous: previous ? { number: previous.number, title: previous.title, author: previous.author, createdAt: previous.createdAt, kind: previous.kind, restoredFrom: previous.restoredFrom } : null,
    rows,
    titleChanged: previous && previous.title !== v.title ? { from: previous.title, to: v.title } : null,
  };
}
