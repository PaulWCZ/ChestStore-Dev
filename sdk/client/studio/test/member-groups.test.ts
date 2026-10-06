import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Socket } from "node:net";
import { mock, test } from "node:test";
import { Unavailable } from "../../src/errors.js";
import { member as officialMember, type Member } from "../../src/member.js";
import * as officialMembers from "../../src/members.js";
import { maxAssertionLength, member } from "../member.js";
import * as members from "../members.js";
import { fakeChest, withMember } from "../testing.js";

// studio.7: the studio's member() and members.* read a member in any number
// of groups and a group of any size (0.4.1's parsers refuse 16 groups a
// member, 16 groups in groups.list() and 128 members a group), and read
// everything else exactly as 0.4.1's.

// Identifiers of the Chest's grammar for the i-th member or group.
const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
const base32 = (i: number) => {
  let out = "";
  do {
    out = alphabet[i % 32]! + out;
    i = Math.floor(i / 32);
  } while (i > 0);
  return out.padStart(26, "a");
};
const gidOf = (i: number) => "grp_" + base32(i);
const midOf = (i: number) => "mbr_" + base32(i);
const groupsOf = (n: number) => Array.from({ length: n }, (_, i) => gidOf(i));
const person = (i: number, groups: string[]): Member => ({ id: midOf(i), firstName: `Person ${String(i).padStart(4, "0")}`, lastName: "Test", name: `Person ${String(i).padStart(4, "0")} Test`, photo: null, role: null, isAdmin: false, isBuilder: false, groups, language: "en", timeZone: "Europe/Paris" });
const request = () => new Request("http://tool.test/chest");

test("a member in 40 groups signs in, and the members API carries their 40 groups (with \"members.groups\")", async () => {
  const lea = person(1, groupsOf(40));
  const groups = groupsOf(40).map((id, i) => ({ id, name: `Team ${i}`, members: [lea.id], grants: false }));
  const chest = await fakeChest({ members: [lea, person(2, [])], groups, capabilities: ["members", "members.groups"] });
  try {
    const signed = member(withMember(request(), lea));
    assert.ok(signed, "member() is not null: no \"Sign in\" for a signed-in member");
    assert.deepEqual(signed.groups, groupsOf(40));
    assert.equal(officialMember(withMember(request(), lea)), null, "0.4.1's member() refuses them: the lockout studio.7 removes");
    assert.deepEqual((await members.get(lea.id))?.groups, groupsOf(40));
    assert.deepEqual((await members.list()).members.find(m => m.id === lea.id)?.groups, groupsOf(40));
    assert.deepEqual((await members.lookup([lea.id])).members[0]?.groups, groupsOf(40));
    assert.deepEqual(await members.get(lea.id), signed, "the assertion and the members API agree");
    await assert.rejects(officialMembers.get(lea.id), Unavailable, "0.4.1's reader refuses the answer");
  } finally {
    await chest.close();
  }
});

test("without \"members.groups\", a member given the tool by 20 groups signs in too (the contract caps neither)", async () => {
  const hugo = person(3, groupsOf(20));
  const groups = groupsOf(20).map((id, i) => ({ id, name: `Granting ${i}`, members: [hugo.id] }));
  const chest = await fakeChest({ members: [hugo], groups, capabilities: ["members"] });
  try {
    assert.deepEqual(member(withMember(request(), hugo))?.groups, groupsOf(20));
    assert.equal((await members.groups.list()).length, 20, "groups.list(): more than 16 groups");
    await assert.rejects(officialMembers.groups.list(), Unavailable);
  } finally {
    await chest.close();
  }
});

test("a group of 1,000 members: groups.list() carries all of them, members.list({group}) pages through them", async () => {
  const people = Array.from({ length: 1000 }, (_, i) => person(i, [gidOf(0)]));
  const everyone = { id: gidOf(0), name: "Everyone", members: people.map(p => p.id) };
  const chest = await fakeChest({ members: [...people, person(5000, [])], groups: [everyone], capabilities: ["members", "members.groups"] });
  try {
    const [group] = await members.groups.list();
    assert.equal(group?.members.length, 1000);
    await assert.rejects(officialMembers.groups.list(), Unavailable, "0.4.1's reader refuses a group of more than 128 members");
    const seen: string[] = [];
    let after: string | undefined, pages = 0;
    do {
      const page = await members.list({ group: everyone.id, limit: 500, ...(after ? { after } : {}) });
      seen.push(...page.members.map(m => m.id));
      after = page.next ?? undefined;
      pages++;
    } while (after);
    assert.equal(pages, 2);
    assert.deepEqual(new Set(seen), new Set(everyone.members));
    let byDefault = 0;
    after = undefined;
    do {
      const page = await members.list({ group: everyone.id, ...(after ? { after } : {}) });
      assert.ok(page.members.length <= 100);
      byDefault += page.members.length;
      after = page.next ?? undefined;
    } while (after);
    assert.equal(byDefault, 1000, "100 a page by default");
  } finally {
    await chest.close();
  }
});

// ---- The assertion read as 0.4.1 reads it, but for the count of groups ----

// The Chest's vector of 0.4.1's own test (client/test/member.test.ts):
// signed by chest/toolfront.Assertion (Go) for the tool "web".
const chestToken = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const signedByChest = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbiI6dHJ1ZSwiYXVkIjoid2ViIiwiYnVpbGRlciI6ZmFsc2UsImVtYWlsIjoiYWxpY2VAZXhhbXBsZS50ZXN0IiwiZXhwIjoxNzkwMDAwMDYwLCJmYW1pbHlfbmFtZSI6Ik1hcnRpbiIsImdpdmVuX25hbWUiOiJBbGljZSIsImdyb3VwcyI6WyJncnBfbjRyZHE3dzJ4a3o1bTNidmM2aHkydHBsNGUiXSwiaWF0IjoxNzkwMDAwMDAwLCJpc3MiOiJodHRwczovL3dlYi1jaGVzdC5hdGVsaWVyLmV4YW1wbGUiLCJsYW5ndWFnZSI6ImZyIiwibmFtZSI6IkFsaWNlIE1hcnRpbiIsInBpY3R1cmUiOiIvX2NoZXN0L21lbWJlcnMvbWJyX2sycWh4NG16Yzd2M2I2bmZwNXIydDd3NHlhL3Bob3RvP3Y9YWJjZGVmZ2giLCJyb2xlIjoiZWRpdG9yIiwic3ViIjoibWJyX2sycWh4NG16Yzd2M2I2bmZwNXIydDd3NHlhIiwidGltZV96b25lIjoiRXVyb3BlL1BhcmlzIn0.Gn-eYBi3X4qkdZeL0IOT8p7QYUAURLZxeTh7UeUQrQI";
const signedAt = 1790000000;
const bob = "mbr_bobaaaaaaaaaaaaaaaaaaaaaaa";
const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
const keyOf = (token: string, label = "Chest-Member v2"): Buffer => createHmac("sha256", Buffer.from(token, "utf8")).update(label).digest();
function sign(claims: Record<string, unknown> = {}, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }, token = chestToken, label?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const body = encode(header) + "." + encode({ iss: "https://web-chest.atelier.example", aud: "web", iat: now, exp: now + 60, sub: bob, given_name: "Bob", family_name: "", name: "Bob", picture: "", role: "", admin: false, builder: false, groups: [], language: "en", time_zone: "America/New_York", ...claims });
  return body + "." + createHmac("sha256", keyOf(token, label)).update(body).digest("base64url");
}
const web = (value?: string | string[]): Request => {
  const headers = new Headers();
  for (const item of value === undefined ? [] : [value].flat()) headers.append("Chest-Member", item);
  return new Request("https://web-chest.atelier.example/chest", { headers });
};
const node = (value?: string | string[]): IncomingMessage => {
  const r = new IncomingMessage(new Socket());
  if (value !== undefined) r.headers["chest-member"] = value;
  return r;
};
function withEnvironment(run: () => void): void {
  const saved = { token: process.env["CHEST_TOKEN"], tool: process.env["CHEST_TOOL"] };
  process.env["CHEST_TOKEN"] = chestToken;
  process.env["CHEST_TOOL"] = "web";
  try {
    run();
  } finally {
    mock.timers.reset();
    if (saved.token === undefined) delete process.env["CHEST_TOKEN"];
    else process.env["CHEST_TOKEN"] = saved.token;
    if (saved.tool === undefined) delete process.env["CHEST_TOOL"];
    else process.env["CHEST_TOOL"] = saved.tool;
  }
}

test("the Chest's own vector reads the same through the studio's member() and 0.4.1's", () => {
  withEnvironment(() => {
    mock.timers.enable({ apis: ["Date"], now: signedAt * 1000 });
    const official = officialMember(web(signedByChest));
    assert.ok(official);
    assert.deepEqual(member(web(signedByChest)), official);
    assert.deepEqual(member(node(signedByChest)), official);
    for (const at of [signedAt + 64, signedAt + 65, signedAt - 5, signedAt - 6]) {
      mock.timers.setTime(at * 1000);
      assert.deepEqual(member(node(signedByChest)), officialMember(node(signedByChest)), `at ${at}`);
    }
  });
});

test("malformed assertions are still refused, as 0.4.1 refuses them — with 40 groups too", () => {
  withEnvironment(() => {
    const forty = groupsOf(40);
    const refused: [string, string | string[] | undefined][] = [
      ["absent", undefined],
      ["not compact", "abc"],
      ["a group not of the Chest's grammar", sign({ groups: [...forty, "grp_TOO_SHORT"] })],
      ["a member id as a group", sign({ groups: [...forty, bob] })],
      ["a number as a group", sign({ groups: [...forty, 7] })],
      ["groups not a list", sign({ groups: forty.join(",") })],
      ["groups missing", sign({ groups: undefined })],
      ["another tool", sign({ aud: "other", groups: forty })],
      ["expired", sign({ iat: 1000, exp: 1060, groups: forty })],
      ["exp before iat", sign({ exp: Math.floor(Date.now() / 1000) - 1, groups: forty })],
      ["not a member id", sign({ sub: "usr_1", groups: forty })],
      ["a language that is not a primary tag", sign({ language: "fr-FR", groups: forty })],
      ["a zone that is not one", sign({ time_zone: "Paris", groups: forty })],
      ["email not a string", sign({ email: 7, groups: forty })],
      ["another key", sign({ groups: forty }, undefined, "B".repeat(43))],
      ["another shape's label", sign({ groups: forty }, undefined, chestToken, "Chest-Member v1")],
      ["another algorithm", sign({ groups: forty }, { alg: "none", typ: "JWT" })],
      ["a header with more", sign({ groups: forty }, { alg: "HS256", typ: "JWT", kid: "1" })],
      ["a tampered payload", (() => { const [h, , s] = sign({ groups: forty }).split("."); return [h, encode({ sub: bob, groups: forty }), s].join("."); })()],
      ["repeated", [sign({ groups: forty }), sign({ groups: forty })]],
    ];
    for (const [why, value] of refused) {
      assert.equal(member(web(value)), null, `web: ${why}`);
      assert.equal(member(node(value)), null, `node: ${why}`);
    }
    // The same assertions with 16 groups or fewer read alike, member by member.
    for (const claims of [{}, { groups: groupsOf(16) }, { role: "reader", builder: true, email: "bob@example.test" }, { picture: "/_chest/members/x/photo?v=1", admin: true }]) {
      const value = sign(claims);
      assert.ok(member(node(value)));
      assert.deepEqual(member(node(value)), officialMember(node(value)));
    }
    // CHEST_TOKEN missing: nobody.
    const value = sign({ groups: forty });
    assert.ok(member(node(value)));
    delete process.env["CHEST_TOKEN"];
    assert.equal(member(node(value)), null);
  });
});

test("the assertion is bounded by size: up to maxAssertionLength (about 300 groups), a longer one — 1 MiB — refused without throwing", () => {
  withEnvironment(() => {
    assert.equal(maxAssertionLength, 16384, "a Node server's default for all headers (http.maxHeaderSize)");
    const fits = sign({ groups: groupsOf(300) });
    assert.ok(fits.length > 8192 && fits.length <= maxAssertionLength, `300 groups: ${fits.length} characters`);
    assert.equal(member(web(fits))?.groups.length, 300);
    assert.equal(member(node(fits))?.groups.length, 300);
    const over = sign({ groups: groupsOf(400) });
    assert.ok(over.length > maxAssertionLength);
    assert.equal(member(web(over)), null, "beyond maxAssertionLength: refused, though signed");
    assert.equal(member(node(over)), null);
    const huge = sign({ groups: groupsOf(25_000) });
    assert.ok(huge.length > 1 << 20);
    assert.equal(member(web(huge)), null);
    assert.equal(member(node(huge)), null);
    assert.equal(member(node("a".repeat(1 << 20) + ".b.c")), null);
  });
});

// ---- The members API read as 0.4.1 reads it, but for the counts ----

// A Chest's API that answers what a test says, to compare the two readers.
async function answering(answers: Record<string, unknown>, run: () => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0]!;
    const body = Object.hasOwn(answers, path) ? answers[path] : { error: "not_found" };
    req.resume();
    res.writeHead(Object.hasOwn(answers, path) ? 200 : 404, { "Content-Type": "application/json" }).end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const saved = process.env["CHEST_API"];
  process.env["CHEST_API"] = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  try {
    members.forget();
    await run();
  } finally {
    members.forget();
    if (saved === undefined) delete process.env["CHEST_API"];
    else process.env["CHEST_API"] = saved;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

const wire = (i: number, groups: unknown) => ({ id: midOf(i), first_name: "A", last_name: "B", name: "A B", photo: null, role: null, admin: false, builder: false, groups, language: "en", time_zone: "UTC" });

test("members.*: answers 0.4.1 reads read the same; malformed ones are still Unavailable, whatever the count", async () => {
  const one = midOf(1);
  // Read alike.
  const good = { "/members": { members: [wire(1, groupsOf(3))], next: null }, ["/members/" + one]: wire(1, groupsOf(16)), "/members/lookup": { members: [wire(1, [])], former: [], unknown: [] }, "/groups": { groups: [{ id: gidOf(0), name: "Sales", members: [one] }] } };
  await answering(good, async () => {
    assert.deepEqual(await members.list(), await officialMembers.list());
    assert.deepEqual(await members.get(one), await officialMembers.get(one));
    assert.deepEqual(await members.lookup([one]), await officialMembers.lookup([one]));
    assert.deepEqual(await members.groups.list(), await officialMembers.groups.list());
    assert.equal(await members.get(midOf(2)), null, "404: null, as 0.4.1's");
  });
  // Refused alike, with many groups or few.
  const bad: [string, Record<string, unknown>, () => Promise<unknown>][] = [
    ["a group not of the grammar", { ["/members/" + one]: wire(1, [...groupsOf(40), "grp_x"]) }, () => members.get(one)],
    ["groups not a list", { ["/members/" + one]: wire(1, "grp_a") }, () => members.get(one)],
    ["a member without a language", { "/members": { members: [{ ...wire(1, groupsOf(40)), language: "" }], next: null } }, () => members.list()],
    ["more than 500 a page", { "/members": { members: Array.from({ length: 501 }, (_, i) => wire(i, [])), next: null } }, () => members.list()],
    ["not JSON", { "/members": "{" }, () => members.list()],
    ["a group member not a member id", { "/groups": { groups: [{ id: gidOf(0), name: "S", members: [...Array.from({ length: 200 }, (_, i) => midOf(i)), gidOf(1)] }] } }, () => members.groups.list()],
    ["a group without a name", { "/groups": { groups: [{ id: gidOf(0), members: [] }] } }, () => members.groups.list()],
    ["groups not a list", { "/groups": { groups: {} } }, () => members.groups.list()],
    ["a lookup that forgets an id", { "/members/lookup": { members: [], former: [], unknown: [] } }, () => members.lookup([one])],
  ];
  for (const [why, answers, call] of bad) await answering(answers, async () => {
    await assert.rejects(call(), Unavailable, why);
  });
});

test("an answer is bounded by size (4 MiB, as every call of the SDK): a group beyond is Unavailable", async () => {
  // 140,000 identifiers of 33 bytes: over 4 MiB.
  const ids = Array.from({ length: 140_000 }, (_, i) => midOf(i));
  await answering({ "/groups": { groups: [{ id: gidOf(0), name: "All", members: ids }] } }, async () => {
    await assert.rejects(members.groups.list(), Unavailable);
  });
  await answering({ "/groups": { groups: [{ id: gidOf(0), name: "All", members: ids.slice(0, 100_000) }] } }, async () => {
    assert.equal((await members.groups.list())[0]?.members.length, 100_000);
  });
});

test("a group or member event forgets what the studio's lookup keeps", async () => {
  const lea = person(1, [gidOf(0)]);
  const chest = await fakeChest({ members: [lea], groups: [{ id: gidOf(0), name: "Sales", members: [lea.id] }], capabilities: ["members", "members.groups"], receives: ["member.*", "group.*"] });
  try {
    const events = await import("../events.js");
    assert.equal((await members.lookup([lea.id])).members[0]?.name, lea.name);
    chest.members[0] = { ...lea, name: "Léa Renamed" };
    assert.equal((await members.lookup([lea.id])).members[0]?.name, lea.name, "kept a minute");
    const app = async (r: Request) => new Response(null, { status: await events.handle(r, {}) });
    assert.equal(await chest.emit({ type: "member.updated", data: { id: lea.id, changed: ["name"] } }, app), 204);
    assert.equal((await members.lookup([lea.id])).members[0]?.name, "Léa Renamed", "forgotten on a member event");
    chest.members[0] = { ...lea, name: "Léa Again" };
    assert.equal(await chest.emit({ type: "group.changed", data: { id: gidOf(0), changed: ["members"] } }, app), 204);
    assert.equal((await members.lookup([lea.id])).members[0]?.name, "Léa Again", "forgotten on a group event");
    chest.members[0] = { ...lea, name: "Léa Thrice" };
    chest.clearCaches();
    assert.equal((await members.lookup([lea.id])).members[0]?.name, "Léa Thrice", "clearCaches forgets it");
  } finally {
    await chest.close();
  }
});
