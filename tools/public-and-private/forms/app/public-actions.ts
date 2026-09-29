"use server";

import * as visitors from "@argentic/chest-sdk/visitors";
import { headers } from "next/headers";
import { AppError } from "../lib/app-error.ts";
import { db } from "../lib/db.ts";
import { bySlug } from "../lib/forms.ts";
import { admit, checkForm } from "../lib/guard.ts";
import { isLanguage, languageFor } from "../lib/model.ts";
import { readPayload, take, type Taken } from "../lib/respond.ts";

// The public forms' one action: anyone on the Internet may call it. It
// holds no member; it checks the form's signed token and the counters
// (Proposal (studio): visitors), then everything the answer holds against
// the version answered (lib/answers.ts). It reveals nothing but "received"
// or why not.
export async function answerPublic(payload: string): Promise<Taken> {
  try {
    const p = readPayload(payload);
    checkForm(p.token);
    const sql = db();
    const h = await headers();
    const found = await bySlug(sql, p.slug);
    if (!found || found.form.audience !== "public") throw new AppError("not_found");
    await admit(sql, h, "answer");
    const wanted = visitors.language(h);
    return await take(sql, found.form, p, null, languageFor(found.definition, isLanguage(wanted) ? wanted : "en"));
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code };
    console.error("answer not saved", error instanceof Error ? error.name + ": " + error.message : "error");
    return { ok: false, error: "unavailable" };
  }
}
