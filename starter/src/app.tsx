import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { createApp, csvLine, download, page, textStream } from "@argentic/chest-app";
import { db, seen } from "@argentic/chest-app/db";
import { names } from "@argentic/chest-app/members";
import { actions } from "./actions.ts";
import { locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { forget, getNote, listNotes } from "./lib/notes.ts";
import { Home } from "./pages/Home.tsx";
import { NotePage } from "./pages/Note.tsx";

// The tool's routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name> and /actions/<name>, the
// member of every /chest request (401 without), /lang/<code>, the error
// pages, and 404 for anything else.
export const app = createApp({ actions, islands, locales, words, layouts: { members: MembersLayout, public: PublicLayout } });

// ---- The members' part (/chest…): page() gives the member, their words
// (t) and their way of writing dates and numbers (f).
// EXAMPLE (Notes)
app.get("/chest", page(async ({ member, t, f }) => {
  const notes = await listNotes();
  const people = await names(notes.map(n => n.author), t.people);
  return { title: t.home.title, body: <Home notes={notes} names={people} member={member} t={t} f={f} /> };
}));

// A page of one note: param() reads the address; fail("not_found")
// inside getNote() makes it a 404 page.
// EXAMPLE (Notes)
app.get("/chest/notes/:id", page(async ({ param, t, f }) => {
  const note = await getNote(param("id"));
  const people = await names([note.author], t.people);
  return { title: t.home.title, body: <NotePage note={note} name={people.get(note.author) ?? t.people.unknown} t={t} f={f} /> };
}));

// A download, written as the rows are read (any size, little memory):
// download() sends it as a file; a refusal there (fail("forbidden")) is a
// page in the reader's words. A link to it carries `download`.
// EXAMPLE (Notes)
app.get("/chest/notes.csv", download(() => ({ name: `notes-${chest.today()}.csv`, type: "text/csv; charset=utf-8", body: textStream(noteLines()) })));
async function* noteLines() {
  yield csvLine(["id", "created_at", "author", "pinned", "body"]);
  for await (const rows of db()`select id, created_at, author, pinned, body from notes where deleted_at is null order by id`.cursor(500)) {
    yield rows.map(r => csvLine([r.id, (r.created_at as Date).toISOString(), r.author, r.pinned ? "yes" : "no", r.body])).join("");
  }
}

// ---- No public part: with "public": true in chest.json, publicPage()
// and publicAction() serve visitors (the package's AGENTS.md, "The public
// part").

// ---- What the Chest sends by itself, signed (never read the body before
// handle()): the members' lifecycle ("receives" in chest.json) and the
// runs of chest.json's "schedules" (none yet: add a handler by name). A
// handler that throws makes the Chest send it again: keep them idempotent.
app.post("/chest-events", async c => new Response(null, {
  status: await events.handle(c.req.raw, {
    // A member asked to be forgotten: anonymise what names them, then say so.
    "member.erased": async e => {
      await forget(e.data.id);
      await events.acknowledgeErasure(e.data.erasure);
      await seen.forget();
    },
  }, { seen }),
}));

app.post("/chest-schedules", async c => new Response(null, {
  status: await schedules.handle(c.req.raw, {}, { seen }),
}));
