import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as cv from "../src/lib/cv.ts";
import { everyone } from "./support/members.ts";

// CVs: a visitor's through SDK 0.7.0's visitors' uploads (a path, the name
// the Chest gives the file), a recruiter's with the tool's signed ticket;
// the tool checks each file before keeping it.
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
});

const pdf = "%PDF-1.4\n%%EOF\n";

// A visitor's upload as their browser sends it: a path on the host the
// page is on, the Chest's answer the name it gave the file.
async function visitorSends(content: string | Uint8Array, type: string): Promise<{ status: number; claim: string }> {
  const up = await cv.publicGrant(type, typeof content === "string" ? content.length : content.byteLength);
  assert.match(up.url, /^\/_chest\/files\/upload\/[^/]+$/u, "a path: the company's own domain and a framing site work too");
  const sent = await chest.upload(up.url, content, type);
  const body = (await sent.json().catch(() => ({}))) as { name?: string };
  return { status: sent.status, claim: body.name ?? "" };
}

test("a visitor's PDF: granted as a path, sent, named by the Chest, taken once, checked, moved to cv/", async () => {
  const sent = await visitorSends(pdf, "application/pdf");
  assert.equal(sent.status, 201);
  assert.match(sent.claim, cv.uploadedPattern);
  const kept = await cv.take(sent.claim, "Lucie CV.pdf");
  assert.match(kept.object, /^cv\/[0-9a-f]{20}\.pdf$/u);
  assert.deepEqual([kept.fileName, kept.type, kept.size], ["Lucie CV.pdf", "application/pdf", pdf.length]);
  assert.ok(chest.files.has(kept.object));
  assert.equal([...chest.files.keys()].filter(n => n.startsWith("uploads/")).length, 0);
  // A name is taken once; a made-up one, or one of another folder, names nothing.
  await assert.rejects(cv.take(sent.claim, "again.pdf"), { code: "cv_missing" });
  await assert.rejects(cv.take("x".repeat(20) + ".claim", "x.pdf"), { code: "cv_missing" });
  await assert.rejects(cv.take("uploads/public/abc.pdf", "x.pdf"), { code: "cv_missing" });
  await assert.rejects(cv.take("uploads/public/0123456789abcdef0123.pdf", "x.pdf"), { code: "cv_missing" });
  await assert.rejects(cv.take(kept.object, "x.pdf"), { code: "cv_missing" }, "never a kept CV by its name");
});

test("a file that says PDF but is not one is refused at the Chest's door", async () => {
  const sent = await visitorSends("MZ this is a program", "application/pdf");
  // A visitor's file is of the type its bytes are (SDK 0.7.0): not one granted.
  assert.equal(sent.status, 415);
  assert.equal([...chest.files.keys()].filter(n => n.startsWith("uploads/public/")).length, 0);
});

test("the grant's rules: a CV's types, 10 MB, a signed ticket of the right kind", async () => {
  await assert.rejects(cv.publicGrant("image/gif", 100), { code: "cv_invalid" });
  await assert.rejects(cv.publicGrant("text/html", 100), { code: "cv_invalid" });
  // An old Word file: a recruiter's, never a visitor's (the Chest tells a
  // visitor's file by its bytes, and recognises no .doc).
  await assert.rejects(cv.publicGrant("application/msword", 100), { code: "cv_invalid" });
  assert.ok((await cv.grant("team", "application/msword", 100)).url);
  // A photo of a CV, as a phone takes it, is a CV.
  for (const type of ["image/jpeg", "image/png", "image/heic"]) assert.ok((await cv.publicGrant(type, 100)).url, type);
  await assert.rejects(cv.publicGrant("application/pdf", 11 << 20), { code: "cv_too_large" });
  await assert.rejects(cv.publicGrant("application/pdf", -1), { code: "cv_invalid" });
  const up = await cv.grant("team", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 100);
  assert.equal(up.url.includes("/_chest/files/upload/"), true);
  await assert.rejects(cv.accept(up.ticket.replace(/.$/u, c => (c === "A" ? "B" : "A")), "team", "x.docx"), { code: "cv_missing" });
  await assert.rejects(cv.accept("public.0123456789abcdef0123.pdf.1700000000000.x", "team", "x.pdf"), { code: "cv_missing" });
  // Nothing sent yet: missing.
  await assert.rejects(cv.accept(up.ticket, "team", "x.docx"), { code: "cv_missing" });
  // A Word file (a ZIP holding its parts) passes.
  await chest.upload(up.url, new TextEncoder().encode("PK\u0003\u0004[Content_Types].xml word/document.xml"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match((await cv.accept(up.ticket, "team", "../../etc/passwd")).fileName, /^\.\._\.\._etc_passwd$/u);
  const old = cv.readTicket(up.ticket, "team");
  assert.throws(() => cv.readTicket(up.ticket, "team", Date.now() + 3 * 3600 * 1000), { code: "cv_missing" });
  assert.match(old.name, /^uploads\/team\//u);
});

test("uploads never kept go after a day — a recruiter's and a visitor's (the Chest keeps a visitor's until the tool deletes it); files of the tool are removed by name only", async () => {
  const left = await visitorSends(pdf, "application/pdf");
  assert.equal(left.status, 201);
  const up = await cv.grant("team", "application/pdf", pdf.length);
  await chest.upload(up.url, pdf, "application/pdf");
  assert.equal(await cv.sweep(new Date()), 0);
  assert.equal(await cv.sweep(new Date(Date.now() + 2 * 86400000)), 2);
  assert.ok(!chest.files.has(left.claim));
  chest.files.set("reports/keep.pdf", { data: new TextEncoder().encode(pdf), type: "application/pdf", updated: new Date().toISOString() });
  await cv.remove(["reports/keep.pdf"]);
  assert.ok(chest.files.has("reports/keep.pdf"));
});

test("without files on the Chest (the capability not granted), the grant says so (the form asks for a link)", async () => {
  await chest.close();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications"] });
  await assert.rejects(cv.publicGrant("application/pdf", 100), { name: "CapabilityNotGranted" });
});
