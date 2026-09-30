import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted, ChestError, QuotaExceeded, TooLarge } from "../src/errors.js";
import * as files from "../src/files.js";
import type { Member } from "../src/member.js";
import * as members from "../src/members.js";
import { fakeChest } from "../src/testing.js";

// The studio's proposals in the fake Chest (not in 0.3.0): its front
// (uploads, links, photos, for a harness's origin), public uploads and
// public files, members.matchEmails. Ported from 0.3.0-studio.16's
// testing.test.ts, whose official part is now 0.3.0's own.

const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
const nord = "grp_nordaaaaaaaaaaaaaaaaaaaaaa";
const camille: Member = { id: id("camille"), firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "editor", isAdmin: false, isBuilder: false, groups: [nord], language: "fr", timeZone: "Europe/Paris", email: "camille@example.test" };
const emile: Member = { id: id("emile"), firstName: "Émile", lastName: "Durand", name: "Émile Durand", photo: null, role: "reader", isAdmin: true, isBuilder: false, groups: [], language: "en", timeZone: "America/New_York" };
const zoe: Member = { id: id("zoe"), firstName: "Zoé", lastName: "Petit", name: "Zoé Petit", photo: null, role: "reader", isAdmin: false, isBuilder: true, groups: [], language: "en", timeZone: "UTC" };

test("its front receives a member's upload once, within its bounds, and serves links and photos (origin for a harness)", async () => {
  const chest = await fakeChest({ members: [camille], origin: "http://localhost:4000" });
  try {
    const up = await files.uploadUrl("photos/", { maxSize: 8, types: ["image/*"] });
    assert.match(up.url, /^http:\/\/localhost:4000\/_chest\/files\/upload\/[A-Za-z0-9_-]+\.up$/u);
    assert.equal((await chest.upload(up.url, "not an image", "text/plain")).status, 415);
    // A token serves once, even refused.
    assert.equal((await chest.upload(up.url, "x", "image/png")).status, 403);
    const again = await files.uploadUrl("photos/", { maxSize: 8, types: ["image/*"] });
    assert.equal((await chest.upload(again.url, "123456789", "image/png")).status, 413);
    const third = await files.uploadUrl("photos/", { maxSize: 8, types: ["image/*"] });
    const sent = await chest.upload(third.url, "1234", "image/png");
    assert.equal(sent.status, 201);
    const { name, size } = await sent.json() as { name: string; size: number };
    assert.match(name, /^photos\/[0-9a-f]{20}\.png$/u);
    assert.equal(size, 4);
    assert.equal((await files.stat(name))?.type, "image/png");
    const link = await files.url(name);
    assert.match(link.url, /^http:\/\/localhost:4000\/_chest\/files\//u);
    const served = await fetch(chest.api + new URL(link.url).pathname);
    assert.equal(await served.text(), "1234");
    const photo = await fetch(chest.api + "/_chest/members/" + camille.id + "/photo");
    assert.equal(photo.headers.get("content-type"), "image/svg+xml");
    assert.match(await photo.text(), />CM</u);
  } finally {
    await chest.close();
  }
});

test("public uploads (proposal): a visitor sends to the public host, 10 MiB at most, under uploads/public/; public files are served", async () => {
  const chest = await fakeChest({ members: [camille], origin: "http://localhost:4000", storage: { publicUploads: true, publicFiles: true } });
  try {
    await assert.rejects(files.uploadUrl("cv/", { public: true }), (e: unknown) => e instanceof ChestError && e.code === "invalid_name");
    await assert.rejects(files.uploadUrl("uploads/public/", { public: true, maxSize: 11 << 20 }), TooLarge);
    const up = await files.uploadUrl("uploads/public/", { public: true, types: ["application/pdf"] });
    assert.match(up.url, /^http:\/\/localhost:4000\/_chest\/upload\/[A-Za-z0-9_-]+\.up$/u);
    // A public token does not work on the team host's route.
    assert.equal((await chest.upload(up.url.replace("/_chest/upload/", "/_chest/files/upload/"), "%PDF", "application/pdf")).status, 403);
    const again = await files.uploadUrl("uploads/public/", { public: true, types: ["application/pdf"] });
    const sent = await chest.upload(again.url, "%PDF-1.7", "application/pdf");
    assert.equal(sent.status, 201);
    // The visitor gets a claim, never the object's name; the tool trades it once.
    const answer = (await sent.json()) as { name?: string; claim: string; size: number };
    assert.equal(answer.name, undefined);
    assert.equal(answer.size, 8);
    const claimed = await files.claim(answer.claim);
    assert.match(claimed.name, /^uploads\/public\/[0-9a-f]{20}\.pdf$/u);
    await assert.rejects(files.claim(answer.claim), (e: unknown) => e instanceof ChestError && e.code === "not_found");
    await assert.rejects(files.claim("guessed" + "x".repeat(20) + ".claim"), (e: unknown) => e instanceof ChestError && e.code === "not_found");
    // Unclaimed within its time, the Chest deletes it by itself.
    await assert.rejects(files.uploadUrl("uploads/public/", { public: true, expiresUnclaimedAfter: 5 }), (e: unknown) => e instanceof ChestError);
    const short = await files.uploadUrl("uploads/public/", { public: true, expiresUnclaimedAfter: 60 });
    const left = (await (await chest.upload(short.url, "%PDF-1.7", "application/pdf")).json()) as { claim: string };
    assert.ok(left.claim);
    await files.put("public/logo.svg", "<svg/>", "image/svg+xml");
    assert.equal(files.publicUrl("public/logo.svg", { version: "3" }), "/_chest/public/logo.svg?v=3");
    assert.throws(() => files.publicUrl("private/logo.svg"), (e: unknown) => e instanceof ChestError && e.code === "invalid_name");
    const served = await fetch(chest.api + "/_chest/public/logo.svg");
    assert.equal(served.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(await served.text(), "<svg/>");
  } finally {
    await chest.close();
  }
  const closed = await fakeChest({ members: [camille] });
  try {
    await assert.rejects(files.uploadUrl("uploads/public/", { public: true }), CapabilityNotGranted);
  } finally {
    await closed.close();
  }
});

// Proposal (studio.15): Equipment matches Intune's users to members without
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
