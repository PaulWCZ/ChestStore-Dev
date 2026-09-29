import { createHash, randomBytes } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { draw } from "./archive.ts";
import type { Query, Sql } from "./db.ts";
import { getDocument, type Full } from "./documents.ts";
import { isLocale, type Locale } from "./i18n/index.ts";
import { clean, id } from "./model.ts";

// The client's answer online (the tool's public part, /q/<secret>).
//
// A quote that was sent gets a secret link (32 random characters — nothing
// else opens it). The client reads the quote there, as a page and as the
// PDF, and accepts it — their name typed, the box "Bon pour accord" ticked,
// the day written — or declines it, with a reason if they wish. The answer
// is kept as its proof: the server's time, a hash of the visitor's address
// (never the address), their browser, and the SHA-256 of the exact PDF they
// were shown (the file itself kept in the Chest's files). This is a record
// of consent, not a qualified electronic signature (eIDAS): the page says so.
//
// The link works while the quote waits for an answer and is valid; after
// its validity date it says the quote expired; the person who sent it may
// turn it off (and make a new one). Codes, never sentences.

// Who reads a quote for the public page: the tool itself, with the right to
// read (the secret was checked before).
const system = { id: "tool:online", role: "viewer", name: "", firstName: "", lastName: "", photo: null, groups: [], isAdmin: false, isBuilder: false, locale: "en" } as Member;

const secretPattern = /^[A-Za-z0-9_-]{32}$/u;
export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
const newSecret = () => randomBytes(24).toString("base64url");

export type Link = { id: string; documentId: string; secret: string; createdAt: string; createdBy: string; revokedAt: string | null; pdfSha256: string | null };
type LinkRow = { id: number; document_id: number; secret: string; created_at: Date; created_by: string; revoked_at: Date | null; pdf_object: string | null; pdf_sha256: string | null; pdf_of: Date | null };
const toLink = (r: LinkRow): Link => ({ id: String(r.id), documentId: String(r.document_id), secret: r.secret, createdAt: r.created_at.toISOString(), createdBy: r.created_by, revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null, pdfSha256: r.pdf_sha256 });

export type Answer = { id: string; answer: "accepted" | "refused"; name: string; reason: string; answeredOn: string; answeredAt: string; visitorHash: string; userAgent: string; number: string | null; version: number; gross: number; currency: string; pdfSha256: string; pdfObject: string | null; termsSha256: string | null };
type AnswerRow = { id: number; answer: "accepted" | "refused"; name: string; reason: string; answered_on: string; answered_at: Date; visitor_hash: string; user_agent: string; number: string | null; version: number; gross: number; currency: string; pdf_sha256: string; pdf_object: string | null; terms_sha256?: string | null };
const toAnswer = (r: AnswerRow): Answer => ({ id: String(r.id), answer: r.answer, name: r.name, reason: r.reason, answeredOn: r.answered_on, answeredAt: r.answered_at.toISOString(), visitorHash: r.visitor_hash, userAgent: r.user_agent, number: r.number, version: r.version ?? 1, gross: r.gross, currency: r.currency, pdfSha256: r.pdf_sha256, pdfObject: r.pdf_object, termsSha256: r.terms_sha256 ?? null });

async function quoteRow(tx: Query, docId: string): Promise<{ type: string; status: string; deleted_at: Date | null }> {
  const [d] = await tx<{ type: string; status: string; deleted_at: Date | null }[]>`select type, status, deleted_at from documents where id = ${docId} for update`;
  if (!d || d.deleted_at || d.type !== "quote") throw new AppError("not_found");
  return d;
}

// --- The members' side -------------------------------------------------------

// liveLink: the quote's link that works now, or null.
export async function liveLink(sql: Query, documentId: string): Promise<Link | null> {
  const [row] = await sql<LinkRow[]>`select * from quote_links where document_id = ${documentId} and revoked_at is null`;
  return row ? toLink(row) : null;
}

// ensureLink gives the quote's live link, making one when it has none —
// when the quote is sent (by email or by hand). A draft has none.
export async function ensureLink(sql: Sql, actor: Member | null, documentId: unknown): Promise<Link> {
  if (!can(actor, "quotes.write")) throw new AppError("forbidden");
  const docId = id(documentId);
  return sql.begin(async tx => {
    const d = await quoteRow(tx, docId);
    if (d.status === "draft") throw new AppError("wrong_status");
    const [live] = await tx<LinkRow[]>`select * from quote_links where document_id = ${docId} and revoked_at is null`;
    if (live) return toLink(live);
    const secret = newSecret();
    const [row] = await tx<LinkRow[]>`insert into quote_links (document_id, secret, secret_hash, created_by) values (${docId}, ${secret}, ${hashSecret(secret)}, ${actor!.id}) returning *`;
    return toLink(row!);
  });
}

// revokeLink turns the quote's link off: it never works again.
export async function revokeLink(sql: Sql, actor: Member | null, documentId: unknown): Promise<void> {
  if (!can(actor, "quotes.write")) throw new AppError("forbidden");
  const docId = id(documentId);
  await sql.begin(async tx => {
    await quoteRow(tx, docId);
    const done = await tx`update quote_links set revoked_at = now(), revoked_by = ${actor!.id} where document_id = ${docId} and revoked_at is null returning id`;
    if (done.length === 0) throw new AppError("wrong_status");
  });
}

// renewLink turns the old link off and makes a new one (to send again).
export async function renewLink(sql: Sql, actor: Member | null, documentId: unknown): Promise<Link> {
  if (!can(actor, "quotes.write")) throw new AppError("forbidden");
  const docId = id(documentId);
  await sql`update quote_links set revoked_at = now(), revoked_by = ${actor!.id} where document_id = ${docId} and revoked_at is null`;
  return ensureLink(sql, actor, docId);
}

// answersOf: the answers given online to a quote, the oldest first.
export async function answersOf(sql: Query, actor: Member | null, documentId: unknown): Promise<Answer[]> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  return (await sql<AnswerRow[]>`select * from quote_answers where document_id = ${id(documentId)} order by answered_at, id`).map(toAnswer);
}

// answerPdf: the exact PDF an answer was given on (for whoever may read the
// quote), from the Chest's files.
export async function answerPdf(sql: Query, actor: Member | null, answerId: unknown): Promise<{ bytes: Uint8Array; number: string | null; documentId: string }> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const [row] = await sql<(AnswerRow & { document_id: number })[]>`select * from quote_answers where id = ${id(answerId)}`;
  if (!row || !row.pdf_object) throw new AppError("not_found");
  const file = await files.get(row.pdf_object).catch(error => { if (error instanceof ChestError) return null; throw error; });
  if (!file) throw new AppError("file_missing");
  return { bytes: file.data, number: row.number, documentId: String(row.document_id) };
}

// --- The public side ---------------------------------------------------------

// What the link's page shows: open (the client may answer), expired, the
// answer already given (online or recorded by the company), revising (the
// company is writing the quote's next version: no answer until it is
// sent), or off (turned off, withdrawn, taken back to a draft).
export type Showing = "open" | "expired" | "accepted" | "refused" | "revising" | "off";
export type Opened = { link: Link; full: Full; showing: Showing; answer: Answer | null };

export async function openLink(sql: Query, secret: unknown, today: string): Promise<Opened | null> {
  if (typeof secret !== "string" || !secretPattern.test(secret)) return null;
  const [row] = await sql<LinkRow[]>`select * from quote_links where secret_hash = ${hashSecret(secret)}`;
  if (!row) return null;
  let full: Full;
  try {
    full = await getDocument(sql, system, String(row.document_id), today);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") return null;
    throw error;
  }
  const [last] = await sql<AnswerRow[]>`select * from quote_answers where document_id = ${row.document_id} order by answered_at desc, id desc limit 1`;
  const answer = last ? toAnswer(last) : null;
  const link = toLink(row);
  const showing: Showing = link.revokedAt ? "off"
    : full.status === "draft" && full.version > 1 ? "revising"
    : full.status === "draft" ? "off"
    : full.status === "accepted" ? "accepted"
    : full.status === "refused" ? "refused"
    : full.state === "expired" ? "expired"
    : "open";
  // An answer taken back by the company (the quote waits again) is not
  // shown as the answer.
  return { link, full, showing, answer: answer && showing === answer.answer ? answer : null };
}

// shownPdf: the PDF the client is shown — the one kept for this link while
// the quote has not changed, otherwise drawn again and kept (the old one
// stays when an answer was given on it).
export async function shownPdf(sql: Query, opened: Pick<Opened, "link" | "full">, today: string): Promise<{ bytes: Uint8Array; sha256: string }> {
  const { link, full } = opened;
  const [row] = await sql<LinkRow[]>`select * from quote_links where id = ${link.id}`;
  if (row && row.pdf_object && row.pdf_sha256 && row.pdf_of && row.pdf_of.toISOString() === full.updatedAt) {
    const stored = await files.get(row.pdf_object).catch(error => { if (error instanceof ChestError) return null; throw error; });
    if (stored) return { bytes: stored.data, sha256: row.pdf_sha256 };
  }
  const bytes = await draw(sql, full, today);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const object = `answers/${(full.number ?? full.id).replace(/[^A-Za-z0-9_-]/gu, "_")}-${sha256.slice(0, 16)}.pdf`;
  let kept: string | null = null;
  try {
    await files.put(object, bytes, "application/pdf");
    kept = object;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  await sql`update quote_links set pdf_object = ${kept}, pdf_sha256 = ${sha256}, pdf_of = ${new Date(full.updatedAt)} where id = ${link.id}`;
  // The PDF it replaces goes, unless someone answered on it or it is an
  // earlier version's (lib/versions.ts).
  if (row?.pdf_object && row.pdf_object !== kept) {
    const [used] = await sql`select 1 from quote_answers where pdf_object = ${row.pdf_object} union all select 1 from quote_versions where pdf_object = ${row.pdf_object} limit 1`;
    if (!used) await files.delete(row.pdf_object).catch(error => { if (!(error instanceof ChestError)) throw error; });
  }
  return { bytes, sha256 };
}

// `terms`: the fingerprint of the terms and conditions of sale the page
// offered ("" when none).
export type AnswerInput = { answer?: unknown; name?: unknown; agree?: unknown; reason?: unknown; shown?: unknown; terms?: unknown };
export type Visitor = { hash: string; userAgent: string; language: Locale };

// answer records the client's answer: the quote becomes accepted or
// refused (decided by the client), with its proof. Refused when the quote
// changed since the page was shown (the client must read it again), when
// it no longer waits for an answer, or after its validity date.
export async function answer(sql: Sql, secret: unknown, input: AnswerInput, visitor: Visitor, today: string): Promise<{ answer: Answer; full: Full; link: Link }> {
  const opened = await openLink(sql, secret, today);
  if (!opened) throw new AppError("not_found");
  const choice = input.answer === "accepted" || input.answer === "refused" ? input.answer : null;
  if (!choice) throw new AppError("invalid");
  const name = clean(input.name, 120);
  if ([...name].length < 2) throw new AppError("name_short");
  if (choice === "accepted" && input.agree !== true && input.agree !== "on" && input.agree !== "yes") throw new AppError("must_agree");
  const reason = choice === "refused" ? clean(input.reason ?? "", 1000, { optional: true, multiline: true }) : "";
  if (typeof input.shown !== "string" || !/^[0-9a-f]{64}$/u.test(input.shown)) throw new AppError("changed");
  if (opened.showing === "off") throw new AppError("link_off");
  // A new version is being written: what the client read is no longer
  // offered.
  if (opened.showing === "revising") throw new AppError("changed");
  if (opened.showing === "expired") throw new AppError("expired");
  if (opened.showing !== "open") throw new AppError("answered");
  // The PDF of this very version, kept (drawn now if it was not yet).
  const shown = await shownPdf(sql, opened, today);
  if (shown.sha256 !== input.shown) throw new AppError("changed");
  const docId = opened.full.id;
  const done = await sql.begin(async tx => {
    const [d] = await tx<{ status: string; updated_at: Date; valid_until: string | null; deleted_at: Date | null; number: string | null; version: number; gross: number; currency: string }[]>`
      select status, updated_at, valid_until, deleted_at, number, version, gross, currency from documents where id = ${docId} for update`;
    const [l] = await tx<LinkRow[]>`select * from quote_links where id = ${opened.link.id} for update`;
    if (!d || d.deleted_at || !l || l.revoked_at) throw new AppError("link_off");
    if (d.status === "draft") throw new AppError("changed");
    // The terms and conditions of sale the client was offered, if any.
    const [terms] = await tx<{ terms_sha256: string | null }[]>`select terms_sha256 from company where id = 1`;
    if ((terms?.terms_sha256 ?? "") !== (typeof input.terms === "string" ? input.terms : "")) throw new AppError("changed");
    if (d.status !== "sent") throw new AppError("answered");
    if (d.valid_until !== null && d.valid_until < today) throw new AppError("expired");
    if (d.updated_at.toISOString() !== opened.full.updatedAt || d.version !== opened.full.version || l.pdf_sha256 !== shown.sha256) throw new AppError("changed");
    const [row] = await tx<AnswerRow[]>`
      insert into quote_answers (document_id, link_id, answer, name, reason, answered_on, visitor_hash, user_agent, language, number, version, gross, currency, pdf_object, pdf_sha256, terms_sha256)
      values (${docId}, ${l.id}, ${choice}, ${name}, ${reason}, ${today}, ${visitor.hash.slice(0, 64)}, ${visitor.userAgent.replace(/\p{Cc}/gu, "").slice(0, 300)},
              ${isLocale(visitor.language) ? visitor.language : "en"}, ${d.number}, ${d.version}, ${d.gross}, ${d.currency}, ${l.pdf_object}, ${shown.sha256}, ${terms?.terms_sha256 ?? null})
      returning *`;
    await tx`update documents set status = ${choice}, decided_at = now(), decided_by = 'client', updated_at = now() where id = ${docId}`;
    return toAnswer(row!);
  });
  return { answer: done, full: opened.full, link: opened.link };
}
