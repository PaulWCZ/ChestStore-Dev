import { localeOf, type Member } from "@argentic/chest-sdk/member";
import { randomInt } from "node:crypto";
import { atLeast, can, levelOn, type Level } from "./access.ts";
import { AppError } from "./app-error.ts";
import { mayCreate } from "./creators.ts";
import type { Query, Sql } from "./db.ts";
import {
  allQuestions,
  copyDefinition,
  definition,
  skeleton,
  definitionFromText,
  capOf,
  id as readId,
  isImage,
  isMemberId,
  limits,
  problems,
  settings as readSettings,
  slugPattern,
  type Accent,
  type Audience,
  type Definition,
  type Image,
  type Layout,
  type Settings,
  type Status,
  readIn,
} from "../shared/model.ts";
import { cleanRoutes, noRoutes, readRoutes, type Routes } from "./routes.ts";

// The forms, as the pages see them. Every function takes the database and
// the member acting, checks their rights (lib/access.ts) and throws
// AppError with a code; none returns a sentence.

export type Form = {
  id: string;
  slug: string;
  owner: string;
  status: Status;
  audience: Audience;
  anonymous: boolean;
  once: boolean;
  tellTeam: boolean;
  layout: Layout;
  accent: Accent;
  draft: Definition;
  revision: number;
  version: number;
  closesAt: string | null;
  maxAnswers: number | null;
  thanksTitle: string;
  thanksBody: string;
  redirectUrl: string | null;
  sendCopy: boolean;
  retentionMonths: number | null;
  answerCount: number;
  kiosk: boolean;
  hiddenFields: string[];
  notifyEmail: boolean;
  shareEvents: boolean;
  // Also a contact in Clients, a ticket in Support (lib/routes.ts).
  routes: Routes;
  cover: Image | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

type Row = {
  id: string;
  slug: string;
  owner: string;
  status: Status;
  audience: Audience;
  anonymous: boolean;
  once: boolean;
  tell_team: boolean;
  layout: Layout;
  accent: Accent;
  draft: Definition;
  revision: number;
  version: number;
  closes_at: Date | null;
  max_answers: number | null;
  thanks_title: string;
  thanks_body: string;
  redirect_url: string | null;
  send_copy: boolean;
  retention_months: number | null;
  answer_count: number;
  kiosk: boolean;
  hidden_fields: string[];
  notify_email: boolean;
  share_events: boolean;
  routes: unknown;
  cover: Image | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
};

export const toForm = (r: Row): Form => ({
  id: String(r.id),
  slug: r.slug,
  owner: r.owner,
  status: r.status,
  audience: r.audience,
  anonymous: r.anonymous,
  once: r.once,
  tellTeam: r.tell_team,
  layout: r.layout,
  accent: r.accent,
  draft: r.draft,
  revision: r.revision,
  version: r.version,
  closesAt: r.closes_at ? r.closes_at.toISOString() : null,
  maxAnswers: r.max_answers,
  thanksTitle: r.thanks_title,
  thanksBody: r.thanks_body,
  redirectUrl: r.redirect_url,
  sendCopy: r.send_copy,
  retentionMonths: r.retention_months,
  answerCount: r.answer_count,
  kiosk: r.kiosk,
  hiddenFields: r.hidden_fields,
  notifyEmail: r.notify_email,
  shareEvents: r.share_events,
  routes: readRoutes(r.routes),
  cover: r.cover ?? null,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  publishedAt: r.published_at ? r.published_at.toISOString() : null,
});

export const columns = "id, slug, owner, status, audience, anonymous, once, tell_team, layout, accent, draft, revision, version, closes_at, max_answers, thanks_title, thanks_body, redirect_url, send_copy, retention_months, answer_count, kiosk, hidden_fields, notify_email, share_events, routes, cover, created_at, updated_at, published_at";

// Whether a form takes answers now, and if not, why.
export type OpenState = { open: boolean; reason: "draft" | "closed" | "date" | "full" | null };
export function openState(form: Pick<Form, "status" | "closesAt" | "maxAnswers" | "answerCount">, now = new Date()): OpenState {
  if (form.status === "draft") return { open: false, reason: "draft" };
  if (form.status === "closed") return { open: false, reason: "closed" };
  if (form.closesAt && new Date(form.closesAt).getTime() <= now.getTime()) return { open: false, reason: "date" };
  if (form.answerCount >= capOf(form)) return { open: false, reason: "full" };
  return { open: true, reason: null };
}

// ---- Reading ----------------------------------------------------------------

async function sharedLevel(sql: Query, formId: string, member: string): Promise<Level | null> {
  const [row] = await sql<{ level: Level }[]>`select level from access where form_id = ${formId} and member = ${member}`;
  return row?.level ?? null;
}

// open: a form the actor may open at least at that level, with their level.
export async function open(sql: Query, actor: Member | null, formId: unknown, wanted: Level = "viewer"): Promise<{ form: Form; level: Level }> {
  const id = readId(formId);
  const [row] = await sql<Row[]>`select ${sql.unsafe(columns)} from forms where id = ${id} and deleted_at is null`;
  if (!row || !actor) throw new AppError("not_found");
  const level = levelOn(actor, row, await sharedLevel(sql, id, actor.id));
  if (level === null) throw new AppError("not_found");
  if (!atLeast(level, wanted)) throw new AppError("forbidden");
  return { form: toForm(row), level };
}

// The published version a respondent answers (the latest, or one named).
export async function versionOf(sql: Query, formId: string, version: number): Promise<Definition | null> {
  const [row] = await sql<{ definition: Definition }[]>`select definition from versions where form_id = ${formId} and version = ${version}`;
  return row?.definition ?? null;
}

export async function versions(sql: Query, formId: string): Promise<Map<number, Definition>> {
  const rows = await sql<{ version: number; definition: Definition }[]>`select version, definition from versions where form_id = ${formId} order by version`;
  return new Map(rows.map(r => [r.version, r.definition]));
}

// Whether the draft holds changes not yet published.
export async function unpublished(sql: Query, form: Form): Promise<boolean> {
  if (form.version === 0) return true;
  const [row] = await sql<{ same: boolean }[]>`select (definition = ${sql.json(form.draft as never)}::jsonb) as same from versions where form_id = ${form.id} and version = ${form.version}`;
  return !row?.same;
}

// A published form by its address, for respondents: never a draft, never
// a deleted form. The caller checks the audience.
export async function bySlug(sql: Query, slug: unknown): Promise<{ form: Form; definition: Definition } | null> {
  if (typeof slug !== "string" || !slugPattern.test(slug)) return null;
  const [row] = await sql<Row[]>`select ${sql.unsafe(columns)} from forms where slug = ${slug} and deleted_at is null and version > 0 and status <> 'draft'`;
  if (!row) return null;
  const form = toForm(row);
  const def = await versionOf(sql, form.id, form.version);
  return def ? { form, definition: def } : null;
}

export type Listed = { id: string; slug: string; title: string; status: Status; audience: Audience; anonymous: boolean; owner: string; level: Level; answers: number; unseen: number; updatedAt: string; open: OpenState; closesAt: string | null; maxAnswers: number | null };

// The forms an actor may open: their own, those shared with them, and —
// for a manager — everyone else's. `search`: words of the title, whatever
// their case and accents.
export async function list(sql: Sql, actor: Member | null, search = ""): Promise<Listed[]> {
  if (!actor || !can(actor, "forms.answer")) throw new AppError("forbidden");
  const all = can(actor, "forms.all");
  const words = search.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().split(/\s+/u).filter(Boolean).slice(0, 6);
  const rows = await sql<(Row & { shared: Level | null; unseen: number | null; live: number })[]>`
    select ${sql.unsafe(columns.split(", ").map(c => "f." + c).join(", "))}, a.level as shared, w.unseen,
      (select count(*)::int from answers x where x.form_id = f.id and x.deleted_at is null) as live
    from forms f
    left join access a on a.form_id = f.id and a.member = ${actor.id}
    left join watchers w on w.form_id = f.id and w.member = ${actor.id}
    where f.deleted_at is null and (${all} or f.owner = ${actor.id} or a.member is not null)
    order by f.updated_at desc
    limit ${limits.forms}`;
  const plain = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase();
  return rows.filter(r => words.every(w => plain(`${r.draft.title ?? ""} ${r.draft.alt?.texts["title"] ?? ""}`).includes(w))).map(r => {
    const form = toForm(r);
    return {
      // In the reader's language when the form has a version in it.
      id: form.id, slug: form.slug, title: readIn(form.draft, localeOf(actor.language)).title, status: form.status, audience: form.audience, anonymous: form.anonymous, owner: form.owner,
      level: levelOn(actor, form, r.shared) ?? "viewer", answers: r.live, unseen: r.unseen ?? 0, updatedAt: form.updatedAt, open: openState(form), closesAt: form.closesAt, maxAnswers: form.maxAnswers,
    };
  });
}

export type TeamForm = { slug: string; title: string; anonymous: boolean; answered: boolean; once: boolean; closesAt: string | null };

// The team's open forms, and whether the actor answered each: what the
// home page offers to answer.
export async function teamForms(sql: Sql, actor: Member | null): Promise<TeamForm[]> {
  if (!actor || !can(actor, "forms.answer")) return [];
  const rows = await sql<(Row & { answered: boolean; title: string })[]>`
    select ${sql.unsafe(columns.split(", ").map(c => "f." + c).join(", "))}, coalesce(case when v.definition->'alt'->>'language' = ${localeOf(actor.language)} then nullif(v.definition->'alt'->'texts'->>'title', '') end, v.definition->>'title') as title,
      case when f.anonymous then exists (select 1 from participants p where p.form_id = f.id and p.member = ${actor.id})
           else exists (select 1 from answers x where x.form_id = f.id and x.respondent = ${actor.id} and x.deleted_at is null) end as answered
    from forms f join versions v on v.form_id = f.id and v.version = f.version
    where f.deleted_at is null and f.audience = 'team' and f.status = 'published'
    order by f.published_at desc nulls last
    limit 100`;
  return rows.filter(r => openState(toForm(r)).open).map(r => ({ slug: r.slug, title: r.title, anonymous: r.anonymous, answered: r.answered, once: r.once, closesAt: r.closes_at ? r.closes_at.toISOString() : null }));
}

// ---- Writing ----------------------------------------------------------------

const slugAlphabet = "abcdefghijkmnpqrstuvwxyz23456789";
export function newSlug(): string {
  return Array.from({ length: 8 }, () => slugAlphabet[randomInt(slugAlphabet.length)]).join("");
}

// routes: the links to other tools it starts with (lib/routes.ts);
// notifyEmail: the owner's alerts by email (on for a public form where the
// Chest's mail is not known to be missing — createForm decides).
export type Start = { definition: Definition; settings?: Partial<Pick<Settings, "audience" | "once" | "layout" | "accent" | "sendCopy" | "anonymous" | "notifyEmail">>; routes?: Routes };

export async function create(sql: Sql, actor: Member | null, start: Start): Promise<Form> {
  if (!actor || !(await mayCreate(sql, actor))) throw new AppError("forbidden");
  const def = definition(start.definition);
  const s = start.settings ?? {};
  const anonymous = s.audience === "team" && s.anonymous === true;
  const { count } = (await sql<{ count: number }[]>`select count(*)::int as count from forms where deleted_at is null`)[0]!;
  if (count >= limits.forms) throw new AppError("at_most", { max: limits.forms });
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await sql<Row[]>`
      insert into forms (slug, owner, draft, audience, anonymous, once, layout, accent, send_copy, notify_email, routes)
      values (${newSlug()}, ${actor.id}, ${sql.json(def as never)}, ${s.audience ?? "public"}, ${anonymous}, ${anonymous || (s.once ?? true)}, ${s.layout ?? "steps"}, ${s.accent ?? "berry"}, ${!anonymous && s.sendCopy === true}, ${s.notifyEmail === true},
        ${sql.json((anonymous ? noRoutes : cleanRoutes(start.routes ?? null, def, { anonymous, audience: s.audience ?? "public" })) as never)})
      on conflict (slug) do nothing
      returning ${sql.unsafe(columns)}`;
    if (row) {
      await sql`insert into watchers (form_id, member) values (${row.id}, ${actor.id}) on conflict do nothing`;
      return toForm(row);
    }
  }
  throw new AppError("unknown");
}

// saveDraft keeps the builder's working copy. `revision` is the one the
// page loaded: someone else's save in between is a conflict, never lost.
export async function saveDraft(sql: Sql, actor: Member | null, formId: unknown, text: unknown, revision: unknown): Promise<{ revision: number; updatedAt: string }> {
  const { form } = await open(sql, actor, formId, "editor");
  const def = definitionFromText(text);
  if (typeof revision !== "number" || !Number.isInteger(revision)) throw new AppError("invalid");
  const [row] = await sql<{ revision: number; updated_at: Date }[]>`
    update forms set draft = ${sql.json(def as never)}, revision = revision + 1, updated_at = now()
    where id = ${form.id} and revision = ${revision} and deleted_at is null
    returning revision, updated_at`;
  if (!row) throw new AppError("conflict");
  return { revision: row.revision, updatedAt: row.updated_at.toISOString() };
}

// overwriteDraft: the editor keeps their version after a conflict — the
// one saved meanwhile is replaced (they were shown it and chose).
export async function overwriteDraft(sql: Sql, actor: Member | null, formId: unknown, text: unknown): Promise<{ revision: number; updatedAt: string }> {
  const { form } = await open(sql, actor, formId, "editor");
  const def = definitionFromText(text);
  const [row] = await sql<{ revision: number; updated_at: Date }[]>`
    update forms set draft = ${sql.json(def as never)}, revision = revision + 1, updated_at = now()
    where id = ${form.id} and deleted_at is null returning revision, updated_at`;
  if (!row) throw new AppError("not_found");
  return { revision: row.revision, updatedAt: row.updated_at.toISOString() };
}

// A form whose questions ask for files cannot be anonymous: an upload goes
// through the member's own session, which the Chest knows.
const hasFiles = (def: Definition) => allQuestions(def).some(q => q.kind === "file");

// publish makes the draft the form respondents see: a new version when it
// changed (answers already given keep theirs), then open.
export async function publish(sql: Sql, actor: Member | null, formId: unknown): Promise<{ form: Form; version: number; first: boolean }> {
  return sql.begin(async tx => {
    const { form } = await open(tx, actor, formId, "editor");
    await tx`select 1 from forms where id = ${form.id} for update`;
    const def = definition(form.draft);
    const found = problems(def);
    if (found.length > 0) throw new AppError("incomplete", { count: found.length });
    if (form.anonymous && hasFiles(def)) throw new AppError("anonymous_files");
    let version = form.version;
    if (await unpublished(tx, form)) {
      version = form.version + 1;
      // An anonymous form with answers keeps one version: an answer's
      // version would say when it came (before or after a change), and
      // with a few colleagues that names someone. Its words may change —
      // every answer moves to the new version —, its questions may not.
      const [answered] = form.anonymous && form.version > 0 ? await tx`select 1 from answers where form_id = ${form.id} limit 1` : [];
      if (answered) {
        const before = await versionOf(tx, form.id, form.version);
        if (!before || skeleton(before) !== skeleton(def)) throw new AppError("anonymous_questions");
      }
      await tx`insert into versions (form_id, version, definition) values (${form.id}, ${version}, ${tx.json(def as never)})`;
      if (answered) await tx`update answers set version = ${version} where form_id = ${form.id}`;
    }
    const first = form.version === 0;
    // Reopening a form whose date passed clears the date; one at its limit
    // stays closed until the limit is raised.
    const [row] = await tx<Row[]>`
      update forms set version = ${version}, status = 'published', updated_at = now(), closed_at = null,
        published_at = coalesce(published_at, now()),
        closes_at = case when closes_at is not null and closes_at <= now() then null else closes_at end
      where id = ${form.id}
      returning ${tx.unsafe(columns)}`;
    return { form: toForm(row!), version, first };
  });
}

// discard brings the draft back to the published version.
export async function discard(sql: Sql, actor: Member | null, formId: unknown): Promise<void> {
  const { form } = await open(sql, actor, formId, "editor");
  if (form.version === 0) throw new AppError("invalid");
  await sql`update forms f set draft = v.definition, revision = f.revision + 1, updated_at = now() from versions v where f.id = ${form.id} and v.form_id = f.id and v.version = f.version`;
}

export async function close(sql: Sql, actor: Member | null, formId: unknown): Promise<Form> {
  const { form } = await open(sql, actor, formId, "editor");
  if (form.status !== "published") throw new AppError("invalid");
  const [row] = await sql<Row[]>`update forms set status = 'closed', closed_at = now(), updated_at = now() where id = ${form.id} returning ${sql.unsafe(columns)}`;
  return toForm(row!);
}

export async function reopen(sql: Sql, actor: Member | null, formId: unknown): Promise<Form> {
  const { form } = await open(sql, actor, formId, "editor");
  if (form.version === 0) throw new AppError("invalid");
  if (form.answerCount >= capOf(form)) throw new AppError("full");
  const [row] = await sql<Row[]>`
    update forms set status = 'published', closed_at = null, updated_at = now(),
      closes_at = case when closes_at is not null and closes_at <= now() then null else closes_at end
    where id = ${form.id} returning ${sql.unsafe(columns)}`;
  return toForm(row!);
}

// People who may open a form besides the managers: its owner and those it
// is shared with — the only people who may be told of its answers.
export async function team(sql: Query, formId: string): Promise<{ owner: string; shared: { member: string; level: Level }[]; watchers: string[] }> {
  const [f] = await sql<{ owner: string }[]>`select owner from forms where id = ${formId}`;
  const shared = await sql<{ member: string; level: Level }[]>`select member, level from access where form_id = ${formId} order by member`;
  const watchers = (await sql<{ member: string }[]>`select member from watchers where form_id = ${formId} order by member`).map(w => w.member);
  return { owner: f?.owner ?? "", shared: [...shared], watchers };
}

// saveSettings: how the form is answered. Anonymity cannot change once
// someone answered (it would change what they were promised).
export async function saveSettings(sql: Sql, actor: Member | null, formId: unknown, raw: unknown, closesAt: Date | null): Promise<Form> {
  return sql.begin(async tx => {
    const { form } = await open(tx, actor, formId, "editor");
    await tx`select 1 from forms where id = ${form.id} for update`;
    const s = readSettings(raw, closesAt ? closesAt.toISOString() : null);
    // Also a contact, a ticket: checked against the form's questions.
    const routes = cleanRoutes((raw as Record<string, unknown>)["routes"], form.draft, s);
    if (s.anonymous !== form.anonymous) {
      const { taken } = (await tx<{ taken: boolean }[]>`select exists (select 1 from answers where form_id = ${form.id}) or exists (select 1 from participants where form_id = ${form.id}) as taken`)[0]!;
      if (taken) throw new AppError("anonymous_locked");
    }
    if (s.anonymous && (hasFiles(form.draft) || (form.version > 0 && hasFiles((await versionOf(tx, form.id, form.version))!)))) throw new AppError("anonymous_files");
    const [row] = await tx<Row[]>`
      update forms set audience = ${s.audience}, anonymous = ${s.anonymous}, once = ${s.once}, tell_team = ${s.tellTeam}, layout = ${s.layout}, accent = ${s.accent},
        closes_at = ${s.closesAt}, max_answers = ${s.maxAnswers}, thanks_title = ${s.thanksTitle}, thanks_body = ${s.thanksBody},
        redirect_url = ${s.redirectUrl}, send_copy = ${s.sendCopy}, retention_months = ${s.retentionMonths},
        notify_email = ${s.notifyEmail}, share_events = ${s.shareEvents}, routes = ${tx.json(routes as never)},
        kiosk = ${s.kiosk}, hidden_fields = ${s.hiddenFields}, updated_at = now()
      where id = ${form.id} returning ${tx.unsafe(columns)}`;
    // Only people who may open the form can be told of its answers.
    const { owner, shared } = await team(tx, form.id);
    const allowed = new Set([owner, ...shared.map(x => x.member)]);
    const wanted = s.watchers.filter(m => allowed.has(m) || m === actor!.id);
    await tx`delete from watchers where form_id = ${form.id} and not (member = any(${wanted}))`;
    for (const m of wanted) await tx`insert into watchers (form_id, member) values (${form.id}, ${m}) on conflict do nothing`;
    return toForm(row!);
  });
}

// setCover: the picture at the top of the respondent's page (null: none).
// Answers the object replaced, which the caller deletes.
export async function setCover(sql: Sql, actor: Member | null, formId: unknown, cover: unknown): Promise<string | null> {
  const { form } = await open(sql, actor, formId, "editor");
  if (cover !== null && !isImage(cover)) throw new AppError("invalid");
  const value = cover === null ? null : { object: cover.object, version: cover.version };
  if (value && !value.object.startsWith("public/covers/")) throw new AppError("invalid");
  await sql`update forms set cover = ${value ? sql.json(value as never) : null}, updated_at = now() where id = ${form.id}`;
  return form.cover && form.cover.object !== value?.object ? form.cover.object : null;
}

// share gives a member a level on a form (editor or viewer), or takes it
// back (null). Only its owner (or a manager) shares.
export async function share(sql: Sql, actor: Member | null, formId: unknown, member: unknown, level: unknown): Promise<void> {
  const { form } = await open(sql, actor, formId, "owner");
  if (!isMemberId(member) || member === form.owner) throw new AppError("invalid");
  if (level === null) {
    await sql`delete from access where form_id = ${form.id} and member = ${member}`;
    await sql`delete from watchers where form_id = ${form.id} and member = ${member}`;
    return;
  }
  if (level !== "editor" && level !== "viewer") throw new AppError("invalid");
  const { count } = (await sql<{ count: number }[]>`select count(*)::int as count from access where form_id = ${form.id}`)[0]!;
  if (count >= limits.collaborators) throw new AppError("at_most", { max: limits.collaborators });
  await sql`insert into access (form_id, member, level) values (${form.id}, ${member}, ${level}) on conflict (form_id, member) do update set level = excluded.level`;
}

// duplicate: a new draft with the same questions (new ids) and settings,
// owned by the actor; no answers, no collaborators.
export async function duplicate(sql: Sql, actor: Member | null, formId: unknown, title: (old: string) => string): Promise<Form> {
  const { form } = await open(sql, actor, formId, "viewer");
  const def = copyDefinition(form.draft);
  def.title = [...title(def.title)].slice(0, limits.title).join("");
  const copy = await create(sql, actor, { definition: def, settings: { audience: form.audience, anonymous: form.anonymous, once: form.once, layout: form.layout, accent: form.accent, sendCopy: form.sendCopy } });
  await sql`update forms set thanks_title = ${form.thanksTitle}, thanks_body = ${form.thanksBody}, redirect_url = ${form.redirectUrl}, retention_months = ${form.retentionMonths},
    notify_email = ${form.notifyEmail}, share_events = ${form.shareEvents}, cover = ${form.cover ? sql.json(form.cover as never) : null} where id = ${copy.id}`;
  return copy;
}

// remove puts a form aside (Undo brings it back); it goes for good, with
// its answers and files, after 30 days (cleanup).
export async function remove(sql: Sql, actor: Member | null, formId: unknown): Promise<void> {
  const { form } = await open(sql, actor, formId, "owner");
  await sql`update forms set deleted_at = now() where id = ${form.id}`;
}

// ownsAny: the actor owns a form (deleted ones aside).
export async function ownsAny(sql: Sql, actor: Member): Promise<boolean> {
  const [row] = await sql`select 1 from forms where owner = ${actor.id} and deleted_at is null limit 1`;
  return row !== undefined;
}

// The forms put aside in the last 30 days that the actor may bring back:
// their own (whatever their role: a Member may own forms, lib/creators.ts),
// or every one for a manager. Newest first.
export type Deleted = { id: string; title: string; owner: string; answers: number; deletedAt: string };
export const trashDays = 30;
export async function trash(sql: Sql, actor: Member | null): Promise<Deleted[]> {
  if (!actor || !can(actor, "forms.answer")) return [];
  const all = can(actor, "forms.all");
  const rows = await sql<{ id: string; title: string; owner: string; answers: number; deleted_at: Date }[]>`
    select f.id, f.draft->>'title' as title, f.owner, f.deleted_at,
      (select count(*)::int from answers a where a.form_id = f.id and a.deleted_at is null) as answers
    from forms f
    where f.deleted_at is not null and f.deleted_at > now() - make_interval(days => ${trashDays}) and (${all} or f.owner = ${actor.id})
    order by f.deleted_at desc limit 200`;
  return rows.map(r => ({ id: String(r.id), title: r.title ?? "", owner: r.owner, answers: r.answers, deletedAt: r.deleted_at.toISOString() }));
}

export async function restore(sql: Sql, actor: Member | null, formId: unknown): Promise<void> {
  const id = readId(formId);
  const [row] = await sql<Row[]>`select ${sql.unsafe(columns)} from forms where id = ${id} and deleted_at is not null`;
  if (!row || !actor) throw new AppError("not_found");
  if (levelOn(actor, row, null) !== "owner") throw new AppError("not_found");
  await sql`update forms set deleted_at = null where id = ${id}`;
}
