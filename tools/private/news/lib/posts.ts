import type { Member } from "@argentic/chest-sdk/member";
import { can, inAudience, roleOf, type Grouped } from "./access.ts";
import { hasTool, haveTool } from "./audience.ts";
import { chestGroups } from "./groups.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { isLocale } from "./i18n/index.ts";
import { excerpt } from "./markdown.ts";
import { clean, emojiNames, groupIds, id, ids, imageRefs, isCoverType, isEmoji, isKind, isVideoType, limits, memberId, peopleIds, pick, type Emoji, type Kind, type Version } from "./model.ts";
import { freezeViews } from "./views.ts";
import { day as readDay, local, nextDay, time as readTime, today, zoned } from "./time.ts";

// Posts and what hangs on them: files, reactions, comments, "I have read
// it", answers to events, and each member's last visit. Every function takes
// the database and the member acting, checks their rights first
// (lib/access.ts) and throws AppError(code); none returns a sentence.

// An event: its first day in the Chest's time zone (and its last, over
// several days); its start and end (null start: all day); its place; its
// seats (null: no limit).
export type EventInfo = { day: string; lastDay: string | null; start: string | null; end: string | null; place: string | null; seats: number | null };
export type PostSummary = {
  id: string;
  kind: Kind;
  // In the reader's language when the post has it (lib/model.ts, pick).
  title: string;
  excerpt: string;
  locale: string;
  author: string;
  important: boolean;
  pinned: boolean;
  publishAt: string;
  scheduled: boolean;
  // Published a few seconds from now, "Undo" still possible (nothing sent).
  sending: boolean;
  editedAt: string | null;
  event: EventInfo | null;
  welcome: string | null;
  // The groups and the people it is kept to; none: everyone.
  groups: string[];
  people: string[];
  cover: string | null;
  reactions: number;
  comments: number;
  confirmed: boolean;
  rsvp: "yes" | "no" | "wait" | null;
  going: number;
};
export type FileInfo = { id: string; fileName: string; type: string; size: number };
// A mention in a comment is written @[mbr_…] in its text.
export type Comment = { id: string; parentId: string | null; author: string; body: string; at: string; edited: boolean };
export type Reaction = { emoji: Emoji; count: number; mine: boolean; people: string[] };
export type PostDetail = PostSummary & {
  body: string;
  // The post's own words and its other languages, as written.
  own: Version;
  versions: Version[];
  createdAt: string;
  attachments: FileInfo[];
  gallery: FileInfo[];
  coverFile: FileInfo | null;
  reactionList: Reaction[];
  thread: Comment[];
  answers: { member: string; answer: "yes" | "no" | "wait" }[];
  eventOpen: boolean;
  confirmedAt: string | null;
  // The actor confirmed an earlier version of the text.
  confirmedEarlier: boolean;
  // The actor is in its audience (an admin or its author may see a post
  // that is not for them: they are not asked to confirm it).
  forMe: boolean;
  pinnedUntil: string | null;
  undoUntil: string | null;
  emailed: number;
  emailShort: boolean;
  textVersion: number;
};

type Row = {
  id: string; kind: Kind; title: string; body: string; locale: string; versions: Version[]; author: string; important: boolean;
  pinned_at: Date | null; pinned_until: Date | null; pinned: boolean; publish_at: Date; edited_at: Date | null; created_at: Date; undo_until: Date | null;
  event_day: string | null; event_last_day: string | null; event_start: Date | null; event_end: Date | null; place: string | null; seats: number | null;
  welcome: string | null; groups: string[]; people: string[];
  cover: string | null; reactions: number; comments: number; confirmed: boolean; rsvp: "yes" | "no" | "wait" | null; going: number;
  text_version: number; confirm_from: number; emailed: number; email_short: boolean;
};

// Pinned: until its day, if it has one (computed when read).
const pinnedNow = (sql: Query, now: Date) => sql`(p.pinned_at is not null and (p.pinned_until is null or p.pinned_until > ${now}))`;

const columns = (sql: Query, actor: string, now: Date) => sql`
  p.id, p.kind, p.title, p.body, p.locale, p.author, p.important, p.pinned_at, p.pinned_until, ${pinnedNow(sql, now)} as pinned,
  p.publish_at, p.edited_at, p.created_at, p.undo_until,
  to_char(p.event_day, 'YYYY-MM-DD') as event_day, to_char(p.event_last_day, 'YYYY-MM-DD') as event_last_day, p.event_start, p.event_end, p.place, p.seats, p.welcome,
  p.text_version, p.confirm_from, p.email_short,
  (select count(distinct e.member)::int from emails e where e.post_id = p.id) as emailed,
  coalesce((select json_agg(json_build_object('locale', v.locale, 'title', v.title, 'body', v.body) order by v.locale) from post_versions v where v.post_id = p.id), '[]'::json) as versions,
  array(select g.group_id from post_groups g where g.post_id = p.id order by g.group_id) as groups,
  array(select pp.member from post_people pp where pp.post_id = p.id order by pp.member) as people,
  (select f.id from files f where f.post_id = p.id and f.role = 'cover') as cover,
  (select count(*)::int from reactions r where r.post_id = p.id) as reactions,
  (select count(*)::int from comments c where c.post_id = p.id and c.deleted_at is null) as comments,
  exists (select 1 from confirmations k where k.post_id = p.id and k.member = ${actor} and k.version >= p.confirm_from) as confirmed,
  (select v.answer from rsvps v where v.post_id = p.id and v.member = ${actor}) as rsvp,
  (select count(*)::int from rsvps v where v.post_id = p.id and v.answer = 'yes') as going`;

function eventInfo(r: Row): EventInfo | null {
  return r.kind === "event" && r.event_day
    ? { day: r.event_day, lastDay: r.event_last_day, start: r.event_start?.toISOString() ?? null, end: r.event_end?.toISOString() ?? null, place: r.place, seats: r.seats }
    : null;
}

function summary(r: Row, now: Date, locale: string): PostSummary {
  const shown = pick(r, locale);
  const scheduled = r.publish_at.getTime() > now.getTime();
  return {
    id: String(r.id),
    kind: r.kind,
    title: shown.title,
    excerpt: excerpt(shown.body, 220),
    locale: shown.locale,
    author: r.author,
    important: r.important,
    pinned: r.pinned,
    publishAt: r.publish_at.toISOString(),
    scheduled,
    sending: scheduled && r.undo_until !== null && r.undo_until.getTime() >= r.publish_at.getTime(),
    editedAt: r.edited_at?.toISOString() ?? null,
    event: eventInfo(r),
    welcome: r.welcome,
    groups: r.groups,
    people: r.people,
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

// A post is for this person: for everyone, for one of their groups, or for
// them by name. Same rule as lib/model.ts (inAudience).
export const forPerson = (sql: Query, person: Grouped) => sql`(
  (not exists (select 1 from post_groups g where g.post_id = p.id) and not exists (select 1 from post_people pp where pp.post_id = p.id))
  or exists (select 1 from post_people pp where pp.post_id = p.id and pp.member = ${person.id})
  ${person.groups.length > 0 ? sql`or exists (select 1 from post_groups g where g.post_id = p.id and g.group_id in ${sql([...person.groups])})` : sql``})`;

// Who sees a post kept to an audience: its audience, its author, the
// Chest's admins (lib/access.ts, seesPost).
export const audienceSeen = (sql: Query, actor: Member) => (actor.isAdmin ? sql`true` : sql`(p.author = ${actor.id} or ${forPerson(sql, actor)})`);

// What the actor sees: readers, what is published; publishers, what is
// scheduled too; both, only posts for them (audienceSeen). Deleted posts,
// nobody (but "Undo").
export const seen = (sql: Query, actor: Member) => (can(actor, "publish")
  ? sql`p.deleted_at is null and ${audienceSeen(sql, actor)}`
  : sql`p.deleted_at is null and p.publish_at <= now() and ${audienceSeen(sql, actor)}`);

// An Important post this person has confirmed (the version asked for).
const confirmedBy = (sql: Query, person: string) => sql`exists (select 1 from confirmations k where k.post_id = p.id and k.member = ${person} and k.version >= p.confirm_from)`;

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
    select ${columns(sql, who.id, now)} from posts p
    where p.deleted_at is null and p.publish_at <= ${now} and ${audienceSeen(sql, who)} ${kind ? sql`and p.kind = ${kind}` : sql``}
    order by (case when ${pinnedNow(sql, now)} then p.pinned_at end) desc nulls last, p.publish_at desc, p.id desc
    limit ${limits.page + 1} offset ${(pageNumber - 1) * limits.page}`;
  const upcoming = await sql<Row[]>`
    select ${columns(sql, who.id, now)} from posts p
    where p.deleted_at is null and p.publish_at <= ${now} and ${audienceSeen(sql, who)} and p.kind = 'event' and coalesce(p.event_last_day, p.event_day) >= ${today(options.zone, now)}
    order by p.event_day, p.event_start nulls first, p.id
    limit 5`;
  // Scheduled: not those a few seconds from going out (they are "sending").
  const scheduled = can(who, "publish")
    ? await sql<Row[]>`select ${columns(sql, who.id, now)} from posts p where p.deleted_at is null and p.publish_at > ${now} and p.undo_until is null and ${audienceSeen(sql, who)} order by p.publish_at, p.id limit 50`
    : [];
  const toConfirm = await sql<Row[]>`
    select ${columns(sql, who.id, now)} from posts p
    where p.important and p.deleted_at is null and p.publish_at <= ${now} and p.publish_at > ${now}::timestamptz - make_interval(days => ${limits.confirmDays})
      and p.author <> ${who.id} and ${forPerson(sql, who)} and not ${confirmedBy(sql, who.id)}
    order by p.publish_at desc limit 20`;
  const shown = (r: Row) => summary(r, now, who.locale);
  return {
    posts: rows.slice(0, limits.page).map(shown),
    more: rows.length > limits.page,
    upcoming: upcoming.map(shown),
    scheduled: scheduled.map(shown),
    toConfirm: toConfirm.map(r => ({ id: String(r.id), title: shown(r).title })),
  };
}

// A post seen by the actor, or not_found.
async function visible(sql: Query, actor: Member, postId: unknown, now = new Date()): Promise<Row> {
  const key = id(postId);
  const [row] = await sql<Row[]>`select ${columns(sql, actor.id, now)} from posts p where p.id = ${key} and ${seen(sql, actor)}`;
  if (!row) throw new AppError("not_found");
  return row;
}

// An event is open to answers until the end of its last day.
function eventOpen(row: Pick<Row, "kind" | "event_day" | "event_last_day">, zone: string, now: Date): boolean {
  return row.kind === "event" && row.event_day !== null && (row.event_last_day ?? row.event_day) >= today(zone, now);
}

type FileRow = { id: string; role: string; file_name: string; type: string; size: string };
const fileInfo = (f: FileRow): FileInfo => ({ id: String(f.id), fileName: f.file_name, type: f.type, size: Number(f.size) });

export async function post(sql: Sql, actor: Member | null, postId: unknown, options: { zone: string; now?: Date }): Promise<PostDetail> {
  const who = reader(actor);
  const now = options.now ?? new Date();
  const row = await visible(sql, who, postId, now);
  const key = String(row.id);
  const fileRows = await sql<FileRow[]>`select id, role, file_name, type, size from files where post_id = ${key} order by position nulls last, added_at, id`;
  const reactionRows = await sql<{ emoji: Emoji; member: string }[]>`select emoji, member from reactions where post_id = ${key} order by at, id`;
  // A reply whose comment was removed goes with it (and comes back with it).
  const thread = await sql<{ id: string; parent_id: string | null; author: string; body: string; created_at: Date; edited_at: Date | null }[]>`
    select c.id, c.parent_id, c.author, c.body, c.created_at, c.edited_at from comments c
    where c.post_id = ${key} and c.deleted_at is null
      and (c.parent_id is null or exists (select 1 from comments o where o.id = c.parent_id and o.deleted_at is null))
    order by c.created_at, c.id limit ${limits.commentsPerPost}`;
  const answers = await sql<{ member: string; answer: "yes" | "no" | "wait" }[]>`select member, answer from rsvps where post_id = ${key} order by at, member`;
  const [mine] = await sql<{ at: Date; version: number }[]>`select at, version from confirmations where post_id = ${key} and member = ${who.id}`;
  const cover = fileRows.find(f => f.role === "cover");
  const shown = pick(row, who.locale);
  return {
    ...summary(row, now, who.locale),
    body: shown.body,
    own: { locale: row.locale, title: row.title, body: row.body },
    versions: row.versions,
    createdAt: row.created_at.toISOString(),
    coverFile: cover ? fileInfo(cover) : null,
    attachments: fileRows.filter(f => f.role === "attachment").map(fileInfo),
    gallery: fileRows.filter(f => f.role === "image").map(fileInfo),
    reactionList: emojiNames.map(emoji => {
      const people = reactionRows.filter(r => r.emoji === emoji).map(r => r.member);
      return { emoji, count: people.length, mine: people.includes(who.id), people };
    }),
    thread: thread.map(c => ({ id: String(c.id), parentId: c.parent_id === null ? null : String(c.parent_id), author: c.author, body: c.body, at: c.created_at.toISOString(), edited: c.edited_at !== null })),
    answers,
    eventOpen: eventOpen(row, options.zone, now),
    confirmedAt: mine && mine.version >= row.confirm_from ? mine.at.toISOString() : null,
    confirmedEarlier: mine !== undefined && mine.version < row.confirm_from,
    forMe: inAudience(who, row),
    pinnedUntil: row.pinned_at && row.pinned_until ? row.pinned_until.toISOString() : null,
    undoUntil: row.undo_until?.toISOString() ?? null,
    emailed: row.emailed,
    emailShort: row.email_short,
    textVersion: row.text_version,
  };
}

// What the composer sends. Days and times are read on the Chest's clock.
export type PostInput = {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  // The language the headline and text are written in (the author's when
  // absent), and versions in other languages ({locale, title, body}).
  locale?: unknown;
  versions?: unknown;
  important?: unknown;
  pinned?: unknown;
  // A day after which it is no longer pinned (null: until unpinned).
  pinnedUntil?: unknown;
  // null or absent: now. Otherwise the day and time it appears.
  publishAt?: { day?: unknown; time?: unknown } | null;
  event?: { day?: unknown; lastDay?: unknown; start?: unknown; end?: unknown; place?: unknown; seats?: unknown } | null;
  welcome?: unknown;
  // The groups (grp_…, of the Chest) and the people (mbr_…, who have News)
  // it is kept to; none or absent: everyone.
  groups?: unknown;
  people?: unknown;
  cover?: unknown;
  attachments?: unknown;
  // The gallery: pictures and videos, in order.
  gallery?: unknown;
  // An Important post whose text changed: ask everyone to confirm again.
  reconfirm?: unknown;
};

type Clean = {
  kind: Kind; title: string; body: string; locale: string; versions: Version[]; important: boolean; pinned: boolean; pinnedUntil: Date | null; publishAt: Date | null;
  event: { day: string; lastDay: string | null; start: Date | null; end: Date | null; place: string | null; seats: number | null } | null;
  welcome: string | null; cover: string | null; attachments: string[]; gallery: string[]; inline: string[]; groups: string[]; people: string[]; reconfirm: boolean;
};

const blank = (value: unknown) => value === undefined || value === null || value === "";

function readVersions(value: unknown, main: string): Version[] {
  if (blank(value)) return [];
  if (!Array.isArray(value) || value.length > 8) throw new AppError("invalid");
  const out: Version[] = [];
  for (const v of value as { locale?: unknown; title?: unknown; body?: unknown }[]) {
    if (!v || typeof v !== "object" || !isLocale(v.locale) || v.locale === main || out.some(o => o.locale === v.locale)) throw new AppError("invalid");
    const title = clean(v.title ?? "", limits.title, { optional: true });
    const body = clean(v.body ?? "", limits.body, { multiline: true, optional: true });
    // A version left empty is no version.
    if (!title && !body) continue;
    if (!title) throw new AppError("empty");
    out.push({ locale: v.locale, title, body });
  }
  return out;
}

// kept is the audience the post already has: a group the Chest no longer
// has, or a person who no longer has News, stays; a new one must exist now.
async function read(input: PostInput, author: Member, zone: string, now: Date, kept: { groups: readonly string[]; people: readonly string[] } = { groups: [], people: [] }): Promise<Clean> {
  if (!input || typeof input !== "object") throw new AppError("invalid");
  if (!isKind(input.kind)) throw new AppError("invalid");
  const kind = input.kind;
  const title = clean(input.title, limits.title);
  const body = clean(input.body ?? "", limits.body, { multiline: true, optional: true });
  const locale = blank(input.locale) ? author.locale : input.locale;
  if (!isLocale(locale)) throw new AppError("invalid");
  const versions = readVersions(input.versions, locale);
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
    const lastDay = blank(e.lastDay) ? null : readDay(e.lastDay);
    if (lastDay !== null && (lastDay <= eventDay || new Date(lastDay).getTime() - new Date(eventDay).getTime() > limits.eventDays * 864e5)) throw new AppError("bad_date");
    const start = blank(e.start) ? null : zoned(eventDay, readTime(e.start), zone);
    const end = blank(e.end) ? null : zoned(lastDay ?? eventDay, readTime(e.end), zone);
    if (end && (!start || end.getTime() <= start.getTime())) throw new AppError("bad_date");
    const place = clean(e.place ?? "", limits.place, { optional: true }) || null;
    let seats: number | null = null;
    if (!blank(e.seats)) {
      seats = typeof e.seats === "string" ? Number(e.seats) : (e.seats as number);
      if (!Number.isInteger(seats) || seats < 1 || seats > limits.seats) throw new AppError("bad_seats");
    }
    event = { day: eventDay, lastDay, start, end, place, seats };
  }
  let pinnedUntil: Date | null = null;
  if (input.pinned === true && !blank(input.pinnedUntil)) {
    const until = readDay(input.pinnedUntil);
    if (until < today(zone, now)) throw new AppError("bad_date");
    pinnedUntil = zoned(nextDay(until), "00:00", zone);
  }
  // The colleague a welcome greets or a shout-out thanks (never oneself).
  let welcome: string | null = null;
  if (kind === "welcome" || kind === "shoutout") {
    welcome = memberId(input.welcome);
    if (kind === "shoutout" && welcome === author.id) throw new AppError("yourself");
    const has = await hasTool(welcome);
    if (has === "unavailable") throw new AppError("unavailable");
    if (!has) throw new AppError("no_person");
  }
  const cover = blank(input.cover) ? null : id(input.cover);
  const attachments = input.attachments === undefined ? [] : ids(input.attachments, limits.attachmentsPerPost).filter(a => a !== cover);
  const gallery = input.gallery === undefined || input.gallery === null ? [] : ids(input.gallery, limits.imagesPerPost).filter(a => a !== cover && !attachments.includes(a));
  const inline = imageRefs(body, ...versions.map(v => v.body)).filter(i => i !== cover && !attachments.includes(i) && !gallery.includes(i));
  if (inline.length > limits.inlinePerPost) throw new AppError("too_many", { max: limits.inlinePerPost });
  const groups = blank(input.groups) ? [] : groupIds(input.groups);
  const addedGroups = groups.filter(g => !kept.groups.includes(g));
  if (addedGroups.length > 0) {
    const known = await chestGroups({ fresh: true });
    if (known === "unavailable") throw new AppError("unavailable");
    if (addedGroups.some(g => !known.some(k => k.id === g))) throw new AppError("no_group");
  }
  const people = blank(input.people) ? [] : peopleIds(input.people);
  const addedPeople = people.filter(p => !kept.people.includes(p));
  if (addedPeople.length > 0) {
    const have = await haveTool(addedPeople);
    if (have === "unavailable") throw new AppError("unavailable");
    if (addedPeople.some(p => !have.has(p))) throw new AppError("no_person");
  }
  return {
    kind, title, body, locale, versions, important: input.important === true, pinned: input.pinned === true, pinnedUntil, publishAt, event, welcome,
    cover, attachments, gallery, inline, groups, people, reconfirm: input.reconfirm === true,
  };
}

// files puts the post's cover, attachments, gallery and pictures in the
// text as the composer lists them: a file is the actor's own new upload or
// already the post's; the post's files left out are removed (their objects
// are returned, to remove from the Chest after the transaction).
async function setFiles(tx: Query, actor: Member, postId: string, c: Pick<Clean, "cover" | "attachments" | "gallery" | "inline">): Promise<string[]> {
  const wanted = [...(c.cover ? [c.cover] : []), ...c.attachments, ...c.gallery, ...c.inline];
  const rows = wanted.length === 0 ? [] : await tx<{ id: string; post_id: string | null; added_by: string; type: string }[]>`select id, post_id, added_by, type from files where id in ${tx(wanted)}`;
  for (const w of wanted) {
    const f = rows.find(r => String(r.id) === w);
    const usable = f && (f.post_id === null ? f.added_by === actor.id : String(f.post_id) === postId);
    if (!usable) throw new AppError("file_missing");
    if ((w === c.cover || c.inline.includes(w)) && !isCoverType(f.type)) throw new AppError("not_image");
    if (c.gallery.includes(w) && !isCoverType(f.type) && !isVideoType(f.type)) throw new AppError("not_image");
  }
  const gone = await tx<{ object: string }[]>`
    delete from files where post_id = ${postId} ${wanted.length ? tx`and id not in ${tx(wanted)}` : tx``} returning object`;
  await tx`update files set role = 'attachment' where post_id = ${postId}`;
  const place = async (list: string[], role: string) => {
    for (const f of list) await tx`update files set post_id = ${postId}, role = ${role} where id = ${f}`;
  };
  await place(c.attachments, "attachment");
  // The gallery keeps the order given.
  for (const [i, f] of c.gallery.entries()) await tx`update files set post_id = ${postId}, role = 'image', position = ${i} where id = ${f}`;
  await place(c.inline, "inline");
  if (c.cover) await tx`update files set post_id = ${postId}, role = 'cover' where id = ${c.cover}`;
  return gone.map(g => g.object);
}

async function setAudience(tx: Query, postId: string, c: Pick<Clean, "groups" | "people">): Promise<void> {
  await tx`delete from post_groups where post_id = ${postId}`;
  await tx`delete from post_people where post_id = ${postId}`;
  for (const g of c.groups) await tx`insert into post_groups (post_id, group_id) values (${postId}, ${g})`;
  if (c.people.length > 0) await tx`insert into post_people ${tx(c.people.map(member => ({ post_id: postId, member })))}`;
}

async function setVersions(tx: Query, postId: string, versions: Version[]): Promise<void> {
  await tx`delete from post_versions where post_id = ${postId}`;
  for (const v of versions) await tx`insert into post_versions (post_id, locale, title, body) values (${postId}, ${v.locale}, ${v.title}, ${v.body})`;
}

export type Saved = { id: string; published: boolean; important: boolean; kind: Kind; welcome: string | null; groups: string[]; people: string[]; removed: string[]; undoUntil: string | null };

// The seconds "Undo" is offered before a new Important post goes out.
export const undoSeconds = 10;

// createPost: hold (the members' part asks for it) publishes a new
// Important post undoSeconds from now, so "Undo" can take it back before
// anything is sent.
export async function createPost(sql: Sql, actor: Member | null, input: PostInput, options: { zone: string; now?: Date; hold?: boolean }): Promise<Saved> {
  const who = publisher(actor);
  const now = options.now ?? new Date();
  const c = await read(input, who, options.zone, now);
  const undoUntil = options.hold && c.important && c.publishAt === null ? new Date(now.getTime() + undoSeconds * 1000) : null;
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into posts (kind, title, body, locale, author, important, pinned_at, pinned_until, publish_at, undo_until, event_day, event_last_day, event_start, event_end, place, seats, welcome)
      values (${c.kind}, ${c.title}, ${c.body}, ${c.locale}, ${who.id}, ${c.important}, ${c.pinned ? now : null}, ${c.pinnedUntil}, ${c.publishAt ?? undoUntil ?? now}, ${undoUntil},
              ${c.event?.day ?? null}, ${c.event?.lastDay ?? null}, ${c.event?.start ?? null}, ${c.event?.end ?? null}, ${c.event?.place ?? null}, ${c.event?.seats ?? null}, ${c.welcome})
      returning id`;
    const key = String(row!.id);
    await setVersions(tx, key, c.versions);
    await setAudience(tx, key, c);
    const removed = await setFiles(tx, who, key, c);
    return { id: key, published: c.publishAt === null, important: c.important, kind: c.kind, welcome: c.welcome, groups: c.groups, people: c.people, removed, undoUntil: undoUntil?.toISOString() ?? null };
  });
}

// recall takes back a post still in its "Undo" seconds: nothing was sent,
// nobody saw it. Its files go back to their uploader (the composer may use
// them again); the post is gone.
export async function recall(sql: Sql, actor: Member | null, postId: unknown, now = new Date()): Promise<void> {
  const who = publisher(actor);
  await sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      select p.id from posts p where p.id = ${id(postId)} and p.author = ${who.id} and p.deleted_at is null
        and p.undo_until is not null and p.publish_at > ${now} and p.announced_at is null
        and (p.announce_lease is null or p.announce_lease < ${now}::timestamptz - interval '2 minutes')
      for update`;
    if (!row) throw new AppError("too_late");
    await tx`update files set post_id = null, role = 'attachment', added_at = ${now} where post_id = ${row.id}`;
    await tx`delete from posts where id = ${row.id}`;
  });
}

// Editing a post: its words, its kind's details, its files, Important and
// pinned, its audience. Its time of publication changes only while it is
// scheduled. A post made Important (or a new welcome, or an Important post
// for another audience, or asked to be confirmed again) is told again by
// the next pass. Once published, each change of its words keeps the words
// it replaced (revisions).
export type Updated = Saved & { importantChanged: boolean; audienceChanged: boolean; textChanged: boolean; reconfirm: boolean; wasEvent: boolean };

const sameVersions = (a: Version[], b: Version[]) => JSON.stringify([...a].sort((x, y) => x.locale.localeCompare(y.locale))) === JSON.stringify([...b].sort((x, y) => x.locale.localeCompare(y.locale)));

export async function updatePost(sql: Sql, actor: Member | null, postId: unknown, input: PostInput, options: { zone: string; now?: Date }): Promise<Updated> {
  const who = publisher(actor);
  const now = options.now ?? new Date();
  const current = await visible(sql, who, postId, now);
  const key = String(current.id);
  const c = await read(input, who, options.zone, now, current);
  const scheduled = current.publish_at.getTime() > now.getTime();
  if (scheduled && current.undo_until !== null) throw new AppError("too_soon");
  const audienceChanged = c.groups.join(",") !== [...current.groups].sort().join(",") || c.people.join(",") !== [...current.people].sort().join(",");
  const textChanged = c.title !== current.title || c.body !== current.body || c.locale !== current.locale || !sameVersions(c.versions, current.versions);
  const reconfirm = c.important && current.important && textChanged && c.reconfirm && !scheduled;
  const publishAt = scheduled ? (c.publishAt ?? now) : current.publish_at;
  const pinnedAt = c.pinned ? (current.pinned_at ?? now) : null;
  const tellAgain = (c.important && !current.important) || reconfirm || (c.welcome !== null && c.welcome !== current.welcome) || ((c.important || c.welcome !== null) && audienceChanged);
  const version = textChanged && !scheduled ? current.text_version + 1 : current.text_version;
  return sql.begin(async tx => {
    if (textChanged && !scheduled) {
      await tx`insert into revisions (post_id, version, locale, title, body, versions, edited_by) values (${key}, ${current.text_version}, ${current.locale}, ${current.title}, ${current.body}, ${tx.json(current.versions)}, ${who.id})`;
    }
    await tx`
      update posts set kind = ${c.kind}, title = ${c.title}, body = ${c.body}, locale = ${c.locale}, important = ${c.important}, pinned_at = ${pinnedAt}, pinned_until = ${c.pinned ? c.pinnedUntil : null}, publish_at = ${publishAt},
        event_day = ${c.event?.day ?? null}, event_last_day = ${c.event?.lastDay ?? null}, event_start = ${c.event?.start ?? null}, event_end = ${c.event?.end ?? null}, place = ${c.event?.place ?? null}, seats = ${c.event?.seats ?? null},
        welcome = ${c.welcome}, edited_at = ${scheduled ? null : now}, text_version = ${version}
        ${reconfirm ? tx`, confirm_from = ${version}` : tx``}
        ${tellAgain ? tx`, announced_at = null, announce_after = null, email_short = false` : tx``}
      where id = ${key}`;
    if (c.kind !== "event") await tx`delete from rsvps where post_id = ${key}`;
    if (!c.important) await tx`delete from confirmations where post_id = ${key}`;
    await setVersions(tx, key, c.versions);
    if (audienceChanged) await setAudience(tx, key, c);
    const removed = await setFiles(tx, who, key, c);
    return {
      id: key, published: publishAt.getTime() <= now.getTime(), important: c.important, kind: c.kind, welcome: c.welcome, groups: c.groups, people: c.people, removed, undoUntil: null,
      importantChanged: c.important !== current.important, audienceChanged, textChanged, reconfirm, wasEvent: current.kind === "event",
    };
  });
}

// Earlier versions of a post's words, newest first: its publishers only.
export type Revision = { version: number; locale: string; title: string; body: string; versions: Version[]; editedBy: string; replacedAt: string };
export async function revisions(sql: Sql, actor: Member | null, postId: unknown): Promise<Revision[]> {
  const who = publisher(actor);
  const row = await visible(sql, who, postId);
  const list = await sql<{ version: number; locale: string; title: string; body: string; versions: Version[]; edited_by: string; replaced_at: Date }[]>`
    select version, locale, title, body, versions, edited_by, replaced_at from revisions where post_id = ${row.id} order by version desc, id desc limit 50`;
  return list.map(r => ({ version: r.version, locale: r.locale, title: r.title, body: r.body, versions: r.versions, editedBy: r.edited_by, replacedAt: r.replaced_at.toISOString() }));
}

// Deleting is undone within 30 days; then the post is purged.
export async function deletePost(sql: Sql, actor: Member | null, postId: unknown): Promise<{ important: boolean; kind: Kind }> {
  const who = publisher(actor);
  const row = await visible(sql, who, postId);
  await sql`update posts set deleted_at = now() where id = ${row.id}`;
  return { important: row.important, kind: row.kind };
}

// Only who could see a post brings it back.
export async function restorePost(sql: Sql, actor: Member | null, postId: unknown): Promise<{ important: boolean; kind: Kind }> {
  const who = publisher(actor);
  const [row] = await sql<{ important: boolean; kind: Kind }[]>`update posts p set deleted_at = null where p.id = ${id(postId)} and p.deleted_at is not null and ${audienceSeen(sql, who)} returning p.important, p.kind`;
  if (!row) throw new AppError("not_found");
  return row;
}

export async function setPinned(sql: Sql, actor: Member | null, postId: unknown, pinned: boolean): Promise<void> {
  const who = publisher(actor);
  const row = await visible(sql, who, postId);
  if (typeof pinned !== "boolean") throw new AppError("invalid");
  await sql`update posts set pinned_at = ${pinned ? sql`case when pinned_until is null or pinned_until > now() then coalesce(pinned_at, now()) else now() end` : null},
    pinned_until = ${pinned ? sql`case when pinned_until > now() then pinned_until end` : null} where id = ${row.id}`;
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

// Mentions in a comment: @[mbr_…] (the composer writes them). At most 20.
const mentionPattern = /@\[(mbr_[a-z2-7]{26})\]/gu;
export function mentionsIn(text: string): string[] {
  return [...new Set([...text.matchAll(mentionPattern)].map(m => m[1]!))].slice(0, 20);
}

// Comments: one level of replies; the post's author hears of new ones, the
// author of a comment of its replies, and anyone mentioned of the mention.
export type Commented = {
  comment: Comment;
  post: { id: string; title: string; author: string; groups: string[]; people: string[] };
  parentAuthor: string | null;
  mentioned: string[];
};

export async function addComment(sql: Sql, actor: Member | null, postId: unknown, body: unknown, parentId?: unknown): Promise<Commented> {
  if (!can(actor, "react")) throw new AppError("forbidden");
  const who = actor!;
  const row = await visible(sql, who, postId);
  if (row.publish_at.getTime() > Date.now()) throw new AppError("closed");
  const text = clean(body, limits.comment, { multiline: true });
  if (row.comments >= limits.commentsPerPost) throw new AppError("too_many", { max: limits.commentsPerPost });
  let parent: { id: string; author: string } | null = null;
  if (!blank(parentId)) {
    // A reply answers a comment of the same post, never a reply.
    const [found] = await sql<{ id: string; author: string }[]>`select id, author from comments where id = ${id(parentId)} and post_id = ${row.id} and parent_id is null and deleted_at is null`;
    if (!found) throw new AppError("not_found");
    parent = { id: String(found.id), author: found.author };
  }
  const [created] = await sql<{ id: string; created_at: Date }[]>`insert into comments (post_id, author, body, parent_id) values (${row.id}, ${who.id}, ${text}, ${parent?.id ?? null}) returning id, created_at`;
  return {
    comment: { id: String(created!.id), parentId: parent?.id ?? null, author: who.id, body: text, at: created!.created_at.toISOString(), edited: false },
    post: { id: String(row.id), title: row.title, author: row.author, groups: row.groups, people: row.people },
    parentAuthor: parent?.author ?? null,
    mentioned: mentionsIn(text).filter(m => m !== who.id),
  };
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

// Editing a comment: people newly mentioned are answered (to tell them).
export async function editComment(sql: Sql, actor: Member | null, commentId: unknown, body: unknown): Promise<{ postId: string; mentioned: string[] }> {
  const c = await comment(sql, actor, commentId, false);
  const [row] = await sql<{ author: string; body: string; post_id: string }[]>`select author, body, post_id from comments where id = ${c.id}`;
  if (row!.author !== actor!.id) throw new AppError("forbidden");
  const text = clean(body, limits.comment, { multiline: true });
  await sql`update comments set body = ${text}, edited_at = now() where id = ${c.id}`;
  const before = new Set(mentionsIn(row!.body));
  return { postId: String(row!.post_id), mentioned: mentionsIn(text).filter(m => !before.has(m) && m !== actor!.id) };
}

// "I have read it": on an Important post, by an explicit click; it counts
// for the version of the text the post asks to confirm.
export async function confirm(sql: Sql, actor: Member | null, postId: unknown): Promise<{ id: string }> {
  const who = reader(actor);
  const row = await visible(sql, who, postId);
  // Only its audience is asked (an admin or the author outside it is not).
  if (!row.important || row.publish_at.getTime() > Date.now() || !inAudience(who, row)) throw new AppError("invalid");
  await sql`insert into confirmations (post_id, member, version) values (${row.id}, ${who.id}, ${row.text_version})
    on conflict (post_id, member) do update set version = excluded.version, at = now() where confirmations.version < ${row.confirm_from}`;
  return { id: String(row.id) };
}

// Coming or not to an event, until the end of its last day; null takes the
// answer back. With seats: past them, "yes" waits ('wait'), first come
// first served; a seat freed goes to the first waiting (promoted: to tell).
export async function answer(sql: Sql, actor: Member | null, postId: unknown, value: unknown, options: { zone: string; now?: Date }): Promise<{ answer: "yes" | "no" | "wait" | null; promoted: string | null }> {
  if (!can(actor, "react")) throw new AppError("forbidden");
  const who = actor!;
  const row = await visible(sql, who, postId);
  if (row.kind !== "event") throw new AppError("invalid");
  if (value !== "yes" && value !== "no" && value !== null) throw new AppError("invalid");
  if (!eventOpen(row, options.zone, options.now ?? new Date())) throw new AppError("closed");
  return sql.begin(async tx => {
    // One answer at a time per event: the seats are counted right.
    const [locked] = await tx<{ seats: number | null }[]>`select seats from posts where id = ${row.id} for update`;
    const seats = locked!.seats;
    const [before] = await tx<{ answer: string }[]>`select answer from rsvps where post_id = ${row.id} and member = ${who.id}`;
    let stored: "yes" | "no" | "wait" | null = value;
    if (value === "yes" && seats !== null && before?.answer !== "yes") {
      const [count] = await tx<{ taken: number }[]>`select count(*)::int as taken from rsvps where post_id = ${row.id} and answer = 'yes' and member <> ${who.id}`;
      if (count!.taken >= seats) stored = "wait";
    }
    if (stored === null) await tx`delete from rsvps where post_id = ${row.id} and member = ${who.id}`;
    else if (before?.answer !== stored) await tx`insert into rsvps (post_id, member, answer) values (${row.id}, ${who.id}, ${stored}) on conflict (post_id, member) do update set answer = excluded.answer, at = now()`;
    let promoted: string | null = null;
    if (before?.answer === "yes" && stored !== "yes" && seats !== null) {
      const [next] = await tx<{ member: string }[]>`
        update rsvps set answer = 'yes' where post_id = ${row.id} and member = (select member from rsvps where post_id = ${row.id} and answer = 'wait' order by at, member limit 1)
          and (select count(*) from rsvps where post_id = ${row.id} and answer = 'yes') < ${seats}
        returning member`;
      promoted = next?.member ?? null;
    }
    return { answer: stored, promoted };
  });
}

// Who confirmed an Important post, and when: its publishers only.
// Only its audience counts, and only confirmations of the version asked
// for; one of an earlier version is kept, not counted (earlier).
export type Confirmations = {
  post: { id: string; title: string; author: string; publishAt: string; remindedAt: string | null; groups: string[]; people: string[]; textVersion: number; confirmFrom: number };
  confirmed: { member: string; at: string; version: number }[];
  earlier: { member: string; at: string; version: number }[];
};
export async function confirmations(sql: Sql, actor: Member | null, postId: unknown): Promise<Confirmations> {
  if (!actor || !can(actor, "confirmations")) throw new AppError("forbidden");
  const row = await visible(sql, actor, postId);
  if (!row.important) throw new AppError("not_found");
  const [extra] = await sql<{ reminded_at: Date | null }[]>`select reminded_at from posts where id = ${row.id}`;
  const list = await sql<{ member: string; at: Date; version: number }[]>`select member, at, version from confirmations where post_id = ${row.id} order by at, member`;
  const shape = (c: (typeof list)[number]) => ({ member: c.member, at: c.at.toISOString(), version: c.version });
  return {
    post: { id: String(row.id), title: pick(row, actor.locale).title, author: row.author, publishAt: row.publish_at.toISOString(), remindedAt: extra?.reminded_at?.toISOString() ?? null, groups: row.groups, people: row.people, textVersion: row.text_version, confirmFrom: row.confirm_from },
    confirmed: list.filter(c => c.version >= row.confirm_from).map(shape),
    earlier: list.filter(c => c.version < row.confirm_from).map(shape),
  };
}

// A reminder to those who have not confirmed: once a day at most.
export type Reminded = { id: string; title: string; body: string; locale: string; versions: Version[]; author: string; groups: string[]; people: string[] };
export async function claimReminder(sql: Sql, actor: Member | null, postId: unknown): Promise<Reminded> {
  if (!actor || !can(actor, "confirmations")) throw new AppError("forbidden");
  const row = await visible(sql, actor, postId);
  if (!row.important || row.publish_at.getTime() > Date.now()) throw new AppError("not_found");
  const [claimed] = await sql<{ id: string }[]>`update posts set reminded_at = now() where id = ${row.id} and (reminded_at is null or reminded_at < now() - interval '20 hours') returning id`;
  if (!claimed) throw new AppError("too_soon");
  return { id: String(row.id), title: row.title, body: row.body, locale: row.locale, versions: row.versions, author: row.author, groups: row.groups, people: row.people };
}

// The number on each member's tile: Important posts of the last 90 days
// for them (their audience) they have not confirmed (not their own).
export async function unconfirmedCounts(sql: Sql, people: readonly Grouped[], now = new Date()): Promise<Map<string, number>> {
  const memberIds = [...new Set(people.map(p => p.id))];
  const groupsOf = new Map(people.map(p => [p.id, p]));
  const counts = new Map<string, number>(memberIds.map(m => [m, 0]));
  if (memberIds.length === 0) return counts;
  const open = await sql<{ id: string; author: string; confirm_from: number; groups: string[]; people: string[] }[]>`
    select p.id, p.author, p.confirm_from, array(select g.group_id from post_groups g where g.post_id = p.id) as groups,
      array(select pp.member from post_people pp where pp.post_id = p.id) as people
    from posts p where p.important and p.deleted_at is null and p.publish_at <= ${now} and p.publish_at > ${now}::timestamptz - make_interval(days => ${limits.confirmDays})`;
  if (open.length === 0) return counts;
  const done = new Set<string>();
  for (let i = 0; i < memberIds.length; i += 1000) {
    const chunk = memberIds.slice(i, i + 1000);
    const rows = await sql<{ post_id: string; member: string }[]>`
      select k.post_id, k.member from confirmations k join posts p on p.id = k.post_id
      where k.post_id in ${sql(open.map(p => p.id))} and k.member in ${sql(chunk)} and k.version >= p.confirm_from`;
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
export type UploadRole = "cover" | "attachment" | "image" | "inline";
export async function recordUpload(sql: Sql, actor: Member | null, file: { object: string; fileName: string; type: string; size: number; role: UploadRole }): Promise<FileInfo> {
  // Everyone may add a picture to a proposal (lib/proposals.ts); the rest
  // is the publishers'.
  const who = file.role === "cover" ? reader(actor) : publisher(actor);
  if ((file.role === "cover" || file.role === "inline") && !isCoverType(file.type)) throw new AppError("not_image");
  if (file.role === "image" && !isCoverType(file.type) && !isVideoType(file.type)) throw new AppError("not_image");
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
  const [f] = await sql<{ object: string; post_id: string | null; added_by: string; file_name: string; type: string; proposal_author: string | null }[]>`
    select f.object, f.post_id, f.added_by, f.file_name, f.type, q.author as proposal_author from files f left join proposals q on q.id = f.proposal_id where f.id = ${id(fileId)}`;
  if (!f) throw new AppError("not_found");
  if (f.post_id !== null) await visible(sql, who, String(f.post_id));
  // A proposal's picture: its author and the publishers (lib/proposals.ts).
  else if (f.proposal_author !== null) {
    if (f.proposal_author !== who.id && !can(who, "publish")) throw new AppError("not_found");
  } else if (f.added_by !== who.id) throw new AppError("not_found");
  return { object: f.object, fileName: f.file_name, type: f.type };
}

// The event as a calendar needs it: in the actor's language.
export type EventFor = { id: string; title: string; body: string; own: Version; versions: Version[]; createdAt: Date; event: { day: string; lastDay: string | null; start: Date | null; end: Date | null; place: string | null } };
export async function eventFor(sql: Sql, actor: Member | null, postId: unknown): Promise<EventFor> {
  const who = reader(actor);
  const row = await visible(sql, who, postId);
  if (row.kind !== "event" || !row.event_day) throw new AppError("not_found");
  const shown = pick(row, who.locale);
  return { id: String(row.id), title: shown.title, body: shown.body, own: { locale: row.locale, title: row.title, body: row.body }, versions: row.versions, createdAt: row.created_at, event: { day: row.event_day, lastDay: row.event_last_day, start: row.event_start, end: row.event_end, place: row.place } };
}

// An event as the Chest's calendar keeps it (lib/calendar.ts): who is
// coming, whatever the actor; null when it is no longer an event to show.
export async function eventOf(sql: Sql, postId: string): Promise<(Omit<EventFor, "title" | "body"> & { going: string[] }) | null> {
  const [row] = await sql<{ kind: Kind; title: string; body: string; locale: string; versions: Version[]; created_at: Date; event_day: string | null; event_last_day: string | null; event_start: Date | null; event_end: Date | null; place: string | null }[]>`
    select p.kind, p.title, p.body, p.locale, p.created_at, to_char(p.event_day, 'YYYY-MM-DD') as event_day, to_char(p.event_last_day, 'YYYY-MM-DD') as event_last_day, p.event_start, p.event_end, p.place,
      coalesce((select json_agg(json_build_object('locale', v.locale, 'title', v.title, 'body', v.body) order by v.locale) from post_versions v where v.post_id = p.id), '[]'::json) as versions
    from posts p where p.id = ${postId} and p.deleted_at is null and p.publish_at <= now()`;
  if (!row || row.kind !== "event" || !row.event_day) return null;
  const going = (await sql<{ member: string }[]>`select member from rsvps where post_id = ${postId} and answer = 'yes' order by at, member`).map(r => r.member);
  return { id: postId, own: { locale: row.locale, title: row.title, body: row.body }, versions: row.versions, createdAt: row.created_at, event: { day: row.event_day, lastDay: row.event_last_day, start: row.event_start, end: row.event_end, place: row.place }, going };
}

// The composer's view of a post being edited: days and times on the
// Chest's clock.
export type Draft = {
  author: string;
  kind: Kind; title: string; body: string; locale: string; versions: Version[]; important: boolean; pinned: boolean; pinnedUntil: string | null; scheduled: boolean;
  publishAt: { day: string; time: string } | null;
  event: { day: string; lastDay: string; start: string; end: string; place: string; seats: string } | null;
  welcome: string | null; cover: FileInfo | null; attachments: FileInfo[]; gallery: FileInfo[]; groups: string[]; people: string[];
};

export async function draftOf(sql: Sql, actor: Member | null, postId: unknown, options: { zone: string; now?: Date }): Promise<Draft> {
  const who = publisher(actor);
  const d = await post(sql, who, postId, options);
  const now = options.now ?? new Date();
  const scheduled = new Date(d.publishAt).getTime() > now.getTime();
  // The last day it is pinned, as the composer shows it.
  const until = d.pinnedUntil ? local(new Date(new Date(d.pinnedUntil).getTime() - 60_000), options.zone).day : null;
  return {
    author: d.author, kind: d.kind, title: d.own.title, body: d.own.body, locale: d.own.locale, versions: d.versions, important: d.important, pinned: d.pinned, pinnedUntil: until, scheduled,
    publishAt: scheduled ? local(d.publishAt, options.zone) : null,
    event: d.event ? { day: d.event.day, lastDay: d.event.lastDay ?? "", start: d.event.start ? local(d.event.start, options.zone).time : "", end: d.event.end ? local(d.event.end, options.zone).time : "", place: d.event.place ?? "", seats: d.event.seats === null ? "" : String(d.event.seats) } : null,
    welcome: d.welcome, cover: d.coverFile, attachments: d.attachments, gallery: d.gallery, groups: d.groups, people: d.people,
  };
}

// purge removes for good what was deleted 30 days ago, and uploads never
// used after a day; it answers the Chest objects to remove.
export async function purge(sql: Sql): Promise<string[]> {
  await freezeViews(sql);
  return sql.begin(async tx => {
    // Proposals declined 30 days ago (lib/proposals.ts): their pictures
    // become unused uploads, removed just below.
    await tx`delete from proposals where declined_at < now() - interval '30 days'`;
    const objects = await tx<{ object: string }[]>`
      select f.object from files f join posts p on p.id = f.post_id where p.deleted_at < now() - interval '30 days'
      union all select object from files where post_id is null and proposal_id is null and added_at < now() - interval '1 day'`;
    await tx`delete from posts where deleted_at < now() - interval '30 days'`;
    await tx`delete from files where post_id is null and proposal_id is null and added_at < now() - interval '1 day'`;
    await tx`delete from comments where deleted_at < now() - interval '30 days'`;
    return objects.map(o => o.object);
  });
}

export const isPublisher = (actor: Member | null): boolean => can(actor, "publish");
export const hasRole = (actor: Member | null): boolean => roleOf(actor) !== null;
