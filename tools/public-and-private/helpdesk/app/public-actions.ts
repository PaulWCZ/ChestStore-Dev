"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import * as attachments from "../lib/attachments.ts";
import { db } from "../lib/db.ts";
import { check } from "../lib/form-token.ts";
import * as mailer from "../lib/mailer.ts";
import { publicOrigin, visitorKey } from "../lib/public-origin.ts";
import { publicWords } from "../lib/session.ts";
import * as tell from "../lib/tell.ts";
import * as tickets from "../lib/tickets.ts";

// The public part's actions: anyone on the Internet may call them. They
// hold no member; they check the form's guard, bound everything, and never
// reveal anything but what the visitor's own link shows.

export type FormState = { error: ErrorCode | null; values: Record<string, string>; max?: number };

// The files of a visitor's message: claims of their own uploads, traded
// once each (lib/attachments.ts), deleted again if the message is refused.
const visitorFiles = (data: FormData): tickets.Files => ({ take: () => attachments.take("public", data.get("files")), drop: attachments.remove });

export async function sendRequest(_: FormState, data: FormData): Promise<FormState> {
  const values = Object.fromEntries(["name", "email", "subject", "message"].map(k => [k, String(data.get(k) ?? "").slice(0, 12000)]));
  let secret: string;
  let mailed = false;
  try {
    // A field people never see: only robots fill it.
    if (String(data.get("website") ?? "") !== "") throw new AppError("invalid");
    check(data.get("started"));
    const sql = db();
    const h = await headers();
    await tickets.guard(sql, visitorKey(h));
    const { locale } = await publicWords();
    const t = await tickets.fromForm(sql, { name: values["name"], email: values["email"], subject: values["subject"], message: values["message"], language: locale }, visitorFiles(data));
    secret = t.secret;
    const origin = publicOrigin(h);
    await tickets.rememberPublicOrigin(sql, origin);
    const s = await tickets.settings(sql);
    const ticket = { number: t.number, subject: values["subject"]!.trim(), customerEmail: values["email"]!.trim(), customerName: values["name"]!.trim(), language: locale };
    const sent = await mailer.confirm(ticket, `${origin ?? ""}/t/${secret}`, s.companyName);
    mailed = sent.delivery === "email";
    await tell.newTicket({ id: t.id, number: t.number, subject: ticket.subject, customerName: ticket.customerName, customerEmail: ticket.customerEmail }, values["message"]!);
    await tell.refreshBadges(sql);
  } catch (error) {
    if (error instanceof AppError) return { error: error.code, values, ...(typeof error.values["max"] === "number" ? { max: error.values["max"] } : {}) };
    console.error("request not saved", error instanceof Error ? error.name : "error");
    return { error: "unavailable", values };
  }
  redirect(`/t/${secret}?new=1${mailed ? "&mailed=1" : ""}`);
}

export type ReplyState = { error: ErrorCode | null; sent: boolean; max?: number };

export async function writeAgain(secret: string, _: ReplyState, data: FormData): Promise<ReplyState> {
  try {
    const sql = db();
    const h = await headers();
    await tickets.guard(sql, visitorKey(h));
    const body = String(data.get("message") ?? "");
    const t = await tickets.customerReply(sql, secret, body, visitorFiles(data));
    await tell.customerWrote(t, body);
    await tell.refreshBadges(sql);
    return { error: null, sent: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.code, sent: false, ...(typeof error.values["max"] === "number" ? { max: error.values["max"] } : {}) };
    return { error: "unavailable", sent: false };
  }
}

export type UploadGrant = { ok: true; url: string } | { ok: false; error: ErrorCode; max?: number };

// fileUpload lets a visitor send one file to the Chest, for the form they
// were shown (its signed token) or for their own request (its link) —
// nobody else. The bytes go from their browser to the Chest; what comes
// back is a claim only they hold.
export async function fileUpload(where: { started?: string; secret?: string }, type: string, size: number): Promise<UploadGrant> {
  try {
    const up = await attachments.visitorGrant(db(), where, visitorKey(await headers()), type, size);
    return { ok: true, url: up.url };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code, ...(typeof error.values["max"] === "number" ? { max: error.values["max"] } : {}) };
    return { ok: false, error: "unavailable" };
  }
}
