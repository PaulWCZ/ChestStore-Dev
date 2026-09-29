import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted, ChestError, QuotaExceeded } from "../src/errors.js";
import * as files from "../src/files.js";
import * as mail from "../src/mail.js";
import type { Member } from "../src/member.js";
import { fakeChest } from "../src/testing.js";

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
