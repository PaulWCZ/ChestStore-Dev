import type { Member } from "@argentic/chest-sdk/member";
import { can, inAudience, roleOf, type Grouped } from "./access.ts";
import { hasTool } from "./audience.ts";
import { groupsOfTool } from "./groups.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { excerpt } from "./markdown.ts";
import { clean, emojiNames, groupIds, id, ids, isCoverType, isEmoji, isKind, limits, memberId, type Emoji, type Kind } from "./model.ts";
import { day as readDay, local, time as readTime, today, zoned } from "./time.ts";

// Posts and what hangs on them: files, reactions, comments, "I have read
// it", answers to events, and each member's last visit. Every function takes
// the database and the member acting, checks their rights first
// (lib/access.ts) and throws AppError(code); none returns a sentence.

export type EventInfo = { day: string; start: string | null; end: string | null; place: string | null };
export type PostSummary = {
  id: string;
  kind: Kind;
  title: string;
  excerpt: string;
  author: string;
  important: boolean;
  pinned: boolean;
  publishAt: string;
  scheduled: boolean;
  editedAt: string | null;
  event: EventInfo | null;
  welcome: string | null;
  // The groups it is kept to; none: everyone.
  groups: string[];
  cover: string | null;
  reactions: number;
  comments: number;
  confirmed: boolean;
  rsvp: "yes" | "no" | null;
  going: number;
};
export type FileInfo = { id: string; fileName: string; type: string; size: number };
export type Comment = { id: string; author: string; body: string; at: string; edited: boolean };
export type Reaction = { emoji: Emoji; count: number; mine: boolean; people: string[] };
export type PostDetail = PostSummary & {
  body: string;
  createdAt: string;
  attachments: FileInfo[];
  coverFile: FileInfo | null;
  reactionList: Reaction[];
  thread: Comment[];
  answers: { member: string; answer: "yes" | "no" }[];
  eventOpen: boolean;
  confirmedAt: string | null;
  // The actor is in its audience (an admin or its author may see a post
  // that is not for them: they are not asked to confirm it).
  forMe: boolean;
};

type Row = {
  id: string; kind: Kind; title: string; body: string; author: string; important: boolean; pinned_at: Date | null; publish_at: Date; edited_at: Date | null; created_at: Date;
  event_day: string | null; event_start: Date | null; event_end: Date | null; place: string | null; welcome: string | null; groups: string[];
  cover: string | null; reactions: number; comments: number; confirmed: boolean; rsvp: "yes" | "no" | null; going: number;
};

const columns = (sql: Query, actor: string) => sql`
  p.id, p.kind, p.title, p.body, p.author, p.important, p.pinned_at, p.publish_at, p.edited_at, p.created_at,
  to_char(p.event_day, 'YYYY-MM-DD') as event_day, p.event_start, p.event_end, p.place, p.welcome,
  array(select g.group_id from post_groups g where g.post_id = p.id order by g.group_id) as groups,
  (select f.id from files f where f.post_id = p.id and f.role = 'cover') as cover,
  (select count(*)::int from reactions r where r.post_id = p.id) as reactions,
  (select count(*)::int from comments c where c.post_id = p.id and c.deleted_at is null) as comments,
  exists (select 1 from confirmations k where k.post_id = p.id and k.member = ${actor}) as confirmed,
  (select v.answer from rsvps v where v.post_id = p.id and v.member = ${actor}) as rsvp,
  (select count(*)::int from rsvps v where v.post_id = p.id and v.answer = 'yes') as going`;

function summary(r: Row, now: Date): PostSummary {
  return {
    id: String(r.id),
    kind: r.kind,
    title: r.title,
    excerpt: excerpt(r.body, 220),
    author: r.author,
    important: r.important,
    pinned: r.pinned_at !== null,
    publishAt: r.publish_at.toISOString(),
    scheduled: r.publish_at.getTime() > now.getTime(),
    editedAt: r.edited_at?.toISOString() ?? null,
    event: r.kind === "event" && r.event_day ? { day: r.event_day, start: r.event_start?.toISOString() ?? null, end: r.event_end?.toISOString() ?? null, place: r.place } : null,
    welcome: r.welcome,
    groups: r.groups,
    cover: r.cover === null ? null : String(r.cover),
    reactions: r.reactions,
    comments: r.comments,
    confirmed: r.confirmed,
    rsvp: r.rsvp,
    going: r.going,
  };
}

function reader(actor: Member | null): Member {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  return actor;
}

function publisher(actor: Member | null): Member {
  if (!actor || !can(actor, "publish")) throw new AppError("forbidden");
  return actor;
}

// A post is for this person: for everyone, or for one of their groups.
export const forPerson = (sql: Query, person: Grouped) => person.groups.length === 0
  ? sql`not exists (select 1 from post_groups g where g.post_id = p.id)`
  : sql`(not exists (select 1 from post_groups g where g.post_id = p.id) or exists (select 1 from post_groups g where g.post_id = p.id and g.group_id in ${sql([...person.groups])}))`;

// Who sees a post kept to groups: its audience, its author, the Chest's
// admins (lib/access.ts, seesPost).
export const audienceSeen = (sql: Query, actor: Member) => (actor.isAdmin ? sql`true` : sql`(p.author = ${actor.id} or ${forPerson(sql, actor)})`);

// What the actor sees: readers, what is published; publishers, what is
// scheduled too; both, only posts for them (audienceSeen). Deleted posts,
// nobody (but "Undo").
export const seen = (sql: Query, actor: Member) => (can(actor, "publish")
  ? sql`p.deleted_at is null and ${audienceSeen(sql, actor)}`
  : sql`p.deleted_at is null and p.publish_at <= now() and ${audienceSeen(sql, actor)}`);

// The front page: pinned first, then newest first; the upcoming events; the
// scheduled posts (publishers); the Important posts the actor has not yet
// confirmed.
export type Front = { posts: PostSummary[]; more: boolean; upcoming: PostSummary[]; scheduled: PostSummary[]; toConfirm: { id: string; title: string }[] };

export async function front(sql: Sql, actor: Member | null, options: { kind?: unknown; page?: unknown; zone: string; now?: Date }): Promise<Front> {
  const who = reader(actor);
  const now = options.now ?? new Date();
  const kind = isKind(options.kind) ? options.kind : null;
  const pageNumber = typeof options.page === "string" && /^[1-9][0-9]{0,4}$/u.test(options.page) ? Number(options.page) : 1;
  const rows = await sql<Row[]>`
    select ${columns(sql, who.id)} from posts p
    where p.deleted_at is null and p.publish_at <= ${now} and ${audienceSeen(sql, who)} ${kind ? sql`and p.kind = ${kind}` : sql``}
    order by p.pinned_at desc nulls last, p.publish_at desc, p.id desc
    limit ${limits.page + 1} offset ${(pageNumber - 1) * limits.page}`;
  const upcoming = await sql<Row[]>`
    select ${columns(sql, who.id)} from posts p
    where p.deleted_at is null and p.publish_at <= ${now} and ${audienceSeen(sql, who)} and p.kind = 'event' and p.event_day >= ${today(options.zone, now)}
    order by p.event_day, p.event_start nulls first, p.id
    limit 5`;
  const scheduled = can(who, "publish")
    ? await sql<Row[]>`select ${columns(sql, who.id)} from posts p where p.deleted_at is null and p.publish_at > ${now} and ${audienceSeen(sql, who)} order by p.publish_at, p.id limit 50`
    : [];
  const toConfirm = await sql<{ id: string; title: string }[]>`
    select p.id, p.title from posts p
    where p.important and p.deleted_at is null and p.publish_at <= ${now} and p.publish_at > ${now}::timestamptz - make_interval(days => ${limits.confirmDays})
      and p.author <> ${who.id} and ${forPerson(sql, who)} and not exists (select 1 from confirmations k where k.post_id = p.id and k.member = ${who.id})
    order by p.publish_at desc limit 20`;
  return {
    posts: rows.slice(0, limits.page).map(r => summary(r, now)),
    more: rows.length > limits.page,
    upcoming: upcoming.map(r => summary(r, now)),
    scheduled: scheduled.map(r => summary(r, now)),
    toConfirm: toConfirm.map(r => ({ id: String(r.id), title: r.title })),
  };
}

// A post seen by the actor, or not_found.
async function visible(sql: Query, actor: Member, postId: unknown): Promise<Row> {
  const key = id(postId);
  const [row] = await sql<Row[]>`select ${columns(sql, actor.id)} from posts p where p.id = ${key} and ${seen(sql, actor)}`;
  if (!row) throw new AppError("not_found");
  return row;
}

// An event is open to answers until the end of its day.
function eventOpen(row: Pick<Row, "kind" | "event_day">, zone: string, now: Date): boolean {
  return row.kind === "event" && row.event_day !== null && row.event_day >= today(zone, now);
}

export async function post(sql: Sql, actor: Member | null, postId: unknown, options: { zone: string; now?: Date }): Promise<PostDetail> {
  const who = reader(actor);
  const now = options.now ?? new Date();
  const row = await visible(sql, who, postId);
  const key = String(row.id);
  const fileRows = await sql<{ id: string; role: string; file_name: string; type: string; size: string }[]>`select id, role, file_name, type, size from files where post_id = ${key} order by added_at, id`;
  const reactionRows = await sql<{ emoji: Emoji; member: string }[]>`select emoji, member from reactions where post_id = ${key} order by at, id`;
  const thread = await sql<{ id: string; author: string; body: string; created_at: Date; edited_at: Date | null }[]>`
    select id, author, body, created_at, edited_at from comments where post_id = ${key} and deleted_at is null order by created_at, id limit ${limits.commentsPerPost}`;
  const answers = await sql<{ member: string; answer: "yes" | "no" }[]>`select member, answer from rsvps where post_id = ${key} order by at, member`;
  const [mine] = await sql<{ at: Date }[]>`select at from confirmations where post_id = ${key} and member = ${who.id}`;
  const file = (f: (typeof fileRows)[number]): FileInfo => ({ id: String(f.id), fileName: f.file_name, type: f.type, size: Number(f.size) });
  const cover = fileRows.find(f => f.role === "cover");
  return {
    ...summary(row, now),
    body: row.body,
    createdAt: row.created_at.toISOString(),
    coverFile: cover ? file(cover) : null,
    attachments: fileRows.filter(f => f.role === "attachment").map(file),
    reactionList: emojiNames.map(emoji => {
      const people = reactionRows.filter(r => r.emoji === emoji).map(r => r.member);
      return { emoji, count: people.length, mine: people.includes(who.id), people };
    }),
    thread: thread.map(c => ({ id: String(c.id), author: c.author, body: c.body, at: c.created_at.toISOString(), edited: c.edited_at !== null })),
    answers,
    eventOpen: eventOpen(row, options.zone, now),
    confirmedAt: mine?.at.toISOString() ?? null,
    forMe: inAudience(who, row),
  };
}

// What the composer sends. Days and times are read on the Chest's clock.
export type PostInput = {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  important?: unknown;
  pinned?: unknown;
  // null or absent: now. Otherwise the day and time it appears.
  publishAt?: { day?: unknown; time?: unknown } | null;
  event?: { day?: unknown; start?: unknown; end?: unknown; place?: unknown } | null;
  welcome?: unknown;
  // The groups it is kept to (grp_… of the groups that give News); none or
  // absent: everyone.
  groups?: unknown;
  cover?: unknown;
  attachments?: unknown;
};

type Clean = {
  kind: Kind; title: string; body: string; important: boolean; pinned: boolean; publishAt: Date | null;
  event: { day: string; start: Date | null; end: Date | null; place: string | null } | null;
  welcome: string | null; cover: string | null; attachments: string[]; groups: string[];
};

// kept is the groups the post already has: they stay valid when the Chest
// no longer lists one (a group that stopped giving News); a new one must be
// a group that gives News now.
async function read(input: PostInput, zone: string, now: Date, kept: readonly string[] = []): Promise<Clean> {
  if (!input || typeof input !== "object") throw new AppError("invalid");
  if (!isKind(input.kind)) throw new AppError("invalid");
  const kind = input.kind;
  const title = clean(input.title, limits.title);
  const body = clean(input.body ?? "", limits.body, { multiline: true, optional: true });
  let publishAt: Date | null = null;
  if (input.publishAt) {
    publishAt = zoned(readDay(input.publishAt.day), readTime(input.publishAt.time), zone);
    if (publishAt.getTime() > now.getTime() + limits.scheduleDays * 864e5) throw new AppError("bad_date");
    // A time already gone publishes now.
    if (publishAt.getTime() <= now.getTime()) publishAt = null;
  }
  let event: Clean["event"] = null;
  if (kind === "event") {
    const e = input.event ?? {};
    const eventDay = readDay(e.day);
    const start = e.start === undefined || e.start === null || e.start === "" ? null : zoned(eventDay, readTime(e.start), zone);
    const end = e.end === undefined || e.end === null || e.end === "" ? null : zoned(eventDay, readTime(e.end), zone);
    if (end && (!start || end.getTime() <= start.getTime())) throw new AppError("bad_date");
    const place = clean(e.place ?? "", limits.place, { optional: true }) || null;
    event = { day: eventDay, start, end, place };
  }
  let welcome: string | null = null;
  if (kind === "welcome") {
    welcome = memberId(input.welcome);
    const has = await hasTool(welcome);
    if (has === "unavailable") throw new AppError("unavailable");
    if (!has) throw new AppError("no_person");
  }
  const cover = input.cover === null || input.cover === undefined || input.cover === "" ? null : id(input.cover);
  const attachments = input.attachments === undefined ? [] : ids(input.attachments, limits.attachmentsPerPost).filter(a => a !== cover);
  const groups = input.groups === undefined || input.groups === null ? [] : groupIds(input.groups);
  const added = groups.filter(g => !kept.includes(g));
  if (added.length > 0) {
    const known = await groupsOfTool();
    if (known === "unavailable") throw new AppError("unavailable");
    if (added.some(g => !known.some(k => k.id === g))) throw new AppError("no_group");
  }
  return { kind, title, body, important: input.important === true, pinned: input.pinned === true, publishAt, event, welcome, cover, attachments, groups };
}

// files puts the post's cover and attachments as the composer lists them:
// a file is the actor's own new upload or already the post's; the post's
// files left out are removed (their objects are returned, to remove from the
// Chest after the transaction).
async function setFiles(tx: Query, actor: Member, postId: string, cover: string | null, attachments: string[]): Promise<string[]> {
  const wanted = [...(cover ? [cover] : []), ...attachments];
  const rows = wanted.length === 0 ? [] : await tx<{ id: string; post_id: string | null; added_by: string; type: string }[]>`select id, post_id, added_by, type from files where id in ${tx(wanted)}`;
  for (const w of wanted) {
    const f = rows.find(r => String(r.id) === w);
    const usable = f && (f.post_id === null ? f.added_by === actor.id : String(f.post_id) === postId);
    if (!usable) throw new AppError("file_missing");
    if (w === cover && !isCoverType(f.type)) throw new AppError("not_image");
  }
  const gone = await tx<{ object: string }[]>`
    delete from files where post_id = ${postId} ${wanted.length ? tx`and id not in ${tx(wanted)}` : tx``} returning object`;
  await tx`update files set role = 'attachment' where post_id = ${postId}`;
  for (const a of attachments) await tx`update files set post_id = ${postId}, role = 'attachment' where id = ${a}`;
  if (cover) await tx`update files set post_id = ${postId}, role = 'cover' where id = ${cover}`;
  return gone.map(g => g.object);
}

export type Saved = { id: string; published: boolean; important: boolean; kind: Kind; welcome: string | null; groups: string[]; removed: string[] };

export async function createPost(sql: Sql, actor: Member | null, input: PostInput, options: { zone: string; now?: Date }): Promise<Saved> {
  const who = publisher(actor);
  const now = options.now ?? new Date();
  const c = await read(input, options.zone, now);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into posts (kind, title, body, author, important, pinned_at, publish_at, event_day, event_start, event_end, place, welcome)
      values (${c.kind}, ${c.title}, ${c.body}, ${who.id}, ${c.important}, ${c.pinned ? now : null}, ${c.publishAt ?? now},
              ${c.event?.day ?? null}, ${c.event?.start ?? null}, ${c.event?.end ?? null}, ${c.event?.place ?? null}, ${c.welcome})
      returning id`;
    const key = String(row!.id);
    for (const g of c.groups) await tx`insert into post_groups (post_id, group_id) values (${key}, ${g})`;
    const removed = await setFiles(tx, who, key, c.cover, c.attachments);
    return { id: key, published: c.publishAt === null, important: c.important, kind: c.kind, welcome: c.welcome, groups: c.groups, removed };
  });
}

// Editing a post: its words, its kind's details, its files, Important and
// pinned, its audience. Its time of publication changes only while it is
// scheduled. A post made Important (or a new welcome, or an Important post
// for another audience) is told again by the next pass.
export type Updated = Saved & { importantChanged: boolean; audienceChanged: boolean };

export async function updatePost(sql: Sql, actor: Member | null, postId: unknown, input: PostInput, options: { zone: string; now?: Date }): Promise<Updated> {
  const who = publisher(actor);
  const now = options.now ?? new Date();
  const current = await visible(sql, who, postId);
  const key = String(current.id);
  const c = await read(input, options.zone, now, current.groups);
  const scheduled = current.publish_at.getTime() > now.getTime();
  const audienceChanged = c.groups.join(",") !== [...current.groups].sort().join(",");
  const publishAt = scheduled ? (c.publishAt ?? now) : current.publish_at;
  const pinnedAt = c.pinned ? (current.pinned_at ?? now) : null;
  const tellAgain = (c.important && !current.important) || (c.welcome !== null && c.welcome !== current.welcome) || ((c.important || c.welcome !== null) && audienceChanged);
  return sql.begin(async tx => {
    await tx`
      update posts set kind = ${c.kind}, title = ${c.title}, body = ${c.body}, important = ${c.important}, pinned_at = ${pinnedAt}, publish_at = ${publishAt},
        event_day = ${c.event?.day ?? null}, event_start = ${c.event?.start ?? null}, event_end = ${c.event?.end ?? null}, place = ${c.event?.place ?? null}, welcome = ${c.welcome},
        edited_at = ${scheduled ? null : now}
        ${tellAgain ? tx`, announced_at = null, announce_after = null` : tx``}
      where id = ${key}`;
    if (c.kind !== "event") await tx`delete from rsvps where post_id = ${key}`;
    if (!c.important) await tx`delete from confirmations where post_id = ${key}`;
    if (audienceChanged) {
      await tx`delete from post_groups where post_id = ${key}`;
      for (const g of c.groups) await tx`insert into post_groups (post_id, group_id) values (${key}, ${g})`;
    }
    const removed = await setFiles(tx, who, key, c.cover, c.attachments);
    return { id: key, published: publishAt.getTime() <= now.getTime(), important: c.important, kind: c.kind, welcome: c.welcome, groups: c.groups, removed, importantChanged: c.important !== current.important, audienceChanged };
  });
}

// Deleting is undone within 30 days; then the post is purged.
export async function deletePost(sql: Sql, actor: Member | null, postId: unknown): Promise<{ important: boolean }> {
  const who = publisher(actor);
  const row = await visible(sql, who, postId);
  await sql`update posts set deleted_at = now() where id = ${row.id}`;
  return { important: row.important };
}

// Only who could see a post brings it back.
export async function restorePost(sql: Sql, actor: Member | null, postId: unknown): Promise<{ important: boolean }> {
  const who = publisher(actor);
  const [row] = await sql<{ important: boolean }[]>`update posts p set deleted_at = null where p.id = ${id(postId)} and p.deleted_at is not null and ${audienceSeen(sql, who)} returning p.important`;
  if (!row) throw new AppError("not_found");
  return row;
}

export async function setPinned(sql: Sql, actor: Member | null, postId: unknown, pinned: boolean): Promise<void> {
  const who = publisher(actor);
  const row = await visible(sql, who, postId);
  if (typeof pinned !== "boolean") throw new AppError("invalid");
  await sql`update posts set pinned_at = ${pinned ? sql`coalesce(pinned_at, now())` : null} where id = ${row.id}`;
}

// Reactions: one of each per person; again removes it.
export async function react(sql: Sql, actor: Member | null, postId: unknown, emoji: unknown, on: unknown): Promise<void> {
  if (!can(actor, "react")) throw new AppError("forbidden");
  const who = actor!;
  const row = await visible(sql, who, postId);
  if (!isEmoji(emoji) || typeof on !== "boolean") throw new AppError("invalid");
  if (on) await sql`insert into reactions (post_id, member, emoji) values (${row.id}, ${who.id}, ${emoji}) on conflict (post_id, member, emoji) where member <> 'erased' do nothing`;
  else await sql`delete from reactions where post_id = ${row.id} and member = ${who.id} and emoji = ${emoji}`;
}

// Comments: flat; the post's author hears of them.
export async function addComment(sql: Sql, actor: Member | null, postId: unknown, body: unknown): Promise<{ comment: Comment; post: { id: string; title: string; author: string } }> {
  if (!can(actor, "react")) throw new AppError("forbidden");
  const who = actor!;
  const row = await visible(sql, who, postId);
  if (row.publish_at.getTime() > Date.now()) throw new AppError("closed");
  const text = clean(body, limits.comment, { multiline: true });
  if (row.comments >= limits.commentsPerPost) throw new AppError("too_many", { max: limits.commentsPerPost });
  const [created] = await sql<{ id: string; created_at: Date }[]>`insert into comments (post_id, author, body) values (${row.id}, ${who.id}, ${text}) returning id, created_at`;
  return { comment: { id: String(created!.id), author: who.id, body: text, at: created!.created_at.toISOString(), edited: false }, post: { id: String(row.id), title: row.title, author: row.author } };
}

// A comment is removed by its author or a publisher; "Undo" puts it back.
async function comment(sql: Sql, actor: Member | null, commentId: unknown, deleted: boolean): Promise<{ id: string }> {
  if (!can(actor, "react")) throw new AppError("forbidden");
  const who = actor!;
  const [row] = await sql<{ id: string; post_id: string; author: string }[]>`
    select id, post_id, author from comments where id = ${id(commentId)} and ${deleted ? sql`deleted_at is not null` : sql`deleted_at is null`}`;
  if (!row) throw new AppError("not_found");
  await visible(sql, who, String(row.post_id));
  if (row.author !== who.id && !can(who, "moderate")) throw new AppError("forbidden");
  return { id: String(row.id) };
}

export async function removeComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<void> {
  const c = await comment(sql, actor, commentId, false);
  await sql`update comments set deleted_at = now() where id = ${c.id}`;
}

export async function restoreComment(sql: Sql, actor: Member | null, commentId: unknown): Promise<void> {
  const c = await comment(sql, actor, commentId, true);
  await sql`update comments set deleted_at = null where id = ${c.id}`;
}

export async function editComment(sql: Sql, actor: Member | null, commentId: unknown, body: unknown): Promise<void> {
  const c = await comment(sql, actor, commentId, false);
  const [row] = await sql<{ author: string }[]>`select author from comments where id = ${c.id}`;
  if (row!.author !== actor!.id) throw new AppError("forbidden");
  await sql`update comments set body = ${clean(body, limits.comment, { multiline: true })}, edited_at = now() where id = ${c.id}`;
}

// "I have read it": on an Important post, once, by an explicit click.
export async function confirm(sql: Sql, actor: Member | null, postId: unknown): Promise<{ id: string }> {
  const who = reader(actor);
  const row = await visible(sql, who, postId);
  // Only its audience is asked (an admin or the author outside it is not).
  if (!row.important || row.publish_at.getTime() > Date.now() || !inAudience(who, row)) throw new AppError("invalid");
  await sql`insert into confirmations (post_id, member) values (${row.id}, ${who.id}) on conflict do nothing`;
  return { id: String(row.id) };
}

// Coming or not to an event, until the end of its day; null takes the
// answer back.
export async function answer(sql: Sql, actor: Member | null, postId: unknown, value: unknown, options: { zone: string; now?: Date }): Promise<void> {
  if (!can(actor, "react")) throw new AppError("forbidden");
  const who = actor!;
  const row = await visible(sql, who, postId);
  if (row.kind !== "event") throw new AppError("invalid");
  if (value !== "yes" && value !== "no" && value !== null) throw new AppError("invalid");
  if (!eventOpen(row, options.zone, options.now ?? new Date())) throw new AppError("closed");
  if (value === null) await sql`delete from rsvps where post_id = ${row.id} and member = ${who.id}`;
  else await sql`insert into rsvps (post_id, member, answer) values (${row.id}, ${who.id}, ${value}) on conflict (post_id, member) do update set answer = excluded.answer, at = now()`;
}

// Who confirmed an Important post, and when: its publishers only.
// Only its audience counts: a confirmation left by someone the post is no
// longer for (its audience changed) is kept, not counted.
export async function confirmations(sql: Sql, actor: Member | null, postId: unknown): Promise<{ post: { id: string; title: string; author: string; publishAt: string; remindedAt: string | null; groups: string[] }; confirmed: { member: string; at: string }[] }> {
  if (!actor || !can(actor, "confirmations")) throw new AppError("forbidden");
  const row = await visible(sql, actor, postId);
  if (!row.important) throw new AppError("not_found");
  const [extra] = await sql<{ reminded_at: Date | null }[]>`select reminded_at from posts where id = ${row.id}`;
  const list = await sql<{ member: string; at: Date }[]>`select member, at from confirmations where post_id = ${row.id} order by at, member`;
  return {
    post: { id: String(row.id), title: row.title, author: row.author, publishAt: row.publish_at.toISOString(), remindedAt: extra?.reminded_at?.toISOString() ?? null, groups: row.groups },
    confirmed: list.map(c => ({ member: c.member, at: c.at.toISOString() })),
  };
}

// A reminder to those who have not confirmed: once a day at most.
export async function claimReminder(sql: Sql, actor: Member | null, postId: unknown): Promise<{ id: string; title: string; body: string; author: string; groups: string[] }> {
  if (!actor || !can(actor, "confirmations")) throw new AppError("forbidden");
  const row = await visible(sql, actor, postId);
  if (!row.important || row.publish_at.getTime() > Date.now()) throw new AppError("not_found");
  const [claimed] = await sql<{ id: string }[]>`update posts set reminded_at = now() where id = ${row.id} and (reminded_at is null or reminded_at < now() - interval '20 hours') returning id`;
  if (!claimed) throw new AppError("too_soon");
  return { id: String(row.id), title: row.title, body: row.body, author: row.author, groups: row.groups };
}

// The number on each member's tile: Important posts of the last 90 days
// for them (their audience) they have not confirmed (not their own).
export async function unconfirmedCounts(sql: Sql, people: readonly Grouped[], now = new Date()): Promise<Map<string, number>> {
  const memberIds = [...new Set(people.map(p => p.id))];
  const groupsOf = new Map(people.map(p => [p.id, p]));
  const counts = new Map<string, number>(memberIds.map(m => [m, 0]));
  if (memberIds.length === 0) return counts;
  const open = await sql<{ id: string; author: string; groups: string[] }[]>`
    select p.id, p.author, array(select g.group_id from post_groups g where g.post_id = p.id) as groups
    from posts p where p.important and p.deleted_at is null and p.publish_at <= ${now} and p.publish_at > ${now}::timestamptz - make_interval(days => ${limits.confirmDays})`;
  if (open.length === 0) return counts;
  const done = new Set<string>();
  for (let i = 0; i < memberIds.length; i += 1000) {
    const chunk = memberIds.slice(i, i + 1000);
    const rows = await sql<{ post_id: string; member: string }[]>`select post_id, member from confirmations where post_id in ${sql(open.map(p => p.id))} and member in ${sql(chunk)}`;
    for (const r of rows) done.add(String(r.post_id) + ":" + r.member);
  }
  for (const m of memberIds) counts.set(m, open.filter(p => p.author !== m && inAudience(groupsOf.get(m)!, p) && !done.has(String(p.id) + ":" + m)).length);
  return counts;
}

// visit records that the member opened the front page and answers since
// when things are new for them: the end of their previous visit (a visit
// ends after 30 minutes without opening it). Null the first time.
export async function visit(sql: Sql, actor: Member | null, now = new Date()): Promise<string | null> {
  const who = reader(actor);
  const [row] = await sql<{ marker_at: Date | null }[]>`
    insert into visits (member, seen_at, marker_at) values (${who.id}, ${now}, null)
    on conflict (member) do update set
      marker_at = case when visits.seen_at < ${now}::timestamptz - interval '30 minutes' then visits.seen_at else visits.marker_at end,
      seen_at = greatest(visits.seen_at, ${now})
    returning marker_at`;
  return row?.marker_at?.toISOString() ?? null;
}

// Files: recorded once the Chest confirmed it holds them (the upload route
// stats the object first). Until the post is saved, the file is its
// uploader's alone.
export async function recordUpload(sql: Sql, actor: Member | null, file: { object: string; fileName: string; type: string; size: number; role: "cover" | "attachment" }): Promise<FileInfo> {
  const who = publisher(actor);
  if (file.role === "cover" && !isCoverType(file.type)) throw new AppError("not_image");
  const [created] = await sql<{ id: string }[]>`
    insert into files (object, post_id, role, file_name, type, size, added_by) values (${file.object}, null, 'attachment', ${file.fileName}, ${file.type}, ${file.size}, ${who.id})
    on conflict (object) do nothing returning id`;
  if (!created) throw new AppError("invalid");
  return { id: String(created.id), fileName: file.fileName, type: file.type, size: file.size };
}

// A file the actor may open: of a post they see, or their own upload not
// yet in a post.
export async function fileFor(sql: Sql, actor: Member | null, fileId: unknown): Promise<{ object: string; fileName: string; type: string }> {
  const who = reader(actor);
  const [f] = await sql<{ object: string; post_id: string | null; added_by: string; file_name: string; type: string }[]>`select object, post_id, added_by, file_name, type from files where id = ${id(fileId)}`;
  if (!f) throw new AppError("not_found");
  if (f.post_id === null) {
    if (f.added_by !== who.id) throw new AppError("not_found");
  } else await visible(sql, who, String(f.post_id));
  return { object: f.object, fileName: f.file_name, type: f.type };
}

// The event as a calendar file needs.
export async function eventFor(sql: Sql, actor: Member | null, postId: unknown): Promise<{ id: string; title: string; body: string; createdAt: Date; event: { day: string; start: Date | null; end: Date | null; place: string | null } }> {
  const who = reader(actor);
  const row = await visible(sql, who, postId);
  if (row.kind !== "event" || !row.event_day) throw new AppError("not_found");
  return { id: String(row.id), title: row.title, body: row.body, createdAt: row.created_at, event: { day: row.event_day, start: row.event_start, end: row.event_end, place: row.place } };
}

// The composer's view of a post being edited: days and times on the
// Chest's clock.
export type Draft = {
  kind: Kind; title: string; body: string; important: boolean; pinned: boolean; scheduled: boolean;
  publishAt: { day: string; time: string } | null;
  event: { day: string; start: string; end: string; place: string } | null;
  welcome: string | null; cover: FileInfo | null; attachments: FileInfo[]; groups: string[];
};

export async function draftOf(sql: Sql, actor: Member | null, postId: unknown, options: { zone: string; now?: Date }): Promise<Draft> {
  const who = publisher(actor);
  const d = await post(sql, who, postId, options);
  const now = options.now ?? new Date();
  const scheduled = new Date(d.publishAt).getTime() > now.getTime();
  return {
    kind: d.kind, title: d.title, body: d.body, important: d.important, pinned: d.pinned, scheduled,
    publishAt: scheduled ? local(d.publishAt, options.zone) : null,
    event: d.event ? { day: d.event.day, start: d.event.start ? local(d.event.start, options.zone).time : "", end: d.event.end ? local(d.event.end, options.zone).time : "", place: d.event.place ?? "" } : null,
    welcome: d.welcome, cover: d.coverFile, attachments: d.attachments, groups: d.groups,
  };
}

// purge removes for good what was deleted 30 days ago, and uploads never
// used after a day; it answers the Chest objects to remove.
export async function purge(sql: Sql): Promise<string[]> {
  return sql.begin(async tx => {
    const objects = await tx<{ object: string }[]>`
      select f.object from files f join posts p on p.id = f.post_id where p.deleted_at < now() - interval '30 days'
      union all select object from files where post_id is null and added_at < now() - interval '1 day'`;
    await tx`delete from posts where deleted_at < now() - interval '30 days'`;
    await tx`delete from files where post_id is null and added_at < now() - interval '1 day'`;
    await tx`delete from comments where deleted_at < now() - interval '30 days'`;
    return objects.map(o => o.object);
  });
}

export const isPublisher = (actor: Member | null): boolean => can(actor, "publish");
export const hasRole = (actor: Member | null): boolean => roleOf(actor) !== null;
