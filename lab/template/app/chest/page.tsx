import * as chest from "@argentic/chest-sdk/chest";
import { Toasts } from "@argentic/chest-ui/components";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { can } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { formatDate, relative } from "../../lib/i18n/index.ts";
import { listNotes } from "../../lib/notes.ts";
import { nameOf, people } from "../../lib/people.ts";
import { viewer } from "../../lib/session.ts";
import { NotesView, type NoteView } from "./notes-view.tsx";

export default async function NotesPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const notes = await listNotes(db(), member);
  const who = await people(notes.map(n => n.author));
  const now = new Date();
  const shown: NoteView[] = notes.map(n => ({
    id: n.id,
    body: n.body,
    pinned: n.pinned,
    mine: n.author === member.id,
    author: n.author === member.id ? t.people.you : nameOf(who.get(n.author), locale),
    photo: who.get(n.author)?.photo ?? null,
    when: relative(n.createdAt, locale, now),
    date: formatDate(n.createdAt, locale, chest.timeZone(), { dateStyle: "full", timeStyle: "short" }),
  }));
  return (
    <Toasts labels={t.toast}>
      <AutoRefresh seconds={20} />
      <NotesView
        notes={shown}
        locale={locale}
        canWrite={can(member, "notes.write")}
        canPin={can(member, "notes.pin")}
        canRemoveAny={can(member, "notes.remove.any")}
        me={{ name: member.name, photo: member.photo }}
        t={{ notes: t.notes, errors: t.errors, you: t.people.you }}
      />
    </Toasts>
  );
}
