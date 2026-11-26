import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";
import { reachKeys, reached } from "./linked.ts";
import { contactData, contactEvent, requestData, requestEvent } from "./routes.ts";
import type { Answer } from "./answers.ts";
import type { Form } from "./forms.ts";
import { catalogue } from "../i18n/index.ts";
import { answerText, type Value } from "../shared/logic.ts";
import type { Definition } from "../shared/model.ts";

// What Forms tells the other tools of the Chest (SDK 0.7.0 events between
// tools; chest.json "emits"), once the owner approved the link,
// and only for the forms whose Settings say "Send each answer to the other
// tools": a contact form becomes a lead in Clients, an IT request a ticket
// in Helpdesk or a card in Tasks — no Zapier. A courtesy: when the Chest
// cannot take it, the answer is still kept.
//
// forms.answered: { form, title, answer, language, fields, email, member }
// — fields: JSON text of [{ question, key, label, kind, value }] (the
// Chest's data is flat: a list travels as text), values as text (choices
// by their labels, files by their names, never a file itself), numbers as
// numbers, yes/no as true/false; email: the answer's first email address,
// or null; member: the member who answered a named team form, or null.
// The same answer, unflattened, is what the form's web addresses get
// (lib/hooks.ts: answeredData). Never for an anonymous form: its answers
// name no one and keep no time finer than the month, and an event is
// delivered at once.
//
// No audience: the form's author chose, in its Settings, to send each
// answer to the other tools — every member of a receiving tool may see it
// there (README, "With the other tools").
// eventText: a text as the Chest takes it in an event's data — no format
// character (Unicode Cf: a zero-width joiner inside an emoji, a zero-width
// space, a BOM, a direction mark), no control character but line breaks
// and tabs, no lone surrogate: SDK 0.7.0 refuses the whole event
// (invalid_data) for one of them. Only the event is cleaned: what people
// typed stays as they typed it in the tool.
export const eventText = (text: string): string =>
  text.replace(/\r\n?/gu, "\n").replace(/[^\P{Cc}\n\t]|[\p{Cf}\p{Cs}]/gu, "");
export const eventData = (data: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? eventText(v) : v]));

export type Field = { question: string; key: string | null; label: string; kind: string; value: string | number | boolean };
export type Answered = { form: string; title: string; answer: string; language: string; fields: Field[]; email: string | null; member: string | null };

const maxBytes = 15 * 1024;
const maxValue = 2000;

// answeredEvent: the data as the Chest carries it (fields as JSON text),
// within its 16 KiB — the last fields go first.
export function answeredEvent(form: Pick<Form, "id">, def: Definition, answer: Answer): Record<string, unknown> {
  const data = answeredData(form, def, answer);
  const wire = () => ({ ...data, fields: JSON.stringify(data.fields) });
  while (data.fields.length > 0 && Buffer.byteLength(JSON.stringify(wire())) > maxBytes) data.fields.pop();
  return wire();
}

export function answeredData(form: Pick<Form, "id">, def: Definition, answer: Answer): Answered {
  const t = catalogue("en");
  const words = { yes: t.respond.yes, no: t.respond.no, other: t.respond.other };
  const fields: Field[] = [];
  for (const q of def.pages.flatMap(p => p.questions)) {
    const v: Value | undefined = answer.data[q.id];
    if (q.kind === "statement" || v === undefined) continue;
    const value = typeof v === "number" || typeof v === "boolean" ? v : [...answerText(q, v, words)].slice(0, maxValue).join("");
    fields.push({ question: q.id, key: q.key ?? null, label: q.title, kind: q.kind, value });
  }
  const data: Answered = { form: form.id, title: def.title, answer: answer.id, language: answer.language, fields, email: answer.email, member: answer.respondent };
  // Within the Chest's 16 KiB: the last fields go first (a long form's
  // tail), never the form, the answer or the address.
  while (fields.length > 0 && Buffer.byteLength(JSON.stringify(data)) > maxBytes) fields.pop();
  return data;
}

export async function answered(form: Pick<Form, "id" | "anonymous" | "shareEvents">, def: Definition, answer: Answer): Promise<boolean> {
  if (form.anonymous || !form.shareEvents) return false;
  try {
    await events.emit("forms.answered", eventData(answeredEvent(form, def, answer)), { subject: `answer:${answer.id}`, key: `forms:${answer.id}:answered` });
    return true;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return false;
  }
}

// forms.contact and forms.request (lib/routes.ts, README "With the other
// tools"): a contact in Clients, a ticket in Support, as the form's author
// mapped them. Each answer at most once each (the key); an answer that
// gives nothing to reach the person sends neither. A courtesy too: when
// the Chest cannot take them, the answer is still kept. The types some
// tool received; whether each reached a tool is kept (lib/linked.ts: the
// Settings say when the last one reached nobody — the link is the owner's
// to approve, 0.7.0 names no receiver).
export async function routed(sql: Query, form: Pick<Form, "id" | "anonymous" | "routes">, def: Definition, answer: Answer): Promise<string[]> {
  if (form.anonymous) return [];
  const sent: string[] = [];
  const contact = contactEvent(form, def, answer, form.routes.contact);
  const request = requestEvent(form, def, answer, form.routes.request);
  const outgoing: [keyof typeof reachKeys, Record<string, unknown> | null][] = [
    ["forms.contact", contact && contactData(contact)],
    ["forms.request", request && requestData(request)],
  ];
  for (const [type, data] of outgoing) {
    if (!data) continue;
    try {
      const told = await events.emit(type, eventData(data), { subject: `answer:${answer.id}`, key: `forms:${answer.id}:${type.slice(6)}` });
      // Where it went: only when a tool received it (the owner may have
      // switched the link off since the form was set).
      if (told.receivers > 0) sent.push(type);
      await reached(sql, type, told.receivers > 0);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  return sent;
}
