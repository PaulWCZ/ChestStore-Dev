import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ask, json, refusal } from "./api.js";
import { CapabilityNotGranted, ChestError, TooLarge, Unavailable } from "./errors.js";
import { memberIdPattern } from "./member.js";

// Proposal (studio) — email. A tool sends email in the company's name and
// receives the email sent to its mailboxes; the Chest holds the company's
// mail provider (its SMTP or API, connected once by the owner), never the
// tool. Capabilities, not credentials.
//
//   // chest.json — each entry is a permission, said at approval:
//   //   "send": “Sends emails in your company's name, up to 500 a day”
//   //   "mailboxes": “Receives the emails sent to support@<your domain>”
//   "mail": { "send": true, "mailboxes": ["support"] }
//
//   import * as mail from "@argentic/chest-sdk/mail";
//   await mail.send({ to: "client@example.com", subject: "Your request #42", text, mailbox: "support", key: "reply:981" });
//   await mail.send({ to: { member: "mbr_…" }, subject, text });   // a member, without the tool knowing their address
//
//   // app/chest-mail/route.ts — the Chest posts each received email, signed
//   export async function POST(request: Request) {
//     return new Response(null, { status: await mail.handle(request, async message => { await openTicket(message); }) });
//   }
//
// What the Chest does: it signs and sends from the company's domain (SPF,
// DKIM set when the owner connected it); it keeps a journal of every
// message (to, subject, size, status — never the body by default); it
// refuses addresses that bounced or complained (a suppression list per
// Chest); it stores received attachments in the tool's files (mail/…)
// before posting the message; it filters spam (a score) and drops what its
// provider flags as a virus. A tool never sees the provider's credentials,
// and sees members' addresses only with "members.email".
//
// Bounds: 500 messages a day per tool (the owner may raise it), 50
// recipients a message, 10 MiB a message with its attachments, 998
// characters a subject line; received: 25 MiB a message.

export type Address = string | { member: string };
export type Attachment = { file: string; name?: string } | { name: string; type: string; content: Uint8Array | string };
export type Message = {
  to: Address | Address[];
  cc?: Address | Address[];
  subject: string;
  text: string;
  html?: string;
  // The mailbox the message comes from (its address and the company's name);
  // without, the Chest's no-reply address in the company's name.
  mailbox?: string;
  // The name shown with the address: "Camille at Atelier Martin".
  fromName?: string;
  replyTo?: string;
  // Threading, for replies to a received message.
  inReplyTo?: string;
  references?: string[];
  attachments?: Attachment[];
  // The same key within 24 hours sends nothing again and answers the first
  // message: a retry never sends twice.
  key?: string;
};
export type Sent = { id: string; messageId: string; status: "queued" };
export type Status = { id: string; status: "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed"; at: string };

export type Received = {
  id: string;
  mailbox: string;
  from: { address: string; name: string | null };
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  // The HTML as sent: never show it without sanitising it.
  html: string | null;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  // Stored by the Chest in the tool's files before the message was posted.
  attachments: { file: string; name: string; type: string; size: number }[];
  receivedAt: string;
  // 0 (clean) to 10 (surely spam), from the Chest's filter.
  spam: number;
};

export const limits = { recipients: 50, size: 10 << 20, subject: 998, perDay: 500, received: 25 << 20 } as const;
export const mailboxPattern = /^[a-z][a-z0-9-]{0,31}$/u;
export const messageIdPattern = /^msg_[a-z2-7]{26}$/u;
const address = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;

// isAddress says whether a text is an email address the Chest would send
// to (a plain address: no name, no comment, 254 characters at most).
export function isAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && address.test(value);
}

function recipients(value: Address | Address[] | undefined): (string | { member: string })[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  for (const r of list) {
    if (typeof r === "string" ? !isAddress(r) : !(r && typeof r === "object" && typeof r.member === "string" && memberIdPattern.test(r.member))) throw new ChestError("invalid_address", 400, "invalid recipient");
  }
  return list;
}

const headerSafe = (s: string) => !/[\r\n]/u.test(s);

// send asks the Chest to send one message; it answers once the message is
// queued (sending is the Chest's). Errors: ChestError invalid_address,
// invalid_message, suppressed (every recipient refuses email: bounced or
// complained), TooLarge, QuotaExceeded (the day's messages), and
// CapabilityNotGranted when the version does not declare "mail" or the
// Chest has no mail yet.
export async function send(message: Message): Promise<Sent> {
  const to = recipients(message.to), cc = recipients(message.cc);
  if (to.length < 1 || to.length + cc.length > limits.recipients) throw new ChestError("invalid_message", 400, `1 to ${limits.recipients} recipients`);
  if (typeof message.subject !== "string" || message.subject.trim() === "" || message.subject.length > limits.subject || !headerSafe(message.subject)) throw new ChestError("invalid_message", 400, "invalid subject");
  if (typeof message.text !== "string") throw new ChestError("invalid_message", 400, "a text body is required");
  if (message.mailbox !== undefined && !mailboxPattern.test(message.mailbox)) throw new ChestError("invalid_message", 400, "invalid mailbox");
  if (message.fromName !== undefined && (typeof message.fromName !== "string" || message.fromName.length > 100 || !headerSafe(message.fromName))) throw new ChestError("invalid_message", 400, "invalid sender name");
  if (message.replyTo !== undefined && !isAddress(message.replyTo)) throw new ChestError("invalid_address", 400, "invalid reply-to");
  if (message.key !== undefined && !/^[A-Za-z0-9._:-]{1,64}$/u.test(message.key)) throw new ChestError("invalid_message", 400, "invalid key");
  for (const id of [message.inReplyTo, ...(message.references ?? [])]) if (id !== undefined && (typeof id !== "string" || id.length > 998 || !headerSafe(id))) throw new ChestError("invalid_message", 400, "invalid message id");
  const attachments = (message.attachments ?? []).map(a => ("file" in a ? { file: a.file, ...(a.name ? { name: a.name } : {}) } : { name: a.name, type: a.type, content: Buffer.from(typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content).toString("base64") }));
  const body = JSON.stringify({
    to, cc, subject: message.subject, text: message.text,
    ...(message.html !== undefined ? { html: message.html } : {}),
    ...(message.mailbox !== undefined ? { mailbox: message.mailbox } : {}),
    ...(message.fromName !== undefined ? { from_name: message.fromName } : {}),
    ...(message.replyTo !== undefined ? { reply_to: message.replyTo } : {}),
    ...(message.inReplyTo !== undefined ? { in_reply_to: message.inReplyTo } : {}),
    ...(message.references !== undefined ? { references: message.references } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(message.key !== undefined ? { key: message.key } : {}),
  });
  if (Buffer.byteLength(body) > limits.size * 1.4) throw new TooLarge();
  const response = await ask("mail", "POST", "/mail/messages", { body, type: "application/json" });
  if (response.status === 404) {
    await response.body?.cancel();
    throw new CapabilityNotGranted("mail");
  }
  if (response.status !== 200 && response.status !== 201) throw await refusal(response, "mail");
  const answer = (await json(response)) as { id?: unknown; message_id?: unknown } | null;
  if (!answer || typeof answer.id !== "string" || !messageIdPattern.test(answer.id) || typeof answer.message_id !== "string") throw new Unavailable();
  return { id: answer.id, messageId: answer.message_id, status: "queued" };
}

// status says where a sent message stands.
export async function status(id: string): Promise<Status | null> {
  if (!messageIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid message identifier");
  const response = await ask("mail", "GET", "/mail/messages/" + id);
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200) throw await refusal(response, "mail");
  const answer = (await json(response)) as { id?: unknown; status?: unknown; at?: unknown } | null;
  const known = ["queued", "sent", "delivered", "bounced", "complained", "failed"];
  if (!answer || answer.id !== id || typeof answer.status !== "string" || !known.includes(answer.status) || typeof answer.at !== "string") throw new Unavailable();
  return { id, status: answer.status as Status["status"], at: answer.at };
}

// mailboxAddress is the address of one of the tool's mailboxes, to show on
// its pages ("Write to support@atelier-martin.fr"); null when the owner has
// not given it one yet.
export async function mailboxAddress(mailbox: string): Promise<string | null> {
  if (!mailboxPattern.test(mailbox)) throw new ChestError("invalid_message", 400, "invalid mailbox");
  const response = await ask("mail", "GET", "/mail/mailboxes/" + mailbox);
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200) throw await refusal(response, "mail");
  const answer = (await json(response)) as { address?: unknown } | null;
  return answer && isAddress(answer.address) ? answer.address : null;
}

// ---- Received mail ---------------------------------------------------------

const label = "Chest-Mail v1";
const claims = ["aud", "iat", "exp", "jti", "digest"] as const;
const skew = 5;
const maxBody = 4 << 20;
const compact = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;
const receivedPattern = /^rcv_[a-z2-7]{26}$/u;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function parse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
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
const strings = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every(x => typeof x === "string" && x.length <= 998);

// verify returns the received message a delivery carries (POST /chest-mail,
// signed Chest-Mail for this tool), or null. It reads the body.
export async function verify(request: IncomingMessage | Request): Promise<Received | null> {
  const token = process.env["CHEST_TOKEN"];
  const tool = process.env["CHEST_TOOL"];
  if (!token || !/^[A-Za-z0-9_-]{43,512}$/u.test(token) || !tool || request.method !== "POST") return null;
  const headers = request.headers as Headers | IncomingMessage["headers"];
  const signature = typeof (headers as Headers).get === "function" ? (headers as Headers).get("chest-mail") : (headers as IncomingMessage["headers"])["chest-mail"];
  const parts = typeof signature === "string" && signature.length <= 2048 ? compact.exec(signature) : null;
  if (!parts) return null;
  const [, encodedHeader = "", encodedPayload = "", encodedSignature = ""] = parts;
  const header = object(parse(Buffer.from(encodedHeader, "base64url").toString("utf8")));
  if (!header || Object.keys(header).length !== 2 || header["alg"] !== "HS256" || header["typ"] !== "JWT") return null;
  const key = createHmac("sha256", Buffer.from(token, "utf8")).update(label).digest();
  const expected = createHmac("sha256", key).update(encodedHeader + "." + encodedPayload).digest();
  const given = Buffer.from(encodedSignature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = object(parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));
  if (!payload || Object.keys(payload).length !== claims.length || !claims.every(n => Object.hasOwn(payload, n))) return null;
  const { aud, iat, exp, jti, digest } = payload;
  if (aud !== tool || typeof jti !== "string" || !receivedPattern.test(jti) || typeof digest !== "string") return null;
  if (typeof iat !== "number" || typeof exp !== "number" || exp <= iat) return null;
  const now = Math.floor(Date.now() / 1000);
  if (iat > now + skew || exp <= now - skew) return null;
  const body = await bodyOf(request);
  if (body === null) return null;
  const sum = createHash("sha256").update(body).digest();
  const told = Buffer.from(digest, "base64url");
  if (told.length !== sum.length || !timingSafeEqual(told, sum)) return null;
  const m = object(parse(body.toString("utf8")));
  if (!m || m["id"] !== jti) return null;
  const from = object(m["from"]);
  const attachments = Array.isArray(m["attachments"]) ? m["attachments"].map(object) : null;
  if (typeof m["mailbox"] !== "string" || !mailboxPattern.test(m["mailbox"]) || !from || !isAddress(from["address"]) || !(from["name"] === null || typeof from["name"] === "string")) return null;
  if (!strings(m["to"], 100) || !strings(m["cc"], 100) || typeof m["subject"] !== "string" || typeof m["text"] !== "string" || !(m["html"] === null || typeof m["html"] === "string")) return null;
  if (typeof m["message_id"] !== "string" || !(m["in_reply_to"] === null || typeof m["in_reply_to"] === "string") || !strings(m["references"], 100) || typeof m["received_at"] !== "string" || typeof m["spam"] !== "number") return null;
  if (!attachments || !attachments.every(a => a && typeof a["file"] === "string" && typeof a["name"] === "string" && typeof a["type"] === "string" && typeof a["size"] === "number")) return null;
  return {
    id: jti,
    mailbox: m["mailbox"],
    from: { address: from["address"] as string, name: from["name"] as string | null },
    to: m["to"] as string[],
    cc: m["cc"] as string[],
    subject: m["subject"],
    text: m["text"],
    html: m["html"] as string | null,
    messageId: m["message_id"],
    inReplyTo: m["in_reply_to"] as string | null,
    references: m["references"] as string[],
    attachments: (attachments as Record<string, unknown>[]).map(a => ({ file: a["file"] as string, name: a["name"] as string, type: a["type"] as string, size: a["size"] as number })),
    receivedAt: m["received_at"],
    spam: Math.max(0, Math.min(10, m["spam"])),
  };
}

// handle verifies a delivery and hands the message to the handler: 401 for
// a delivery that is not the Chest's, 204 once handled. A handler that
// throws makes handle throw: answer 500, the Chest delivers it again (at
// least once: the same id; keep the handler idempotent). seen, as in
// events, drops a message handled already.
export async function handle(request: IncomingMessage | Request, handler: (message: Received) => void | Promise<void>, options: { seen?: { has(id: string): boolean | Promise<boolean>; add(id: string): void | Promise<void> } } = {}): Promise<number> {
  const message = await verify(request);
  if (!message) return 401;
  if (options.seen && (await options.seen.has(message.id))) return 204;
  await handler(message);
  await options.seen?.add(message.id);
  return 204;
}
