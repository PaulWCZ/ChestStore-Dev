"use server";

import * as chest from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as visitors from "@argentic/chest-sdk/visitors";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import { db } from "../lib/db.ts";
import { answer } from "../lib/online.ts";
import { publicWords } from "../lib/session.ts";
import { answeredOnline } from "../lib/tell.ts";

// The public part's one action: a client answers a quote from its link.
// Anyone on the Internet may call it: it holds no member, checks the
// form's guard (Proposal (studio): visitors — a form sent faster than a
// person reads, or not ours, is refused; the Chest counts what a visitor
// does), bounds everything, and touches nothing but the quote the secret
// opens.

export type AnswerState = { error: ErrorCode | null; values: { name: string; reason: string } };

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
      answer: data.get("answer"), name: values.name, agree: data.get("agree"), reason: values.reason, shown: data.get("shown"),
    }, { hash: visitors.visitor(h), userAgent: h.get("user-agent") ?? "", language: locale }, chest.today());
    await answeredOnline(done.full, done.answer);
  } catch (error) {
    if (error instanceof AppError) return { error: error.code, values };
    console.error("answer not saved", error instanceof Error ? error.name : "error");
    return { error: "unavailable", values };
  }
  redirect(`/q/${secret}?answered=1`);
}
