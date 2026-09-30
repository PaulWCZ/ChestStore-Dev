import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { afterEach, beforeEach, mock, test } from "node:test";
import * as chest from "../src/chest.js";
import { mailPreferenceOf, member, readTimeZone } from "../src/member.js";
import * as members from "../src/members.js";
import { fakeChest, withMember } from "../src/testing.js";

// An assertion the Chest's front signed (chest/toolfront.Assertion, Go), for
// the tool "web", at 1790000000, with the instance key 00 01 … 1f: the
// derivation of the key and the encoding are the Chest's, not this test's.
const chestToken = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const signedByChest = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbiI6dHJ1ZSwiYXVkIjoid2ViIiwiYnVpbGRlciI6ZmFsc2UsImVtYWlsIjoiYWxpY2VAZXhhbXBsZS50ZXN0IiwiZXhwIjoxNzkwMDAwMDYwLCJmYW1pbHlfbmFtZSI6Ik1hcnRpbiIsImdpdmVuX25hbWUiOiJBbGljZSIsImdyb3VwcyI6WyJncnBfbjRyZHE3dzJ4a3o1bTNidmM2aHkydHBsNGUiXSwiaWF0IjoxNzkwMDAwMDAwLCJpc3MiOiJodHRwczovL3dlYi1jaGVzdC5hdGVsaWVyLmV4YW1wbGUiLCJuYW1lIjoiQWxpY2UgTWFydGluIiwicGljdHVyZSI6Ii9fY2hlc3QvbWVtYmVycy9tYnJfazJxaHg0bXpjN3YzYjZuZnA1cjJ0N3c0eWEvcGhvdG8_dj1hYmNkZWZnaCIsInJvbGUiOiJlZGl0b3IiLCJzdWIiOiJtYnJfazJxaHg0bXpjN3YzYjZuZnA1cjJ0N3c0eWEifQ.M7MUfaYRD9eiDlR45C7eTalqWncBQGsn0dQdPIAH5K4";
const signedAt = 1790000000;
const alice = { id: "mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya", firstName: "Alice", lastName: "Martin", name: "Alice Martin", photo: "/_chest/members/mbr_k2qhx4mzc7v3b6nfp5r2t7w4ya/photo?v=abcdefgh", role: "editor", isAdmin: true, isBuilder: false, groups: ["grp_n4rdq7w2xkz5m3bvc6hy2tpl4e"], locale: "en" as const, email: "alice@example.test" };
const bob = "mbr_bobaaaaaaaaaaaaaaaaaaaaaaa";

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
const keyOf = (token: string, label = "Chest-Member v2"): Buffer => createHmac("sha256", Buffer.from(token, "utf8")).update(label).digest();
// sign builds an assertion as the Chest does, with what a case changes.
function sign(claims: Record<string, unknown> = {}, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }, token = chestToken, label?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const body = encode(header) + "." + encode({ iss: "https://web-chest.atelier.example", aud: "web", iat: now, exp: now + 60, sub: bob, given_name: "Bob", family_name: "", name: "Bob", picture: "", role: "", admin: false, builder: false, groups: [], ...claims });
  return body + "." + createHmac("sha256", keyOf(token, label)).update(body).digest("base64url");
}
const web = (value?: string | string[]): Request => {
  const headers = new Headers();
  for (const item of value === undefined ? [] : [value].flat()) headers.append("Chest-Member", item);
  return new Request("https://web-chest.atelier.example/chest", { headers });
};
const node = (value?: string | string[]): IncomingMessage => {
  const request = new IncomingMessage(new Socket());
  if (value !== undefined) request.headers["chest-member"] = value;
  return request;
};

beforeEach(() => { process.env["CHEST_TOKEN"] = chestToken; process.env["CHEST_TOOL"] = "web"; });
afterEach(() => { mock.timers.reset(); delete process.env["CHEST_TOKEN"]; delete process.env["CHEST_TOOL"]; });

test("an assertion signed by the Chest reads as its member, on a Web Request and on a Node request", () => {
  mock.timers.enable({ apis: ["Date"], now: signedAt * 1000 });
  assert.deepEqual(member(web(signedByChest)), alice);
  assert.deepEqual(member(node(signedByChest)), alice);
  // Within the tolerated skew on both sides, not beyond.
  mock.timers.setTime((signedAt + 64) * 1000);
  assert.deepEqual(member(node(signedByChest)), alice);
  mock.timers.setTime((signedAt + 65) * 1000);
  assert.equal(member(node(signedByChest)), null);
  mock.timers.setTime((signedAt - 5) * 1000);
  assert.deepEqual(member(node(signedByChest)), alice);
  mock.timers.setTime((signedAt - 6) * 1000);
  assert.equal(member(node(signedByChest)), null);
});

test("photo and role are null when the Chest names none; the address is there only when the tool may read it", () => {
  assert.deepEqual(member(web(sign())), { id: bob, firstName: "Bob", lastName: "", name: "Bob", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], locale: "en" });
  assert.deepEqual(member(node(sign({ role: "reader", builder: true, email: "bob@example.test" }))), { id: bob, firstName: "Bob", lastName: "", name: "Bob", photo: null, role: "reader", isAdmin: false, isBuilder: true, groups: [], locale: "en", email: "bob@example.test" });
});

test("no assertion, or one that is not exactly a Chest-Member, is null — never an error", () => {
  const now = Math.floor(Date.now() / 1000);
  const [header = "", payload = "", signature = ""] = sign().split(".");
  const cases: Record<string, string | string[] | undefined> = {
    absent: undefined,
    empty: "",
    garbage: "not a token",
    "wrong key": sign({}, undefined, "B".repeat(43)),
    "alg none": encode({ alg: "none", typ: "JWT" }) + "." + payload + ".",
    "alg HS512": sign({}, { alg: "HS512", typ: "JWT" }),
    "typ missing": sign({}, { alg: "HS256" }),
    "typ other": sign({}, { alg: "HS256", typ: "at+jwt" }),
    "extra header": sign({}, { alg: "HS256", typ: "JWT", crit: ["exp"] }),
    expired: sign({ iat: now - 120, exp: now - 60 }),
    "issued in the future": sign({ iat: now + 30, exp: now + 90 }),
    "exp before iat": sign({ iat: now, exp: now - 1 }),
    "another tool": sign({ aud: "notes" }),
    "audience list": sign({ aud: ["web"] }),
    "no subject": sign({ sub: "" }),
    "a provider subject": sign({ sub: "0b0e6e8c-5a59-4f6e-9a39-0d4a8d2f7b11" }),
    "claim missing": sign({ groups: undefined }),
    "groups of another shape": sign({ groups: ["nord"] }),
    "groups not a list": sign({ groups: "grp_n4rdq7w2xkz5m3bvc6hy2tpl4e" }),
    "address of another type": sign({ email: 1 }),
    "signed for the former shape": sign({}, undefined, chestToken, "Chest-Member v1"),
    "claim of another type": sign({ admin: "true" }),
    "tampered payload": header + "." + encode({ ...JSON.parse(Buffer.from(payload, "base64url").toString()) as object, admin: true }) + "." + signature,
    "tampered signature": header + "." + payload + "." + signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA"),
    "repeated header": [sign(), sign()],
    "too long": sign({ name: "x".repeat(9000) }),
  };
  for (const [name, value] of Object.entries(cases)) {
    assert.equal(member(web(value)), null, "Web Request: " + name);
    assert.equal(member(node(value)), null, "Node request: " + name);
  }
});

test("without CHEST_TOKEN or CHEST_TOOL, nobody is a member", () => {
  const assertion = sign();
  assert.notEqual(member(web(assertion)), null);
  delete process.env["CHEST_TOOL"];
  assert.equal(member(web(assertion)), null);
  process.env["CHEST_TOOL"] = "web";
  delete process.env["CHEST_TOKEN"];
  assert.equal(member(node(assertion)), null);
  process.env["CHEST_TOKEN"] = "short";
  assert.equal(member(node(assertion)), null);
});

test("locale (proposal): the member's language among the store's, English when absent or not spoken", () => {
  assert.equal(member(web(sign({ locale: "fr" })))?.locale, "fr");
  assert.equal(member(web(sign({ locale: "fr-CA" })))?.locale, "fr");
  assert.equal(member(web(sign({ locale: "FR" })))?.locale, "fr");
  assert.equal(member(web(sign({ locale: "de" })))?.locale, "en");
  assert.equal(member(web(sign({ locale: "" })))?.locale, "en");
  assert.equal(member(web(sign()))?.locale, "en");
  // A claim of another type is not the Chest's.
  assert.equal(member(web(sign({ locale: 7 }))), null);
  assert.equal(member(web(sign({ locale: ["fr"] }))), null);
});

test("mailPreference (Proposal (studio.15)): one of all, digest, none; anything else is not said, and never refuses the member", () => {
  assert.deepEqual(["all", "digest", "none", "weekly", "", 1, undefined].map(mailPreferenceOf), ["all", "digest", "none", undefined, undefined, undefined, undefined]);
});

// Proposal (studio.16): Leave counts whole days and sends reminders in the
// member's own zone when they work away from the company's.
test("timeZone (studio.16): the member's own zone from the zoneinfo claim; one the runtime does not know is left out", () => {
  assert.equal(member(web(sign({ zoneinfo: "America/Montreal" })))?.timeZone, "America/Montreal");
  assert.equal(member(web(sign({})))?.timeZone, undefined);
  for (const zone of ["Mars/Olympus", "", "../etc/passwd", 7, "+01:00", "x".repeat(65)]) {
    const who = member(web(sign({ zoneinfo: zone })));
    assert.ok(who, "an odd zone never refuses the member");
    assert.equal(who.timeZone, undefined);
  }
  assert.deepEqual(["Europe/Paris", "UTC", "America/Argentina/Buenos_Aires", "Etc/GMT+5", "Nowhere/Land", null].map(readTimeZone), ["Europe/Paris", "UTC", "America/Argentina/Buenos_Aires", "Etc/GMT+5", undefined, undefined]);
});

test("timeZone (studio.16): chest.timeZone(member) is theirs, else the Chest's; lookup and the fake carry it", async () => {
  const base = { firstName: "Léa", lastName: "Roy", name: "Léa Roy", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [] };
  const lea = { ...base, id: "mbr_leaaaaaaaaaaaaaaaaaaaaaaaa", timeZone: "America/Montreal" };
  const hugo = { ...base, id: "mbr_hugoaaaaaaaaaaaaaaaaaaaaaa", name: "Hugo" };
  const fake = await fakeChest({ members: [lea, hugo], timeZone: "Europe/Paris" });
  try {
    const who = member(withMember(new Request("http://tool.test/chest"), lea));
    assert.equal(who?.timeZone, "America/Montreal");
    assert.equal(chest.timeZone(who), "America/Montreal");
    assert.equal(chest.timeZone(member(withMember(new Request("http://tool.test/chest"), hugo))), "Europe/Paris");
    assert.equal(chest.timeZone(), "Europe/Paris");
    assert.equal(chest.timeZone(null), "Europe/Paris");
    assert.equal(chest.timeZone({ timeZone: "Mars/Olympus" }), "Europe/Paris");
    // 03:30 UTC on 1 October is still 30 September in Montreal.
    const at = Date.parse("2026-10-01T03:30:00Z");
    assert.equal(chest.today(at, chest.timeZone(who)), "2026-09-30");
    assert.equal(chest.today(at, chest.timeZone(null)), "2026-10-01");
    const found = await members.lookup([lea.id, hugo.id]);
    assert.deepEqual(found.members.map(m => [m.id, m.timeZone]), [[lea.id, "America/Montreal"], [hugo.id, undefined]]);
  } finally {
    await fake.close();
  }
});
