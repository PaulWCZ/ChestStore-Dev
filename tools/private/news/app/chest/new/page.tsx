import { can } from "../../../lib/access.ts";
import { everyone } from "../../../lib/audience.ts";
import { isKind } from "../../../lib/model.ts";
import { viewer } from "../../../lib/session.ts";
import { local } from "../../../lib/time.ts";
import { Composer } from "../composer.tsx";
import { notFound } from "next/navigation";

// A new post (publishers). ?kind= starts it as that kind.
export default async function NewPost({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t, zone } = v;
  if (!can(member, "publish")) notFound();
  const query = await searchParams;
  const kind = isKind(query["kind"]) ? query["kind"] : "announcement";
  const tomorrow = local(new Date(Date.now() + 864e5), zone);
  const people = (await everyone()).people.map(p => ({ id: p.id, name: p.name }));
  return (
    <main className="desk">
      <Composer
        postId={null}
        initial={{ kind, title: "", body: "", important: false, pinned: false, scheduled: false, publishAt: null, event: kind === "event" ? { day: tomorrow.day, start: "", end: "", place: "" } : null, welcome: null, cover: null, attachments: [] }}
        people={people}
        defaults={{ day: tomorrow.day, time: "09:00" }}
        t={{ composer: t.composer, kinds: t.kinds, errors: t.errors }}
      />
    </main>
  );
}
