import { chest } from "@argentic/chest-sdk/chest";
import { log } from "@argentic/chest-app";
import { CapabilityNotGranted, ChestError, QuotaExceeded } from "@argentic/chest-sdk/errors";
import { localeOf, type Member } from "@argentic/chest-sdk/member";
import * as webhooks from "@argentic/chest-sdk/webhooks";
import { AppError } from "./app-error.ts";
import { answeredData } from "./answered.ts";
import type { Answer } from "./answers.ts";
import type { Query, Sql } from "./db.ts";
import { open, type Form } from "./forms.ts";
import { teamOrigin } from "./public-origin.ts";
import { notify } from "./notify.ts";
import { catalogue, format, isLocale } from "../i18n/index.ts";
import type { Definition } from "../shared/model.ts";

// A form's answers sent to web addresses (Proposal (studio): webhooks,
// sdk/README.md "webhooks"): a Slack or Teams channel told of each new
// answer, or any receiver — Zapier, Make, a sheet's script, the company's
// server — given the answer as JSON, signed by the Chest. The tool never
// connects to them: it hands the Chest a target and a message; the Chest
// checks the address (https, public, the provider's shape; a generic
// receiver must answer a signed ping), keeps it encrypted, signs, delivers,
// retries, stops what keeps failing and tells the tool (webhook.disabled,
// app/chest-webhooks). Set up in the form's Settings by its editors.
//
// What leaves the Chest, for each new answer: the form's title, the
// answer's questions and answers as text (never a file, only its name),
// its time, the respondent's email when the form asks it, and a link to
// the answer on the team's address. Never for an anonymous form: its
// answers keep no time finer than the month, and a notice goes at once.

export const hookKinds = ["slack", "teams", "generic"] as const;
export type HookKind = (typeof hookKinds)[number];
export const hookLimits = { perForm: 5, label: 80, lines: 12, line: 300 } as const;

export type Hook = {
  id: string;
  kind: HookKind;
  label: string;
  // The address as the Chest shows it: without its secret part.
  shown: string;
  disabled: boolean;
  lastError: string | null;
  status: "delivered" | "failed" | "disabled" | null;
};

type Row = { id: string; kind: HookKind; label: string; shown: string; disabled_at: Date | null; last_error: string | null };
const isKind = (value: unknown): value is HookKind => typeof value === "string" && (hookKinds as readonly string[]).includes(value);
const hookId = (value: unknown): string => {
  if (typeof value !== "string" || !webhooks.targetIdPattern.test(value)) throw new AppError("not_found");
  return value;
};

// Whether the Chest delivers to web addresses now (webhooks.available,
// studio.16), asked before Settings offers the form to add one:
// "not_granted" (a Chest without webhooks, or not approved), "suspended"
// (the owner paused Forms' sending: addresses are kept, nothing goes),
// "unknown" (the Chest did not answer).
export type HookDelivery = "ready" | "not_granted" | "suspended" | "unknown";

// hooksOf: a form's addresses, with what the Chest says of each, and
// whether this Chest sends to web addresses now (otherwise Settings says
// why and hides the form to add one). Its editors only.
export async function hooksOf(sql: Query, actor: Member | null, formId: unknown): Promise<{ available: boolean; delivery: HookDelivery; hooks: Hook[] }> {
  const { form } = await open(sql, actor, formId, "editor");
  const rows = await sql<Row[]>`select id, kind, label, shown, disabled_at, last_error from form_hooks where form_id = ${form.id} order by created_at, id`;
  let delivery: HookDelivery = "unknown";
  try {
    const state = await webhooks.available();
    delivery = state.ok ? "ready" : state.reason === "suspended" ? "suspended" : "not_granted";
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  let remote = new Map<string, webhooks.WebhookTarget>();
  if (delivery !== "not_granted" && rows.length > 0) {
    try {
      remote = new Map((await webhooks.list()).map(w => [w.id, w]));
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  return {
    available: delivery === "ready",
    delivery,
    hooks: rows.map(r => {
      const w = remote.get(r.id);
      return { id: r.id, kind: r.kind, label: r.label, shown: w?.url ?? r.shown, disabled: w ? w.state === "disabled" : r.disabled_at !== null, lastError: w ? w.lastError : r.last_error, status: w?.status ?? null };
    }),
  };
}

// addHook asks the Chest to deliver this form's answers to an address. A
// generic receiver's secret is said once (to paste in the receiver); the
// tool keeps only the target's id.
export async function addHook(sql: Sql, actor: Member | null, formId: unknown, input: { url: unknown; kind: unknown; label: unknown }): Promise<{ hook: Hook; secret: string | null }> {
  const { form } = await open(sql, actor, formId, "editor");
  if (form.anonymous) throw new AppError("invalid");
  if (!isKind(input.kind)) throw new AppError("invalid");
  const kind = input.kind;
  const label = typeof input.label === "string" ? [...input.label.replace(/\s+/gu, " ").trim()].slice(0, hookLimits.label).join("") : "";
  if (label === "") throw new AppError("empty");
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const wrong = () => new AppError(kind === "slack" ? "webhook_slack" : kind === "teams" ? "webhook_teams" : "webhook_address");
  if (webhooks.checkUrl(url, kind).length > 0) throw wrong();
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from form_hooks where form_id = ${form.id}`) as unknown as [{ n: number }];
  if (n >= hookLimits.perForm) throw new AppError("at_most", { max: hookLimits.perForm });
  let added: Awaited<ReturnType<typeof webhooks.add>>;
  try {
    added = await webhooks.add({ url, kind, label, owner: actor!.id });
  } catch (error) {
    if (error instanceof CapabilityNotGranted) throw new AppError("webhooks_unavailable");
    if (error instanceof ChestError && error.code === "suspended") throw new AppError("webhooks_suspended");
    if (error instanceof QuotaExceeded) throw new AppError("at_most", { max: hookLimits.perForm });
    if (error instanceof ChestError && error.code === "verification_failed") throw new AppError("webhook_no_answer");
    if (error instanceof ChestError && (error.code === "invalid_target" || error.code === "address_refused")) throw wrong();
    throw error;
  }
  await sql`insert into form_hooks (id, form_id, kind, label, shown, created_by) values (${added.id}, ${form.id}, ${kind}, ${label}, ${added.target.url.slice(0, 300)}, ${actor!.id})`;
  return { hook: { id: added.id, kind, label, shown: added.target.url, disabled: false, lastError: null, status: null }, secret: added.secret };
}

async function ownHook(sql: Query, actor: Member | null, formId: unknown, id: unknown): Promise<string> {
  const { form } = await open(sql, actor, formId, "editor");
  const key = hookId(id);
  const [row] = await sql<{ id: string }[]>`select id from form_hooks where id = ${key} and form_id = ${form.id}`;
  if (!row) throw new AppError("not_found");
  return key;
}

// removeHook stops sending to an address for good: the Chest forgets it.
export async function removeHook(sql: Sql, actor: Member | null, formId: unknown, id: unknown): Promise<void> {
  const key = await ownHook(sql, actor, formId, id);
  try {
    await webhooks.remove(key);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    if (!(error instanceof CapabilityNotGranted) && error.code !== "target_not_found" && error.code !== "not_found") throw error;
  }
  await sql`delete from form_hooks where id = ${key}`;
}

// enableHook tries a stopped address again (the Chest pings it first).
export async function enableHook(sql: Sql, actor: Member | null, formId: unknown, id: unknown): Promise<void> {
  const key = await ownHook(sql, actor, formId, id);
  try {
    await webhooks.enable(key);
  } catch (error) {
    if (error instanceof CapabilityNotGranted) throw new AppError("webhooks_unavailable");
    if (error instanceof ChestError && (error.code === "target_not_found" || error.code === "not_found")) {
      await sql`delete from form_hooks where id = ${key}`;
      throw new AppError("not_found");
    }
    if (error instanceof ChestError && error.code === "verification_failed") throw new AppError("webhook_no_answer");
    throw error;
  }
  await sql`update form_hooks set disabled_at = null, last_error = null where id = ${key}`;
}

// A form deleted for good takes its addresses with it: the Chest forgets
// them too (a courtesy: the rows go with the form either way).
export async function forgetHooks(sql: Query, formId: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`select id from form_hooks where form_id = ${formId}`;
  for (const r of rows) {
    try {
      await webhooks.remove(r.id);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
}

// stopped: the Chest stopped delivering to an address (webhook.disabled).
// Says the form and its owner, for the bell; null for an address the tool
// no longer knows.
export async function stopped(sql: Query, event: webhooks.WebhookEvent): Promise<{ formId: string; label: string; owner: string; title: string } | null> {
  const [row] = await sql<{ form_id: string; label: string; owner: string; title: string }[]>`
    update form_hooks h set disabled_at = coalesce(h.disabled_at, ${new Date(event.at)}), last_error = ${(event.lastError ?? event.reason).slice(0, 200)}
    from forms f where h.id = ${event.target} and f.id = h.form_id
    returning h.form_id, h.label, f.owner, f.draft->>'title' as title`;
  return row ? { formId: String(row.form_id), label: row.label, owner: row.owner, title: row.title } : null;
}

// told: the Chest stopped an address — marked so (Settings shows it
// stopped, with Try again), and the form's owner hears of it in the bell,
// in their language. What /chest-webhooks runs for webhook.disabled.
export async function told(sql: Query, event: webhooks.WebhookEvent): Promise<void> {
  const hook = await stopped(sql, event);
  if (hook && hook.owner.startsWith("mbr_")) {
    await notify([hook.owner], t => ({ title: format(t.bell.hookStopped, { label: hook.label, form: hook.title || t.builder.untitled }) }), { path: `/chest/forms/${hook.formId}/settings`, key: `hook:${event.target}` });
  }
}

// ---- Sending ---------------------------------------------------------------

// hookMessage: the words and data each address gets for one answer (tested
// alone). The text, for a channel, in the Chest's language: the form, then
// each question and its answer on a line (the first ones, cut), then the
// link. The data, for a receiver: the same fields as forms.answered.
export function hookMessage(form: Pick<Form, "id">, def: Definition, answer: Answer, language: string, link: string | null): { text: string; data: Record<string, unknown> } {
  const t = catalogue(isLocale(language) ? language : "en");
  const d = answeredData(form, def, answer);
  const shown = (v: string | number | boolean) => (typeof v === "boolean" ? (v ? t.respond.yes : t.respond.no) : String(v));
  const cut = (s: string) => { const c = [...s.replace(/\s+/gu, " ").trim()]; return c.length > hookLimits.line ? c.slice(0, hookLimits.line - 1).join("") + "…" : c.join(""); };
  const lines = d.fields.slice(0, hookLimits.lines).map(f => `${cut(f.label)}: ${cut(shown(f.value))}`);
  const more = d.fields.length - lines.length;
  const text = [format(t.hooks.newAnswer, { form: def.title || t.builder.untitled }), ...lines, ...(more > 0 ? [format(t.hooks.more, { count: more })] : []), ...(link ? [link] : [])].join("\n").slice(0, 4000);
  return { text, data: { form: { id: form.id, title: def.title }, answer: { id: answer.id, at: answer.createdAt, language: answer.language, url: link }, fields: d.fields, email: d.email } };
}

// sendHooks tells every working address of the form about one answer. A
// courtesy: the answer is kept whatever happens here; an address the Chest
// stopped or forgot is marked (or dropped). How many were handed over.
export async function sendHooks(sql: Query, form: Pick<Form, "id" | "anonymous">, def: Definition, answer: Answer): Promise<number> {
  if (form.anonymous) return 0;
  const rows = await sql<{ id: string }[]>`select id from form_hooks where form_id = ${form.id} and disabled_at is null order by id`;
  if (rows.length === 0) return 0;
  const team = teamOrigin();
  const { text, data } = hookMessage(form, def, answer, localeOf(chest.language), team ? `${team}/chest/forms/${form.id}/answers/${answer.id}` : null);
  try {
    const sent = await webhooks.send(rows.map(r => r.id), { event: "form.answered", text, data, key: [`answer:${answer.id}`, ...rows.map(r => r.id)].join(":") });
    for (const s of sent.skipped) {
      if (s.reason === "not_found") await sql`delete from form_hooks where id = ${s.target}`;
      else await sql`update form_hooks set disabled_at = coalesce(disabled_at, now()) where id = ${s.target}`;
    }
    return sent.deliveries.length;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    log.warn("answer not sent to web addresses", { code: error.code });
    return 0;
  }
}
