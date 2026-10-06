import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import type { Context } from "hono";
import { createApp, page, publicPage } from "./core/http.tsx";
import { log } from "./core/log.ts";
import { AppError, notFound } from "./core/tool.ts";
import { catalogue, isLocale } from "./i18n/index.ts";
import { cleanup, dueReminders, exportRows, feed, bySecret, freeTimes, hostTimes, publicType, settings, typeNames } from "./lib/booking.ts";
import { refreshDue } from "./lib/calendars.ts";
import { toCsv } from "./lib/csv.ts";
import { db } from "./lib/db.ts";
import { embedOrigins, frameAncestors } from "./lib/embed.ts";
import { email } from "./lib/guests.ts";
import { calendar } from "./lib/ics.ts";
import { handlers, seen } from "./lib/lifecycle.ts";
import { invitation } from "./lib/mailer.ts";
import { nameOf, people } from "./lib/people.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import { answerText } from "./lib/questions.ts";
import { shareAllBusy, takeBusy } from "./lib/share.ts";
import { isDate } from "./lib/zone.ts";
import { agendaPage } from "./pages/Agenda.tsx";
import { bookingPage } from "./pages/Booking.tsx";
import { companyPage } from "./pages/CompanyPage.tsx";
import { guestBookingPage } from "./pages/GuestBooking.tsx";
import { hostPage } from "./pages/HostPage.tsx";
import { hoursPage } from "./pages/Hours.tsx";
import { newBookingPage } from "./pages/NewBooking.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { typeEditPage } from "./pages/TypeEdit.tsx";
import { typePage } from "./pages/TypePage.tsx";
import { typesPage } from "./pages/Types.tsx";
import { sheetOf } from "./theme.ts";

// Booking's routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the member of every /chest request, /lang/<code>, the
// error pages, and answers 404 to anything else.
const routes = createApp();

// ---- The members' part (/chest…).

routes.get("/chest", page(agendaPage));
routes.get("/chest/bookings/:id", page(bookingPage));
routes.get("/chest/new", page(newBookingPage));
routes.get("/chest/types", page(typesPage));
routes.get("/chest/types/new", page(v => typeEditPage(v, null)));
routes.get("/chest/types/:id", page(v => typeEditPage(v, v.param("id"))));
routes.get("/chest/hours", page(hoursPage));
routes.get("/chest/settings", page(settingsPage));

// The bookings as a spreadsheet (the host's, or everyone's for an
// administrator), headers in the reader's language, times in the
// company's zone as "YYYY-MM-DD HH:MM" (sortable, read by every sheet).
routes.get("/chest/export", async c => {
  const { member, locale, t } = c.get("viewer");
  try {
    const all = c.req.query("who") === "all";
    const sql = db();
    const rows = await exportRows(sql, member, all);
    const zone = (await settings(sql)).defaultZone;
    const who = await people(rows.map(r => r.memberId));
    // One type, one name (the reader's language); the guest's language in
    // its own column.
    const names = await typeNames(sql, rows.map(r => r.typeId), locale);
    const sortable = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const stamp = (d: Date) => sortable.format(d);
    const h = t.export.headers;
    const csv = toCsv([
      [h.start, h.end, h.type, h.host, h.guest, h.email, h.phone, h.language, h.status, h.note, h.answers, h.created],
      ...rows.map(r => [stamp(r.startsAt), stamp(r.endsAt), (r.typeId && names.get(r.typeId)) || r.title, nameOf(who.get(r.memberId), locale), r.guestName, r.guestEmail, r.guestPhone, isLocale(r.guestLanguage) ? t.languages[r.guestLanguage] : r.guestLanguage, t.export.statuses[r.status], r.guestNote, r.answers.map(a => `${a.label}: ${answerText(a, t.answers)}`).join("\n"), stamp(r.createdAt)]),
    ]);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bookings.csv"', "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 403);
    throw error;
  }
});

// The free times a host sees when booking for a guest (?type=) or moving a
// meeting (?except=<booking>): the type's rules, the notice aside. Behind
// the Chest's sign-in; the service checks the right.
routes.get("/chest/api/slots", async c => {
  try {
    const slots = await hostTimes(db(), c.get("viewer").member, c.req.query("type") ?? null, c.req.query("from") ?? "", c.req.query("to") ?? "", c.req.query("except") ?? null);
    return c.json({ slots: slots.map(s => s.start) });
  } catch (error) {
    if (error instanceof AppError) return c.json({ error: error.code }, error.code === "invalid" ? 400 : 404);
    throw error;
  }
});

// The look of the team's pages: the company's choice (src/theme.ts).
routes.get("/chest/look.css", c => look(c, "team"));

// ---- The public part ("public": true in chest.json): the company's page,
// a host's page, a type's booking page, a guest's booking, its calendar
// file, a host's private feed, the free times the booking page asks.

routes.get("/", publicPage(companyPage));
// The look of the public pages: the company's brand, else Booking's own.
routes.get("/look.css", c => look(c, "public"));

// The free times of a booking type between two dates of the host's
// calendar (at most six weeks): what the public calendar asks as the
// visitor moves between months. Public, read-only, never cached.
routes.get("/api/slots", async c => {
  const from = c.req.query("from"), to = c.req.query("to");
  if (!isDate(from) || !isDate(to)) return c.json({ error: "invalid" }, 400);
  const sql = db();
  const place = await publicType(sql, c.req.query("host") ?? "", c.req.query("type") ?? "");
  if (!place) return c.json({ error: "not_found" }, 404);
  try {
    const slots = await freeTimes(sql, place.host, place.type, from, to);
    return c.json({ slots: slots.map(s => s.start) });
  } catch {
    return c.json({ error: "invalid" }, 400);
  }
});

routes.get("/b/:secret", publicPage(guestBookingPage));

// The guest's calendar file (the same as the email's attachment).
routes.get("/b/:secret/ics", async c => {
  const secret = c.req.param("secret");
  const found = await bySecret(db(), secret);
  if (!found) return c.body(null, 404);
  const b = found.booking;
  const person = (await people([b.memberId])).get(b.memberId);
  const t = catalogue(isLocale(b.guestLanguage) ? b.guestLanguage : "en");
  const link = `${publicOrigin(c.req.raw.headers) ?? ""}/b/${secret}`;
  const text = invitation(b, { hostName: person?.status === "member" ? person.name : t.mail.team, link }, b.status === "cancelled");
  return new Response(text, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${t.mail.fileName}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
});

// A host's private calendar feed (/feed/<token>.ics), on the public host so
// a calendar app can subscribe: the token is the only key. Their meetings
// of the last 30 days and ahead; cancelled ones say so, and calendars
// remove them.
routes.get("/feed/:token", async c => {
  const token = c.req.param("token");
  const found = token.endsWith(".ics") ? await feed(db(), token.slice(0, -4)) : null;
  if (!found) return c.body(null, 404);
  const text = calendar(
    found.bookings.map(x => ({
      uid: `booking-${x.id}@chest`,
      sequence: x.moves + (x.status === "cancelled" ? 1 : 0),
      start: x.startsAt,
      end: x.endsAt,
      summary: `${x.title} — ${x.guestName}`,
      description: [x.guestEmail, x.guestPhone, x.guestNote].filter(Boolean).join("\n"),
      ...(x.location ? { location: x.location } : {}),
      cancelled: x.status === "cancelled",
      stamp: x.cancelledAt ?? x.createdAt,
    })),
    { name: catalogue("en").tool.name },
  );
  return new Response(text, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
});

// A host's page and a type's booking page: any other path of the public
// host. (A path under /chest that no route above takes is the members'
// 404, in their words.)
const members = (path: string) => path.split("/")[1]?.toLowerCase() === "chest";
routes.get("/:host", (c, next) => (members(c.req.path) ? notFound() : next()), publicPage(hostPage));
routes.get("/:host/:type", (c, next) => (members(c.req.path) ? notFound() : next()), publicPage(typePage));

// ---- What the Chest sends by itself, signed (never under /chest, never
// read the body before handle()). A handler that throws makes the Chest
// send it again: they are idempotent.

// The members' lifecycle, and what other tools tell (Proposal (studio):
// events between tools — hiring.busy, the interviews a member is on;
// leave.busy, the days a member is off).
routes.post("/chest-events", async c => {
  const sql = db();
  return new Response(null, {
    status: await events.handle(c.req.raw, handlers(sql), {
      seen: seen(sql),
      tools: {
        "hiring.busy": async e => { await takeBusy(sql, e); },
        "leave.busy": async e => { await takeBusy(sql, e); },
      },
    }),
  });
});

// chest.json's "schedules": every hour, the reminders of tomorrow's
// meetings; every night, bookings older than the company keeps them go;
// every 15 minutes, the hosts' other calendars are read again (within the
// Chest's 5 minutes a run) and the hosts' busy times told to the tools
// linked to Booking. Each run is kept once (seen): a run sent again is
// answered without doing it twice.
routes.post("/chest-schedules", async c => {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(c.req.raw, {
      reminders: async run => {
        let sent = 0;
        for (const b of await dueReminders(sql, Date.parse(run.scheduledAt))) if ((await email(sql, "reminder", b, null)) === "email") sent++;
        log.info("reminders", { sent });
      },
      calendars: async () => {
        const read = await refreshDue(sql, { olderThanMinutes: 10, deadline: Date.now() + 4 * 60000 });
        // What the calendars said, and each new day's window, to the tools
        // linked to Booking (src/lib/share.ts: only what changed).
        const told = await shareAllBusy(sql);
        log.info("calendars", { read, told });
      },
      cleanup: async run => {
        const deleted = await cleanup(sql, Date.parse(run.scheduledAt));
        log.info("cleanup", { deleted });
      },
    }, { seen: seen(sql) }),
  });
});

// ---- Helpers of the routes above.

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

// The public pages may be shown in a frame by the websites an
// administrator allowed (Settings; src/lib/embed.ts): their policy's
// frame-ancestors names them. Read from the database for each public page,
// never kept in the process. (The starter's machinery sets one policy for
// every answer; this is the one place Booking widens it — a page's
// frame-ancestors only. Note: the Chest's front adds `frame-ancestors
// 'none'` to every public answer today, and two policies intersect, so the
// frame works only once the Chest lets an administrator allow it; see
// README, "Needs from the SDK".)
async function framed(request: Request, response: Response): Promise<Response> {
  const policy = response.headers.get("content-security-policy");
  if (!policy || members(new URL(request.url).pathname) || !response.headers.get("content-type")?.startsWith("text/html")) return response;
  const origins = await embedOrigins();
  if (origins.length === 0) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", policy.replace(/frame-ancestors [^;]*/u, frameAncestors(origins, false)));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const app = {
  fetch: async (request: Request, ...rest: unknown[]): Promise<Response> => framed(request, await (routes.fetch as (r: Request, ...a: unknown[]) => Response | Promise<Response>)(request, ...rest)),
};
