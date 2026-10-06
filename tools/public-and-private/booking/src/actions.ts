import { action, fail, field, publicAction, redirect, type Field } from "@argentic/chest-app";
import * as b from "./lib/booking.ts";
import * as calendars from "./lib/calendars.ts";
import { db } from "./lib/db.ts";
import { email } from "./lib/guests.ts";
import { importCalendly as importFile } from "./lib/import.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import * as publish from "./lib/publish.ts";
import * as share from "./lib/share.ts";
import * as tell from "./lib/tell.ts";

// Every mutation of Booking, by name. action(): the team's (POST
// /chest/actions/<name>), the member read from the Chest's assertion on
// each call; publicAction(): the public part's (POST /actions/<name>), no
// member — anyone on the Internet may call them: they check the form's
// guard, bound everything, and never reveal anything but what the
// visitor's own link shows. Each reads its input by its fields; the rules
// are in src/lib/ — who may do what is checked there, from `member`, never
// from the input — and refuse with a code the reader sees in their words.
// From an island: call("blockTime", { day, from, to, note }); the page
// refreshes after each (unless the island says otherwise).
//
// Texts are taken as sent, cut far past their bound, and checked exactly in
// src/lib/ (which trims, counts characters rather than UTF-16 units, says
// the right maximum, and refuses an empty one where it must be given).
const text = (max: number): Field<string> => ({
  read: value => (value === undefined || value === null ? "" : typeof value === "string" ? value.slice(0, max * 4) : typeof value === "number" ? String(value) : fail("invalid")),
});
const one = { id: field.id() };

// A guest's language for their emails, among the tool's.
const languageOf = (value: string) => (value === "fr" || value === "en" ? value : "en");

export const actions = {
  // ——— Bookings ———

  cancelBooking: action({ ...one, reason: text(500) }, async ({ id, reason }, { member, request }) => {
    const sql = db();
    const done = await b.cancelByHost(sql, member, id, reason);
    await tell.quiet(done);
    await publish.unpublish(sql, done);
    await tell.hostCopy(sql, "cancelled", done);
    await share.changed(sql, "cancelled", done);
    const origin = publicOrigin(request.headers);
    await b.rememberPublicOrigin(sql, origin);
    return { delivery: await email(sql, "cancelled", done, origin) };
  }),

  // A host books for a guest (a customer on the phone, at the counter):
  // they get the usual confirmation and link.
  bookForGuest: action({ typeId: field.id(), start: text(40), name: text(120), email: text(254), phone: text(40), note: text(2000), zone: text(64), language: text(8) }, async (input, { member, request }) => {
    const sql = db();
    const s = await b.settings(sql);
    const made = await b.bookForGuest(sql, member, input.typeId, { ...input, language: languageOf(input.language) }, Date.now(), s.companyName);
    const origin = publicOrigin(request.headers);
    await b.rememberPublicOrigin(sql, origin);
    const delivery = await email(sql, "confirmed", made.booking, origin);
    await publish.publish(sql, made.booking);
    // Another host of the team took it: they hear of it.
    if (made.booking.memberId !== member.id) await tell.booked(made.booking, (await b.hostOf(sql, made.booking.memberId))?.zone ?? input.zone, await b.titlesOf(sql, made.booking));
    await tell.hostCopy(sql, "booked", made.booking);
    await share.changed(sql, "booked", made.booking);
    return { id: made.booking.id, delivery };
  }),

  moveMeeting: action({ ...one, start: text(40) }, async ({ id, start }, { member, request }) => {
    const sql = db();
    const { booking, from } = await b.moveByHost(sql, member, id, start);
    const origin = publicOrigin(request.headers);
    await b.rememberPublicOrigin(sql, origin);
    const delivery = await email(sql, "moved", booking, origin);
    await publish.publish(sql, booking);
    await tell.hostCopy(sql, "moved", booking);
    await share.changed(sql, "moved", booking, { previousHost: from });
    return { delivery };
  }),

  markPaid: action({ ...one, paid: field.bool() }, async ({ id, paid }, { member }) => {
    await b.markPaid(db(), member, id, paid);
  }),

  // ——— Booking types ———

  // The type form's whole value (an island's JSON): read by src/lib/.
  createType: action({ input: field.json() }, async ({ input }, { member }) => ({ id: (await b.createType(db(), member, input as b.TypeInput)).id })),
  updateType: action({ ...one, input: field.json() }, async ({ id, input }, { member }) => {
    await b.updateType(db(), member, id, input as b.TypeInput);
  }),
  setTypeActive: action({ ...one, active: field.bool() }, async ({ id, active }, { member }) => {
    await b.setTypeActive(db(), member, id, active);
  }),
  removeType: action(one, async ({ id }, { member }) => {
    await b.removeType(db(), member, id);
  }),

  // ——— Hours ———

  saveWeekly: action({ weekly: field.json(), zone: text(64), dailyMax: field.int({ min: 0, max: 1000 }) }, async ({ weekly, zone, dailyMax }, { member }) => {
    const sql = db();
    const host = (await b.hostOf(sql, member.id)) ?? fail("not_host");
    await sql.begin(async tx => {
      await b.saveWeekly(tx, member, weekly);
      await b.saveHost(tx, member, { slug: host.slug, zone, welcome: host.welcome, listed: host.listed });
      await b.saveHostPrefs(tx, member, { dailyMax, emailMe: host.emailMe });
    });
  }),
  addDaysOff: action({ from: field.day(), to: field.day(), note: text(80) }, async (input, { member }) => b.daysOff(db(), member, input)),
  addSpecialDay: action({ day: field.day(), ranges: field.json(), note: text(80) }, async (input, { member }) => {
    await b.saveOverride(db(), member, input);
  }),
  removeException: action({ day: field.day() }, async ({ day }, { member }) => {
    await b.removeOverride(db(), member, day);
  }),
  // No calendar to connect: the host says their hours are right; their page
  // is public from now on.
  confirmHours: action({}, async (_, { member }) => {
    await b.confirmHours(db(), member);
  }),

  // ——— Times blocked, other calendars ———

  blockTime: action({ day: field.day(), from: field.int({ min: 0, max: 1440 }), to: field.int({ min: 0, max: 1440 }), note: text(80) }, async (input, { member }) => {
    const sql = db();
    const block = await b.blockTime(sql, member, input);
    await share.shareBusy(sql, [member.id]);
    return block.id;
  }),
  unblock: action(one, async ({ id }, { member }) => {
    const sql = db();
    await b.unblock(sql, member, id);
    await share.shareBusy(sql, [member.id]);
  }),
  connectCalendar: action({ address: text(2000) }, async ({ address }, { member }) => {
    const sql = db();
    await calendars.connect(sql, member, address);
    await share.shareBusy(sql, [member.id]);
  }),
  disconnectCalendar: action(one, async ({ id }, { member }) => {
    const sql = db();
    await calendars.disconnect(sql, member, id);
    await share.shareBusy(sql, [member.id]);
  }),
  readCalendars: action({}, async (_, { member }) => {
    const sql = db();
    const failed = await calendars.refreshMine(sql, member);
    await share.shareBusy(sql, [member.id]);
    return failed;
  }),

  // ——— Settings ———

  savePage: action({ slug: text(40), welcome: text(300), listed: field.bool(), language: text(8), second: text(8), welcomeAlt: text(300) }, async (input, { member }) => {
    const sql = db();
    const host = (await b.hostOf(sql, member.id)) ?? fail("not_host");
    await b.saveHost(sql, member, { ...input, zone: host.zone });
  }),
  savePrefs: action({ dailyMax: field.int({ min: 0, max: 1000 }), emailMe: field.bool() }, async (input, { member }) => {
    await b.saveHostPrefs(db(), member, input);
  }),
  // The host's private calendar address: made on demand, shown once.
  newFeed: action({}, async (_, { member, request }) => {
    const token = await b.newFeed(db(), member);
    return `${publicOrigin(request.headers) ?? ""}/feed/${token}.ics`;
  }),
  stopFeed: action({}, async (_, { member }) => {
    await b.stopFeed(db(), member);
  }),
  saveSettings: action({ companyName: text(120), retentionMonths: field.int({ min: 0, max: 120 }), defaultZone: text(64) }, async (input, { member }) => {
    await b.saveSettings(db(), member, input);
  }),
  saveSites: action({ sites: text(4000) }, async ({ sites }, { member }) => {
    await b.saveEmbed(db(), member, sites);
  }),
  // A guest's data, erased by their email address (for good: the page asks first).
  eraseGuest: action({ address: text(254) }, async ({ address }, { member }) => {
    const sql = db();
    const gone = await b.eraseGuest(sql, member, address);
    for (const { id } of gone) await publish.unpublish(sql, { id });
    // Their meetings no longer keep their hosts busy.
    await share.shareBusy(sql, gone.map(x => x.memberId));
    return gone.length;
  }),
  // Meetings already booked in Calendly (its CSV export, read in the
  // browser and sent as text — 1 MB at most, the server's limit of a
  // request); each goes into the host's Chest calendar too.
  importCalendly: action({ text: text(1_000_000), zone: text(64) }, async ({ text: file, zone }, { member }) => {
    const sql = db();
    const { bookings, ...result } = await importFile(sql, member, file, zone);
    for (const booking of bookings) await publish.publish(sql, booking);
    // Past meetings, told to nobody; the time they take is.
    await share.shareBusy(sql, [member.id]);
    return result;
  }),

  // ——— The public part ———

  // A visitor books a time of a host's type. The package checks the form
  // first (its single-use token, the honeypot); what could never book
  // anything (a type that is not there, a time that is no time) is refused
  // without spending the budget; then charge("new"), the booking in one
  // transaction, and the guest's page (/b/<secret>). A booking that fails
  // (a time just taken) gives its count and its token back.
  bookTime: publicAction({
    host: text(40), type: text(40), start: text(40), name: text(120), email: text(254), phone: text(40), note: text(2000), zone: text(64),
    // The answers to the host's questions, sent as q_<question id>.
    answers: field.keyed(/^q_([a-z0-9]{4,12})$/u, text(2000), 10),
  }, async (input, { locale, request, charge }) => {
    const sql = db();
    const { host, type } = (await b.publicType(sql, input.host, input.type)) ?? fail("not_found");
    if (!b.wellFormedStart(input.start)) fail("invalid");
    await charge("new");
    const s = await b.settings(sql);
    const made = await b.book(sql, host, type, { start: input.start, name: input.name, email: input.email, phone: input.phone, note: input.note, answers: input.answers, zone: input.zone, language: locale }, Date.now(), { company: s.companyName });
    const origin = publicOrigin(request.headers);
    await b.rememberPublicOrigin(sql, origin);
    const mailed = (await email(sql, "confirmed", made.booking, origin)) === "email";
    // A team type may have gone to another of its hosts.
    const owner = made.booking.memberId === host.memberId ? host : await b.hostOf(sql, made.booking.memberId);
    await tell.booked(made.booking, owner?.zone ?? host.zone, await b.titlesOf(sql, made.booking));
    await publish.publish(sql, made.booking);
    await tell.hostCopy(sql, "booked", made.booking);
    await share.changed(sql, "booked", made.booking);
    redirect(`/b/${made.secret}?new=1${mailed ? "&mailed=1" : ""}`);
  }, { bound: { formSeconds: b.formLimits.formSeconds, budgets: { new: b.formLimits.perKind.new } } }),

  // The guest cancels their booking, with an optional word for the host.
  cancelMine: publicAction({ secret: text(100), reason: text(500) }, async ({ secret, reason }, { request, charge }) => {
    const sql = db();
    // Counted only once the link opens a booking still to come.
    await b.changeAllowed(sql, secret, null);
    // The guest's link is the subject: a few changes a day each.
    await charge("change", { subject: secret });
    const done = await b.cancelByGuest(sql, secret, reason);
    const host = await b.hostOf(sql, done.memberId);
    await email(sql, "cancelled", done, publicOrigin(request.headers));
    await tell.cancelled(done, host?.zone ?? done.guestZone, await b.titlesOf(sql, done));
    await publish.unpublish(sql, done);
    await tell.hostCopy(sql, "cancelled", done);
    await share.changed(sql, "cancelled", done);
  }, { bound: { budgets: { change: b.formLimits.perKind.change } } }),

  // The guest moves their booking to another free time of its type.
  moveMine: publicAction({ secret: text(100), start: text(40) }, async ({ secret, start }, { request, charge }) => {
    const sql = db();
    await b.changeAllowed(sql, secret, { start });
    await charge("change", { subject: secret });
    const { booking, from } = await b.moveByGuest(sql, secret, start);
    const host = await b.hostOf(sql, booking.memberId);
    await email(sql, "moved", booking, publicOrigin(request.headers));
    await tell.moved(booking, host?.zone ?? booking.guestZone, await b.titlesOf(sql, booking));
    await publish.publish(sql, booking);
    await tell.hostCopy(sql, "moved", booking);
    await share.changed(sql, "moved", booking, { previousHost: from });
    redirect(`/b/${secret}?moved=1`);
  }, { bound: { budgets: { change: b.formLimits.perKind.change } } }),
};
