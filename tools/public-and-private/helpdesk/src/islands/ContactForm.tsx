import { call, fill } from "@argentic/chest-app/client";
import { useState, type FormEvent } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../components/attachments.tsx";
import type { Catalogue } from "../i18n/index.ts";

type Words = { public: Catalogue["public"]; errors: Catalogue["errors"]; files: Catalogue["kit"]["files"] };
type Code = keyof Catalogue["errors"];
const limits = { name: 120, email: 254, subject: 200, message: 10000 };

// The form a customer fills, with files if they want (a photo of the
// damage). What they wrote and added stays if something is wrong: nothing
// is lost. The time the form was first shown (started, signed) is kept
// across those corrections: a person who fixes one field and sends again
// is never taken for a robot. Sent, the page of their request opens (the
// action's redirect). Without JavaScript the same form is posted; a
// refusal comes back in the address (error).
export function ContactForm({ started, locale, embed, error: given, t }: { started: string; locale: string; embed: boolean; error: string | null; t: Words }) {
  const [refusal, setRefusal] = useState<{ code: Code | null; message: string } | null>(given ? { code: given as Code, message: fill(t.errors[given as Code], { max: limits.message }) } : null);
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const w = t.public;
  const waiting = filesPending(files);
  const code = refusal?.code ?? null;
  const invalid = (field: string) => (code === "invalid_email" && field === "email") || (code === "empty" && field === "message");
  // A wrong address is said under its field (on a phone, where the eye is),
  // the field marked; any other trouble above the button.
  const atEmail = code === "invalid_email";
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || waiting) return;
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    setPending(true);
    const done = await call("sendRequest", { name: value("name"), email: value("email"), subject: value("subject"), message: value("message"), started, lang: locale, embed: embed ? "1" : "", website: value("website"), files: readyFiles(files) }, { quiet: true });
    // Sent: the action's redirect opens the request's page.
    if (done.ok) return;
    setPending(false);
    setRefusal({ code: done.error as Code, message: done.message });
    if (done.error === "invalid_email") document.getElementById("email")?.focus();
  }
  return (
    <form method="post" action="/actions/sendRequest" className="stack" onSubmit={event => void send(event)}>
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
          <input id="name" name="name" className="field" autoComplete="name" maxLength={limits.name} />
        </div>
        <div>
          <label className="label" htmlFor="email">{w.email}</label>
          <input id="email" name="email" type="email" className="field" autoComplete="email" required maxLength={limits.email} aria-invalid={invalid("email") || undefined} aria-describedby={atEmail ? "email-error email-hint" : "email-hint"} />
          {atEmail && refusal && <p className="error" id="email-error" role="alert">{refusal.message}</p>}
        </div>
      </div>
      <p id="email-hint" className="hint email-hint">{w.emailHint}</p>
      <div>
        <label className="label" htmlFor="subject">{w.subject}</label>
        <input id="subject" name="subject" className="field" required maxLength={limits.subject} placeholder={w.subjectPlaceholder} />
      </div>
      <div>
        <label className="label" htmlFor="message">{w.message}</label>
        <textarea id="message" name="message" className="field" required rows={7} maxLength={limits.message} placeholder={w.messagePlaceholder} aria-invalid={invalid("message") || undefined} />
      </div>
      <Attachments files={files} setFiles={setFiles} kind="public" label={w.attach} plainTypes={w.typesPlain} t={{ files: t.files, errors: t.errors }}
        grant={async (type, size) => {
          const up = await call("visitorUpload", { started, secret: "", type, size }, { quiet: true, refresh: false });
          return up.ok ? { ok: true, url: up.value.url } : { ok: false, message: up.message };
        }} />
      {refusal && !atEmail && <p className="error" role="alert">{refusal.message}</p>}
      <div><button type="submit" className="button" disabled={pending || waiting} aria-busy={pending} title={waiting ? t.files.wait : undefined}>{pending ? w.sending : w.send}</button></div>
    </form>
  );
}
