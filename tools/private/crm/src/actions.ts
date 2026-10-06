import { action, after, fail, field, type Field, type MemberContext } from "@argentic/chest-app";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { catalogue, localeOf } from "./i18n/index.ts";
import * as activities from "./lib/activities.ts";
import { attach, detach, forgetObjects, uploadFolder } from "./lib/attachments.ts";
import { bulk, type BulkAction } from "./lib/bulk.ts";
import * as companies from "./lib/companies.ts";
import * as contacts from "./lib/contacts.ts";
import { db } from "./lib/db.ts";
import * as deals from "./lib/deals.ts";
import * as fields from "./lib/fields.ts";
import * as importers from "./lib/importers.ts";
import type { ImportReport } from "./lib/importers.ts";
import * as leads from "./lib/leads.ts";
import { mergeCompanies, mergeContacts } from "./lib/merge.ts";
import { lookalikes, type Lookalike } from "./lib/search.ts";
import * as share from "./lib/share.ts";
import * as stages from "./lib/stages.ts";
import { publishStep, reconcile } from "./lib/step-calendar.ts";
import * as steps from "./lib/steps.ts";
import * as tell from "./lib/tell.ts";
import { limits, memberPattern } from "./shared/model.ts";

// Every change of Clients, by name: the islands call them with
// call("addDeal", { … }); a form may post to /chest/actions/<name>. Each
// reads the member from the Chest's assertion (the package); the services
// (src/lib/) check what the member may do before anything is written, and
// refuse with a code, never a sentence. The fields read the shape of what
// the browser sends (an id, a member id, an amount, a day); the services
// check the rest (a name's length, an email's shape) with their own codes.
//
// What follows a change without being part of it — the bell, the tile's
// number, the members' calendars, the files left in the Chest, the events
// other tools hear — goes in after(): a Chest that does not answer never
// fails a change already written.

const id = field.id;
// A member of the Chest (an owner, the receiver of a lead): their id only.
const memberId: Field<string, string> = { read: value => (typeof value === "string" && memberPattern.test(value) ? value : fail("invalid")) };
// An owner: absent is "unchanged" (or "me" for something new), "" or null
// is nobody.
const owner = field.nullable(memberId);
// A text the service bounds itself (its code and bound are the ones said:
// "Too long: 160 characters at most."): read as sent, up to twice its
// bound, so the service's count of characters is the one that refuses.
const text = (max: number) => field.text({ min: 0, max: max * 2 });
// One that may be left out ("unchanged"); "" is kept: a detail cleared.
const optionalText = (max: number) => field.sent(text(max));
// The team's own fields of a record, by field id: an object (or nothing:
// unchanged), each value checked by shared/custom.ts.
const custom: Field<object | undefined, Record<string, string> | undefined> = {
  read: value => (value === undefined || value === null ? undefined : typeof value === "object" && !Array.isArray(value) ? value : fail("invalid")),
};
// What something is about: a deal, a contact, a company.
const on = { deal: field.optional(id()), contact: field.optional(id()), company: field.optional(id()) };
const where = (input: { deal?: string | undefined; contact?: string | undefined; company?: string | undefined }) => ({
  ...(input.deal ? { deal: input.deal } : {}), ...(input.contact ? { contact: input.contact } : {}), ...(input.company ? { company: input.company } : {}),
});
// The fields sent (absent ones left out: "unchanged").
const defined = <T extends Record<string, unknown>>(input: T) => Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };

// What a deletion leaves to settle, once answered: the bell items of the
// steps that went, the tiles' numbers, the stored files, the calendars.
function settle(gone: { steps: { id: string; owner: string | null }[]; objects: string[] }): void {
  after("settle a deletion", async () => {
    for (const s of gone.steps) await tell.stepSettled(s.id);
    await tell.refreshBadges(db(), gone.steps.map(s => s.owner));
    await forgetObjects(gone.objects);
    await reconcile(db());
  });
}
// The calendars caught up with steps changed in bulk (lib/step-calendar.ts).
const calendars = () => after("calendars", () => reconcile(db()));

const company = { name: optionalText(limits.name), website: optionalText(limits.website), phone: optionalText(limits.phone), email: optionalText(limits.email), address: optionalText(limits.address), postcode: optionalText(limits.postcode), city: optionalText(limits.city), country: optionalText(limits.country), siren: optionalText(30), vat: optionalText(30), industry: optionalText(limits.industry), notes: optionalText(limits.notes), tags: optionalText(400), owner, custom };
const contact = { name: optionalText(limits.name), email: optionalText(limits.email), phone: optionalText(limits.phone), phone2: optionalText(limits.phone), url: optionalText(limits.url), title: optionalText(limits.title), company: field.nullable(id()), notes: optionalText(limits.notes), tags: optionalText(400), owner, custom };
// A deal's amount as the person typed it ("12 500", "12,500.50"): cents.
const deal = { title: optionalText(limits.dealTitle), company: field.nullable(id()), contact: field.nullable(id()), value: field.nullable(field.money({ max: limits.maxCents })), expectedClose: field.nullable(field.day()), custom };
const step = { text: text(limits.step), due: field.day(), time: field.nullable(field.text({ max: 5 })), owner };
const listFilter = { q: optionalText(limits.query), owner: field.optional(field.text({ max: 40 })), tag: optionalText(limits.tag), stale: field.bool(), cf: field.optional(field.text({ max: 20 })), cv: optionalText(100), cmin: field.optional(field.text({ max: 30 })), cmax: field.optional(field.text({ max: 30 })) };
const importOptions = { fileName: optionalText(limits.fileName), ownerFallback: field.optional(field.text({ max: 40 })), fillEmpty: field.bool() };
const importBody = limits.importBytes * 2 + (64 << 10);

export const actions = {
  // ---- Companies.
  addCompany: action(company, async (input, { member }): Promise<{ id: string; name: string }> =>
    companies.addCompany(db(), member, { ...defined(input), name: input.name ?? "" })),
  updateCompany: action({ id: id(), ...company }, async ({ id, ...input }, { member }): Promise<null> => {
    await companies.updateCompany(db(), member, id, defined(input));
    return null;
  }),
  deleteCompany: action({ id: id() }, async ({ id }, { member }): Promise<null> => {
    settle({ steps: [], ...(await companies.deleteCompany(db(), member, id)) });
    return null;
  }),

  // ---- Contacts.
  addContact: action(contact, async (input, { member }): Promise<{ id: string; name: string }> =>
    contacts.addContact(db(), member, { ...defined(input), name: input.name ?? "" })),
  updateContact: action({ id: id(), ...contact }, async ({ id, ...input }, { member }): Promise<null> => {
    await contacts.updateContact(db(), member, id, defined(input));
    calendars();
    return null;
  }),
  deleteContact: action({ id: id() }, async ({ id }, { member }): Promise<null> => {
    settle(await contacts.deleteContact(db(), member, id));
    return null;
  }),

  // ---- Leads from the forms (My day), a contact that may be another, and
  // the form answers a manager checks (lib/leads.ts).
  takeLead: action({ id: id(), to: field.optional(memberId) }, async ({ id, to }, { member }): Promise<{ name: string }> => {
    const taken = await leads.takeLead(db(), member, id, to);
    after("lead given", () => tell.leadGiven(member, taken.owner, taken));
    return { name: taken.name };
  }),
  dismissLead: action({ id: id() }, async ({ id }, { member }): Promise<null> => { await leads.dismissLead(db(), member, id); return null; }),
  restoreLead: action({ id: id() }, async ({ id }, { member }): Promise<null> => { await leads.restoreLead(db(), member, id); return null; }),
  keepApart: action({ id: id() }, async ({ id }, { member }): Promise<null> => { await leads.keepApart(db(), member, id); return null; }),
  markFormLine: action({ id: id(), checked: field.bool() }, async ({ id, checked }, { member }): Promise<null> => { await leads.markChecked(db(), member, id, checked); return null; }),
  moveFormLine: action({ id: id(), to: field.text({ max: 20 }) }, async ({ id, to }, { member }): Promise<{ contact: string }> => leads.moveLine(db(), member, id, to)),

  // ---- Many at once, and duplicates merged.
  bulkChange: action({ table: field.choice(["companies", "contacts", "deals"]), ids: field.list(id(), limits.bulk), kind: field.choice(["assign", "tag", "untag", "delete"]), owner, tag: optionalText(limits.tag) },
    async ({ table, ids, kind, owner: to, tag }, { member }): Promise<{ done: number; skipped: number }> => {
      const change: BulkAction = kind === "assign" ? { kind, owner: to ?? null } : kind === "delete" ? { kind } : { kind, tag: tag ?? "" };
      const done = await bulk(db(), member, table, ids, change);
      settle(done);
      after("deals given", async () => { for (const g of done.given) await tell.dealGiven(member, g.owner, g); });
      return { done: done.done, skipped: done.skipped };
    }),
  // Every id a list's filters match ("Select all 1,240"), up to 500.
  matchingIds: action({ table: field.choice(["companies", "contacts"]), ...listFilter }, async ({ table, ...f }, { member }): Promise<string[]> => {
    const field = fields.fieldFilterOf(key => String(f[key as "cf"] ?? ""));
    const filter = { ...(f.q ? { q: f.q } : {}), ...(f.owner ? { owner: f.owner } : {}), ...(f.tag ? { tag: f.tag } : {}), ...(field ? { field } : {}) };
    return table === "companies" ? companies.companyIds(db(), member, filter) : contacts.contactIds(db(), member, { ...filter, stale: f.stale });
  }, { parallel: true }),
  merge: action({ table: field.choice(["companies", "contacts"]), from: id(), into: id() }, async ({ table, from, into }, { member }): Promise<{ id: string }> => {
    const done = await (table === "companies" ? mergeCompanies(db(), member, from, into) : mergeContacts(db(), member, from, into));
    calendars();
    return done;
  }),

  // ---- Asked while a person types (nothing changes: parallel; the island
  // calls them with refresh: false).
  checkLookalikes: action({ kind: field.choice(["company", "contact"]), name: optionalText(limits.name), email: optionalText(limits.email), website: optionalText(limits.website), except: field.optional(id()) },
    async ({ kind, ...input }, { member }): Promise<Lookalike[]> => lookalikes(db(), member, { kind, ...defined(input) }), { parallel: true }),
  pickCompanies: action({ q: field.text({ min: 0, max: limits.query * 2 }) },
    async ({ q }, { member }): Promise<{ id: string; name: string; detail: string }[]> => companies.companyChoices(db(), member, q), { parallel: true }),
  pickContacts: action({ q: field.text({ min: 0, max: limits.query * 2 }), company: field.optional(id()) },
    async ({ q, company: of }, { member }): Promise<{ id: string; name: string; detail: string; companyId: string | null; companyName: string | null }[]> => contacts.contactChoices(db(), member, q, of ?? null), { parallel: true }),

  // ---- Deals.
  addDeal: action({ ...deal, stage: field.optional(id()), owner }, async (input, { member }): Promise<{ id: string }> => {
    const d = await deals.addDeal(db(), member, { ...defined(input), title: input.title ?? "", value: input.value ?? 0 });
    after("deal given", () => tell.dealGiven(member, d.owner, d));
    return { id: d.id };
  }),
  updateDeal: action({ id: id(), ...deal }, async ({ id, value, ...input }, { member }): Promise<null> => {
    await deals.updateDeal(db(), member, id, { ...defined(input), ...(value !== undefined ? { value: value ?? 0 } : {}) });
    calendars();
    return null;
  }),
  // A deal dragged on the board (between two deals of the stage), or moved
  // on its page; into Won or Lost with a reason.
  moveDeal: action({ id: id(), stage: id(), after: field.optional(id()), before: field.optional(id()), reason: optionalText(limits.reason) },
    async ({ id, stage, after: low, before: high, reason }, { member }): Promise<null> => {
      const sql = db();
      const done = await deals.moveDeal(sql, member, id, stage, low ?? null, high ?? null, reason);
      after("deal shared", () => share.moved(sql, done.deal, done.from, done.to));
      return null;
    }),
  setDealOwner: action({ id: id(), owner: field.nullable(memberId) }, async ({ id, owner: to }, { member }): Promise<null> => {
    const done = await deals.setOwner(db(), member, id, to ?? null);
    after("deal owner", async () => {
      await reconcile(db());
      await tell.dealSettled(id);
      await tell.dealGiven(member, done.given, done.deal);
    });
    return null;
  }),
  deleteDeal: action({ id: id() }, async ({ id }, { member }): Promise<null> => {
    settle(await deals.deleteDeal(db(), member, id));
    after("deal settled", () => tell.dealSettled(id));
    return null;
  }),

  // ---- What happened.
  logActivity: action({ ...on, kind: field.choice(["call", "meeting", "email", "note"]), body: optionalText(limits.body) },
    async (input, { member }): Promise<{ id: string }> => ({ id: (await activities.log(db(), member, where(input), input.kind, input.body ?? "")).id })),
  editActivity: action({ id: id(), body: text(limits.body) }, async ({ id, body }, { member }): Promise<null> => { await activities.edit(db(), member, id, body); return null; }),
  removeActivity: action({ id: id() }, async ({ id }, { member }): Promise<null> => { await activities.remove(db(), member, id); return null; }),
  restoreActivity: action({ id: id() }, async ({ id }, { member }): Promise<null> => { await activities.restore(db(), member, id); return null; }),

  // ---- Next steps: on a deal, on a contact, or one's own (neither).
  addStep: action({ deal: field.optional(id()), contact: field.optional(id()), ...step }, async ({ deal: d, contact: c, ...input }, { member }): Promise<{ id: string }> => {
    const sql = db();
    const done = await steps.addStep(sql, member, d ? { deal: d } : c ? { contact: c } : null, defined(input) as Parameters<typeof steps.addStep>[3]);
    after("step planned", async () => {
      await publishStep(sql, done.step.id);
      if (done.given) await tell.stepGiven(member, done.given, done.step, await titleOf(member, done.step));
      await tell.refreshBadges(sql, [done.step.owner]);
    });
    return { id: done.step.id };
  }),
  updateStep: action({ id: id(), ...step }, async ({ id, ...input }, { member }): Promise<null> => {
    const sql = db();
    const done = await steps.updateStep(sql, member, id, defined(input) as Parameters<typeof steps.updateStep>[3]);
    after("step changed", async () => {
      await publishStep(sql, done.step.id);
      if (done.previousOwner && done.previousOwner !== done.step.owner) await tell.stepSettled(done.step.id, [done.previousOwner]);
      if (done.given) await tell.stepGiven(member, done.given, done.step, await titleOf(member, done.step));
      await tell.refreshBadges(sql, [done.previousOwner, done.step.owner]);
    });
    return null;
  }),
  completeStep: action({ id: id() }, async ({ id }, { member }): Promise<{ last: boolean }> => {
    const sql = db();
    const done = await steps.completeStep(sql, member, id);
    after("step done", async () => {
      await publishStep(sql, done.step.id);
      await tell.stepSettled(done.step.id);
      await tell.refreshBadges(sql, [done.step.owner]);
    });
    return { last: done.last };
  }),
  reopenStep: action({ id: id() }, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    const s = await steps.reopenStep(sql, member, id);
    after("step reopened", async () => { await publishStep(sql, s.id); await tell.refreshBadges(sql, [s.owner]); });
    return null;
  }),
  clearStep: action({ id: id() }, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    const s = await steps.clearStep(sql, member, id);
    after("step cleared", async () => { await publishStep(sql, s.id); await tell.stepSettled(s.id); await tell.refreshBadges(sql, [s.owner]); });
    return null;
  }),

  // ---- Files on a record: the browser sends the bytes to the Chest
  // itself. uploadFile answers where (one upload, into the record's
  // folder); attachFile records it once the Chest holds it.
  uploadFile: action({ ...on, size: field.int({ min: 0, max: Number.MAX_SAFE_INTEGER }) }, async ({ size, ...input }, { member }): Promise<{ url: string }> => {
    const folder = await uploadFolder(db(), member, where(input), size);
    return chestAnswer(async () => ({ url: (await files.uploadUrl(folder, { maxSize: limits.attachmentSize, expiresIn: 600 })).url }));
  }, { parallel: true }),
  attachFile: action({ ...on, name: field.text({ max: 300 }), fileName: optionalText(limits.fileName) }, async ({ name, fileName, ...input }, { member }): Promise<{ id: string }> => {
    const sql = db();
    // Checked against the record's folder before asking the Chest anything.
    await uploadFolder(sql, member, where(input), 0);
    const held = await chestAnswer(() => files.stat(name).catch(error => { if (error instanceof ChestError && error.code === "invalid_name") return null; throw error; }));
    if (!held) return fail("file_missing");
    const saved = await attach(sql, member, where(input), { object: held.name, fileName: fileName ?? "", type: held.type, size: held.size });
    return { id: saved.id };
  }, { parallel: true }),
  removeFile: action({ id: id() }, async ({ id }, { member }): Promise<null> => {
    const object = await detach(db(), member, id);
    after("file forgotten", () => forgetObjects([object]));
    return null;
  }),

  // ---- Stages (managers).
  addStage: action({ name: text(limits.stageName), probability: field.int({ min: 0, max: 100 }) }, async (input, { member }): Promise<null> => { await stages.addStage(db(), member, input); return null; }),
  updateStage: action({ id: id(), name: optionalText(limits.stageName), probability: field.optional(field.int({ min: 0, max: 100 })) },
    async ({ id, ...input }, { member }): Promise<null> => { await stages.updateStage(db(), member, id, defined(input)); return null; }),
  moveStage: action({ id: id(), direction: field.choice(["up", "down"]) }, async ({ id, direction }, { member }): Promise<null> => { await stages.moveStage(db(), member, id, direction); return null; }),
  removeStage: action({ id: id() }, async ({ id }, { member }): Promise<null> => { await stages.removeStage(db(), member, id); return null; }),

  // ---- The team's own fields (managers).
  addField: action({ object: field.choice(["companies", "contacts", "deals"]), label: text(60), kind: field.choice(["text", "number", "date", "choice"]), options: optionalText(4000) },
    async (input, { member }): Promise<null> => { await fields.addField(db(), member, defined(input) as Parameters<typeof fields.addField>[2]); return null; }),
  updateField: action({ id: id(), label: optionalText(60), options: optionalText(4000) },
    async ({ id, ...input }, { member }): Promise<null> => { await fields.updateField(db(), member, id, defined(input)); return null; }),
  moveField: action({ id: id(), direction: field.choice(["up", "down"]) }, async ({ id, direction }, { member }): Promise<null> => { await fields.moveField(db(), member, id, direction); return null; }),
  removeField: action({ id: id() }, async ({ id }, { member }): Promise<null> => { await fields.removeField(db(), member, id); return null; }),

  // ---- Import: the page read the file to show what will come; the server
  // reads it again (never trusting the page's reading). A file of 5 MB at
  // most (limits.importBytes; its JSON a little more, counted while read);
  // slow: parallel.
  importTable: action({ kind: field.choice(["companies", "contacts", "deals", "activities"]), text: field.text({ max: limits.importBytes }), mapping: field.list(field.text({ min: 0, max: 80 }), 200), ...importOptions },
    async ({ kind, text: body, mapping, ...options }, { member }): Promise<ImportReport> => {
      const t = catalogue(localeOf(member.language));
      const report = await importers.importTable(db(), member, kind, body, mapping, t.stages, defined(options));
      calendars();
      return report;
    }, { maxBody: importBody, parallel: true }),
  importVcards: action({ text: field.text({ max: limits.importBytes }), ...importOptions },
    async ({ text: body, ...options }, { member }): Promise<ImportReport> => importers.importVcards(db(), member, body, defined(options)), { maxBody: importBody, parallel: true }),
  // The owners a file names who are not in the team (asked before importing).
  importOwners: action({ names: field.list(field.text({ max: 200 }), 500) }, async ({ names }, { member }): Promise<string[]> => importers.unknownOwners(member, names), { parallel: true }),
  undoImport: action({ id: id() }, async ({ id }, { member }): Promise<{ removed: number }> => {
    const done = await importers.undoImport(db(), member, id);
    settle(done);
    return { removed: done.removed };
  }),
};

// The deal or the contact a step is about, for the bell.
async function titleOf(member: MemberContext["member"], s: steps.Step): Promise<{ kind: "deal" | "contact"; id: string; title: string } | null> {
  const sql = db();
  if (s.dealId) return { kind: "deal", id: s.dealId, title: (await deals.deal(sql, member, s.dealId)).title };
  if (s.contactId) return { kind: "contact", id: s.contactId, title: (await contacts.contact(sql, member, s.contactId)).name };
  return null;
}

// The Chest's answer, or the action refused: too large for the Chest, or
// the Chest unreachable.
async function chestAnswer<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof ChestError) return fail(error.code === "too_large" ? "file_too_large" : "unavailable");
    throw error;
  }
}
