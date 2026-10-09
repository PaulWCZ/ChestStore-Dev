import type { Member } from "@argentic/chest-sdk/member";
import { action as act, after, fail, field, type Field } from "@argentic/chest-app";
import { can } from "./lib/access.ts";
import * as arrivals from "./lib/arrivals.ts";
import * as changes from "./lib/changes.ts";
import { db } from "./lib/db.ts";
import { examples, profilePhrase } from "./lib/examples.ts";
import * as fields from "./lib/fields.ts";
import * as importer from "./lib/importer.ts";
import * as j from "./lib/journeys.ts";
import * as letters from "./lib/letters.ts";
import * as offline from "./lib/offline.ts";
import * as profiles from "./lib/profiles.ts";
import * as recordImport from "./lib/record-import.ts";
import * as records from "./lib/records.ts";
import * as share from "./lib/share.ts";
import * as tell from "./lib/tell.ts";
import { welcome, type Welcomed } from "./lib/welcome.ts";
import { today } from "./lib/zone.ts";
import { formatDay } from "./shared/format.ts";
import { documentKinds, itemRoles, kinds, limits, memberPattern } from "./shared/model.ts";

// Every mutation of People, by name: POST /chest/actions/<name>, called
// from the islands with call("tickItem", { id, done }). Each reads the
// member from the Chest's assertion. Its fields say what may come in —
// a row's id, a member's id, a day, a choice, a text and its bound — and
// refuse anything else at the door (a code, in the reader's words); the
// services (src/lib/) then check who may do it and their own rules, with
// their own codes ("cycle", "dates"…). A structured value an island sends
// (a profile's parts, a record's fields, an import's choices) is a json()
// the service reads key by key.
//
// The package runs a page's actions one at a time; a service that reads
// then writes still does it in one transaction holding a lock (the
// managers' advisory lock, a record's row), for two pages at once.

// A member's id (mbr_ + 26 letters and digits).
const person = (): Field<string> => ({ read: value => (typeof value === "string" && memberPattern.test(value) ? value : fail("invalid")) });
// A member, or nobody (null or ""): a manager, who does a step.
const someone = () => field.nullable(person());
const ref = field.id;
// Text the service bounds again (its own code and bound are the ones said).
const words = (max: number) => field.text({ min: 0, max });
const named = (max: number) => field.text({ max });
// A spreadsheet's text, read on the server (2 MiB at most, as the file
// picker says); the importer reads its rows and refuses what it cannot.
const sheet = (): Field<string> => ({ read: value => (typeof value !== "string" ? fail("invalid") : value.length > limits.importBytes ? fail("too_large") : value) });
// One cell of HR's table: a job field or an extra field ("x:<id>").
const cellKey = (): Field<string> => ({ read: value => (typeof value === "string" && (/^(title|team|office|managerId|startDate|phone)$/u.test(value) || /^x:[1-9][0-9]{0,17}$/u.test(value)) ? value : fail("invalid")) });

// A CSV file read on the server, with the choices of the mapping step.
const file = { maxBody: 4 << 20 };

// A tick, an Undo of one, a step removed: the person's to-do, HR's
// "complete" (or "open again") follow, once the answer is sent (after():
// the bell and the badges never stand in its way).
function afterTick(actor: Member, ticked: j.Ticked): void {
  after("tick told", async () => {
    const sql = db();
    if (ticked.assignee) await tell.todo(sql, actor, { id: ticked.journeyId }, [ticked.assignee]);
    if (ticked.completed) await tell.completed(sql, ticked.journeyId, actor);
    if (ticked.reopened) await tell.reopened(ticked.journeyId);
  });
}

// A day of a plan written in the reader's words (the import's preview):
// written here, on the server, never in the browser.
function daysOf(values: Iterable<string>, locale: string): Record<string, string> {
  const days: Record<string, string> = {};
  for (const v of values) if (/^\d{4}-\d{2}-\d{2}$/u.test(v)) days[v] = formatDay(v, locale, { day: "numeric", month: "short", year: "numeric" });
  return days;
}

export const actions = {
  // ---- Profiles: what a person writes about themselves (own), the job
  // fields HR keeps (job), and the values of HR's extra fields (extras).
  // Any part may be absent. The newcomer's "fill in your profile" step
  // ticks itself once they did.
  //
  // Every part is checked — rights, then values — before any is written:
  // a part refused leaves the others as they were (a member's own part
  // with HR's job part they may not send saves nothing).
  saveProfile: act({ id: person(), own: field.optional(field.json()), job: field.optional(field.json()), extras: field.optional(field.json()) }, async ({ id, own, job, extras }, { member }): Promise<null> => {
    const sql = db();
    if (own !== undefined && (id !== member.id || !can(member, "profile.own"))) return fail("forbidden");
    if (job !== undefined && !can(member, "profile.job")) return fail("forbidden");
    if (own !== undefined) profiles.readOwn(own);
    const values = extras === undefined ? [] : Array.isArray(extras) ? fail("invalid") : Object.entries(extras as Record<string, unknown>);
    if (values.length > limits.fields) return fail("invalid");
    for (const [fieldId, value] of values) await fields.checkValue(sql, member, id, fieldId, value);
    if (job !== undefined) await profiles.updateJob(sql, member, id, job);
    if (own !== undefined) {
      const saved = await profiles.updateOwn(sql, member, own);
      if (profiles.filled(saved)) for (const ticked of await j.autoTick(sql, member.id, profilePhrase)) afterTick(member, ticked);
    }
    for (const [fieldId, value] of values) await fields.setValue(sql, member, id, fieldId, value);
    return null;
  }),

  // One cell of HR's table: a job field ("title", "team", "office",
  // "managerId", "startDate", "phone") or an extra field ("x:<id>").
  // An empty manager or start date is none (null); an empty text, "".
  saveCell: act({ member: person(), key: cellKey(), value: field.nullable(words(limits.fieldValue)) }, async ({ member: who, key, value }, { member }): Promise<null> => {
    const sql = db();
    if (key.startsWith("x:")) await fields.setValue(sql, member, who, key.slice(2), value ?? "");
    else await profiles.updateJob(sql, member, who, { [key]: key === "managerId" || key === "startDate" ? value ?? null : value ?? "" });
    return null;
  }),

  // HR's extra profile fields.
  addField: act({ label: named(limits.fieldLabel), editor: field.choice(["person", "hr"]), seen: field.optional(field.choice(["everyone", "private"])), kind: field.optional(field.choice(["text", "date", "choice"])), options: field.optional(words(4000)), alertDays: field.optional(words(3)) },
    (input, { member }): Promise<fields.Extra> => fields.addField(db(), member, input)),
  updateField: act({ id: ref(), label: named(limits.fieldLabel), editor: field.choice(["person", "hr"]), seen: field.optional(field.choice(["everyone", "private"])), options: field.optional(words(4000)), alertDays: field.optional(words(3)) },
    async ({ id, ...input }, { member }): Promise<null> => { await fields.updateField(db(), member, id, input); return null; }),
  removeField: act({ id: ref(), removed: field.bool() },
    async ({ id, removed }, { member }): Promise<null> => { await fields.removeField(db(), member, id, removed); return null; }),

  // ---- Checklists: ticking a step (or unticking it).
  tickItem: act({ id: ref(), done: field.bool() }, async ({ id, done }, { member }): Promise<null> => {
    afterTick(member, await j.tick(db(), member, id, done));
    return null;
  }),

  // Templates.
  createTemplate: act({ kind: field.choice(kinds), name: named(limits.templateName) }, (input, { member }): Promise<{ id: string }> => j.createTemplate(db(), member, input)),
  addExampleTemplates: act({}, (_input, { member, t }): Promise<string[]> => j.addExamples(db(), member, examples(t))),
  renameTemplate: act({ id: ref(), name: named(limits.templateName) }, async ({ id, name }, { member }): Promise<null> => { await j.renameTemplate(db(), member, id, name); return null; }),
  archiveTemplate: act({ id: ref(), archived: field.bool() }, async ({ id, archived }, { member }): Promise<null> => { await j.archiveTemplate(db(), member, id, archived); return null; }),
  addTemplateItem: act({ id: ref(), text: named(limits.itemText), role: field.choice(itemRoles), memberId: field.optional(person()), offset: field.int({ min: -1000, max: 1000 }) },
    ({ id, ...input }, { member }): Promise<j.TemplateItem> => j.addTemplateItem(db(), member, id, input as Parameters<typeof j.addTemplateItem>[3])),
  updateTemplateItem: act({ id: ref(), text: named(limits.itemText), role: field.choice(itemRoles), memberId: field.optional(person()), offset: field.int({ min: -1000, max: 1000 }) },
    ({ id, ...input }, { member }): Promise<j.TemplateItem> => j.updateTemplateItem(db(), member, id, input as Parameters<typeof j.addTemplateItem>[3])),
  removeTemplateItem: act({ id: ref() }, ({ id }, { member }): Promise<j.TemplateItem> => j.removeTemplateItem(db(), member, id)),

  // Starting a checklist. A leaving checklist sets the person's last day:
  // other tools are told (share.around). A welcome checklist: the newcomer
  // gets a short welcome (lib/welcome.ts: a notification to a member, an
  // email to an arrival not in the Chest yet), and the page says which.
  startChecklist: act({ personId: field.optional(person()), arrivalId: field.optional(ref()), managerId: someone(), templateId: ref(), anchor: field.day() },
    async (input, { member }): Promise<{ id: string; welcomed: Welcomed }> => {
      const sql = db();
      const leaving = input.personId !== undefined && input.arrivalId === undefined ? input.personId : null;
      const started = await share.around(sql, leaving, () => j.startJourney(sql, member, input));
      after("checklist told", () => tell.todo(db(), member, started, started.assignees.keys()));
      const welcomed = started.kind === "onboarding" ? await welcome(sql, member, started.id) : null;
      return { id: started.id, welcomed };
    }),
  addChecklistItem: act({ id: ref(), text: named(limits.itemText), assignee: someone(), due: field.day() }, async ({ id, ...input }, { member }): Promise<null> => {
    const { item, ticked } = await j.addJourneyItem(db(), member, id, input);
    after("step told", async () => {
      if (item.assignee) await tell.todo(db(), member, { id: ticked.journeyId }, [item.assignee]);
      if (ticked.reopened) await tell.reopened(ticked.journeyId);
    });
    return null;
  }),
  updateChecklistItem: act({ id: ref(), text: field.optional(named(limits.itemText)), assignee: someone(), due: field.optional(field.day()) }, async ({ id, ...input }, { member }): Promise<null> => {
    const changed = await j.updateJourneyItem(db(), member, id, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
    if (changed.before !== changed.item.assignee) {
      after("step told", () => tell.todo(db(), member, { id: changed.journeyId }, [changed.before, changed.item.assignee].filter((x): x is string => x !== null)));
    }
    return null;
  }),
  removeChecklistItem: act({ id: ref(), removed: field.bool() }, async ({ id, removed }, { member }): Promise<null> => {
    afterTick(member, await j.removeJourneyItem(db(), member, id, removed));
    return null;
  }),
  // Stopping (or restarting) a leaving checklist changes the person's
  // departure: other tools are told.
  stopChecklist: act({ id: ref(), stopped: field.bool() }, async ({ id, stopped }, { member }): Promise<null> => {
    const sql = db();
    const it = await j.about(sql, id).catch(() => null);
    const { assignees } = await share.around(sql, it?.personId ?? null, () => j.stopJourney(sql, member, id, stopped));
    after("checklist told", () => (stopped ? tell.settled(db(), id, assignees) : tell.todo(db(), member, { id }, assignees)));
    return null;
  }),
  deleteChecklist: act({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    const { assignees } = await j.deleteJourney(db(), member, id);
    after("checklist told", () => tell.settled(db(), id, assignees));
    return null;
  }),

  // ---- Import: the page shows the plan (with HR's choices of columns and
  // date order); the import reads the file again with the same choices.
  previewImport: act({ text: sheet(), choices: field.optional(field.json()) }, async ({ text, choices }, { member, locale }): Promise<importer.Plan & { days: Record<string, string> }> => {
    const plan = await importer.previewImport(db(), member, text, readChoices(choices));
    return { ...plan, days: daysOf(plan.rows.flatMap(r => [...Object.values(r.changes), ...Object.values(r.extras)]), locale) };
  }, file),
  applyImport: act({ text: sheet(), choices: field.optional(field.json()) }, ({ text, choices }, { member }): Promise<{ updated: number; skipped: number; loops: string[] }> =>
    importer.applyImport(db(), member, text, readChoices(choices)), file),

  // HR records from a spreadsheet (Lucca, BambooHR, HR's own file).
  previewRecords: act({ text: sheet(), choices: field.optional(field.json()) }, async ({ text, choices }, { member, locale }): Promise<recordImport.Plan & { days: Record<string, string> }> => {
    const plan = await recordImport.previewRecords(db(), member, text, readChoices(choices));
    return { ...plan, days: daysOf(plan.rows.flatMap(r => Object.values(r.changes)), locale) };
  }, file),
  applyRecords: act({ text: sheet(), choices: field.optional(field.json()) }, ({ text, choices }, { member }): Promise<{ created: number; updated: number; skipped: number }> =>
    recordImport.applyRecords(db(), member, text, readChoices(choices)), file),

  // ---- Arrivals written by HR by hand.
  addArrival: act({ input: field.json() }, async ({ input }, { member }): Promise<{ id: string }> => ({ id: (await arrivals.addArrival(db(), member, input as arrivals.ArrivalInput)).id })),
  updateArrival: act({ id: ref(), input: field.json() }, async ({ id, input }, { member }): Promise<null> => { await arrivals.updateArrival(db(), member, id, input as arrivals.ArrivalInput); return null; }),
  // Arrivals told by other tools: linked to the member they became, or
  // removed (with the checklists started for them).
  linkArrival: act({ id: ref(), memberId: person() }, async ({ id, memberId }, { member }): Promise<null> => {
    const sql = db();
    const linked = await arrivals.linkArrival(sql, member, id, memberId);
    after("arrival linked told", async () => {
      for (const journey of linked.journeys) {
        const open = await db()<{ assignee: string }[]>`select distinct assignee from journey_items where journey_id = ${journey} and assignee like 'mbr_%'`;
        await tell.todo(db(), member, { id: journey }, open.map(r => r.assignee));
      }
    });
    return null;
  }),
  removeArrival: act({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    const { journeys } = await arrivals.removeArrival(db(), member, id);
    after("arrival removed told", async () => { for (const journey of journeys) await tell.settled(db(), journey.id, journey.assignees); });
    return null;
  }),

  // ---- HR records.
  createRecord: act({ memberId: field.optional(person()), legalName: field.optional(named(limits.name)) }, (input, { member }): Promise<{ id: string }> => records.createRecord(db(), member, input)),
  createAllRecords: act({}, (_input, { member }): Promise<number> => records.createForEveryone(db(), member)),
  saveRecord: act({ id: ref(), input: field.json() }, ({ id, input }, { member }): Promise<{ changed: string[] }> => records.updateRecord(db(), member, id, input)),
  deleteRecord: act({ id: ref() }, async ({ id }, { member }): Promise<null> => { await records.deleteRecord(db(), member, id, today()); return null; }),
  linkRecord: act({ id: ref(), memberId: someone() }, async ({ id, memberId }, { member }): Promise<null> => { await records.linkRecord(db(), member, id, memberId ?? null); return null; }),
  // Someone without the Chest in the directory and the org chart.
  savePlacement: act({ id: ref(), listed: field.bool(), team: words(limits.team), managerId: someone() },
    async ({ id, ...input }, { member }): Promise<null> => { await offline.setPlacement(db(), member, id, input); return null; }),
  // A record's documents: an upload address of the Chest's, then the file
  // recorded once it is there; removed (after the toast's Undo had its time).
  documentUpload: act({ id: ref(), type: words(120), size: field.int({ min: 0, max: 2 ** 40 }) }, ({ id, ...input }, { member }): Promise<{ url: string }> => records.documentUpload(db(), member, id, input)),
  documentAdded: act({ id: ref(), object: named(400), name: named(limits.documentName), kind: field.choice(documentKinds) }, ({ id, ...input }, { member }): Promise<records.Document> => records.addDocument(db(), member, id, input)),
  removeDocument: act({ id: ref(), document: ref() }, async ({ id, document }, { member }): Promise<null> => { await records.removeDocument(db(), member, id, document); return null; }),

  // A change the person asks for their record (address, emergency
  // contact), and HR's answer.
  askChange: act({ id: ref(), input: field.json() }, async ({ id, input }, { member }): Promise<null> => { await changes.askChange(db(), member, id, input); return null; }),
  withdrawChange: act({ id: ref() }, async ({ id }, { member }): Promise<null> => { await changes.withdrawChange(db(), member, id); return null; }),
  decideChange: act({ id: ref(), accept: field.bool(), answer: field.optional(words(300)) }, async ({ id, accept, answer }, { member }): Promise<null> => { await changes.decideChange(db(), member, id, accept, answer ?? ""); return null; }),

  // ---- Letters from templates (HR).
  addLetterExamples: act({}, (_input, { member, t }): Promise<string[]> => letters.addExamples(db(), member, t)),
  saveLetter: act({ id: field.nullable(ref()), name: named(80), body: named(8000) }, ({ id, ...input }, { member }): Promise<letters.Letter> => letters.saveLetter(db(), member, id ?? null, input)),
  removeLetter: act({ id: ref(), removed: field.bool() }, async ({ id, removed }, { member }): Promise<null> => { await letters.removeLetter(db(), member, id, removed); return null; }),
};

// The import's choices, an object or nothing.
function readChoices(value: unknown): importer.Choices {
  return value && typeof value === "object" && !Array.isArray(value) ? value as importer.Choices : {};
}
