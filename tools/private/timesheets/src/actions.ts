import { action, field, fail, type Field } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { everyone } from "./lib/directory.ts";
import * as entries from "./lib/entries.ts";
import * as handoff from "./lib/handoff.ts";
import { forgetFormer, planImport, runImport, type ImportOptions, type ImportPlan } from "./lib/import.ts";
import * as invoicing from "./lib/invoicing.ts";
import * as projects from "./lib/projects.ts";
import * as rates from "./lib/rates.ts";
import * as settings from "./lib/settings.ts";
import * as timer from "./lib/timer.ts";
import * as weeks from "./lib/weeks.ts";
import { catalogue, localeOf } from "./i18n/index.ts";
import { parseHours, withoutCurrency } from "./shared/amounts.ts";
import { parseDuration } from "./shared/duration.ts";
import { maxBytes, type DateOrder } from "./shared/import-formats.ts";
import { limits } from "./shared/model.ts";

// Every mutation of Timesheets, by name (POST /chest/actions/<name>): the
// member is the one the Chest asserts on each call, never anything in the
// input. An island calls them with call("saveCell", {…}); the page is read
// again after each (the timer on top of every page with it). The rules are
// in src/lib/: every service takes (sql, actor, …input), checks who may do
// what from the actor, reads and bounds its input itself, and refuses with
// a code the reader sees in their words (src/i18n, errors). So most fields
// below take what was sent as it is ("sent"): the service checks it.
// What a person types — a duration, an amount, hours — is sent as typed and
// read here, with the same rules as the island that showed it
// (src/shared/): "1,5" and "1.5" are both an hour and a half.

// A value as sent, for a service that reads and checks it; W: what an
// island may send (the type call() checks).
const sent = <W>(): Field<unknown, W> => ({ read: value => value });
// The same, which the caller may leave out (undefined: not sent).
const maybe = <W>(): Field<unknown, W | undefined> => ({ read: value => value });
const one = { id: sent<string>() };

// A duration as typed in a cell or a form: "1:30", "1.5", "1,5", "90m",
// "1h30" (src/shared/duration.ts); "" is 0 (a cell emptied).
const duration: Field<number, string> = {
  read(value) {
    const minutes = typeof value === "string" ? parseDuration(value) : null;
    return minutes === null ? fail("bad_duration") : minutes;
  },
};
// Hours as typed: "35", "35.5", "35,5", "35:30" (src/shared/amounts.ts);
// "" or nothing: none (the company's usual week).
const hours: Field<number | null, string | null> = {
  read(value) {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return null;
    const minutes = typeof value === "string" ? parseHours(value) : null;
    return minutes === null ? fail("invalid") : minutes;
  },
};
// An amount of money as typed ("80", "80,50", "1 234.50"), in cents
// (field.money); "" or nothing: none.
// A currency sign or code typed beside it is set aside ("€80", "80 €");
// "1,200" alone is amount_ambiguous ("write 1200 or 1,200.00").
const money = (max: number): Field<number | null, string | null> => {
  const cents = field.money({ min: 0, max });
  return { read: value => (value === undefined || value === null || value === "" ? null : cents.read(typeof value === "string" ? withoutCurrency(value) : value)) };
};
const rateMoney = money(limits.rateCents);
const budgetMoney = money(limits.budgetCents);

// A project as the form sends it: the rate and the budget as typed.
type ProjectSent = {
  name: string; clientId?: string | null; newClient?: string; color: string; billable: boolean; rate: string;
  budget: { kind: "none" } | { kind: "hours" | "money"; text: string };
  everyone: boolean; people: string[]; lead?: string | null; rateFrom?: string; tasks?: string[];
};
function projectInput(value: unknown): projects.ProjectInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("invalid");
  const p = value as Partial<Record<keyof ProjectSent, unknown>>;
  const b = p.budget as { kind?: unknown; text?: unknown } | undefined;
  let budget: projects.Budget = { kind: "none" };
  if (b && b.kind === "hours") {
    const minutes = hours.read(b.text);
    budget = minutes ? { kind: "hours", minutes } : fail("invalid");
  } else if (b && b.kind === "money") {
    const cents = budgetMoney.read(b.text);
    budget = cents ? { kind: "money", cents } : fail("invalid");
  } else if (b && b.kind !== "none") fail("invalid");
  return {
    name: p.name, color: p.color, billable: p.billable, rateCents: rateMoney.read(p.rate), budget, everyone: p.everyone, people: p.people,
    ...(p.lead !== undefined ? { lead: p.lead } : {}),
    ...(p.rateFrom !== undefined ? { rateFrom: p.rateFrom } : {}),
    ...(p.newClient !== undefined ? { newClient: p.newClient } : { clientId: p.clientId ?? null }),
    ...(p.tasks !== undefined ? { tasks: p.tasks } : {}),
  };
}

// The import's choices; the people of the Chest are read here, once per call.
type ImportChoices = { order: DateOrder | null; former: "keep" | "skip"; locked: "import" | "skip" };
async function importOptions(actor: Member, value: unknown): Promise<ImportOptions> {
  if (!can(actor, "import")) fail("forbidden");
  const choices = (value !== null && typeof value === "object" ? value : {}) as Partial<ImportChoices>;
  const people = (await everyone()).map(p => ({ id: p.id, name: p.name }));
  return {
    people,
    noProject: catalogue(localeOf(actor.language)).importer.noProject,
    former: choices.former === "skip" ? "skip" : "keep",
    locked: choices.locked === "import" ? "import" : "skip",
    ...(choices.order === "dmy" || choices.order === "mdy" ? { order: choices.order } : {}),
  };
}
const importInput = { text: sent<string>(), choices: sent<ImportChoices>() };
// A file of 5 MB at most, as JSON (escapes make it longer).
const importBody = { maxBody: maxBytes * 2 + 65_536 };

type Row = { week: string; projectId: string; taskId: string | null };
const row = { week: sent<string>(), projectId: sent<string>(), taskId: sent<string | null>() };
const entry = { projectId: sent<string>(), taskId: sent<string | null>(), day: sent<string>(), duration, note: maybe<string>(), billable: maybe<boolean>() };
const rateTarget = { kind: sent<"bill" | "cost">(), projectId: maybe<string | null>(), memberId: maybe<string | null>() };

export const actions = {
  // ——— The timer ———
  startTimer: action({ projectId: sent<string>(), taskId: sent<string | null>(), note: sent<string>() }, (input, { member }): Promise<{ stopped: entries.Entry | null }> => timer.startTimer(db(), member, input)),
  updateTimer: action({ projectId: maybe<string>(), taskId: maybe<string | null>(), note: maybe<string>() }, async (input, { member }): Promise<null> => {
    // Only what was sent changes.
    await timer.updateTimer(db(), member, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
    return null;
  }),
  // at: an instant chosen in the forgotten timer's dialog; none: now.
  stopTimer: action({ at: maybe<string>() }, (input, { member }): Promise<{ entry: entries.Entry | null; day: string }> => timer.stopTimer(db(), member, input.at)),
  discardTimer: action({}, (_input, { member }): Promise<timer.Discarded> => timer.discardTimer(db(), member)),
  restoreTimer: action({ discarded: sent<timer.Discarded>() }, async ({ discarded }, { member }): Promise<null> => {
    if (discarded === null || typeof discarded !== "object") fail("invalid");
    await timer.restoreTimer(db(), member, discarded as timer.Discarded);
    return null;
  }),

  // ——— The week's grid ———
  saveCell: action({ projectId: sent<string>(), taskId: sent<string | null>(), day: sent<string>(), duration }, ({ duration: minutes, ...input }, { member }): Promise<entries.Cell> => entries.saveCell(db(), member, { ...input, minutes })),
  addRow: action(row, async (input, { member }): Promise<null> => {
    await entries.addRow(db(), member, input);
    return null;
  }),
  removeRow: action(row, (input, { member }): Promise<string[]> => entries.removeRow(db(), member, input)),
  copyLastWeek: action({ week: sent<string>() }, ({ week }, { member }): Promise<number> => entries.copyLastWeek(db(), member, week)),
  // Undo of a deleted entry, or of a removed row (its entries, and the row).
  restoreEntries: action({ ids: sent<string[]>(), row: maybe<Row>() }, async ({ ids, row: r }, { member }): Promise<number> => {
    const sql = db();
    const list = Array.isArray(ids) ? ids : [];
    if (r && list.length === 0) {
      await entries.addRow(sql, member, r as Row);
      return 0;
    }
    const n = await entries.restoreEntries(sql, member, ids);
    if (r) await entries.addRow(sql, member, r as Row).catch(() => {});
    return n;
  }),

  // ——— The day's list ———
  addEntry: action(entry, ({ duration: minutes, ...input }, { member }): Promise<entries.Entry> => entries.addEntry(db(), member, { ...input, minutes })),
  updateEntry: action({ ...one, ...entry }, ({ id, duration: minutes, ...input }, { member }): Promise<entries.Entry> => entries.updateEntry(db(), member, id, { ...input, minutes })),
  deleteEntry: action(one, async ({ id }, { member }): Promise<null> => {
    await entries.deleteEntry(db(), member, id);
    return null;
  }),
  setNote: action({ ...one, note: sent<string>() }, async ({ id, note }, { member }): Promise<null> => {
    await entries.setNote(db(), member, id, note);
    return null;
  }),

  // ——— A week sent for approval, and the managers' answers ———
  submitWeek: action({ week: sent<string>() }, ({ week }, { member }): Promise<weeks.WeekState & { approvers: number }> => weeks.submitWeek(db(), member, week)),
  withdrawWeek: action({ week: sent<string>() }, async ({ week }, { member }): Promise<null> => {
    await weeks.withdrawWeek(db(), member, week);
    return null;
  }),
  approveWeek: action({ memberId: sent<string>(), week: sent<string>(), anyway: field.bool() }, async ({ memberId, week, anyway }, { member }): Promise<null> => {
    await weeks.approveWeek(db(), member, memberId, week, { anyway });
    return null;
  }),
  returnWeek: action({ memberId: sent<string>(), week: sent<string>(), reason: sent<string>() }, async ({ memberId, week, reason }, { member }): Promise<null> => {
    await weeks.returnWeek(db(), member, memberId, week, reason);
    return null;
  }),
  remind: action({ memberIds: sent<string[]>(), week: sent<string>() }, ({ memberIds, week }, { member }): Promise<number> => weeks.remind(db(), member, memberIds, week)),

  // ——— People: rates, usual weeks, former people (managers) ———
  // A rate as typed, from a day; "" is "no rate" from that day.
  setRate: action({ ...rateTarget, rate: rateMoney, from: sent<string>() }, ({ rate, ...input }, { member }): Promise<rates.RateStep[]> => rates.setRate(db(), member, { ...input, cents: rate })),
  removeRateStep: action({ ...rateTarget, from: sent<string>() }, (input, { member }): Promise<rates.RateStep[]> => rates.removeStep(db(), member, input)),
  setCapacity: action({ memberId: sent<string>(), hours }, async ({ memberId, hours: minutes }, { member }): Promise<null> => {
    await weeks.setCapacity(db(), member, memberId, minutes);
    return null;
  }),
  forgetFormer: action(one, async ({ id }, { member }): Promise<null> => {
    await forgetFormer(db(), member, id);
    return null;
  }),

  // ——— Invoiced time, and billable time to Quotes (managers) ———
  markInvoiced: action({ from: sent<string>(), to: sent<string>(), person: maybe<string>() }, (q, { member }): Promise<invoicing.Marked> => invoicing.markInvoiced(db(), member, { ...q, billable: "uninvoiced" })),
  unmarkInvoiced: action({ marked: sent<invoicing.Marked>() }, ({ marked }, { member }): Promise<number> => invoicing.unmarkInvoiced(db(), member, marked)),
  sendToQuotes: action({ projectId: sent<string>(), from: sent<string>(), to: sent<string>() }, (input, { member }): Promise<{ handoff: string; entries: number; minutes: number; receivers: number }> => handoff.sendBillable(db(), member, input)),
  takeBackFromQuotes: action(one, async ({ id }, { member }): Promise<null> => {
    await handoff.cancelHandoff(db(), member, id);
    return null;
  }),

  // ——— Clients, projects, tasks (managers) ———
  createProject: action({ project: field.json() }, async ({ project }, { member }): Promise<{ id: string }> => ({ id: (await projects.createProject(db(), member, projectInput(project))).id })),
  updateProject: action({ ...one, project: field.json() }, async ({ id, project }, { member }): Promise<null> => {
    await projects.updateProject(db(), member, id, projectInput(project));
    return null;
  }),
  archiveProject: action({ ...one, archived: field.bool() }, async ({ id, archived }, { member }): Promise<null> => {
    await projects.archiveProject(db(), member, id, archived);
    return null;
  }),
  addTask: action({ projectId: sent<string>(), name: sent<string>() }, ({ projectId, name }, { member }): Promise<projects.Task> => projects.addTask(db(), member, projectId, name)),
  renameTask: action({ ...one, name: sent<string>() }, async ({ id, name }, { member }): Promise<null> => {
    await projects.renameTask(db(), member, id, name);
    return null;
  }),
  archiveTask: action({ ...one, archived: field.bool() }, async ({ id, archived }, { member }): Promise<null> => {
    await projects.archiveTask(db(), member, id, archived);
    return null;
  }),
  renameClient: action({ ...one, name: sent<string>() }, async ({ id, name }, { member }): Promise<null> => {
    await projects.renameClient(db(), member, id, name);
    return null;
  }),
  archiveClient: action({ ...one, archived: field.bool() }, async ({ id, archived }, { member }): Promise<null> => {
    await projects.archiveClient(db(), member, id, archived);
    return null;
  }),
  // An example project in the manager's words (a client, three tasks).
  addExample: action({}, async (_input, { member, t }): Promise<{ id: string }> => {
    const w = t.projects.example;
    return { id: (await projects.example(db(), member, { client: w.client, project: w.project, tasks: [w.design, w.development, w.meetings] })).id };
  }),

  // ——— Settings (managers) ———
  lockUntil: action({ day: sent<string | null>() }, async ({ day }, { member }): Promise<null> => {
    await settings.lock(db(), member, day ?? null);
    return null;
  }),
  saveReminder: action({ enabled: field.bool(), hours }, async ({ enabled, hours: minutes }, { member }): Promise<null> => {
    await settings.saveReminder(db(), member, { enabled, minutes: minutes ?? fail("invalid") });
    return null;
  }),
  saveChoices: action({ approvals: maybe<boolean>(), hoursStyle: maybe<settings.HoursStyle>() }, async (input, { member }): Promise<null> => {
    await settings.saveChoices(db(), member, input);
    return null;
  }),

  // ——— Import (managers): checked first (nothing written), then run — the
  // file is read again on the server, never trusted from the check. ———
  previewImport: action(importInput, async ({ text, choices }, { member }): Promise<ImportPlan> => planImport(db(), member, text, await importOptions(member, choices)), importBody),
  importTime: action(importInput, async ({ text, choices }, { member }): Promise<{ imported: number }> => ({ imported: (await runImport(db(), member, text, await importOptions(member, choices))).imported }), importBody),
};
