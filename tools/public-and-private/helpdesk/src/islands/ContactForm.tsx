import { call, fill, Honeypot, send } from "@argentic/chest-app/client";
import { useState, type FormEvent } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../components/attachments.tsx";
import type { Catalogue } from "../i18n/index.ts";

type Words = { public: Catalogue["public"]; errors: Catalogue["errors"]; files: Catalogue["kit"]["files"] };
type Code = keyof Catalogue["errors"];
const limits = { name: 120, email: 254, subject: 200, message: 10000 };

// The form a customer fills, with files if they want (a photo of the
// damage) — unless this Chest takes no visitors' files (filesOn: false, or
// its first refusal): then a plain line says so. What they wrote and added
// stays if something is wrong: nothing is lost. Sent, the request's page
// opens (the action's redirect). <Honeypot /> carries the page's form
// token (the package's guard: a correction sent again is never taken for
// a robot) and the field only robots fill. Without JavaScript the same
// form is posted; a refusal comes back in the address (error).
export function ContactForm({ filesOn, locale, embed, error: given, t }: { filesOn: boolean; locale: string; embed: boolean; error: string | null; t: Words }) {
  const [refusal, setRefusal] = useState<{ code: Code | null; message: string } | null>(given ? { code: given as Code, message: fill(t.errors[given as Code], { max: limits.message }) } : null);
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [takesFiles, setTakesFiles] = useState(filesOn);
  const w = t.public;
  const waiting = filesPending(files);
  const code = refusal?.code ?? null;
  const invalid = (field: string) => (code === "invalid_email" && field === "email") || (code === "empty" && field === "message");
  // A wrong address is said under its field (on a phone, where the eye is),
  // the field marked; any other trouble above the button.
  const atEmail = code === "invalid_email";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || waiting) return;
    const data = new FormData(event.currentTarget);
    data.set("files", JSON.stringify(readyFiles(files)));
    setPending(true);
    const done = await send(event.currentTarget.action, {}, data, { quiet: true });
    // Sent: the action's redirect opens the request's page.
    if (done.ok) return;
    setPending(false);
    setRefusal({ code: done.error as Code, message: done.message });
    if (done.error === "invalid_email") document.getElementById("email")?.focus();
  }
  return (
    <form method="post" action="/actions/sendRequest" className="stack" onSubmit={event => void submit(event)}>
      <input type="hidden" name="lang" value={locale} />
      {embed && <input type="hidden" name="embed" value="1" />}
      <Honeypot />
      <div className="two">
        <div>
          <label className="label" htmlFor="name">{w.name}</label>
          <input id="name" name="name" className="field" autoComplete="name" maxLength={limits.name} />
        </div>
        <div>
          <label className="label" htmlFor="email">{w.email}</label>
          <input id="email" name="email" type="email" className="field" autoComplete="email" required maxLength={limits.email} aria-invalid={invalid("email") || undefined} aria-describedby={atEmail ? "email-error email-hint" : "email-hint"} />
          {/* Under its own field, whatever the width. */}
          <p id="email-hint" className="hint under">{w.emailHint}</p>
          {atEmail && refusal && <p className="error" id="email-error" role="alert">{refusal.message}</p>}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="subject">{w.subject}</label>
        <input id="subject" name="subject" className="field" required maxLength={limits.subject} placeholder={w.subjectPlaceholder} />
      </div>
      <div>
        <label className="label" htmlFor="message">{w.message}</label>
        <textarea id="message" name="message" className="field" required rows={7} maxLength={limits.message} placeholder={w.messagePlaceholder} aria-invalid={invalid("message") || undefined} />
      </div>
      {takesFiles ? (
        <Attachments files={files} setFiles={setFiles} kind="public" label={w.attach} plainTypes={w.typesPlain} t={{ files: t.files, errors: t.errors }}
          grant={async (type, size) => {
            const up = await call("visitorUpload", { secret: "", type, size }, { quiet: true, refresh: false });
            if (!up.ok && up.error === "files_off") setTakesFiles(false);
            return up.ok ? { ok: true, url: up.value.url } : { ok: false, message: up.message };
          }} />
      ) : <p className="hint">{t.errors.files_off}</p>}
      {refusal && !atEmail && <p className="error" role="alert">{refusal.message}</p>}
      <div><button type="submit" className="button" disabled={pending || waiting} aria-busy={pending} title={waiting ? t.files.wait : undefined}>{pending ? w.sending : w.send}</button></div>
    </form>
  );
}
