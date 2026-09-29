import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted, ChestError, QuotaExceeded } from "../src/errors.js";
import * as files from "../src/files.js";
import * as mail from "../src/mail.js";
import { member, type Member } from "../src/member.js";
import * as members from "../src/members.js";
import { fakeChest, withMember } from "../src/testing.js";

const camille: Member = { id: "mbr_camilleaaaaaaaaaaaaaaaaaaa", firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "agent", isAdmin: false, isBuilder: false, groups: [], locale: "fr", email: "camille@company.test" };
const code = (c: string) => (e: unknown) => e instanceof ChestError && e.code === c;

test("send: to addresses or members (their address stays the Chest's), from a mailbox, once per key", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["mail", "files"], mail: { domain: "atelier.test", mailboxes: ["support"] } });
  try {
    const sent = await mail.send({ to: "client@example.com", subject: "Your request #42", text: "Hello", mailbox: "support", fromName: "Camille at Atelier", key: "reply:1" });
    assert.match(sent.id, mail.messageIdPattern);
    const again = await mail.send({ to: "client@example.com", subject: "Your request #42", text: "Hello", mailbox: "support", key: "reply:1" });
    assert.equal(again.id, sent.id);
    await mail.send({ to: { member: camille.id }, subject: "New ticket", text: "…" });
    assert.deepEqual(chest.outbox.map(m => [m.from, m.to, m.subject]), [["support@atelier.test", ["client@example.com"], "Your request #42"], ["no-reply@atelier.test", ["camille@company.test"], "New ticket"]]);
    assert.equal((await mail.status(sent.id))?.status, "sent");
    assert.equal(await mail.mailboxAddress("support"), "support@atelier.test");
    assert.equal(await mail.mailboxAddress("sales"), null);
    await files.put("quotes/1.pdf", "%PDF-", "application/pdf");
    await mail.send({ to: "a@example.com", subject: "Quote", text: "Attached", attachments: [{ file: "quotes/1.pdf", name: "Quote 1.pdf" }, { name: "invite.ics", type: "text/calendar", content: "BEGIN:VCALENDAR" }] });
    assert.deepEqual(chest.outbox.at(-1)?.attachments, [{ name: "Quote 1.pdf", type: "application/pdf", size: 5 }, { name: "invite.ics", type: "text/calendar", size: 15 }]);
  } finally {
    await chest.close();
  }
});

test("send refuses before sending: bad addresses, header injection, too many; the Chest refuses the rest", async () => {
  const chest = await fakeChest({ capabilities: ["mail"], mail: { perDay: 1, suppressed: ["gone@example.com"] } });
  try {
    await assert.rejects(mail.send({ to: "not an address", subject: "x", text: "" }), code("invalid_address"));
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x\r\nBcc: victim@example.com", text: "" }), code("invalid_message"));
    await assert.rejects(mail.send({ to: Array.from({ length: 51 }, (_, i) => `a${i}@example.com`), subject: "x", text: "" }), code("invalid_message"));
    await assert.rejects(mail.send({ to: "gone@example.com", subject: "x", text: "" }), code("suppressed"));
    await mail.send({ to: "a@example.com", subject: "x", text: "" });
    await assert.rejects(mail.send({ to: "b@example.com", subject: "y", text: "" }), QuotaExceeded);
    assert.equal(mail.isAddress("léa@exemple.fr"), true);
    assert.equal(mail.isAddress("a@b"), false);
  } finally {
    await chest.close();
  }
  // Without the capability (or on a Chest without mail yet): not granted.
  const bare = await fakeChest({ capabilities: [] });
  try {
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "" }), CapabilityNotGranted);
  } finally {
    await bare.close();
  }
});

test("received mail is delivered signed, with its attachments already in the tool's files", async () => {
  const chest = await fakeChest({ capabilities: ["mail", "files"], mail: { mailboxes: ["support"] } });
  try {
    const got: mail.Received[] = [];
    const seen = new Set<string>();
    const store = { has: (id: string) => seen.has(id), add: (id: string) => { seen.add(id); } };
    const app = async (request: Request) => new Response(null, { status: await mail.handle(request, m => { got.push(m); }, { seen: store }) });
    const status = await chest.receive({ mailbox: "support", from: "client@example.com", fromName: "Jean Client", subject: "Broken order", text: "Hello, my order…", attachments: [{ name: "photo.png", type: "image/png", content: "PNG" }] }, app);
    assert.equal(status, 204);
    assert.equal(got[0]?.from.name, "Jean Client");
    assert.equal(got[0]?.mailbox, "support");
    const file = got[0]!.attachments[0]!.file;
    assert.match(file, /^mail\/[0-9a-f]{20}\.png$/u);
    assert.equal((await files.stat(file))?.size, 3);
    assert.equal(await mail.handle(new Request("http://tool/chest-mail", { method: "POST", body: "{}" }), () => {}), 401);
  } finally {
    await chest.close();
  }
});

test("threads: a reply to a thread address comes back with its thread; a forged or foreign tag does not", async () => {
  const chest = await fakeChest({ capabilities: ["mail", "files"], mail: { domain: "atelier.test", mailboxes: ["support", "sales"] } });
  try {
    await mail.send({ to: "client@example.com", subject: "Re: Broken order [#1042]", text: "We are on it.", mailbox: "support", thread: "1042" });
    const replyTo = chest.outbox.at(-1)!.replyTo!;
    assert.match(replyTo, /^support\+t1042-[a-z2-7]{10}@atelier\.test$/u);
    assert.equal(await mail.threadAddress("support", "1042"), replyTo);
    assert.equal(mail.threadOf(replyTo, "support"), "1042");
    assert.equal(mail.threadOf(replyTo.toUpperCase(), "support"), "1042", "a mail system may change the case");
    assert.equal(mail.threadOf(replyTo, "sales"), null, "another mailbox's");
    assert.equal(mail.threadOf(replyTo.replace("t1042-", "t1043-"), "support"), null, "a thread guessed");
    assert.equal(mail.threadOf("support+t1042-aaaaaaaaaa@atelier.test", "support"), null, "a tag forged");
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", thread: "1042" }), code("invalid_message"), "a thread needs a mailbox");
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", mailbox: "support", thread: "Ticket 1" }), code("invalid_message"));
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", mailbox: "support", thread: "1", replyTo: "b@example.com" }), code("invalid_message"));
    const got: mail.Received[] = [];
    const app = async (request: Request) => new Response(null, { status: await mail.handle(request, { message: m => { got.push(m); } }) });
    assert.equal(await chest.receive({ mailbox: "support", from: "client@example.com", subject: "Re: Broken order", text: "Thanks", thread: "1042", inReplyTo: chest.outbox.at(-1)!.messageId }, app), 204);
    assert.equal(await chest.receive({ mailbox: "support", from: "someone@example.com", subject: "Hi", text: "Hi", deliveredTo: "support+t1042-abcdefghij@atelier.test" }, app), 204);
    assert.equal(await chest.receive({ mailbox: "support", from: "new@example.com", subject: "Hello", text: "Hello" }, app), 204);
    assert.deepEqual(got.map(m => [m.thread, m.deliveredTo.split("@")[0]!.split("+")[0]]), [["1042", "support"], [null, "support"], [null, "support"]]);
    assert.equal(got[0]!.inReplyTo, chest.outbox.at(-1)!.messageId);
  } finally {
    await chest.close();
  }
});

test("what the Chest hands over: cleaned HTML, the original kept, attachments it refused, automatic answers, the sender's authentication", async () => {
  const chest = await fakeChest({ capabilities: ["mail", "files"], mail: { mailboxes: ["jobs"] } });
  try {
    const got: mail.Received[] = [];
    const app = async (request: Request) => new Response(null, { status: await mail.handle(request, m => { got.push(m); }) });
    const html = `<html><head><style>p{color:red}</style><title>t</title></head><body><p onclick="x()">Hello <b>there</b></p><script>alert(1)</script><img src="https://tracker.example/p.gif"><a href="javascript:alert(1)">bad</a> <a href="jav&#x61;script:alert(1)">worse</a> <a href='https://atelier.test/?a=1&b=2'>ok</a><iframe src="x"></iframe><!-- secret --><ul><li>one<li>two</ul><div style="background:url(x)">z</div></body></html>`;
    await chest.receive({ mailbox: "jobs", from: "lucie@example.com", subject: "Application", text: "Hello there", html, attachments: [{ name: "cv.pdf", type: "application/pdf", content: "%PDF-1.7" }, { name: "run.exe", type: "application/x-msdownload", content: "MZ" }], authenticated: false }, app);
    const m = got[0]!;
    assert.equal(m.kind, "message");
    assert.equal(m.html, `<p>Hello <b>there</b></p><a>bad</a> <a>worse</a> <a href="https://atelier.test/?a=1&amp;b=2" rel="noopener noreferrer nofollow">ok</a><ul><li>one<li>two</li></li></ul><div>z</div>`);
    for (const word of ["script", "style", "onclick", "img", "iframe", "secret", "javascript"]) assert.equal(m.html!.includes(word), false, word);
    assert.deepEqual(m.attachments.map(a => a.name), ["cv.pdf"]);
    assert.deepEqual(m.dropped, [{ name: "run.exe", size: 2, reason: "type" }]);
    assert.match(m.original!, /^mail\/[0-9a-f]{20}\.eml$/u);
    assert.equal((await files.stat(m.original!))?.type, "message/rfc822");
    assert.equal(m.authenticated, false);
    assert.equal(m.auto, false);
    await chest.receive({ mailbox: "jobs", from: "lucie@example.com", subject: "Out of office", text: "Back Monday", auto: true }, app);
    assert.equal(got[1]!.auto, true);
    assert.equal(got[1]!.html, null);
  } finally {
    await chest.close();
  }
});

test("bounces: status bounced, the address suppressed, the tool told once", async () => {
  const chest = await fakeChest({ capabilities: ["mail"], mail: { mailboxes: ["support"] } });
  try {
    const sent = await mail.send({ to: "nobody@example.com", subject: "Your ticket", text: "…", mailbox: "support" });
    const bounces: mail.Bounce[] = [];
    const received: mail.Received[] = [];
    const seen = new Set<string>();
    const store = { has: (id: string) => seen.has(id), add: (id: string) => { seen.add(id); } };
    const app = async (request: Request) => new Response(null, { status: await mail.handle(request, { message: m => { received.push(m); }, bounce: b => { bounces.push(b); } }, { seen: store }) });
    assert.equal(await chest.bounce(sent.id, app, { id: "bnc_" + "c".repeat(26) }), 204);
    assert.equal(await chest.bounce(sent.id, app, { id: "bnc_" + "c".repeat(26) }), 204);
    assert.equal(bounces.length, 1);
    assert.deepEqual([bounces[0]!.message, bounces[0]!.recipient, bounces[0]!.permanent], [sent.id, "nobody@example.com", true]);
    assert.equal(received.length, 0, "a bounce is never a received message");
    assert.equal((await mail.status(sent.id))?.status, "bounced");
    await assert.rejects(mail.send({ to: "nobody@example.com", subject: "Again", text: "…" }), code("suppressed"));
    // A handler of messages only accepts a bounce and ignores it.
    const other = await mail.send({ to: "full@example.com", subject: "x", text: "…" });
    assert.equal(await chest.bounce(other.id, async request => new Response(null, { status: await mail.handle(request, () => { throw new Error("not a message"); }) }), { permanent: false }), 204);
  } finally {
    await chest.close();
  }
});

// Studio.15 bug: a send key was capped at 64 characters, so tools cut
// `${key}:${member}` to 64 — past 33 characters of their own key, the cut
// took the recipient off, two recipients of one send shared a key, and the
// Chest answered the second with the first message: one email dropped,
// silently.
test("idempotency: a long per-recipient key never loses its recipient; a key reused for other recipients is refused, not dropped", async () => {
  const lea: Member = { ...camille, id: "mbr_leaaaaaaaaaaaaaaaaaaaaaaaa", firstName: "Léa", name: "Léa Martin", email: "lea@company.test" };
  const chest = await fakeChest({ members: [camille, lea], capabilities: ["mail"] });
  try {
    // A tool's own key of 61 characters: with ":mbr_…" the whole id is past 64.
    const key = "digest:2026-09-29:project:atelier-martin-renovation-phase-two";
    assert.equal(key.length, 61);
    for (const who of [camille, lea]) await mail.send({ to: { member: who.id }, subject: "Your digest", text: "…", key: `${key}:${who.id}` });
    assert.deepEqual(chest.outbox.map(m => m.to), [["camille@company.test"], ["lea@company.test"]]);
    // A retry of each sends nothing again.
    for (const who of [camille, lea]) await mail.send({ to: { member: who.id }, subject: "Your digest", text: "…", key: `${key}:${who.id}` });
    assert.equal(chest.outbox.length, 2);
    // The long key reaches the Chest as a fixed-length digest; a short key as is.
    assert.equal(chest.outbox[0]?.key, mail.idempotencyKey(`${key}:${camille.id}`));
    assert.match(chest.outbox[0]?.key ?? "", /^sha256:[A-Za-z0-9_-]{43}$/u);
    assert.equal(mail.idempotencyKey("reply:981"), "reply:981");
    // What tools did until now — cutting the key themselves — collides: the
    // Chest now says so instead of answering the first message.
    const cut = (id: string) => `${key}:${id}`.slice(0, 64);
    await mail.send({ to: { member: camille.id }, subject: "Old way", text: "…", key: cut(camille.id) });
    await assert.rejects(mail.send({ to: { member: lea.id }, subject: "Old way", text: "…", key: cut(lea.id) }), code("key_conflict"));
    assert.equal(chest.outbox.length, 3);
    // Beyond 512 characters, or with a control character, a key is refused before sending.
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", key: "k".repeat(513) }), code("invalid_message"));
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", key: "a\nb" }), code("invalid_message"));
    // An address in a key (a guest's) is fine: it is hashed.
    await mail.send({ to: "guest@example.com", subject: "Invite", text: "…", key: "room:981:0:guest@example.com" });
    assert.match(chest.outbox.at(-1)?.key ?? "", /^sha256:/u);
  } finally {
    await chest.close();
  }
});

// Proposal (studio.15): one email preference per person, in the Chest; the
// tools read it and mail.send honours it.
test("email preference: none is skipped, digest waits for the Chest's daily email, transactional always goes", async () => {
  const hugo: Member = { ...camille, id: "mbr_" + "hugo".padEnd(26, "a"), firstName: "Hugo", name: "Hugo Martin", email: "hugo@company.test", mailPreference: "none" };
  const nora: Member = { ...camille, id: "mbr_" + "nora".padEnd(26, "a"), firstName: "Nora", name: "Nora Martin", email: "nora@company.test", mailPreference: "digest" };
  const chest = await fakeChest({ members: [camille, hugo, nora], capabilities: ["mail", "members"] });
  try {
    // Read-only, where the tool already reads its members.
    assert.equal(member(withMember(new Request("http://tool.test/chest"), hugo))?.mailPreference, "none");
    assert.equal((await members.get(nora.id))?.mailPreference, "digest");
    assert.equal((await members.get(camille.id))?.mailPreference, undefined, "not said: read it as all");
    const all = await mail.send({ to: [{ member: camille.id }, { member: hugo.id }, { member: nora.id }], subject: "A task was assigned", text: "…", key: "assigned:1" });
    assert.deepEqual([all.status, all.skipped, all.digest], ["queued", [hugo.id], [nora.id]]);
    assert.deepEqual(chest.outbox.map(m => m.to), [["camille@company.test"]]);
    assert.deepEqual(chest.held.map(h => [h.member, h.reason]), [[hugo.id, "none"], [nora.id, "digest"]]);
    // A retry answers the same.
    assert.deepEqual(await mail.send({ to: [{ member: camille.id }, { member: hugo.id }, { member: nora.id }], subject: "A task was assigned", text: "…", key: "assigned:1" }), all);
    // Nobody receives it now: held, not an error.
    const held = await mail.send({ to: { member: hugo.id }, subject: "Weekly reminder", text: "…" });
    assert.deepEqual([held.status, held.skipped], ["held", [hugo.id]]);
    assert.equal((await mail.status(held.id))?.status, "held");
    // A member's address given as an address is still that member.
    assert.equal((await mail.send({ to: "NORA@company.test", subject: "Reminder", text: "…" })).status, "held");
    // What must go, goes.
    const payslip = await mail.send({ to: { member: hugo.id }, subject: "Your payslip", text: "…", transactional: true });
    assert.deepEqual([payslip.status, payslip.skipped, chest.outbox.at(-1)?.to], ["queued", [], ["hugo@company.test"]]);
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", transactional: "yes" as unknown as boolean }), code("invalid_message"));
  } finally {
    await chest.close();
  }
});
