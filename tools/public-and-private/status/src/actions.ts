import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { action, after, field, log, publicAction, redirect, type Field } from "@argentic/chest-app";
import { catalogue, localeOf } from "./i18n/index.ts";
import { AppError, type ErrorCode } from "./lib/app-error.ts";
import * as checks from "./lib/checks.ts";
import * as components from "./lib/components.ts";
import { db } from "./lib/db.ts";
import { admit, checkForm } from "./lib/guard.ts";
import * as heartbeats from "./lib/heartbeats.ts";
import * as hooks from "./lib/hooks.ts";
import { chooseHook, flushHooks, retryHook, subscribeHook, unsubscribeHook } from "./lib/hooks.ts";
import { importStatuspage } from "./lib/importer.ts";
import * as incidents from "./lib/incidents.ts";
import { otherLanguage, writerLanguage } from "./lib/languages.ts";
import { flush, welcome } from "./lib/mailer.ts";
import { moment, worst, type Impact } from "./lib/model.ts";
import { savePageSettings } from "./lib/page-settings.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import { rememberPublicOrigin, setChecksState } from "./lib/settings.ts";
import * as subscribers from "./lib/subscribers.ts";
import { choose, confirm, subscribe, unsubscribe } from "./lib/subscribers.ts";
import * as templates from "./lib/templates.ts";
import * as tell from "./lib/tell.ts";
import { tellTools } from "./lib/tell-tools.ts";

// Every mutation of Status, by name. action(): the team's part, the member
// read from the Chest's assertion on each call; publicAction(): anyone on
// the public part. From an island: call("postUpdate", { incidentId, … });
// from a form: <form method="post" action="/actions/subscribe">. The page
// refreshes after each (unless the island says otherwise).
//
// The rules (src/lib/) read every value as `unknown` and check it — its
// type, its length in characters, its bounds — and who may do it, from
// `member`, never from the input. So most fields here are `checked`: the
// value as sent, typed by the shape an island sends, checked by the rule
// (the whole body is bounded: 1 MiB, the package's default).
const checked = <T,>(): Field<T> => ({ read: value => value as T });
const id = field.id;

// A day and minutes after midnight on the Chest's clock (the editor's
// selects): read by moment().
type When = { day: string; minutes: number };
type Second = { title?: string; body?: string; resolution?: string } | null;
type Window = { title: string; body?: string; start: When; end: When; components: string[]; autoPosts: boolean; second?: Second; language?: string };

const zone = () => chest.timeZone;

// After an update is posted, the first emails and chat deliveries go at
// once (a few, so the editor never waits); the "updates" schedule sends
// the rest. After the answer: the editor's page does not wait for them.
function sendSoon(): void {
  after("emails", () => flush(db(), { limit: 25 }));
  after("chat updates", () => flushHooks(db(), { limit: 50 }));
}

async function namesOf(ids: string[]): Promise<string[]> {
  const all = await components.allComponents(db());
  return ids.map(c => all.find(x => x.id === c)?.name).filter((n): n is string => Boolean(n));
}

// The team is told and the badges counted once the change is saved, before
// the answer (a refusal of the Chest's never undoes the change: lib/tell.ts
// catches it).
async function told(_what: string, work: () => Promise<unknown>): Promise<void> {
  await work();
}

// ---- Helpers of the actions below.

// Text a public form sends, read as is (empty allowed): the rule checks it.
function loose(max: number): Field<string> {
  return field.text({ min: 0, max });
}

// What every public form carries besides its fields: a field people never
// see (website: only robots fill it) and the signed time it was shown.
const guarded = { website: loose(200), started: loose(200) };

// The guard of a public form: the robots' field, the signed time (refused
// when sent faster than a person types, or never shown), then the
// visitor's counts (the Chest's, else the tool's own).
async function guard(input: { website: string; started: string }, headers: Headers): Promise<void> {
  if (input.website !== "") throw new AppError("invalid");
  checkForm(input.started);
  await admit(db(), headers);
}

// A subscription's token as an address may hold it.
const tokenOf = (value: string) => value.replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 64);

// What a public action refused, as a code for the page's address. The
// Chest unreachable, or a bug: "unavailable", logged without data.
function failed(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code as ErrorCode;
  log.error("public action failed", error);
  return "unavailable";
}

function windowOf(input: Window | null | undefined): { start: Date; end: Date } {
  if (!input || typeof input !== "object") throw new AppError("invalid");
  return { start: moment(input.start?.day, input.start?.minutes, zone()), end: moment(input.end?.day, input.end?.minutes, zone()) };
}

async function addExample(member: Member): Promise<void> {
  const sql = db();
  if ((await components.allComponents(sql)).length > 0) return;
  const language = writerLanguage(member);
  const names = catalogue(language).components.exampleNames.split("|");
  const seconds = catalogue(otherLanguage(language)).components.exampleNames.split("|");
  for (const [k, name] of names.slice(0, 8).entries()) await components.addComponent(sql, member, { name, language, second: { name: seconds[k] } });
}

export const actions = {
  // ---- Incidents ------------------------------------------------------------

  postIncident: action({ title: checked<string>(), status: checked<string>(), body: checked<string>(), states: checked<Record<string, string>>(), second: field.optional(checked<Second>()), language: field.optional(checked<string>()) }, async (input, { member }) => {
    const sql = db();
    const { incidentId } = await incidents.openIncident(sql, member, input);
    const impacts = Object.values(input.states) as Impact[];
    const names = await namesOf(Object.keys(input.states));
    await told("incident told", async () => {
      await tell.incidentOpened({ id: incidentId, title: String(input.title).trim() }, worst(impacts), names);
      await tell.refreshBadges(sql);
    });
    sendSoon();
    await tellTools(sql, incidentId, "opened");
    return { id: incidentId };
  }),

  backfillIncident: action({ title: checked<string>(), body: checked<string>(), resolution: checked<string>(), states: checked<Record<string, string>>(), started: checked<When>(), resolved: checked<When>(), second: field.optional(checked<Second>()), language: field.optional(checked<string>()) }, async (input, { member }) => {
    const startedAt = moment(input.started?.day, input.started?.minutes, zone());
    const resolvedAt = moment(input.resolved?.day, input.resolved?.minutes, zone());
    const { incidentId } = await incidents.backfill(db(), member, { title: input.title, body: input.body, resolution: input.resolution, states: input.states, startedAt, resolvedAt, second: input.second ?? null, language: input.language });
    return { id: incidentId };
  }),

  // An update; reopen: true only from the "Reopen" dialog (a resolved
  // incident refuses any other step).
  postUpdate: action({ incidentId: id(), status: checked<string>(), body: checked<string>(), bodySecond: field.optional(checked<string>()), states: field.optional(checked<Record<string, string>>()), reopen: field.bool() }, async ({ incidentId, ...input }, { member }) => {
    const sql = db();
    const before = await incidents.incidentFor(sql, member, incidentId);
    const done = await incidents.addUpdate(sql, member, incidentId, input);
    const reopened = done.reopened ? await incidents.incidentFor(sql, member, incidentId) : null;
    const last = reopened?.updates.find(u => u.removedAt === null);
    const names = reopened ? await namesOf(Object.keys(last?.states ?? {})) : [];
    await told("update told", async () => {
      if (done.resolved && before.status !== "resolved") await tell.incidentResolved({ id: before.id, title: before.title });
      if (reopened) await tell.incidentOpened({ id: reopened.id, title: reopened.title }, worst(Object.values(last?.states ?? {})), names);
      await tell.refreshBadges(sql);
    });
    sendSoon();
    await tellTools(sql, incidentId, done.reopened ? "opened" : undefined);
    return { resolved: done.resolved };
  }),

  renameIncident: action({ incidentId: id(), title: checked<string>(), titleSecond: field.optional(checked<string>()) }, async ({ incidentId, title, titleSecond }, { member }) => {
    await incidents.renameIncident(db(), member, incidentId, title, titleSecond);
    await tellTools(db(), incidentId);
  }),

  // Corrects an update's text and, when given, its second version: each
  // change is logged.
  editUpdate: action({ updateId: id(), body: checked<string>(), bodySecond: field.optional(checked<string>()) }, async ({ updateId, body, bodySecond }, { member }) => {
    await incidents.editUpdate(db(), member, updateId, body);
    if (bodySecond !== undefined) await incidents.editUpdate(db(), member, updateId, bodySecond, new Date(), { second: true });
  }),

  writePostmortem: action({ incidentId: id(), body: checked<string>(), bodySecond: field.optional(checked<string>()) }, async ({ incidentId, ...input }, { member }) => {
    await incidents.writePostmortem(db(), member, incidentId, input);
  }),

  removeUpdate: action({ updateId: id() }, async ({ updateId }, { member }) => {
    const { incidentId } = await incidents.removeUpdate(db(), member, updateId);
    await told("badges", () => tell.refreshBadges(db()));
    await tellTools(db(), incidentId);
  }),

  restoreUpdate: action({ updateId: id() }, async ({ updateId }, { member }) => {
    await incidents.restoreUpdate(db(), member, updateId);
    await told("badges", () => tell.refreshBadges(db()));
    const [row] = await db()<{ incident_id: string }[]>`select incident_id from updates where id = ${updateId}`;
    if (row) await tellTools(db(), String(row.incident_id));
  }),

  removeIncident: action({ incidentId: id() }, async ({ incidentId }, { member }) => {
    await incidents.removeIncident(db(), member, incidentId);
    await told("incident removed", async () => {
      await tell.incidentRemoved(incidentId);
      await tell.refreshBadges(db());
    });
    await tellTools(db(), incidentId);
  }),

  restoreIncident: action({ incidentId: id() }, async ({ incidentId }, { member }) => {
    await incidents.restoreIncident(db(), member, incidentId);
    await told("badges", () => tell.refreshBadges(db()));
    await tellTools(db(), incidentId, "opened");
  }),

  // ---- Maintenance ----------------------------------------------------------

  planMaintenance: action({ window: checked<Window>() }, async ({ window: input }, { member }) => {
    const { start, end } = windowOf(input);
    const { incidentId } = await incidents.planMaintenance(db(), member, { title: input.title, body: input.body, start, end, components: input.components, autoPosts: input.autoPosts, second: input.second ?? null, language: input.language });
    sendSoon();
    return { id: incidentId };
  }),

  changeMaintenance: action({ incidentId: id(), window: checked<Window>() }, async ({ incidentId, window: input }, { member }) => {
    const { start, end } = windowOf(input);
    await incidents.editMaintenance(db(), member, incidentId, { title: input.title, start, end, components: input.components, autoPosts: input.autoPosts });
  }),

  postMaintenanceUpdate: action({ incidentId: id(), status: checked<string>(), body: checked<string>(), bodySecond: field.optional(checked<string>()) }, async ({ incidentId, ...input }, { member }) => {
    await incidents.maintenanceUpdate(db(), member, incidentId, input);
    sendSoon();
  }),

  // ---- Services -------------------------------------------------------------

  addComponent: action({ name: checked<string>(), description: field.optional(checked<string>()), parentId: field.optional(checked<string | null>()), kind: field.optional(checked<string>()), teamOnly: field.optional(checked<boolean>()), language: field.optional(checked<string>()), second: field.optional(checked<{ name?: string; description?: string }>()) }, async (input, { member }) => ({ id: (await components.addComponent(db(), member, input)).id })),

  // A first page in one click: the usual services, written in the editor's
  // language with their names in the other one — a bilingual company's
  // visitors read them in theirs from the first day.
  addExample: action({}, async (_input, { member }) => {
    await addExample(member);
  }),

  updateComponent: action({ componentId: id(), name: field.optional(checked<string>()), description: field.optional(checked<string>()), parentId: field.sent(checked<string | null>()), hidden: field.optional(checked<boolean>()), teamOnly: field.optional(checked<boolean>()), second: field.optional(checked<{ name?: string; description?: string }>()) }, async ({ componentId, ...input }, { member }) => {
    await components.updateComponent(db(), member, componentId, input);
  }),

  moveComponent: action({ componentId: id(), direction: field.choice(["up", "down"]) }, async ({ componentId, direction }, { member }) => {
    await components.moveComponent(db(), member, componentId, direction);
  }),

  removeComponent: action({ componentId: id() }, async ({ componentId }, { member }) => {
    const sql = db();
    const watched = (await checks.listWatches(sql)).some(w => w.componentId === componentId);
    const gone = await components.removeComponent(sql, member, componentId);
    if (watched) await setChecksState(sql, await checks.syncChest(sql));
    return { kind: gone.kind, name: gone.name, description: gone.description, parentId: gone.parentId, position: gone.position, hidden: gone.hidden, teamOnly: gone.teamOnly } satisfies components.Snapshot;
  }),

  // The Undo of a deletion (a toast): the service back in its place.
  putBackComponent: action({ snapshot: checked<components.Snapshot>() }, async ({ snapshot }, { member }) => {
    await components.putBack(db(), member, snapshot ?? { name: null });
  }),

  // ---- Checks (Proposal (studio)) -------------------------------------------

  // Saving keeps the addresses in the tool, then hands the whole list to
  // the Chest; running is false when this Chest cannot run checks yet.
  saveChecks: action({ list: checked<checks.WatchInput[]>() }, async ({ list }, { member }) => {
    const sql = db();
    await checks.saveWatches(sql, member, list);
    const state = await checks.syncChest(sql);
    await setChecksState(sql, state);
    return { running: state === "running" };
  }),

  // ---- Subscribers ----------------------------------------------------------

  removeSubscriber: action({ subscriberId: id() }, async ({ subscriberId }, { member }) => {
    await subscribers.removeSubscriber(db(), member, subscriberId);
  }),

  // A chat or web address subscription: the Chest forgets the address.
  removeHook: action({ hookId: id() }, async ({ hookId }, { member }) => {
    await hooks.removeHook(db(), member, hookId);
  }),

  // ---- Templates ------------------------------------------------------------

  saveTemplate: action({ template: checked<templates.TemplateInput & { title: string; body: string }>() }, async ({ template }, { member }) => ({ name: (await templates.saveTemplate(db(), member, template ?? { title: null, body: null })).name })),

  removeTemplate: action({ templateId: id() }, async ({ templateId }, { member }) => templates.removeTemplate(db(), member, templateId)),

  // ---- The public page's settings -------------------------------------------

  savePage: action({ website: checked<string>(), support: checked<string>(), embedSites: checked<string>() }, async (input, { member }) => {
    await savePageSettings(db(), member, input);
  }),

  // Import from Statuspage (lib/importer.ts): the files an editor chose,
  // read in the browser and sent as text (several at once: one JSON array
  // of their texts), at most 20 MiB.
  importStatuspage: action({ text: checked<string>() }, async ({ text }, { member }) => importStatuspage(db(), member, typeof text === "string" ? text : ""), { maxBody: 20 << 20 }),

  // ---- Heartbeats -----------------------------------------------------------

  // A new secret address for a service's job, shown once.
  createHeartbeat: action({ componentId: id(), every: checked<number>() }, async ({ componentId, every }, { member, request }) => {
    const { token } = await heartbeats.createHeartbeat(db(), member, componentId, every);
    return { url: `${publicOrigin(request.headers) ?? ""}/heartbeat/${token}` };
  }),

  removeHeartbeat: action({ componentId: id() }, async ({ componentId }, { member }) => {
    await heartbeats.removeHeartbeat(db(), member, componentId);
  }),

  // ---- The public part -------------------------------------------------------
  // Anyone on the Internet may call these. They hold no member; they check
  // the form's guard, bound everything, and answer the same whoever the
  // address belongs to. Each ends on a page (redirect), so the forms work
  // the same with or without JavaScript; what went wrong is in the
  // address (?error=<code>), said by that page beside the form.

  subscribe: publicAction({ ...guarded, email: loose(400), scope: loose(10), component: field.list(loose(20), 200) }, async (input, { locale, request }) => {
    let target = "/subscribe?sent=1";
    try {
      const sql = db();
      await guard(input, request.headers);
      const result = await subscribe(sql, { email: input.email, language: localeOf(locale), components: input.scope === "some" ? input.component : "all" });
      const origin = publicOrigin(request.headers) ?? "";
      await rememberPublicOrigin(sql, origin || null);
      if (result.send) {
        const outcome = await welcome(sql, result.subscriber, result.state, origin);
        if (outcome === "none") {
          // No mail on this Chest: nothing is kept of the address.
          if (result.state !== "confirmed") await sql`delete from subscribers where id = ${result.subscriber.id} and confirmed_at is null`;
          target = "/subscribe?error=no_mail";
        }
      }
    } catch (error) {
      target = `/subscribe?error=${failed(error)}`;
    }
    redirect(target);
  }),

  confirmSubscription: publicAction({ token: loose(80) }, async ({ token: given }) => {
    const token = tokenOf(given);
    let target = `/s/${token}?done=confirmed`;
    try {
      await confirm(db(), token);
    } catch (error) {
      target = failed(error) === "not_found" ? "/s/unknown" : `/s/${token}?error=unavailable`;
    }
    redirect(target);
  }),

  chooseFollowed: publicAction({ token: loose(80), scope: loose(10), component: field.list(loose(20), 200) }, async ({ token: given, scope, component }) => {
    const token = tokenOf(given);
    let target = `/s/${token}?done=saved`;
    try {
      await choose(db(), token, scope === "some" ? component : "all");
    } catch (error) {
      const code = failed(error);
      target = code === "not_found" ? "/s/unknown" : `/s/${token}?error=${code}`;
    }
    redirect(target);
  }),

  unsubscribe: publicAction({ token: loose(80) }, async ({ token: given }) => {
    const token = tokenOf(given);
    let target = "/unsubscribed";
    try {
      await unsubscribe(db(), token);
    } catch (error) {
      if (failed(error) !== "not_found") target = `/s/${token}?error=unavailable`;
    }
    redirect(target);
  }),

  // ---- Updates in a chat (Proposal (studio): webhooks) ----------------------

  // Connects a Slack or Teams channel, or a web address: the same guard as
  // the email form; the Chest checks the address before anything is kept.
  // The subscription's page follows (its link is its key).
  subscribeChat: publicAction({ ...guarded, kind: loose(20), url: loose(4096), scope: loose(10), component: field.list(loose(20), 200) }, async (input, { locale, request }) => {
    let target: string;
    try {
      const sql = db();
      await guard(input, request.headers);
      await rememberPublicOrigin(sql, publicOrigin(request.headers) || null);
      const hook = await subscribeHook(sql, { kind: input.kind, url: input.url, language: localeOf(locale), components: input.scope === "some" ? input.component : "all" });
      target = `/w/${hook.token}?new=1`;
    } catch (error) {
      target = `/subscribe/chat?error=${failed(error)}${/^(slack|teams|generic)$/u.test(input.kind) ? `&kind=${input.kind}` : ""}`;
    }
    redirect(target);
  }),

  chooseChatFollowed: publicAction({ token: loose(80), scope: loose(10), component: field.list(loose(20), 200) }, async ({ token: given, scope, component }) => {
    const token = tokenOf(given);
    let target = `/w/${token}?done=saved`;
    try {
      await chooseHook(db(), token, scope === "some" ? component : "all");
    } catch (error) {
      const code = failed(error);
      target = code === "not_found" ? "/w/unknown" : `/w/${token}?error=${code}`;
    }
    redirect(target);
  }),

  retryChat: publicAction({ token: loose(80) }, async ({ token: given }) => {
    const token = tokenOf(given);
    let target = `/w/${token}?done=retried`;
    try {
      await retryHook(db(), token);
    } catch (error) {
      const code = failed(error);
      target = code === "not_found" ? "/w/unknown" : `/w/${token}?error=${code}`;
    }
    redirect(target);
  }),

  stopChat: publicAction({ token: loose(80) }, async ({ token: given }) => {
    const token = tokenOf(given);
    let target = "/w/gone?done=gone";
    try {
      await unsubscribeHook(db(), token);
    } catch (error) {
      if (failed(error) !== "not_found") target = `/w/${token}?error=unavailable`;
    }
    redirect(target);
  }),
};

