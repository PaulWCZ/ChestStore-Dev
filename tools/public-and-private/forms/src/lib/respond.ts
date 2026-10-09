import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { submit } from "./answers.ts";
import type { Sql } from "./db.ts";
import type { Form } from "./forms.ts";
import { answered, routed } from "./answered.ts";
import { copyAllowed, copyNotice, sendCopy } from "./mailer.ts";
import { isLanguage, localize } from "../shared/model.ts";
import { sendHooks } from "./hooks.ts";
import { linkOf } from "./linked.ts";
import { putSetting } from "./settings.ts";
import { afterAnswer } from "./tell.ts";
import * as uploads from "./uploads.ts";

// Taking an answer from a respondent's page: the one path shared by the
// public form (a visitor) and the team's form (a member). What the page
// sends: the version answered and the answers (src/actions.ts reads them).
// Refused, it throws the code (AppError): "answers" when some answer does
// not fit (the page ran the same rules first — src/shared/logic.ts — and
// shows each under its question), "closed", "full", "already", a file's…
export async function take(sql: Sql, form: Form, payload: { version: unknown; answers: unknown; hidden?: unknown }, respondent: Member | null, language: string, options: { copyAsked?: boolean } = {}): Promise<{ copy: boolean }> {
  const kind: uploads.Kind = form.audience === "public" ? "public" : "team";
  const { answer, definition } = await submit(sql, {
    form,
    version: payload.version,
    answers: payload.answers,
    hidden: payload.hidden,
    respondent,
    language,
    files: (ref, question) => uploads.accept(kind, form.id, question, ref),
    drop: objects => uploads.remove(objects),
  });
  // Other tools of the Chest (Proposal (studio): events between tools).
  await answered(form, definition, answer);
  // A contact in Clients, a ticket in Support, when the form says so;
  // the form's web addresses (src/lib/hooks.ts).
  const routedTo = await routed(form, definition, answer);
  const hooked = (await sendHooks(sql, form, definition, answer)) > 0;
  // The copy by email (Proposal (studio): mail). Not when Support opened
  // a ticket of it: Support confirms the request itself (its "we received
  // your request" email), and one message must not bring two emails
  // (README, "With the other tools"). Support confirms only when it is
  // linked to receive the request (events.receivers): installed alone,
  // nobody would.
  // - a team form: a notification to the member (never a mail), opening
  //   what they sent;
  // - a public form: to the address typed, only when the visitor ticked
  //   "Email me a copy", holding only the form's own words (never what was
  //   typed: an address anyone can type must not carry anyone's text in
  //   the company's name), at most copyLimits a form an hour and one an
  //   address a day (copyAllowed).
  const supportConfirms = routedTo.includes("forms.request") && (await linkOf("request")) === "linked";
  let copy = false;
  if (form.sendCopy && !form.anonymous && !supportConfirms) {
    const visitor = form.audience === "public";
    if (!visitor && respondent) {
      // The form's title in each language it is written in.
      copy = await copyNotice(respondent.id, l => (isLanguage(l) ? localize(definition, l) : definition).title, answer.id);
    } else if (visitor && options.copyAsked === true && answer.email && (await copyAllowed(sql, form.id, answer.email, answer.id))) {
      // In the language the person read the form in: its second version
      // when it has one in their language.
      const read = isLanguage(language) ? localize(definition, language) : definition;
      const delivery = await sendCopy(answer.email, read, answer.data, language, chest.organization.name, answer.id);
      copy = delivery === "email";
      // What the last email taught, for the pages when the Chest does not
      // answer (lib/linked.ts, mailState): it works, or this Chest has no
      // mail — never one address refused.
      if (delivery !== "none") await putSetting(sql, "mail_works", copy);
    }
  }
  // Where it went, for the answer's page.
  const sent = [...routedTo, ...(hooked ? ["webhooks"] : []), ...(copy ? ["copy"] : [])];
  if (sent.length > 0 && !form.anonymous) await sql`update answers set sent = ${sent} where id = ${answer.id}`;
  await afterAnswer(sql, form.id).catch(() => false);
  return { copy };
}
