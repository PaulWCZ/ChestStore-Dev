import { createHash, randomBytes } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { catalogue, type Locale } from "../i18n/index.ts";
import { recall, remember } from "./kept.ts";
import { clean, limits } from "./model.ts";

// The company's terms and conditions of sale (conditions générales de
// vente, CGV). An administrator adds them once, as a PDF, in Settings: it
// goes from their browser to the Chest's files (the tool authorises that
// one upload, then checks what arrived is a PDF). Then every quote sent by
// email carries it as a second attachment, the client's page links it, and
// accepting online says "and the terms and conditions of sale" — the
// answer keeps the terms' SHA-256 with the quote's. A replaced file stays
// in the Chest's files: an answer points to it by its fingerprint.
//
// The terms are not printed inside the quote's PDF (its own writer draws
// the quote only): they travel beside it.

export const termsPattern = /^terms\/[0-9a-f]{24}\.pdf$/u;

export async function grantTerms(actor: Member | null, input: { type?: unknown; size?: unknown }): Promise<{ url: string; method: string; object: string }> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (input.type !== "application/pdf") throw new AppError("terms_type");
  if (typeof input.size !== "number" || !Number.isInteger(input.size) || input.size < 1) throw new AppError("invalid");
  if (input.size > limits.termsSize) throw new AppError("terms_too_large");
  const object = `terms/${randomBytes(12).toString("hex")}.pdf`;
  const up = await files.uploadUrl(object, { maxSize: limits.termsSize, types: ["application/pdf"], expiresIn: 300 });
  return { url: up.url, method: up.method, object };
}

// saveTerms checks the file that arrived (a PDF, within bounds) and makes
// it the company's terms, with the name the admin's file had.
export async function saveTerms(sql: Sql, actor: Member | null, object: unknown, name: unknown): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  if (typeof object !== "string" || !termsPattern.test(object)) throw new AppError("file_missing");
  const file = await files.get(object);
  if (!file) throw new AppError("file_missing");
  if (file.data.byteLength > limits.termsSize) throw new AppError("terms_too_large");
  if (Buffer.from(file.data.subarray(0, 5)).toString("latin1") !== "%PDF-") {
    await files.delete(object).catch(() => false);
    throw new AppError("terms_type");
  }
  const sha256 = createHash("sha256").update(file.data).digest("hex");
  const shown = clean(typeof name === "string" && name.trim() ? name : "terms.pdf", 120);
  await sql`update company set terms_object = ${object}, terms_name = ${shown}, terms_sha256 = ${sha256}, terms_size = ${file.data.byteLength}, updated_by = ${actor!.id}, updated_at = now() where id = 1`;
}

// removeTerms: quotes go without terms from now on (the file stays for
// the answers given with it).
export async function removeTerms(sql: Sql, actor: Member | null): Promise<void> {
  if (!can(actor, "settings")) throw new AppError("forbidden");
  await sql`update company set terms_object = null, terms_name = null, terms_sha256 = null, terms_size = null, updated_by = ${actor!.id}, updated_at = now() where id = 1`;
}

// The terms as they are now: their bytes, or null when there are none or
// the Chest cannot give the file now.
export async function termsFile(sql: Query): Promise<{ bytes: Uint8Array; sha256: string } | null> {
  const [row] = await sql<{ terms_object: string | null; terms_sha256: string | null }[]>`select terms_object, terms_sha256 from company where id = 1`;
  if (!row?.terms_object || !row.terms_sha256) return null;
  // Read once, then kept in the process by its fingerprint (src/lib/kept.ts):
  // every quote's email and the clients' pages carry the same file.
  const cached = recall(row.terms_sha256);
  if (cached) return { bytes: cached, sha256: row.terms_sha256 };
  const file = await files.get(row.terms_object).catch(error => { if (error instanceof ChestError) return null; throw error; });
  if (!file) return null;
  remember(row.terms_sha256, file.data);
  return { bytes: file.data, sha256: row.terms_sha256 };
}

// The name the terms travel under, in the document's language.
export const termsFileName = (language: Locale): string => catalogue(language).mail.termsFile;
