import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { contactEvent, requestEvent } from "./routes.ts";
import type { Answer } from "./answers.ts";
import type { Form } from "./forms.ts";
import { catalogue } from "../i18n/index.ts";
import { answerText, type Value } from "../shared/logic.ts";
import type { Definition } from "../shared/model.ts";

// What Forms tells the other tools of the Chest (Proposal (studio): events
// between tools; chest.proposals.json "emits"), once an admin linked them
// and only for the forms whose Settings say "Send each answer to the other
// tools": a contact form becomes a lead in Clients, an IT request a ticket
// in Helpdesk or a card in Tasks — no Zapier. A courtesy: when the Chest
// cannot take it, the answer is still kept.
//
// forms.answered: { form, title, answer, language, fields: [{ question,
// key, label, kind, value }], email, member } — values as text (choices by
// their labels, files by their names, never a file itself), numbers as
// numbers, yes/no as true/false; email: the answer's first email address,
// or null; member: the member who answered a named team form, or null.
// Never for an anonymous form: its answers name no one and keep no time
// finer than the month, and an event is delivered at once.
export type Field = { question: string; key: string | null; label: string; kind: string; value: string | number | boolean };
export type Answered = { form: string; title: string; answer: string; language: string; fields: Field[]; email: string | null; member: string | null };

const maxBytes = 15 * 1024;
const maxValue = 2000;

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
    await events.publish("forms.answered", answeredData(form, def, answer) as unknown as Record<string, unknown>, { key: `forms:${answer.id}:answered` });
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
// tool received.
export async function routed(form: Pick<Form, "id" | "anonymous" | "routes">, def: Definition, answer: Answer): Promise<string[]> {
  if (form.anonymous) return [];
  const sent: string[] = [];
  const outgoing: [string, object | null][] = [
    ["forms.contact", contactEvent(form, def, answer, form.routes.contact)],
    ["forms.request", requestEvent(form, def, answer, form.routes.request)],
  ];
  for (const [type, data] of outgoing) {
    if (!data) continue;
    try {
      const told = await events.publish(type, data as Record<string, unknown>, { key: `forms:${answer.id}:${type.slice(6)}` });
      // Where it went: only when a tool received it (an admin may have
      // unlinked the tools since the form was set).
      if (told.receivers > 0) sent.push(type);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  return sent;
}
