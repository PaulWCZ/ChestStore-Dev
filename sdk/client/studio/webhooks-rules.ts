import { createHmac, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";
import { memberIdPattern } from "../src/member.js";
import { idempotencyKey } from "./keys.js";

// The rules of webhooks, as the Chest applies them: what a target and a
// message may be, the bodies it posts and the signature it puts on them.
// Not a published module: webhooks.ts exports what a tool needs (the types,
// the identifiers' grammars, limits, checkUrl for its form); the fake Chest
// (testing.ts) and scripts/check-manifest.mjs import the rest from here.

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
  // (0.3.0-studio.15): a long one goes as its SHA-256 (the journal shows that),
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
// characters and send() makes it this (idempotencyKey, 0.3.0-studio.15).
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

