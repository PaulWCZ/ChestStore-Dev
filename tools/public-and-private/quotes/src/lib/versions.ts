import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { draw } from "./archive.ts";
import type { Query, Sql } from "./db.ts";
import { getDocument, toDoc, type Doc, type Full, type Line } from "./documents.ts";
import { id } from "../shared/model.ts";
import { keptPdf } from "./online.ts";
import { lineNet } from "../shared/totals.ts";

// The versions of a sent quote.
//
// A quote that went to its client is never changed in place: the client
// holds what was sent (the PDF of the email, the page of the link). To
// change it, someone starts its next version: the version sent is kept as
// it was — its words, lines and totals, and the PDF the client was shown
// (in the Chest's files, with its SHA-256) — and the quote becomes a draft
// again, under the same number, version 2 ("D-2026-0007 v2"). While it is
// written, the client's link says a new version is being prepared and
// takes no answer. Sent, it is what the link shows, saying which version it
// replaces; the earlier versions stay readable, to the team and to the
// client. An answer given online names the version it was given on (and
// the proof keeps the SHA-256 of that version's PDF). A new version not
// sent yet may be discarded: the quote is again the version that was sent,
// as it was — its link and its PDF too.
//
// Quotes are not regulated documents: the version is the studio's way of
// keeping what the client was shown, not a legal requirement.

export type Version = {
  version: number;
  number: string;
  issueDate: string | null;
  validUntil: string | null;
  sentAt: string | null;
  sentBy: string | null;
  emailedTo: string | null;
  net: number;
  gross: number;
  currency: string;
  lines: Line[];
  pdfSha256: string | null;
  hasPdf: boolean;
  replacedAt: string;
  replacedBy: string;
};

type VersionRow = {
  id: number; document_id: number; version: number; number: string; issue_date: string | null; valid_until: string | null; sent_at: Date | null; sent_by: string | null;
  emailed_to: string | null; updated_at: Date; fields: Record<string, unknown>; lines: Line[]; net: number; gross: number; currency: string; pdf_object: string | null;
  pdf_sha256: string | null; replaced_at: Date; replaced_by: string;
};

const toVersion = (r: VersionRow): Version => ({
  version: r.version, number: r.number, issueDate: r.issue_date, validUntil: r.valid_until, sentAt: r.sent_at ? r.sent_at.toISOString() : null, sentBy: r.sent_by,
  emailedTo: r.emailed_to, net: r.net, gross: r.gross, currency: r.currency, lines: r.lines, pdfSha256: r.pdf_sha256, hasPdf: r.pdf_object !== null,
  replacedAt: r.replaced_at.toISOString(), replacedBy: r.replaced_by,
});

// The quote's own columns a version keeps, to put back when the next
// version is discarded.
const kept = ["client_id", "title", "language", "currency", "delivery_date", "payment_days", "vat_treatment", "franchise", "notes", "vat", "rates", "seller", "buyer"] as const;

// The PDF the client is shown of the version sent: the one the link keeps
// for it (the very file of the page), else drawn now; kept in the Chest's
// files. Its object is null when the Chest cannot take a file now (the
// fingerprint stays).
async function pdfOfSent(sql: Query, full: Full, today: string): Promise<{ object: string | null; sha256: string }> {
  const [link] = await sql<{ pdf_object: string | null; pdf_sha256: string | null; pdf_of: Date | null }[]>`
    select pdf_object, pdf_sha256, pdf_of from quote_links where document_id = ${full.id} and revoked_at is null`;
  if (link?.pdf_object && link.pdf_sha256 && link.pdf_of?.toISOString() === full.updatedAt) return { object: link.pdf_object, sha256: link.pdf_sha256 };
  const bytes = await draw(sql, full, today);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const object = `versions/${(full.number ?? full.id).replace(/[^A-Za-z0-9_-]/gu, "_")}-v${full.version}-${sha256.slice(0, 16)}.pdf`;
  try {
    await files.put(object, bytes, "application/pdf");
    return { object, sha256 };
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return { object: null, sha256 };
  }
}

// reviseQuote starts the next version of a sent quote (waiting for its
// answer, or expired): the version sent is kept, the quote is a draft
// again under its number. Refused once the client answered (accepted or
// declined: take the answer back first), and for a draft.
export async function reviseQuote(sql: Sql, actor: Member | null, documentId: unknown, today: string): Promise<Doc> {
  if (!can(actor, "quotes.write")) throw new AppError("forbidden");
  const full = await getDocument(sql, actor, id(documentId), today);
  if (full.type !== "quote") throw new AppError("not_found");
  if (full.status !== "sent" || full.number === null) throw new AppError("wrong_status");
  const pdf = await pdfOfSent(sql, full, today);
  return sql.begin(async tx => {
    const [row] = await tx<Record<string, unknown>[]>`select * from documents where id = ${full.id} for update`;
    const d = toDoc(row as never);
    // Answered or changed meanwhile: the member sees the quote again first.
    if (d.deleted || d.status !== "sent" || d.updatedAt !== full.updatedAt || d.version !== full.version) throw new AppError("wrong_status");
    const fields = Object.fromEntries(kept.map(k => [k, row![k] instanceof Date ? (row![k] as Date).toISOString() : row![k] ?? null]));
    await tx`
      insert into quote_versions (document_id, version, number, issue_date, valid_until, sent_at, sent_by, emailed_to, updated_at, fields, lines, net, gross, currency, pdf_object, pdf_sha256, replaced_by)
      values (${full.id}, ${full.version}, ${full.number}, ${full.issueDate}, ${full.validUntil}, ${full.sentAt ? new Date(full.sentAt) : null}, ${full.sentBy}, ${full.emailedTo},
              ${new Date(full.updatedAt)}, ${tx.json(fields as never)}, ${tx.json(full.lines as never)}, ${full.net}, ${full.gross}, ${full.currency}, ${pdf.object}, ${pdf.sha256}, ${actor!.id})`;
    const [next] = await tx`
      update documents set status = 'draft', version = version + 1, issue_date = null, sent_at = null, sent_by = null, emailed_to = null, updated_at = now()
      where id = ${full.id} returning *`;
    return toDoc(next as never);
  });
}

// discardVersion drops the next version not sent yet: the quote is the
// version that was sent again, as it was (its lines, its totals, its sending,
// its PDF and link).
export async function discardVersion(sql: Sql, actor: Member | null, documentId: unknown): Promise<Doc> {
  if (!can(actor, "quotes.write")) throw new AppError("forbidden");
  const docId = id(documentId);
  return sql.begin(async tx => {
    const [row] = await tx<Record<string, unknown>[]>`select * from documents where id = ${docId} for update`;
    if (!row) throw new AppError("not_found");
    const d = toDoc(row as never);
    if (d.deleted || d.type !== "quote") throw new AppError("not_found");
    if (d.status !== "draft" || d.version < 2) throw new AppError("wrong_status");
    const [snap] = await tx<VersionRow[]>`select * from quote_versions where document_id = ${docId} and version = ${d.version - 1}`;
    if (!snap) throw new AppError("not_found");
    const f = snap.fields;
    await tx`
      update documents set status = 'sent', version = ${snap.version}, issue_date = ${snap.issue_date}, valid_until = ${snap.valid_until},
        sent_at = ${snap.sent_at}, sent_by = ${snap.sent_by}, emailed_to = ${snap.emailed_to}, net = ${snap.net}, gross = ${snap.gross},
        client_id = ${(f["client_id"] as number | null) ?? null}, title = ${String(f["title"] ?? "")}, language = ${String(f["language"] ?? "fr")},
        currency = ${String(f["currency"] ?? snap.currency)}, delivery_date = ${(f["delivery_date"] as string | null) ?? null}, payment_days = ${Number(f["payment_days"] ?? 30)},
        vat_treatment = ${String(f["vat_treatment"] ?? "standard")}, franchise = ${f["franchise"] === true}, notes = ${String(f["notes"] ?? "")}, vat = ${Number(f["vat"] ?? 0)},
        rates = ${tx.json((f["rates"] ?? []) as never)}, seller = ${f["seller"] ? tx.json(f["seller"] as never) : null}, buyer = ${f["buyer"] ? tx.json(f["buyer"] as never) : null},
        updated_at = ${snap.updated_at}
      where id = ${docId}`;
    await tx`delete from lines where document_id = ${docId}`;
    if (snap.lines.length > 0) {
      await tx`insert into lines ${tx(snap.lines.map((l, i) => ({
        document_id: Number(docId), position: i + 1, kind: l.kind, item_id: l.itemId === null ? null : Number(l.itemId), description: l.description,
        quantity: l.quantity, unit: l.unit, unit_price: l.unitPrice, discount: l.discount, vat_rate: l.vatRate, goods: l.goods, net: l.kind === "line" ? lineNet(l) : 0,
        deposit_of: null,
      })))}`;
    }
    await tx`delete from quote_versions where id = ${snap.id}`;
    const [back] = await tx`select * from documents where id = ${docId}`;
    return toDoc(back as never);
  });
}

// versionsOf: the versions a quote had before this one, the latest first.
export async function versionsOf(sql: Query, actor: Member | null, documentId: unknown): Promise<Version[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  return (await sql<VersionRow[]>`select * from quote_versions where document_id = ${id(documentId)} order by version desc`).map(toVersion);
}

// The versions of a quote for its public page (the secret was checked).
export async function earlierVersions(sql: Query, documentId: string): Promise<Version[]> {
  return (await sql<VersionRow[]>`select * from quote_versions where document_id = ${documentId} order by version desc`).map(toVersion);
}

// versionPdf: the PDF of an earlier version, as the client was shown it.
export async function versionPdf(sql: Query, documentId: string, version: unknown): Promise<{ bytes: Uint8Array; number: string; version: number }> {
  const v = typeof version === "string" && /^\d{1,4}$/u.test(version) ? Number(version) : typeof version === "number" ? version : NaN;
  if (!Number.isInteger(v) || v < 1) throw new AppError("not_found");
  const [row] = await sql<VersionRow[]>`select * from quote_versions where document_id = ${documentId} and version = ${v}`;
  if (!row) throw new AppError("not_found");
  if (!row.pdf_object) throw new AppError("file_missing");
  // Read once, then kept in the process by its fingerprint (src/lib/kept.ts).
  const bytes = row.pdf_sha256 ? await keptPdf(row.pdf_object, row.pdf_sha256) : (await files.get(row.pdf_object).catch(error => { if (error instanceof ChestError) return null; throw error; }))?.data ?? null;
  if (!bytes) throw new AppError("file_missing");
  return { bytes, number: row.number, version: row.version };
}

// What changed between the version a client read (found by the PDF's
// fingerprint their answer carried) and the quote as it is now: the lines
// changed, added or removed, and the total. Null when the version read is
// not known (the page then only says the quote changed).
export type Change =
  | { kind: "total"; before: number; after: number }
  | { kind: "changed"; description: string; before: number; after: number }
  | { kind: "added"; description: string; amount: number }
  | { kind: "removed"; description: string; amount: number };

export async function changesSince(sql: Query, full: Pick<Full, "id" | "lines" | "gross">, shown: unknown): Promise<{ version: number; changes: Change[] } | null> {
  if (typeof shown !== "string" || !/^[0-9a-f]{64}$/u.test(shown)) return null;
  const [row] = await sql<VersionRow[]>`select * from quote_versions where document_id = ${full.id} and pdf_sha256 = ${shown} order by version desc limit 1`;
  if (!row) return null;
  return { version: row.version, changes: diffLines(row.lines, row.gross, full.lines, full.gross) };
}

// diffLines compares two quotes' lines by their words: the same words with
// another amount (or quantity, or price) changed; words only in the new one
// added; only in the old one removed. At most eight, then the total.
export function diffLines(before: readonly Line[], beforeGross: number, after: readonly Line[], afterGross: number): Change[] {
  const old = before.filter(l => l.kind === "line").map(l => ({ line: l, used: false }));
  const out: Change[] = [];
  for (const l of after.filter(x => x.kind === "line")) {
    const same = old.find(o => !o.used && o.line.description === l.description);
    if (!same) { out.push({ kind: "added", description: l.description, amount: l.net }); continue; }
    same.used = true;
    if (same.line.net !== l.net || same.line.quantity !== l.quantity || same.line.unitPrice !== l.unitPrice || same.line.vatRate !== l.vatRate) {
      out.push({ kind: "changed", description: l.description, before: same.line.net, after: l.net });
    }
  }
  for (const o of old) if (!o.used) out.push({ kind: "removed", description: o.line.description, amount: o.line.net });
  const shown = out.slice(0, 8);
  if (beforeGross !== afterGross) shown.push({ kind: "total", before: beforeGross, after: afterGross });
  return shown;
}
