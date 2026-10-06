import { call, Honeypot, send } from "@argentic/chest-app/client";
import { useRef, useState, type FormEvent } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../components/attachments.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Writing again from the follow-up link, with files: they can be added
// only to this request (the link is what allows the upload). Sent, the
// box empties and the conversation shows it; refused, the text stays.
export function WriteAgain({ secret, filesOn, t }: { secret: string; filesOn: boolean; t: { public: Catalogue["public"]; errors: Catalogue["errors"]; files: Catalogue["kit"]["files"] } }) {
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [takesFiles, setTakesFiles] = useState(filesOn);
  const form = useRef<HTMLFormElement>(null);
  const waiting = filesPending(files);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || waiting) return;
    const data = new FormData(event.currentTarget);
    data.set("files", JSON.stringify(readyFiles(files)));
    setPending(true);
    setSent(false);
    const done = await send(event.currentTarget.action, {}, data, { quiet: true });
    setPending(false);
    if (!done.ok) return setError(done.message);
    setError(null);
    setSent(true);
    form.current?.reset();
    setFiles([]);
  }
  return (
    <form ref={form} method="post" action="/actions/writeAgain" className="stack" onSubmit={event => void submit(event)}>
      <input type="hidden" name="secret" value={secret} />
      <Honeypot />
      <label htmlFor="message" className="visually-hidden">{t.public.reply}</label>
      <textarea id="message" name="message" className="field" rows={5} required maxLength={10000} placeholder={t.public.replyPlaceholder} />
      {takesFiles ? (
        <Attachments files={files} setFiles={setFiles} kind="public" label={t.public.attach} plainTypes={t.public.typesPlain} t={{ files: t.files, errors: t.errors }}
          grant={async (type, size) => {
            const up = await call("visitorUpload", { secret, type, size }, { quiet: true, refresh: false });
            if (!up.ok && up.error === "files_off") setTakesFiles(false);
            return up.ok ? { ok: true, url: up.value.url } : { ok: false, message: up.message };
          }} />
      ) : <p className="hint">{t.errors.files_off}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {sent && <p role="status" className="muted">{t.public.replied}</p>}
      <div><button type="submit" className="button" disabled={pending || waiting} aria-busy={pending} title={waiting ? t.files.wait : undefined}>{t.public.replySend}</button></div>
    </form>
  );
}
