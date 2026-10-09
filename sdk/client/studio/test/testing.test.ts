import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted, ChestError, QuotaExceeded, TooLarge } from "../../src/errors.js";
import * as files from "../files.js";
import type { Member } from "../member.js";
import * as members from "../members.js";
import { fakeChest } from "../testing.js";

// The studio's fake Chest on 0.4.1's: 0.4.1's front through the studio's
// server, the members' photos, public uploads and public files,
// members.matchEmails and members.leftAt.

const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
const nord = "grp_nordaaaaaaaaaaaaaaaaaaaaaa";
const camille: Member = { id: id("camille"), firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "editor", isAdmin: false, isBuilder: false, groups: [nord], language: "fr", timeZone: "Europe/Paris", email: "camille@example.test" };
const emile: Member = { id: id("emile"), firstName: "Émile", lastName: "Durand", name: "Émile Durand", photo: null, role: "reader", isAdmin: true, isBuilder: false, groups: [], language: "en", timeZone: "America/New_York" };
// The first bytes of a PNG, as 0.4.1's fake checks them.
const png = Buffer.from("\x89PNG\r\n\x1a\n0000", "latin1");
const zoe: Member = { id: id("zoe"), firstName: "Zoé", lastName: "Petit", name: "Zoé Petit", photo: null, role: "reader", isAdmin: false, isBuilder: true, groups: [], language: "en", timeZone: "UTC" };

test("0.4.1's front answers through the studio's: uploads and links on the fake's own origin, and the members' photos", async () => {
  const chest = await fakeChest({ members: [camille] });
  try {
    assert.equal(process.env["CHEST_API"], chest.api, "CHEST_API is the studio's server");
    const up = await files.uploadUrl("photos/", { maxSize: 16, types: ["image/*"] });
    assert.ok(up.url.startsWith(chest.api + "/_chest/files/upload/"), "0.4.1's upload, signed for the fake's address");
    assert.equal((await chest.upload(up.url, "not an image", "text/plain")).status, 415);
    // A token serves once, even refused.
    assert.equal((await chest.upload(up.url, png, "image/png")).status, 403);
    const again = await files.uploadUrl("photos/", { maxSize: 16, types: ["image/*"] });
    assert.equal((await chest.upload(again.url, "123456789", "image/png")).status, 400, "0.4.1 sniffs the content: type_mismatch");
    const third = await files.uploadUrl("photos/", { maxSize: 16, types: ["image/*"] });
    const sent = await chest.upload(third.url, png, "image/png");
    assert.equal(sent.status, 201);
    const { name, size } = await sent.json() as { name: string; size: number };
    assert.match(name, /^photos\/[0-9a-f]{20}\.png$/u);
    assert.equal(size, png.length);
    const stat = await files.stat(name);
    assert.equal(stat?.type, "image/png");
    assert.match(stat?.sha256 ?? "", /^[0-9a-f]{64}$/u, "0.4.1's FileObject.sha256");
    const link = await files.url(name);
    assert.ok(link.url.startsWith(chest.api + "/_chest/files/"));
    const served = await fetch(link.url);
    assert.equal(Buffer.from(await served.arrayBuffer()).toString("latin1"), png.toString("latin1"));
    const photo = await fetch(chest.api + "/_chest/members/" + camille.id + "/photo");
    assert.equal(photo.headers.get("content-type"), "image/svg+xml");
    assert.match(await photo.text(), />CM</u);
  } finally {
    await chest.close();
  }
});

test("public uploads (proposal): a visitor sends to the public host, 10 MiB at most, under uploads/public/; public files are served", async () => {
  const chest = await fakeChest({ members: [camille], storage: { publicUploads: true, publicFiles: true } });
  try {
    await assert.rejects(files.publicUploadUrl("cv/"), (e: unknown) => e instanceof ChestError && e.code === "invalid_name");
    await assert.rejects(files.publicUploadUrl("uploads/public/", { maxSize: 11 << 20 }), TooLarge);
    const up = await files.publicUploadUrl("uploads/public/", { types: ["application/pdf"] });
    // A path: the browser sends to the host its page is on (the company's
    // own domain once connected), never another (connect-src 'self').
    assert.match(up.url, /^\/_chest\/upload\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    // A public token does not work on the team host's route.
    assert.equal((await chest.upload(chest.api + up.url.replace("/_chest/upload/", "/_chest/files/upload/"), "%PDF", "application/pdf")).status, 403);
    const again = await files.publicUploadUrl("uploads/public/", { types: ["application/pdf"] });
    assert.equal((await chest.upload(again.url, "not a pdf", "application/pdf")).status, 400, "the content checked as 0.4.1's uploads are");
    const third = await files.publicUploadUrl("uploads/public/", { types: ["application/pdf"] });
    const sent = await chest.upload(third.url, "%PDF-1.7", "application/pdf");
    assert.equal(sent.status, 201);
    // The visitor gets a claim, never the object's name; the tool trades it once.
    const answer = (await sent.json()) as { name?: string; claim: string; size: number };
    assert.equal(answer.name, undefined);
    assert.equal(answer.size, 8);
    const claimed = await files.claim(answer.claim);
    assert.match(claimed.name, /^uploads\/public\/[0-9a-f]{20}\.pdf$/u);
    assert.match(claimed.sha256, /^[0-9a-f]{64}$/u);
    await assert.rejects(files.claim(answer.claim), (e: unknown) => e instanceof ChestError && e.code === "not_found");
    await assert.rejects(files.claim("guessed" + "x".repeat(20) + ".claim"), (e: unknown) => e instanceof ChestError && e.code === "not_found");
    // Unclaimed within its time, the Chest deletes it by itself.
    await assert.rejects(files.publicUploadUrl("uploads/public/", { expiresUnclaimedAfter: 5 }), (e: unknown) => e instanceof ChestError);
    const short = await files.publicUploadUrl("uploads/public/", { expiresUnclaimedAfter: 60 });
    const left = (await (await chest.upload(short.url, "%PDF-1.7", "application/pdf")).json()) as { claim: string };
    assert.ok(left.claim);
    await files.put("public/logo.svg", "<svg/>", "image/svg+xml");
    assert.equal(files.publicPath("public/logo.svg", { version: "3" }), "/_chest/public/logo.svg?v=3");
    assert.throws(() => files.publicPath("private/logo.svg"), (e: unknown) => e instanceof ChestError && e.code === "invalid_name");
    const served = await fetch(chest.api + "/_chest/public/logo.svg");
    assert.equal(served.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(await served.text(), "<svg/>");
  } finally {
    await chest.close();
  }
  const closed = await fakeChest({ members: [camille] });
  try {
    await assert.rejects(files.publicUploadUrl("uploads/public/"), CapabilityNotGranted);
  } finally {
    await closed.close();
  }
});

test("members.leftAt (proposal): when former members left, kept after an erasure; lookup answers the studio's former as 0.4.1's", async () => {
  const left = "2026-09-30T16:00:00Z";
  const chest = await fakeChest({ members: [camille], former: [{ id: id("dan"), name: "Dan Roy", leftAt: left }, { id: id("eve"), status: "erased", leftAt: left }, { id: id("fay"), name: "Fay", status: "no_access" }, { id: id("gus"), name: "Gus" }], capabilities: ["members"] });
  try {
    const found = await members.lookup([camille.id, id("dan"), id("eve"), id("fay"), id("gus"), id("hal")]);
    assert.deepEqual(found.former, [{ id: id("dan"), name: "Dan Roy", status: "former" }, { id: id("eve"), name: null, status: "erased" }, { id: id("fay"), name: "Fay", status: "no_access" }, { id: id("gus"), name: "Gus", status: "former" }]);
    assert.deepEqual(found.unknown, [id("hal")]);
    const when = await members.leftAt([camille.id, id("dan"), id("eve"), id("fay"), id("gus"), id("hal")]);
    assert.deepEqual([...when], [[id("dan"), "2026-09-30T16:00:00.000Z"], [id("eve"), "2026-09-30T16:00:00.000Z"]]);
    // Someone a test removes after the start: as a real Chest moves them.
    chest.members.splice(0, 1);
    chest.former.push({ id: camille.id, name: camille.name, leftAt: "2026-10-01T08:00:00Z" });
    chest.clearCaches();
    assert.deepEqual((await members.lookup([camille.id])).former, [{ id: camille.id, name: camille.name, status: "former" }]);
    assert.equal((await members.leftAt([camille.id])).get(camille.id), "2026-10-01T08:00:00.000Z");
    await assert.rejects(members.leftAt(["x"]), (e: unknown) => e instanceof ChestError && e.code === "invalid_id");
    assert.equal((await members.leftAt(Array.from({ length: 450 }, (_, n) => "mbr_" + n.toString(32).replace(/[0189]/gu, c => "wxyz"["0189".indexOf(c)]!).padStart(26, "a")))).size, 0, "any number: 200 a call");
  } finally {
    await chest.close();
  }
});

// Proposal (0.3.0-studio.15): Equipment matches Intune's users to members without
// reading every member's address.
test("members.matchEmails: addresses → member ids, only for members who have the tool, without members.email", async () => {
  const lea: Member = { ...zoe, id: id("lea"), firstName: "Léa", name: "Léa Petit", email: "Lea.Petit@Example.test" };
  const chest = await fakeChest({ members: [camille, lea, emile], former: [{ id: id("dan"), name: "Dan" }], capabilities: ["members"] });
  try {
    const found = await members.matchEmails([" camille@EXAMPLE.test", "lea.petit@example.test", "Lea.Petit@example.test", "dan@example.test", "nobody@example.test", "not an address", ""]);
    // Each address as given; the case and spaces around do not matter.
    assert.deepEqual(found, { " camille@EXAMPLE.test": camille.id, "lea.petit@example.test": lea.id, "Lea.Petit@example.test": lea.id });
    // The tool learnt ids, not addresses: members.* still hide them.
    assert.equal((await members.get(lea.id))?.email, undefined);
    assert.deepEqual(await members.matchEmails([]), {});
    // Any number: 200 a call.
    const many = Array.from({ length: 450 }, (_, n) => `guess${n}@example.test`).concat("camille@example.test");
    assert.deepEqual(await members.matchEmails(many), { "camille@example.test": camille.id });
    // 5,000 distinct addresses a day: the same ones again are free, new ones beyond are refused.
    await members.matchEmails(Array.from({ length: 4546 }, (_, n) => `more${n}@example.test`));
    assert.deepEqual(await members.matchEmails(["camille@example.test", "guess1@example.test"]), { "camille@example.test": camille.id });
    await assert.rejects(members.matchEmails(["one-more@example.test"]), QuotaExceeded);
    await assert.rejects(members.matchEmails([42 as unknown as string]), (e: unknown) => e instanceof ChestError && e.code === "invalid_query");
  } finally {
    await chest.close();
  }
  const bare = await fakeChest({ capabilities: [] });
  try {
    await assert.rejects(members.matchEmails(["a@example.test"]), CapabilityNotGranted);
  } finally {
    await bare.close();
  }
});
