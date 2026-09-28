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
