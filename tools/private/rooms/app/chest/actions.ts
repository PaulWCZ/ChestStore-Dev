"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { db } from "../../lib/db.ts";
import * as desks from "../../lib/desk-bookings.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as places from "../../lib/places.ts";
import { setPresence as savePresence } from "../../lib/presence.ts";
import * as rooms from "../../lib/room-bookings.ts";
import { setRules as saveRules } from "../../lib/settings.ts";
import { currentMember } from "../../lib/session.ts";
import * as tell from "../../lib/tell.ts";
import { zone } from "../../lib/zone.ts";
import { flush } from "../../lib/calendar.ts";
import { checkIn as checkInto } from "../../lib/check-in.ts";
import * as usual from "../../lib/usual.ts";
import * as visits from "../../lib/visits.ts";
import { matchable } from "../../lib/directory.ts";
import * as imports from "../../lib/import.ts";
import * as example from "../../lib/example.ts";
import * as calendarImport from "../../lib/calendar-import.ts";
import { chest } from "@argentic/chest-sdk/chest";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  // The calendars hear of what changed (queued in the same transaction).
  if (result.ok) await flush(db(), zone()).catch(error => console.error("calendar flush failed", error instanceof Error ? error.name : "non-error thrown"));
  revalidatePath("/chest", "layout");
  return result;
}

// ---------- Presence ----------

export async function setPresence(day: string, status: string | null, officeId?: string | null): Promise<Result<{ previous: { status: string; officeId: string | null } | null; freed: string[] }>> {
  return act(async actor => {
    const { previous, freed, borrowed } = await savePresence(db(), actor, { day, status, ...(officeId ? { officeId } : {}) }, zone());
    await tell.holderBack(actor, day, borrowed);
    return { previous, freed };
  });
}

export async function setUsualWeek(input: { days: Record<string, string | null>; deskId: string | null; lendDesk: boolean }): Promise<Result<{ applied: number }>> {
  return act(actor => usual.setUsualWeek(db(), actor, input, zone()));
}

export async function setMyOffice(officeId: string): Promise<Result<null>> {
  return act(async actor => { await places.setMyOffice(db(), actor, officeId); return null; });
}

// ---------- Desks ----------

// forWhom: an admin books for someone else (they are told).
export async function bookDesk(deskId: string, day: string, part: string, move = false, forWhom?: string | null): Promise<Result<{ id: string; deskName: string; replaced: string[]; lent: boolean }>> {
  return act(async actor => {
    const b = await desks.bookDesk(db(), actor, { deskId, day, part, move, ...(forWhom ? { for: forWhom } : {}) }, zone());
    await tell.bookedForYou(actor, b.memberId, { desk: b });
    return { id: b.id, deskName: b.deskName, replaced: b.replaced, lent: b.lent };
  });
}

// Undo of a booking made here: it goes, and a desk it replaced comes back.
export async function undoDesk(bookingId: string, replaced: string[]): Promise<Result<null>> {
  return act(async actor => {
    await desks.cancelDesk(db(), actor, bookingId);
    for (const id of replaced.slice(0, 4)) await desks.restoreDesk(db(), actor, id);
    return null;
  });
}

export async function cancelDesk(bookingId: string): Promise<Result<{ deskName: string }>> {
  return act(async actor => {
    const b = await desks.cancelDesk(db(), actor, bookingId);
    await tell.desksCancelled(actor, [b], "admin");
    return { deskName: b.deskName };
  });
}

export async function restoreDesk(bookingId: string): Promise<Result<null>> {
  return act(async actor => { await desks.restoreDesk(db(), actor, bookingId); return null; });
}

// ---------- Rooms ----------

export type RoomForm = { roomId: string; day: string; start: number; end: number; title: string; attendees: string[]; weeks?: number; for?: string };

export async function bookRoom(input: RoomForm): Promise<Result<{ ids: string[]; days: string[]; taken: string[]; roomName: string }>> {
  return act(async actor => {
    const done = await rooms.bookRoom(db(), actor, input, zone());
    const organiser = done.bookings[0]?.memberId;
    if (organiser) await tell.bookedForYou(actor, organiser, { room: done.bookings });
    await tell.invited(actor, done.bookings[0]?.attendees ?? [], done.bookings);
    return { ids: done.bookings.map(b => b.id), days: done.bookings.map(b => b.day), taken: done.taken, roomName: done.bookings[0]?.roomName ?? "" };
  });
}

export async function updateRoomBooking(bookingId: string, input: Partial<RoomForm>): Promise<Result<null>> {
  return act(async actor => {
    const { before, after } = await rooms.updateRoomBooking(db(), actor, bookingId, input, zone());
    await tell.changed(actor, before, after);
    return null;
  });
}

export async function cancelRoomBooking(bookingId: string, scope: "one" | "following"): Promise<Result<{ ids: string[] }>> {
  return act(async actor => {
    const gone = await rooms.cancelRoomBooking(db(), actor, bookingId, scope === "following" ? "following" : "one", zone());
    await tell.cancelled(actor, gone, gone.some(b => b.memberId !== actor.id) ? "admin" : "none");
    return { ids: gone.map(b => b.id) };
  });
}

export async function checkIn(bookingId: string): Promise<Result<null>> {
  return act(async actor => { await checkInto(db(), actor, bookingId); return null; });
}

export async function restoreRoomBookings(ids: string[]): Promise<Result<null>> {
  return act(async actor => {
    const back = await rooms.restoreRoomBookings(db(), actor, ids, zone());
    await tell.invited(actor, back[0]?.attendees ?? [], back);
    return null;
  });
}

// ---------- Places (admins) ----------

export async function addOffice(input: { name: string; address: string }): Promise<Result<{ id: string }>> {
  return act(actor => places.addOffice(db(), actor, input));
}
export async function updateOffice(officeId: string, input: { name: string; address: string }): Promise<Result<null>> {
  return act(async actor => { await places.updateOffice(db(), actor, officeId, input); return null; });
}
export async function removeOffice(officeId: string): Promise<Result<null>> {
  return act(async actor => { await places.removeOffice(db(), actor, officeId); return null; });
}
export async function addFloor(officeId: string, name: string): Promise<Result<{ id: string }>> {
  return act(actor => places.addFloor(db(), actor, officeId, name));
}
export async function renameFloor(floorId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await places.renameFloor(db(), actor, floorId, name); return null; });
}
export async function removeFloor(floorId: string): Promise<Result<null>> {
  return act(async actor => { await places.removeFloor(db(), actor, floorId); return null; });
}
export async function addArea(floorId: string, name: string): Promise<Result<{ id: string }>> {
  return act(actor => places.addArea(db(), actor, floorId, name));
}
export async function renameArea(areaId: string, name: string): Promise<Result<null>> {
  return act(async actor => { await places.renameArea(db(), actor, areaId, name); return null; });
}
export async function removeArea(areaId: string): Promise<Result<null>> {
  return act(async actor => { await places.removeArea(db(), actor, areaId); return null; });
}

export type RoomFields = { name: string; capacity: number; equipment: string[]; note: string; floorId?: string; groupId?: string | null };
export async function addRoom(floorId: string, input: RoomFields): Promise<Result<{ id: string }>> {
  return act(actor => places.addRoom(db(), actor, floorId, input));
}
export async function updateRoom(roomId: string, input: RoomFields): Promise<Result<null>> {
  return act(async actor => { await places.updateRoom(db(), actor, roomId, input); return null; });
}
export async function removeRoom(roomId: string): Promise<Result<{ cancelled: number }>> {
  return act(async actor => {
    const { cancelled, photo } = await places.removeRoom(db(), actor, roomId, zone());
    await tell.cancelled(actor, cancelled, "room");
    if (photo) await dropFile(photo);
    return { cancelled: cancelled.length };
  });
}
export async function removeRoomPhoto(roomId: string): Promise<Result<null>> {
  return act(async actor => {
    const { previous } = await places.setRoomPhoto(db(), actor, roomId, null);
    if (previous) await dropFile(previous);
    return null;
  });
}

export type DeskFields = { name: string; features: string[]; assignedTo: string | null; areaId?: string };
export async function addDesks(areaId: string, count: number, features: string[]): Promise<Result<{ ids: string[] }>> {
  return act(actor => places.addDesks(db(), actor, areaId, count, features));
}
// Undo of "4 desks added": they go (new, so nobody booked them).
export async function undoAddDesks(ids: string[]): Promise<Result<null>> {
  return act(async actor => {
    for (const id of ids.slice(0, 50)) await places.removeDesk(db(), actor, id);
    return null;
  });
}
export async function setAreaGroup(areaId: string, groupId: string | null): Promise<Result<null>> {
  return act(async actor => { await places.setAreaGroup(db(), actor, areaId, groupId); return null; });
}

// ---------- Start with an example (admins) ----------

// The office is named in the admin's language (they rename it); the
// floors' and areas' stored names in the Chest's (the keys show each
// reader their own).
export async function addExample(): Promise<Result<{ id: string }>> {
  return act(actor => {
    const mine = catalogue(isLocale(actor.language) ? actor.language : "en");
    const given = chest.language;
    const company = catalogue(isLocale(given) ? given : "en");
    return example.addExample(db(), actor, { office: mine.places.example.office, presets: company.presets });
  });
}
export async function removeExample(officeId: string): Promise<Result<null>> {
  return act(async actor => { await example.removeExample(db(), actor, officeId); return null; });
}

// ---------- Moving in (admins) ----------

export async function importRooms(officeId: string, text: string): Promise<Result<imports.RoomsImported>> {
  return act(actor => imports.importRooms(db(), actor, officeId, text));
}
export async function importDesks(officeId: string, text: string): Promise<Result<Omit<imports.DesksImported, "cancelled"> & { cancelled: number }>> {
  return act(async actor => {
    const everyone = await matchable();
    const done = await imports.importDesks(db(), actor, officeId, text, everyone);
    await tell.desksCancelled(actor, done.cancelled, "given");
    return { ...done, cancelled: done.cancelled.length };
  });
}

// A room calendar's .ics export: first a preview (nothing is written),
// then the import; Undo takes the whole import back.
export async function readRoomCalendar(roomId: string, text: string, commit: boolean): Promise<Result<calendarImport.CalendarImport>> {
  return act(async actor => calendarImport.importRoomCalendar(db(), actor, { roomId, text, commit }, await matchable(), zone()));
}
export async function undoRoomCalendar(batch: string): Promise<Result<{ removed: number }>> {
  return act(async actor => ({ removed: await calendarImport.undoCalendarImport(db(), actor, batch) }));
}

export async function updateDesk(deskId: string, input: DeskFields): Promise<Result<{ cancelled: number }>> {
  return act(async actor => {
    const { cancelled } = await places.updateDesk(db(), actor, deskId, input);
    await tell.desksCancelled(actor, cancelled, "given");
    return { cancelled: cancelled.length };
  });
}
export async function removeDesk(deskId: string): Promise<Result<{ cancelled: number }>> {
  return act(async actor => {
    const { cancelled } = await places.removeDesk(db(), actor, deskId);
    await tell.desksCancelled(actor, cancelled, "removed");
    return { cancelled: cancelled.length };
  });
}

export async function setRules(input: Record<string, unknown>): Promise<Result<null>> {
  return act(async actor => { await saveRules(db(), actor, input); return null; });
}

// A file the tool no longer uses goes from the Chest (a courtesy: a
// leftover costs a little space, never a wrong answer).
async function dropFile(name: string): Promise<void> {
  const files = await import("@argentic/chest-sdk/files");
  await files.delete(name).catch(() => false);
}

// ---------- Visitors ----------

export async function announceVisit(input: { officeId: string; day: string; at: number; name: string; company: string; host?: string | null }): Promise<Result<{ id: string; name: string; day: string; at: number }>> {
  return act(async actor => {
    const v = await visits.announce(db(), actor, input, zone());
    await tell.visitAnnounced(actor, v);
    return { id: v.id, name: v.name, day: v.day, at: v.at };
  });
}
export async function visitorArrived(visitId: string): Promise<Result<{ first: boolean }>> {
  return act(async actor => {
    const { visit, first } = await visits.arrive(db(), actor, visitId, zone());
    if (first) {
      const [office] = visit.officeId ? await db()<{ name: string }[]>`select name from offices where id = ${visit.officeId}` : [];
      await tell.visitorHere(actor, visit, office?.name ?? "");
    }
    return { first };
  });
}
export async function visitorNotArrived(visitId: string): Promise<Result<null>> {
  return act(async actor => { await visits.unarrive(db(), actor, visitId); return null; });
}
export async function cancelVisit(visitId: string): Promise<Result<null>> {
  return act(async actor => {
    const v = await visits.cancelVisit(db(), actor, visitId, zone());
    await tell.visitCancelled(actor, v);
    return null;
  });
}
export async function restoreVisit(visitId: string): Promise<Result<null>> {
  return act(async actor => {
    const v = await visits.restoreVisit(db(), actor, visitId);
    await tell.visitAnnounced(actor, v);
    return null;
  });
}
