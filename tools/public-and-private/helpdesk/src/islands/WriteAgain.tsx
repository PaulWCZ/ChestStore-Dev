import { call } from "@argentic/chest-app/client";
import { useRef, useState, type FormEvent } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../components/attachments.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Writing again from the follow-up link, with files: they can be added
// only to this request (the link is what allows the upload). Sent, the
// box empties and the conversation shows it; refused, the text stays.
export function WriteAgain({ secret, t }: { secret: string; t: { public: Catalogue["public"]; errors: Catalogue["errors"]; files: Catalogue["kit"]["files"] } }) {
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const waiting = filesPending(files);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || waiting) return;
    const message = String(new FormData(event.currentTarget).get("message") ?? "");
    setPending(true);
    setSent(false);
    const done = await call("writeAgain", { secret, message, files: readyFiles(files) }, { quiet: true });
    setPending(false);
    if (!done.ok) return setError(done.message);
    setError(null);
    setSent(true);
    form.current?.reset();
    setFiles([]);
  }
  return (
    <form ref={form} method="post" action="/actions/writeAgain" className="stack" onSubmit={event => void send(event)}>
      <input type="hidden" name="secret" value={secret} />
      <label htmlFor="message" className="visually-hidden">{t.public.reply}</label>
      <textarea id="message" name="message" className="field" rows={5} required maxLength={10000} placeholder={t.public.replyPlaceholder} />
      <Attachments files={files} setFiles={setFiles} kind="public" label={t.public.attach} plainTypes={t.public.typesPlain} t={{ files: t.files, errors: t.errors }}
        grant={async (type, size) => {
          const up = await call("visitorUpload", { started: "", secret, type, size }, { quiet: true, refresh: false });
          return up.ok ? { ok: true, url: up.value.url } : { ok: false, message: up.message };
        }} />
      {error && <p className="error" role="alert">{error}</p>}
      {sent && <p role="status" className="muted">{t.public.replied}</p>}
      <div><button type="submit" className="button" disabled={pending || waiting} aria-busy={pending} title={waiting ? t.files.wait : undefined}>{t.public.replySend}</button></div>
    </form>
  );
}
