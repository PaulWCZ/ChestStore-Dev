import { call } from "@argentic/chest-app/client";
import { useState, type FormEvent } from "react";
import type { Catalogue } from "../i18n/index.ts";

// The form of a new ticket: who called, what they asked, in which
// language they want the answers. Made, the customer's follow-up link is
// shown (to read out or send), and the ticket one click away.
export function NewTicket({ locale, languages, t }: { locale: string; languages: { code: string; name: string }[]; t: Catalogue["create"] }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; link: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    setError(null);
    setPending(true);
    const r = await call("createTicket", { name: value("name"), email: value("email"), subject: value("subject"), message: value("message"), language: value("language") || locale }, { quiet: true, refresh: false });
    setPending(false);
    if (!r.ok) return setError(r.message);
    setDone(r.value);
  }
  if (done) {
    return (
      <div className="success">
        <p className="copy-line"><span>{t.link}</span><code>{done.link}</code></p>
        <div className="row"><a className="button" href={`/chest/tickets/${done.number}`}>#{done.number}</a></div>
      </div>
    );
  }
  return (
    <form className="box" method="post" action="/chest/actions/createTicket" onSubmit={event => void create(event)}>
      <div className="two">
        <div><label className="label" htmlFor="email">{t.email}</label><input id="email" name="email" type="email" className="field" required maxLength={254} /></div>
        <div><label className="label" htmlFor="name">{t.name}</label><input id="name" name="name" className="field" maxLength={120} /></div>
      </div>
      <div><label className="label" htmlFor="subject">{t.subject}</label><input id="subject" name="subject" className="field" required maxLength={200} /></div>
      <div><label className="label" htmlFor="message">{t.message}</label><textarea id="message" name="message" className="field" rows={6} required maxLength={20000} /></div>
      <div>
        <label className="label" htmlFor="language">{t.language}</label>
        <select id="language" name="language" className="select medium" defaultValue={locale}>
          {languages.map(({ code, name }) => <option key={code} value={code} lang={code}>{name}</option>)}
        </select>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div><button type="submit" className="button" disabled={pending}>{t.submit}</button></div>
    </form>
  );
}
