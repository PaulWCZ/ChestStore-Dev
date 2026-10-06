import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import * as members from "@argentic/chest-sdk/members";
import { action, after, fail, field, publicAction, redirect, type Field } from "@argentic/chest-app";
import { catalogue, format, localeOf } from "./i18n/index.ts";
import { can } from "./lib/access.ts";
import * as answers from "./lib/answers.ts";
import { mayCreate, setEveryoneCreates } from "./lib/creators.ts";
import { db } from "./lib/db.ts";
import { saveSites } from "./lib/embed.ts";
import * as forms from "./lib/forms.ts";
import * as hooks from "./lib/hooks.ts";
import { acceptImage, grantImage, imageUrl } from "./lib/images.ts";
import * as importer from "./lib/importer.ts";
import { startOf } from "./lib/linked.ts";
import { notify } from "./lib/notify.ts";
import { publicLimits, reaches, watchFlood } from "./lib/flood.ts";
import { take } from "./lib/respond.ts";
import * as tell from "./lib/tell.ts";
import { template, templateKeys } from "./lib/templates.ts";
import * as uploads from "./lib/uploads.ts";
import { check } from "./shared/logic.ts";
import { answerIdPattern, languageFor, slugPattern, type Image } from "./shared/model.ts";
import { zonedInstant } from "./shared/zone.ts";

// Every change of Forms, by name. action(): members only, the member read
// from the Chest's assertion on each call; publicAction(): anyone on the
// public part (a respondent of a public form). The fields read what was
// sent, of the right kind and size; the rules of src/lib/ check every
// value and every right again — from `member`, never from the input — and
// refuse with a code the reader sees in their words. From an island:
// call("publishForm", { id }); the page refreshes after each (unless the
// island says otherwise).

const id = field.id();
// A text the rules read and bound themselves (a form's JSON, a pasted
// file): any string up to max characters, kept as it was sent.
const raw = (max: number): Field<string> => ({ read: value => (typeof value === "string" && value.length <= max ? value : fail(typeof value === "string" ? "too_long" : "invalid", { max })) });
// An answer's id, a form's address, a question's id: their own shapes.
const answerId: Field<string> = { read: value => (typeof value === "string" && answerIdPattern.test(value) ? value : fail("not_found")) };
const slug: Field<string> = { read: value => (typeof value === "string" && slugPattern.test(value) ? value : fail("not_found")) };
const questionId: Field<string> = { read: value => (typeof value === "string" && /^[a-z0-9]{6,12}$/u.test(value) ? value : fail("not_found")) };
const fileType = field.text({ max: 200 });
const fileSize = field.int({ min: 1, max: Number.MAX_SAFE_INTEGER });
// The version a respondent's page answered (the server takes the latest
// one when it is not a version of the form).
const version = field.int({ min: 0, max: 1_000_000 });

// The answers a respondent's page sends are checked before anything is
// counted: a refusal costs the visitor nothing.
async function checked(slugValue: string, audience: "public" | "team", payload: { version: number; answers: unknown }) {
  const sql = db();
  const found = await forms.bySlug(sql, slugValue);
  if (!found || found.form.audience !== audience) fail("not_found");
  const { form } = found!;
  const state = forms.openState(form);
  if (!state.open) fail(state.reason === "full" ? "full" : "closed");
  const v = payload.version >= 1 && payload.version <= form.version ? payload.version : form.version;
  const def = await forms.versionOf(sql, form.id, v);
  if (!def) fail("not_found");
  if (Object.keys(check(def!, payload.answers).errors).length > 0) fail("answers");
  return found!;
}

export const actions = {
  // ---- Starting a form --------------------------------------------------

  // A template (or a blank form), in the member's language, with its links
  // to the other tools already mapped (src/lib/linked.ts startOf).
  createForm: action({ key: field.choice(templateKeys) }, async ({ key }, { member }): Promise<never> => {
    const sql = db();
    const made = await forms.create(sql, member, await startOf(sql, template(key, catalogue(localeOf(member.language)))));
    return redirect(`/chest/forms/${made.id}`);
  }),
  // A Google Forms or Typeform form's file becomes a draft; the builder
  // says what could not come.
  importForm: action({ text: raw(2 << 20) }, async ({ text }, { member }): Promise<never> => {
    const found = importer.importForm(text);
    if (!found.definition.language) found.definition.language = localeOf(member.language);
    const made = await forms.create(db(), member, { definition: found.definition });
    return redirect(`/chest/forms/${made.id}?imported=${found.skipped.join(",") || "all"}`);
  }, { maxBody: 3 << 20, parallel: true }),

  // ---- Building ---------------------------------------------------------

  // The builder's working copy: `revision` is the one the page loaded —
  // someone else's save in between is a conflict, never lost.
  saveDraft: action({ id, text: raw(512 * 1024), revision: field.int({ min: 0, max: 2_000_000_000 }) }, ({ id: formId, text, revision }, { member }) => forms.saveDraft(db(), member, formId, text, revision), { maxBody: 600 * 1024 }),
  // After a conflict: the editor keeps their version over the one saved
  // meanwhile (the builder asked them).
  keepMine: action({ id, text: raw(512 * 1024) }, ({ id: formId, text }, { member }) => forms.overwriteDraft(db(), member, formId, text), { maxBody: 600 * 1024 }),
  publishForm: action({ id }, async ({ id: formId }, { member }) => {
    const sql = db();
    const before = await forms.open(sql, member, formId, "editor");
    const { form, version: published } = await forms.publish(sql, member, formId);
    // A team form that opens (for the first time, or again) may tell the team.
    if (form.audience === "team" && form.tellTeam && before.form.status !== "published") after("tell the team", () => tell.opened(form.id, form.slug, form.draft.title, member.id).then(() => undefined));
    return { version: published, slug: form.slug };
  }),
  discardDraft: action({ id }, async ({ id: formId }, { member }) => {
    await forms.discard(db(), member, formId);
    return null;
  }),
  // A picture for a picture choice or a cover: a one-time address on the
  // team host for one image (2 MB at most), and the ticket naming it.
  imageUpload: action({ id, type: fileType, size: fileSize }, async ({ id: formId, type, size }, { member }) => {
    await forms.open(db(), member, formId, "editor");
    return grantImage(type, size);
  }),
  // The picture the editor's browser sent, checked and published; the
  // builder puts it in the option (the draft saves it).
  acceptPicture: action({ id, ticket: field.text({ max: 200 }) }, async ({ id: formId, ticket }, { member }): Promise<{ image: Image; url: string | null }> => {
    await forms.open(db(), member, formId, "editor");
    const image = await acceptImage(ticket, "pictures");
    return { image, url: await imageUrl(image, "team") };
  }),

  // ---- A form's state ---------------------------------------------------

  closeForm: action({ id }, async ({ id: formId }, { member }) => {
    const form = await forms.close(db(), member, formId);
    after("withdraw the invitation", () => tell.closed(form.id));
    return null;
  }),
  reopenForm: action({ id }, async ({ id: formId }, { member }) => {
    const form = await forms.reopen(db(), member, formId);
    if (form.audience === "team" && form.tellTeam) after("tell the team", () => tell.opened(form.id, form.slug, form.draft.title, member.id).then(() => undefined));
    return null;
  }),
  duplicateForm: action({ id }, async ({ id: formId }, { member }): Promise<never> => {
    const t = catalogue(localeOf(member.language));
    const copy = await forms.duplicate(db(), member, formId, title => format(t.builder.copyOf, { title: title || t.builder.untitled }));
    return redirect(`/chest/forms/${copy.id}`);
  }),
  // Deleting asks nothing: the form waits 30 days in Deleted forms; the
  // home page's toast offers Undo.
  deleteForm: action({ id }, async ({ id: formId }, { member }): Promise<never> => {
    const sql = db();
    await forms.remove(sql, member, formId);
    after("withdraw and count", async () => {
      await tell.closed(formId);
      await tell.refreshBadges(sql);
    });
    return redirect(`/chest?deleted=${formId}`);
  }),
  restoreForm: action({ id, open: field.bool() }, async ({ id: formId, open }, { member }) => {
    const sql = db();
    await forms.restore(sql, member, formId);
    after("count again", () => tell.refreshBadges(sql));
    if (open) redirect(`/chest/forms/${formId}`);
    return null;
  }),

  // ---- Settings ---------------------------------------------------------

  // The settings page's values (src/islands/Settings.tsx), read by
  // src/shared/model.ts settings(); the closing day and hour are read on
  // the Chest's clock.
  saveSettings: action({ id, values: field.json() }, async ({ id: formId, values }, { member }) => {
    const value = values as Record<string, unknown>;
    let closesAt: Date | null = null;
    if (typeof value["closesDay"] === "string" && value["closesDay"] !== "") {
      const hour = Number(value["closesHour"] ?? 0);
      try {
        closesAt = zonedInstant(value["closesDay"], hour, chest.timeZone);
      } catch {
        fail("invalid");
      }
    }
    const sql = db();
    const before = await forms.open(sql, member, formId, "editor");
    const form = await forms.saveSettings(sql, member, formId, value, closesAt);
    after("withdraw and count", async () => {
      if (before.form.audience === "team" && form.audience !== "team") await tell.closed(form.id);
      await tell.refreshBadges(sql);
    });
    return null;
  }, { maxBody: 128 * 1024 }),
  // The cover: a picture the editor's browser sent (its ticket), or none.
  setCover: action({ id, ticket: field.nullable(field.text({ max: 200 })) }, async ({ id: formId, ticket }, { member }): Promise<{ cover: Image | null; url: string | null }> => {
    const sql = db();
    await forms.open(sql, member, formId, "editor");
    const cover = ticket ? await acceptImage(ticket, "covers") : null;
    const replaced = await forms.setCover(sql, member, formId, cover);
    if (replaced) after("delete the old cover", () => files.delete(replaced).then(() => undefined, () => undefined));
    return { cover, url: await imageUrl(cover, "team") };
  }),
  // A form's web addresses (src/lib/hooks.ts): its editors add, retry, remove.
  addFormHook: action({ id, url: field.text({ max: 2048 }), kind: field.choice(hooks.hookKinds), label: field.text({ max: 200 }) }, async ({ id: formId, url, kind, label }, { member }) => ({ secret: (await hooks.addHook(db(), member, formId, { url, kind, label })).secret }), { parallel: true }),
  enableFormHook: action({ id, hook: field.text({ max: 64 }) }, async ({ id: formId, hook }, { member }) => {
    await hooks.enableHook(db(), member, formId, hook);
    return null;
  }, { parallel: true }),
  removeFormHook: action({ id, hook: field.text({ max: 64 }) }, async ({ id: formId, hook }, { member }) => {
    await hooks.removeHook(db(), member, formId, hook);
    return null;
  }),
  // The websites allowed to show the public forms in a frame (managers).
  saveEmbedSites: action({ sites: field.text({ min: 0, max: 4000 }) }, async ({ sites }, { member }) => ({ sites: await saveSites(db(), member, sites) })),
  // "Everyone can make forms": a manager's switch (src/lib/creators.ts).
  everyoneCreates: action({ on: field.bool() }, async ({ on }, { member }) => ({ on: await setEveryoneCreates(db(), member, on) })),

  // ---- Sharing ----------------------------------------------------------

  // People to share a form with, as the owner types a name: the members
  // who have the tool (the Chest searches names, accents aside). Who
  // makes forms, or owns one, shares them.
  findPeople: action({ q: field.text({ min: 0, max: 60 }) }, async ({ q }, { member }) => {
    const sql = db();
    if (!((await mayCreate(sql, member)) || (await forms.ownsAny(sql, member)))) fail("forbidden");
    try {
      const page = await members.list({ limit: 8, ...(q ? { q } : {}) });
      return page.members.filter(m => m.role !== null && m.id !== member.id).map(m => ({ id: m.id, name: m.name, photo: m.photo }));
    } catch (error) {
      if (error instanceof ChestError) fail("unavailable");
      throw error;
    }
  }, { parallel: true }),
  // A member who has the tool, at a level, or taken off (level null).
  shareForm: action({ id, member: field.text({ max: 40 }), level: field.nullable(field.choice(["editor", "viewer"] as const)) }, async ({ id: formId, member: who, level }, { member }) => {
    const sql = db();
    if (level) {
      try {
        if (!(await members.get(who))) fail("not_found");
      } catch (error) {
        if (error instanceof ChestError) fail("unavailable");
        throw error;
      }
    }
    await forms.share(sql, member, formId, who, level ?? null);
    if (!level) after("count again", () => tell.refreshBadges(sql, [who]));
    return null;
  }),

  // ---- Answers ----------------------------------------------------------

  // New, in progress or done, and a note; on a team form the person who
  // sent it is told in the bell, in their language.
  followAnswer: action({ id, answer: answerId, status: field.optional(field.choice(answers.followStates)), note: field.sent(field.text({ min: 0, max: 2000 })) }, async ({ id: formId, answer: which, status, note }, { member }) => {
    const sql = db();
    const { answer, form, told } = await answers.follow(sql, member, formId, which, { ...(status !== undefined ? { status } : {}), ...(note !== undefined ? { note } : {}) });
    if (told && form.audience === "team" && answer.respondent) {
      const title = (await forms.versionOf(sql, form.id, answer.version))?.title ?? form.draft.title;
      const to = answer.respondent;
      after("tell who sent it", () => notify([to], t => ({ title: format(t.follow.bell[answer.status], { form: title || t.builder.untitled }), ...(answer.note ? { body: answer.note } : {}) }), { path: `/chest/sent/${answer.id}`, key: `sent:${answer.id}` }));
    }
    return null;
  }),
  deleteAnswer: action({ id, answer: answerId }, async ({ id: formId, answer }, { member }) => {
    await answers.removeAnswer(db(), member, formId, answer);
    return null;
  }),
  restoreAnswer: action({ id, answer: answerId }, async ({ id: formId, answer }, { member }) => {
    await answers.restoreAnswer(db(), member, formId, answer);
    return null;
  }),
  // A manager erases a person's answers (GDPR request), files included.
  eraseAnswers: action({ ids: field.list(answerId, 500) }, async ({ ids }, { member }) => {
    const { erased, objects } = await answers.erase(db(), member, ids);
    after("delete the files", () => uploads.remove(objects));
    return { erased };
  }),

  // ---- A team form, answered in the Chest -------------------------------

  // A member answers: who they are only from the Chest's assertion. The
  // language they read the form in: theirs, or the form's own.
  answerTeam: action({ slug, version, answers: field.json(), hidden: field.sent(field.json()) }, async (input, { member }): Promise<{ copy: boolean }> => {
    if (!can(member, "forms.answer")) fail("not_found");
    const { form, definition } = await checked(input.slug, "team", input);
    return take(db(), form, input, member, languageFor(definition, localeOf(member.language)));
  }, { maxBody: 256 * 1024 }),
  // A file for a named team form's file question: a one-time address for
  // the member's browser, and the tool's signed ticket that names it.
  teamUpload: action({ slug, question: questionId, type: fileType, size: fileSize }, async ({ slug: s, question, type, size }, { member }) => {
    if (!can(member, "forms.answer")) fail("not_found");
    const found = await forms.bySlug(db(), s);
    if (!found || found.form.audience !== "team" || found.form.anonymous) fail("not_found");
    if (!forms.openState(found!.form).open) fail("closed");
    return uploads.grant("team", uploads.fileQuestion(found!.definition, question), type, size);
  }),

  // ---- The public forms: anyone on the Internet may call these. They hold
  // no member and say nothing but "received" or why not. The package
  // bounds each (publicAction's bound): the page's single-use form token,
  // the field only robots fill (<Honeypot /> in the runner), so many a day
  // per visitor, per form and in all, counted only once the call is valid
  // (the answers checked first: a refusal costs nothing). -----------------

  answerPublic: publicAction({ slug, version, answers: field.json(), copy: field.bool(), hidden: field.sent(field.json()) }, async (input, { locale, charge }): Promise<{ copy: boolean }> => {
    const sql = db();
    const { form, definition } = await checked(input.slug, "public", input);
    const kind = (await reaches(sql, form)) ? "reaching" : "answer";
    await charge(kind, { subject: form.id });
    await watchFlood(sql, form, publicLimits[kind === "reaching" ? "reaching" : "answers"].perSubject);
    // The language the visitor read the form in; a copy only when the
    // visitor asked for one (and the form offers it).
    return take(sql, form, input, null, languageFor(definition, localeOf(locale)), { copyAsked: input.copy === true });
  }, { maxBody: 256 * 1024, bound: { formSeconds: publicLimits.formSeconds, budgets: { answer: publicLimits.answers, reaching: publicLimits.reaching } } }),
  // One file for a public form's file question: an upload address on the
  // host the visitor is on (Proposal (studio): files.publicUploadUrl), which
  // answers the visitor's browser a claim only it holds.
  visitorUpload: publicAction({ slug, question: questionId, type: fileType, size: fileSize }, async ({ slug: s, question, type, size }, { charge }) => {
    const found = await forms.bySlug(db(), s);
    if (!found || found.form.audience !== "public") fail("not_found");
    if (!forms.openState(found!.form).open) fail("closed");
    const q = uploads.fileQuestion(found!.definition, question);
    uploads.checkUpload(q, type, size);
    await charge("file", { subject: found!.form.id });
    return uploads.grant("public", q, type, size);
  }, { bound: { budgets: { file: publicLimits.files } } }),
};
