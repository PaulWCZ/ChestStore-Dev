"use client";

import { useActionState, useState } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../components/attachments.tsx";
import { format } from "../lib/i18n/format.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { fileUpload, sendRequest, type FormState } from "./public-actions.ts";

type Words = { public: Catalogue["public"]; errors: Catalogue["errors"]; files: Catalogue["files"] };
const limits = { name: 120, email: 254, subject: 200, message: 10000 };

// The form a customer fills, with files if they want (a photo of the
// damage). What they wrote and added comes back if something is wrong:
// nothing is lost. The time the form was first shown is kept across those
// corrections (a refresh of the page would renew it): a person who fixes
// one field and sends again is never taken for a robot.
export function ContactForm({ started: shown, locale, embed, t }: { started: string; locale: string; embed: boolean; t: Words }) {
  const [started] = useState(shown);
  const [state, action, pending] = useActionState<FormState, FormData>(sendRequest, { error: null, values: {} });
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const v = state.values;
  const w = t.public;
  const error = state.error ? format(t.errors[state.error], { max: state.max ?? (state.error === "too_long" ? limits.message : 0) }) : null;
  const waiting = filesPending(files);
  const invalid = (field: string) => (state.error === "invalid_email" && field === "email") || (state.error === "empty" && field === "message");
  return (
    <form action={action} className="stack" noValidate={false}>
      <input type="hidden" name="started" value={started} />
      <input type="hidden" name="lang" value={locale} />
      {embed && <input type="hidden" name="embed" value="1" />}
      <div className="honey" aria-hidden="true">
        <label htmlFor="website">{w.website}</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="two">
        <div>
          <label className="label" htmlFor="name">{w.name}</label>
          <input id="name" name="name" className="field" autoComplete="name" maxLength={limits.name} defaultValue={v["name"] ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="email">{w.email}</label>
          <input id="email" name="email" type="email" className="field" autoComplete="email" required maxLength={limits.email} defaultValue={v["email"] ?? ""} aria-invalid={invalid("email") || undefined} aria-describedby="email-hint" />
        </div>
      </div>
      <p id="email-hint" className="hint email-hint">{w.emailHint}</p>
      <div>
        <label className="label" htmlFor="subject">{w.subject}</label>
        <input id="subject" name="subject" className="field" required maxLength={limits.subject} placeholder={w.subjectPlaceholder} defaultValue={v["subject"] ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="message">{w.message}</label>
        <textarea id="message" name="message" className="field" required rows={7} maxLength={limits.message} placeholder={w.messagePlaceholder} defaultValue={v["message"] ?? ""} aria-invalid={invalid("message") || undefined} />
      </div>
      <input type="hidden" name="files" value={readyFiles(files)} />
      <Attachments files={files} setFiles={setFiles} grant={fileUpload.bind(null, { started })} kind="public" label={t.public.attach} t={{ files: t.files, errors: t.errors }} />
      {error && <p className="error" role="alert">{error}</p>}
      <div><button type="submit" className="button" disabled={pending || waiting} title={waiting ? t.files.wait : undefined}>{pending ? w.sending : w.send}</button></div>
    </form>
  );
}
