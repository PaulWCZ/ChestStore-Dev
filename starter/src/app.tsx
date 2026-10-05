import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { stream } from "hono/streaming";
import { createApp, page, publicPage } from "./core/http.tsx";
import { log } from "./core/log.ts";
import { csvLine } from "./lib/csv.ts";
import { db, seen } from "./lib/db.ts";
import { forget, listNotes, purge } from "./lib/notes.ts";
import { names } from "./lib/people.ts";
import { Contact } from "./pages/Contact.tsx";
import { Home } from "./pages/Home.tsx";

// The tool's routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the member of every /chest request, /lang/<code>, the
// error pages, and answers 404 to anything else.
export const app = createApp();

// ---- The members' part (/chest…): page() gives the member, their words
// (t) and their way of writing dates and numbers (f).
app.get("/chest", page(async ({ member, t, f }) => {
  const notes = await listNotes(db());
  const people = await names(notes.flatMap(n => (n.author ? [n.author] : [])), t);
  return { title: t.home.title, body: <Home notes={notes} names={people} member={member} t={t} f={f} /> };
}));

// A download, written as the rows are read (any size, little memory).
app.get("/chest/notes.csv", c => {
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="notes-${chest.today()}.csv"`);
  return stream(c, async out => {
    await out.write(csvLine(["id", "created_at", "author", "pinned", "body"]));
    for await (const rows of db()`select id, created_at, author, pinned, body from notes where deleted_at is null order by id`.cursor(500)) {
      await out.write(rows.map(r => csvLine([r.id, (r.created_at as Date).toISOString(), r.author ?? "", r.pinned ? "yes" : "no", r.body])).join(""));
    }
  });
});

// ---- The public part (with "public": true in chest.json): publicPage()
// gives the visitor's words, no member.
app.get("/", publicPage(({ t, query }) => ({ title: t.contact.title, body: <Contact t={t} sent={query("sent") === "1"} /> })));

// ---- What the Chest sends by itself, signed (never under /chest, never
// read the body before handle()): the members' lifecycle ("receives") and
// the runs of chest.json's "schedules". A handler that throws makes the
// Chest send it again: keep them idempotent.
app.post("/chest-events", async c => new Response(null, {
  status: await events.handle(c.req.raw, {
    "member.erased": async e => {
      await forget(db(), e.data.id);
      await events.acknowledgeErasure(e.data.erasure);
    },
  }, { seen }),
}));

app.post("/chest-schedules", async c => new Response(null, {
  status: await schedules.handle(c.req.raw, {
    purge: async () => log.info("purged", { notes: await purge(db()) }),
  }, { seen }),
}));
