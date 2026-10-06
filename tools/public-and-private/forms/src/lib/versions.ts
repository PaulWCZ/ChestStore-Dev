import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";

// What a page others change shows, in a few characters (the package's
// page versions): a refresh whose version did not change is answered 304,
// the page not even rendered — so a tab left open, read again when its
// reader comes back to it, costs a query. Keyed by the reader and their
// language by the package; what only this reader sees is in it.

// Home: the forms (their changes, their answers, their state as the clock
// moves), what the reader has not seen, their own answers and where each
// stands, what is shared with them, whether everyone makes forms.
export async function homeVersion(sql: Query, member: Member): Promise<string> {
  const [row] = await sql<{ v: string }[]>`
    select concat_ws('|',
      (select count(*) || ':' || coalesce(max(updated_at)::text, '') || ':' || coalesce(sum(answer_count), 0) || ':' || count(*) filter (where deleted_at is not null) || ':' || count(*) filter (where closes_at <= now()) from forms),
      (select coalesce(sum(unseen), 0) from watchers where member = ${member.id}),
      (select count(*) || ':' || coalesce(sum(hashtext(status || note)), 0) from answers where respondent = ${member.id} and deleted_at is null),
      (select count(*) from participants where member = ${member.id}),
      (select count(*) || ':' || coalesce(string_agg(level, ',' order by form_id), '') from access where member = ${member.id}),
      (select value::text from settings where key = 'everyone_creates')) as v`;
  return row?.v ?? "";
}

// A form's answers (the list, the summary): the form, its answers — each
// one's place, state and note —, the address's filters (`view`).
export async function answersVersion(sql: Query, member: Member, formId: string, view: string): Promise<string | null> {
  if (!/^[1-9][0-9]{0,17}$/u.test(formId)) return null;
  const [row] = await sql<{ v: string }[]>`
    select concat_ws('|', f.updated_at::text, f.answer_count, f.status,
      (select count(*) || ':' || coalesce(sum(hashtext(a.id || a.status || a.note || coalesce(a.deleted_at::text, ''))), 0) from answers a where a.form_id = f.id),
      (select coalesce(sum(unseen), 0) from watchers w where w.form_id = f.id and w.member = ${member.id}),
      ${view}::text) as v
    from forms f where f.id = ${formId}`;
  return row?.v ?? null;
}
