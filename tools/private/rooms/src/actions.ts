import { action, after, field, log, type Field } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { catalogue, localeOf } from "./i18n/index.ts";
import { flush } from "./lib/calendar.ts";
import * as calendarImport from "./lib/calendar-import.ts";
import { checkIn as checkInto } from "./lib/check-in.ts";
import { db } from "./lib/db.ts";
import * as desks from "./lib/desk-bookings.ts";
import { matchable } from "./lib/directory.ts";
import * as example from "./lib/example.ts";
import * as imports from "./lib/import.ts";
import * as invitations from "./lib/invitations.ts";
import { authorisePhoto, recordPhoto } from "./lib/photos.ts";
import * as places from "./lib/places.ts";
import { setPresence as savePresence } from "./lib/presence.ts";
import * as rooms from "./lib/room-bookings.ts";
import { setRules as saveRules } from "./lib/settings.ts";
import * as tell from "./lib/tell.ts";
import * as usual from "./lib/usual.ts";
import * as visits from "./lib/visits.ts";
import { zone } from "./lib/zone.ts";

// Every change Rooms makes, by name: POST /chest/actions/<name>, called by
// the islands with call(). The member is the Chest's (member(request));
// the services of src/lib/ check who may do what and read every value
// themselves (their codes: invalid, too_long, taken…), so a field here
// says only what an island sends. What others hear (the bell, guests'
// emails) and what the calendars learn go after the answer (after()): a
// Chest that does not answer never fails a booking already written.

// A value the service reads and checks itself, typed as the islands send it.
const given = <W>(): Field<W | undefined, W> => ({ read: value => value as W | undefined });
const id = field.id;

// The members' calendar feeds hear of what changed (queued in the same
// transaction as the change: src/lib/calendar.ts).
function calendars(): void {
  after("calendar flush", () => flush(db(), zone()));
}
// A message to the bell (or a visitor's email), sent after the answer.
function told(name: string, task: () => Promise<unknown>): void {
  after(name, task);
}

export const actions = {
  // ---------- Presence ----------

  setPresence: action({ day: field.day(), status: field.nullable(field.choice(["office", "remote", "off"] as const)), officeId: field.nullable(id()) },
    async (input, { member }): Promise<{ previous: { status: string; officeId: string | null } | null; freed: string[] }> => {
      const { previous, freed, borrowed } = await savePresence(db(), member, { day: input.day, status: input.status ?? null, ...(input.officeId ? { officeId: input.officeId } : {}) }, zone());
      told("holder back", () => tell.holderBack(member, input.day, borrowed));
      calendars();
      return { previous, freed };
    }),

  setUsualWeek: action({ days: given<Record<string, string | null>>(), deskId: field.nullable(id()), lendDesk: field.bool() },
    async (input, { member }): Promise<{ applied: number }> => {
      const done = await usual.setUsualWeek(db(), member, { days: input.days, deskId: input.deskId ?? null, lendDesk: input.lendDesk }, zone());
      calendars();
      return done;
    }),

  setMyOffice: action({ officeId: id() }, async (input, { member }): Promise<null> => {
    await places.setMyOffice(db(), member, input.officeId);
    return null;
  }),

  // ---------- Desks ----------

  // for: an admin or an office manager books for someone (they are told).
  bookDesk: action({ deskId: id(), day: field.day(), part: field.choice(["day", "am", "pm"] as const), move: field.bool(), for: field.optional(field.text({ max: 64 })) },
    async (input, { member }): Promise<{ id: string; deskName: string; replaced: string[]; lent: boolean }> => {
      const b = await desks.bookDesk(db(), member, { deskId: input.deskId, day: input.day, part: input.part, move: input.move, ...(input.for ? { for: input.for } : {}) }, zone());
      told("desk booked for", () => tell.bookedForYou(member, b.memberId, { desk: b }));
      calendars();
      return { id: b.id, deskName: b.deskName, replaced: b.replaced, lent: b.lent };
    }),

  // Undo of a booking made here: it goes, and a desk it replaced comes back.
  undoDesk: action({ bookingId: id(), replaced: field.list(id(), 4) }, async (input, { member }): Promise<null> => {
    await desks.cancelDesk(db(), member, input.bookingId);
    for (const replaced of input.replaced) await desks.restoreDesk(db(), member, replaced);
    calendars();
    return null;
  }),

  cancelDesk: action({ bookingId: id() }, async (input, { member }): Promise<{ deskName: string }> => {
    const b = await desks.cancelDesk(db(), member, input.bookingId);
    told("desk cancelled", () => tell.desksCancelled(member, [b], "admin"));
    calendars();
    return { deskName: b.deskName };
  }),

  restoreDesk: action({ bookingId: id() }, async (input, { member }): Promise<null> => {
    await desks.restoreDesk(db(), member, input.bookingId);
    calendars();
    return null;
  }),

  // ---------- Rooms ----------

  bookRoom: action({ roomId: id(), day: field.day(), start: given<number>(), end: given<number>(), title: given<string>(), attendees: given<string[]>(), weeks: given<number | undefined>(), for: given<string | undefined>() },
    async (input, { member }): Promise<{ ids: string[]; days: string[]; taken: string[]; roomName: string }> => {
      const done = await rooms.bookRoom(db(), member, input, zone());
      const organiser = done.bookings[0]?.memberId;
      told("room booked", async () => {
        if (organiser) await tell.bookedForYou(member, organiser, { room: done.bookings });
        await tell.invited(member, done.bookings[0]?.attendees ?? [], done.bookings);
      });
      calendars();
      return { ids: done.bookings.map(b => b.id), days: done.bookings.map(b => b.day), taken: done.taken, roomName: done.bookings[0]?.roomName ?? "" };
    }),

  // scope "following": this occurrence of a weekly booking and the later
  // ones (taken: the days that could not change).
  updateRoomBooking: action({ bookingId: id(), roomId: id(), day: field.day(), start: given<number>(), end: given<number>(), title: given<string>(), attendees: given<string[]>(), scope: field.optional(field.choice(["one", "following"] as const)) },
    async ({ bookingId, scope, ...input }, { member }): Promise<{ changed: number; taken: string[] }> => {
      if (scope === "following") {
        const { changes, taken } = await rooms.updateFollowing(db(), member, bookingId, input, zone());
        told("series changed", () => tell.changedSeries(member, changes));
        calendars();
        return { changed: changes.length, taken };
      }
      const { before, after: changed } = await rooms.updateRoomBooking(db(), member, bookingId, input, zone());
      told("room changed", () => tell.changed(member, before, changed));
      calendars();
      return { changed: 1, taken: [] };
    }),

  cancelRoomBooking: action({ bookingId: id(), scope: field.choice(["one", "following"] as const) }, async (input, { member }): Promise<{ ids: string[] }> => {
    const gone = await rooms.cancelRoomBooking(db(), member, input.bookingId, input.scope, zone());
    told("room cancelled", () => tell.cancelled(member, gone, gone.some(b => b.memberId !== member.id) ? "admin" : "none"));
    calendars();
    return { ids: gone.map(b => b.id) };
  }),

  checkIn: action({ bookingId: id() }, async (input, { member }): Promise<null> => {
    await checkInto(db(), member, input.bookingId);
    return null;
  }),

  restoreRoomBookings: action({ ids: field.list(id(), 60) }, async (input, { member }): Promise<null> => {
    const back = await rooms.restoreRoomBookings(db(), member, input.ids, zone());
    told("room restored", () => tell.invited(member, back[0]?.attendees ?? [], back));
    calendars();
    return null;
  }),

  // ---------- Places (admins) ----------

  addOffice: action({ name: given<string>(), address: given<string>() }, async (input, { member }): Promise<{ id: string }> => places.addOffice(db(), member, input)),
  updateOffice: action({ officeId: id(), name: given<string>(), address: given<string>() }, async ({ officeId, ...input }, { member }): Promise<null> => {
    await places.updateOffice(db(), member, officeId, input);
    calendars();
    return null;
  }),
  removeOffice: action({ officeId: id() }, async (input, { member }): Promise<null> => {
    await places.removeOffice(db(), member, input.officeId);
    return null;
  }),
  addFloor: action({ officeId: id(), name: given<string>() }, async (input, { member }): Promise<{ id: string }> => places.addFloor(db(), member, input.officeId, input.name)),
  renameFloor: action({ floorId: id(), name: given<string>() }, async (input, { member }): Promise<null> => {
    await places.renameFloor(db(), member, input.floorId, input.name);
    return null;
  }),
  removeFloor: action({ floorId: id() }, async (input, { member }): Promise<null> => {
    await places.removeFloor(db(), member, input.floorId);
    return null;
  }),
  addArea: action({ floorId: id(), name: given<string>() }, async (input, { member }): Promise<{ id: string }> => places.addArea(db(), member, input.floorId, input.name)),
  renameArea: action({ areaId: id(), name: given<string>() }, async (input, { member }): Promise<null> => {
    await places.renameArea(db(), member, input.areaId, input.name);
    return null;
  }),
  removeArea: action({ areaId: id() }, async (input, { member }): Promise<null> => {
    await places.removeArea(db(), member, input.areaId);
    return null;
  }),
  setAreaGroup: action({ areaId: id(), groupId: field.nullable(field.text({ max: 64 })) }, async (input, { member }): Promise<null> => {
    await places.setAreaGroup(db(), member, input.areaId, input.groupId ?? null);
    return null;
  }),

  addRoom: action({ floorId: id(), name: given<string>(), capacity: given<number>(), equipment: given<string[]>(), note: given<string>(), groupId: given<string | null>() },
    async ({ floorId, ...input }, { member }): Promise<{ id: string }> => places.addRoom(db(), member, floorId, input)),
  updateRoom: action({ roomId: id(), name: given<string>(), capacity: given<number>(), equipment: given<string[]>(), note: given<string>(), floorId: given<string>(), groupId: given<string | null>() },
    async ({ roomId, ...input }, { member }): Promise<null> => {
      await places.updateRoom(db(), member, roomId, input);
      calendars();
      return null;
    }),
  removeRoom: action({ roomId: id() }, async (input, { member }): Promise<{ cancelled: number }> => {
    const { cancelled, photo } = await places.removeRoom(db(), member, input.roomId, zone());
    told("room removed", async () => {
      await tell.cancelled(member, cancelled, "room");
      if (photo) await dropFile(photo);
    });
    calendars();
    return { cancelled: cancelled.length };
  }),

  // A room's photo goes from the browser to the Chest itself: the tool
  // grants one upload into the room's folder (photoUpload), the island
  // PUTs the picture there, then photoSaved checks the Chest holds it.
  photoUpload: action({ roomId: id(), size: field.int({ min: 1, max: 1 << 30 }) }, async (input, { member }): Promise<{ url: string; method: string }> => {
    const up = await authorisePhoto(db(), member, input.roomId, input.size);
    return { url: up.url, method: up.method };
  }),
  photoSaved: action({ roomId: id(), name: field.text({ max: 200 }) }, async (input, { member }): Promise<null> => {
    await recordPhoto(db(), member, input.roomId, input.name);
    return null;
  }),
  removeRoomPhoto: action({ roomId: id() }, async (input, { member }): Promise<null> => {
    const { previous } = await places.setRoomPhoto(db(), member, input.roomId, null);
    if (previous) told("photo dropped", () => dropFile(previous));
    return null;
  }),

  addDesks: action({ areaId: id(), count: given<number>(), features: given<string[]>() }, async (input, { member }): Promise<{ ids: string[] }> =>
    places.addDesks(db(), member, input.areaId, input.count, input.features)),
  // Undo of "4 desks added": they go (new, so nobody booked them).
  undoAddDesks: action({ ids: field.list(id(), 50) }, async (input, { member }): Promise<null> => {
    for (const desk of input.ids) await places.removeDesk(db(), member, desk);
    return null;
  }),
  updateDesk: action({ deskId: id(), name: given<string>(), features: given<string[]>(), assignedTo: given<string | null>(), areaId: given<string>() },
    async ({ deskId, ...input }, { member }): Promise<{ cancelled: number }> => {
      const { cancelled } = await places.updateDesk(db(), member, deskId, input);
      told("desk given", () => tell.desksCancelled(member, cancelled, "given"));
      calendars();
      return { cancelled: cancelled.length };
    }),
  removeDesk: action({ deskId: id() }, async (input, { member }): Promise<{ cancelled: number }> => {
    const { cancelled } = await places.removeDesk(db(), member, input.deskId);
    told("desk removed", () => tell.desksCancelled(member, cancelled, "removed"));
    calendars();
    return { cancelled: cancelled.length };
  }),

  setRules: action({ rules: field.json() }, async (input, { member }): Promise<null> => {
    await saveRules(db(), member, input.rules as Record<string, unknown>);
    return null;
  }),

  // ---------- Start with an example (admins) ----------

  // The office is named in the admin's language (they rename it); the
  // floors' and areas' stored names in the Chest's (the keys show each
  // reader their own).
  addExample: action({}, async (_input, { member }): Promise<{ id: string }> => {
    const mine = catalogue(localeOf(member.language));
    const company = catalogue(localeOf(chest.language));
    return example.addExample(db(), member, { office: mine.places.example.office, presets: company.presets });
  }),
  removeExample: action({ officeId: id() }, async (input, { member }): Promise<null> => {
    await example.removeExample(db(), member, input.officeId);
    return null;
  }),

  // ---------- Moving in (admins): slow, sent beside the queue ----------

  importRooms: action({ officeId: id(), text: field.text({ max: 2 << 20 }) }, async (input, { member }): Promise<imports.RoomsImported> =>
    imports.importRooms(db(), member, input.officeId, input.text), { parallel: true, maxBody: 3 << 20 }),
  importDesks: action({ officeId: id(), text: field.text({ max: 2 << 20 }) }, async (input, { member }): Promise<Omit<imports.DesksImported, "cancelled"> & { cancelled: number }> => {
    const done = await imports.importDesks(db(), member, input.officeId, input.text, await matchable(input.text));
    told("desks given", () => tell.desksCancelled(member, done.cancelled, "given"));
    calendars();
    return { ...done, cancelled: done.cancelled.length };
  }, { parallel: true, maxBody: 3 << 20 }),

  // A room calendar's .ics export: first a preview (nothing is written),
  // then the import; Undo takes the whole import back.
  readRoomCalendar: action({ roomId: id(), text: field.text({ max: 4 << 20 }), commit: field.bool() },
    async (input, { member }): Promise<calendarImport.CalendarImport> => {
      const done = await calendarImport.importRoomCalendar(db(), member, { roomId: input.roomId, text: input.text, commit: input.commit }, await matchable(input.text), zone());
      if (input.commit) calendars();
      return done;
    }, { parallel: true, maxBody: 5 << 20 }),
  undoRoomCalendar: action({ batch: id() }, async (input, { member }): Promise<{ removed: number }> => {
    const removed = await calendarImport.undoCalendarImport(db(), member, input.batch);
    calendars();
    return { removed };
  }),

  // ---------- Visitors ----------

  // The visitor's invitation goes before the answer, so that the announcer
  // is told the truth: sent, or not (then they tell the visitor themself).
  announceVisit: action({ officeId: id(), day: field.day(), at: given<number>(), name: given<string>(), company: given<string>(), host: given<string | null>(), email: field.optional(given<string>()) },
    async (input, { member }): Promise<{ id: string; name: string; day: string; at: number; invitation: "sent" | "not_sent" | null }> => {
      const v = await visits.announce(db(), member, input, zone());
      const invitation = await invitations.send(db(), v.id, "invite", zone());
      told("visit announced", () => tell.visitAnnounced(member, v));
      return { id: v.id, name: v.name, day: v.day, at: v.at, invitation };
    }),
  visitorArrived: action({ visitId: id() }, async (input, { member }): Promise<{ first: boolean }> => {
    const { visit, first } = await visits.arrive(db(), member, input.visitId, zone());
    if (first) {
      told("visitor here", async () => {
        const [office] = visit.officeId ? await db()<{ name: string }[]>`select name from offices where id = ${visit.officeId}` : [];
        await tell.visitorHere(member, visit, office?.name ?? "");
      });
    }
    return { first };
  }),
  visitorNotArrived: action({ visitId: id() }, async (input, { member }): Promise<null> => {
    await visits.unarrive(db(), member, input.visitId);
    return null;
  }),
  cancelVisit: action({ visitId: id() }, async (input, { member }): Promise<null> => {
    const v = await visits.cancelVisit(db(), member, input.visitId, zone());
    told("visit cancelled", async () => {
      await tell.visitCancelled(member, v);
      if (v.invitation === "sent") await invitations.send(db(), v.id, "cancel", zone());
    });
    return null;
  }),
  restoreVisit: action({ visitId: id() }, async (input, { member }): Promise<null> => {
    const v = await visits.restoreVisit(db(), member, input.visitId);
    told("visit restored", async () => {
      await tell.visitAnnounced(member, v);
      // A visitor told of the cancellation is invited again.
      if (v.invitation === "sent") await invitations.send(db(), v.id, "invite", zone());
    });
    return null;
  }),
};

// A file the tool no longer uses goes from the Chest (a courtesy: a
// leftover costs a little space, never a wrong answer).
async function dropFile(name: string): Promise<void> {
  await files.delete(name).catch((error: unknown) => log.warn("a file was not deleted", { code: error instanceof Error ? error.name : "unknown" }));
}

export type { Member };
