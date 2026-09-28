import assert from "node:assert/strict";
import { test } from "node:test";
import { calendar, escape, fold } from "../lib/ics.ts";
import { excerpt, inline, isSafeHref, parse, plain } from "../lib/markdown.ts";
import { day, local, nextDay, time, today, zoned } from "../lib/time.ts";

// The text of a post: a few marks, never HTML.
test("paragraphs, subheadings, lists and quotes", () => {
  const blocks = parse("## Moving day\nWe move.\nOn Monday.\n\n- boxes\n- keys\n  (at the desk)\n\n3. first\n4. second\n\n> Be kind");
  assert.deepEqual(blocks.map(b => b.t), ["h", "p", "ul", "ol", "quote"]);
  assert.deepEqual(blocks[1], { t: "p", c: [{ t: "text", v: "We move." }, { t: "br" }, { t: "text", v: "On Monday." }] });
  assert.deepEqual(blocks[2], { t: "ul", items: [[{ t: "text", v: "boxes" }], [{ t: "text", v: "keys (at the desk)" }]] });
  assert.equal(blocks[3]!.t === "ol" && blocks[3]!.start, 3);
  assert.deepEqual(parse("   \n\n"), []);
});

test("bold, italic, links; unsafe links stay text", () => {
  assert.deepEqual(inline("**Big** and *small* and _also_"), [
    { t: "b", c: [{ t: "text", v: "Big" }] }, { t: "text", v: " and " }, { t: "i", c: [{ t: "text", v: "small" }] }, { t: "text", v: " and " }, { t: "i", c: [{ t: "text", v: "also" }] },
  ]);
  assert.deepEqual(inline("snake_case_name and 2 * 3 * 4"), [{ t: "text", v: "snake_case_name and 2 * 3 * 4" }]);
  assert.deepEqual(inline("[the plan](https://example.com/plan?a=1)"), [{ t: "a", href: "https://example.com/plan?a=1", c: [{ t: "text", v: "the plan" }] }]);
  assert.deepEqual(inline("[click](javascript:alert(1))"), [{ t: "text", v: "[click](javascript:alert(1))" }]);
  assert.deepEqual(inline("[x](data:text/html,<b>)"), [{ t: "text", v: "[x](data:text/html,<b>)" }]);
  assert.deepEqual(inline("See https://example.com/a_b. Then"), [{ t: "text", v: "See " }, { t: "a", href: "https://example.com/a_b", c: [{ t: "text", v: "https://example.com/a_b" }] }, { t: "text", v: ". Then" }]);
  assert.deepEqual(inline("<script>alert(1)</script>"), [{ t: "text", v: "<script>alert(1)</script>" }]);
  assert.deepEqual(inline("\\*not italic\\*"), [{ t: "text", v: "*not italic*" }]);
  assert.deepEqual(inline("**unclosed"), [{ t: "text", v: "**unclosed" }]);
  assert.equal(isSafeHref("mailto:rh@example.com"), true);
  assert.equal(isSafeHref("MAILTO:x"), false);
  assert.equal(isSafeHref("/chest/posts/1"), false);
  assert.equal(isSafeHref("https://a.b/\"onmouseover=x"), false);
  // Nothing pathological: long runs of marks are read fast.
  const started = Date.now();
  inline("*".repeat(20000));
  inline("_a".repeat(10000));
  inline("[".repeat(10000) + "](");
  assert.ok(Date.now() - started < 2000);
});

test("plain text and excerpts", () => {
  assert.equal(plain("## Title\n**Bold** [link](https://a.b)\n\n- one\n- two"), "Title\n\nBold link\n\n• one\n• two");
  assert.equal(excerpt("A short text.", 50), "A short text.");
  assert.equal(excerpt("The office moves to the new building on Monday morning", 30), "The office moves to the new…");
});

// Days and times on the Chest's clock.
test("a wall-clock time in Paris, across daylight-saving changes", () => {
  assert.equal(zoned("2026-10-15", "19:30", "Europe/Paris").toISOString(), "2026-10-15T17:30:00.000Z");
  assert.equal(zoned("2026-12-15", "19:30", "Europe/Paris").toISOString(), "2026-12-15T18:30:00.000Z");
  // Skipped at 02:00 on 29 March 2026: read an hour later (03:30 summer time).
  assert.equal(zoned("2026-03-29", "02:30", "Europe/Paris").toISOString(), "2026-03-29T01:30:00.000Z");
  // Shown twice on 25 October 2026: the first one (summer time).
  assert.equal(zoned("2026-10-25", "02:30", "Europe/Paris").toISOString(), "2026-10-25T00:30:00.000Z");
  assert.equal(zoned("2026-07-01", "09:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z");
  assert.deepEqual(local("2026-10-15T17:30:00.000Z", "Europe/Paris"), { day: "2026-10-15", time: "19:30" });
  assert.equal(today("Europe/Paris", new Date("2026-10-15T22:30:00Z")), "2026-10-16");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
  assert.throws(() => day("2026-02-29"));
  assert.throws(() => day("1999-01-01"));
  assert.throws(() => time("7:00"));
  assert.throws(() => time("24:00"));
});

// "Add to my calendar" (RFC 5545).
test("calendar text is escaped", () => {
  assert.equal(escape("Dinner; drinks, and more\\\nBring\r\na coat\u0007"), "Dinner\\; drinks\\, and more\\\\\\nBring\\na coat");
});

test("long lines fold at 75 octets without cutting a character", () => {
  const line = "DESCRIPTION:" + "é".repeat(100);
  const folded = fold(line);
  const parts = folded.split("\r\n");
  const encoder = new TextEncoder();
  assert.ok(parts.length > 1);
  for (const [i, part] of parts.entries()) {
    assert.ok(encoder.encode(part).length <= 75, `line ${i} is ${encoder.encode(part).length} octets`);
    if (i > 0) assert.ok(part.startsWith(" "));
  }
  assert.equal(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join(""), line);
  assert.equal(fold("SUMMARY:short"), "SUMMARY:short");
  const emoji = fold("SUMMARY:" + "🎉".repeat(40));
  assert.ok(!emoji.includes("�"));
  assert.equal(emoji.split("\r\n ").join(""), "SUMMARY:" + "🎉".repeat(40));
});

test("an event with times, in UTC; an all-day event as dates", () => {
  const text = calendar({
    uid: "post-12-abc@news.chest",
    title: "Team dinner, at last",
    description: "Bring your good mood;\nsee you there",
    place: "Chez Paul, 12 rue X",
    day: "2026-10-15",
    start: new Date("2026-10-15T17:30:00Z"),
    end: null,
    stamp: new Date("2026-09-28T10:15:30.123Z"),
  });
  assert.ok(text.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/u.test(text), "only CRLF line ends");
  const lines = text.trimEnd().split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.ok(lines.includes("VERSION:2.0"));
  assert.ok(lines.includes("UID:post-12-abc@news.chest"));
  assert.ok(lines.includes("DTSTAMP:20260928T101530Z"));
  assert.ok(lines.includes("DTSTART:20261015T173000Z"));
  assert.ok(lines.includes("DTEND:20261015T183000Z"));
  assert.ok(lines.includes("SUMMARY:Team dinner\\, at last"));
  assert.ok(lines.includes("LOCATION:Chez Paul\\, 12 rue X"));
  assert.ok(lines.includes("DESCRIPTION:Bring your good mood\\;\\nsee you there"));
  assert.equal(lines.at(-1), "END:VCALENDAR");
  const allDay = calendar({ uid: "u@x", title: "Seminar", description: "", place: null, day: "2026-12-31", start: null, end: null, stamp: new Date("2026-09-28T10:00:00Z") });
  assert.ok(allDay.includes("DTSTART;VALUE=DATE:20261231\r\n"));
  assert.ok(allDay.includes("DTEND;VALUE=DATE:20270101\r\n"));
  assert.ok(!allDay.includes("LOCATION"));
});
