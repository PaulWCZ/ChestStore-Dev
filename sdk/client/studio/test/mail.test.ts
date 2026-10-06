import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted, ChestError, QuotaExceeded, Unavailable } from "../../src/errors.js";
import * as files from "../files.js";
import * as mail from "../mail.js";
import type { Member } from "../member.js";
import { fakeChest } from "../testing.js";

// mail (Studio proposal), after the owner's decisions of 6 October 2026:
// email to people OUTSIDE the company only, through the company's own mail
// provider (a connector, not built yet); members are told with
// notifications; the Chest receives no mail.

const camille: Member = { id: "mbr_camilleaaaaaaaaaaaaaaaaaaa", firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "agent", isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "Europe/Paris", email: "camille@company.test" };
const code = (c: string) => (e: unknown) => e instanceof ChestError && e.code === c;

test("send: to outside addresses, with attachments, once per key; Reply-To is the company's unless the tool gives one", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["mail", "files"], mail: { domain: "atelier.test", replyTo: "contact@atelier.test" } });
  try {
    const sent = await mail.send({ to: "client@example.com", subject: "Your booking on 3 November", text: "Hello", fromName: "Atelier Martin", key: "booking:1:recap" });
    assert.match(sent.id, mail.messageIdPattern);
    assert.equal(sent.status, "queued");
    assert.deepEqual(Object.keys(sent).sort(), ["id", "messageId", "status"]);
    const again = await mail.send({ to: "client@example.com", subject: "Your booking on 3 November", text: "Hello", key: "booking:1:recap" });
    assert.equal(again.id, sent.id, "a retry sends nothing again");
    assert.equal(chest.outbox.length, 1);
    const first = chest.outbox[0]!;
    assert.deepEqual([first.from, first.fromName, first.to, first.replyTo], ["no-reply@atelier.test", "Atelier Martin", ["client@example.com"], "contact@atelier.test"]);
    // The tool's own reply address (from its settings) overrides the company's.
    await mail.send({ to: "client@example.com", subject: "Your quote", text: "…", replyTo: "sales@atelier.test" });
    assert.equal(chest.outbox.at(-1)?.replyTo, "sales@atelier.test");
    assert.equal((await mail.status(sent.id))?.status, "sent");
    assert.equal(await mail.status("msg_" + "a".repeat(26)), null);
    await assert.rejects(mail.status("nope"), code("invalid_id"));
    // Attachments: a file of the tool's, or bytes it made (the .ics of a booking).
    await files.put("quotes/1.pdf", "%PDF-", "application/pdf");
    await mail.send({ to: "a@example.com", subject: "Quote", text: "Attached", attachments: [{ file: "quotes/1.pdf", name: "Quote 1.pdf" }, { name: "booking.ics", type: "text/calendar", content: "BEGIN:VCALENDAR" }] });
    assert.deepEqual(chest.outbox.at(-1)?.attachments, [{ name: "Quote 1.pdf", type: "application/pdf", size: 5 }, { name: "booking.ics", type: "text/calendar", size: 15 }]);
  } finally {
    await chest.close();
  }
});

test("Reply-To by default: contact@<domain> in the fake, none when the owner set none", async () => {
  const chest = await fakeChest({ capabilities: ["mail"] });
  try {
    await mail.send({ to: "a@example.com", subject: "x", text: "" });
    assert.equal(chest.outbox[0]?.replyTo, "contact@company.test");
    assert.equal((await mail.available()).replyTo, "contact@company.test");
  } finally {
    await chest.close();
  }
  const none = await fakeChest({ capabilities: ["mail"], mail: { replyTo: null } });
  try {
    await mail.send({ to: "a@example.com", subject: "x", text: "" });
    assert.equal(Object.hasOwn(none.outbox[0]!, "replyTo"), false, "replies go to the sending address");
    assert.equal((await mail.available()).replyTo, null);
  } finally {
    await none.close();
  }
  await assert.rejects(fakeChest({ capabilities: ["mail"], mail: { replyTo: "not an address" } }), /replyTo/u);
  await assert.rejects(fakeChest({ capabilities: ["mail"], mail: { mailboxes: ["support"] } as never }), /mailboxes/u);
});

test("a member is never a recipient: {member} and mbr_… are refused, invalid_recipient, before anything is sent", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["mail"] });
  try {
    await assert.rejects(mail.send({ to: { member: camille.id } as never, subject: "New ticket", text: "…" }), code("invalid_recipient"));
    await assert.rejects(mail.send({ to: camille.id, subject: "New ticket", text: "…" }), code("invalid_recipient"));
    await assert.rejects(mail.send({ to: "mbr_short", subject: "New ticket", text: "…" }), code("invalid_recipient"));
    await assert.rejects(mail.send({ to: "client@example.com", cc: [{ member: camille.id }] as never, subject: "x", text: "…" }), code("invalid_recipient"));
    assert.equal(chest.outbox.length, 0);
    // The fake Chest refuses it too (a tool that bypassed the SDK).
    const raw = await fetch(process.env["CHEST_API"] + "/mail/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: [{ member: camille.id }], cc: [], subject: "x", text: "" }) });
    assert.deepEqual([raw.status, await raw.json()], [400, { error: "invalid_recipient" }]);
  } finally {
    await chest.close();
  }
});

test("the earlier shape is refused loudly: mailbox, thread, inReplyTo, references, transactional", async () => {
  const chest = await fakeChest({ capabilities: ["mail"] });
  try {
    for (const field of [{ mailbox: "support" }, { thread: "1042" }, { inReplyTo: "<a@b>" }, { references: ["<a@b>"] }, { transactional: true }]) {
      await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", ...field } as never), code("invalid_message"), Object.keys(field)[0]);
    }
    assert.equal(chest.outbox.length, 0);
    // What the module no longer has.
    for (const gone of ["handle", "verify", "preference", "mailboxAddress", "threadAddress", "threadTag", "threadOf", "mailboxPattern", "threadPattern", "bouncePattern"]) assert.equal(gone in mail, false, gone);
    assert.equal("receive" in chest, false);
    assert.equal("held" in chest, false);
  } finally {
    await chest.close();
  }
});

test("send refuses before sending: bad addresses, header injection, too many; the Chest refuses the rest", async () => {
  const chest = await fakeChest({ capabilities: ["mail"], mail: { perDay: 1, suppressed: ["gone@example.com"] } });
  try {
    await assert.rejects(mail.send({ to: "not an address", subject: "x", text: "" }), code("invalid_address"));
    await assert.rejects(mail.send({ to: "a@example.com", replyTo: "nope", subject: "x", text: "" }), code("invalid_address"));
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x\r\nBcc: victim@example.com", text: "" }), code("invalid_message"));
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", fromName: "A\nBcc: b@c.d" }), code("invalid_message"));
    await assert.rejects(mail.send({ to: Array.from({ length: 51 }, (_, i) => `a${i}@example.com`), subject: "x", text: "" }), code("invalid_message"));
    await assert.rejects(mail.send({ to: [], subject: "x", text: "" }), code("invalid_message"));
    await assert.rejects(mail.send({ to: "gone@example.com", subject: "x", text: "" }), code("suppressed"));
    await mail.send({ to: "a@example.com", subject: "x", text: "" });
    await assert.rejects(mail.send({ to: "b@example.com", subject: "y", text: "" }), QuotaExceeded);
    assert.equal(mail.isAddress("léa@exemple.fr"), true);
    assert.equal(mail.isAddress("a@b"), false);
    assert.equal(mail.isAddress("a\u0000b@example.com"), false, "no control character in an address");
    assert.equal(mail.isAddress("a@example.com\r\nBcc: victim@example.com"), false);
  } finally {
    await chest.close();
  }
});

test("header injection and malformed attachments are refused by the SDK and by the Chest, nothing sent", async () => {
  const chest = await fakeChest({ capabilities: ["mail", "files"] });
  try {
    const base = { to: "a@example.com", subject: "x", text: "" };
    // Every line break or control character a header could be split on.
    for (const bad of ["x\nBcc: v@example.com", "x\rBcc: v@example.com", "x\u0085Bcc", "x\u2028Bcc", "x\u0000", "x\u001b[31m"]) {
      await assert.rejects(mail.send({ ...base, subject: bad }), code("invalid_message"), JSON.stringify(bad));
      await assert.rejects(mail.send({ ...base, fromName: bad }), code("invalid_message"), JSON.stringify(bad));
      await assert.rejects(mail.send({ ...base, attachments: [{ name: bad, type: "text/plain", content: "hi" }] }), code("invalid_message"), JSON.stringify(bad));
      await assert.rejects(mail.send({ ...base, attachments: [{ name: "a.txt", type: bad, content: "hi" }] }), code("invalid_message"), JSON.stringify(bad));
      await assert.rejects(mail.send({ ...base, attachments: [{ file: "a.pdf", name: bad }] }), code("invalid_message"), "a stored file's name too");
    }
    await mail.send({ ...base, subject: "Tab\tis fine" });
    // Attachments the Chest could not send.
    await assert.rejects(mail.send({ ...base, attachments: "a.pdf" as never }), code("invalid_message"));
    await assert.rejects(mail.send({ ...base, attachments: [{ name: "a.txt", type: "text/plain" }] as never }), code("invalid_message"));
    await assert.rejects(mail.send({ ...base, attachments: [{ file: 42 }] as never }), code("invalid_message"));
    // Members in any spelling are refused as members; whitespace does not hide one.
    for (const to of [" mbr_camilleaaaaaaaaaaaaaaaaaaa", "MBR_camilleaaaaaaaaaaaaaaaaaaa", "mbr_camilleaaaaaaaaaaaaaaaaaaa\n"]) await assert.rejects(mail.send({ ...base, to }), code("invalid_recipient"), JSON.stringify(to));
    await assert.rejects(mail.send({ ...base, cc: ["b@example.com", " mbr_x"] }), code("invalid_recipient"));
    await assert.rejects(mail.send({ ...base, to: [["a@example.com"]] as never }), code("invalid_address"));
    assert.equal(chest.outbox.length, 1, "only the tab");
    // The Chest refuses the same for a tool that bypassed the SDK.
    const raw = (m: Record<string, unknown>) => fetch(process.env["CHEST_API"] + "/mail/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: ["a@example.com"], subject: "x", text: "", ...m }) }).then(async r => [r.status, ((await r.json()) as { error?: string }).error]);
    assert.deepEqual(await raw({ subject: "x\r\nBcc: v@example.com" }), [400, "invalid_message"]);
    assert.deepEqual(await raw({ from_name: "A\nBcc: v@example.com" }), [400, "invalid_message"]);
    assert.deepEqual(await raw({ attachments: [{ name: "a\r\nX: y", type: "text/plain", content: "aGk=" }] }), [400, "invalid_message"]);
    assert.deepEqual(await raw({ attachments: [{ file: "missing.pdf" }] }), [400, "invalid_message"], "a file the tool does not have");
    assert.deepEqual(await raw({ to: ["MBR_camilleaaaaaaaaaaaaaaaaaaa"] }), [400, "invalid_recipient"]);
    assert.equal(chest.outbox.length, 1);
  } finally {
    await chest.close();
  }
  // Without the capability (or on a Chest without mail): not granted.
  const bare = await fakeChest({ capabilities: [] });
  try {
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "" }), CapabilityNotGranted);
  } finally {
    await bare.close();
  }
});

test("bounces: status says bounced or complained, the address is suppressed, nothing is posted to the tool", async () => {
  const chest = await fakeChest({ capabilities: ["mail"] });
  try {
    const first = await mail.send({ to: "nobody@example.com", subject: "Your receipt", text: "…" });
    assert.equal(chest.bounce(first.id), undefined);
    assert.equal((await mail.status(first.id))?.status, "bounced");
    await assert.rejects(mail.send({ to: "nobody@example.com", subject: "Again", text: "…" }), code("suppressed"));
    const full = await mail.send({ to: "full@example.com", subject: "Your receipt", text: "…" });
    chest.bounce(full.id, { permanent: false });
    assert.equal((await mail.status(full.id))?.status, "bounced");
    await mail.send({ to: "full@example.com", subject: "Again", text: "…" }); // a temporary failure does not suppress
    const spam = await mail.send({ to: "angry@example.com", subject: "News", text: "…" });
    chest.bounce(spam.id, { complained: true });
    assert.equal((await mail.status(spam.id))?.status, "complained");
    await assert.rejects(mail.send({ to: "angry@example.com", subject: "Again", text: "…" }), code("suppressed"));
    assert.throws(() => chest.bounce("msg_" + "z".repeat(26)), /no message/u);
  } finally {
    await chest.close();
  }
});

// A key that names the recipient never collides; a key reused for other
// recipients is refused, never answered with the first message silently.
test("idempotency: a long per-recipient key never loses its recipient; a key reused for other recipients is refused, not dropped", async () => {
  const chest = await fakeChest({ capabilities: ["mail"] });
  try {
    // A tool's own key of 63 characters: with ":<address>" the address is past 64.
    const key = "receipt:2026-09-29:form:atelier-martin-renovation-phase-two-abc";
    assert.equal(key.length, 63);
    const guests = ["ines.moreau@example.com", "tom.walker@example.org"];
    for (const to of guests) await mail.send({ to, subject: "Your receipt", text: "…", key: `${key}:${to}` });
    for (const to of guests) await mail.send({ to, subject: "Your receipt", text: "…", key: `${key}:${to}` });
    assert.deepEqual(chest.outbox.map(m => m.to), [[guests[0]], [guests[1]]]);
    assert.equal(chest.outbox[0]?.key, mail.idempotencyKey(`${key}:${guests[0]}`));
    assert.match(chest.outbox[0]?.key ?? "", /^sha256:[A-Za-z0-9_-]{43}$/u);
    assert.equal(mail.idempotencyKey("reply:981"), "reply:981");
    const cut = (to: string) => `${key}:${to}`.slice(0, 64);
    await mail.send({ to: guests[0]!, subject: "Old way", text: "…", key: cut(guests[0]!) });
    await assert.rejects(mail.send({ to: guests[1]!, subject: "Old way", text: "…", key: cut(guests[1]!) }), code("key_conflict"));
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", key: "k".repeat(513) }), code("invalid_message"));
    await assert.rejects(mail.send({ to: "a@example.com", subject: "x", text: "", key: "a\nb" }), code("invalid_message"));
  } finally {
    await chest.close();
  }
});

test("available: ok, or why not (not_granted, not_connected, suspended, quota), and the company's reply address — without sending", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["mail"], mail: { perDay: 2, replyTo: "hello@atelier.test" } });
  try {
    assert.deepEqual(await mail.available(), { ok: true, reason: null, remainingToday: 2, replyTo: "hello@atelier.test" });
    assert.equal(chest.outbox.length, 0);
    await mail.send({ to: "a@example.test", subject: "Hello", text: "Hi" });
    assert.deepEqual(await mail.available(), { ok: true, reason: null, remainingToday: 1, replyTo: "hello@atelier.test" });
    await mail.send({ to: "b@example.test", subject: "Hello", text: "Hi" });
    assert.deepEqual(await mail.available(), { ok: false, reason: "quota", remainingToday: 0, replyTo: "hello@atelier.test" });
    chest.delivery.mail = "suspended";
    assert.deepEqual(await mail.available(), { ok: false, reason: "suspended", remainingToday: 0, replyTo: "hello@atelier.test" });
    await assert.rejects(mail.send({ to: "c@example.test", subject: "Hello", text: "Hi" }), Unavailable);
  } finally {
    await chest.close();
  }
  // The connector absent: the owner has not connected the company's mail provider.
  const notConnected = await fakeChest({ capabilities: ["mail"], mail: { connected: false } });
  try {
    assert.equal(notConnected.delivery.mail, "not_connected");
    const said = await mail.available();
    assert.deepEqual([said.ok, said.reason], [false, "not_connected"]);
    await assert.rejects(mail.send({ to: "a@example.test", subject: "Hello", text: "Hi" }), Unavailable);
    assert.equal(notConnected.outbox.length, 0);
    // The owner connects it.
    notConnected.delivery.mail = "ready";
    assert.equal((await mail.available()).ok, true);
    await mail.send({ to: "a@example.test", subject: "Hello", text: "Hi" });
    assert.equal(notConnected.outbox.length, 1);
  } finally {
    await notConnected.close();
  }
  // Not declared, or outside a Chest: not granted, never an error.
  const bare = await fakeChest({ capabilities: [] });
  try {
    assert.deepEqual(await mail.available(), { ok: false, reason: "not_granted", remainingToday: null, replyTo: null });
  } finally {
    await bare.close();
  }
  delete process.env["CHEST_API"];
  assert.deepEqual(await mail.available(), { ok: false, reason: "not_granted", remainingToday: null, replyTo: null });
});
