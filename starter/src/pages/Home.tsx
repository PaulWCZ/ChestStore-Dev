import type { Member } from "@argentic/chest-sdk/member";
import { Island } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { fill, type Catalogue, type Format } from "../i18n/index.ts";
import { maxLength, mayChange, type Note } from "../lib/notes.ts";

// EXAMPLE (Notes). The members' page, /chest: post a note, read the
// team's. Rendered on the server; the forms work without JavaScript;
// Delete is an island (its Undo).
// draft: what a refused form sent without JavaScript held (nothing lost).
export function Home({ notes, names, member, t, f, draft }: { notes: Note[]; names: Map<string, string>; member: Member; t: Catalogue; f: Format; draft: string }) {
  return (
    <>
      <Island name="AutoRefresh" props={{ seconds: 60 }} />
      <PageHeader title={t.home.title} intro={f.plural(t.home.count, notes.length)} secondary={notes.length > 0 && <a className="ck-button ck-button-quiet" href="/chest/notes.csv" download>{t.home.export}</a>} />
      <form method="post" action="/chest/actions/addNote" className="composer">
        <label className="ck-label" htmlFor="body">{t.home.label}</label>
        <textarea id="body" name="body" className="ck-field" required maxLength={maxLength} rows={3} placeholder={t.home.placeholder} defaultValue={draft} />
        <button className="ck-button">{t.home.post}</button>
      </form>
      {notes.length === 0 ? <EmptyState title={t.home.empty.title} body={t.home.empty.body} /> : (
        <ul className="notes">
          {notes.map(note => (
            <li key={note.id} id={`note-${note.id}`} className={note.pinned ? "note pinned" : "note"}>
              <p id={`note-${note.id}-text`}><a className="note-link" href={`/chest/notes/${note.id}`}>{note.body}</a></p>
              <div className="meta">
                <span>{fill(t.home.by, { name: names.get(note.author) ?? t.people.unknown, date: f.dateTime(note.createdAt) })}</span>
                {note.pinned && <span className="ck-badge">{t.home.pinned}</span>}
                {mayChange(member, note) && (
                  <div className="actions">
                    <form method="post" action="/chest/actions/pinNote">
                      <input type="hidden" name="id" value={note.id} />
                      <input type="hidden" name="pinned" value={note.pinned ? "" : "1"} />
                      <button className="ck-button ck-button-quiet ck-button-small" aria-describedby={`note-${note.id}-text`}>{note.pinned ? t.home.unpin : t.home.pin}</button>
                    </form>
                    <Island name="DeleteNote" props={{ id: note.id, words: { remove: t.home.remove, removed: t.home.removed } }} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
