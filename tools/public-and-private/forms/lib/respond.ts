import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { AppError, type ErrorCode } from "./app-error.ts";
import { submit } from "./answers.ts";
import type { Sql } from "./db.ts";
import { attempt } from "./errors.ts";
import type { Form } from "./forms.ts";
import type { AnswerError } from "./logic.ts";
import { sendCopy } from "./mailer.ts";
import { afterAnswer } from "./tell.ts";
import * as uploads from "./uploads.ts";

// Taking an answer from a respondent's page: the one path shared by the
// public form (a visitor) and the team's form (a member). The payload is
// the page's JSON: the form's address, the version answered, the answers
// and — on the public page — the form's signed token.
export type Taken = { ok: true; copy: boolean } | { ok: false; error: ErrorCode; fields?: Record<string, AnswerError> };

export function readPayload(text: unknown): { slug: string; version: unknown; answers: unknown; token: unknown } {
  if (typeof text !== "string" || text.length > 200 * 1024) throw new AppError("too_long", { max: 200 * 1024 });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AppError("invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid");
  const v = value as Record<string, unknown>;
  return { slug: typeof v["slug"] === "string" ? v["slug"] : "", version: v["version"], answers: v["answers"], token: v["token"] };
}

export async function take(sql: Sql, form: Form, payload: { version: unknown; answers: unknown }, respondent: Member | null, language: string): Promise<Taken> {
  const kind: uploads.Kind = form.audience === "public" ? "public" : "team";
  const result = await attempt(async () => {
    const { answer, definition } = await submit(sql, {
      form,
      version: payload.version,
      answers: payload.answers,
      respondent,
      language,
      files: (ref, question) => uploads.accept(kind, form.id, question, ref),
      drop: objects => uploads.remove(objects),
    });
    // The copy by email (Proposal (studio): mail): to the address given in
    // the answer, or — on a team form — to the member, without the tool
    // knowing their address.
    let copy = false;
    if (form.sendCopy && !form.anonymous) {
      const to = form.audience === "team" && respondent ? { member: respondent.id } : answer.email;
      if (to) copy = (await sendCopy(to, definition, answer.data, language, chest.company(), answer.id)) === "email";
    }
    await afterAnswer(sql, form.id).catch(() => false);
    return copy;
  });
  if (result.ok) return { ok: true, copy: result.value };
  return { ok: false, error: result.error, ...(result.error === "answers" ? { fields: (result.values ?? {}) as Record<string, AnswerError> } : {}) };
}
