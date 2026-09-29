import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as files from "@argentic/chest-sdk/files";
import { alertText } from "../lib/alerts.ts";
import { answeredData } from "../lib/answered.ts";
import * as answers from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import { frameAncestors, saveSites, sites } from "../lib/embed.ts";
import * as forms from "../lib/forms.ts";
import { acceptImage, sniffImage, sweepImages } from "../lib/images.ts";
import { take } from "../lib/respond.ts";
import * as tell from "../lib/tell.ts";
import { POST as draftRoute } from "../app/chest/(work)/forms/[id]/draft/route.ts";
import { signAssertion } from "@argentic/chest-sdk/testing";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  // The tool's name: its events are named after it (forms.answered).
  process.env["CHEST_TOOL"] = "forms";
  chest = await fakeChest({
    members: everyone,
    capabilities: ["members", "files", "notifications", "mail"],
    emits: ["forms.answered"],
    receivers: 1,
    storage: { publicUploads: true, publicFiles: true },
    mail: { domain: "atelier.test" },
    settings: { company: "Atelier Martin" },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, code);
};
const noFiles = { files: async () => { throw new AppError("file_missing"); }, drop: async () => {} };

async function published(def: ReturnType<typeof form>, settings: Record<string, unknown> = {}, owner = ines) {
  const { sql } = database;
  const f = await forms.create(sql, asMember(owner), { definition: def, settings: { audience: (settings["audience"] as "team" | undefined) ?? "public" } });
  await forms.saveSettings(sql, asMember(owner), f.id, { audience: "public", layout: "steps", accent: "berry", watchers: [owner.id], ...settings }, null);
  await forms.publish(sql, asMember(owner), f.id);
  return (await forms.bySlug(sql, f.slug))!;
}

test("a request form: an editor follows each answer up; the person who sent it sees where it stands, nobody else's", async () => {
  const { sql } = database;
  const need = q("short", "What do you need?", { required: true });
  const { form: f } = await published(form([need], "IT request"), { audience: "team", once: false }, ines);
  const { answer } = await answers.submit(sql, { form: f, version: f.version, answers: { [need.id]: "A charger" }, respondent: asMember(hugo), language: "en", ...noFiles });
  await answers.submit(sql, { form: f, version: f.version, answers: { [need.id]: "A screen" }, respondent: asMember(lea), language: "fr", ...noFiles });
  assert.equal(answer.status, "new");
  // Only an editor of the form follows it up.
  await refused(answers.follow(sql, asMember(hugo), f.id, answer.id, { status: "done" }), "not_found");
  await refused(answers.follow(sql, asMember(ines), f.id, answer.id, { status: "closed" }), "invalid");
  const r = await answers.follow(sql, asMember(ines), f.id, answer.id, { status: "done", note: "On your desk." });
  assert.equal(r.told, true);
  assert.equal(r.answer.status, "done");
  assert.ok(r.answer.handledAt);
  // Hugo sees his own request, its state and note — not Léa's.
  const mine = await answers.sent(sql, asMember(hugo));
  assert.deepEqual(mine.map(x => [x.formTitle, x.status, x.note]), [["IT request", "done", "On your desk."]]);
  assert.equal((await answers.sentOne(sql, asMember(hugo), answer.id)).answer.data[need.id], "A charger");
  await refused(answers.sentOne(sql, asMember(lea), answer.id), "not_found");
  // The list filters by state and counts each.
  const page = await answers.listAnswers(sql, asMember(ines), f.id, { status: "done" });
  assert.equal(page.matching, 1);
  assert.deepEqual(page.counts, { new: 1, doing: 0, done: 1 });
  // Newer and older, in the list's order.
  const all = await answers.listAnswers(sql, asMember(ines), f.id, { sort: "oldest" });
  const near = await answers.neighbours(sql, asMember(ines), f.id, all.answers[0]!.id, { sort: "oldest" });
  assert.deepEqual(near, { newer: null, older: all.answers[1]!.id });
});

test("deleted forms: in the trash 30 days for their owner (and managers), restored with their answers", async () => {
  const { sql } = database;
  const { form: f } = await published(form([q("short", "Name")], "Old survey"), {}, ines);
  await answers.submit(sql, { form: f, version: f.version, answers: {}, respondent: null, language: "en", ...noFiles });
  await forms.remove(sql, asMember(ines), f.id);
  const bin = await forms.trash(sql, asMember(ines));
  assert.ok(bin.some(x => x.id === f.id && x.title === "Old survey" && x.answers === 1));
  assert.ok((await forms.trash(sql, asMember(camille))).some(x => x.id === f.id), "a manager sees every deleted form");
  assert.deepEqual(await forms.trash(sql, asMember(hugo)), []);
  await forms.restore(sql, asMember(ines), f.id);
  assert.ok(!(await forms.trash(sql, asMember(ines))).some(x => x.id === f.id));
  // After 30 days, gone for good.
  await forms.remove(sql, asMember(ines), f.id);
  await sql`update forms set deleted_at = now() - interval '31 days' where id = ${f.id}`;
  assert.ok(!(await forms.trash(sql, asMember(ines))).some(x => x.id === f.id));
  await answers.cleanup(sql);
  assert.equal((await sql`select 1 from forms where id = ${f.id}`).length, 0);
});

test("forms are searched by title, whatever the case and accents; untouched drafts go after a day", async () => {
  const { sql } = database;
  await forms.create(sql, asMember(ines), { definition: form([q("short", "x")], "Journée portes ouvertes") });
  assert.ok((await forms.list(sql, asMember(ines), "journee PORTES")).some(x => x.title === "Journée portes ouvertes"));
  assert.ok(!(await forms.list(sql, asMember(ines), "nothing like it")).length);
  const idle = await forms.create(sql, asMember(ines), { definition: form([], "") });
  const edited = await forms.create(sql, asMember(ines), { definition: form([], "") });
  await forms.saveDraft(sql, asMember(ines), edited.id, JSON.stringify(form([q("short", "x")], "Kept")), edited.revision);
  await sql`update forms set created_at = created_at - interval '2 days', updated_at = updated_at - interval '2 days' where id = ${idle.id}`;
  await sql`update forms set created_at = created_at - interval '2 days' where id = ${edited.id}`;
  await answers.cleanup(sql);
  assert.equal((await sql`select 1 from forms where id = ${idle.id}`).length, 0, "the untouched draft went");
  assert.equal((await sql`select 1 from forms where id = ${edited.id}`).length, 1, "an edited draft stays");
});

test("new answers by email to the people told, in the bell's batches, with the answer and Reply to the respondent", async () => {
  const { sql } = database;
  const name = q("short", "Your name");
  const email = q("email", "Your email");
  const { form: f } = await published(form([name, email], "Contact"), { watchers: [ines.id], notifyEmail: true }, ines);
  const before = chest.outbox.length;
  await take(sql, f, { version: f.version, answers: { [name.id]: "Nina", [email.id]: "nina@example.com" } }, null, "en");
  const mails = chest.outbox.slice(before).filter(m => m.subject.includes("Contact"));
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0]!.to, [ines.email]);
  assert.equal(mails[0]!.replyTo, "nina@example.com");
  assert.ok(mails[0]!.text.includes("Nina"), "the answer is in the email");
  assert.ok(mails[0]!.subject.startsWith("1 nouvelle réponse"), "in Inès's language: " + mails[0]!.subject);
  // A second answer within ten minutes waits for the batch, then goes with it.
  await take(sql, f, { version: f.version, answers: { [name.id]: "Tom" } }, null, "en");
  assert.equal(chest.outbox.slice(before).filter(m => m.subject.includes("Contact")).length, 1);
  await tell.pending(sql);
  const batch = chest.outbox.slice(before).filter(m => m.subject.includes("Contact"));
  assert.equal(batch.length, 2);
  assert.ok(batch[1]!.text.includes("Tom") && !batch[1]!.text.includes("Nina"), "only what is new");
  // An anonymous form's email never says what an answer holds.
  const text = alertText({ formId: "1", title: "Pulse", anonymous: true, answers: [], more: 0, replyTo: null }, 3, "en", "https://x.test/chest/forms/1/answers", "Europe/Paris");
  assert.ok(text.text.includes("anonymous") && text.subject === "3 new answers to Pulse");
});

test("forms.answered: each answer to the other tools when the form says so — never an anonymous form's", async () => {
  const { sql } = database;
  const name = q("short", "Your name", { key: "name" });
  const cv = q("file", "CV");
  const topic = q("choice", "Topic", { options: opts("Quote", "Order") });
  const { form: f, definition: def } = await published(form([name, cv, topic], "Leads"), { shareEvents: true }, ines);
  const before = chest.published.length;
  const { answer } = await answers.submit(sql, { form: f, version: f.version, answers: { [name.id]: "Nina", [topic.id]: { ids: [topic.options![0]!.id] } }, respondent: null, language: "fr", ...noFiles });
  const data = answeredData(f, def, { ...answer, data: { ...answer.data, [cv.id]: { file: "answers/1/x.pdf", name: "cv.pdf", type: "application/pdf", size: 3 } } });
  assert.deepEqual(data.fields.map(x => [x.key, x.label, x.value]), [["name", "Your name", "Nina"], [null, "CV", "cv.pdf"], [null, "Topic", "Quote"]]);
  assert.equal(data.member, null);
  await take(sql, f, { version: f.version, answers: { [name.id]: "Tom" } }, null, "en");
  const sent = chest.published.slice(before);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.type, "forms.answered");
  assert.equal((sent[0]!.data as { title: string }).title, "Leads");
  // Off by default, and never for an anonymous form (the setting cannot be on).
  const quiet = await published(form([name], "Quiet"), {}, ines);
  await take(sql, quiet.form, { version: quiet.form.version, answers: { [name.id]: "x" } }, null, "en");
  const mood = q("rating", "Mood", { required: true });
  const anon = await published(form([mood], "Pulse"), { audience: "team", anonymous: true, shareEvents: true }, camille);
  assert.equal(anon.form.shareEvents, false);
  await take(sql, anon.form, { version: anon.form.version, answers: { [mood.id]: 4 } }, asMember(tom), "en");
  assert.equal(chest.published.length, before + 1);
});

test("websites allowed to show the public forms: https addresses, managers only; the team's pages never framed", async () => {
  const { sql } = database;
  assert.deepEqual(sites("https://www.atelier-martin.fr/contact\nhttps://www.atelier-martin.fr, https://shop.example.com:8443"), ["https://www.atelier-martin.fr", "https://shop.example.com:8443"]);
  assert.throws(() => sites("http://insecure.example.com"), (e: unknown) => e instanceof AppError && e.code === "invalid_site");
  await refused(saveSites(sql, asMember(ines), "https://x.example.com"), "forbidden");
  assert.deepEqual(await saveSites(sql, asMember(camille), "https://www.atelier-martin.fr"), ["https://www.atelier-martin.fr"]);
  assert.equal(frameAncestors(["https://www.atelier-martin.fr"], false), "frame-ancestors 'self' https://www.atelier-martin.fr");
  assert.equal(frameAncestors(["https://www.atelier-martin.fr"], true), "frame-ancestors 'none'");
  assert.equal(frameAncestors([], false), "frame-ancestors 'none'");
});

test("a website allowed on the Share tab may frame the public forms on the very next request, as the proxy reads it", async () => {
  const { sql } = database;
  // Next.js runs proxy.ts in its own module instance, apart from the server
  // actions (whose saveSites once cleared only its own copy of a cache): load
  // lib/embed.ts a second time, as the proxy does, and read through db()
  // exactly as it calls it.
  const proxied = (await import(`../lib/embed.ts?proxy=${Date.now()}`)) as typeof import("../lib/embed.ts");
  await saveSites(sql, asMember(camille), "");
  assert.equal(proxied.frameAncestors(await proxied.embedOrigins(), false), "frame-ancestors 'none'");
  await saveSites(sql, asMember(camille), "https://www.atelier-martin.fr");
  assert.equal(proxied.frameAncestors(await proxied.embedOrigins(), false), "frame-ancestors 'self' https://www.atelier-martin.fr");
  await saveSites(sql, asMember(camille), "https://www.atelier-martin.fr\nhttps://shop.atelier-martin.fr");
  assert.deepEqual(await proxied.embedOrigins(), ["https://www.atelier-martin.fr", "https://shop.atelier-martin.fr"]);
  await saveSites(sql, asMember(camille), "");
  assert.deepEqual(await proxied.embedOrigins(), []);
});

test("pictures: checked by their first bytes, published under public/, swept when no form uses them", async () => {
  const { sql } = database;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(sniffImage(png), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("<svg>")), null);
  await refused(acceptImage("img.zz.png.1.sig", "covers"), "image_invalid");
  // A ticket the tool signed, for a file the browser sent.
  const { grantImage } = await import("../lib/images.ts");
  const g = await grantImage("image/png", png.length);
  const name = `uploads/team/${g.ticket.split(".")[1]}.png`;
  await files.put(name, png, "image/png");
  const image = await acceptImage(g.ticket, "covers");
  assert.match(image.object, /^public\/covers\/[0-9a-f]{20}\.png$/u);
  assert.equal(files.publicUrl(image.object, { version: image.version }).startsWith("/_chest/public/covers/"), true);
  const { form: f } = await published(form([q("short", "x")], "With cover"), {}, ines);
  await forms.setCover(sql, asMember(ines), f.id, image);
  await refused(forms.setCover(sql, asMember(hugo), f.id, null), "not_found");
  assert.equal(await sweepImages(sql, new Date(Date.now() + 2 * 86400000)), 0, "the cover is used");
  await forms.setCover(sql, asMember(ines), f.id, null);
  assert.equal(await sweepImages(sql, new Date(Date.now() + 2 * 86400000)), 1, "unused, it goes");
});

test("the builder's last save when the page goes away: the member's own, from the tool's pages only", async () => {
  const { sql } = database;
  const f = await forms.create(sql, asMember(ines), { definition: form([q("short", "x")], "Draft") });
  const body = (revision: number) => JSON.stringify({ text: JSON.stringify(form([q("short", "y")], "Saved on leave")), revision });
  const request = (who: typeof ines | null, site: string, revision = f.revision) => new Request(`http://tool/chest/forms/${f.id}/draft`, { method: "POST", body: body(revision), headers: { "Content-Type": "application/json", "Sec-Fetch-Site": site, ...(who ? { "Chest-Member": signAssertion(asMember(who)) } : {}) } });
  const params = { params: Promise.resolve({ id: f.id }) };
  assert.equal((await draftRoute(request(null, "same-origin"), params)).status, 401);
  assert.equal((await draftRoute(request(ines, "cross-site"), params)).status, 403);
  assert.equal((await draftRoute(request(hugo, "same-origin"), params)).status, 404);
  assert.equal((await draftRoute(request(ines, "same-origin"), params)).status, 200);
  assert.equal((await forms.open(sql, asMember(ines), f.id)).form.draft.title, "Saved on leave");
  assert.equal((await draftRoute(request(ines, "same-origin"), params)).status, 409, "an old revision is a conflict, never lost silently");
});
