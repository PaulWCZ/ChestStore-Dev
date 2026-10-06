import { ask, json, refusal } from "../src/api.js";
import { CapabilityNotGranted, ChestError, TooLarge, Unavailable } from "../src/errors.js";
import { idempotencyKey } from "./keys.js";

// Studio proposal (not in 0.4.1) — email to people OUTSIDE the company.
//
// The owner's decisions of 6 October 2026 (brief/08, addendum):
// - Mail to members is never a tool's job. A tool tells a member with a
//   notification (notifications.notify, notifications.broadcast); the Chest
//   itself mails members their notifications, by each member's choice.
//   send refuses a member as a recipient ({member} or an "mbr_…").
// - The Chest never receives mail: no mailbox, no inbound message, no reply
//   thread, no POST /chest-mail. A tool that wants replies from the public
//   lets them go to the company's own address (Reply-To): they land in the
//   company's usual mailbox, not in the tool.
// - Mail to the public stays where a public flow needs it (a booking's
//   recap with its calendar file, a quote or an invoice sent, a form's
//   receipt, a candidate's confirmation, a support answer, a status update
//   to a subscriber). It goes through this one seam, send, which the Chest
//   backs with a connector to the company's own mail provider (its SMTP or
//   API, connected once by the owner, its own domain). Not sent by
//   Argentic. Not built yet: a studio proposal.
//
//   // chest.proposals.json — said at approval:
//   //   “Sends emails to people outside your company (customers,
//   //    candidates, visitors) through your company's mail provider”
//   "mail": { "send": true }
//
//   import * as mail from "@argentic/chest-sdk/mail";
//   const can = await mail.available();          // {ok, reason, remainingToday, replyTo}
//   await mail.send({ to: "client@example.com", subject: "Your booking on 3 November", text, attachments: [{ name: "booking.ics", type: "text/calendar", content: ics }], key: `booking:${id}:recap` });
//
// What the Chest does: it sends through the company's provider, from the
// address the owner connected (the provider signs it: SPF, DKIM on the
// company's domain); Reply-To is the company's reply address the owner set
// with the connector, unless the tool gives its own (replyTo, from its own
// settings); it keeps a journal of every message (to, subject, size,
// status — never the body by default); it refuses addresses that bounced
// or complained (a suppression list per Chest). A tool never holds a mail
// credential. status(id) is how a tool learns that a message bounced:
// nothing is posted to the tool.
//
// Bounds: 500 messages a day per tool (the owner may raise it), 50
// recipients a message, 10 MiB a message with its attachments, 998
// characters a subject line.

// A recipient: an email address, as a string. Never a member (notify them).
export type Address = string;
// A file of the tool's (files), or bytes the tool made: the .ics of a
// booking, the PDF of a quote.
export type Attachment = { file: string; name?: string } | { name: string; type: string; content: Uint8Array | string };
export type Message = {
  to: Address | Address[];
  cc?: Address | Address[];
  subject: string;
  text: string;
  html?: string;
  // The name shown with the sending address: "Camille at Atelier Martin";
  // the company's name when left out.
  fromName?: string;
  // Where replies go. Left out: the company's reply address set with the
  // connector (available().replyTo), or the sending address when the owner
  // set none. A tool gives one only from its own settings ("Replies go to").
  replyTo?: string;
  attachments?: Attachment[];
  // The same key within 24 hours sends nothing again and answers the first
  // message: a retry never sends twice. Any text of 1 to 512 characters
  // without control characters: build it from what names the message —
  // `booking:${id}:recap` — and never cut it; the SDK sends a long one as
  // its SHA-256 (idempotencyKey). The same key for other recipients is
  // refused (ChestError key_conflict), never dropped.
  key?: string;
};
// What send did: the message queued (sending is the Chest's).
export type Sent = { id: string; messageId: string; status: "queued" };
// Where a sent message stands. bounced: the address does not exist or
// refuses (the Chest suppresses it); complained: the person marked it as
// spam; failed: the provider gave up (a full mailbox after the retries).
export type Status = { id: string; status: "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed"; at: string };

// idempotencyKey is the key the Chest receives for a key a tool gives: the
// key itself when it is 1 to 64 of A-Z a-z 0-9 . _ : -, otherwise "sha256:"
// and its digest; null when it is not a key.
export { idempotencyKey };

export const limits = { recipients: 50, size: 10 << 20, subject: 998, perDay: 500 } as const;
export const messageIdPattern = /^msg_[a-z2-7]{26}$/u;
const address = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
// The keys a message may have; anything else (mailbox, thread, inReplyTo,
// references, transactional — gone on 6 October 2026) is refused, so a
// tool written for the earlier shape fails loudly rather than sending a
// message that silently lost its meaning.
const messageKeys = new Set(["to", "cc", "subject", "text", "html", "fromName", "replyTo", "attachments", "key"]);

// isAddress says whether a text is an email address the Chest would send
// to (a plain address: no name, no comment, 254 characters at most).
export function isAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && address.test(value);
}

// recipients reads to or cc: addresses only. A member — {member: "mbr_…"}
// or the identifier itself — is refused with invalid_recipient: members
// are told with notifications, and the Chest mails them by their choice.
function recipients(value: unknown): string[] {
  if (value === undefined) return [];
  const list: unknown[] = Array.isArray(value) ? value : [value];
  for (const r of list) {
    const member = (r !== null && typeof r === "object" && "member" in r) || (typeof r === "string" && !r.includes("@") && /^\s*mbr_/u.test(r));
    if (member) throw new ChestError("invalid_recipient", 400, "mail is for people outside the company: tell a member with notifications.notify");
    if (!isAddress(r)) throw new ChestError("invalid_address", 400, "invalid recipient");
  }
  return list as string[];
}

const headerSafe = (s: string) => !/[\r\n]/u.test(s);

// send asks the Chest to send one message to people outside the company;
// it answers once the message is queued (sending is the Chest's). Errors:
// ChestError invalid_recipient (a member: notify them), invalid_address,
// invalid_message, suppressed (every recipient refuses email: bounced or
// complained), key_conflict (409: the key was used within 24 hours for
// other recipients — nothing sent), TooLarge, QuotaExceeded (the day's
// messages), Unavailable (the owner has not connected the company's mail
// provider, the Chest stopped sending for now, or it did not answer), and
// CapabilityNotGranted when the version does not declare "mail" or the
// Chest has no mail. Ask available() first to say why on a page; whatever
// it said, keep the flow working when send throws, and say so (no silent
// loss: "We could not email the confirmation — it is on this page").
export async function send(message: Message): Promise<Sent> {
  if (message === null || typeof message !== "object") throw new ChestError("invalid_message", 400, "a message is an object");
  const unknown = Object.keys(message).filter(k => !messageKeys.has(k));
  if (unknown.length > 0) throw new ChestError("invalid_message", 400, `unknown field ${unknown.join(", ")} (mailboxes, threads and member recipients are gone: see the SDK's mail section)`);
  const to = recipients(message.to), cc = recipients(message.cc);
  if (to.length < 1 || to.length + cc.length > limits.recipients) throw new ChestError("invalid_message", 400, `1 to ${limits.recipients} recipients`);
  if (typeof message.subject !== "string" || message.subject.trim() === "" || message.subject.length > limits.subject || !headerSafe(message.subject)) throw new ChestError("invalid_message", 400, "invalid subject");
  if (typeof message.text !== "string") throw new ChestError("invalid_message", 400, "a text body is required");
  if (message.html !== undefined && typeof message.html !== "string") throw new ChestError("invalid_message", 400, "html is a string");
  if (message.fromName !== undefined && (typeof message.fromName !== "string" || message.fromName.length > 100 || !headerSafe(message.fromName))) throw new ChestError("invalid_message", 400, "invalid sender name");
  if (message.replyTo !== undefined && !isAddress(message.replyTo)) throw new ChestError("invalid_address", 400, "invalid reply-to");
  const key = message.key === undefined ? undefined : idempotencyKey(message.key);
  if (key === null) throw new ChestError("invalid_message", 400, "a key is 1 to 512 characters, without control characters");
  const attachments = (message.attachments ?? []).map(a => {
    if (a === null || typeof a !== "object") throw new ChestError("invalid_message", 400, "an attachment is {file} or {name, type, content}");
    if ("file" in a) return { file: a.file, ...(a.name ? { name: a.name } : {}) };
    if (typeof a.name !== "string" || typeof a.type !== "string" || !headerSafe(a.name) || !headerSafe(a.type)) throw new ChestError("invalid_message", 400, "an attachment is {file} or {name, type, content}");
    return { name: a.name, type: a.type, content: Buffer.from(typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content).toString("base64") };
  });
  const body = JSON.stringify({
    to, cc, subject: message.subject, text: message.text,
    ...(message.html !== undefined ? { html: message.html } : {}),
    ...(message.fromName !== undefined ? { from_name: message.fromName } : {}),
    ...(message.replyTo !== undefined ? { reply_to: message.replyTo } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(key !== undefined ? { key } : {}),
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

// status says where a sent message stands; null for an identifier the
// Chest does not know (or no longer keeps).
export async function status(id: string): Promise<Status | null> {
  if (typeof id !== "string" || !messageIdPattern.test(id)) throw new ChestError("invalid_id", 400, "invalid message identifier");
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

// Whether the Chest will deliver what the tool sends, asked without
// sending — for a form that offers "Email the visitor a recap" or a
// Settings page that says whether mails to customers can go out. ok is
// true when a send would be queued now; otherwise reason says why, in
// words a tool turns into a sentence:
//   "not_granted"    the version does not declare "mail", the owner did not
//                    approve it, or the Chest has no mail (outside a Chest
//                    too) — "Emails will be sent once your Chest can send
//                    them";
//   "not_connected"  the owner has not connected the company's mail
//                    provider — "Ask your Chest's owner to connect email";
//   "suspended"      the Chest stopped sending for now (the provider
//                    refuses it, the owner paused the tool's mail);
//   "quota"          the day's messages are used — "Emails go out again
//                    tomorrow".
// remainingToday is what is left of the day's messages (null when the
// Chest does not say). replyTo is the company's reply address the owner
// set with the connector — where replies to the tool's mails land when the
// tool gives no replyTo — to show on a page ("Replies go to
// contact@atelier-martin.fr"); null when the owner set none (replies then
// go to the sending address) or the Chest does not say. A snapshot: send
// can still fail.
export type MailAvailability = { ok: boolean; reason: "not_granted" | "not_connected" | "suspended" | "quota" | null; remainingToday: number | null; replyTo: string | null };

// available asks the Chest whether it would deliver now; it never sends
// and never throws for a missing capability. Errors: Unavailable (the
// Chest did not answer: say "unknown", not "off").
export async function available(): Promise<MailAvailability> {
  const off: MailAvailability = { ok: false, reason: "not_granted", remainingToday: null, replyTo: null };
  let response: Response;
  try {
    response = await ask("mail", "GET", "/mail/status");
  } catch (error) {
    if (error instanceof CapabilityNotGranted) return off;
    throw error;
  }
  if (response.status === 404 || response.status === 403) {
    await response.body?.cancel();
    return off;
  }
  if (response.status !== 200) throw await refusal(response, "mail");
  const answer = (await json(response)) as { send?: unknown; remaining_today?: unknown; reply_to?: unknown } | null;
  const remaining = answer?.remaining_today, reply = answer?.reply_to;
  if (!answer || !(remaining === undefined || remaining === null || (Number.isSafeInteger(remaining) && (remaining as number) >= 0))) throw new Unavailable();
  if (!(reply === undefined || reply === null || isAddress(reply))) throw new Unavailable();
  const remainingToday = typeof remaining === "number" ? remaining : null;
  const replyTo = typeof reply === "string" ? reply : null;
  if (answer.send === "not_connected" || answer.send === "suspended") return { ok: false, reason: answer.send, remainingToday, replyTo };
  // A state of a later Chest that is not "ready" is not a promise to send.
  if (answer.send !== "ready") return { ok: false, reason: "suspended", remainingToday, replyTo };
  if (remainingToday === 0) return { ok: false, reason: "quota", remainingToday, replyTo };
  return { ok: true, reason: null, remainingToday, replyTo };
}
