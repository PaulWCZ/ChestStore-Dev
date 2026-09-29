import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultHours, frenchHolidays, parseHours, readHours, stamp, workMinutes, zoned, type Hours } from "../lib/hours.ts";
import { decide, matches } from "../lib/rules.ts";
import { baseSubject, linkify, robotAddress, splitQuoted } from "../lib/text.ts";

const paris = "Europe/Paris";

test("working hours: a Friday-evening email waits from Monday 9:00; nights, weekends and holidays do not count", () => {
  // Friday 2 Oct 2026, 19:00 in Paris → Monday 5 Oct, 10:30.
  const friday = zoned("2026-10-02", 19 * 60, paris), monday = zoned("2026-10-05", 10 * 60 + 30, paris);
  assert.equal(friday.toISOString(), "2026-10-02T17:00:00.000Z");
  assert.equal(workMinutes(friday, monday, defaultHours, paris), 90);
  assert.equal(workMinutes(friday, monday, { ...defaultHours, on: false }, paris), 63 * 60 + 30);
  // Within one day, and across a holiday (Wednesday 11 Nov 2026).
  assert.equal(workMinutes(zoned("2026-10-06", 8 * 60, paris), zoned("2026-10-06", 20 * 60, paris), defaultHours, paris), 9 * 60);
  const holiday: Hours = { ...defaultHours, holidays: ["2026-11-11"] };
  assert.equal(workMinutes(zoned("2026-11-10", 17 * 60, paris), zoned("2026-11-12", 10 * 60, paris), holiday, paris), 120);
  // The clock changes (25 Oct 2026, back to UTC+1): hours stay wall-clock hours.
  assert.equal(zoned("2026-10-26", 9 * 60, paris).toISOString(), "2026-10-26T08:00:00.000Z");
  assert.equal(workMinutes(zoned("2026-10-23", 17 * 60, paris), zoned("2026-10-26", 10 * 60, paris), defaultHours, paris), 120);
  assert.equal(workMinutes(monday, friday, defaultHours, paris), 0);
  assert.equal(stamp("2026-09-28T20:45:25.278Z", paris), "2026-09-28 22:45");
});

test("working hours are checked: half hours, start before end, seven days, 60 days off; a wrong stored value falls back", () => {
  assert.deepEqual(parseHours({ on: true, days: [null, null, null, null, null, { start: 600, end: 900 }, null], holidays: ["2026-12-25", "2026-12-25"] })?.holidays, ["2026-12-25"]);
  assert.equal(parseHours({ on: true, days: defaultHours.days.slice(0, 6) }), null);
  assert.equal(parseHours({ on: true, days: [{ start: 600, end: 610 }, ...defaultHours.days.slice(1)] }), null);
  assert.equal(parseHours({ on: true, days: [{ start: 900, end: 600 }, ...defaultHours.days.slice(1)] }), null);
  assert.equal(parseHours({ ...defaultHours, holidays: ["2026-02-30"] }), null);
  assert.equal(parseHours({ ...defaultHours, holidays: Array.from({ length: 61 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, "0")}`) }), null);
  assert.deepEqual(readHours("nonsense"), defaultHours);
});

test("France's public holidays follow Easter", () => {
  assert.deepEqual(frenchHolidays(2026), ["2026-01-01", "2026-04-06", "2026-05-01", "2026-05-08", "2026-05-14", "2026-05-25", "2026-07-14", "2026-08-15", "2026-11-01", "2026-11-11", "2026-12-25"]);
  assert.ok(frenchHolidays(2027).includes("2027-03-29"), "Easter Monday 2027");
});

test("an email's quoted history folds away; web addresses become links; subjects compare without Re: and [#n]", () => {
  const gmail = "Thanks, it works now.\n\nOn Mon, 28 Sep 2026 at 10:02, Atelier Martin <support@atelier.fr>\nwrote:\n> Try this.\n> Hugo";
  assert.deepEqual(splitQuoted(gmail), { main: "Thanks, it works now.", quoted: "On Mon, 28 Sep 2026 at 10:02, Atelier Martin <support@atelier.fr>\nwrote:\n> Try this.\n> Hugo" });
  assert.equal(splitQuoted("Merci !\nLe lun. 28 sept. 2026 à 10:02, Atelier <support@atelier.fr> a écrit :\n> Essayez ceci.").main, "Merci !");
  assert.equal(splitQuoted("Ok\n\nFrom: Atelier\nSent: Monday\nTo: me\nSubject: x\n\nold").main, "Ok");
  assert.equal(splitQuoted("Ok\n> quoted\n> more").main, "Ok");
  assert.deepEqual(splitQuoted("> only a quote"), { main: "> only a quote", quoted: "" });
  assert.deepEqual(splitQuoted("A line\nwith > inside\nand text"), { main: "A line\nwith > inside\nand text", quoted: "" });
  assert.deepEqual(linkify("See https://atelier.fr/faq, or (https://x.fr/a_(b)). Bye"), [{ text: "See " }, { text: "https://atelier.fr/faq", url: "https://atelier.fr/faq" }, { text: ", or (" }, { text: "https://x.fr/a_(b)", url: "https://x.fr/a_(b)" }, { text: "). Bye" }]);
  assert.deepEqual(linkify("javascript:alert(1) and http://"), [{ text: "javascript:alert(1) and http://" }]);
  assert.equal(baseSubject("RE: TR : Fwd: Broken  lamp [#1042]"), "broken lamp");
  assert.equal(baseSubject("Re: Broken lamp"), baseSubject("broken lamp"));
  assert.ok(robotAddress("no-reply@shop.fr") && robotAddress("MAILER-DAEMON@x.org") && robotAddress("noreply+123@x.org"));
  assert.ok(!robotAddress("anna@x.org") && !robotAddress("replyguy@x.org"));
});

test("rules: words ignore case and accents; senders by address or domain; tags add up, the first priority and person win", () => {
  const request = { subject: "Facturé deux fois", body: "Bonjour", from: "compta@client.bigco.fr" };
  assert.ok(matches({ field: "text", value: "facture" }, request));
  assert.ok(matches({ field: "from", value: "bigco.fr" }, request));
  assert.ok(matches({ field: "from", value: "compta@client.bigco.fr" }, request));
  assert.ok(!matches({ field: "from", value: "co.fr" }, { ...request, from: "a@bigco.fr" }));
  const rules = [
    { id: "1", field: "text" as const, value: "factur", tag: "Invoice", priority: null, assignee: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa" },
    { id: "2", field: "from" as const, value: "bigco.fr", tag: "Key account", priority: "urgent" as const, assignee: "mbr_hugoaaaaaaaaaaaaaaaaaaaaaa" },
    { id: "3", field: "text" as const, value: "bonjour", tag: "invoice", priority: "low" as const, assignee: null },
  ];
  assert.deepEqual(decide(rules, request), { tags: ["Invoice", "Key account"], priority: "urgent", assignee: "mbr_sofiaaaaaaaaaaaaaaaaaaaaaa" });
});
