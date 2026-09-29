"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../../../components/attachments.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { fileUpload, writeAgain, type ReplyState } from "../../public-actions.ts";

// Writing again from the follow-up link, with files: they can be added
// only to this request (the link is what allows the upload).
export function WriteAgain({ secret, t }: { secret: string; t: { public: Catalogue["public"]; errors: Catalogue["errors"]; files: Catalogue["files"] } }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(writeAgain.bind(null, secret), { error: null, sent: false });
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const waiting = filesPending(files);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.sent) {
      form.current?.reset();
      setFiles([]);
      router.refresh();
    }
  }, [state, router]);
  return (
    <form ref={form} action={action} className="stack">
      <label htmlFor="message" className="visually-hidden">{t.public.reply}</label>
      <textarea id="message" name="message" className="field" rows={5} required maxLength={10000} placeholder={t.public.replyPlaceholder} />
      <input type="hidden" name="files" value={readyFiles(files)} />
      <Attachments files={files} setFiles={setFiles} grant={fileUpload.bind(null, { secret })} kind="public" label={t.public.attach} plainTypes={t.public.typesPlain} t={{ files: t.files, errors: t.errors }} />
      {state.error && <p className="error" role="alert">{format(t.errors[state.error], { max: state.max ?? 10000 })}</p>}
      {state.sent && <p role="status" className="muted">{t.public.replied}</p>}
      <div><button type="submit" className="button" disabled={pending || waiting} title={waiting ? t.files.wait : undefined}>{t.public.replySend}</button></div>
    </form>
  );
}
