import { headers } from "next/headers";
import { PublicShell } from "../components/public-shell.tsx";
import { db } from "../lib/db.ts";
import { issue } from "../lib/form-token.ts";
import { format } from "../lib/i18n/index.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { publicWords } from "../lib/session.ts";
import { rememberPublicOrigin, settings } from "../lib/tickets.ts";
import { ContactForm } from "./contact-form.tsx";

// The public contact form: the company's name, one sentence, the form.
export default async function Contact() {
  const { t, locale } = await publicWords();
  const sql = db();
  await rememberPublicOrigin(sql, publicOrigin(await headers()));
  const s = await settings(sql);
  const company = s.companyName || t.public.teamPlain;
  return (
    <PublicShell company={company} locale={locale} label={t.public.language} back="/" foot={format(t.public.privacy, { company })}>
      <div className="stack">
        <h1>{s.companyName ? format(t.public.titleWith, { company: s.companyName }) : t.public.title}</h1>
        <p className="muted">{s.intro || t.public.intro}</p>
      </div>
      {s.formOpen ? (
        <section className="public-card">
          <ContactForm started={issue()} t={{ public: t.public, errors: t.errors }} />
        </section>
      ) : <p className="notice">{t.public.closed}</p>}
    </PublicShell>
  );
}
