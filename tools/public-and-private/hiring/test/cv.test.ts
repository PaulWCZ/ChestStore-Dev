import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as cv from "../src/lib/cv.ts";
import { everyone } from "./support/members.ts";

// CVs: a visitor's through the public uploads proposal (a path, a claim),
// a recruiter's with the tool's signed ticket; the tool checks each file
// before keeping it.
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"], storage: { publicUploads: true } });
});
after(async () => {
  await chest.close();
});

const pdf = "%PDF-1.4\n%%EOF\n";

// A visitor's upload as their browser sends it: a path on the host the
// page is on, the Chest's answer a claim (never the object's name).
async function visitorSends(content: string | Uint8Array, type: string): Promise<{ status: number; claim: string }> {
  const up = await cv.publicGrant(type, typeof content === "string" ? content.length : content.byteLength);
  assert.match(up.url, /^\/_chest\/upload\/[^/]+$/u, "a path: the company's own domain works too");
  const sent = await chest.upload(up.url, content, type);
  const body = (await sent.json().catch(() => ({}))) as { claim?: string };
  return { status: sent.status, claim: body.claim ?? "" };
}

test("a visitor's PDF: granted as a path, sent, claimed once, checked, moved to cv/", async () => {
  const sent = await visitorSends(pdf, "application/pdf");
  assert.equal(sent.status, 201);
  assert.match(sent.claim, cv.claimPattern);
  const kept = await cv.take(sent.claim, "Lucie CV.pdf");
  assert.match(kept.object, /^cv\/[0-9a-f]{20}\.pdf$/u);
  assert.deepEqual([kept.fileName, kept.type, kept.size], ["Lucie CV.pdf", "application/pdf", pdf.length]);
  assert.ok(chest.files.has(kept.object));
  assert.equal([...chest.files.keys()].filter(n => n.startsWith("uploads/")).length, 0);
  // A claim serves once; a made-up one names nothing.
  await assert.rejects(cv.take(sent.claim, "again.pdf"), { code: "cv_missing" });
  await assert.rejects(cv.take("x".repeat(20) + ".claim", "x.pdf"), { code: "cv_missing" });
  await assert.rejects(cv.take("uploads/public/abc.pdf", "x.pdf"), { code: "cv_missing" });
});

test("a file that says PDF but is not one is refused at the Chest's door", async () => {
  const sent = await visitorSends("MZ this is a program", "application/pdf");
  assert.equal(sent.status, 400);
  assert.equal([...chest.files.keys()].filter(n => n.startsWith("uploads/public/")).length, 0);
});

test("the grant's rules: a CV's types, 10 MB, a signed ticket of the right kind", async () => {
  await assert.rejects(cv.publicGrant("image/gif", 100), { code: "cv_invalid" });
  await assert.rejects(cv.publicGrant("text/html", 100), { code: "cv_invalid" });
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
  // A Word file with its ZIP signature passes.
  await chest.upload(up.url, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match((await cv.accept(up.ticket, "team", "../../etc/passwd")).fileName, /^\.\._\.\._etc_passwd$/u);
  const old = cv.readTicket(up.ticket, "team");
  assert.throws(() => cv.readTicket(up.ticket, "team", Date.now() + 3 * 3600 * 1000), { code: "cv_missing" });
  assert.match(old.name, /^uploads\/team\//u);
});

test("a recruiter's uploads never kept go after a day; files of the tool are removed by name only", async () => {
  const up = await cv.grant("team", "application/pdf", pdf.length);
  await chest.upload(up.url, pdf, "application/pdf");
  assert.equal(await cv.sweep(new Date()), 0);
  assert.equal(await cv.sweep(new Date(Date.now() + 2 * 86400000)), 1);
  chest.files.set("reports/keep.pdf", { data: new TextEncoder().encode(pdf), type: "application/pdf", updated: new Date().toISOString() });
  await cv.remove(["reports/keep.pdf"]);
  assert.ok(chest.files.has("reports/keep.pdf"));
});

test("without public uploads on the Chest, the grant says so (the form asks for a link)", async () => {
  await chest.close();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  await assert.rejects(cv.publicGrant("application/pdf", 100), { name: "CapabilityNotGranted" });
});
