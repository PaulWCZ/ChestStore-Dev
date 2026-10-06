import { createHash } from "node:crypto";
import { CapabilityNotGranted, ChestError, QuotaExceeded, Unavailable } from "@argentic/chest-sdk/errors";
import * as mail from "@argentic/chest-sdk/mail";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { pdfOfFull } from "./archive.ts";
import { company, goesBy, rememberMail } from "./company.ts";
import type { Sql } from "./db.ts";
import { getDocument, recordReminder, recordSent, sendQuote, type Full } from "./documents.ts";
import { catalogue, format, formatDay, type Locale } from "../i18n/index.ts";
import { clean, email, limits, numberPattern, versioned } from "../shared/model.ts";
import { formatMoney } from "../shared/money.ts";
import { pdfFileName } from "../pdf/document.ts";
import { ensureLink } from "./online.ts";
import { termsFile, termsFileName } from "./terms.ts";

// Sending a document to its client — someone outside the company: by email
// with its PDF attached, through the Chest's mail connector (Proposal
// (studio): "mail" in chest.proposals.json, backed by the company's own
// mail provider; not built yet), Reply-To the company's address of
// Settings (or the connector's own reply address when Settings has none) — or, where the Chest cannot send email yet, by
// the member's own means: they download the PDF, send it, and the tool
// records it as sent. The email is written in the client's language (the
// document's), and the member may change it before it goes.

export type Delivery = "email" | "no_mail";
export type Message = { to: string; subject: string; text: string };
export type Kind = "send" | "reminder";

// The message the send dialog starts from.
// A quote's later version says so, and which one it replaces (`replaces`:
// the day the version before was sent).
export function draftMessage(full: Full, kind: Kind, context: { company: string; sender: string; iban: string; bic: string; today: string; upcoming?: string; paymentLink?: string; replaces?: string | null }): Message {
  const t = catalogue(full.language).mail;
  const money = (minor: number) => formatMoney(minor, full.currency, full.language);
  const day = (d: string | null) => (d ? formatDay(d, full.language, { day: "numeric", month: "long", year: "numeric" }) : "");
  const buyer = full.buyer ?? full.client;
  const later = full.type === "quote" && full.version > 1;
  const values = {
    number: full.number ?? context.upcoming ?? "",
    versioned: versioned(full.number, full.version) ?? context.upcoming ?? "",
    version: full.version,
    replaces: day(context.replaces ?? null),
    company: context.company,
    title: full.title ? format(t.about, { title: full.title }) : "",
    amount: money(full.gross),
    date: day(full.type === "quote" ? full.validUntil : full.dueDate),
    issued: day(full.issueDate),
    left: money(Math.max(full.due, 0)),
    invoice: full.related.find(r => r.id === full.invoiceId)?.number ?? "",
  };
  const subject = kind === "reminder" ? t.reminderSubject : full.type === "quote" ? t.quoteSubject : full.type === "credit" ? t.creditSubject : t.invoiceSubject;
  const body = kind === "reminder" ? (full.status === "imported" ? t.reminderBodyImported : t.reminderBody)
    : full.type === "quote" ? (later ? (context.replaces ? t.quoteBodyVersion : t.quoteBodyVersionNoDate) : t.quoteBody)
    : full.type === "credit" ? t.creditBody : t.invoiceBody;
  const payment = (full.type === "invoice" && context.iban ? "\n\n" + format(t.transfer, { iban: context.iban, bic: context.bic ? format(t.bic, { bic: context.bic }) : "" }) : "")
    + (full.type === "invoice" && context.paymentLink ? "\n\n" + format(t.payOnline, { link: context.paymentLink }) : "");
  const text = [
    format(t.greeting, { name: buyer?.contact ? " " + buyer.contact : "" }),
    "",
    format(body, values) + payment,
    "",
    t.signoff,
    ...(context.sender ? [context.sender] : []),
    context.company,
  ].join("\n");
  return { to: buyer?.email ?? "", subject: format(subject, { ...values, number: values.versioned }), text };
}

function checkMessage(input: unknown): Message & { upcoming: string | null } {
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const m = input as Record<string, unknown>;
  const to = email(m["to"]);
  if (!to) throw new AppError("no_email");
  const upcoming = typeof m["upcoming"] === "string" && numberPattern.test(m["upcoming"]) ? m["upcoming"] : null;
  return { to, subject: clean(m["subject"], limits.title), text: clean(m["text"], limits.message, { multiline: true }), upcoming };
}

// The PDF goes as an attachment, the company's address as the reply-to;
// the same message twice within a day is sent once (a double click).
async function deliver(sql: Sql, full: Full, message: Message, fromName: string, replyTo: string, today: string): Promise<Delivery> {
  // An invoice imported from the previous tool has no PDF here: its
  // reminder goes without it (its number and amounts are in the text).
  const bytes = full.status === "imported" ? null : await pdfOfFull(sql, full, today);
  // A quote carries the company's terms and conditions of sale, when it
  // has them (lib/terms.ts).
  const terms = full.type === "quote" ? await termsFile(sql) : null;
  const key = "doc-" + createHash("sha256").update([full.id, message.to, message.subject, message.text].join("\u0000")).digest("hex").slice(0, 40);
  try {
    await mail.send({
      to: message.to, subject: message.subject, text: message.text, fromName: fromName.slice(0, 100).replace(/[\r\n]/gu, " "),
      ...(replyTo ? { replyTo } : {}),
      ...(bytes ? { attachments: [{ name: pdfFileName(full), type: "application/pdf", content: bytes }, ...(terms ? [{ name: termsFileName(full.language), type: "application/pdf", content: terms.bytes }] : [])] } : {}),
      key,
    });
  } catch (error) {
    // No mail on this Chest, or its owner has not connected the company's
    // mail provider (Unavailable — also a Chest that did not answer):
    // nothing went, and the dialog offers to send it yourself.
    if (error instanceof CapabilityNotGranted || error instanceof Unavailable) {
      await rememberMail(sql, false);
      return "no_mail";
    }
    if (error instanceof QuotaExceeded) throw new AppError("mail_quota");
    if (error instanceof ChestError && error.code === "suppressed") throw new AppError("suppressed");
    if (error instanceof ChestError && error.code === "invalid_address") throw new AppError("email_invalid");
    throw error;
  }
  await rememberMail(sql, true);
  return "email";
}

const senderName = (actor: Member, companyName: string) => (companyName ? `${actor.name} — ${companyName}` : actor.name);

// answerLine: the first line of a quote's email, in the document's
// language — where the client reads the quote and accepts it online. The
// send dialog shows it, fixed, above the words the member may change.
export function answerLine(language: Locale, number: string, url: string): string {
  return format(catalogue(language).mail.answerOnline, { number, link: url });
}

// withAnswerLink opens a quote's email with its answer line (once).
export function withAnswerLink(text: string, language: Locale, url: string, number: string): string {
  if (text.includes(url)) return text;
  return answerLine(language, number, url) + "\n\n" + text;
}

// sendDocument emails a quote (numbering a draft first), an invoice or a
// credit note (finalised). "no_mail": the Chest cannot send email yet —
// nothing went; a quote stays as it was. A quote's email carries the link
// to answer it online, when the public address is known (origin).
export async function sendDocument(sql: Sql, actor: Member | null, documentId: unknown, input: unknown, today: string, options: { origin?: string | null } = {}): Promise<{ delivery: Delivery; number: string | null }> {
  const message = checkMessage(input);
  let full = await getDocument(sql, actor, documentId, today);
  if (!can(actor, full.type === "quote" ? "quotes.write" : "invoices.issue")) throw new AppError("forbidden");
  if (full.type !== "quote" && full.status !== "final") throw new AppError("not_final");
  const c = await company(sql);
  const name = goesBy(c);
  if (full.type === "quote") {
    // Numbered (and checked) in its own transaction; taken back below if
    // the email cannot go.
    const before = full.status;
    await sendQuote(sql, actor, full.id, message.to, today);
    full = await getDocument(sql, actor, full.id, today);
    // The number the dialog announced was taken meanwhile: the true one.
    if (message.upcoming && full.number && message.upcoming !== full.number) {
      message.subject = message.subject.split(message.upcoming).join(full.number);
      message.text = message.text.split(message.upcoming).join(full.number);
    }
    if (options.origin) {
      const link = await ensureLink(sql, actor, full.id);
      message.text = withAnswerLink(message.text, full.language, `${options.origin}/q/${link.secret}`, versioned(full.number, full.version) ?? "");
    }
    const delivery = await deliver(sql, full, message, senderName(actor!, name), c.email, today).catch(async error => {
      await undoSend(sql, full.id, before);
      throw error;
    });
    if (delivery === "no_mail") await undoSend(sql, full.id, before);
    return { delivery, number: full.number };
  }
  const delivery = await deliver(sql, full, message, senderName(actor!, name), c.email, today);
  if (delivery === "email") await recordSent(sql, actor, full.id, message.to);
  return { delivery, number: full.number };
}

// A quote whose email could not go: back to how it was. A draft keeps the
// number it was just given, and sends with it later.
async function undoSend(sql: Sql, documentId: string, before: string): Promise<void> {
  if (before === "draft") await sql`update documents set status = 'draft', sent_at = null, sent_by = null, emailed_to = null where id = ${documentId} and type = 'quote'`;
  else await sql`update documents set emailed_to = null where id = ${documentId} and type = 'quote'`;
}

// markSent records that the member sent the document themselves (the PDF
// downloaded and attached to their own email, or printed).
export async function markSent(sql: Sql, actor: Member | null, documentId: unknown, today: string): Promise<{ number: string | null }> {
  const full = await getDocument(sql, actor, documentId, today);
  if (full.type === "quote") {
    const sent = await sendQuote(sql, actor, full.id, null, today);
    await ensureLink(sql, actor, full.id);
    return { number: sent.number };
  }
  await recordSent(sql, actor, full.id, null);
  return { number: full.number };
}

// sendReminder emails a reminder of an invoice not paid in full, with its
// PDF; the member presses the button, nothing goes by itself.
export async function sendReminder(sql: Sql, actor: Member | null, documentId: unknown, input: unknown, today: string): Promise<{ delivery: Delivery }> {
  if (!can(actor, "payments")) throw new AppError("forbidden");
  const message = checkMessage(input);
  const full = await getDocument(sql, actor, documentId, today);
  if (full.type !== "invoice" || (full.status !== "final" && full.status !== "imported")) throw new AppError("not_final");
  if (full.due <= 0) throw new AppError("nothing_due");
  const c = await company(sql);
  const delivery = await deliver(sql, full, message, senderName(actor!, goesBy(c)), c.email, today);
  if (delivery === "email") await recordReminder(sql, actor, full.id, message.to);
  return { delivery };
}

// markReminded records a reminder the member made themselves.
export async function markReminded(sql: Sql, actor: Member | null, documentId: unknown): Promise<void> {
  await recordReminder(sql, actor, documentId, null);
}

// sendAutomaticReminder emails the reminder of a late invoice by itself
// (lib/reminders.ts, on the company's reminder rules): the usual reminder
// in the client's language, signed with the company's name, its PDF
// attached. "no_mail" when the Chest cannot send email: nothing went.
export async function sendAutomaticReminder(sql: Sql, full: Full, step: number, today: string): Promise<Delivery> {
  const c = await company(sql);
  const name = goesBy(c);
  const to = full.buyer?.email ?? full.client?.email ?? "";
  if (!to) return "no_mail";
  const message = draftMessage(full, "reminder", { company: name, sender: "", iban: c.iban, bic: c.bic, today, paymentLink: c.paymentLink ?? "" });
  const bytes = full.status === "imported" ? null : await pdfOfFull(sql, full, today);
  try {
    await mail.send({
      to, subject: message.subject, text: message.text, fromName: name.slice(0, 100).replace(/[\r\n]/gu, " "),
      ...(c.email ? { replyTo: c.email } : {}),
      ...(bytes ? { attachments: [{ name: pdfFileName(full), type: "application/pdf", content: bytes }] } : {}),
      // The recipient in the key (sdk/README, "Put the recipient in the
      // key"): after a restore, an invoice's id may name another one.
      key: `reminder-${full.id}-${step}-${to}`,
    });
  } catch (error) {
    if (error instanceof CapabilityNotGranted) {
      await rememberMail(sql, false);
      return "no_mail";
    }
    // Unavailable (paused, or no answer) is thrown: the step comes back
    // the next morning (reminders.ts). Not connected is known before:
    // remindByEmail sends nothing then, and the bell alone tells billing.
    if (error instanceof ChestError && (error.code === "suppressed" || error.code === "invalid_address")) return "no_mail";
    throw error;
  }
  await rememberMail(sql, true);
  await sql`update documents set reminded_at = now(), reminders = reminders + 1, emailed_to = ${to} where id = ${full.id} and type = 'invoice' and status in ('final', 'imported')`;
  return "email";
}
