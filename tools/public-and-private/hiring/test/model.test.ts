import assert from "node:assert/strict";
import { test } from "node:test";
import { amount, link, phone, slugify, sniff } from "../lib/model.ts";
import { parse, plain } from "../lib/rich-text.ts";

test("slugs: plain ASCII from any title, never a route of the tool", () => {
  assert.equal(slugify("Senior furniture designer"), "senior-furniture-designer");
  assert.equal(slugify("Chargé·e de clientèle — Lyon"), "charge-e-de-clientele-lyon");
  assert.equal(slugify("Œuvre & cœur"), "oeuvre-coeur");
  assert.equal(slugify("chest"), "job-chest");
  assert.equal(slugify("!!!"), "job");
});

test("links are http(s) only; phones and amounts as people type them", () => {
  assert.equal(link("www.example.com/me"), "https://www.example.com/me");
  assert.equal(link(""), "");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com", "https://user:pw@x.com", "not a link"]) assert.throws(() => link(bad), { code: "invalid_link" });
  assert.equal(phone("+33 (0)6 12.34.56-78"), "+33 (0)6 12.34.56-78");
  assert.throws(() => phone("12"), { code: "invalid" });
  assert.equal(amount("45 000"), 45000);
  assert.equal(amount("45,000"), 45000);
  assert.equal(amount(""), null);
  assert.throws(() => amount("-3"), { code: "invalid" });
});

test("a CV's first bytes say what it is", () => {
  assert.equal(sniff(new TextEncoder().encode("%PDF-1.7")), "application/pdf");
  assert.equal(sniff(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), "application/msword");
  assert.equal(sniff(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(sniff(new TextEncoder().encode("<html>")), null);
});

test("a description: headings, lists, bold — and HTML stays text", () => {
  const blocks = parse("Intro line\nsecond line\n\n## What you do\n- **Draw** chairs\n- Build them\n1. One\n2. Two\n\n<script>alert(1)</script>");
  assert.deepEqual(blocks.map(b => b.kind), ["paragraph", "heading", "bullets", "numbers", "paragraph"]);
  assert.deepEqual(blocks[2], { kind: "bullets", items: [[{ text: "Draw", bold: true }, { text: " chairs", bold: false }], [{ text: "Build them", bold: false }]] });
  assert.deepEqual(blocks[4], { kind: "paragraph", lines: [[{ text: "<script>alert(1)</script>", bold: false }]] });
  assert.equal(plain("## Title\nSome **bold** words.", 12), "Some bold…");
});
