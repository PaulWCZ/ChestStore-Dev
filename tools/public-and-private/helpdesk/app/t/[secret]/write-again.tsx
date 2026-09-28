"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { writeAgain, type ReplyState } from "../../public-actions.ts";

export function WriteAgain({ secret, t }: { secret: string; t: { public: Catalogue["public"]; errors: Catalogue["errors"] } }) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(writeAgain.bind(null, secret), { error: null, sent: false });
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.sent) {
      form.current?.reset();
      router.refresh();
    }
  }, [state, router]);
  return (
    <form ref={form} action={action} className="stack">
      <label htmlFor="message" className="visually-hidden">{t.public.reply}</label>
      <textarea id="message" name="message" className="field" rows={5} required maxLength={10000} placeholder={t.public.replyPlaceholder} />
      {state.error && <p className="error" role="alert">{format(t.errors[state.error], { max: 10000 })}</p>}
      {state.sent && <p role="status" className="muted">{t.public.replied}</p>}
      <div><button type="submit" className="button" disabled={pending}>{t.public.replySend}</button></div>
    </form>
  );
}
