import type { IncomingMessage } from "node:http";
import { ask, json as answerOf, refusal } from "../src/api.js";
import { CapabilityNotGranted, ChestError, Unavailable } from "../src/errors.js";
import { delivery as signedDelivery, json, memorySeen, type Seen } from "../src/signed.js";
import { idempotencyKey } from "./keys.js";
import { webhooksChannel } from "./signed.js";

// Studio proposal (not in 0.4.1) — webhooks: notices the Chest delivers, on the tool's
// behalf, to web addresses the company's admins or the tool's subscribers
// give (a Slack or Teams channel, Zapier, Make, the customer's own server).
// A tool has no outbound network but the hosts its manifest names, and a
// customer's address is not known when the manifest is written; opening the
// tool's egress to "anywhere" would make every tool a way out of the Chest.
// So the Chest delivers: it checks each address, signs, retries, disables
// what keeps failing, and journals every delivery for the owner.
//
//   // chest.proposals.json (a 0.4 Chest refuses keys it does not know in
//   // chest.json) — a permission:
//   // “Sends notices to web addresses your admins or subscribers give,
//   //  signed by your Chest (up to 200 addresses)”
//   "webhooks": { "max": 200 }
//
//   import * as webhooks from "@argentic/chest-sdk/webhooks";
//   const { id, secret } = await webhooks.add({ url, kind: "generic", label: "Zapier — new answers", owner: who.id });
//   // show `secret` once ("paste it in your receiver"); keep only `id`
//   await webhooks.send([id], { event: "form.answered", text: "New answer to “Contact”", data: { form: 12, answer: 981 }, key: "answer:981" });
//
//   // app/chest-webhooks/route.ts — outside /chest, never behind a session
//   export async function POST(request: Request) {
//     return new Response(null, { status: await webhooks.handle(request, { disabled: e => markDisabled(e.target, e.lastError) }) });
//   }
//
// What the Chest does (the fake in testing does the same, without the
// network): add() checks the address (https, no credentials, no private,
// loopback or link-local address once resolved — and again at every
// attempt, connecting to the address it checked), pings a generic one
// (a signed "chest.ping" that must answer 2xx within 10 s), and keeps the
// address encrypted: list() shows it without its query or secret path.
// send() queues one delivery per target and returns at once; the Chest
// POSTs within seconds, 10 s to answer, redirects never followed; a 2xx is
// delivered; 408, 429 (Retry-After honoured, up to an hour), 5xx and
// network errors are tried again at 1 min, 5 min, 30 min, 2 h, 6 h, 12 h and
// 24 h after the send; any other 4xx is failed at once (the receiver
// refused it). After 10 failed attempts in a row — or at once on 410 Gone,
// or on 404 from Slack or Teams (the hook was deleted) — the target is
// disabled: its pending deliveries fail, later sends skip it, and the Chest
// posts webhook.disabled to the tool (POST /chest-webhooks, signed
// Chest-Webhooks, at least once). enable() tries it again.

import { checkInput, checkMessage, deliveryIdPattern, limits, secretPattern, targetIdPattern, type WebhookDelivery, type WebhookEvent, type WebhookInput, type WebhookJournal, type WebhookMessage, type WebhookSent, type WebhookTarget } from "./webhooks-rules.js";

// What a tool uses of the rules (the rest — bodies, signatures, address
// checks — is the Chest's, in webhooks-rules.ts, for the fake Chest).
export { checkUrl, deliveryIdPattern, eventIdPattern, keyPattern, limits, targetIdPattern, webhookEventPattern } from "./webhooks-rules.js";
export type { WebhookDelivery, WebhookEvent, WebhookInput, WebhookJournal, WebhookKind, WebhookMessage, WebhookSent, WebhookTarget } from "./webhooks-rules.js";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const instant = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const nullable = <T>(v: unknown, test: (x: unknown) => x is T): v is T | null => v === null || test(v);
const isString = (v: unknown): v is string => typeof v === "string";

// target reads a target of the Chest's answer; null when it is not one.
function target(value: unknown): WebhookTarget | null {
  const t = object(value);
  if (!t) return null;
  const { id, kind, label, owner, url, state, status, last_error, last_at, failures, created_at } = t;
  if (typeof id !== "string" || !targetIdPattern.test(id) || (kind !== "generic" && kind !== "slack" && kind !== "teams")) return null;
  if (typeof label !== "string" || typeof url !== "string" || !nullable(owner, isString) || (state !== "active" && state !== "disabled")) return null;
  if (!(status === null || status === "delivered" || status === "failed" || status === "disabled") || !nullable(last_error, isString) || !nullable(last_at, instant)) return null;
  if (typeof failures !== "number" || !Number.isInteger(failures) || failures < 0 || !instant(created_at)) return null;
  return { id, kind, label, owner, url, state, status, lastError: last_error, lastAt: last_at, failures, createdAt: created_at };
}
function delivery(value: unknown): WebhookDelivery | null {
  const d = object(value);
  if (!d) return null;
  const { id, target: to, event, key, status, attempts, response_status, last_error, created_at, delivered_at, next_attempt_at } = d;
  if (typeof id !== "string" || !deliveryIdPattern.test(id) || typeof to !== "string" || !targetIdPattern.test(to) || typeof event !== "string" || typeof key !== "string") return null;
  if (status !== "pending" && status !== "retrying" && status !== "delivered" && status !== "failed") return null;
  if (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 0 || !(response_status === null || (typeof response_status === "number" && Number.isInteger(response_status)))) return null;
  if (!nullable(last_error, isString) || !instant(created_at) || !nullable(delivered_at, instant) || !nullable(next_attempt_at, instant)) return null;
  return { id, target: to, event, key, status, attempts, responseStatus: response_status, lastError: last_error, createdAt: created_at, deliveredAt: delivered_at, nextAttemptAt: next_attempt_at };
}

const call = async (method: string, path: string, value?: unknown): Promise<Response> =>
  ask("webhooks", method, path, value === undefined ? {} : { body: JSON.stringify(value), type: "application/json" });

// add hands the Chest a new target: {id, secret, target}. secret
// ("whsec_…") is for a generic target only (null for Slack and Teams, whose
// address is their secret): show it once to whoever set the receiver up,
// never store it. Refused: ChestError invalid_target (the address or the
// label: nothing is sent), address_refused (422: the name does not resolve,
// or resolves to a private address), verification_failed (422: the ping of
// a generic address did not answer 2xx within 10 s), QuotaExceeded (the
// manifest's max, or 60 new targets an hour), CapabilityNotGranted.
export async function add(input: WebhookInput): Promise<{ id: string; secret: string | null; target: WebhookTarget }> {
  const problems = checkInput(input);
  if (problems.length > 0) throw new ChestError("invalid_target", 400, problems.join("; "));
  const response = await call("POST", "/webhooks", { url: input.url, kind: input.kind, label: input.label.trim(), ...(input.owner !== undefined ? { owner: input.owner } : {}) });
  if (response.status !== 201) throw await refusal(response, "webhooks");
  const answer = object(await answerOf(response));
  const kept = target(answer?.["target"]);
  const secret = answer?.["secret"];
  if (!kept || kept.id !== answer?.["id"] || !(secret === null || (typeof secret === "string" && secretPattern.test(secret))) || (secret === null) !== (kept.kind !== "generic")) throw new Unavailable();
  return { id: kept.id, secret, target: kept };
}

// remove forgets a target: its pending deliveries are dropped. false when
// the Chest did not know it (removed already).
export async function remove(id: string): Promise<boolean> {
  if (typeof id !== "string" || !targetIdPattern.test(id)) throw new ChestError("invalid_id", 400, "a target id (whk_…)");
  const response = await call("DELETE", `/webhooks/${id}`);
  if (response.status === 204) return true;
  if (response.status === 404) {
    await response.body?.cancel();
    return false;
  }
  throw await refusal(response, "webhooks");
}

// list is every target of the tool, oldest first, with its state.
export async function list(): Promise<WebhookTarget[]> {
  const response = await call("GET", "/webhooks");
  if (response.status !== 200) throw await refusal(response, "webhooks");
  const given = object(await answerOf(response))?.["targets"];
  if (!Array.isArray(given)) throw new Unavailable();
  const targets = given.map(target);
  if (targets.some(t => t === null)) throw new Unavailable();
  return targets as WebhookTarget[];
}

// enable tries a disabled target again (a generic one is pinged first):
// its failures count starts over. ChestError target_not_found (404),
// verification_failed (422), address_refused (422).
export async function enable(id: string): Promise<WebhookTarget> {
  if (typeof id !== "string" || !targetIdPattern.test(id)) throw new ChestError("invalid_id", 400, "a target id (whk_…)");
  const response = await call("POST", `/webhooks/${id}/enable`);
  if (response.status !== 200) throw await refusal(response, "webhooks");
  const kept = target(object(await answerOf(response))?.["target"]);
  if (!kept || kept.id !== id) throw new Unavailable();
  return kept;
}

// rotateSecret gives a generic target a new secret; the old one still
// signs beside it for 24 hours (two v1 in the header), so the receiver can
// be updated without losing a delivery.
export async function rotateSecret(id: string): Promise<string> {
  if (typeof id !== "string" || !targetIdPattern.test(id)) throw new ChestError("invalid_id", 400, "a target id (whk_…)");
  const response = await call("POST", `/webhooks/${id}/secret`);
  if (response.status !== 200) throw await refusal(response, "webhooks");
  const secret = object(await answerOf(response))?.["secret"];
  if (typeof secret !== "string" || !secretPattern.test(secret)) throw new Unavailable();
  return secret;
}

// Proposal (0.3.0-studio.16): whether the Chest will deliver the tool's notices,
// asked without sending — a Settings page that offers "Send new tickets to
// Slack" shows the form, or says why not, before anyone pastes an address.
// ok is true when add() and send() would be taken now; otherwise reason:
//   "not_granted"  the version does not declare "webhooks", the owner did
//                  not approve it, or the Chest has none (outside a Chest
//                  too) — "Your Chest cannot send notices to other
//                  services yet";
//   "suspended"    the owner paused the tool's notices (nothing is
//                  delivered; targets are kept).
// targets and max say how many addresses the tool has and may have (the
// manifest's max): "3 of 200"; add() is refused at max even when ok.
export type WebhookAvailability = { ok: boolean; reason: "not_granted" | "suspended" | null; targets: number | null; max: number | null };

// available asks the Chest whether it would deliver now; it never sends
// and never throws for a missing capability. Errors: Unavailable.
export async function available(): Promise<WebhookAvailability> {
  let response: Response;
  try {
    response = await call("GET", "/webhooks/status");
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return { ok: false, reason: "not_granted", targets: null, max: null };
    throw error;
  }
  if (response.status === 404 || response.status === 403) {
    await response.body?.cancel();
    return { ok: false, reason: "not_granted", targets: null, max: null };
  }
  if (response.status !== 200) throw await refusal(response, "webhooks");
  const answer = object(await answerOf(response));
  const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
  if (!answer || !count(answer["targets"]) || !count(answer["max"])) throw new Unavailable();
  const shape = { targets: answer["targets"], max: answer["max"] };
  if (answer["state"] === "ready") return { ok: true, reason: null, ...shape };
  // "suspended", or a state of a later Chest: not a promise to deliver.
  return { ok: false, reason: "suspended", ...shape };
}

// send queues one delivery of the message per target and returns at once:
// the deliveries (their id, which the receiver sees as Chest-Webhook-Id) and
// the targets skipped (disabled, or not the tool's). The same key within 24
// hours answers the first deliveries again and sends nothing. ChestError
// invalid_message (nothing is sent), QuotaExceeded (1,000 deliveries an
// hour: nothing is sent), CapabilityNotGranted, Unavailable (the queue may
// or may not hold it: send again with the same key, which is harmless).
export async function send(targets: string | string[], message: WebhookMessage): Promise<WebhookSent> {
  const ids = [...new Set([targets].flat())];
  if (ids.length < 1 || ids.length > limits.perSend || !ids.every(id => typeof id === "string" && targetIdPattern.test(id))) throw new ChestError("invalid_message", 400, "1 to 500 target ids (whk_…)");
  const problems = checkMessage(message);
  if (problems.length > 0) throw new ChestError("invalid_message", 400, problems.join("; "));
  const response = await call("POST", "/webhooks/send", { targets: ids, event: message.event, text: message.text, ...(message.data !== undefined ? { data: message.data } : {}), key: idempotencyKey(message.key)! });
  if (response.status !== 200) throw await refusal(response, "webhooks");
  const answer = object(await answerOf(response));
  const deliveries = answer?.["deliveries"], skipped = answer?.["skipped"];
  if (!Array.isArray(deliveries) || !Array.isArray(skipped)) throw new Unavailable();
  const sent: WebhookSent = { deliveries: [], skipped: [] };
  for (const d of deliveries) {
    const o = object(d);
    if (!o || typeof o["id"] !== "string" || !deliveryIdPattern.test(o["id"]) || typeof o["target"] !== "string" || !targetIdPattern.test(o["target"])) throw new Unavailable();
    sent.deliveries.push({ id: o["id"], target: o["target"] });
  }
  for (const s of skipped) {
    const o = object(s);
    if (!o || typeof o["target"] !== "string" || (o["reason"] !== "disabled" && o["reason"] !== "not_found")) throw new Unavailable();
    sent.skipped.push({ target: o["target"], reason: o["reason"] });
  }
  return sent;
}

// journal is the deliveries of the last 30 days, newest first (the page the
// owner reads on the Chest, for the tool's own admin screen): of one target
// or all, 100 a page (limit 1 to 500), after the `next` of the page before.
export async function journal(options: { target?: string; after?: string; limit?: number } = {}): Promise<WebhookJournal> {
  const query = new URLSearchParams();
  if (options.target !== undefined) {
    if (!targetIdPattern.test(options.target)) throw new ChestError("invalid_id", 400, "a target id (whk_…)");
    query.set("target", options.target);
  }
  if (options.after !== undefined) {
    if (!deliveryIdPattern.test(options.after)) throw new ChestError("invalid_query", 400, "after is a delivery id (whd_…)");
    query.set("after", options.after);
  }
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500) throw new ChestError("invalid_query", 400, "limit is 1 to 500");
    query.set("limit", String(options.limit));
  }
  const response = await call("GET", "/webhooks/deliveries" + (query.size ? "?" + query.toString() : ""));
  if (response.status !== 200) throw await refusal(response, "webhooks");
  const answer = object(await answerOf(response));
  const given = answer?.["deliveries"], next = answer?.["next"];
  if (!Array.isArray(given) || !(next === null || (typeof next === "string" && deliveryIdPattern.test(next)))) throw new Unavailable();
  const deliveries = given.map(delivery);
  if (deliveries.some(d => d === null)) throw new Unavailable();
  return { deliveries: deliveries as WebhookDelivery[], next };
}

// What the Chest tells the tool, on POST /chest-webhooks: signed as the
// Chest signs its other deliveries (HS256 under HMAC-SHA256 of "Chest-
// Webhooks v1" keyed by CHEST_TOKEN, naming the tool, the event's id and
// the digest of the body).
// What the Chest tells the tool, on POST /chest-webhooks: signed with
// 0.4.1's signed deliveries (src/signed.ts) under the label "Chest-Webhooks
// v1", in the header Chest-Webhooks. verify returns the event a delivery
// carries, or null when it is not one the Chest made for this tool. It
// reads the body (4 KiB at most) and never throws for what a request
// carries.
export async function verify(request: IncomingMessage | Request): Promise<WebhookEvent | null> {
  const signed = await signedDelivery(request, webhooksChannel);
  if (!signed) return null;
  const { id: jti, body } = signed;
  const e = object(json(body.toString("utf8")));
  if (!e || Object.keys(e).sort().join(",") !== "at,id,last_error,reason,target,type" || e["id"] !== jti) return null;
  const { type, at, target: to, reason, last_error } = e;
  if (type !== "webhook.disabled" || !instant(at) || typeof to !== "string" || !targetIdPattern.test(to) || (reason !== "failures" && reason !== "gone") || !nullable(last_error, isString)) return null;
  return { id: jti, type, at, target: to, reason, lastError: last_error };
}

const remembered = memorySeen();

// handle verifies one delivery and hands its event to the handler, once:
// the status to answer. 401 for a delivery that is not the Chest's, 204
// once handled or for an event already handled (seen.has). A handler that
// throws leaves the event unseen and handle throws: answer 500, the Chest
// delivers again (for 72 hours). seen is memorySeen by default, as in
// 0.4.1's events and schedules.
export async function handle(request: IncomingMessage | Request, handlers: { disabled?: (event: WebhookEvent) => void | Promise<void> }, options: { seen?: Seen } = {}): Promise<number> {
  const event = await verify(request);
  if (!event) return 401;
  const seen = options.seen ?? remembered;
  if (await seen.has(event.id)) return 204;
  if (handlers.disabled) await handlers.disabled(event);
  await seen.add(event.id);
  return 204;
}
