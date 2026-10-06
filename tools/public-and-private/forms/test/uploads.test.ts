import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { CapabilityNotGranted } from "@argentic/chest-sdk/errors";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as answers from "../src/lib/answers.ts";
import { AppError } from "../src/lib/app-error.ts";
import * as forms from "../src/lib/forms.ts";
import { take } from "../src/lib/respond.ts";
import * as uploads from "../src/lib/uploads.ts";
import { everyAnswer } from "./support/answers.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "mail"], storage: { publicUploads: true }, mail: { domain: "atelier.test" }, chest: { organization: "Atelier Martin" } });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, code);
};
async function visitorSends(question: ReturnType<typeof q>, data: Uint8Array, type = "application/pdf"): Promise<string> {
  const { url } = await uploads.grant("public", question, type, data.byteLength);
  const answer = await chest.upload(url, data, type);
  assert.equal(answer.status, 201);
  const body = (await answer.json()) as { claim?: string; name?: string };
  assert.ok(body.claim && !body.name, "the visitor gets a claim, never the object's name");
  return body.claim;
}

test("a visitor's file is claimed only once, by the answer that sent it, and checked", async () => {
  const cv = q("file", "CV", { accept: "documents" });
  const claim = await visitorSends(cv, pdf);
  const kept = await uploads.accept("public", "7", cv, { ref: claim, name: "Nina CV.pdf" });
  assert.match(kept.file, /^answers\/7\/[0-9a-f]{20}\.pdf$/u);
  assert.equal(kept.name, "Nina CV.pdf");
  assert.ok(chest.files.has(kept.file));
  await refused(uploads.accept("public", "7", cv, { ref: claim, name: "again" }), "file_missing");
  await refused(uploads.accept("public", "7", cv, { ref: "made-up-claim-value.claim", name: "x" }), "file_missing");
  // A file that says PDF but is not one: the Chest's front refuses it.
  const { url } = await uploads.grant("public", cv, "application/pdf", 25);
  assert.equal((await chest.upload(url, new TextEncoder().encode("<script>alert(1)</script>"), "application/pdf")).status, 400);
  // One whose kind the Chest does not read (a Word file that is not one):
  // the tool reads its first bytes, refuses it and deletes it.
  const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const fake = await visitorSends(cv, new TextEncoder().encode("<script>alert(1)</script>"), docx);
  const before = chest.files.size;
  await refused(uploads.accept("public", "7", cv, { ref: fake, name: "cv.docx" }), "file_invalid");
  assert.equal(chest.files.size, before - 1);
  // A type the question does not take is refused before any upload.
  await refused(uploads.grant("public", cv, "image/png", 10), "file_invalid");
  await refused(uploads.grant("public", cv, "application/pdf", 20 << 20), "file_too_large");
  await refused(uploads.grant("public", q("file", "Photo", { accept: "images" }), "image/svg+xml", 10), "file_invalid");
});

test("a member's file on a team form: the tool's signed ticket, never a forged one", async () => {
  const shot = q("file", "Screenshot", { accept: "images" });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const { url, ticket } = await uploads.grant("team", shot, "image/png", png.byteLength);
  assert.ok(ticket);
  assert.equal((await chest.upload(url, png, "image/png")).status, 201);
  const kept = await uploads.accept("team", "9", shot, { ref: ticket!, name: "screen.png" });
  assert.match(kept.file, /^answers\/9\/[0-9a-f]{20}\.png$/u);
  const forged = ticket!.replace(/\.[^.]+$/u, ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await refused(uploads.accept("team", "9", shot, { ref: forged, name: "x" }), "file_missing");
  await refused(uploads.accept("team", "9", shot, { ref: "team.../x", name: "x" }), "file_missing");
});

test("an answer with a file, end to end: kept under the form, copy emailed in the respondent's language", async () => {
  const { sql } = database;
  const email = q("email", "Email", { required: true });
  const cv = q("file", "CV", { accept: "documents", required: true });
  const f0 = await forms.create(sql, asMember(ines), { definition: form([email, cv], "Apply") });
  await forms.saveSettings(sql, asMember(ines), f0.id, { audience: "public", layout: "classic", accent: "forest", sendCopy: true, watchers: [ines.id] }, null);
  await forms.publish(sql, asMember(ines), f0.id);
  const f = (await forms.bySlug(sql, f0.slug))!.form;
  const claim = await visitorSends(cv, pdf);
  const taken = await take(sql, f, { version: 1, answers: { [email.id]: "nina@example.com", [cv.id]: { ref: claim, name: "cv.pdf" } } }, null, "fr", { copyAsked: true });
  assert.deepEqual(taken, { copy: true });
  const [a] = (await everyAnswer(sql, f.id)).answers;
  assert.match((a!.data[cv.id] as { file: string }).file, new RegExp(`^answers/${f.id}/`, "u"));
  const mail = chest.outbox.at(-1)!;
  assert.deepEqual(mail.to, ["nina@example.com"]);
  assert.equal(mail.subject, "Vos réponses — Apply");
  // A public form's copy repeats only the form's own words: not the
  // address, not the file's name the visitor gave.
  assert.ok(mail.text.includes("Atelier Martin") && mail.text.includes("Apply"));
  assert.ok(!mail.text.includes("cv.pdf") && !mail.text.includes("nina@example.com"), mail.text);
  assert.ok(mail.text.includes("2 réponses écrites ne sont pas reprises"), mail.text);
  // The same claim cannot be used by a second answer.
  await refused(take(sql, f, { version: 1, answers: { [email.id]: "bob@example.com", [cv.id]: { ref: claim, name: "cv.pdf" } } }, null, "en"), "file_missing");
  // Answers with errors come back per question.
  await assert.rejects(take(sql, f, { version: 1, answers: { [email.id]: "nope" } }, null, "en"), (e: unknown) => e instanceof AppError && e.code === "answers" && e.values[email.id] === "email" && e.values[cv.id] === "required");
});

test("a team form's copy goes to the member, whose address the tool never sees", async () => {
  const { sql } = database;
  const note = q("short", "Note", { required: true });
  const f0 = await forms.create(sql, asMember(ines), { definition: form([note], "Team note"), settings: { audience: "team" } });
  await forms.saveSettings(sql, asMember(ines), f0.id, { audience: "team", layout: "classic", accent: "teal", sendCopy: true, watchers: [] }, null);
  await forms.publish(sql, asMember(ines), f0.id);
  const f = (await forms.bySlug(sql, f0.slug))!.form;
  const taken = await take(sql, f, { version: 1, answers: { [note.id]: "Hello" } }, asMember(hugo), "en");
  assert.deepEqual(taken, { copy: true });
  assert.equal(chest.outbox.at(-1)!.subject, "Your answers — Team note");
});

test("without public uploads on the Chest, the grant says so", async () => {
  const other = await fakeChest({ members: everyone, capabilities: ["files"] });
  try {
    await assert.rejects(uploads.grant("public", q("file", "CV"), "application/pdf", 10), (e: unknown) => e instanceof CapabilityNotGranted);
  } finally {
    await other.close();
  }
});
