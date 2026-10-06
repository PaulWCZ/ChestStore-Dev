import type { Catalogue } from "../i18n/index.ts";

// EXAMPLE (Notes). The public page, /: a visitor writes to the team. Served
// only when chest.json says "public": true; otherwise the Chest never
// routes here.
export function Contact({ t, sent }: { t: Catalogue; sent: boolean }) {
  return (
    <div className="narrow">
      <h1>{t.contact.title}</h1>
      <p>{t.contact.intro}</p>
      {sent && <p className="sent" role="status">{t.contact.sent}</p>}
      <form method="post" action="/actions/sendMessage" className="composer">
        <label className="ck-label" htmlFor="body">{t.contact.label}</label>
        <textarea id="body" name="body" className="ck-field" required maxLength={1000} rows={5} />
        {/* Only robots fill it: hidden from people and their readers. */}
        <input className="trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <button className="ck-button">{t.contact.send}</button>
      </form>
    </div>
  );
}
