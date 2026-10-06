import { AppError } from "./app-error.ts";
import { catalogue, isLocale } from "../i18n/index.ts";
import { answerText, type Answers } from "../shared/logic.ts";
import { allQuestions, isMemberId, type Definition, type Kind, type Question } from "../shared/model.ts";

// Where an answer goes besides Forms, as the form's author maps it (the
// form's Settings, "With the other tools"): a new contact in Clients, a new
// ticket in Support. Forms publishes one typed event per answer (Proposal
// (studio): events between tools); the receiving tools, once an
// administrator linked them, make the contact or open the ticket. The
// contract (README, "With the other tools") is here: `ContactEvent` and
// `RequestEvent`, version 1. Pure: tested alone.

// Which question gives each piece — question ids of the form, or null.
export type ContactRoute = { name: string | null; email: string | null; phone: string | null; company: string | null; message: string | null };
export type RequestRoute = { subject: string | null; details: string | null; email: string | null; name: string | null };
export type Routes = { contact: ContactRoute | null; request: RequestRoute | null };
export const noRoutes: Routes = { contact: null, request: null };

// The kinds of question each piece may come from (the value is then
// already checked by the form: an email question's answer is an address).
export const contactSlots = { name: ["short"], email: ["email"], phone: ["phone"], company: ["short"], message: ["long", "short"] } as const satisfies Record<keyof ContactRoute, readonly Kind[]>;
export const requestSlots = { subject: ["short", "choice", "dropdown"], details: ["long", "short"], email: ["email"], name: ["short"] } as const satisfies Record<keyof RequestRoute, readonly Kind[]>;
type Slots = Record<string, readonly Kind[]>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const questionId = /^[a-z0-9]{6,12}$/u;

// A mapping as stored (read defensively), or as the page sends it.
function mapping<T extends Record<string, string | null>>(value: unknown, slots: Slots): T | null {
  if (!isObject(value)) return null;
  const out: Record<string, string | null> = {};
  for (const key of Object.keys(slots)) {
    const v = value[key];
    out[key] = typeof v === "string" && questionId.test(v) ? v : null;
  }
  return out as T;
}

export function readRoutes(value: unknown): Routes {
  if (!isObject(value)) return noRoutes;
  return { contact: mapping<ContactRoute>(value["contact"], contactSlots), request: mapping<RequestRoute>(value["request"], requestSlots) };
}

// Only questions the form has, of a kind that gives the piece.
function fit<T extends Record<string, string | null>>(route: T, slots: Slots, byId: Map<string, Question>): T {
  const out: Record<string, string | null> = {};
  for (const [key, id] of Object.entries(route)) {
    const q = id ? byId.get(id) : undefined;
    out[key] = q && slots[key]!.includes(q.kind) ? id : null;
  }
  return out as T;
}

// cleanRoutes reads what the Settings page sends, against the form's
// questions (its draft): a piece whose question is gone or of another kind
// is left out. A contact needs a way to reach the person (an email or a
// phone question); a ticket on a public form needs the person's email (a
// team form's ticket comes from the member who answers). Never for an
// anonymous form: its answers name no one.
export function cleanRoutes(value: unknown, def: Definition, form: { anonymous: boolean; audience: "public" | "team" }): Routes {
  if (value === undefined || value === null) return noRoutes;
  if (!isObject(value)) throw new AppError("invalid");
  if (form.anonymous) return noRoutes;
  const byId = new Map(allQuestions(def).map(q => [q.id, q]));
  const raw = readRoutes(value);
  const contact = raw.contact ? fit(raw.contact, contactSlots, byId) : null;
  const request = raw.request ? fit(raw.request, requestSlots, byId) : null;
  if (contact && !contact.email && !contact.phone) throw new AppError("route_contact");
  if (request && form.audience === "public" && !request.email) throw new AppError("route_request");
  return { contact, request };
}

// guessRoutes: where each piece most likely comes from, by the kinds of
// the questions and their order — what a switch fills in when it is turned
// on, and what a template starts with. The author changes any of it.
// Words are never read (a form may be in any language):
// - a contact's name: the first short text; its company: the second one;
//   email and phone: the first question of that kind; its message: the
//   first long text;
// - a ticket's subject: the first choice or list ("What is it about?"),
//   else the form's title; its details: the first long text; the email and
//   the name as for a contact.
export function guessRoutes(def: Definition): { contact: ContactRoute; request: RequestRoute } {
  const qs = allQuestions(def);
  const first = (kinds: readonly Kind[], skip = 0) => qs.filter(q => kinds.includes(q.kind))[skip]?.id ?? null;
  const name = first(["short"]);
  const email = first(["email"]);
  const long = first(["long"]);
  return {
    contact: { name, email, phone: first(["phone"]), company: first(["short"], 1), message: long },
    request: { subject: first(["choice", "dropdown"]), details: long, email, name },
  };
}

// ---- The events (contract, version 1) -----------------------------------------

// Every event says which form and which answer it comes from; `path` is
// the answer's page in Forms (on the Chest's team address), for a link
// back ("From the form Contact us").
export type Source = { form: { id: string; title: string }; answer: { id: string; at: string; language: string; path: string } };

// forms.contact — make or update a contact (Clients): at least an email or
// a phone; texts trimmed, bounded; the answer's message, if mapped.
export type ContactEvent = Source & {
  v: 1;
  contact: { name: string | null; email: string | null; phone: string | null; company: string | null };
  message: string | null;
  // The member who answered a named team form, else null.
  member: string | null;
};

// forms.request — open a ticket (Support): its subject (the mapped answer,
// or the form's title), its details, who asked (an email on a public form,
// the member on a team form), and the other answers as a list, so the
// ticket holds everything that was asked.
export type Field = { question: string; label: string; value: string };
export type RequestEvent = Source & {
  v: 1;
  subject: string;
  details: string | null;
  requester: { name: string | null; email: string | null; member: string | null };
  fields: Field[];
};

export const eventLimits = { name: 120, email: 254, phone: 40, company: 120, subject: 150, message: 4000, details: 8000, field: 1000, bytes: 15 * 1024 } as const;

type Answered = { id: string; data: Answers; createdAt: string | null; language: string; respondent: string | null };
type FormLike = { id: string; anonymous: boolean };
const cut = (text: string, max: number) => [...text].slice(0, max).join("");
const email = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/u;

// The text an answer gives for a question of the answered version, trimmed
// (null when unanswered, removed, or the question is not there).
function text(def: Definition, answer: Answered, id: string | null, max: number): string | null {
  if (!id) return null;
  const q = allQuestions(def).find(x => x.id === id);
  if (!q) return null;
  // Yes, no and "Other" in the words the respondent read.
  const t = catalogue(isLocale(answer.language) ? answer.language : "en").respond;
  const value = answerText(q, answer.data[id], { yes: t.yes, no: t.no, other: t.other }).trim();
  return value === "" ? null : cut(value, max);
}

function source(form: FormLike, def: Definition, answer: Answered): Source {
  return { form: { id: form.id, title: def.title }, answer: { id: answer.id, at: answer.createdAt ?? new Date().toISOString(), language: answer.language, path: `/chest/forms/${form.id}/answers/${answer.id}` } };
}

// Within the Chest's 16 KiB for an event: the longest text gives way.
const fits = (data: unknown) => Buffer.byteLength(JSON.stringify(data)) <= eventLimits.bytes;

export function contactEvent(form: FormLike, def: Definition, answer: Answered, route: ContactRoute | null): ContactEvent | null {
  if (!route || form.anonymous) return null;
  const address = text(def, answer, route.email, eventLimits.email);
  const contact = {
    name: text(def, answer, route.name, eventLimits.name),
    email: address && email.test(address) ? address.toLowerCase() : null,
    phone: text(def, answer, route.phone, eventLimits.phone),
    company: text(def, answer, route.company, eventLimits.company),
  };
  if (!contact.email && !contact.phone) return null;
  const event: ContactEvent = { v: 1, ...source(form, def, answer), contact, message: text(def, answer, route.message, eventLimits.message), member: answer.respondent && isMemberId(answer.respondent) ? answer.respondent : null };
  while (!fits(event) && event.message) event.message = event.message.length > 200 ? cut(event.message, Math.floor([...event.message].length * 0.8)) : null;
  return event;
}

export function requestEvent(form: FormLike, def: Definition, answer: Answered, route: RequestRoute | null): RequestEvent | null {
  if (!route || form.anonymous) return null;
  const address = text(def, answer, route.email, eventLimits.email);
  const member = answer.respondent && isMemberId(answer.respondent) ? answer.respondent : null;
  const requester = { name: text(def, answer, route.name, eventLimits.name), email: address && email.test(address) ? address.toLowerCase() : null, member };
  // Nobody to answer: no ticket.
  if (!requester.email && !requester.member) return null;
  const mapped = new Set([route.subject, route.details, route.email, route.name].filter((x): x is string => x !== null));
  const fields: Field[] = allQuestions(def)
    .filter(q => q.kind !== "statement" && !mapped.has(q.id))
    .flatMap(q => {
      const value = text(def, answer, q.id, eventLimits.field);
      return value ? [{ question: q.id, label: q.title, value }] : [];
    });
  const event: RequestEvent = {
    v: 1,
    ...source(form, def, answer),
    subject: text(def, answer, route.subject, eventLimits.subject) ?? cut(def.title, eventLimits.subject),
    details: text(def, answer, route.details, eventLimits.details),
    requester,
    fields,
  };
  while (!fits(event) && event.fields.length > 0) event.fields.pop();
  while (!fits(event) && event.details) event.details = event.details.length > 200 ? cut(event.details, Math.floor([...event.details].length * 0.8)) : null;
  return event;
}
