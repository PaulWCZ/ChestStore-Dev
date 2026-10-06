import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import * as members from "@argentic/chest-sdk/members";
import { action, after, fail, field, publicAction, redirect, type Field } from "@argentic/chest-app";
import { isLocale } from "./i18n/index.ts";
import { answering } from "./lib/access.ts";
import { AppError } from "./lib/app-error.ts";
import { clean, limits } from "./lib/model.ts";
import * as attachments from "./lib/attachments.ts";
import { db } from "./lib/db.ts";
import * as mailer from "./lib/mailer.ts";
import * as notices from "./lib/notices.ts";
import { followUpLink } from "./lib/public-origin.ts";
import * as rules from "./lib/rules.ts";
import * as tell from "./lib/tell.ts";
import { tellLinkedTools } from "./lib/ticket-events.ts";
import * as tickets from "./lib/tickets.ts";
import * as views from "./lib/views.ts";

// Every change of Support, by name. action(): members only, the member read
// from the Chest's assertion on each call; publicAction(): anyone on the
// public part (no member: the form's guard, the follow-up link's secret).
// The rules of src/lib/ check every value and every right themselves and
// refuse with a code (bounds, empty, invalid_email…): the fields here only
// take what was sent, of the right kind. From an island: call("reply", {…});
// the page refreshes after each.

// Text as it was sent (the rules clean and bound it); "" when absent.
const given: Field<string> = { read: value => (value === undefined || value === null ? "" : typeof value === "string" ? value : typeof value === "number" ? String(value) : fail("invalid")) };
// A value the rules read themselves (a list, an object of an island).
const any: Field<unknown> & { readonly omissible: true } = { omissible: true, read: value => value };
// A ticket's number, as people say it.
const number = field.int({ min: 1, max: 999_999_999 });

// The files of a message: uploads of a member's, or a visitor's claims,
// checked again and kept (src/lib/attachments.ts), deleted again if the
// message is refused.
const memberFiles = (list: unknown): tickets.Files => ({ take: () => attachments.take("team", list), drop: attachments.remove });
const visitorFiles = (list: unknown): tickets.Files => ({ take: () => attachments.take("public", list), drop: attachments.remove });

// A members' action that may solve or reopen a ticket: the tools an admin
// linked to Support (Goals) are told once the answer is sent — never a
// failure of the action (src/lib/ticket-events.ts).
const solving = <F extends Parameters<typeof action>[0], R>(fields: F, run: Parameters<typeof action<F, R>>[1]) => action<F, R>(fields, async (input, context) => {
  const value = await run(input, context);
  after("ticket events", () => tellLinkedTools(db()));
  return value;
});

// Someone who answers tickets: the Chest says their role.
async function answers(memberId: string): Promise<boolean> {
  try {
    const m = await members.get(memberId);
    return m !== null && (answering as readonly string[]).includes(m.role ?? "");
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

export const actions = {
  // ---- A ticket: answering ------------------------------------------------

  // A reply (emailed when the Chest can send email, else on the
  // customer's follow-up page), with files; Send and close. A colleague's
  // request (a team form of Forms) gets no email — Support keeps no address
  // of theirs —: the answer stays in Support, and the colleague hears of it
  // in the bell ("colleague").
  reply: solving({ number, body: given, close: field.bool(), files: any }, async ({ number: n, body, close, files: list }, { member }) => {
    const sql = db();
    const done = await tickets.reply(sql, member, n, body, { close }, memberFiles(list));
    if (done.ticket.requester) {
      await tickets.delivered(sql, done.messageId, "page");
      await tell.answered(done.ticket);
      await tell.colleagueAnswered(done.ticket, member);
      after("badges", () => tell.refreshBadges(sql));
      return { delivery: "colleague" as const };
    }
    const s = await tickets.settings(sql);
    const sent = await mailer.answer(done.ticket, body.trim(), member, s.companyName, done.threading, done.messageId, done.files);
    await tickets.delivered(sql, done.messageId, sent.delivery, sent.delivery === "email" ? sent.mail : undefined, sent.delivery === "page" ? sent.refused : undefined);
    await tell.answered(done.ticket);
    after("badges", () => tell.refreshBadges(sql));
    return { delivery: sent.delivery };
  }),
  note: action({ number, body: given, files: any }, async ({ number: n, body, files: list }, { member }) => {
    await tickets.note(db(), member, n, body, memberFiles(list));
    return null;
  }),
  // One file to the Chest, for a reply or a note (the bytes go from the
  // browser to the Chest; the tool only authorises it).
  fileUpload: action({ type: given, size: field.int({ min: 0, max: Number.MAX_SAFE_INTEGER }) }, async ({ type, size }, { member }) => {
    const up = await attachments.memberGrant(member, type, size);
    return { url: up.url };
  }),

  // ---- A ticket: moving it along ------------------------------------------

  setPriority: action({ number, priority: given }, async ({ number: n, priority }, { member }) => {
    await tickets.setPriority(db(), member, n, priority);
    return null;
  }),
  addTag: action({ number, name: given }, ({ number: n, name }, { member }) => tickets.addTag(db(), member, n, name)),
  removeTag: action({ number, tag: given }, async ({ number: n, tag }, { member }) => {
    await tickets.removeTag(db(), member, n, tag);
    return null;
  }),
  assign: action({ number, assignee: field.nullable(given) }, async ({ number: n, assignee }, { member }) => {
    const sql = db();
    const done = await tickets.assign(sql, member, n, assignee ?? null, answers);
    await tell.assigned(member, done.ticket, assignee ?? null);
    after("badges", () => tell.refreshBadges(sql));
    return null;
  }),
  setStatus: solving({ number, status: given }, async ({ number: n, status }, { member }) => {
    const sql = db();
    const t = await tickets.setStatus(sql, member, n, status);
    if (t.status === "closed" || t.status === "spam") await tell.answered(t);
    after("badges", () => tell.refreshBadges(sql));
    return null;
  }),
  // The customer's address or name, corrected (a typo that makes emails bounce).
  setCustomer: action({ number, email: given, name: given }, async ({ number: n, email, name }, { member }) => {
    await tickets.setCustomer(db(), member, n, { email, name });
    return null;
  }),
  // Merging: this ticket into another of the same customer; Undo puts it back.
  merge: solving({ number, into: number }, async ({ number: n, into }, { member }) => {
    const sql = db();
    const done = await tickets.merge(sql, member, n, into);
    await tell.answered(done.from);
    after("badges", () => tell.refreshBadges(sql));
    return { status: done.status };
  }),
  unmerge: solving({ number, status: given }, async ({ number: n, status }, { member }) => {
    const sql = db();
    await tickets.unmerge(sql, member, n, status);
    after("badges", () => tell.refreshBadges(sql));
    return null;
  }),
  // A ticket for a customer who called or came by; says its follow-up link.
  createTicket: action({ name: given, email: given, subject: given, message: given, language: given }, async (input, { member }) => {
    const sql = db();
    const t = await tickets.fromTeam(sql, member, input);
    const link = followUpLink(t.secret);
    const s = await tickets.settings(sql);
    const sent = await mailer.confirm({ number: t.number, subject: input.subject.trim(), customerEmail: input.email.trim(), customerName: input.name.trim(), language: isLocale(input.language) ? input.language : "en" }, link, s.companyName);
    if (sent.delivery === "email") await tickets.confirmed(sql, t.id, sent.mail);
    after("badges", () => tell.refreshBadges(sql));
    return { number: t.number, link };
  }),

  // ---- Several tickets at once (the inbox's ticks); the answer carries
  // what Undo needs. --------------------------------------------------------

  bulk: solving({ numbers: any, action: field.json() }, async ({ numbers, action: wanted }, { member }) => {
    const sql = db();
    const kind = wanted as tickets.BulkAction;
    const done = await tickets.bulk(sql, member, numbers, kind, answers);
    for (const b of done.before) {
      if (kind.kind === "assign" && b.assignee !== kind.assignee) await tell.assigned(member, { id: b.id, number: b.number, subject: "" }, kind.assignee);
      if (kind.kind === "status" && (kind.status === "closed" || kind.status === "spam")) await tell.answered({ id: b.id });
    }
    after("badges", () => tell.refreshBadges(sql));
    return { before: done.before, tag: done.tag?.id ?? null };
  }),
  unbulk: solving({ before: any, tag: field.nullable(given) }, async ({ before, tag }, { member }) => {
    const sql = db();
    await tickets.unbulk(sql, member, before, tag ?? null);
    after("badges", () => tell.refreshBadges(sql));
    return null;
  }),

  // ---- Saved views --------------------------------------------------------

  saveView: action({ name: given, params: any }, ({ name, params }, { member }) => views.saveView(db(), member, name, params)),
  removeView: action({ id: given }, ({ id }, { member }) => views.removeView(db(), member, id)),
  restoreView: action({ name: given, params: any }, ({ name, params }, { member }) => views.saveView(db(), member, name, params)),

  // ---- Settings (each rule checks who may) ---------------------------------

  saveSettings: action({ input: field.json() }, async ({ input }, { member }) => {
    await tickets.saveSettings(db(), member, input as tickets.SettingsInput);
    return null;
  }),
  renameTag: action({ id: given, name: given }, ({ id, name }, { member }) => tickets.renameTag(db(), member, id, name)),
  deleteTag: action({ id: given }, ({ id }, { member }) => tickets.deleteTag(db(), member, id)),
  restoreTag: action({ name: given, tickets: any }, ({ name, tickets: list }, { member }) => tickets.restoreTag(db(), member, { name, tickets: list })),
  saveReply: action({ id: field.optional(given), title: given, body: given }, ({ id, title, body }, { member }) => tickets.saveReply(db(), member, { id, title, body })),
  removeReply: action({ id: given }, async ({ id }, { member }) => {
    await tickets.removeReply(db(), member, id);
    return null;
  }),
  saveRule: action({ rule: field.json() }, ({ rule }, { member }) => rules.saveRule(db(), member, rule as Parameters<typeof rules.saveRule>[2], answers)),
  removeRule: action({ id: given }, ({ id }, { member }) => rules.removeRule(db(), member, id)),
  restoreRule: action({ rule: field.json() }, ({ rule }, { member }) => rules.restoreRule(db(), member, rule as Parameters<typeof rules.restoreRule>[2], answers)),
  // A customer's right to erasure: every ticket of their address, with its
  // files.
  eraseCustomer: action({ email: given }, async ({ email }, { member }) => {
    const sql = db();
    const gone = await tickets.eraseCustomer(sql, member, email);
    for (const object of gone.objects) await files.delete(object).catch(() => false);
    after("badges", () => tell.refreshBadges(sql));
    return { tickets: gone.tickets };
  }),

  // ---- Notices to Slack, Teams or another service (administrators) --------

  addNoticeTarget: action({ url: given, kind: given, label: given, events: any }, async (input, { member }) => {
    const added = await notices.addTarget(db(), member, input);
    return { id: added.target.id, secret: added.secret };
  }),
  setNoticeEvents: action({ id: given, events: any }, async ({ id, events }, { member }) => {
    await notices.setEvents(db(), member, id, events);
    return null;
  }),
  removeNoticeTarget: action({ id: given }, async ({ id }, { member }) => {
    await notices.removeTarget(db(), member, id);
    return null;
  }),
  enableNoticeTarget: action({ id: given }, async ({ id }, { member }) => {
    await notices.enableTarget(db(), member, id);
    return null;
  }),

  // ---- My requests: a colleague's own tickets (any member, their own only)

  // The colleague writes again on their own request; its agent (or
  // everyone who answers, when nobody has it) hears of it.
  writeMine: solving({ number, body: given, files: any }, async ({ number: n, body, files: list }, { member }) => {
    const sql = db();
    const t = await tickets.writeMine(sql, member, n, body, memberFiles(list));
    await tell.customerWrote(t, body.trim());
    after("badges", () => tell.refreshBadges(sql));
    await notices.about(sql, "replied", t.id, await notices.lastMessageKey(sql, t.id));
    return null;
  }),
  rateMine: action({ number, value: given }, async ({ number: n, value }, { member }) => {
    const t = await tickets.rateMine(db(), member, n, value);
    await tell.rated(t, value as "good" | "bad");
    return null;
  }),
  // One file for their own request.
  mineUpload: action({ number, type: given, size: field.int({ min: 0, max: Number.MAX_SAFE_INTEGER }) }, async ({ number: n, type, size }, { member }) => {
    const up = await attachments.requesterGrant(db(), member, n, type, size);
    return { url: up.url };
  }),

  // ---- The public part: anyone on the Internet may call these. They hold
  // no member and never reveal anything but what the visitor's own link
  // shows. The package bounds each (publicAction's bound): the page's
  // single-use form token, the field only robots fill (<Honeypot />), so
  // many calls a day per visitor and for everyone, counted only once the
  // call is valid (a refusal gives its count back). What a follow-up link
  // does is counted per request too, once the link is known (charge with
  // its subject; files: tickets.linkGuard). ------------------------------

  // The contact form. A form sent sooner than a person fills one waits the
  // seconds left (formSeconds). Sent, the request's follow-up page opens
  // (its address is the secret, shown once); a request sent twice is the
  // same ticket, and the team is not told twice.
  sendRequest: publicAction({ name: given, email: given, subject: given, message: given, lang: given, embed: given, files: any }, async input => {
    const sql = db();
    // The language the visitor read the form in.
    const language = isLocale(input.lang) ? input.lang : "en";
    const embed = input.embed === "1" ? "&embed=1" : "";
    const t = await tickets.fromForm(sql, { name: input.name.slice(0, 12000), email: input.email.slice(0, 12000), subject: input.subject.slice(0, 12000), message: input.message.slice(0, 12000), language }, visitorFiles(input.files));
    // Sent twice: the team is not told twice, the customer not emailed twice.
    if (t.repeated) redirect(`/t/${t.secret}?new=1&again=1${embed}`);
    const s = await tickets.settings(sql);
    const ticket = { number: t.number, subject: input.subject.trim(), customerEmail: input.email.trim(), customerName: input.name.trim(), language };
    const sent = await mailer.confirm(ticket, followUpLink(t.secret), s.companyName);
    if (sent.delivery === "email") await tickets.confirmed(sql, t.id, sent.mail);
    after("telling", async () => {
      await tell.newTicket({ id: t.id, number: t.number, subject: ticket.subject, customerName: ticket.customerName, customerEmail: ticket.customerEmail }, input.message, t.assignee);
      await tell.refreshBadges(sql);
      await notices.about(sql, "new", t.id, `new:${t.id}`);
    });
    redirect(`/t/${t.secret}?new=1${sent.delivery === "email" ? "&mailed=1" : ""}${embed}`);
  }, { bound: { perVisitor: tickets.publicLimits.requestsPerVisitor, perDay: tickets.publicLimits.requestsPerDay, formSeconds: tickets.publicLimits.formSeconds } }),
  // Writing again from the follow-up link (it reopens a closed request):
  // the link known and the words checked first, then counted for that
  // request.
  writeAgain: publicAction({ secret: given, message: given, files: any }, async ({ secret, message, files: list }, { charge }) => {
    const sql = db();
    const known = await tickets.byLink(sql, secret);
    if (!known) fail("not_found");
    clean(message, limits.publicBody, { multiline: true });
    await charge("reply", { subject: known!.id });
    const t = await tickets.customerReply(sql, secret, message, visitorFiles(list));
    after("telling", async () => {
      await tell.customerWrote(t, message);
      await tell.refreshBadges(sql);
      await notices.about(sql, "replied", t.id, await notices.lastMessageKey(sql, t.id));
      // Writing again on a solved request reopens it: the linked tools told.
      await tellLinkedTools(sql);
    });
    return { sent: true };
  }, { bound: { budgets: { reply: { perVisitor: tickets.publicLimits.followPerVisitor, perDay: tickets.publicLimits.followPerDay, perSubject: tickets.publicLimits.repliesPerLink } } } }),
  // The customer's one click on a closed request ("did we solve it?").
  rate: publicAction({ secret: given, value: given }, async ({ secret, value }, { charge }) => {
    const sql = db();
    const known = await tickets.byLink(sql, secret);
    if (!known) fail("not_found");
    await charge("rating", { subject: known!.id });
    const t = await tickets.rate(sql, secret, value);
    after("telling", () => tell.rated(t, value as "good" | "bad"));
    return null;
  }, { bound: { budgets: { rating: { perVisitor: tickets.publicLimits.followPerVisitor, perDay: tickets.publicLimits.followPerDay, perSubject: tickets.publicLimits.ratingsPerLink } } } }),
  // One file from a visitor, for the form (open) or for their own request
  // (its link) — nobody else. What comes back from the Chest is a claim
  // only they hold.
  visitorUpload: publicAction({ secret: given, type: given, size: field.int({ min: 0, max: Number.MAX_SAFE_INTEGER }) }, async ({ secret, type, size }) => {
    const up = await attachments.visitorGrant(db(), secret ? { secret } : {}, type, size);
    return { url: up.url };
  }, { bound: { perVisitor: tickets.publicLimits.filesPerVisitor, perDay: tickets.publicLimits.filesPerDay } }),
};
