import { createHash } from "node:crypto";
import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Query, Sql } from "./db.ts";
import { format } from "./i18n/index.ts";
import { fold } from "./fold.ts";
import { email as checkEmail, limits, phone as checkPhone, phoneDigits } from "./model.ts";
import { cut as bounded, notify } from "./notify.ts";
import { managers } from "./team.ts";

// What Forms tells Clients (Proposal (studio): events between tools, once
// an administrator linked the two): `forms.contact`, someone who filled in
// a form whose author maps a contact, and left an email or a phone. The
// contract is Forms' (its README, "With the other tools"; version 1, a
// later version only adds fields):
//
//   { v: 1, form: {id, title}, answer: {id, at, language, path},
//     contact: {name, email, phone, company}, message, member }
//
// Who the person is — a privacy rule (GDPR: one person's words must never
// sit in another's file, where their right of access cannot find them and
// erasing the other would take them):
//
// 1. the same email (whatever its case) is the same person;
// 2. the same phone (digits compared, "+33 6…" as "06…") is the same
//    person only when the name is the same too (accents, case, punctuation
//    and word order aside: "Roux, Nina" = "nina roux") — a switchboard, a
//    shop's line or a mistyped digit is shared by several people;
// 3. otherwise a new contact is made; when its phone is another contact's,
//    it is marked as maybe the same person (`maybe_same`), for someone to
//    merge or keep apart (the contact's page asks).
//
// Either way their history gains one line, "Filled in the form “Contact
// us”", with their message and what the form gave (name, email, phone,
// company: `data.who`, shown on the line), in each reader's language, and
// they count as in touch that day (the prospects' three-year rule). An
// existing contact keeps what the team wrote: only an empty email, phone
// or company is filled in; a different address the form gave stays on the
// line, where a manager's check finds it (lib/leads.ts, formLinesToCheck).
// A new contact is at the company of that name (found accents and case
// aside, or added).
//
// Who owns a new contact: nobody. An import gives its rows to the person
// who imports (lib/importers.ts); here nobody acts, so the contact is
// unassigned — as a departed teammate's clients are (lib/lifecycle.ts) —
// and the managers are told in the bell. A known contact stays with its
// owner, who is told instead.
//
// At least once, and never twice: an event is handled once by its id (the
// line of history carries it, under a unique index), and an answer
// published again under another id finds its line too. Anything of another
// shape is accepted and ignored.

export type FormContact = {
  event: string;
  form: { id: string; title: string };
  answer: { id: string; at: Date; path: string };
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
};

export const refPattern = /^[A-Za-z0-9_-]{1,64}$/u;
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cut = (text: string, max: number) => [...text].slice(0, max).join("").trim();
// One line of text, or several (a message): control characters and
// direction overrides out, bounded.
export const line = (value: unknown, max: number): string => (typeof value === "string" ? cut(value.replace(/\s+/gu, " ").replace(/[\p{Cc}‪-‮⁦-⁩]/gu, "").trim(), max) : "");
const text = (value: unknown, max: number): string => (typeof value === "string" ? cut(value.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n\t]/gu, "").replace(/[‪-‮⁦-⁩]/gu, "").trim(), max) : "");
export const safe = (read: () => string): string => {
  try {
    return read();
  } catch {
    return "";
  }
};

// readFormContact: the event as Clients uses it, or null when it cannot
// make a contact (another shape, no way to reach the person).
export function readFormContact(event: Pick<ToolEvent, "id" | "data">, now = new Date()): FormContact | null {
  const { v, form, answer, contact } = event.data;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return null;
  if (!isObject(form) || !isObject(answer) || !isObject(contact)) return null;
  if (typeof form["id"] !== "string" || !refPattern.test(form["id"])) return null;
  if (typeof answer["id"] !== "string" || !refPattern.test(answer["id"])) return null;
  const email = safe(() => checkEmail(line(contact["email"], limits.email)));
  const phone = safe(() => checkPhone(line(contact["phone"], limits.phone)));
  if (!email && !phone) return null;
  const at = typeof answer["at"] === "string" ? new Date(answer["at"]) : null;
  const path = typeof answer["path"] === "string" && /^\/[\x21-\x7e]{0,299}$/u.test(answer["path"]) ? answer["path"] : "";
  return {
    event: event.id,
    form: { id: form["id"], title: line(form["title"], limits.name) },
    // Never in the future: a clock ahead does not reorder the history.
    answer: { id: answer["id"], at: at && !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime() ? at : now, path },
    name: line(contact["name"], limits.name),
    email,
    phone,
    company: line(contact["company"], limits.name),
    message: text(event.data["message"], limits.body),
  };
}


// sameName: two names of one person, as people write them — accents,
// case, punctuation and the order of the words aside. An empty name is
// nobody's.
export function sameName(a: string, b: string): boolean {
  const words = (name: string) => fold(name).split(" ").filter(Boolean).sort().join(" ");
  const x = words(a);
  return x !== "" && x === words(b);
}

// match: the contact this person surely is (`found`), else the one they
// may be (`maybe`: same phone, another name) — see the rule above.
// Also how Booking's guests are found (lib/from-booking.ts): the same rule.
export type Found = { id: string; name: string; email: string; phone: string; phone2: string; company_id: string | null; owner: string | null };
export async function match(tx: Query, c: Pick<FormContact, "email" | "phone" | "name">): Promise<{ found: Found | null; maybe: Found | null }> {
  if (c.email) {
    const [row] = await tx<Found[]>`select id, name, email, phone, phone2, company_id, owner from contacts where email <> '' and lower(email) = ${c.email} order by id limit 1`;
    if (row) return { found: row, maybe: null };
  }
  const digits = c.phone ? phoneDigits(c.phone) : "";
  if (digits.length < 6) return { found: null, maybe: null };
  const rows = await tx<Found[]>`
    select id, name, email, phone, phone2, company_id, owner from contacts
    where phone_digits like ${"%" + digits + "%"} and (crm_phone(phone) = ${digits} or crm_phone(phone2) = ${digits})
    order by id limit 20`;
  // The same name at this number: them. An email the form gave that is
  // another than theirs does not make them someone else (a new work
  // address) — it stays on the line for a manager to see.
  const same = rows.find(r => sameName(r.name, c.name));
  if (same) return { found: same, maybe: null };
  return { found: null, maybe: rows[0] ?? null };
}

// The company of that name, accents and case aside; added if there is none
// (unassigned, like the contact).
export async function companyNamed(tx: Query, name: string, form: string, at: Date, from: Record<string, unknown> = { form }): Promise<string | null> {
  if (!name) return null;
  const [known] = await tx<{ id: string }[]>`select id from companies where folded = crm_fold(${name}) order by id limit 1`;
  if (known) return String(known.id);
  const [row] = await tx<{ id: string }[]>`insert into companies (name, owner, created_by) values (${name}, null, 'chest') returning id`;
  await tx`insert into activities (kind, company_id, author, data, at) values ('created', ${row!.id}, 'chest', ${tx.json(from as never)}, ${at})`;
  return String(row!.id);
}

export type Received = { contact: { id: string; name: string; owner: string | null }; created: boolean; maybe: { id: string; name: string } | null };

// receiveFormContact: the contact found or made, and the line of history;
// null when the event is not one to act on, or was already handled.
export async function receiveFormContact(sql: Sql, event: Pick<ToolEvent, "id" | "data">): Promise<Received | null> {
  const c = readFormContact(event);
  if (!c) return null;
  const received = await sql.begin(async (tx): Promise<Received | null> => {
    const [done] = await tx`
      select 1 from activities
      where kind = 'form' and (data->>'event' = ${c.event} or (data->>'answer' = ${c.answer.id} and data->>'formId' = ${c.form.id}))
      limit 1`;
    if (done) return null;
    const { found, maybe } = await match(tx, c);
    let contact: Received["contact"];
    let companyId: string | null;
    if (found) {
      companyId = found.company_id ? String(found.company_id) : await companyNamed(tx, c.company, c.form.title, c.answer.at);
      // What the team wrote stays; only what is empty is filled in (a
      // phone already there as the second number is not written again).
      const digits = c.phone ? phoneDigits(c.phone) : "";
      const knownPhone = digits !== "" && (phoneDigits(found.phone) === digits || phoneDigits(found.phone2) === digits);
      await tx`
        update contacts set
          email = ${found.email === "" ? c.email : found.email},
          phone = ${found.phone === "" && !knownPhone ? c.phone : found.phone},
          company_id = ${companyId},
          last_contact_at = greatest(coalesce(last_contact_at, ${c.answer.at}), ${c.answer.at}),
          updated_at = now()
        where id = ${found.id}`;
      contact = { id: String(found.id), name: found.name, owner: found.owner };
    } else {
      companyId = await companyNamed(tx, c.company, c.form.title, c.answer.at);
      const name = c.name || c.email || c.phone;
      // A lead: in My day until someone takes it (lib/leads.ts).
      const [row] = await tx<{ id: string }[]>`
        insert into contacts (name, email, phone, company_id, owner, created_by, last_contact_at, maybe_same, lead_since)
        values (${name}, ${c.email}, ${c.phone}, ${companyId}, null, 'chest', ${c.answer.at}, ${maybe ? maybe.id : null}, now())
        returning id`;
      // Added when the form was answered, then the line of the answer.
      await tx`insert into activities (kind, contact_id, company_id, author, data, at) values ('created', ${row!.id}, ${companyId}, 'chest', ${tx.json({ form: c.form.title })}, ${c.answer.at})`;
      contact = { id: String(row!.id), name, owner: null };
    }
    // What the form gave, always on the line: who filled it in is never
    // hidden behind the contact it was filed on.
    const who = { name: c.name, email: c.email, phone: c.phone, company: c.company };
    await tx`
      insert into activities (kind, body, data, contact_id, company_id, author, at)
      values ('form', ${c.message}, ${tx.json({ event: c.event, formId: c.form.id, form: c.form.title, answer: c.answer.id, path: c.answer.path, who })}, ${contact.id}, ${companyId}, 'chest', ${c.answer.at})`;
    return { contact, created: !found, maybe: maybe && !found ? { id: String(maybe.id), name: maybe.name } : null };
  });
  if (received) await tell(received, c);
  return received;
}

// Its owner hears of it; a contact of nobody's, the managers. One bell
// item per answer (its key hashed: a bell key is lower case).
export const formKey = (formId: string, answerId: string) => "form:" + createHash("sha256").update(formId + ":" + answerId).digest("hex").slice(0, 40);
async function tell(received: Received, c: FormContact): Promise<void> {
  const to = received.contact.owner?.startsWith("mbr_") ? [received.contact.owner] : await managers();
  await notify(to, t => {
    const body = [received.maybe ? format(t.bell.formMaybe, { other: received.maybe.name }) : "", c.message].filter(Boolean).join(" ");
    return {
      title: format(received.created ? t.bell.formNew : t.bell.formKnown, { name: received.contact.name, form: c.form.title }),
      ...(body ? { body: bounded(body, 280) } : {}),
    };
  }, { path: `/chest/contacts/${received.contact.id}`, key: formKey(c.form.id, c.answer.id) });
}
