"use server";

import * as visitors from "@argentic/chest-sdk/visitors";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "../../../lib/app-error.ts";
import { db } from "../../../lib/db.ts";
import { admit, checkForm } from "../../../lib/guard.ts";
import { answerAsGuest } from "../../../lib/guests.ts";
import { defaultLocale, isLocale } from "../../../lib/i18n/index.ts";
import { guestCookie, guestCookieDays, guestCookiePath } from "./cookie.ts";

// The guest page's one action: anyone on the Internet may call it. It
// holds no member; it checks the form's guard (a field only robots fill,
// the signed "shown at" token, the visitor counters), then the answer
// against the poll (lib/guests.ts). It reveals nothing but "received" or
// why not; the guest's own answer is found again by the secret their
// browser keeps.

export type GuestState = { error: ErrorCode | null; values?: Record<string, number | string> };

const optionField = /^d([1-9][0-9]{0,17})$/u;

export async function answerGuest(link: string, _: GuestState, data: FormData): Promise<GuestState> {
  let back: string;
  try {
    // A field people never see: only robots fill it.
    if (String(data.get("website") ?? "") !== "") throw new AppError("invalid");
    await checkForm(data.get("started"));
    const sql = db();
    const h = await headers();
    await admit(sql, h);
    const dates: Record<string, number> = {};
    for (const [key, value] of [...data.entries()].slice(0, 200)) {
      const m = optionField.exec(key);
      if (m) dates[m[1]!] = Number(value);
    }
    const wanted = visitors.language(h);
    const jar = await cookies();
    // The secret of an earlier answer, if this browser keeps one for this
    // poll (the poll's id picks the cookie; the secret is checked against
    // the poll the link opens).
    const pollId = String(data.get("poll") ?? "");
    const secret = /^[1-9][0-9]{0,17}$/u.test(pollId) ? jar.get(guestCookie(pollId))?.value : undefined;
    const done = await answerAsGuest(sql, link, { name: data.get("name"), email: data.get("email"), dates, locale: isLocale(wanted) ? wanted : defaultLocale, secret }, new Date());
    jar.set(guestCookie(done.poll.id), done.secret, { path: guestCookiePath(link), maxAge: guestCookieDays * 86_400, httpOnly: true, secure: true, sameSite: "lax" });
    back = `/p/${link}?sent=${done.first ? "1" : "2"}`;
  } catch (error) {
    if (error instanceof AppError) return { error: error.code, values: error.values };
    console.error("guest answer not saved", error instanceof Error ? error.name : "error");
    return { error: "unavailable" };
  }
  redirect(back);
}
