"use server";

import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import { db } from "../lib/db.ts";
import { format } from "../lib/i18n/index.ts";
import { formatMoney } from "../lib/money.ts";
import { answer, openLink } from "../lib/online.ts";
import { changesSince } from "../lib/versions.ts";
import { publicWords } from "../lib/session.ts";
import { answeredOnline } from "../lib/tell.ts";

// The public part's one action: a client answers a quote from its link.
// Anyone on the Internet may call it: it holds no member, checks the
// form's guard (Proposal (studio): visitors — a form sent faster than a
// person reads, or not ours, is refused; the Chest counts what a visitor
// does), bounds everything, and touches nothing but the quote the secret
// opens.

// `changes`: when the quote changed while the client read it, what is
// different now, in their words (null when it cannot be told); the page is
// drawn again with the quote as it is.
export type AnswerState = { error: ErrorCode | null; values: { name: string; reason: string }; changes?: string[] | null };

const limits = { minimumSeconds: 3, perVisitorHour: 20, perHour: 600 } as const;

export async function answerQuote(secret: string, _: AnswerState, data: FormData): Promise<AnswerState> {
  const values = { name: String(data.get("name") ?? "").slice(0, 400), reason: String(data.get("reason") ?? "").slice(0, 4000) };
  try {
    // A field people never see: only robots fill it.
    if (String(data.get("website") ?? "") !== "") throw new AppError("invalid");
    const verdict = visitors.checkForm(data.get("started"), { minimumSeconds: limits.minimumSeconds });
    if (verdict === "invalid") throw new AppError("changed");
    if (verdict === "too_fast") throw new AppError("too_fast");
    const h = await headers();
    try {
      const { allowed } = await visitors.count(h, "answer", { perVisitor: limits.perVisitorHour, perHour: limits.perHour });
      if (!allowed) throw new AppError("too_many_tries");
    } catch (error) {
      // A Chest that cannot count yet: each link answers once anyway.
      if (!(error instanceof ChestError)) throw error;
    }
    const { locale } = await publicWords();
    const done = await answer(db(), String(secret), {
      answer: data.get("answer"), name: values.name, agree: data.get("agree"), reason: values.reason, shown: data.get("shown"), terms: data.get("terms") ?? "",
    }, { hash: visitors.visitor(h), userAgent: h.get("user-agent") ?? "", language: locale }, chest.today());
    await answeredOnline(done.full, done.answer);
  } catch (error) {
    if (error instanceof AppError && error.code === "changed") {
      revalidatePath(`/q/${secret}`);
      return { error: error.code, values, changes: await whatChanged(String(secret), data.get("shown")).catch(() => null) };
    }
    if (error instanceof AppError) return { error: error.code, values };
    console.error("answer not saved", error instanceof Error ? error.name : "error");
    return { error: "unavailable", values };
  }
  redirect(`/q/${secret}?answered=1`);
}

// whatChanged: the differences between the version the client read (the
// PDF fingerprint their form carried) and the quote now, as sentences in
// the visitor's language, amounts in the quote's currency.
async function whatChanged(secret: string, shown: unknown): Promise<string[] | null> {
  const sql = db();
  const opened = await openLink(sql, secret, chest.today());
  if (!opened || opened.showing !== "open") return null;
  const found = await changesSince(sql, opened.full, shown);
  if (!found || found.changes.length === 0) return null;
  const { t, locale } = await publicWords();
  const o = t.online;
  const money = (minor: number) => formatMoney(minor, opened.full.currency, locale);
  return found.changes.map(c => c.kind === "total" ? format(o.changeTotal, { before: money(c.before), after: money(c.after) })
    : c.kind === "changed" ? format(o.changeLine, { description: c.description, before: money(c.before), after: money(c.after) })
    : format(c.kind === "added" ? o.changeAdded : o.changeRemoved, { description: c.description, amount: money(c.amount) }));
}
