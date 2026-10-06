import { AppError, createApp, dateFormat, log, page, publicPage, type ErrorCode } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { stream } from "hono/streaming";
import { actions } from "./actions.ts";
import { answerLink, chestEvents, chestSchedules } from "./calls.ts";
import { catalogue, format, intl, localeOf, locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { can, roleOf } from "./lib/access.ts";
import { everyone, tally } from "./lib/audience.ts";
import { toCsv } from "./lib/csv.ts";
import { db } from "./lib/db.ts";
import { withGroups } from "./lib/groups.ts";
import { calendar } from "./lib/ics.ts";
import { nameOf, people } from "./lib/people.ts";
import { confirmations, eventFor, fileFor } from "./lib/posts.ts";
import { exportAll, importLimits, importSlack, readSlack } from "./lib/transfer.ts";
import { chestZone } from "./lib/zone.ts";
import { editPostPage, newPostPage } from "./pages/Compose.tsx";
import { frontPage } from "./pages/Front.tsx";
import { postPage } from "./pages/Post.tsx";
import { proposalsPage } from "./pages/Proposals.tsx";
import { proposePage } from "./pages/Propose.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { searchPage } from "./pages/Search.tsx";
import { transferPage } from "./pages/Transfer.tsx";
import { plain } from "./shared/markdown.ts";
import { lookFor } from "./theme.ts";

// News's routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the look (/chest/look.css), the member of every /chest request — with every group
// they are in, asked of the Chest once per request (src/lib/groups.ts: the
// assertion names only the groups that give News, and a post may be kept
// to any) —, /lang/<code>, the error pages, and answers 404 to anything
// else.
export const app = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  complete: withGroups,
  // The look: the company's choice, else Newsprint (src/theme.ts), served
  // by the package at /chest/look.css and /look.css.
  look: lookFor,
  head: () => <><meta name="robots" content="noindex, nofollow" /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- The members' part (/chest…).

// A page of News: a member whose role gives nothing sees why (the layout's
// NoAccess), and the page itself does not run.
const members = (render: Parameters<typeof page>[0]) => page(p => (roleOf(p.member) ? render(p) : { title: p.t.noAccess.title, body: null }));

// The front page (?kind= a section, ?page= older posts).
app.get("/chest", members(frontPage));
// A post, as an article; its publishers see who confirmed and how far it
// reached (counts only).
app.get("/chest/posts/:id", members(postPage));
// The composer (publishers).
app.get("/chest/new", members(newPostPage));
app.get("/chest/posts/:id/edit", members(editPostPage));
// Share something (everyone with a role); what waits for approval (publishers).
app.get("/chest/propose", members(proposePage));
app.get("/chest/proposals", members(proposalsPage));
// Search: the posts and comments the member may see.
app.get("/chest/search", members(searchPage));
// Moving posts in (a Slack channel) and out (every post, as a ZIP).
app.get("/chest/transfer", members(transferPage));

// A post's file, for whoever sees the post (or its uploader, before the
// post is saved): a fresh 15-minute link signed by the Chest, never kept
// in a page. ?size=256|1024 asks the Chest for a thumbnail of a picture;
// ?download to save it.
app.get("/chest/files/:id", async c => {
  try {
    const f = await fileFor(db(), c.get("viewer").member, c.req.param("id"));
    const size = c.req.query("size");
    const thumbnail = size === "256" ? 256 : size === "1024" ? 1024 : undefined;
    const download = c.req.query("download") !== undefined;
    let link: { url: string };
    try {
      link = await files.url(f.object, { ...(thumbnail && f.type.startsWith("image/") ? { thumbnail } : {}), download });
    } catch (error) {
      // A picture the Chest cannot reduce is sent as it is.
      if (!(error instanceof ChestError) || error.code !== "no_thumbnail") throw error;
      link = await files.url(f.object, { download });
    }
    return new Response(null, { status: 303, headers: { Location: link.url, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    if (error instanceof ChestError) return c.body(null, error.code === "not_found" ? 404 : 503);
    throw error;
  }
});

// "I'm coming" / "Not coming" from an email, in one tap (src/calls.ts).
app.get("/chest/posts/:id/answer", c => answerLink(c.req.raw, c.get("viewer").member, c.req.param("id")));

// "Add to my calendar": the event as an .ics file, for whoever sees it, in
// their language when the post has it.
app.get("/chest/posts/:id/calendar", async c => {
  try {
    const e = await eventFor(db(), c.get("viewer").member, c.req.param("id"));
    const text = calendar({
      uid: `news-post-${e.id}-${e.createdAt.getTime().toString(36)}@chest.tool`,
      title: e.title,
      description: plain(e.body).slice(0, 4000),
      place: e.event.place,
      day: e.event.day,
      lastDay: e.event.lastDay,
      start: e.event.start,
      end: e.event.end,
      stamp: new Date(),
    });
    return download(text, "text/calendar; charset=utf-8", `event-${e.id}.ics`);
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    throw error;
  }
});

// Who confirmed an Important post, as a spreadsheet: its publishers only,
// in their language. Those who have not confirmed yet are listed too; a
// confirmation of an earlier version of the text says which.
app.get("/chest/posts/:id/confirmations", async c => {
  try {
    const actor = c.get("viewer").member;
    const list = await confirmations(db(), actor, c.req.param("id"));
    const locale = localeOf(actor.language);
    const t = catalogue(locale);
    const { confirmed, pending } = tally(list.post, list.confirmed, (await everyone()).people);
    const who = await people(confirmed.map(x => x.member));
    const when = dateFormat(intl(locale), chestZone(), { dateStyle: "short", timeStyle: "short" });
    const earlier = new Map(list.earlier.map(e => [e.member, e]));
    const rows: unknown[][] = [
      [t.csv.person, t.csv.status, t.csv.at, t.csv.version],
      ...confirmed.map(x => [nameOf(who.get(x.member), locale), t.csv.confirmed, when.format(new Date(x.at)), x.version]),
      ...pending.map(p => {
        const before = earlier.get(p.id);
        return before ? [p.name, t.csv.earlier, when.format(new Date(before.at)), before.version] : [p.name, t.csv.pending, "", ""];
      }),
    ];
    return download(toCsv(rows), "text/csv; charset=utf-8", `${t.csv.file}-${list.post.id}.csv`);
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    throw error;
  }
});

// "Download all posts": the posts the publisher sees, as one ZIP written
// while it is sent (one file of the Chest at a time in memory: the export
// may hold 200 MB of files, a tool has 256 MiB). Who asks is checked
// before the first byte; a failure halfway cuts the download (the browser
// says it failed) and is logged.
app.get("/chest/transfer/export", async c => {
  let write: Awaited<ReturnType<typeof exportAll>>;
  try {
    write = await exportAll(db(), c.get("viewer").member, chestZone());
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    throw error;
  }
  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="news-${chest.today()}.zip"`);
  c.header("Cache-Control", "private, no-store");
  return stream(c, async out => {
    try {
      await write(chunk => out.write(chunk).then(() => undefined));
    } catch (error) {
      log.error("export failed", error);
      await out.abort();
    }
  });
});

// A Slack export, sent by the browser as it is (application/zip), read in
// memory (the Chest gives no disk). Without ?channel=: the channels it
// holds; with: that channel imported (publishers). Sent by the page
// itself only (Sec-Fetch-Site, or an Origin of this host), as the actions.
app.post("/chest/transfer/import", async c => {
  const t = words(c.get("viewer").locale);
  const refuse = (error: ErrorCode, status: 400 | 403 | 413, values?: Record<string, number | string>) => c.json({ error, message: format(t.errors[error], values) }, status, { "Cache-Control": "no-store" });
  if (!sameOrigin(c.req.raw)) return c.text("Cross-site request refused.", 403);
  try {
    const actor = c.get("viewer").member;
    if (!can(actor, "publish")) throw new AppError("forbidden");
    const bytes = await readAtMost(c.req.raw, importLimits.size);
    if (!bytes) return refuse("file_too_large", 413);
    const channel = c.req.query("channel");
    if (!channel) return c.json({ channels: readSlack(bytes).channels }, 200, { "Cache-Control": "no-store" });
    const done = await importSlack(db(), actor, bytes, channel);
    log.info("slack import", { added: done.added, skipped: done.skipped });
    return c.json(done, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof AppError) return refuse(error.code, error.code === "forbidden" ? 403 : 400, error.values);
    throw error;
  }
});

// ---- The host's root: News has no public part (a Chest answers 404 on its
// public host); outside a Chest, it says where News lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed (src/calls.ts): the members'
// lifecycle and the groups' changes, and the runs of chest.json's
// "schedules".
app.post("/chest-events", c => chestEvents(c.req.raw));
app.post("/chest-schedules", c => chestSchedules(c.req.raw));

// ---- Helpers of the routes above.

// A request's body, counted while it is read: null past `max` bytes (a
// Content-Length that says more is refused before reading; a chunked body
// stops at the limit, never read whole first).
async function readAtMost(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "-1");
  if (declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  // Known length: one buffer, filled in place; else the pieces, joined once.
  const into = declared >= 0 ? new Uint8Array(declared) : null;
  const pieces: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > (into ? into.byteLength : max)) {
      await reader.cancel();
      return null;
    }
    if (into) into.set(value, size);
    else pieces.push(value);
    size += value.byteLength;
  }
  if (into) return size === into.byteLength ? into : into.subarray(0, size);
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of pieces) { all.set(p, at); at += p.byteLength; }
  return all;
}

// A file to download, kept by no cache.
function download(body: string, type: string, name: string): Response {
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
}

// A request the page itself sent: the browser says so (Sec-Fetch-Site),
// or, for an older one, its Origin is this host (the rule of the actions,
// @argentic/chest-app; to move into the package).
function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  try {
    return origin !== null && new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
