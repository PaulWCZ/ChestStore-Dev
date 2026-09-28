import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { birthday, clean, day, keepLeftDays, limits, memberId, phone, skills } from "./model.ts";
import { purgeArrivals } from "./arrivals.ts";
import { present } from "./people.ts";

// What the directory knows of a person beyond their name and photo (which
// the Chest gives). Every function takes the database and the member
// acting, checks the rights (lib/access.ts) and throws AppError with a code.

export type Profile = {
  memberId: string;
  title: string;
  team: string;
  office: string;
  managerId: string | null;
  phone: string;
  pronouns: string;
  bio: string;
  skills: string[];
  startDate: string | null;
  // "MM-DD", only when the person chose to show it.
  birthday: string | null;
};

export const blank = (id: string): Profile => ({ memberId: id, title: "", team: "", office: "", managerId: null, phone: "", pronouns: "", bio: "", skills: [], startDate: null, birthday: null });

type Row = { member_id: string; title: string; team: string; office: string; manager_id: string | null; phone: string; pronouns: string; bio: string; skills: string[]; start_date: string | null; birthday: string | null };
const columns = "member_id, title, team, office, manager_id, phone, pronouns, bio, skills, to_char(start_date, 'YYYY-MM-DD') as start_date, birthday";
const toProfile = (r: Row): Profile => ({ memberId: r.member_id, title: r.title, team: r.team, office: r.office, managerId: r.manager_id, phone: r.phone, pronouns: r.pronouns, bio: r.bio, skills: r.skills, startDate: r.start_date, birthday: r.birthday });

function reader(actor: Member | null): Member {
  if (!actor || !can(actor, "directory.read")) throw new AppError("forbidden");
  return actor;
}

// The profiles of these people (a blank one for whoever has none).
export async function profiles(sql: Query, actor: Member | null, ids: string[]): Promise<Map<string, Profile>> {
  reader(actor);
  const wanted = [...new Set(ids)].filter(i => /^mbr_[a-z2-7]{26}$/u.test(i));
  const found = new Map<string, Profile>();
  if (wanted.length === 0) return found;
  const rows = await sql.unsafe<Row[]>(`select ${columns} from profiles where member_id = any($1::text[])`, [wanted]);
  for (const r of rows) found.set(r.member_id, toProfile(r));
  for (const i of wanted) if (!found.has(i)) found.set(i, blank(i));
  return found;
}

export async function profile(sql: Query, actor: Member | null, id: unknown): Promise<Profile> {
  const who = memberId(id);
  return (await profiles(sql, actor, [who])).get(who)!;
}

// The people whose manager this is (the ids; the page keeps those who are
// in the directory).
export async function reportsOf(sql: Query, actor: Member | null, id: string): Promise<string[]> {
  reader(actor);
  return (await sql<{ member_id: string }[]>`select member_id from profiles where manager_id = ${id} and left_at is null order by member_id`).map(r => r.member_id);
}

// Keeping the table true to the Chest: the people it lists again are no
// longer "left"; profiles of people gone for more than 30 days are purged
// (nothing runs in the background: this runs when the directory is read,
// and each morning when schedules exist).
export async function reconcile(sql: Sql, presentIds: string[], now: string): Promise<void> {
  if (presentIds.length > 0) await sql`update profiles set left_at = null where left_at is not null and member_id = any(${presentIds}::text[])`;
  await purgeLeft(sql);
  await purgeArrivals(sql, now);
}

export async function purgeLeft(sql: Query): Promise<number> {
  const gone = await sql`delete from profiles where left_at < now() - make_interval(days => ${keepLeftDays}) returning member_id`;
  return gone.length;
}

// What a person writes about themselves. Only the keys given change; the
// work phone may also be set by HR (updateJob).
export type OwnInput = { phone?: unknown; pronouns?: unknown; bio?: unknown; skills?: unknown; birthday?: unknown };

export async function updateOwn(sql: Sql, actor: Member | null, input: unknown): Promise<Profile> {
  if (!actor || !can(actor, "profile.own")) throw new AppError("forbidden");
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const given = input as OwnInput;
  const current = (await profiles(sql, actor, [actor.id])).get(actor.id)!;
  const next: Profile = { ...current };
  if ("phone" in given) next.phone = phone(given.phone);
  if ("pronouns" in given) next.pronouns = clean(given.pronouns, limits.pronouns, { optional: true });
  if ("bio" in given) next.bio = clean(given.bio, limits.bio, { multiline: true, optional: true });
  if ("skills" in given) next.skills = skills(given.skills);
  if ("birthday" in given) next.birthday = birthday(given.birthday);
  return save(sql, next);
}

// The job fields, set by HR for anyone: title, team, office, manager, start
// date, work phone. The manager is someone in the directory, never the
// person themselves nor anyone below them (no loops in the org chart).
export type JobInput = { title?: unknown; team?: unknown; office?: unknown; managerId?: unknown; startDate?: unknown; phone?: unknown };

export async function updateJob(sql: Sql, actor: Member | null, id: unknown, input: unknown): Promise<Profile> {
  if (!actor || !can(actor, "profile.job")) throw new AppError("forbidden");
  const who = memberId(id);
  if (!input || typeof input !== "object") throw new AppError("invalid");
  const given = input as JobInput;
  const fields: Partial<Profile> = {};
  if ("title" in given) fields.title = clean(given.title, limits.title, { optional: true });
  if ("team" in given) fields.team = clean(given.team, limits.team, { optional: true });
  if ("office" in given) fields.office = clean(given.office, limits.office, { optional: true });
  if ("startDate" in given) fields.startDate = day(given.startDate, { optional: true });
  if ("phone" in given) fields.phone = phone(given.phone);
  let manager: string | null | undefined;
  if ("managerId" in given) manager = given.managerId === null || given.managerId === "" ? null : memberId(given.managerId);
  const asked = [who, ...(manager ? [manager] : [])];
  const here = await present(asked);
  if (!here.has(who)) throw new AppError("not_found");
  if (manager && !here.has(manager)) throw new AppError("not_member");
  if (manager === who) throw new AppError("cycle");
  return sql.begin(async tx => {
    // One change of managers at a time: two at once could close a loop
    // neither sees.
    await tx`select pg_advisory_xact_lock(hashtext('people.managers'))`;
    if (manager && await wouldLoop(tx, who, manager)) throw new AppError("cycle");
    const current = (await profiles(tx, actor, [who])).get(who)!;
    return save(tx, { ...current, ...fields, ...(manager !== undefined ? { managerId: manager } : {}) });
  });
}

// wouldLoop says whether making manager the manager of person closes a
// loop: whether person is manager, or above them.
export async function wouldLoop(sql: Query, person: string, manager: string): Promise<boolean> {
  if (person === manager) return true;
  const rows = await sql<{ found: boolean }[]>`
    with recursive up(id, depth) as (
      select ${manager}::text, 0
      union
      select p.manager_id, up.depth + 1 from profiles p join up on p.member_id = up.id
      where p.manager_id is not null and up.depth < 500
    )
    select exists (select 1 from up where id = ${person}) as found`;
  return rows[0]?.found === true;
}

// save writes a whole profile (the fields already checked).
export async function save(sql: Query, p: Profile): Promise<Profile> {
  const [row] = await sql.unsafe<Row[]>(
    `insert into profiles (member_id, title, team, office, manager_id, phone, pronouns, bio, skills, start_date, birthday, left_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::date, $11, null, now())
     on conflict (member_id) do update set title = excluded.title, team = excluded.team, office = excluded.office, manager_id = excluded.manager_id,
       phone = excluded.phone, pronouns = excluded.pronouns, bio = excluded.bio, skills = excluded.skills, start_date = excluded.start_date,
       birthday = excluded.birthday, left_at = null, updated_at = now()
     returning ${columns}`,
    [p.memberId, p.title, p.team, p.office, p.managerId, p.phone, p.pronouns, p.bio, p.skills, p.startDate, p.birthday],
  );
  return toProfile(row!);
}

// The teams and offices already written, for the pickers and the filters.
export async function choices(sql: Query, actor: Member | null): Promise<{ teams: string[]; offices: string[]; titles: string[] }> {
  reader(actor);
  const pick = async (column: "team" | "office" | "title") =>
    (await sql.unsafe<{ v: string }[]>(`select distinct ${column} as v from profiles where ${column} <> '' and left_at is null order by 1 limit 200`)).map(r => r.v);
  return { teams: await pick("team"), offices: await pick("office"), titles: await pick("title") };
}
