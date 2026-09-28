"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import { db } from "../lib/db.ts";
import { admit, checkForm } from "../lib/guard.ts";
import { welcome } from "../lib/mailer.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { publicWords } from "../lib/session.ts";
import { rememberPublicOrigin } from "../lib/settings.ts";
import { choose, confirm, subscribe, unsubscribe } from "../lib/subscribers.ts";

// The public part's actions: anyone on the Internet may call them. They
// hold no member; they check the form's guard, bound everything, and
// answer the same whoever the address belongs to. Each ends on a page
// (redirect), so the forms work without JavaScript.

const failed = (error: unknown): ErrorCode => {
  if (error instanceof AppError) return error.code;
  console.error("public action failed", error instanceof Error ? error.name : "error");
  return "unavailable";
};

export async function subscribeAction(data: FormData): Promise<void> {
  let target = "/subscribe?sent=1";
  try {
    // A field people never see: only robots fill it.
    if (String(data.get("website") ?? "") !== "") throw new AppError("invalid");
    checkForm(data.get("started"));
    const sql = db();
    const h = await headers();
    await admit(sql, new Headers(h));
    const { locale } = await publicWords();
    const components = data.get("scope") === "some" ? data.getAll("component").map(String) : "all";
    const result = await subscribe(sql, { email: String(data.get("email") ?? "").slice(0, 400), language: locale, components });
    const origin = publicOrigin(h) ?? "";
    await rememberPublicOrigin(sql, origin || null);
    if (result.send) {
      const outcome = await welcome(sql, result.subscriber, result.state, origin);
      if (outcome === "none") {
        // No mail on this Chest: nothing is kept of the address.
        if (result.state !== "confirmed") await sql`delete from subscribers where id = ${result.subscriber.id} and confirmed_at is null`;
        target = "/subscribe?error=no_mail";
      }
    }
  } catch (error) {
    target = `/subscribe?error=${failed(error)}`;
  }
  redirect(target);
}

const tokenOf = (data: FormData) => String(data.get("token") ?? "").replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 64);

export async function confirmAction(data: FormData): Promise<void> {
  const token = tokenOf(data);
  let target = `/s/${token}?done=confirmed`;
  try {
    await confirm(db(), token);
  } catch (error) {
    target = failed(error) === "not_found" ? "/s/unknown" : `/s/${token}?error=unavailable`;
  }
  redirect(target);
}

export async function chooseAction(data: FormData): Promise<void> {
  const token = tokenOf(data);
  let target = `/s/${token}?done=saved`;
  try {
    const components = data.get("scope") === "some" ? data.getAll("component").map(String) : "all";
    await choose(db(), token, components);
  } catch (error) {
    const code = failed(error);
    target = code === "not_found" ? "/s/unknown" : `/s/${token}?error=${code}`;
  }
  redirect(target);
}

export async function unsubscribeAction(data: FormData): Promise<void> {
  const token = tokenOf(data);
  let target = "/unsubscribed";
  try {
    await unsubscribe(db(), token);
  } catch (error) {
    if (failed(error) !== "not_found") target = `/s/${token}?error=unavailable`;
  }
  redirect(target);
}
