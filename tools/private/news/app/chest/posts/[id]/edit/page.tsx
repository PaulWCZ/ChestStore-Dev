import { notFound } from "next/navigation";
import { can } from "../../../../../lib/access.ts";
import { everyone } from "../../../../../lib/audience.ts";
import { db } from "../../../../../lib/db.ts";
import { groupsOfTool } from "../../../../../lib/groups.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { nameOf, people as lookup } from "../../../../../lib/people.ts";
import { draftOf, type Draft } from "../../../../../lib/posts.ts";
import { viewer } from "../../../../../lib/session.ts";
import { local } from "../../../../../lib/time.ts";
import { Composer } from "../../../composer.tsx";

// Editing a post (publishers).
export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t, zone } = v;
  if (!can(member, "publish")) notFound();
  const { id } = await params;
  let draft: Draft;
  try {
    draft = await draftOf(db(), member, id, { zone });
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const tomorrow = local(new Date(Date.now() + 864e5), zone);
  const people = (await everyone()).people.map(p => ({ id: p.id, name: p.name }));
  // A colleague who no longer has News stays named on their welcome post.
  if (draft.welcome && draft.welcome !== "erased" && !people.some(p => p.id === draft.welcome)) {
    people.unshift({ id: draft.welcome, name: nameOf((await lookup([draft.welcome])).get(draft.welcome), v.locale) });
  }
  // A group the post is kept to that no longer gives News stays, named as such.
  const listed = await groupsOfTool();
  const groups = listed === "unavailable" ? [] : listed;
  for (const g of draft.groups) if (!groups.some(x => x.id === g)) groups.push({ id: g, name: v.t.front.formerGroup });
  return (
    <main className="desk">
      <Composer postId={id} initial={draft} people={people} groups={groups} defaults={{ day: tomorrow.day, time: "09:00" }} t={{ composer: t.composer, kinds: t.kinds, errors: t.errors }} />
    </main>
  );
}
