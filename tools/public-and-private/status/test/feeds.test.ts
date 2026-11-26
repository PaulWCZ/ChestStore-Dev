import assert from "node:assert/strict";
import { test } from "node:test";
import { atom, rss, xml } from "../src/lib/feed.ts";
import { calendar, escape, fold } from "../src/lib/ics.ts";

const feed = {
  title: "Atelier Martin status — incidents",
  subtitle: "Incidents & maintenance",
  link: "https://s.test/",
  self: "https://s.test/feed.atom",
  updated: new Date("2026-09-28T12:00:00Z"),
  entries: [{ id: "https://s.test/incidents/1", title: "<script>alert(1)</script> & co", link: "https://s.test/incidents/1", published: new Date("2026-09-28T10:00:00Z"), updated: new Date("2026-09-28T12:00:00Z"), text: "Line \u0001one\n\"quoted\"" }],
};

test("the feeds are well-formed text: markup and control characters never pass", () => {
  const a = atom(feed);
  assert.ok(a.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">'));
  assert.ok(a.includes("<title type=\"text\">&lt;script&gt;alert(1)&lt;/script&gt; &amp; co</title>"));
  assert.ok(a.includes("<updated>2026-09-28T12:00:00.000Z</updated>"));
  assert.ok(!a.includes("\u0001"));
  assert.ok(!a.includes("<script>"));
  const r = rss(feed);
  assert.ok(r.includes("<rss version=\"2.0\""));
  assert.ok(r.includes("<pubDate>Mon, 28 Sep 2026 12:00:00 GMT</pubDate>"));
  assert.ok(r.includes("&quot;quoted&quot;"));
  assert.equal(xml("a<b>&'\""), "a&lt;b&gt;&amp;&apos;&quot;");
});

test("the maintenance calendar follows RFC 5545: escaped text, folded lines, cancelled windows", () => {
  assert.equal(escape("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
  const long = "SUMMARY:" + "é".repeat(80);
  assert.ok(fold(long).split("\r\n ").every(piece => new TextEncoder().encode(piece).length <= 75));
  const text = calendar([
    { uid: "maintenance-1@s.test", sequence: 2, start: new Date("2026-10-02T20:00:00Z"), end: new Date("2026-10-02T21:00:00Z"), summary: "Maintenance — Database; upgrade", url: "https://s.test/incidents/1" },
    { uid: "maintenance-2@s.test", sequence: 1, start: new Date("2026-10-03T20:00:00Z"), end: new Date("2026-10-03T21:00:00Z"), summary: "Cancelled one", cancelled: true },
  ], { name: "Atelier Martin — planned maintenance", refreshHours: 1, now: new Date("2026-09-28T12:00:00Z") });
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(text.includes("DTSTART:20261002T200000Z\r\n"));
  assert.ok(text.includes("SUMMARY:Maintenance — Database\\; upgrade\r\n"));
  assert.ok(text.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H"));
  assert.ok(text.includes("STATUS:CANCELLED"));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
});
