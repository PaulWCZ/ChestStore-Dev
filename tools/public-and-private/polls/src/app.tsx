import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import type { Context } from "hono";
import { createApp, page, publicActionsAt, publicPage } from "./core/http.tsx";
import { log } from "./core/log.ts";
import { AppError } from "./core/tool.ts";
import { can, settles, surveys } from "./lib/access.ts";
import { everyone, inAudience } from "./lib/audience.ts";
import { db } from "./lib/db.ts";
import { exportCsv } from "./lib/export.ts";
import { withAllGroups } from "./lib/groups.ts";
import { byLink } from "./lib/guests.ts";
import { calendar } from "./lib/ics.ts";
import { handlers, seen } from "./lib/lifecycle.ts";
import { nameOf, people } from "./lib/people.ts";
import { home, policy, view, type Poll } from "./lib/polls.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import { catchUp, pass, refreshOne } from "./lib/tell.ts";
import { zoned } from "./lib/time.ts";
import { chestZone } from "./lib/zone.ts";
import { editPoll, newPoll } from "./pages/Compose.tsx";
import { guestPage } from "./pages/Guest.tsx";
import { Home } from "./pages/Home.tsx";
import { pollPage } from "./pages/Poll.tsx";
import { PublicHome } from "./pages/PublicHome.tsx";
import { sheetOf } from "./theme.ts";

// Polls' routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the member of every /chest request — with every group
// they are in, asked of the Chest once per request (src/lib/groups.ts: the
// assertion names only the groups that give Polls) —, /lang/<code>, the
// error pages, and answers 404 to anything else.
// The look's stylesheet needs no groups: it skips the question.
export const app = createApp({ complete: (who, path) => (path === "/chest/look.css" ? Promise.resolve(who) : withAllGroups(who)) });

// ---- The members' part (/chest…).

// Home: to answer, asked by you, ask the team, answered and still open,
// closed recently; for admins, the settings.
app.get("/chest", page(async ({ member, t, f }) => {
  const sql = db();
  // The work a schedule would do, on a visit: Polls works without one.
  await catchUp(sql).catch(error => log.error("catch-up failed", error));
  const data = await home(sql, member);
  await refreshOne(sql, member);
  const cards = [...data.toAnswer, ...data.mine, ...data.answered, ...data.closed];
  const who = await people(cards.map(c => c.organiser));
  // How many each poll I asked asks: the Chest's members, read once.
  const sent = data.mine.filter(c => c.status !== "draft");
  const team = sent.length > 0 ? (await everyone(sent.flatMap(c => c.groups))).people : [];
  const rules = await policy(sql);
  return {
    title: t.home.title,
    body: <Home
      data={data}
      member={member}
      organisers={new Map(cards.map(c => [c.organiser, nameOf(who.get(c.organiser), f.locale)]))}
      totals={new Map(sent.map(c => [c.id, team.filter(p => inAudience(p, c)).length]))}
      rules={rules}
      creates={can(member, "create", rules)}
      surveys={surveys(member, rules)}
      settles={settles(member)}
      zone={chestZone()}
      t={t}
      f={f}
    />,
  };
}));

// The composer: a new poll (?kind=choice|date|survey, &preset=pulse), a
// draft to finish, an open poll's words and closing time.
app.get("/chest/new", page(({ member, locale, t, query }) => newPoll({ sql: db(), member, locale, t }, query("kind"), query("preset"))));
app.get("/chest/polls/:id/edit", page(({ member, locale, t, param }) => editPoll({ sql: db(), member, locale, t }, param("id"))));

// A poll: answer, results, participation, organise.
app.get("/chest/polls/:id", page(({ member, locale, t, f, request, param }) => pollPage({ sql: db(), member, locale, t, f, request }, param("id"))));

// The answers as a spreadsheet (those who manage the poll).
app.get("/chest/polls/:id/export", async c => {
  try {
    const { file, text } = await exportCsv(db(), c.get("viewer").member, c.req.param("id"));
    return download(text, "text/csv; charset=utf-8", file);
  } catch (error) {
    if (error instanceof AppError) return c.body(null, error.code === "forbidden" ? 403 : 404);
    throw error;
  }
});

// "Add to my calendar": a date poll's chosen date as an .ics file, for
// whoever sees the poll (the Chest calendar has it too).
app.get("/chest/polls/:id/calendar", async c => {
  try {
    const { poll } = await view(db(), c.get("viewer").member, c.req.param("id"));
    let team: string | null = null;
    try {
      team = chest.tool.teamUrl;
    } catch { /* not in a Chest: no link back */ }
    return finalFile(poll, team ? `${team.replace(/\/$/u, "")}/chest/polls/${poll.id}` : null) ?? c.body(null, 404);
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    throw error;
  }
});

// The look of the team's pages: the company's choice (src/theme.ts).
app.get("/chest/look.css", c => look(c, "team"));

// ---- The public part ("public": true in chest.json): the guest page of a
// date poll opened to guests, and the host's root.
app.get("/", publicPage(async ({ locale, t }) => ({ title: t.tool.name, body: <PublicHome look={(await sheetOf("public")).look} locale={locale} t={t} /> })));
app.get("/p/:link", publicPage(({ locale, t, cookies, param, query }) => guestPage({ sql: db(), locale, t, cookies }, param("link"), query("sent"))));
app.get("/p/:link/calendar", async c => {
  try {
    const link = c.req.param("link");
    const poll = await byLink(db(), link);
    const origin = publicOrigin(c.req.raw.headers);
    return finalFile(poll, origin ? `${origin}/p/${link}` : null) ?? c.body(null, 404);
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    throw error;
  }
});
// The guest page's answer (src/actions.ts, answerGuest) is also taken
// under the page's own path: the guest's secret is a cookie for that path
// alone, and reaches the action there.
app.post("/p/:link/actions/:name", ...publicActionsAt());
// The look of the public pages: the company's brand, else Polls' own.
app.get("/look.css", c => look(c, "public"));

// ---- What the Chest sends by itself, signed (never under /chest, never
// read the body before handle()): the members' lifecycle and the groups'
// changes ("receives"), and the runs of chest.json's "schedules". A
// handler that throws makes the Chest send it again: they are idempotent.
app.post("/chest-events", async c => {
  const sql = db();
  return new Response(null, { status: await events.handle(c.req.raw, handlers(sql), { seen: seen(sql) }) });
});

// Every 15 minutes, "pass": polls past their closing time close and their
// organisers hear of it, the next rounds of repeating surveys open, the
// day-before reminders go out, a telling stopped by the hourly quota goes
// on, what was deleted long ago is purged. Without schedules, the same
// pass runs when someone opens a page (catchUp).
app.post("/chest-schedules", async c => {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(c.req.raw, {
      pass: async () => {
        const done = await pass(sql);
        log.info("pass", { told: done.told.length, waiting: done.waiting.length, settled: done.settled.length });
      },
    }, { seen: seen(sql) }),
  });
});

// ---- Helpers of the routes above.

// A file to download, kept by no cache.
function download(text: string, type: string, name: string): Response {
  return new Response(text, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
}

// The chosen date of a closed date poll as an iCalendar file (RFC 5545),
// its times on the Chest's clock; null without one. A later choice
// replaces the event in a calendar that has it (its sequence grows).
function finalFile(poll: Poll, url: string | null): Response | null {
  const option = poll.kind === "date" && poll.status === "closed" ? poll.questions[0]?.options.find(o => o.id === poll.finalOption) : undefined;
  if (!option?.day || !poll.finalAt) return null;
  const zone = chestZone();
  const text = calendar({
    uid: `polls-${poll.id}-final@chest.tool`,
    sequence: Math.max(0, Math.floor((new Date(poll.finalAt).getTime() - Date.UTC(2026, 0, 1)) / 60_000)),
    summary: poll.title,
    ...(poll.details ? { description: poll.details.slice(0, 4000) } : {}),
    ...(url ? { url } : {}),
    day: option.day,
    start: option.start ? zoned(option.day, option.start, zone) : null,
    end: option.start && option.end ? zoned(option.day, option.end, zone) : null,
    stamp: new Date(),
  });
  return download(text, "text/calendar; charset=utf-8", `poll-${poll.id}.ics`);
}

// The look as a stylesheet: kept a year when its link names this very
// sheet (?v=<hash>), else asked again each time; a 304 when the browser
// has it already.
async function look(c: Context, surface: "team" | "public"): Promise<Response> {
  const sheet = await sheetOf(surface);
  const etag = `"${sheet.etag}"`;
  const headers = {
    "Content-Type": "text/css; charset=utf-8",
    ETag: etag,
    "Cache-Control": c.req.query("v") === sheet.etag ? `${surface === "team" ? "private" : "public"}, max-age=31536000, immutable` : "no-cache",
  };
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(sheet.css, { headers });
}

