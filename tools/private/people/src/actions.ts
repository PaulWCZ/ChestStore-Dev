import type { Member } from "@argentic/chest-sdk/member";
import { action as act, after, fail, field, type Field } from "@argentic/chest-app";
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
import { welcome } from "./lib/welcome.ts";
import { today } from "./lib/zone.ts";
import { formatDay } from "./shared/format.ts";

// Every mutation of People, by name: POST /chest/actions/<name>, called
// from the islands with call("tickItem", { id, done }). Each reads the
// member from the Chest's assertion; the services (src/lib/) check what
// the member may do and refuse with a code (shared/app-error.ts), never a
// sentence — the package answers the code and the reader's sentence.
//
// The fields are taken as sent (given()): every service reads its input
// as unknown and checks it itself, with its own bounds and codes ("Too
// long: 80 characters at most.", "cycle"…), as it did for the Next.js
// server actions it served before; a choice or a box is checked here.
//
// call() runs actions side by side (two ticks, a cell and its Undo): each
// service that reads then writes does it in one transaction holding a
// lock (the managers' advisory lock, the row's own `for update`).

// A value the service reads and checks itself (call() may leave it out).
const given = (): Field<unknown> & { readonly omissible: true } => ({ omissible: true, read: value => value });

// A CSV file read on the server (2 MiB at most, as the file picker says),
// with the choices of the mapping step.
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
  saveProfile: act({ id: given(), own: given(), job: given(), extras: given() }, async ({ id, own, job, extras }, { member }): Promise<null> => {
    const sql = db();
    if (own !== null && own !== undefined) {
      if (id !== member.id) return fail("forbidden");
      const saved = await profiles.updateOwn(sql, member, own);
      if (profiles.filled(saved)) for (const ticked of await j.autoTick(sql, member.id, profilePhrase)) afterTick(member, ticked);
    }
    if (job !== null && job !== undefined) await profiles.updateJob(sql, member, id, job);
    if (extras && typeof extras === "object" && !Array.isArray(extras)) {
      for (const [fieldId, value] of Object.entries(extras).slice(0, 50)) await fields.setValue(sql, member, id, fieldId, value);
    }
    return null;
  }),

  // One cell of HR's table: a job field ("title", "team", "office",
  // "managerId", "startDate", "phone") or an extra field ("x:<id>").
  saveCell: act({ member: given(), key: given(), value: given() }, async ({ member: person, key, value }, { member }): Promise<null> => {
    const sql = db();
    if (typeof key === "string" && key.startsWith("x:")) await fields.setValue(sql, member, person, key.slice(2), value ?? "");
    else if (typeof key === "string" && ["title", "team", "office", "managerId", "startDate", "phone"].includes(key)) await profiles.updateJob(sql, member, person, { [key]: value });
    else fail("invalid");
    return null;
  }),

  // HR's extra profile fields.
  addField: act({ label: given(), editor: given(), seen: given(), kind: given(), options: given(), alertDays: given() },
    (input, { member }): Promise<fields.Extra> => fields.addField(db(), member, input)),
  updateField: act({ id: given(), label: given(), editor: given(), seen: given(), options: given(), alertDays: given() },
    async ({ id, ...input }, { member }): Promise<null> => { await fields.updateField(db(), member, id, input); return null; }),
  removeField: act({ id: given(), removed: field.bool() },
    async ({ id, removed }, { member }): Promise<null> => { await fields.removeField(db(), member, id, removed); return null; }),

  // ---- Checklists: ticking a step (or unticking it).
  tickItem: act({ id: given(), done: field.bool() }, async ({ id, done }, { member }): Promise<null> => {
    afterTick(member, await j.tick(db(), member, id, done));
    return null;
  }),

  // Templates.
  createTemplate: act({ kind: given(), name: given() }, (input, { member }): Promise<{ id: string }> => j.createTemplate(db(), member, input)),
  addExampleTemplates: act({}, (_input, { member, t }): Promise<string[]> => j.addExamples(db(), member, examples(t))),
  renameTemplate: act({ id: given(), name: given() }, async ({ id, name }, { member }): Promise<null> => { await j.renameTemplate(db(), member, id, name); return null; }),
  archiveTemplate: act({ id: given(), archived: field.bool() }, async ({ id, archived }, { member }): Promise<null> => { await j.archiveTemplate(db(), member, id, archived); return null; }),
  addTemplateItem: act({ id: given(), text: given(), role: given(), memberId: given(), offset: given() },
    ({ id, ...input }, { member }): Promise<j.TemplateItem> => j.addTemplateItem(db(), member, id, input as Parameters<typeof j.addTemplateItem>[3])),
  updateTemplateItem: act({ id: given(), text: given(), role: given(), memberId: given(), offset: given() },
    ({ id, ...input }, { member }): Promise<j.TemplateItem> => j.updateTemplateItem(db(), member, id, input as Parameters<typeof j.addTemplateItem>[3])),
  removeTemplateItem: act({ id: given() }, ({ id }, { member }): Promise<j.TemplateItem> => j.removeTemplateItem(db(), member, id)),

  // Starting a checklist. A leaving checklist sets the person's last day:
  // other tools are told (share.around). A welcome checklist: the newcomer
  // gets a short welcome email (lib/welcome.ts), and the page says so once
  // it left.
  startChecklist: act({ personId: given(), arrivalId: given(), managerId: given(), templateId: given(), anchor: given() },
    async (input, { member }): Promise<{ id: string; welcomed: boolean }> => {
      const sql = db();
      const person = typeof input.personId === "string" && !input.arrivalId ? input.personId : null;
      const started = await share.around(sql, person, () => j.startJourney(sql, member, input));
      after("checklist told", () => tell.todo(db(), member, started, started.assignees.keys()));
      const welcomed = started.kind === "onboarding" ? await welcome(sql, member, started.id) : false;
      return { id: started.id, welcomed };
    }),
  addChecklistItem: act({ id: given(), text: given(), assignee: given(), due: given() }, async ({ id, ...input }, { member }): Promise<null> => {
    const { item, ticked } = await j.addJourneyItem(db(), member, id, input);
    after("step told", async () => {
      if (item.assignee) await tell.todo(db(), member, { id: ticked.journeyId }, [item.assignee]);
      if (ticked.reopened) await tell.reopened(ticked.journeyId);
    });
    return null;
  }),
  updateChecklistItem: act({ id: given(), text: given(), assignee: given(), due: given() }, async ({ id, ...input }, { member }): Promise<null> => {
    const changed = await j.updateJourneyItem(db(), member, id, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
    if (changed.before !== changed.item.assignee) {
      after("step told", () => tell.todo(db(), member, { id: changed.journeyId }, [changed.before, changed.item.assignee].filter((x): x is string => x !== null)));
    }
    return null;
  }),
  removeChecklistItem: act({ id: given(), removed: field.bool() }, async ({ id, removed }, { member }): Promise<null> => {
    afterTick(member, await j.removeJourneyItem(db(), member, id, removed));
    return null;
  }),
  // Stopping (or restarting) a leaving checklist changes the person's
  // departure: other tools are told.
  stopChecklist: act({ id: given(), stopped: field.bool() }, async ({ id, stopped }, { member }): Promise<null> => {
    const sql = db();
    const it = typeof id === "string" && /^\d{1,18}$/u.test(id) ? await j.about(sql, id).catch(() => null) : null;
    const { assignees } = await share.around(sql, it?.personId ?? null, () => j.stopJourney(sql, member, id, stopped));
    after("checklist told", () => (stopped ? tell.settled(db(), String(id), assignees) : tell.todo(db(), member, { id: String(id) }, assignees)));
    return null;
  }),
  deleteChecklist: act({ id: given() }, async ({ id }, { member }): Promise<null> => {
    const { assignees } = await j.deleteJourney(db(), member, id);
    after("checklist told", () => tell.settled(db(), String(id), assignees));
    return null;
  }),

  // ---- Import: the page shows the plan (with HR's choices of columns and
  // date order); the import reads the file again with the same choices.
  previewImport: act({ text: given(), choices: given() }, async ({ text, choices }, { member, locale }): Promise<importer.Plan & { days: Record<string, string> }> => {
    const plan = await importer.previewImport(db(), member, text, readChoices(choices));
    return { ...plan, days: daysOf(plan.rows.flatMap(r => [...Object.values(r.changes), ...Object.values(r.extras)]), locale) };
  }, file),
  applyImport: act({ text: given(), choices: given() }, ({ text, choices }, { member }): Promise<{ updated: number; skipped: number; loops: string[] }> =>
    importer.applyImport(db(), member, text, readChoices(choices)), file),

  // HR records from a spreadsheet (Lucca, BambooHR, HR's own file).
  previewRecords: act({ text: given(), choices: given() }, async ({ text, choices }, { member, locale }): Promise<recordImport.Plan & { days: Record<string, string> }> => {
    const plan = await recordImport.previewRecords(db(), member, text, readChoices(choices));
    return { ...plan, days: daysOf(plan.rows.flatMap(r => Object.values(r.changes)), locale) };
  }, file),
  applyRecords: act({ text: given(), choices: given() }, ({ text, choices }, { member }): Promise<{ created: number; updated: number; skipped: number }> =>
    recordImport.applyRecords(db(), member, text, readChoices(choices)), file),

  // ---- Arrivals written by HR by hand.
  addArrival: act({ input: given() }, async ({ input }, { member }): Promise<{ id: string }> => ({ id: (await arrivals.addArrival(db(), member, input as arrivals.ArrivalInput)).id })),
  updateArrival: act({ id: given(), input: given() }, async ({ id, input }, { member }): Promise<null> => { await arrivals.updateArrival(db(), member, id, input as arrivals.ArrivalInput); return null; }),
  // Arrivals told by other tools: linked to the member they became, or
  // removed (with the checklists started for them).
  linkArrival: act({ id: given(), memberId: given() }, async ({ id, memberId }, { member }): Promise<null> => {
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
  removeArrival: act({ id: given() }, async ({ id }, { member }): Promise<null> => {
    const { journeys } = await arrivals.removeArrival(db(), member, id);
    after("arrival removed told", async () => { for (const journey of journeys) await tell.settled(db(), journey.id, journey.assignees); });
    return null;
  }),

  // ---- HR records.
  createRecord: act({ memberId: given(), legalName: given() }, (input, { member }): Promise<{ id: string }> => records.createRecord(db(), member, input)),
  createAllRecords: act({}, (_input, { member }): Promise<number> => records.createForEveryone(db(), member)),
  saveRecord: act({ id: given(), input: given() }, ({ id, input }, { member }): Promise<{ changed: string[] }> => records.updateRecord(db(), member, id, input)),
  deleteRecord: act({ id: given() }, async ({ id }, { member }): Promise<null> => { await records.deleteRecord(db(), member, id, today()); return null; }),
  linkRecord: act({ id: given(), memberId: given() }, async ({ id, memberId }, { member }): Promise<null> => { await records.linkRecord(db(), member, id, memberId ?? null); return null; }),
  // Someone without the Chest in the directory and the org chart.
  savePlacement: act({ id: given(), listed: given(), team: given(), managerId: given() },
    async ({ id, ...input }, { member }): Promise<null> => { await offline.setPlacement(db(), member, id, input); return null; }),
  // A record's documents: an upload address of the Chest's, then the file
  // recorded once it is there; removed (after the toast's Undo had its time).
  documentUpload: act({ id: given(), type: given(), size: given() }, ({ id, ...input }, { member }): Promise<{ url: string }> => records.documentUpload(db(), member, id, input)),
  documentAdded: act({ id: given(), object: given(), name: given(), kind: given() }, ({ id, ...input }, { member }): Promise<records.Document> => records.addDocument(db(), member, id, input)),
  removeDocument: act({ id: given(), document: given() }, async ({ id, document }, { member }): Promise<null> => { await records.removeDocument(db(), member, id, document); return null; }),

  // A change the person asks for their record (address, emergency
  // contact), and HR's answer.
  askChange: act({ id: given(), input: given() }, async ({ id, input }, { member }): Promise<null> => { await changes.askChange(db(), member, id, input); return null; }),
  withdrawChange: act({ id: given() }, async ({ id }, { member }): Promise<null> => { await changes.withdrawChange(db(), member, id); return null; }),
  decideChange: act({ id: given(), accept: field.bool(), answer: given() }, async ({ id, accept, answer }, { member }): Promise<null> => { await changes.decideChange(db(), member, id, accept, answer ?? ""); return null; }),

  // ---- Letters from templates (HR).
  addLetterExamples: act({}, (_input, { member, t }): Promise<string[]> => letters.addExamples(db(), member, t)),
  saveLetter: act({ id: given(), name: given(), body: given() }, ({ id, ...input }, { member }): Promise<letters.Letter> => letters.saveLetter(db(), member, id ?? null, input)),
  removeLetter: act({ id: given(), removed: field.bool() }, async ({ id, removed }, { member }): Promise<null> => { await letters.removeLetter(db(), member, id, removed); return null; }),
};

// The import's choices, an object or nothing.
function readChoices(value: unknown): importer.Choices {
  return value && typeof value === "object" && !Array.isArray(value) ? value as importer.Choices : {};
}
