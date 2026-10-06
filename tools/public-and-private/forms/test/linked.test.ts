import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { idempotencyKey } from "@argentic/chest-sdk/mail";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as webhooks from "@argentic/chest-sdk/webhooks";
import { seen } from "@argentic/chest-app/db";
import { AppError } from "../src/lib/app-error.ts";
import * as answers from "../src/lib/answers.ts";
import * as forms from "../src/lib/forms.ts";
import * as hooks from "../src/lib/hooks.ts";
import { catalogue } from "../src/i18n/index.ts";
import { installed, links, mailState, startOf } from "../src/lib/linked.ts";
import { take } from "../src/lib/respond.ts";
import { guessRoutes } from "../src/lib/routes.ts";
import { putSetting } from "../src/lib/settings.ts";
import { template } from "../src/lib/templates.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { form, opts, q } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

// Round 3 (critique of 2026-09-29): the links to Clients and Support right
// by default — the Contact template mapped, a better first guess, greyed
// while the receiving tool is not installed, each answer saying where it
// went, no second email when Support confirms —; the owner's alerts on
// for a public form; each answer sent to web addresses (webhooks).
let database: TestDatabase;
let chest: FakeChest;
// The tool's /chest-webhooks, as src/app.tsx answers it.
const webhookEvents = async (request: Request) => new Response(null, { status: await webhooks.handle(request, { disabled: event => hooks.told(database.sql, event) }, { seen }) });
before(async () => {
  process.env["CHEST_TOOL"] = "forms";
  chest = await fakeChest({
    members: everyone,
    capabilities: ["members", "files", "notifications", "mail"],
    mail: { domain: "atelier.test", mailboxes: [] },
    emits: ["forms.answered", "forms.contact", "forms.request"],
    receivers: 1,
    chest: { organization: "Atelier Martin", language: "en" },
    webhooks: { max: 200, to: webhookEvents },
    network: {},
  });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => {
  chest.removeTool("crm");
  chest.removeTool("helpdesk");
  for (const type of Object.keys(chest.linked)) delete chest.linked[type];
});

const refused = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;
const slack = "https://hooks.slack.com/services/T0001/B0001/abcdefghijklmnopqrstuvwx";

test("the first guess reads the kinds of the questions, never their words: the Contact template maps a real subject, the message as details, and its company", () => {
  const t = catalogue("fr");
  const contact = template("contact", t).definition;
  const qs = contact.pages[0]!.questions;
  const by = (title: string) => qs.find(x => x.title === title)!.id;
  const w = t.templates.contact;
  const g = guessRoutes(contact);
  assert.deepEqual(g.contact, { name: by(w.name_), email: by(w.email), phone: by(w.phone), company: by(w.company), message: by(w.message) });
  // Round 3: the subject was "the form's title" and the details "no question".
  assert.deepEqual(g.request, { subject: by(w.topic), details: by(w.message), email: by(w.email), name: by(w.name_) });
  const itForm = template("it", t).definition;
  const it = itForm.pages[0]!.questions;
  const gi = guessRoutes(itForm).request;
  assert.equal(gi.subject, it.find(x => x.title === t.templates.it.need)!.id);
  assert.equal(gi.details, it.find(x => x.title === t.templates.it.describe)!.id);
  // Nothing of a kind: nothing guessed (a ticket's subject is then the title).
  const only = q("email", "Mail");
  assert.deepEqual(guessRoutes(form([only])).request, { subject: null, details: null, email: only.id, name: null });
});

test("a new Contact form starts linked to Clients when an admin linked Clients to Forms, and with the owner's alerts by email on (a public form, mail not missing)", async () => {
  const { sql } = database;
  const made = template("contact", catalogue("en"));
  assert.deepEqual(installed(), { contact: false, request: false });
  assert.deepEqual(await links(), { contact: "not_installed", request: "not_installed" });
  const alone = await forms.create(sql, asMember(ines), await startOf(sql, made));
  assert.equal(alone.routes.contact, null, "nothing would receive it");
  assert.equal(alone.notifyEmail, true);
  chest.installTool("crm");
  assert.deepEqual(installed(), { contact: true, request: false });
  // Installed is not enough (studio.16, events.receivers): until an admin
  // links the two tools, every contact would publish into nothing.
  assert.deepEqual(await links(), { contact: "not_linked", request: "not_installed" });
  assert.equal((await forms.create(sql, asMember(ines), await startOf(sql, made))).routes.contact, null, "installed, not linked: off");
  chest.linked["forms.contact"] = ["crm"];
  assert.deepEqual(await links(), { contact: "linked", request: "not_installed" });
  const linked = await forms.create(sql, asMember(ines), await startOf(sql, made));
  assert.deepEqual(linked.routes.contact, guessRoutes(made.definition).contact);
  assert.equal(linked.routes.request, null, "Support stays the author's choice");
  // A team form: no alert by email by default; a Chest known without mail: none.
  assert.equal((await forms.create(sql, asMember(ines), await startOf(sql, template("it", catalogue("en"))))).notifyEmail, false);
  // The Chest says whether it sends email (studio.16, mail.available):
  // not connected, alerts start off; paused, they start on (it passes).
  chest.delivery.mail = "not_connected";
  try {
    assert.equal(await mailState(sql), "not_connected");
    assert.equal((await forms.create(sql, asMember(ines), await startOf(sql, made))).notifyEmail, false);
    chest.delivery.mail = "suspended";
    assert.equal(await mailState(sql), "paused");
    assert.equal((await forms.create(sql, asMember(ines), await startOf(sql, made))).notifyEmail, true);
  } finally {
    chest.delivery.mail = "ready";
  }
  // What the last email taught no longer overrules the Chest's own word.
  await putSetting(sql, "mail_works", false);
  assert.equal(await mailState(sql), "ready");
  await putSetting(sql, "mail_works", true);
});

async function published(def: ReturnType<typeof form>, settings: Record<string, unknown>) {
  const { sql } = database;
  const audience = (settings["audience"] as "public" | "team" | undefined) ?? "public";
  const f = await forms.create(sql, asMember(ines), { definition: def, settings: { audience } });
  await forms.saveSettings(sql, asMember(ines), f.id, { audience, layout: "steps", accent: "berry", watchers: [ines.id], ...settings }, null);
  await forms.publish(sql, asMember(ines), f.id);
  return (await forms.open(sql, asMember(ines), f.id)).form;
}

const name = q("short", "Your name");
const mail = q("email", "Your email");
const topic = q("dropdown", "What is it about?", { options: opts("A quote", "An order") });
const message = q("long", "Your message");
const def = form([name, mail, topic, message], "Contact us");
const reply = (email = "nina@example.com") => ({ [name.id]: "Nina Roux", [mail.id]: email, [topic.id]: { ids: [topic.options![0]!.id] }, [message.id]: "Six oak chairs." });
const routes = { contact: { name: name.id, email: mail.id, message: message.id }, request: { subject: topic.id, details: message.id, email: mail.id, name: name.id } };
const lastAnswer = async (formId: string) => (await database.sql<{ id: string; sent: string[] }[]>`select id, sent from answers where form_id = ${formId} order by created_at desc limit 1`)[0]!;

test("one message, one email: when Support opens a ticket of it (and confirms), Forms sends no copy; without Support, the copy goes; the answer says where it went", async () => {
  const { sql } = database;
  chest.installTool("crm");
  chest.installTool("helpdesk");
  chest.linked["forms.contact"] = ["crm"];
  chest.linked["forms.request"] = ["helpdesk"];
  const f = await published(def, { sendCopy: true, routes });
  const before = chest.outbox.length;
  const r = await take(sql, f, { version: f.version, answers: reply() }, null, "en", { copyAsked: true });
  assert.deepEqual(r, { copy: false });
  assert.equal(chest.outbox.slice(before).filter(m => JSON.stringify(m.to).includes("nina@example.com")).length, 0, "Support confirms: no copy from Forms");
  const a = await lastAnswer(f.id);
  assert.deepEqual(a.sent, ["forms.contact", "forms.request"]);
  assert.deepEqual((await answers.oneAnswer(sql, asMember(ines), f.id, a.id)).answer.sent, ["forms.contact", "forms.request"]);
  // Support installed but not linked (studio.16): no ticket, nobody
  // confirms, so the copy goes; the answer does not claim a ticket.
  chest.linked["forms.request"] = [];
  const unlinked = await take(sql, f, { version: f.version, answers: reply() }, null, "en", { copyAsked: true });
  assert.deepEqual(unlinked, { copy: true });
  const unlinkedAnswer = await lastAnswer(f.id);
  assert.deepEqual(unlinkedAnswer.sent, ["forms.contact", "copy"]);
  // The recipient in the copy's key (studio.16).
  assert.equal(chest.outbox.at(-1)!.key, idempotencyKey(`copy:${unlinkedAnswer.id}:nina@example.com`));
  chest.linked["forms.request"] = ["helpdesk"];
  // Support not installed: nobody confirms, so the copy goes.
  chest.removeTool("helpdesk");
  // (Another address: one copy an address a day for a form.)
  const again = await take(sql, f, { version: f.version, answers: reply("nina.roux@example.com") }, null, "en", { copyAsked: true });
  assert.deepEqual(again, { copy: true });
  assert.ok((await lastAnswer(f.id)).sent.includes("copy"));
  // No route, a copy: only the copy.
  const plain = await published(def, { sendCopy: true });
  await take(sql, plain, { version: plain.version, answers: reply() }, null, "en", { copyAsked: true });
  assert.deepEqual((await lastAnswer(plain.id)).sent, ["copy"]);
});

test("web addresses: a form's editors add Slack, Teams or a signed receiver; checked before the Chest is asked; a receiver's secret said once; five at most", async () => {
  const { sql } = database;
  const f = await published(def, {});
  await assert.rejects(hooks.addHook(sql, asMember(hugo), f.id, { url: slack, kind: "slack", label: "Sales" }), refused("not_found"), "not theirs: not found");
  await assert.rejects(hooks.addHook(sql, asMember(ines), f.id, { url: "https://example.com/x", kind: "slack", label: "Sales" }), refused("webhook_slack"));
  await assert.rejects(hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "generic", label: "Sales" }), refused("webhook_address"));
  await assert.rejects(hooks.addHook(sql, asMember(ines), f.id, { url: "https://10.0.0.7/x", kind: "generic", label: "Inside" }), refused("webhook_address"));
  await assert.rejects(hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "  " }), refused("empty"));
  const s = await hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "Sales channel" });
  assert.equal(s.secret, null);
  assert.ok(!s.hook.shown.includes("abcdefghijklmnopqrstuvwx"), "the secret path is never shown again");
  const g = await hooks.addHook(sql, asMember(ines), f.id, { url: "https://hooks.zapier.example.com/hooks/catch/1/abc", kind: "generic", label: "Zapier → Sheets" });
  assert.match(g.secret!, /^whsec_/u);
  const listed = await hooks.hooksOf(sql, asMember(camille), f.id);
  assert.equal(listed.available, true);
  assert.deepEqual(listed.hooks.map(h => h.label), ["Sales channel", "Zapier → Sheets"]);
  for (let i = 0; i < 3; i++) await hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: `More ${i}` });
  await assert.rejects(hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "Sixth" }), refused("at_most"));
  // An anonymous form's answers are never sent anywhere.
  const pulse = await published(form([q("rating", "Mood")], "Pulse"), { audience: "team", anonymous: true });
  await assert.rejects(hooks.addHook(sql, asMember(ines), pulse.id, { url: slack, kind: "slack", label: "Team" }), refused("invalid"));
});

test("each new answer goes to the form's addresses: the channel reads the form, the answers and a link; the receiver gets the fields as JSON; the answer says so", async () => {
  const { sql } = database;
  const f = await published(def, {});
  const s = await hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "Sales channel" });
  const g = await hooks.addHook(sql, asMember(ines), f.id, { url: "https://hooks.zapier.example.com/hooks/catch/2/def", kind: "generic", label: "Zapier" });
  await take(sql, f, { version: f.version, answers: reply() }, null, "fr");
  const a = await lastAnswer(f.id);
  const toSlack = chest.webhooks.deliveries.filter(d => d.target === s.hook.id);
  assert.equal(toSlack.length, 1);
  assert.equal(toSlack[0]!.text.split("\n")[0], "New answer to “Contact us”", "in the Chest's language");
  assert.ok(toSlack[0]!.text.includes("Your message: Six oak chairs."));
  assert.ok(toSlack[0]!.text.includes(`/chest/forms/${f.id}/answers/${a.id}`), "a link to the answer");
  const toZapier = chest.webhooks.deliveries.filter(d => d.target === g.hook.id);
  const data = toZapier[0]!.data as { form: { id: string }; answer: { id: string }; fields: { label: string; value: unknown }[]; email: string };
  assert.equal(data.answer.id, a.id);
  assert.equal(data.email, "nina@example.com");
  assert.deepEqual(data.fields.find(x => x.label === "Your name")?.value, "Nina Roux");
  assert.ok(a.sent.includes("webhooks"));
  // Delivered: Settings says the last answer arrived.
  assert.equal((await hooks.hooksOf(sql, asMember(ines), f.id)).hooks.find(h => h.id === s.hook.id)?.status, "delivered");
});

test("an address that keeps failing is stopped by the Chest: Settings says so, the form's owner is told, Try again; removed, the Chest forgets it", async () => {
  const { sql } = database;
  const f = await published(def, {});
  const s = await hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "Gone channel" });
  chest.webhooks.respond(s.hook.id, 404);
  chest.notifications.splice(0);
  await take(sql, f, { version: f.version, answers: reply() }, null, "en", { copyAsked: true });
  const listed = (await hooks.hooksOf(sql, asMember(ines), f.id)).hooks.find(h => h.id === s.hook.id)!;
  assert.equal(listed.disabled, true);
  const [row] = await sql<{ disabled_at: Date | null; last_error: string }[]>`select disabled_at, last_error from form_hooks where id = ${s.hook.id}`;
  assert.ok(row!.disabled_at, "webhook.disabled marked it");
  assert.ok(chest.notifications.some(n => n.member === ines.id && n.title.includes("Gone channel") && n.path === `/chest/forms/${f.id}/settings`), "its owner hears of it, in French");
  // A stopped address is not sent to.
  const before = chest.webhooks.deliveries.length;
  await take(sql, f, { version: f.version, answers: reply() }, null, "en", { copyAsked: true });
  assert.equal(chest.webhooks.deliveries.filter(d => d.target === s.hook.id).length, chest.webhooks.deliveries.slice(0, before).filter(d => d.target === s.hook.id).length);
  chest.webhooks.respond(s.hook.id, 200);
  await hooks.enableHook(sql, asMember(ines), f.id, s.hook.id);
  assert.equal((await hooks.hooksOf(sql, asMember(ines), f.id)).hooks.find(h => h.id === s.hook.id)!.disabled, false);
  await hooks.removeHook(sql, asMember(ines), f.id, s.hook.id);
  assert.ok(!chest.webhooks.targets.some(t => t.id === s.hook.id));
  await assert.rejects(hooks.removeHook(sql, asMember(ines), f.id, s.hook.id), refused("not_found"));
});

// studio.16: Settings asks the Chest before offering the form to add an
// address (webhooks.available), rather than learning it from a failure.
test("a Chest that paused Forms' sending: Settings says so, adding is refused in words, the addresses are kept", async () => {
  const { sql } = database;
  const f = await published(def, {});
  const kept = await hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "Paused channel" });
  assert.equal((await hooks.hooksOf(sql, asMember(ines), f.id)).delivery, "ready");
  chest.delivery.webhooks = "suspended";
  try {
    const listed = await hooks.hooksOf(sql, asMember(ines), f.id);
    assert.deepEqual({ available: listed.available, delivery: listed.delivery }, { available: false, delivery: "suspended" });
    assert.ok(listed.hooks.some(h => h.id === kept.hook.id), "kept");
    await assert.rejects(hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "Another" }), refused("webhooks_suspended"));
  } finally {
    chest.delivery.webhooks = "ready";
  }
});

test("a Chest without webhooks yet: Settings says so; answers are kept all the same", async () => {
  const { sql } = database;
  const plain = await fakeChest({ members: everyone, capabilities: ["members", "notifications"] });
  try {
    const f = await published(def, {});
    const listed = await hooks.hooksOf(sql, asMember(ines), f.id);
    assert.equal(listed.available, false);
    assert.equal(listed.delivery, "not_granted");
    await assert.rejects(hooks.addHook(sql, asMember(ines), f.id, { url: slack, kind: "slack", label: "Sales" }), refused("webhooks_unavailable"));
    assert.deepEqual(await take(sql, f, { version: f.version, answers: reply() }, null, "en"), { copy: false });
  } finally {
    await plain.close();
  }
});

test("a seeded form bilingual: its title in the reader's language on the home page", async () => {
  const { sql } = database;
  const d = { ...form([q("short", "Name")], "Contact us"), language: "en" as const, alt: { language: "fr" as const, texts: { title: "Contactez-nous" } } };
  const f = await forms.create(sql, asMember(ines), { definition: d, settings: { audience: "public" } });
  assert.equal((await forms.list(sql, asMember(ines), "")).find(x => x.id === f.id)?.title, "Contactez-nous", "Inès reads French");
  assert.equal((await forms.list(sql, asMember({ ...ines, language: "en" }), "")).find(x => x.id === f.id)?.title, "Contact us");
  assert.ok((await forms.list(sql, asMember({ ...ines, language: "en" }), "contactez")).some(x => x.id === f.id), "found by either title");
});
