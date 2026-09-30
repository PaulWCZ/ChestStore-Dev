import { notFound } from "next/navigation";
import { can } from "../../../../../lib/access.ts";
import { everyone } from "../../../../../lib/audience.ts";
import { db } from "../../../../../lib/db.ts";
import { chestGroups } from "../../../../../lib/groups.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { nameOf, people as lookup } from "../../../../../lib/people.ts";
import { draftOf, type Draft } from "../../../../../lib/posts.ts";
import { viewer } from "../../../../../lib/session.ts";
import { mailNow } from "../../../../../lib/state.ts";
import { local, today } from "../../../../../lib/time.ts";
import { Composer } from "../../../composer.tsx";
import { composerLanguages } from "../../../new/languages.ts";

// Editing a post (publishers).
export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t, zone, locale } = v;
  if (!can(member, "publish")) notFound();
  const { id } = await params;
  const sql = db();
  let draft: Draft;
  try {
    draft = await draftOf(sql, member, id, { zone });
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const tomorrow = local(new Date(Date.now() + 864e5), zone);
  const people = (await everyone()).people.map(p => ({ id: p.id, name: p.name, groups: p.groups }));
  // A colleague who no longer has News stays named on their welcome post,
  // and in the audience of the post.
  const missing = [...new Set([draft.welcome, ...draft.people])].filter((m): m is string => !!m && m !== "erased" && !people.some(p => p.id === m));
  if (missing.length > 0) {
    const found = await lookup(missing);
    for (const m of missing) people.unshift({ id: m, name: nameOf(found.get(m), v.locale), groups: [] });
  }
  // A group the post is kept to that the Chest no longer has stays, named as such.
  const listed = await chestGroups();
  const groups = listed === "unavailable" ? [] : listed.map(g => ({ id: g.id, name: g.name }));
  for (const g of draft.groups) if (!groups.some(x => x.id === g)) groups.push({ id: g, name: v.t.front.formerGroup });
  return (
    <div className="desk">
      <Composer postId={id} initial={draft} author={draft.author} people={people} groups={groups} languages={composerLanguages(locale)} mail={await mailNow(sql)} defaults={{ day: tomorrow.day, time: "09:00", today: today(zone) }} locale={locale} t={{ composer: t.composer, kinds: t.kinds, errors: t.errors, toast: t.toast, date: t.date, peoplePicker: t.peoplePicker }} />
    </div>
  );
}
