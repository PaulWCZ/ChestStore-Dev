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
import { publicOrigin } from "../lib/public-origin.ts";
import { publicWords } from "../lib/session.ts";
import * as tell from "../lib/tell.ts";

// The careers page's action: anyone on the Internet may call it. It holds
// no member; it checks the form's guard, bounds everything, and reveals
// nothing but "received".

export type FormState = { error: ErrorCode | null };

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
      consent: data.get("consent") === "yes", language: locale, cv: file,
    }).catch(async error => {
      if (file) await cv.remove([file.object]);
      throw error;
    });
    const s = await settings(sql);
    const sent = await mailer.confirm(candidate, job, s.companyName, publicOrigin(h));
    if (sent === "email") {
      mailed = true;
      await candidates.emailed(sql, candidate.id, null, "confirmation");
    }
    await tell.applied(candidate, job);
    await tell.refreshBadges(sql);
  } catch (error) {
    if (error instanceof AppError) return { error: error.code };
    console.error("application not saved", error instanceof Error ? error.name + ": " + error.message : "error");
    return { error: "unavailable" };
  }
  redirect(`/${slug}/thanks${mailed ? "?mailed=1" : ""}`);
}
