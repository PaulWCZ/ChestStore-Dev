import { localeOf, type Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { hasTool } from "./audience.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "@argentic/chest-app";
import { isCoverType } from "../shared/model.ts";
import { clean, id, memberId } from "./input.ts";

// Posts from everyone (Workvivo's feed, moderated). Any member with a role
// proposes a shout-out — thanks to a colleague — or a piece of news, with
// a picture if they like; it waits for a publisher, who publishes it as it
// is (signed by its author; they may edit it afterwards like any post) or
// declines it, a reason optional. The author is told either way; the
// colleague thanked is told when it is published (lib/tell.ts).
//
// Until then, a proposal is seen by its author and the publishers only:
// never on the front page, in search or in an export (it
// is not a post); its picture opens for them alone. A publisher cannot
// approve their own proposal (they publish directly), and nobody else can
// approve at all. Its author may take it back (Undo brings it back).

export const proposalKinds = ["shoutout", "info"] as const;
export type ProposalKind = (typeof proposalKinds)[number];
const isProposalKind = (value: unknown): value is ProposalKind => typeof value === "string" && (proposalKinds as readonly string[]).includes(value);

// A declined proposal is kept 30 days (lib/posts.ts, purge).
export const proposalLimits = { body: 5000, waitingPerAuthor: 5, reason: 300 } as const;

export type Proposal = {
  id: string;
  kind: ProposalKind;
  title: string;
  body: string;
  locale: string;
  author: string;
  colleague: string | null;
  cover: string | null;
  createdAt: string;
  // Declined by a publisher, or taken back by its author (declinedBy is
  // then the author).
  declinedAt: string | null;
  declinedBy: string | null;
  reason: string | null;
};

type Row = { id: string; kind: ProposalKind; title: string; body: string; locale: string; author: string; colleague: string | null; cover: string | null; created_at: Date; declined_at: Date | null; declined_by: string | null; reason: string | null };
const columns = (sql: Query) => sql`q.id, q.kind, q.title, q.body, q.locale, q.author, q.colleague, q.created_at, q.declined_at, q.declined_by, q.reason,
  (select f.id from files f where f.proposal_id = q.id order by f.id limit 1) as cover`;
const shape = (r: Row): Proposal => ({
  id: String(r.id), kind: r.kind, title: r.title, body: r.body, locale: r.locale, author: r.author, colleague: r.colleague, cover: r.cover === null ? null : String(r.cover),
  createdAt: r.created_at.toISOString(), declinedAt: r.declined_at?.toISOString() ?? null, declinedBy: r.declined_by, reason: r.reason,
});

function member(actor: Member | null): Member {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  return actor;
}
function publisher(actor: Member | null): Member {
  if (!actor || !can(actor, "publish")) throw new AppError("forbidden");
  return actor;
}

export type ProposalInput = { kind?: unknown; title?: unknown; body?: unknown; colleague?: unknown; cover?: unknown };

// propose: a new proposal, in its author's language. At most five wait
// for each author at once.
export async function propose(sql: Sql, actor: Member | null, input: ProposalInput): Promise<{ id: string }> {
  const who = member(actor);
  if (!input || typeof input !== "object" || !isProposalKind(input.kind)) throw new AppError("invalid");
  const kind = input.kind;
  const title = clean(input.title, 140);
  const body = clean(input.body ?? "", proposalLimits.body, { multiline: true, optional: true });
  const locale = localeOf(who.language);
  let colleague: string | null = null;
  if (kind === "shoutout") {
    colleague = memberId(input.colleague);
    if (colleague === who.id) throw new AppError("yourself");
    const has = await hasTool(colleague);
    if (has === "unavailable") throw new AppError("unavailable");
    if (!has) throw new AppError("no_person");
  }
  const cover = input.cover === undefined || input.cover === null || input.cover === "" ? null : id(input.cover);
  return sql.begin(async tx => {
    const [waiting] = await tx<{ n: number }[]>`select count(*)::int as n from proposals where author = ${who.id} and declined_at is null`;
    if (waiting!.n >= proposalLimits.waitingPerAuthor) throw new AppError("too_many", { max: proposalLimits.waitingPerAuthor });
    if (cover) {
      // Only the author's own new upload, a picture.
      const [f] = await tx<{ type: string }[]>`select type from files where id = ${cover} and added_by = ${who.id} and post_id is null and proposal_id is null for update`;
      if (!f) throw new AppError("file_missing");
      if (!isCoverType(f.type)) throw new AppError("not_image");
    }
    const [row] = await tx<{ id: string }[]>`
      insert into proposals (kind, title, body, locale, author, colleague) values (${kind}, ${title}, ${body}, ${locale}, ${who.id}, ${colleague}) returning id`;
    const key = String(row!.id);
    if (cover) await tx`update files set proposal_id = ${key}, role = 'cover' where id = ${cover}`;
    return { id: key };
  });
}

// The actor's own proposals: waiting, and those declined or taken back in
// the last 30 days.
export async function mine(sql: Sql, actor: Member | null): Promise<Proposal[]> {
  const who = member(actor);
  const rows = await sql<Row[]>`select ${columns(sql)} from proposals q where q.author = ${who.id} order by q.declined_at nulls first, q.created_at desc limit 50`;
  return rows.map(shape);
}

// What waits for a publisher, oldest first: every proposal not declined,
// their own included (shown, never approvable by them).
export async function waiting(sql: Sql, actor: Member | null): Promise<Proposal[]> {
  publisher(actor);
  const rows = await sql<Row[]>`select ${columns(sql)} from proposals q where q.declined_at is null order by q.created_at, q.id limit 200`;
  return rows.map(shape);
}

// How many wait (the publishers' bell and the front page).
export async function waitingCount(sql: Sql): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from proposals where declined_at is null`;
  return row!.n;
}

// One proposal as the actor may see it: its author, or a publisher.
async function seen(sql: Query, actor: Member, proposalId: unknown, lock = false): Promise<Row> {
  const [row] = await sql<Row[]>`select ${columns(sql)} from proposals q where q.id = ${id(proposalId)} ${lock ? sql`for update of q` : sql``}`;
  if (!row || (row.author !== actor.id && !can(actor, "publish"))) throw new AppError("not_found");
  return row;
}

export type Approved = { postId: string; proposalId: string; author: string; colleague: string | null; title: string; locale: string; kind: ProposalKind };

// approve publishes a waiting proposal as a post by its author (for
// everyone; a publisher may edit it afterwards like any post), its picture
// as the post's cover. Never by its own author.
export async function approve(sql: Sql, actor: Member | null, proposalId: unknown, now = new Date()): Promise<Approved> {
  const who = publisher(actor);
  return sql.begin(async tx => {
    const p = await seen(tx, who, proposalId, true);
    if (p.declined_at !== null) throw new AppError("not_found");
    if (p.author === who.id) throw new AppError("forbidden");
    const [post] = await tx<{ id: string }[]>`
      insert into posts (kind, title, body, locale, author, welcome, approved_by, publish_at)
      values (${p.kind}, ${p.title}, ${p.body}, ${p.locale}, ${p.author}, ${p.colleague}, ${who.id}, ${now})
      returning id`;
    const postId = String(post!.id);
    await tx`update files set post_id = ${postId}, role = 'cover', proposal_id = null where proposal_id = ${p.id}`;
    await tx`delete from proposals where id = ${p.id}`;
    return { postId, proposalId: String(p.id), author: p.author, colleague: p.colleague, title: p.title, locale: p.locale, kind: p.kind };
  });
}

export type Declined = { proposalId: string; author: string; title: string; reason: string | null; byAuthor: boolean };

// decline: a publisher says no (a reason optional), or the author takes it
// back. Undo (restore) brings it back to the waiting list.
export async function decline(sql: Sql, actor: Member | null, proposalId: unknown, reason?: unknown): Promise<Declined> {
  const who = member(actor);
  const p = await seen(sql, who, proposalId);
  const byAuthor = p.author === who.id;
  if (!byAuthor && !can(who, "publish")) throw new AppError("not_found");
  const why = byAuthor || reason === undefined || reason === null ? null : clean(reason, proposalLimits.reason, { optional: true }) || null;
  const [row] = await sql<{ id: string }[]>`update proposals set declined_at = now(), declined_by = ${who.id}, reason = ${why} where id = ${p.id} and declined_at is null returning id`;
  if (!row) throw new AppError("not_found");
  return { proposalId: String(p.id), author: p.author, title: p.title, reason: why, byAuthor };
}

// restore undoes a decline: by a publisher (one a publisher declined), or
// by the author (one they took back).
export async function restore(sql: Sql, actor: Member | null, proposalId: unknown): Promise<{ author: string; byAuthor: boolean }> {
  const who = member(actor);
  const p = await seen(sql, who, proposalId);
  const byAuthor = p.author === who.id && p.declined_by === who.id;
  if (!byAuthor && !(can(who, "publish") && p.declined_by !== p.author)) throw new AppError("not_found");
  const [row] = await sql<{ id: string }[]>`update proposals set declined_at = null, declined_by = null, reason = null where id = ${p.id} and declined_at is not null returning id`;
  if (!row) throw new AppError("not_found");
  return { author: p.author, byAuthor };
}
