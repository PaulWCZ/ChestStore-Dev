"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import * as candidates from "../lib/candidates.ts";
import * as cv from "../lib/cv.ts";
import { db } from "../lib/db.ts";
import { admit, checkForm } from "../lib/guard.ts";
import { settings } from "../lib/jobs.ts";
import * as mailer from "../lib/mailer.ts";
import * as messages from "../lib/messages.ts";
import * as outbox from "../lib/outbox.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { publicWords } from "../lib/session.ts";
import * as tell from "../lib/tell.ts";
import * as interviews from "../lib/interviews.ts";
import { meetingTime } from "../lib/i18n/format.ts";
import { people as peopleOf } from "../lib/people.ts";
import * as selfSchedule from "../lib/self-schedule.ts";
import * as chest from "@argentic/chest-sdk/chest";

// The careers page's action: anyone on the Internet may call it. It holds
// no member; it checks the form's guard, bounds everything, and reveals
// nothing but "received".

export type FormState = { error: ErrorCode | null };

// The answers to the job's questions: fields named answer:<question id>.
function answersOf(data: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of data.entries()) if (key.startsWith("answer:") && typeof value === "string" && key.length <= 30) out[key.slice(7)] = value.slice(0, 2000);
  return out;
}

export async function sendApplication(_: FormState, data: FormData): Promise<FormState> {
  const text = (key: string, max = 12000) => String(data.get(key) ?? "").slice(0, max);
  let slug: string;
  let mailed = false;
  try {
    // A field people never see: only robots fill it.
    if (text("website") !== "") throw new AppError("invalid");
    checkForm(data.get("started"));
    const sql = db();
    const h = await headers();
    await admit(sql, h, "apply");
    slug = text("slug", 100);
    await candidates.openJob(sql, slug);
    const ticket = text("cv", 300);
    const file = ticket ? await cv.accept(ticket, "public", text("cvName", 300)) : null;
    const { locale } = await publicWords();
    const { candidate, job } = await candidates.apply(sql, {
      slug, name: text("name"), email: text("email"), phone: text("phone"), link: text("link"), coverLetter: text("coverLetter"),
      pool: data.get("pool") === "yes", answers: answersOf(data), language: locale, cv: file,
    }).catch(async error => {
      if (file) await cv.remove([file.object]);
      throw error;
    });
    // The confirmation leaves from the jobs mailbox with the candidate's
    // thread address: if they answer it, their answer lands in their
    // history.
    const s = await settings(sql);
    const words = mailer.confirmation(candidate, job, s.companyName, publicOrigin(h));
    const message = await messages.queueConfirmation(sql, candidate.id, words.subject, words.text);
    mailed = (await outbox.sendNow(sql, message)) === "sent";
    await tell.applied(candidate, job);
    await tell.refreshBadges(sql);
  } catch (error) {
    if (error instanceof AppError) return { error: error.code };
    console.error("application not saved", error instanceof Error ? error.name + ": " + error.message : "error");
    return { error: "unavailable" };
  }
  redirect(`/${slug}/thanks${mailed ? "?mailed=1" : ""}`);
}

// A candidate chooses their interview time, from the link they received
// (/interview/<token>): the token is the only key. Says ok, or a code the
// page puts in words ("taken": the times are read again).
export async function chooseInterviewTime(token: string, day: string, time: string): Promise<{ ok: true } | { ok: false; error: ErrorCode }> {
  try {
    const sql = db();
    await admit(sql, await headers(), "apply");
    const done = await selfSchedule.choose(sql, token, { day, time }, async id => {
      const person = (await peopleOf([id])).get(id);
      return person && person.status === "member" ? { name: person.name, firstName: person.name.split(/\s+/u)[0] ?? person.name } : { name: "" };
    });
    await outbox.sendNow(sql, done.message);
    await interviews.flushCalendars(sql);
    const zone = chest.timeZone();
    await tell.chosen([...new Set([...done.request.people, done.request.createdBy])].filter(id => id.startsWith("mbr_")), done.candidate, done.interview, (start, locale) => meetingTime(start, zone, locale === "fr" ? "fr" : "en"));
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code };
    console.error("interview time not saved", error instanceof Error ? error.name + ": " + error.message : "error");
    return { ok: false, error: "unavailable" };
  }
}
