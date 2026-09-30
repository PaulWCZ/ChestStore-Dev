import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ask, idempotencyKey, json, refusal } from "./api.js";
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
// characters a subject line; received: 25 MiB a message (larger ones are
// refused by the Chest's mail server, the sender told), 20 attachments,
// 1 MiB of text and 2 MiB of cleaned HTML posted (the rest cut, the
// original .eml kept whole), 4 MiB posted in all.

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
  // Proposal (studio): the tool's name for a conversation (a ticket, a
  // candidate): 1 to 16 of a-z 0-9. With a mailbox, replies go to that
  // mailbox's thread address (support+t1042-…@), and the message the
  // Chest delivers back says thread "1042" — only if the address is one
  // this tool made (threadTag). Not with replyTo.
  thread?: string;
  // Threading, for replies to a received message.
  inReplyTo?: string;
  references?: string[];
  attachments?: Attachment[];
  // The same key within 24 hours sends nothing again and answers the first
  // message: a retry never sends twice. Any text of 1 to 512 characters
  // without control characters (studio.15): build it from what names the
  // message — `digest:${day}:${member}` — and never cut it; the SDK sends
  // a long one as its SHA-256 (idempotencyKey). The same key for other
  // recipients is refused (ChestError key_conflict), never dropped.
  key?: string;
  // Proposal (studio.15): a message the person must get whatever their
  // email preference (member.mailPreference) — a password, a booking's
  // confirmation, a payslip, an answer to what they asked. Everything else
  // (reminders, digests, "a task was assigned") honours it: a member who
  // turned email off is skipped, one who reads a daily digest gets it
  // there. The Chest journals the flag; the owner sees each tool's share.
  transactional?: boolean;
};
// What send did: the message queued, and (Proposal (studio.15)) the members
// it did not go to now because of their email preference — skipped: email
// off; digest: in their daily digest from the Chest. status "held" when
// nobody receives it now.
export type Sent = { id: string; messageId: string; status: "queued" | "held"; skipped: string[]; digest: string[] };
export type Status = { id: string; status: "queued" | "held" | "sent" | "delivered" | "bounced" | "complained" | "failed"; at: string };

export type Received = {
  kind: "message";
  id: string;
  mailbox: string;
  from: { address: string; name: string | null };
  to: string[];
  cc: string[];
  // The address the Chest received it for (the envelope's): the mailbox,
  // or one of its thread addresses (support+t1042-…@).
  deliveredTo: string;
  // The tool's thread when deliveredTo is a thread address this tool made
  // (its tag verified: nobody can guess one); null otherwise — then match
  // inReplyTo and references against the messageIds of what it sent.
  thread: string | null;
  subject: string;
  // The plain text: the text part, or the HTML part made text.
  text: string;
  // The HTML part cleaned by the Chest: allowed tags only (paragraphs,
  // emphasis, lists, quotes, tables, links http/https/mailto), no script,
  // no style, no attribute but a link's href, no image (remote images
  // track the reader). Still show it inside the tool's strict policy.
  html: string | null;
  // The message exactly as received (RFC 5322, .eml), in the tool's
  // files: for "Show original" — download only, never shown inline.
  original: string | null;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  // Stored by the Chest in the tool's files before the message was posted.
  attachments: { file: string; name: string; type: string; size: number }[];
  // Attachments the Chest did not keep: beyond 20, a type it refuses
  // (executables), a virus, or the tool's files full.
  dropped: { name: string; size: number; reason: "count" | "type" | "virus" | "quota" }[];
  receivedAt: string;
  // 0 (clean) to 10 (surely spam), from the Chest's filter; the Chest
  // keeps 8 and above in its quarantine (the owner sees it) and never
  // posts them.
  spam: number;
  // The sender's domain vouches for it (DMARC, or SPF or DKIM aligned with
  // the From domain): without, "from" may be forged — never act on it
  // alone (a reply goes to a new thread, not an existing customer's).
  authenticated: boolean;
  // An automatic answer (out of office, Auto-Submitted, a list's
  // notice): never answer it automatically — mail loops.
  auto: boolean;
};
// Proposal (studio): a message the tool sent that could not be delivered.
// The Chest recognises bounces (its own return path per message), updates
// status(), adds a permanent failure's address to the Chest's suppression
// list, and posts the bounce — never as a received message.
export type Bounce = {
  kind: "bounce";
  id: string;
  // The message sent (send's id).
  message: string;
  recipient: string;
  // true: the address does not exist or refuses (no retry, suppressed);
  // false: a temporary failure after the Chest's retries (a full mailbox).
  permanent: boolean;
  // What the receiving server said, shortened (plain text, 500 characters).
  reason: string;
  at: string;
};
export type MailHandlers = { message?: (message: Received) => void | Promise<void>; bounce?: (bounce: Bounce) => void | Promise<void> };

// idempotencyKey (studio.15) is the key the Chest receives for a key a tool
// gives: the key itself when it is 1 to 64 of A-Z a-z 0-9 . _ : -,
// otherwise "sha256:" and its digest; null when it is not a key.
export { idempotencyKey };

export const limits = { recipients: 50, size: 10 << 20, subject: 998, perDay: 500, received: 25 << 20, attachments: 20, text: 1 << 20, html: 2 << 20 } as const;
export const threadPattern = /^[a-z0-9]{1,16}$/u;
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
// complained), key_conflict (409: the key was used within 24 hours for
// other recipients — nothing sent; studio.15), TooLarge, QuotaExceeded
// (the day's messages), and CapabilityNotGranted when the version does not
// declare "mail" or the Chest has no mail yet. A member held back by their
// email preference is not an error: Sent says skipped or digest.
export async function send(message: Message): Promise<Sent> {
  const to = recipients(message.to), cc = recipients(message.cc);
  if (to.length < 1 || to.length + cc.length > limits.recipients) throw new ChestError("invalid_message", 400, `1 to ${limits.recipients} recipients`);
  if (typeof message.subject !== "string" || message.subject.trim() === "" || message.subject.length > limits.subject || !headerSafe(message.subject)) throw new ChestError("invalid_message", 400, "invalid subject");
  if (typeof message.text !== "string") throw new ChestError("invalid_message", 400, "a text body is required");
  if (message.mailbox !== undefined && !mailboxPattern.test(message.mailbox)) throw new ChestError("invalid_message", 400, "invalid mailbox");
  if (message.fromName !== undefined && (typeof message.fromName !== "string" || message.fromName.length > 100 || !headerSafe(message.fromName))) throw new ChestError("invalid_message", 400, "invalid sender name");
  if (message.replyTo !== undefined && !isAddress(message.replyTo)) throw new ChestError("invalid_address", 400, "invalid reply-to");
  if (message.thread !== undefined && (typeof message.thread !== "string" || !threadPattern.test(message.thread) || message.mailbox === undefined || message.replyTo !== undefined)) throw new ChestError("invalid_message", 400, "a thread is 1 to 16 of a-z 0-9, with a mailbox and without replyTo");
  const key = message.key === undefined ? undefined : idempotencyKey(message.key);
  if (key === null) throw new ChestError("invalid_message", 400, "a key is 1 to 512 characters, without control characters");
  if (message.transactional !== undefined && typeof message.transactional !== "boolean") throw new ChestError("invalid_message", 400, "transactional is true or false");
  for (const id of [message.inReplyTo, ...(message.references ?? [])]) if (id !== undefined && (typeof id !== "string" || id.length > 998 || !headerSafe(id))) throw new ChestError("invalid_message", 400, "invalid message id");
  const attachments = (message.attachments ?? []).map(a => ("file" in a ? { file: a.file, ...(a.name ? { name: a.name } : {}) } : { name: a.name, type: a.type, content: Buffer.from(typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content).toString("base64") }));
  const body = JSON.stringify({
    to, cc, subject: message.subject, text: message.text,
    ...(message.html !== undefined ? { html: message.html } : {}),
    ...(message.mailbox !== undefined ? { mailbox: message.mailbox } : {}),
    ...(message.fromName !== undefined ? { from_name: message.fromName } : {}),
    ...(message.replyTo !== undefined ? { reply_to: message.replyTo } : {}),
    ...(message.thread !== undefined ? { reply_tag: threadTag(message.mailbox as string, message.thread) } : {}),
    ...(message.inReplyTo !== undefined ? { in_reply_to: message.inReplyTo } : {}),
    ...(message.references !== undefined ? { references: message.references } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(key !== undefined ? { key } : {}),
    ...(message.transactional ? { transactional: true } : {}),
  });
  if (Buffer.byteLength(body) > limits.size * 1.4) throw new TooLarge();
  const response = await ask("mail", "POST", "/mail/messages", { body, type: "application/json" });
  if (response.status === 404) {
    await response.body?.cancel();
    throw new CapabilityNotGranted("mail");
  }
  if (response.status !== 200 && response.status !== 201) throw await refusal(response, "mail");
  const answer = (await json(response)) as { id?: unknown; message_id?: unknown; status?: unknown; skipped?: unknown; digest?: unknown } | null;
  if (!answer || typeof answer.id !== "string" || !messageIdPattern.test(answer.id) || typeof answer.message_id !== "string") throw new Unavailable();
  // A Chest before email preferences says neither: nobody was held back.
  const ids = (v: unknown): string[] | null => (v === undefined ? [] : Array.isArray(v) && v.length <= limits.recipients && v.every(id => typeof id === "string" && memberIdPattern.test(id)) ? [...v] as string[] : null);
  const skipped = ids(answer.skipped), digest = ids(answer.digest);
  if (!skipped || !digest) throw new Unavailable();
  return { id: answer.id, messageId: answer.message_id, status: answer.status === "held" ? "held" : "queued", skipped, digest };
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
  const known = ["queued", "held", "sent", "delivered", "bounced", "complained", "failed"];
  if (!answer || answer.id !== id || typeof answer.status !== "string" || !known.includes(answer.status) || typeof answer.at !== "string") throw new Unavailable();
  return { id, status: answer.status as Status["status"], at: answer.at };
}

// Proposal (studio.16): whether the Chest will deliver what the tool
// sends, asked without sending — for a form that offers "Email the
// newcomer their first-day details" (People) or a Settings page that says
// whether alerts can go out. ok is true when a send would be queued now;
// otherwise reason says why, in words a tool turns into a sentence:
//   "not_granted"    the version does not declare "mail", the owner did not
//                    approve it, or the Chest has no mail yet (outside a
//                    Chest too) — "Emails will be sent once your Chest can
//                    send them";
//   "not_connected"  the owner has not connected the company's mail
//                    provider yet — "Ask your Chest's owner to connect
//                    email";
//   "suspended"      the Chest stopped sending for now (its provider
//                    refuses it, the owner paused the tool's mail);
//   "quota"          the day's messages are used — "Emails go out again
//                    tomorrow".
// remainingToday is what is left of the day's messages (null when the
// Chest does not say). A snapshot: send can still fail, and a member's own
// preference (mailPreference) may still hold a message back.
export type MailAvailability = { ok: boolean; reason: "not_granted" | "not_connected" | "suspended" | "quota" | null; remainingToday: number | null };

// available asks the Chest whether it would deliver now; it never sends
// and never throws for a missing capability. Errors: Unavailable (the
// Chest did not answer: say "unknown", not "off").
export async function available(): Promise<MailAvailability> {
  let response: Response;
  try {
    response = await ask("mail", "GET", "/mail/status");
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return { ok: false, reason: "not_granted", remainingToday: null };
    throw error;
  }
  if (response.status === 404 || response.status === 403) {
    await response.body?.cancel();
    return { ok: false, reason: "not_granted", remainingToday: null };
  }
  if (response.status !== 200) throw await refusal(response, "mail");
  const answer = (await json(response)) as { send?: unknown; remaining_today?: unknown } | null;
  const remaining = answer?.remaining_today;
  if (!answer || !(remaining === undefined || remaining === null || (Number.isSafeInteger(remaining) && (remaining as number) >= 0))) throw new Unavailable();
  const remainingToday = typeof remaining === "number" ? remaining : null;
  if (answer.send === "not_connected" || answer.send === "suspended") return { ok: false, reason: answer.send, remainingToday };
  // A state of a later Chest that is not "ready" is not a promise to send.
  if (answer.send !== "ready") return { ok: false, reason: "suspended", remainingToday };
  if (remainingToday === 0) return { ok: false, reason: "quota", remainingToday };
  return { ok: true, reason: null, remainingToday };
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

// ---- Threads (Proposal (studio)) -------------------------------------------
//
// A reply must land on its ticket even when the customer's mail client
// drops the References header, and nobody may drop a message into a
// ticket that is not theirs by writing to support+1042@. So the thread
// address carries the tool's thread and a tag only this tool can make: an
// HMAC of the mailbox and the thread under a key derived from CHEST_TOKEN
// (like its other keys), 50 bits in base32 — lower case, as mail systems
// may lower-case an address. The Chest only routes mailbox+anything@ to
// the mailbox and says which address it received; this SDK checks the tag.
// A tag made before the token changed (a reinstall) no longer verifies:
// the message comes with thread null and the tool falls back on
// References.

const threadLabel = "Chest-Mail-Thread v1";
const base32 = "abcdefghijklmnopqrstuvwxyz234567";
const tagPattern = /^t([a-z0-9]{1,16})-([a-z2-7]{10})$/u;

function mac(mailbox: string, thread: string): string {
  const token = process.env["CHEST_TOKEN"];
  if (!token || !/^[A-Za-z0-9_-]{43,512}$/u.test(token)) throw new CapabilityNotGranted("mail");
  const key = createHmac("sha256", Buffer.from(token, "utf8")).update(threadLabel).digest();
  const sum = createHmac("sha256", key).update(mailbox + "\u0000" + thread).digest();
  let bits = 0, value = 0, out = "";
  for (const byte of sum) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 10) {
      out += base32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === 10) break;
  }
  return out;
}

// threadTag is what follows "+" in a thread address of that mailbox:
// "t1042-k3q…". A tool rarely needs it: send({mailbox, thread}) uses it.
export function threadTag(mailbox: string, thread: string): string {
  if (!mailboxPattern.test(mailbox) || typeof thread !== "string" || !threadPattern.test(thread)) throw new ChestError("invalid_message", 400, "invalid mailbox or thread");
  return `t${thread}-${mac(mailbox, thread)}`;
}

// threadOf reads an address the Chest received a message for: the thread
// of this tool it carries, or null (no tag, another mailbox's, a tag this
// tool did not make).
export function threadOf(address: string, mailbox: string): string | null {
  if (typeof address !== "string" || !mailboxPattern.test(mailbox)) return null;
  const local = address.slice(0, address.lastIndexOf("@")).toLowerCase();
  if (!local.startsWith(mailbox + "+")) return null;
  const m = tagPattern.exec(local.slice(mailbox.length + 1));
  if (!m) return null;
  let expected: string;
  try {
    expected = mac(mailbox, m[1]!);
  } catch {
    return null;
  }
  const a = Buffer.from(expected), b = Buffer.from(m[2]!);
  return a.length === b.length && timingSafeEqual(a, b) ? m[1]! : null;
}

// threadAddress is the address that brings a reply back to this thread
// ("support+t1042-k3q…@atelier-martin.fr"), to show on a page ("reply to
// this address"); null until the owner gives the mailbox an address.
export async function threadAddress(mailbox: string, thread: string): Promise<string | null> {
  const tag = threadTag(mailbox, thread);
  const plain = await mailboxAddress(mailbox);
  if (plain === null) return null;
  const at = plain.lastIndexOf("@");
  return plain.slice(0, at) + "+" + tag + plain.slice(at);
}

// ---- Received mail ---------------------------------------------------------

const label = "Chest-Mail v1";
const claims = ["aud", "iat", "exp", "jti", "digest"] as const;
const skew = 5;
const maxBody = 4 << 20;
const compact = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;
const receivedPattern = /^rcv_[a-z2-7]{26}$/u;
export const bouncePattern = /^bnc_[a-z2-7]{26}$/u;

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

// verify returns what a delivery carries (POST /chest-mail, signed
// Chest-Mail for this tool): a received message, or a bounce of a message
// the tool sent (Proposal (studio)); null for anything else. It reads the
// body.
export async function verify(request: IncomingMessage | Request): Promise<Received | Bounce | null> {
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
  if (aud !== tool || typeof jti !== "string" || !(receivedPattern.test(jti) || bouncePattern.test(jti)) || typeof digest !== "string") return null;
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
  if (bouncePattern.test(jti)) {
    if (m["kind"] !== "bounce" || typeof m["message"] !== "string" || !messageIdPattern.test(m["message"]) || !isAddress(m["recipient"]) || typeof m["permanent"] !== "boolean" || typeof m["reason"] !== "string" || m["reason"].length > 500 || typeof m["at"] !== "string") return null;
    return { kind: "bounce", id: jti, message: m["message"], recipient: m["recipient"] as string, permanent: m["permanent"], reason: m["reason"], at: m["at"] };
  }
  const from = object(m["from"]);
  const attachments = Array.isArray(m["attachments"]) ? m["attachments"].map(object) : null;
  const dropped = Array.isArray(m["dropped"]) ? m["dropped"].map(object) : null;
  if (m["kind"] !== "message" || typeof m["mailbox"] !== "string" || !mailboxPattern.test(m["mailbox"]) || !from || !isAddress(from["address"]) || !(from["name"] === null || typeof from["name"] === "string")) return null;
  if (!strings(m["to"], 100) || !strings(m["cc"], 100) || !isAddress(m["delivered_to"]) || typeof m["subject"] !== "string" || typeof m["text"] !== "string" || !(m["html"] === null || typeof m["html"] === "string") || !(m["original"] === null || typeof m["original"] === "string")) return null;
  if (typeof m["message_id"] !== "string" || !(m["in_reply_to"] === null || typeof m["in_reply_to"] === "string") || !strings(m["references"], 100) || typeof m["received_at"] !== "string" || typeof m["spam"] !== "number" || typeof m["authenticated"] !== "boolean" || typeof m["auto"] !== "boolean") return null;
  if (!attachments || attachments.length > limits.attachments || !attachments.every(a => a && typeof a["file"] === "string" && typeof a["name"] === "string" && typeof a["type"] === "string" && typeof a["size"] === "number")) return null;
  if (!dropped || !dropped.every(d => d && typeof d["name"] === "string" && typeof d["size"] === "number" && ["count", "type", "virus", "quota"].includes(d["reason"] as string))) return null;
  const mailbox = m["mailbox"];
  return {
    kind: "message",
    id: jti,
    mailbox,
    from: { address: from["address"] as string, name: from["name"] as string | null },
    to: m["to"] as string[],
    cc: m["cc"] as string[],
    deliveredTo: m["delivered_to"] as string,
    thread: threadOf(m["delivered_to"] as string, mailbox),
    subject: m["subject"],
    text: m["text"],
    html: m["html"] as string | null,
    original: m["original"] as string | null,
    messageId: m["message_id"],
    inReplyTo: m["in_reply_to"] as string | null,
    references: m["references"] as string[],
    attachments: (attachments as Record<string, unknown>[]).map(a => ({ file: a["file"] as string, name: a["name"] as string, type: a["type"] as string, size: a["size"] as number })),
    dropped: (dropped as Record<string, unknown>[]).map(d => ({ name: d["name"] as string, size: d["size"] as number, reason: d["reason"] as Received["dropped"][number]["reason"] })),
    receivedAt: m["received_at"],
    spam: Math.max(0, Math.min(10, m["spam"])),
    authenticated: m["authenticated"],
    auto: m["auto"],
  };
}

// handle verifies a delivery and hands it to its handler: 401 for a
// delivery that is not the Chest's, 204 once handled. handler is a
// function of the received messages (a bounce is then accepted and
// ignored), or {message, bounce} (Proposal (studio)). A handler that
// throws makes handle throw: answer 500, the Chest delivers it again (at
// least once: the same id; keep the handler idempotent). seen, as in
// events, drops what was handled already.
export async function handle(request: IncomingMessage | Request, handler: ((message: Received) => void | Promise<void>) | MailHandlers, options: { seen?: { has(id: string): boolean | Promise<boolean>; add(id: string): void | Promise<void> } } = {}): Promise<number> {
  const delivery = await verify(request);
  if (!delivery) return 401;
  if (options.seen && (await options.seen.has(delivery.id))) return 204;
  const handlers: MailHandlers = typeof handler === "function" ? { message: handler } : handler;
  if (delivery.kind === "message") await handlers.message?.(delivery);
  else await handlers.bounce?.(delivery);
  await options.seen?.add(delivery.id);
  return 204;
}
