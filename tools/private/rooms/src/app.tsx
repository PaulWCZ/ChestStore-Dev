import { createApp, download, log, notFound, page, publicPage } from "@argentic/chest-app";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { actions } from "./actions.ts";
import { localeOf, locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { leaveApproved, leaveCancelled } from "./lib/away.ts";
import { flush } from "./lib/calendar.ts";
import { quarter } from "./lib/check-in.ts";
import { db } from "./lib/db.ts";
import { bookingsCsv, occupancyCsv } from "./lib/export.ts";
import { forgetSeen, handlers, seen } from "./lib/lifecycle.ts";
import { teamOrigin } from "./lib/mail.ts";
import { bookingIcs, myCsv, myIcs, origin } from "./lib/mine.ts";
import { photoLink } from "./lib/photos.ts";
import { stamp } from "./lib/stamp.ts";
import { rules } from "./lib/settings.ts";
import * as tell from "./lib/tell.ts";
import { zone } from "./lib/zone.ts";
import { desksPage } from "./pages/Desks.tsx";
import { peoplePage } from "./pages/People.tsx";
import { exportPage, placesPage, rulesPage } from "./pages/Places.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { roomsPage } from "./pages/Rooms.tsx";
import { visitorsPage } from "./pages/Visitors.tsx";
import { weekPage } from "./pages/Week.tsx";
import { lookFor } from "./theme.ts";

// Rooms' routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the member of every /chest request (401 without the
// Chest's assertion), /lang/<code>, the look as a stylesheet of its own
// (/chest/look.css: src/theme.ts), the error pages, and answers 404 to
// anything else.
export const app = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  // The look: the company's choice, else Blueprint (src/theme.ts).
  look: lookFor,
  head: () => <><meta name="robots" content="noindex, nofollow" /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- The members' part (/chest…).

// The pages others change read themselves again while open: their version
// (src/lib/stamp.ts) makes a read that finds nothing new a 304.
const changing = { version: ({ member }: { member: Parameters<typeof stamp>[1] }) => stamp(db(), member, zone()) };
// My week (?day= highlights a day: the bell's links; ?office=).
app.get("/chest", page(weekPage, changing));
// Book a desk (?day, part, view=list, f=screen,window, office, for).
app.get("/chest/desks", page(desksPage, changing));
// The rooms' day (?day, booking=<id> opens one, office).
app.get("/chest/rooms", page(roomsPage, changing));
// Who's where (?day, q, team).
app.get("/chest/people", page(peoplePage, changing));
// Visitors of a day (?day, office).
app.get("/chest/visitors", page(visitorsPage, changing));
// Admins: offices, rules, export.
app.get("/chest/places", page(placesPage));
app.get("/chest/places/rules", page(rulesPage));
app.get("/chest/places/export", page(exportPage));

// The files: one booking, or all my coming bookings and office days, as an
// .ics file for any calendar app; everything Rooms keeps about me (CSV);
// the admins' exports (?kind=bookings|occupancy&from&to).
app.get("/chest/calendar/room/:id", download(async ({ member, locale, t, param }) => ({
  name: `${t.mail.file}-${param("id")}.ics`,
  type: "text/calendar; charset=utf-8",
  body: await bookingIcs(db(), member, param("id"), localeOf(locale), origin(teamOrigin())),
})));
app.get("/chest/calendar/mine", download(async ({ member, locale, t }) => ({
  name: `${t.mine.file}.ics`,
  type: "text/calendar; charset=utf-8",
  body: await myIcs(db(), member, localeOf(locale), zone(), { ...origin(teamOrigin()), name: t.tool.name }),
})));
app.get("/chest/mine", download(async ({ member, locale, t }) => ({
  name: `${t.mine.file}.csv`,
  type: "text/csv; charset=utf-8",
  body: await myCsv(db(), member, t, localeOf(locale), zone()),
})));
app.get("/chest/export", download(async ({ member, locale, t, query }) => {
  const kind = query("kind") === "occupancy" ? "occupancy" : "bookings";
  const from = query("from"), to = query("to");
  return {
    name: `${t.export.file}-${kind === "occupancy" ? t.export.fileOccupancy : t.export.fileBookings}-${from}-${to}.csv`,
    type: "text/csv; charset=utf-8",
    body: kind === "occupancy" ? await occupancyCsv(db(), member, from, to, t) : await bookingsCsv(db(), member, from, to, t, localeOf(locale), zone()),
  };
}));

// A room's photo: for whoever may see the room, a fresh link signed by
// the Chest (a 256 or 1,024 pixel thumbnail), never kept in a page.
app.get("/chest/files/rooms/:id", async c => {
  const { member } = c.get("viewer");
  try {
    const url = await photoLink(db(), member, c.req.param("id"), c.req.query("size") === "256");
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChestError && error.code !== "not_found") return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    return notFound();
  }
});

// ---- The host's root: Rooms has no public part (a Chest answers 404 on
// its public host); outside a Chest, it says where Rooms lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed (never under /chest, never
// read the body before handle()). A handler that throws makes the Chest
// send it again: they are idempotent; a delivery already handled is
// dropped (seen).

// The members' lifecycle, the groups (Proposal (studio): "groups"), and
// what the Leave tool tells (Proposal (studio): events between tools).
app.post("/chest-events", async c => {
  const sql = db();
  return new Response(null, {
    status: await events.handle(c.req.raw, handlers(sql), {
      seen: seen(sql),
      tools: {
        "leave.approved": async e => { await leaveApproved(sql, e, zone()); await flush(sql, zone()); },
        "leave.cancelled": async e => { await leaveCancelled(sql, e); await flush(sql, zone()); },
      },
    }),
  });
});

// chest.json's "schedules": every quarter of an hour, "quarter" — the
// reminders before meetings and, with check-in on, the rooms nobody
// checked in to freed (their people told); deliveries older than the
// Chest's retries forgotten.
app.post("/chest-schedules", async c => {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(c.req.raw, {
      quarter: async () => {
        const { reminded, released } = await quarter(sql, zone());
        const { checkIn } = await rules(sql);
        await tell.startsSoon(reminded, checkIn);
        await tell.cancelled(null, released, "noShow");
        await flush(sql, zone());
        const forgotten = await forgetSeen(sql);
        log.info("quarter", { reminded: reminded.length, released: released.length, forgotten });
      },
    }, { seen: seen(sql) }),
  });
});
