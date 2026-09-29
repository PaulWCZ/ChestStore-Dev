"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import * as b from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { admit, checkForm } from "../lib/guard.ts";
import { email } from "../lib/guests.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { publicWords } from "../lib/session.ts";
import * as publish from "../lib/publish.ts";
import * as share from "../lib/share.ts";
import * as tell from "../lib/tell.ts";

// The public part's actions: anyone on the Internet may call them. They
// hold no member; they check the form's guard, bound everything, and never
// reveal anything but what the visitor's own link shows.

// detail: the values the error's words need (which question, how long).
export type BookState = { error: ErrorCode | null; detail?: Record<string, number | string>; values: Record<string, string> };

// The answers to the host's questions come as q_<question id>.
const answerField = /^q_([a-z0-9]{4,12})$/u;

export async function bookTime(hostSlug: string, typeSlug: string, _: BookState, data: FormData): Promise<BookState> {
  const values = Object.fromEntries(["start", "name", "email", "phone", "note", "zone"].map(k => [k, String(data.get(k) ?? "").slice(0, 4000)]));
  for (const [key, value] of [...data.entries()].filter(([k]) => answerField.test(k)).slice(0, 10)) values[key] = String(value).slice(0, 4000);
  const answers = Object.fromEntries(Object.entries(values).flatMap(([k, v]) => { const m = answerField.exec(k); return m ? [[m[1]!, v]] : []; }));
  let secret: string;
  let mailed = false;
  try {
    // A field people never see: only robots fill it.
    if (String(data.get("website") ?? "") !== "") throw new AppError("invalid");
    await checkForm(data.get("started"));
    const sql = db();
    const h = await headers();
    await admit(sql, h, "book");
    const place = await b.publicType(sql, String(hostSlug), String(typeSlug));
    if (!place) throw new AppError("not_found");
    const { locale } = await publicWords();
    const s = await b.settings(sql);
    const made = await b.book(sql, place.host, place.type, { start: values["start"], name: values["name"], email: values["email"], phone: values["phone"], note: values["note"], answers, zone: values["zone"], language: locale }, Date.now(), { company: s.companyName });
    secret = made.secret;
    const origin = publicOrigin(h);
    await b.rememberPublicOrigin(sql, origin);
    mailed = (await email(sql, "confirmed", made.booking, origin)) === "email";
    // A team type may have gone to another of its hosts.
    const host = made.booking.memberId === place.host.memberId ? place.host : await b.hostOf(sql, made.booking.memberId);
    await tell.booked(made.booking, host?.zone ?? place.host.zone, await b.titlesOf(sql, made.booking));
    await publish.publish(sql, made.booking);
    await tell.hostCopy(sql, "booked", made.booking);
    await share.changed(sql, "booked", made.booking);
  } catch (error) {
    if (error instanceof AppError) return { error: error.code, detail: error.values, values };
    console.error("booking not saved", error instanceof Error ? error.name : "error");
    return { error: "unavailable", values };
  }
  redirect(`/b/${secret}?new=1${mailed ? "&mailed=1" : ""}`);
}

export type GuestState = { error: ErrorCode | null; done: boolean };

export async function cancelMine(secret: string, _: GuestState, data: FormData): Promise<GuestState> {
  try {
    const sql = db();
    const h = await headers();
    await admit(sql, h, "change");
    const done = await b.cancelByGuest(sql, String(secret), String(data.get("reason") ?? ""));
    const host = await b.hostOf(sql, done.memberId);
    await email(sql, "cancelled", done, publicOrigin(h));
    await tell.cancelled(done, host?.zone ?? done.guestZone, await b.titlesOf(sql, done));
    await publish.unpublish(sql, done);
    await tell.hostCopy(sql, "cancelled", done);
    await share.changed(sql, "cancelled", done);
    return { error: null, done: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.code, done: false };
    return { error: "unavailable", done: false };
  }
}

export async function moveMine(secret: string, start: string): Promise<{ error: ErrorCode | null }> {
  try {
    const sql = db();
    const h = await headers();
    await admit(sql, h, "change");
    const { booking, from } = await b.moveByGuest(sql, String(secret), String(start));
    const host = await b.hostOf(sql, booking.memberId);
    await email(sql, "moved", booking, publicOrigin(h));
    await tell.moved(booking, host?.zone ?? booking.guestZone, await b.titlesOf(sql, booking));
    await publish.publish(sql, booking);
    await tell.hostCopy(sql, "moved", booking);
    await share.changed(sql, "moved", booking, { previousHost: from });
    return { error: null };
  } catch (error) {
    if (error instanceof AppError) return { error: error.code };
    return { error: "unavailable" };
  }
}
