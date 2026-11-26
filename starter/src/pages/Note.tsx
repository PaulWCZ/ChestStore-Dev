import { fill, type Catalogue, type Format } from "../i18n/index.ts";
import type { Note } from "../lib/notes.ts";

// EXAMPLE (Notes). One note, /chest/notes/<id>.
export function NotePage({ note, name, t, f }: { note: Note; name: string; t: Catalogue; f: Format }) {
  return (
    <article className="note">
      <h1>{t.home.title}</h1>
      <p>{note.body}</p>
      <p className="meta">{fill(t.home.by, { name, date: f.dateTime(note.createdAt) })}</p>
      <p><a href="/chest">{t.pages.back}</a></p>
    </article>
  );
}
