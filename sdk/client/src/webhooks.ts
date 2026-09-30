import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import { ask, idempotencyKey, json as answerOf, refusal } from "./api.js";
import { CapabilityNotGranted, ChestError, Unavailable } from "./errors.js";
import { memberIdPattern } from "./member.js";

// Proposal (studio) — webhooks: notices the Chest delivers, on the tool's
// behalf, to web addresses the company's admins or the tool's subscribers
// give (a Slack or Teams channel, Zapier, Make, the customer's own server).
// A tool has no outbound network but the hosts its manifest names, and a
// customer's address is not known when the manifest is written; opening the
// tool's egress to "anywhere" would make every tool a way out of the Chest.
// So the Chest delivers: it checks each address, signs, retries, disables
// what keeps failing, and journals every delivery for the owner.
//
//   // chest.json (chest.proposals.json in the studio) — a permission:
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

export type WebhookKind = "generic" | "slack" | "teams";
// A target as the Chest keeps it for the tool. url is shown, never whole:
// its query and, for Slack and Teams, its secret path are hidden ("…").
export type WebhookTarget = {
  // "whk_…"
  id: string;
  kind: WebhookKind;
  label: string;
  // The member who added it (mbr_…), or null (a subscriber of a public page).
  owner: string | null;
  url: string;
  state: "active" | "disabled";
  // The last delivery's outcome: null before the first one.
  status: "delivered" | "failed" | "disabled" | null;
  // Why the last attempt failed: "http_<status>", "timeout", "dns", "tls",
  // "refused", "redirect", "private_address", "disabled" — null after a success.
  lastError: string | null;
  lastAt: string | null;
  // Failed attempts in a row (10 disables the target).
  failures: number;
  createdAt: string;
};
export type WebhookInput = { url: string; kind: WebhookKind; label: string; owner?: string };
export type WebhookMessage = {
  // What happened, in the tool's words ("incident.created", "form.answered").
  event: string;
  // One plain-text line or a few (1 to 4,000 characters): what Slack and
  // Teams show, and "text" of a generic delivery.
  text: string;
  // For generic receivers only: a JSON object of 16 KiB at most.
  data?: Record<string, unknown>;
  // The same key within 24 hours is the same delivery: a retry of send()
  // never delivers twice. 1 to 512 characters without control characters
  // (studio.15): a long one goes as its SHA-256 (the journal shows that),
  // never cut; the same key for another event is refused (key_conflict).
  key: string;
};
export type WebhookSent = { deliveries: { id: string; target: string }[]; skipped: { target: string; reason: "disabled" | "not_found" }[] };
// One delivery in the journal: never its text or data (the Chest keeps
// them only until delivered or failed), always what happened to it.
export type WebhookDelivery = {
  // "whd_…": the same for every attempt; the receiver's Chest-Webhook-Id.
  id: string;
  target: string;
  event: string;
  key: string;
  status: "pending" | "retrying" | "delivered" | "failed";
  attempts: number;
  // The HTTP status of the last attempt, null without an answer.
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  // When the Chest tries again (status "retrying").
  nextAttemptAt: string | null;
};
export type WebhookJournal = { deliveries: WebhookDelivery[]; next: string | null };
// What the Chest tells the tool: a target it disabled.
export type WebhookEvent = { id: string; type: "webhook.disabled"; at: string; target: string; reason: "failures" | "gone"; lastError: string | null };

export const targetIdPattern = /^whk_[a-z2-7]{26}$/u;
export const deliveryIdPattern = /^whd_[a-z2-7]{26}$/u;
export const eventIdPattern = /^whe_[a-z2-7]{26}$/u;
export const webhookEventPattern = /^[a-z][a-z0-9_.-]{0,63}$/u;
// The key as the Chest receives it; a tool gives any key of 1 to 512
// characters and send() makes it this (idempotencyKey, studio.15).
export const keyPattern = /^[A-Za-z0-9._:-]{1,64}$/u;
export const secretPattern = /^whsec_[A-Za-z0-9_-]{43}$/u;
export const limits = {
  // The manifest's max: 1 to 1,000 targets.
  targets: 1000,
  // New targets an hour (a public subscription form is bounded by it too).
  addsPerHour: 60,
  // Deliveries an hour, per tool (a send to 50 targets is 50).
  deliveriesPerHour: 1000,
  // Targets a send.
  perSend: 500,
  text: 4000,
  label: 80,
  url: 2048,
  data: 16 << 10,
  // Seconds after the send when the Chest attempts: 8 attempts in 24 h.
  attempts: [0, 60, 300, 1800, 7200, 21600, 43200, 86400],
  failuresToDisable: 10,
  timeoutMs: 10000,
  // A receiver refuses a signature older than this (seconds).
  tolerance: 300,
  // After rotateSecret, the old secret still signs this long (seconds).
  overlap: 86400,
} as const;

// checkManifest lists what is wrong with a manifest's "webhooks" (none: []).
export function checkManifest(value: unknown): string[] {
  const o = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!o || Object.keys(o).some(k => k !== "max")) return ['"webhooks" is {"max": 1 to 1000}'];
  const max = o["max"];
  return typeof max === "number" && Number.isInteger(max) && max >= 1 && max <= limits.targets ? [] : ['"webhooks": max is 1 to 1000'];
}

// The addresses a delivery never goes to (IANA special-purpose registries):
// this host, private networks, shared address space, loopback, link-local,
// documentation, benchmarking, multicast, reserved; for IPv6 also unique
// local, the IPv4-mapped and translated ranges (which would reach IPv4
// through a back door), 6to4 and Teredo.
// Two lists: Node's BlockList matches an IPv4 address against IPv6 rules
// as IPv4-mapped, so ::ffff:0:0/96 would block every IPv4 address.
const blocked4 = new BlockList(), blocked6 = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) blocked4.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20], ["5f00::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const) blocked6.addSubnet(address, prefix, "ipv6");

// isPublicAddress says an IP address may receive a delivery: the rule the
// Chest applies to every address a name resolves to, before each attempt.
export function isPublicAddress(address: string): boolean {
  const plain = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  const family = isIP(plain);
  if (family === 0) return false;
  return family === 4 ? !blocked4.check(plain, "ipv4") : !blocked6.check(plain, "ipv6");
}

// Names that never lead outside: the machine, the local network, and the
// special-use domains (RFC 6761, RFC 8375, RFC 7686).
const localNames = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|private|home\.arpa|test|invalid|example|onion|alt)$/u;
const labelPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/u;
const slackPath = /^\/services\/T[A-Z0-9]{2,20}\/B[A-Z0-9]{2,20}\/[A-Za-z0-9]{16,64}$/u;
const teamsPath = /^\/powerautomate\/automations\/direct\/workflows\/[0-9A-Fa-f-]{32,36}\/triggers\/manual\/paths\/invoke$/u;

// checkUrl lists what is wrong with an address for a kind of target (none:
// []), as far as the address itself tells: the Chest adds the rest (what
// the name resolves to, the ping). A form can call it before add().
export function checkUrl(value: unknown, kind: WebhookKind): string[] {
  if (typeof value !== "string" || value.length < 1 || value.length > limits.url) return ["an https address of 2,048 characters at most"];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return ["not a web address"];
  }
  const problems: string[] = [];
  if (url.protocol !== "https:") problems.push("https only");
  if (url.username || url.password) problems.push("no user name or password in the address");
  if (url.hash) problems.push("no #fragment");
  if (url.port !== "" && Number(url.port) < 1024) problems.push("port 443, or 1024 and above");
  const host = url.hostname;
  const literal = host.startsWith("[") ? host.slice(1, -1) : host;
  if (isIP(literal) !== 0) {
    if (!isPublicAddress(literal)) problems.push("a private, loopback or reserved address");
  } else {
    const labels = host.split(".");
    if (labels.length < 2 || !labels.every(l => labelPattern.test(l)) || /^[0-9]+$/u.test(labels.at(-1)!) || host.length > 253) problems.push("a public host name");
    else if (localNames.test(host)) problems.push("a local or reserved host name");
  }
  if (kind === "slack" && (host !== "hooks.slack.com" || !slackPath.test(url.pathname) || url.search)) problems.push("a Slack incoming webhook: https://hooks.slack.com/services/T…/B…/…");
  if (kind === "teams" && (!/^[a-z0-9-]{1,63}\.[a-z0-9]{1,8}\.environment\.api\.powerplatform\.com$/u.test(host) || !teamsPath.test(url.pathname))) problems.push("a Teams Workflows webhook: https://….environment.api.powerplatform.com/powerautomate/automations/direct/workflows/…/triggers/manual/paths/invoke?…");
  if (kind === "generic" && (host === "hooks.slack.com" || host.endsWith(".environment.api.powerplatform.com"))) problems.push("a Slack or Teams address: choose that kind, the Chest formats the message for it");
  if (kind !== "generic" && kind !== "slack" && kind !== "teams") problems.push('kind is "generic", "slack" or "teams"');
  return problems;
}

// shownUrl is an address as list() shows it: the origin and path of a
// generic one without its query; only the host of a Slack or Teams one (the
// rest is its secret).
export function shownUrl(value: string, kind: WebhookKind): string {
  const url = new URL(value);
  if (kind !== "generic") return `${url.origin}/…`;
  return url.origin + url.pathname + (url.search ? "?…" : "");
}

// escapeSlack makes text plain for Slack: the three characters its
// formatting reads as control characters become entities (Slack's
// "Formatting text for app surfaces": &, <, >), so a subscriber's text can
// never mention @channel or forge a link.
export function escapeSlack(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

// format is the body the Chest POSTs for a message to a kind of target:
//   generic: {id, event, text, data, key, tool, created_at} (JSON)
//   slack:   {"text": …} — Slack incoming webhooks' own shape
//   teams:   {"type": "message", "attachments": [{contentType
//            "application/vnd.microsoft.card.adaptive", contentUrl null,
//            content: an Adaptive Card 1.4 with one TextBlock}]} — what a
//            Teams Workflows "When a Teams webhook request is received"
//            flow posts to a channel.
export function format(kind: WebhookKind, message: WebhookMessage & { id: string; tool: string; createdAt: string }): string {
  if (kind === "slack") return JSON.stringify({ text: escapeSlack(message.text) });
  if (kind === "teams") {
    return JSON.stringify({
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body: [{ type: "TextBlock", text: message.text, wrap: true }] },
      }],
    });
  }
  return JSON.stringify({ id: message.id, event: message.event, text: message.text, data: message.data ?? {}, key: message.key, tool: message.tool, created_at: message.createdAt });
}

// sign is the Chest-Webhook-Signature value for a body at a time (Unix
// seconds): "t=<time>,v1=<hex HMAC-SHA256 of '<time>.<body>' under the
// secret>", one v1 per secret (two while a rotated secret overlaps).
export function sign(secrets: string | string[], body: string, time: number): string {
  return [`t=${time}`, ...[secrets].flat().map(s => "v1=" + createHmac("sha256", s).update(`${time}.${body}`).digest("hex"))].join(",");
}

// verifySignature is the receiver's side (a tool of another Chest, or any
// Node server): the header holds a v1 made with this secret over this exact
// body, dated within tolerance seconds of now. Verify before parsing the
// body — any re-serialisation changes the bytes.
export function verifySignature(options: { secret: string; header: string | null | undefined; body: string | Uint8Array; now?: number; tolerance?: number }): boolean {
  const { secret, header } = options;
  if (typeof header !== "string" || header.length > 1024 || typeof secret !== "string" || secret.length < 1) return false;
  const parts = header.split(",").map(p => p.trim());
  const time = parts.find(p => p.startsWith("t="))?.slice(2) ?? "";
  if (!/^[0-9]{1,12}$/u.test(time)) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(time)) > (options.tolerance ?? limits.tolerance)) return false;
  const body = typeof options.body === "string" ? Buffer.from(options.body, "utf8") : Buffer.from(options.body);
  const expected = createHmac("sha256", secret).update(time + ".").update(body).digest();
  return parts.filter(p => p.startsWith("v1=")).some(p => {
    const given = Buffer.from(p.slice(3), "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

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

// checkInput lists what is wrong with a target to add (none: []).
export function checkInput(input: unknown): string[] {
  const o = object(input);
  if (!o || Object.keys(o).some(k => !["url", "kind", "label", "owner"].includes(k))) return ["a target is {url, kind, label, owner?}"];
  const kind = o["kind"];
  if (kind !== "generic" && kind !== "slack" && kind !== "teams") return ['kind is "generic", "slack" or "teams"'];
  const problems = checkUrl(o["url"], kind);
  const label = o["label"];
  if (typeof label !== "string" || label.trim() === "" || [...label].length > limits.label || /\p{Cc}/u.test(label)) problems.push("label is 1 to 80 characters, one line");
  if (o["owner"] !== undefined && (typeof o["owner"] !== "string" || !memberIdPattern.test(o["owner"]))) problems.push("owner is a member id (mbr_…)");
  return problems;
}

// checkMessage lists what is wrong with a message to send (none: []).
export function checkMessage(message: unknown): string[] {
  const o = object(message);
  if (!o || Object.keys(o).some(k => !["event", "text", "data", "key"].includes(k))) return ["a message is {event, text, data?, key}"];
  const problems: string[] = [];
  if (typeof o["event"] !== "string" || !webhookEventPattern.test(o["event"])) problems.push("event is 1 to 64 of a-z 0-9 _ . - (starting with a letter)");
  const text = o["text"];
  if (typeof text !== "string" || text.trim() === "" || [...text].length > limits.text) problems.push("text is 1 to 4,000 characters");
  if (idempotencyKey(o["key"]) === null) problems.push("key is 1 to 512 characters, without control characters");
  if (o["data"] !== undefined) {
    const data = object(o["data"]);
    if (!data) problems.push("data is a JSON object");
    else {
      let raw: string | undefined;
      try { raw = JSON.stringify(data); } catch { raw = undefined; }
      if (raw === undefined || Buffer.byteLength(raw) > limits.data) problems.push("data is JSON of 16 KiB at most");
    }
  }
  return problems;
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

// Proposal (studio.16): whether the Chest will deliver the tool's notices,
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
const label = "Chest-Webhooks v1";
const claims = ["aud", "iat", "exp", "jti", "digest"] as const;
const skew = 5;
const maxSignature = 2048;
const maxBody = 4096;
const compact = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;

function json(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
function headerOf(request: IncomingMessage | Request): string | null {
  const headers = request.headers as Headers | IncomingMessage["headers"];
  const value = typeof (headers as Headers).get === "function" ? (headers as Headers).get("chest-webhooks") : (headers as IncomingMessage["headers"])["chest-webhooks"];
  return typeof value === "string" && value.length <= maxSignature ? value : null;
}
function pathOf(request: IncomingMessage | Request): string {
  try {
    return new URL(request.url ?? "/", "http://tool").pathname;
  } catch {
    return "";
  }
}
async function bodyOf(request: IncomingMessage | Request): Promise<Buffer | null> {
  try {
    if (request instanceof Request) {
      if (request.bodyUsed || Number(request.headers.get("content-length") ?? "0") > maxBody) return null;
      const raw = Buffer.from(await request.arrayBuffer());
      return raw.length <= maxBody ? raw : null;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += (chunk as Buffer).length;
      if (size > maxBody) return null;
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

// verify returns the event a delivery to POST /chest-webhooks carries, or
// null when it is not one the Chest made for this tool. It reads the body
// and never throws for what a request carries.
export async function verify(request: IncomingMessage | Request): Promise<WebhookEvent | null> {
  const token = process.env["CHEST_TOKEN"];
  const tool = process.env["CHEST_TOOL"];
  if (!token || !/^[A-Za-z0-9_-]{43,512}$/u.test(token) || !tool || request.method !== "POST" || pathOf(request) !== "/chest-webhooks") return null;
  const signature = headerOf(request);
  const parts = signature === null ? null : compact.exec(signature);
  if (!parts) return null;
  const [, encodedHeader = "", encodedPayload = "", encodedSignature = ""] = parts;
  const header = object(json(Buffer.from(encodedHeader, "base64url").toString("utf8")));
  if (!header || Object.keys(header).length !== 2 || header["alg"] !== "HS256" || header["typ"] !== "JWT") return null;
  const key = createHmac("sha256", Buffer.from(token, "utf8")).update(label).digest();
  const expected = createHmac("sha256", key).update(encodedHeader + "." + encodedPayload).digest();
  const given = Buffer.from(encodedSignature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = object(json(Buffer.from(encodedPayload, "base64url").toString("utf8")));
  if (!payload || Object.keys(payload).length !== claims.length || !claims.every(name => Object.hasOwn(payload, name))) return null;
  const { aud, iat, exp, jti, digest } = payload;
  if (aud !== tool || typeof jti !== "string" || !eventIdPattern.test(jti) || typeof digest !== "string") return null;
  if (typeof iat !== "number" || !Number.isSafeInteger(iat) || typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= iat) return null;
  const now = Math.floor(Date.now() / 1000);
  if (iat > now + skew || exp <= now - skew) return null;
  const body = await bodyOf(request);
  if (body === null) return null;
  const sum = createHash("sha256").update(body).digest();
  const told = Buffer.from(digest, "base64url");
  if (told.length !== sum.length || !timingSafeEqual(told, sum)) return null;
  const e = object(json(body.toString("utf8")));
  if (!e || Object.keys(e).sort().join(",") !== "at,id,last_error,reason,target,type" || e["id"] !== jti) return null;
  const { type, at, target: to, reason, last_error } = e;
  if (type !== "webhook.disabled" || !instant(at) || typeof to !== "string" || !targetIdPattern.test(to) || (reason !== "failures" && reason !== "gone") || !nullable(last_error, isString)) return null;
  return { id: jti, type, at, target: to, reason, lastError: last_error };
}

// handle verifies one delivery and hands its event to the handler: the
// status to answer. 401 for a delivery that is not the Chest's, 204 once
// handled. A handler that throws makes handle throw: answer 500, the Chest
// delivers again (for 72 hours). The same event may come twice (same id):
// keep the handler idempotent.
export async function handle(request: IncomingMessage | Request, handlers: { disabled?: (event: WebhookEvent) => void | Promise<void> }): Promise<number> {
  const event = await verify(request);
  if (!event) return 401;
  if (handlers.disabled) await handlers.disabled(event);
  return 204;
}
