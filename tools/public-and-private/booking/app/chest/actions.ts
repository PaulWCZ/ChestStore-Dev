"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import * as b from "../../lib/booking.ts";
import * as calendars from "../../lib/calendars.ts";
import { importCalendly as importFile, type ImportResult } from "../../lib/import.ts";
import { db } from "../../lib/db.ts";
import { AppError, attempt, type Result } from "../../lib/errors.ts";
import { email } from "../../lib/guests.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { currentMember } from "../../lib/session.ts";
import * as publish from "../../lib/publish.ts";
import * as tell from "../../lib/tell.ts";

// The team's actions. Each is an endpoint anyone can call: each reads the
// member from the Chest's assertion again; the services check the rights.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

export async function cancelBooking(id: string, reason: string): Promise<Result<{ delivery: "email" | "page" }>> {
  return act(async actor => {
    const sql = db();
    const done = await b.cancelByHost(sql, actor, id, reason);
    await tell.quiet(done);
    await publish.unpublish(sql, done);
    await tell.hostCopy(sql, "cancelled", done);
    const origin = publicOrigin(await headers());
    await b.rememberPublicOrigin(sql, origin);
    return { delivery: await email(sql, "cancelled", done, origin) };
  });
}

export async function createType(input: b.TypeInput): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await b.createType(db(), actor, input)).id }));
}

export async function updateType(id: string, input: b.TypeInput): Promise<Result<null>> {
  return act(async actor => {
    await b.updateType(db(), actor, id, input);
    return null;
  });
}

export async function setTypeActive(id: string, active: boolean): Promise<Result<null>> {
  return act(async actor => {
    await b.setTypeActive(db(), actor, id, active);
    return null;
  });
}

export async function removeType(id: string): Promise<Result<null>> {
  return act(async actor => {
    await b.removeType(db(), actor, id);
    return null;
  });
}

export async function saveWeekly(weekly: unknown, zone: string, dailyMax: number): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const host = await b.hostOf(sql, actor.id);
    if (!host) throw new AppError("not_host");
    await sql.begin(async tx => {
      await b.saveWeekly(tx, actor, weekly);
      await b.saveHost(tx, actor, { slug: host.slug, zone, welcome: host.welcome, listed: host.listed });
      await b.saveHostPrefs(tx, actor, { dailyMax, emailMe: host.emailMe });
    });
    return null;
  });
}

export async function addDaysOff(from: string, to: string, note: string): Promise<Result<number>> {
  return act(actor => b.daysOff(db(), actor, { from, to, note }));
}

export async function addSpecialDay(day: string, ranges: [number, number][], note: string): Promise<Result<null>> {
  return act(async actor => {
    await b.saveOverride(db(), actor, { day, ranges, note });
    return null;
  });
}

export async function removeException(day: string): Promise<Result<null>> {
  return act(async actor => {
    await b.removeOverride(db(), actor, day);
    return null;
  });
}

export async function savePage(input: { slug: string; welcome: string; listed: boolean }): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const host = await b.hostOf(sql, actor.id);
    if (!host) throw new AppError("not_host");
    await b.saveHost(sql, actor, { ...input, zone: host.zone });
    return null;
  });
}

export async function newFeed(): Promise<Result<string>> {
  return act(async actor => {
    const token = await b.newFeed(db(), actor);
    return `${publicOrigin(await headers()) ?? ""}/feed/${token}.ics`;
  });
}

export async function stopFeed(): Promise<Result<null>> {
  return act(async actor => {
    await b.stopFeed(db(), actor);
    return null;
  });
}

export async function saveSettings(input: { companyName: string; retentionMonths: number; defaultZone: string }): Promise<Result<null>> {
  return act(async actor => {
    await b.saveSettings(db(), actor, input);
    return null;
  });
}

export async function eraseGuest(address: string): Promise<Result<number>> {
  return act(async actor => {
    const sql = db();
    const gone = await b.eraseGuest(sql, actor, address);
    for (const id of gone) await publish.unpublish(sql, { id });
    return gone.length;
  });
}

export async function saveSites(sites: string): Promise<Result<null>> {
  return act(async actor => {
    await b.saveEmbed(db(), actor, sites);
    return null;
  });
}

export async function savePrefs(input: { dailyMax: number; emailMe: boolean }): Promise<Result<null>> {
  return act(async actor => {
    await b.saveHostPrefs(db(), actor, input);
    return null;
  });
}

// ——— Times blocked, other calendars ———

export async function blockTime(day: string, from: number, to: number, note: string): Promise<Result<null>> {
  return act(async actor => {
    await b.blockTime(db(), actor, { day, from, to, note });
    return null;
  });
}

export async function unblock(id: string): Promise<Result<null>> {
  return act(async actor => {
    await b.unblock(db(), actor, id);
    return null;
  });
}

export async function connectCalendar(address: string): Promise<Result<null>> {
  return act(async actor => {
    await calendars.connect(db(), actor, address);
    return null;
  });
}

export async function disconnectCalendar(id: string): Promise<Result<null>> {
  return act(async actor => {
    await calendars.disconnect(db(), actor, id);
    return null;
  });
}

export async function readCalendars(): Promise<Result<number>> {
  return act(actor => calendars.refreshMine(db(), actor));
}

// ——— A host books or moves for a guest ———

export type ForGuest = { start: string; name: string; email: string; phone: string; note: string; zone: string; language: string };

export async function bookForGuest(typeId: string, input: ForGuest): Promise<Result<{ id: string; delivery: "email" | "page" }>> {
  return act(async actor => {
    const sql = db();
    const s = await b.settings(sql);
    const language = input.language === "fr" || input.language === "en" ? input.language : "en";
    const made = await b.bookForGuest(sql, actor, typeId, { ...input, language }, Date.now(), s.companyName);
    const origin = publicOrigin(await headers());
    await b.rememberPublicOrigin(sql, origin);
    const delivery = await email(sql, "confirmed", made.booking, origin);
    await publish.publish(sql, made.booking);
    // Another host of the team took it: they hear of it.
    if (made.booking.memberId !== actor.id) await tell.booked(made.booking, (await b.hostOf(sql, made.booking.memberId))?.zone ?? input.zone);
    await tell.hostCopy(sql, "booked", made.booking);
    return { id: made.booking.id, delivery };
  });
}

export async function moveMeeting(id: string, start: string): Promise<Result<{ delivery: "email" | "page" }>> {
  return act(async actor => {
    const sql = db();
    const { booking } = await b.moveByHost(sql, actor, id, start);
    const origin = publicOrigin(await headers());
    await b.rememberPublicOrigin(sql, origin);
    const delivery = await email(sql, "moved", booking, origin);
    await publish.publish(sql, booking);
    await tell.hostCopy(sql, "moved", booking);
    return { delivery };
  });
}

export async function markPaid(id: string, paid: boolean): Promise<Result<null>> {
  return act(async actor => {
    await b.markPaid(db(), actor, id, paid);
    return null;
  });
}

// Meetings already booked in Calendly (its CSV export); each goes into the
// host's Chest calendar too.
export async function importCalendly(text: string, zone: string): Promise<Result<ImportResult>> {
  return act(async actor => {
    const sql = db();
    const { bookings, ...result } = await importFile(sql, actor, text, zone);
    for (const booking of bookings) await publish.publish(sql, booking);
    return result;
  });
}
