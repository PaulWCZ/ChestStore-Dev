import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { everyone } from "../../../lib/audience.ts";
import { db } from "../../../lib/db.ts";
import { chestGroups } from "../../../lib/groups.ts";
import { isKind } from "../../../lib/model.ts";
import { viewer } from "../../../lib/session.ts";
import { learned } from "../../../lib/state.ts";
import { local, today } from "../../../lib/time.ts";
import { Composer } from "../composer.tsx";
import { composerLanguages } from "./languages.ts";

// A new post (publishers). ?kind= starts it as that kind.
export default async function NewPost({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t, zone, locale } = v;
  if (!can(member, "publish")) notFound();
  const query = await searchParams;
  const kind = isKind(query["kind"]) ? query["kind"] : "announcement";
  const tomorrow = local(new Date(Date.now() + 864e5), zone);
  const people = (await everyone()).people.map(p => ({ id: p.id, name: p.name, groups: p.groups }));
  const groups = await chestGroups();
  return (
    <div className="desk">
      <Composer
        postId={null}
        initial={{ author: member.id, kind, title: "", body: "", locale, versions: [], important: false, pinned: false, pinnedUntil: null, scheduled: false, publishAt: null, event: kind === "event" ? { day: tomorrow.day, lastDay: "", start: "", end: "", place: "", seats: "" } : null, welcome: null, cover: null, attachments: [], gallery: [], groups: [], people: [] }}
        author={member.id}
        people={people}
        groups={groups === "unavailable" ? [] : groups.map(g => ({ id: g.id, name: g.name }))}
        languages={composerLanguages(locale)}
        mail={await learned(db(), "mail")}
        defaults={{ day: tomorrow.day, time: "09:00", today: today(zone) }}
        locale={locale}
        t={{ composer: t.composer, kinds: t.kinds, errors: t.errors, toast: t.toast, date: t.date, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
