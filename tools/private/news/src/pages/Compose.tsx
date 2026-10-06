import { Island } from "../core/island.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { AppError, notFound } from "../core/tool.ts";
import { can } from "../lib/access.ts";
import { everyone } from "../lib/audience.ts";
import { db } from "../lib/db.ts";
import { chestGroups } from "../lib/groups.ts";
import { composerLanguages } from "../lib/languages.ts";
import { nameOf, people as lookup } from "../lib/people.ts";
import { draftOf, type Draft } from "../lib/posts.ts";
import { mailNow } from "../lib/state.ts";
import { local, today } from "../lib/time.ts";
import { chestZone } from "../lib/zone.ts";
import { isKind } from "../shared/model.ts";

// The composer (publishers): a new post (?kind= starts it as that kind),
// or a post to edit. The island (src/islands/Composer.tsx) holds the whole
// form; the page gives it who has News, the Chest's groups, the languages,
// what News knows of the Chest's email, and the days it starts from.
export async function newPostPage({ member, locale, t, query }: PageContext): Promise<View> {
  if (!can(member, "publish")) return notFound();
  const zone = chestZone();
  const asked = query("kind");
  const kind = isKind(asked) ? asked : "announcement";
  const tomorrow = local(new Date(Date.now() + 864e5), zone);
  const people = (await everyone()).people.map(p => ({ id: p.id, name: p.name, groups: p.groups }));
  const groups = await chestGroups();
  const initial: Draft = { author: member.id, kind, title: "", body: "", locale, versions: [], important: false, pinned: false, pinnedUntil: null, scheduled: false, publishAt: null, event: kind === "event" ? { day: tomorrow.day, lastDay: "", start: "", end: "", place: "", seats: "" } : null, welcome: null, cover: null, attachments: [], gallery: [], groups: [], people: [] };
  return {
    title: t.composer.newTitle,
    body: (
      <div className="desk">
        <Island name="Composer" props={{
          postId: null,
          initial,
          author: member.id,
          people,
          groups: groups === "unavailable" ? [] : groups.map(g => ({ id: g.id, name: g.name })),
          languages: composerLanguages(locale),
          mail: await mailNow(db()),
          defaults: { day: tomorrow.day, time: "09:00", today: today(zone) },
          locale,
          t: { composer: t.composer, kinds: t.kinds, errors: t.errors, date: t.date, peoplePicker: t.peoplePicker },
        }} />
      </div>
    ),
  };
}

export async function editPostPage({ member, locale, t, param }: PageContext): Promise<View> {
  if (!can(member, "publish")) return notFound();
  const zone = chestZone();
  const id = param("id");
  const sql = db();
  let draft: Draft;
  try {
    draft = await draftOf(sql, member, id, { zone });
  } catch (error) {
    if (error instanceof AppError) return notFound();
    throw error;
  }
  const tomorrow = local(new Date(Date.now() + 864e5), zone);
  const people = (await everyone()).people.map(p => ({ id: p.id, name: p.name, groups: p.groups }));
  // A colleague who no longer has News stays named on their welcome post,
  // and in the audience of the post.
  const missing = [...new Set([draft.welcome, ...draft.people])].filter((m): m is string => !!m && m !== "erased" && !people.some(p => p.id === m));
  if (missing.length > 0) {
    const found = await lookup(missing);
    for (const m of missing) people.unshift({ id: m, name: nameOf(found.get(m), locale), groups: [] });
  }
  // A group the post is kept to that the Chest no longer has stays, named as such.
  const listed = await chestGroups();
  const groups = listed === "unavailable" ? [] : listed.map(g => ({ id: g.id, name: g.name }));
  for (const g of draft.groups) if (!groups.some(x => x.id === g)) groups.push({ id: g, name: t.front.formerGroup });
  return {
    title: t.composer.editTitle,
    body: (
      <div className="desk">
        <Island name="Composer" props={{ postId: id, initial: draft, author: draft.author, people, groups, languages: composerLanguages(locale), mail: await mailNow(sql), defaults: { day: tomorrow.day, time: "09:00", today: today(zone) }, locale, t: { composer: t.composer, kinds: t.kinds, errors: t.errors, date: t.date, peoplePicker: t.peoplePicker } }} />
      </div>
    ),
  };
}
