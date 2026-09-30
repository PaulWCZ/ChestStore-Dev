import assert from "node:assert/strict";
import { test } from "node:test";
import * as calendar from "../src/calendar.js";
import { CapabilityNotGranted, ChestError } from "../src/errors.js";
import type { Member } from "../src/member.js";
import { fakeChest, withMember } from "../src/testing.js";

const person = (key: string, locale: "en" | "fr"): Member => ({ id: "mbr_" + key + "a".repeat(26 - key.length), firstName: key, lastName: "X", name: key + " X", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], locale });
const camille = person("camille", "fr"), hugo = person("hugo", "en"), nora = person("nora", "en");
const code = (c: string) => (e: unknown) => e instanceof ChestError && e.code === c;
const octets = (line: string) => Buffer.byteLength(line);

test("TEXT values are escaped as RFC 5545 §3.3.11 says", () => {
  // The RFC's own example, a DESCRIPTION over three lines.
  assert.equal(calendar.escapeText("Project XYZ Final Review\nConference Room - 3B\nCome Prepared."), "Project XYZ Final Review\\nConference Room - 3B\\nCome Prepared.");
  assert.equal(calendar.escapeText("a;b,c\\d"), "a\\;b\\,c\\\\d");
  assert.equal(calendar.escapeText("one\r\ntwo\rthree"), "one\\ntwo\\nthree");
  // Other control characters could end a line early in a weak reader.
  assert.equal(calendar.escapeText("bell\u0007 tab\t"), "bell tab");
});

test("content lines fold at 75 octets, never inside a character, and unfold back (RFC 5545 §3.1)", () => {
  // The RFC's example of a folded line unfolds to one line.
  assert.equal(calendar.unfold("DESCRIPTION:This is a lo\r\n ng description\r\n  that exists on a long line."), "DESCRIPTION:This is a long description that exists on a long line.");
  assert.equal(calendar.foldLine("SUMMARY:short"), "SUMMARY:short");
  const long = "DESCRIPTION:" + "Réunion d'équipe — 会議 🗓️ ".repeat(20);
  const folded = calendar.foldLine(long);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 5);
  assert.ok(lines.every(l => octets(l) <= 75), "every line is 75 octets at most");
  assert.ok(lines.slice(1).every(l => l.startsWith(" ")), "a continuation starts with one space");
  assert.equal(calendar.unfold(folded), long);
  // Exactly 75 octets stays on one line; 76 folds.
  assert.equal(calendar.foldLine("X".repeat(75)).includes("\r\n"), false);
  assert.equal(calendar.foldLine("X".repeat(76)), "X".repeat(75) + "\r\n X");
  // A three-octet character that would cross the limit goes whole to the next line.
  const edge = calendar.foldLine("X".repeat(74) + "é" + "€");
  assert.equal(edge.split("\r\n")[0], "X".repeat(74));
});

test("ics writes UTC times, whole days with an exclusive end, a stable DTSTAMP and UID, CRLF", () => {
  const stamp = new Date("2026-09-28T08:00:00Z");
  const text = calendar.ics([
    { uid: calendar.uidOf("rooms", "booking:981", "atelier.test"), stamp, sequence: 2, title: "Green room; 2nd floor, left", start: new Date("2026-10-12T09:00:00+02:00"), end: new Date("2026-10-12T10:30:00+02:00"), location: "Paris", url: "https://rooms-chest.atelier.test/chest/bookings/981", categories: ["Rooms"] },
    { uid: calendar.uidOf("leave", "leave:42", "atelier.test"), stamp, title: "Off", days: { first: "2026-10-12", last: "2026-10-16" }, private: true },
    { uid: "x@atelier.test", stamp, title: "Due", days: { first: "2026-12-31", last: "2026-12-31" }, busy: false },
  ], { name: "Chest — Atelier", refresh: "PT1H" });
  assert.ok(text.endsWith("\r\n") && !/[^\r]\n/u.test(text), "CRLF line ends only");
  const lines = calendar.unfold(text).split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.ok(lines.includes("VERSION:2.0") && lines.includes("PRODID:-//Argentic//Chest//EN"));
  assert.ok(lines.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H") && lines.includes("X-WR-CALNAME:Chest — Atelier"));
  assert.equal(lines.some(l => l.startsWith("METHOD:")), false, "a feed has no method");
  // 09:00 in Paris (UTC+2 in October) is 07:00 UTC — the form of RFC 5545 §3.3.5 (19980119T070000Z).
  assert.ok(lines.includes("DTSTART:20261012T070000Z") && lines.includes("DTEND:20261012T083000Z"));
  assert.ok(lines.includes("DTSTAMP:20260928T080000Z") && lines.includes("SEQUENCE:2"));
  assert.ok(lines.includes("SUMMARY:Green room\\; 2nd floor\\, left"));
  assert.ok(lines.includes("URL:https://rooms-chest.atelier.test/chest/bookings/981") && lines.includes("CATEGORIES:Rooms"));
  // DTEND of a whole-day event is the day after the last (RFC 5545 §3.6.1: non-inclusive).
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20261012") && lines.includes("DTEND;VALUE=DATE:20261017"));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20261231") && lines.includes("DTEND;VALUE=DATE:20270101"), "across a year");
  assert.ok(lines.includes("CLASS:PRIVATE") && lines.includes("TRANSP:TRANSPARENT") && lines.includes("TRANSP:OPAQUE"));
  assert.equal(lines.filter(l => l === "BEGIN:VEVENT").length, 3);
  assert.equal(lines.filter(l => l === "END:VEVENT").length, 3);
  assert.equal(lines.at(-2), "END:VCALENDAR");
  // A UID is stable, per tool and key, and does not reveal the key.
  const uid = calendar.uidOf("rooms", "booking:981", "atelier.test");
  assert.equal(uid, calendar.uidOf("rooms", "booking:981", "atelier.test"));
  assert.notEqual(uid, calendar.uidOf("leave", "booking:981", "atelier.test"));
  assert.match(uid, /^[0-9a-f]{32}@atelier\.test$/u);
  // A file to open says its method; a URL that is not a plain http(s) link is left out.
  const file = calendar.ics([{ uid, stamp, title: "x", start: stamp, end: new Date(stamp.getTime() + 60000), url: "javascript:alert(1)" }], { method: "PUBLISH" });
  assert.ok(file.includes("METHOD:PUBLISH\r\n") && !file.includes("URL:"));
});

test("put checks the event before sending: key, members, words, times, horizon, path", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["calendar"] });
  try {
    const base = { key: "a", members: [camille.id], title: "x", start: "2026-10-12T09:00:00Z", end: "2026-10-12T10:00:00Z" };
    await assert.rejects(calendar.put({ ...base, key: "no spaces" }), code("invalid_key"));
    await assert.rejects(calendar.put({ ...base, members: [] }), code("invalid_event"));
    await assert.rejects(calendar.put({ ...base, members: ["camille"] }), code("invalid_id"));
    await assert.rejects(calendar.put({ ...base, title: "" }), code("invalid_event"));
    await assert.rejects(calendar.put({ ...base, title: { de: "Raum" } as never }), code("invalid_event"));
    await assert.rejects(calendar.put({ ...base, title: "x".repeat(121) }), code("invalid_event"));
    await assert.rejects(calendar.put({ ...base, start: "2026-10-12T09:00:00" }), code("invalid_event"), "a local time without its zone");
    await assert.rejects(calendar.put({ ...base, end: "2026-10-12T08:00:00Z" }), code("invalid_event"));
    await assert.rejects(calendar.put({ key: "d", members: [camille.id], title: "x", days: { first: "2026-02-30", last: "2026-03-01" } }), code("invalid_event"));
    await assert.rejects(calendar.put({ key: "d", members: [camille.id], title: "x", days: { first: "2026-03-02", last: "2026-03-01" } }), code("invalid_event"));
    const far = new Date(Date.now() + 800 * 86_400_000).toISOString();
    await assert.rejects(calendar.put({ ...base, start: far, end: new Date(Date.parse(far) + 3600_000).toISOString() }), code("invalid_event"));
    await assert.rejects(calendar.put({ ...base, path: "https://evil.example/" }), code("invalid_event"));
    assert.equal(chest.calendar.size, 0, "nothing was sent");
  } finally {
    await chest.close();
  }
});

test("events go to their members' feeds, each in its reader's language; the same key replaces; remove takes it out", async () => {
  const chest = await fakeChest({ members: [camille, hugo], capabilities: ["calendar"], calendar: { domain: "atelier.test", toolTitle: "Rooms", company: "Atelier Martin" } });
  try {
    const now = new Date();
    const at = (days: number, hour: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour)).toISOString();
    const put = await calendar.put({ key: "booking:981", members: [camille.id, hugo.id, nora.id], title: { en: "Room booked: Green room", fr: "Salle réservée : Salle verte" }, start: at(3, 7), end: at(3, 8), location: "2nd floor", path: "/chest/bookings/981" });
    assert.deepEqual(put, { key: "booking:981", members: [camille.id, hugo.id], skipped: [nora.id] }, "Nora does not have the tool");
    await calendar.put({ key: "desk:5", members: [camille.id], title: { en: "Office — desk D-12", fr: "Au bureau — poste D-12" }, days: { first: at(4, 0).slice(0, 10), last: at(4, 0).slice(0, 10) }, busy: false });
    const french = calendar.unfold(chest.feed(camille.id));
    assert.ok(french.includes("SUMMARY:Salle réservée : Salle verte") && french.includes("SUMMARY:Au bureau — poste D-12"));
    assert.ok(french.includes("URL:https://tool-chest.chest.test/chest/bookings/981") && french.includes("CATEGORIES:Rooms") && french.includes("X-WR-CALNAME:Chest — Atelier Martin"));
    const english = calendar.unfold(chest.feed(hugo.id));
    assert.ok(english.includes("SUMMARY:Room booked: Green room") && !english.includes("desk"), "Hugo sees his event only, in English");
    assert.equal(chest.feed(nora.id).includes("BEGIN:VEVENT"), false);
    // The same key replaces: new time, Hugo left out, sequence up.
    await calendar.put({ key: "booking:981", members: [camille.id], title: "Green room", start: at(3, 9), end: at(3, 10) });
    assert.equal(chest.calendar.get("booking:981")?.sequence, 1);
    assert.ok(calendar.unfold(chest.feed(camille.id)).includes("SEQUENCE:1"));
    assert.equal(chest.feed(hugo.id).includes("BEGIN:VEVENT"), false);
    // A title of one text reads the same in every language.
    assert.ok(calendar.unfold(chest.feed(camille.id)).includes("SUMMARY:Green room"));
    const listed = await calendar.list();
    assert.deepEqual(listed.events.map(e => e.key), ["booking:981", "desk:5"]);
    assert.equal(listed.next, null);
    assert.equal(await calendar.remove("booking:981"), true);
    assert.equal(await calendar.remove("booking:981"), false, "removing again is harmless");
    assert.equal(calendar.unfold(chest.feed(camille.id)).includes("Green room"), false);
    // A member who loses the tool loses its events from their feed.
    chest.members.splice(0, 1);
    assert.equal(chest.feed(camille.id).includes("BEGIN:VEVENT"), false);
  } finally {
    await chest.close();
  }
});

test("each member's feed is served at a secret address, replaced on demand; the page shows it to its member", async () => {
  const chest = await fakeChest({ members: [camille, hugo], capabilities: ["calendar"] });
  try {
    await calendar.put({ key: "leave:42", members: [camille.id], title: { en: "Off", fr: "Absente" }, days: { first: new Date().toISOString().slice(0, 10), last: new Date().toISOString().slice(0, 10) }, private: true });
    const address = chest.feedUrl(camille.id);
    assert.match(address, /^https:\/\/tool-chest\.chest\.test\/_chest\/calendar\/[A-Za-z0-9_-]{43}\.ics$/u);
    assert.equal(chest.feedUrl(camille.id), address, "the same until replaced");
    const local = (link: string) => chest.api + new URL(link).pathname;
    const served = await fetch(local(address));
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "text/calendar; charset=utf-8");
    assert.equal(served.headers.get("referrer-policy"), "no-referrer");
    const body = await served.text();
    assert.ok(calendar.unfold(body).includes("SUMMARY:Absente") && body.includes("CLASS:PRIVATE"));
    const again = await fetch(local(address), { headers: { "If-None-Match": served.headers.get("etag")! } });
    assert.equal(again.status, 304);
    const replaced = chest.newFeedUrl(camille.id);
    assert.notEqual(replaced, address);
    assert.equal((await fetch(local(address))).status, 404, "the old address stops working");
    assert.equal((await fetch(local(replaced))).status, 200);
    // The page: only for the member the front signs in.
    assert.equal((await fetch(chest.api + calendar.page)).status, 404);
    const page = await fetch(withMember(new Request(chest.api + calendar.page), camille));
    const html = await page.text();
    assert.ok(html.includes("Ajoutez votre calendrier Chest") && html.includes(replaced) && html.includes("webcal://"));
    const renewed = await fetch(withMember(new Request(chest.api + "/_chest/calendar/new", { method: "POST" }), camille), { redirect: "manual" });
    assert.equal(renewed.status, 303);
    assert.notEqual(chest.feedUrl(camille.id), replaced);
  } finally {
    await chest.close();
  }
});

test("without the capability, or on a Chest without the calendar, put says so", async () => {
  const bare = await fakeChest({ members: [camille], capabilities: [] });
  try {
    await assert.rejects(calendar.put({ key: "a", members: [camille.id], title: "x", start: new Date(), end: new Date(Date.now() + 60000) }), CapabilityNotGranted);
    await assert.rejects(calendar.remove("a"), CapabilityNotGranted);
  } finally {
    await bare.close();
  }
  const old = await fakeChest({ members: [camille], capabilities: ["calendar"], calendar: false });
  try {
    await assert.rejects(calendar.put({ key: "a", members: [camille.id], title: "x", start: new Date(), end: new Date(Date.now() + 60000) }), CapabilityNotGranted);
    await assert.rejects(calendar.list(), CapabilityNotGranted);
  } finally {
    await old.close();
  }
});

// Proposal (studio.15): Tasks' first sync put one event per call against
// 600 writes a minute; putMany sends 100 a call, each checked first.
// studio.16: answered event by event — one wrong event holds none of the
// others back (Rooms, Clients and Tasks put a refused batch again one by
// one).
test("putMany: many events in few calls, answered event by event in the order given", async () => {
  const chest = await fakeChest({ members: [camille, hugo], capabilities: ["calendar"] });
  try {
    const due = (n: number) => ({ key: `task:${n}`, members: n % 2 ? [camille.id, nora.id] : [hugo.id], title: { en: `Due: card ${n}`, fr: `Échéance : carte ${n}` }, days: { first: "2026-10-12", last: "2026-10-12" }, busy: false });
    const puts = await calendar.putMany(Array.from({ length: 250 }, (_, n) => due(n)));
    assert.equal(puts.length, 250);
    assert.ok(puts.every(p => p.ok));
    assert.deepEqual(puts[1], { ok: true, index: 1, key: "task:1", members: [camille.id], skipped: [nora.id] });
    assert.equal(puts[249]?.key, "task:249");
    assert.equal(chest.calendar.size, 250);
    // Again: replaced, not added; one event more is one sequence more.
    await calendar.putMany([due(1), due(2)]);
    assert.equal(chest.calendar.get("task:1")?.sequence, 1);
    assert.equal(chest.calendar.size, 250);
    assert.deepEqual(await calendar.putMany([]), []);
  } finally {
    await chest.close();
  }
});

test("putMany (studio.16): a wrong event, a bad key or a key given twice is refused alone, with its reason; the rest is put", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["calendar"] });
  try {
    const one = (n: number | string) => ({ key: `e:${n}`, members: [camille.id], title: "x", days: { first: "2026-10-12", last: "2026-10-12" } });
    const results = await calendar.putMany([
      one(1),
      { ...one(2), days: { first: "2026-10-12", last: "2026-10-01" } },   // the last day before the first
      { ...one(3), key: "a key with spaces" },
      { ...one(4), members: ["camille"] },
      one(5), one(5),                                                      // twice: neither is put
      null as unknown as calendar.CalendarEvent,
      one(6),
    ]);
    assert.deepEqual(results.map(r => (r.ok ? "ok" : r.reason)), ["ok", "invalid_event", "invalid_key", "invalid_id", "duplicate_key", "duplicate_key", "invalid_event", "ok"]);
    assert.deepEqual(results.map(r => r.index), [0, 1, 2, 3, 4, 5, 6, 7]);
    const refused = results[1]!;
    assert.ok(!refused.ok && refused.key === "e:2" && refused.message.includes("days"));
    assert.deepEqual([...chest.calendar.keys()].sort(), ["e:1", "e:6"]);
    // Nothing is sent for events the SDK refuses: a call of only those is no call.
    const size = chest.calendar.size;
    assert.equal((await calendar.putMany([{ ...one(7), title: "" }]))[0]?.ok, false);
    assert.equal(chest.calendar.size, size);
  } finally {
    await chest.close();
  }
});

test("putMany: a batch is one write of the minute; new keys beyond the 5,000 events are refused one by one, those that fit are put", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["calendar"] });
  try {
    const one = (n: number) => ({ key: `e:${n}`, members: [camille.id], title: "x", days: { first: "2026-10-12", last: "2026-10-12" } });
    // 4,999 events in 50 calls: well within 600 writes a minute.
    for (let i = 0; i < 4999; i += 1000) await calendar.putMany(Array.from({ length: Math.min(1000, 4999 - i) }, (_, n) => one(i + n)));
    assert.equal(chest.calendar.size, 4999);
    // A known key is replaced, the first new key fits, the next ones do not.
    const before = chest.calendar.get("e:0")!.sequence;
    const results = await calendar.putMany([one(0), one(5000), one(5001), one(5002)]);
    assert.deepEqual(results.map(r => (r.ok ? "ok" : r.reason)), ["ok", "ok", "quota_exceeded", "quota_exceeded"]);
    assert.equal(chest.calendar.get("e:0")!.sequence, before + 1);
    assert.equal(chest.calendar.size, calendar.limits.events);
    // Without the capability, or on a Chest without the calendar: the call throws.
    const bare = await fakeChest({ capabilities: [], calendar: false });
    try {
      await assert.rejects(calendar.putMany([one(1)]), CapabilityNotGranted);
      await assert.rejects(calendar.putMany("x" as unknown as calendar.CalendarEvent[]), code("invalid_event"));
    } finally {
      await bare.close();
    }
  } finally {
    await chest.close();
  }
});
