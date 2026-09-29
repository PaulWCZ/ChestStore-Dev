"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { format, languageNames } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { createTicket } from "../actions.ts";

export function NewTicket({ locale, t }: { locale: string; t: { create: Catalogue["create"]; errors: Catalogue["errors"] } }) {
  const w = t.create;
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; link: string } | null>(null);
  const [pending, start] = useTransition();
  if (done) {
    return (
      <div className="success">
        <p className="copy-line"><span>{w.link}</span><code>{done.link}</code></p>
        <div className="row"><Link className="button" href={`/chest/tickets/${done.number}`}>#{done.number}</Link></div>
      </div>
    );
  }
  return (
    <form className="box" action={data => {
      setError(null);
      start(async () => {
        const r = await createTicket({ name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), subject: String(data.get("subject") ?? ""), message: String(data.get("message") ?? ""), language: String(data.get("language") ?? locale) });
        if (!r.ok) return setError(format(t.errors[r.error], r.values ?? { max: 20000 }));
        setDone(r.value);
      });
    }}>
      <div className="two">
        <div><label className="label" htmlFor="email">{w.email}</label><input id="email" name="email" type="email" className="field" required maxLength={254} /></div>
        <div><label className="label" htmlFor="name">{w.name}</label><input id="name" name="name" className="field" maxLength={120} /></div>
      </div>
      <div><label className="label" htmlFor="subject">{w.subject}</label><input id="subject" name="subject" className="field" required maxLength={200} /></div>
      <div><label className="label" htmlFor="message">{w.message}</label><textarea id="message" name="message" className="field" rows={6} required maxLength={20000} /></div>
      <div>
        <label className="label" htmlFor="language">{w.language}</label>
        <select id="language" name="language" className="select medium" defaultValue={locale}>
          {Object.entries(languageNames).map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div><button type="submit" className="button" disabled={pending}>{w.submit}</button></div>
    </form>
  );
}
