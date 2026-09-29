import * as chest from "@argentic/chest-sdk/chest";
import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { catalogue, format, isLocale, type Locale } from "./i18n/index.ts";
import { confirmationsPerHour } from "./mail-in.ts";
import * as mailer from "./mailer.ts";
import { email, limits } from "./model.ts";
import { publicBase } from "./public-origin.ts";
import * as tell from "./tell.ts";
import { robotAddress } from "./text.ts";
import * as tickets from "./tickets.ts";

// What Forms tells Support (Proposal (studio): events between tools, once
// an administrator linked the two): an answer to a form its author mapped
// to a ticket — "forms.request", version 1 (Forms' README, "With the other
// tools"):
//
//   { v: 1, form: {id, title}, answer: {id, at, language, path},
//     subject, details | null, requester: {name, email, member},
//     fields: [{question, label, value}] }
//
// It opens a ticket as the public form does — the rules on arrival, the
// bell for those who answer, the confirmation with the follow-up link when
// the Chest can send email — from the customer's address (a public form)
// or from the colleague who answered (a team form: their member id only,
// never their name or address). Delivered again, it opens nothing.
//
// The data comes from another tool: read as untrusted — every text bounded
// and cleaned, the address checked, the link back only of a known shape.
// Anything that names no one to answer is accepted and ignored.

// The bounds of what Support keeps from an event (Forms' own are smaller:
// subject 150, details 8,000, a field's value 1,000).
export const formsLimits = { title: 200, details: 8000, fields: 100, label: 200, value: 1000 } as const;

const idPattern = /^[A-Za-z0-9_-]{1,64}$/u;
const memberPattern = /^mbr_[a-z2-7]{26}$/u;
// The answer's page in Forms, on the Chest's team address: /chest and
// plain segments only (no dot, no "//", no query).
const pathPattern = /^\/chest(\/[A-Za-z0-9_-]{1,64}){1,8}$/u;

const object = (value: unknown): Record<string, unknown> | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const cut = (text: string, max: number) => [...text].slice(0, max).join("").trim();
// Text as a person wrote it: no control characters but line breaks and
// tabs, no invisible direction changes, trimmed, bounded.
function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const t = value.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n\t]/gu, "").replace(/[‪-‮⁦-⁩]/gu, "").replace(/\n{4,}/gu, "\n\n\n").trim();
  return cut(t, max);
}
// One line: every run of spaces or line breaks one space.
const line = (value: unknown, max: number) => cut(text(value, max * 4).replace(/\s+/gu, " "), max);

// readRequest reads a delivered "forms.request" into what a ticket needs,
// or null when it cannot be one (another shape, nobody to answer). The
// language of a request is the answer's, else the Chest's.
export function readRequest(event: Pick<ToolEvent, "id" | "data">, fallback: Locale): tickets.FormsRequest | null {
  const d = event.data;
  if (typeof event.id !== "string" || event.id.length < 1 || event.id.length > 100) return null;
  if (typeof d["v"] !== "number" || !Number.isInteger(d["v"]) || d["v"] < 1) return null;
  const form = object(d["form"]), answer = object(d["answer"]), requester = object(d["requester"]);
  if (!form || !answer || !requester) return null;
  const formId = form["id"], answerId = answer["id"];
  if (typeof formId !== "string" || !idPattern.test(formId) || typeof answerId !== "string" || !idPattern.test(answerId)) return null;
  const title = line(form["title"], formsLimits.title);
  if (!title) return null;
  // Who to answer: the colleague of a team form, else a customer's address.
  const member = typeof requester["member"] === "string" && memberPattern.test(requester["member"]) ? requester["member"] : null;
  let address: string | null = null;
  if (!member && typeof requester["email"] === "string") {
    try {
      address = email(requester["email"]).toLowerCase();
    } catch {
      address = null;
    }
  }
  if (!member && !address) return null;
  const language: Locale = isLocale(answer["language"]) ? answer["language"] : fallback;
  const path = typeof answer["path"] === "string" && pathPattern.test(answer["path"]) ? answer["path"] : null;
  const subject = line(d["subject"], limits.subject) || cut(title, limits.subject);
  // The message: the details, then every other answer, one a line, in the
  // request's language ("Your phone number: +33 6 …"), within a message's
  // bounds (the last answers give way first).
  const t = catalogue(language).forms;
  const parts: string[] = [];
  const details = text(d["details"], formsLimits.details);
  if (details) parts.push(details);
  const fields = Array.isArray(d["fields"]) ? d["fields"].slice(0, formsLimits.fields) : [];
  const lines: string[] = [];
  for (const raw of fields) {
    const f = object(raw);
    const label = f ? line(f["label"], formsLimits.label) : "";
    const value = f ? text(f["value"], formsLimits.value) : "";
    if (!label || !value) continue;
    lines.push(format(value.includes("\n") ? t.fieldBlock : t.fieldLine, { label, value }));
  }
  while (lines.length > 0 && [...[...parts, lines.join("\n")].join("\n\n")].length > limits.body) lines.pop();
  if (lines.length > 0) parts.push(lines.join("\n"));
  const body = cut(parts.join("\n\n"), limits.body) || "—";
  return {
    event: event.id,
    source: { form: { id: formId, title }, answer: { id: answerId, path } },
    subject,
    body,
    email: address,
    name: member ? "" : line(requester["name"], limits.name),
    member,
    language,
  };
}

// received opens the ticket of a delivered request, then does what the
// public form does for a new request: confirm it to a customer by email
// (with the follow-up link; never to a robot's address, three an hour to
// one address at most), tell those who answer (or the one a rule gave it
// to), refresh the tiles. A colleague gets no email: Support keeps no
// address of theirs. Nothing is done twice for one answer.
export async function received(sql: Sql, event: Pick<ToolEvent, "id" | "data">): Promise<void> {
  const fallback = chest.locale();
  const request = readRequest(event, isLocale(fallback) ? fallback : "en");
  if (!request) {
    // Never the event's content in the log: it is a person's answer.
    console.warn("forms.request ignored: nobody to answer or not a request");
    return;
  }
  const t = await tickets.fromForms(sql, request);
  if (!t.created) return;
  if (request.email && t.secret && !robotAddress(request.email) && (await tickets.confirmations(sql, request.email)) < confirmationsPerHour) {
    const s = await tickets.settings(sql);
    const sent = await mailer.confirm({ number: t.number, subject: request.subject, customerEmail: request.email, customerName: request.name, language: request.language }, `${publicBase(s.publicOrigin)}/t/${t.secret}`, s.companyName || chest.company());
    if (sent.delivery === "email") await tickets.confirmed(sql, t.id, sent.mail);
  }
  await tell.newTicket({ id: t.id, number: t.number, subject: request.subject, customerName: request.name, customerEmail: request.email ?? "", requester: request.member }, request.body, t.assignee);
  await tell.refreshBadges(sql);
}

// formsLink is the address of the answer in Forms, for the link back on
// the ticket: made when the page is shown, from the path the ticket keeps
// (never an address: Forms' changes with a custom domain) and the
// addresses the Chest gives (Proposal (studio): chest.toolLink). null when
// Forms is not installed on this Chest or the path is not an answer's page
// — the ticket then names the form without a link.
export function formsLink(path: string | null): string | null {
  return path && pathPattern.test(path) ? chest.toolLink("forms", path) : null;
}
