import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultHours, frenchHolidays, parseHours, readHours, stamp, workMinutes, zoned, type Hours } from "../src/shared/hours.ts";
import { decide, matches } from "../src/lib/rules.ts";
import { linkify, robotAddress } from "../src/shared/text.ts";

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

test("web addresses become links", () => {
  assert.deepEqual(linkify("See https://atelier.fr/faq, or (https://x.fr/a_(b)). Bye"), [{ text: "See " }, { text: "https://atelier.fr/faq", url: "https://atelier.fr/faq" }, { text: ", or (" }, { text: "https://x.fr/a_(b)", url: "https://x.fr/a_(b)" }, { text: "). Bye" }]);
  assert.deepEqual(linkify("javascript:alert(1) and http://"), [{ text: "javascript:alert(1) and http://" }]);
  // The team's side: email addresses and phone numbers as mailto: and tel: links; order numbers and dates stay text.
  assert.deepEqual(linkify("Votre numéro de téléphone\u202f: 06 12 34 56 78", { contacts: true }), [{ text: "Votre numéro de téléphone\u202f: " }, { text: "06 12 34 56 78", url: "tel:0612345678" }]);
  assert.deepEqual(linkify("Call +33 6 12 34 56 78 or nina.roux@gmail.com.", { contacts: true }), [{ text: "Call " }, { text: "+33 6 12 34 56 78", url: "tel:+33612345678" }, { text: " or " }, { text: "nina.roux@gmail.com", url: "mailto:nina.roux@gmail.com" }, { text: "." }]);
  assert.deepEqual(linkify("+1 (415) 555-0100, 0612345678", { contacts: true }).filter(p => p.url).map(p => p.url), ["tel:+14155550100", "tel:0612345678"]);
  assert.deepEqual(linkify("Order 123456789 on 2026-09-29, n°00012345678, 02.10.2026", { contacts: true }), [{ text: "Order 123456789 on 2026-09-29, n°00012345678, 02.10.2026" }]);
  assert.deepEqual(linkify("https://a.fr/x?mail=a@b.fr", { contacts: true }), [{ text: "https://a.fr/x?mail=a@b.fr", url: "https://a.fr/x?mail=a@b.fr" }]);
  assert.deepEqual(linkify("Call 06 12 34 56 78"), [{ text: "Call 06 12 34 56 78" }], "only on the team's side");
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
