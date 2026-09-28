import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { company } from "./company.ts";
import type { Query } from "./db.ts";
import { getDocument, type Full } from "./documents.ts";
import { buyerOf, sellerOf, type Seller } from "./parties.ts";
import { renderPdf, pdfFileName } from "./pdf/document.ts";
import { readImage, type Image } from "./pdf/image.ts";

// The PDF of a document. A finalised invoice or credit note is kept as it
// was issued: its PDF is made once, from its frozen data, and stored in the
// Chest's files with its SHA-256 (documents.pdf_object, pdf_sha256) — the
// copy the company keeps for ten years, the one the accountant's ZIP holds.
// A quote, or a draft, is drawn afresh each time (a draft is marked as not
// being an invoice on every page).

export type Pdf = { bytes: Uint8Array; fileName: string };

// The logo as the document prints it, or none when the Chest cannot give it.
async function logoOf(seller: Seller): Promise<Image | null> {
  if (!seller.logo) return null;
  try {
    const file = await files.get(seller.logo);
    return file ? readImage(file.data) : null;
  } catch {
    return null;
  }
}

export async function draw(sql: Query, full: Full, today: string): Promise<Uint8Array> {
  const seller = full.seller ?? sellerOf(await company(sql));
  const buyer = full.buyer ?? (full.client ? buyerOf(full.client) : null);
  const ref = full.related.find(r => (full.type === "credit" ? r.id === full.invoiceId : r.id === full.quoteId));
  return renderPdf({
    doc: full,
    lines: full.lines,
    seller,
    buyer,
    reference: ref && ref.number ? { number: ref.number, issueDate: ref.issueDate } : null,
    logo: await logoOf(seller),
    today,
    created: new Date(full.finalisedAt ?? full.sentAt ?? full.updatedAt),
  });
}

const frozen = (d: Pick<Full, "type" | "status">) => d.type !== "quote" && d.status === "final";

export async function pdfOf(sql: Query, actor: Member | null, documentId: unknown, today: string): Promise<Pdf> {
  const full = await getDocument(sql, actor, documentId, today);
  return { bytes: await pdfOfFull(sql, full, today), fileName: pdfFileName(full) };
}

export async function pdfOfFull(sql: Query, full: Full, today: string): Promise<Uint8Array> {
  if (frozen(full) && full.pdfObject) {
    try {
      const stored = await files.get(full.pdfObject);
      if (stored) return stored.data;
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  const bytes = await draw(sql, full, today);
  if (frozen(full) && !full.pdfObject) await keep(sql, full, bytes);
  return bytes;
}

// keep stores an issued document's PDF once; when the Chest cannot take it
// now, the next download tries again (the document's data is frozen, so
// the PDF drawn then is the same).
export async function keep(sql: Query, full: Pick<Full, "id" | "number" | "issueDate">, bytes: Uint8Array): Promise<void> {
  const object = `documents/${(full.issueDate ?? "0000").slice(0, 4)}/${(full.number ?? full.id).replace(/[^A-Za-z0-9_-]/gu, "_")}.pdf`;
  try {
    await files.put(object, bytes, "application/pdf");
    const sha = createHash("sha256").update(bytes).digest("hex");
    await sql`update documents set pdf_object = ${object}, pdf_sha256 = ${sha} where id = ${full.id} and pdf_object is null`;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

