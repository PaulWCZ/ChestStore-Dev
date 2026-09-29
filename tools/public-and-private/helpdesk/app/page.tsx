import { headers } from "next/headers";
import { PublicShell } from "../components/public-shell.tsx";
import { db } from "../lib/db.ts";
import { issue } from "../lib/form-token.ts";
import { format } from "../lib/i18n/index.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { publicWords } from "../lib/session.ts";
import { introFor, rememberPublicOrigin, settings } from "../lib/tickets.ts";
import { ContactForm } from "./contact-form.tsx";

// The public contact form: the company's name, one sentence in the
// visitor's language, the help centre first if the company has one, the
// form. ?embed=1: inside the company's website (a frame it allowed).
export default async function Contact({ searchParams }: { searchParams: Promise<{ lang?: string; embed?: string }> }) {
  const search = await searchParams;
  const { t, locale } = await publicWords(search.lang);
  const embed = search.embed === "1";
  const sql = db();
  await rememberPublicOrigin(sql, publicOrigin(await headers()));
  const s = await settings(sql);
  const company = s.companyName || t.public.teamPlain;
  return (
    <PublicShell company={company} locale={locale} label={t.public.language} back={embed ? "/?embed=1" : "/"} foot={format(t.public.privacy, { company })} embed={embed}>
      <div className="stack">
        <h1>{s.companyName ? format(t.public.titleWith, { company: s.companyName }) : t.public.title}</h1>
        <p className="muted">{introFor(s, locale) || t.public.intro}</p>
        {s.helpUrl && <p><a className="help-link" href={s.helpUrl} target={embed ? "_top" : undefined} rel="noopener">{t.public.help}</a></p>}
      </div>
      {s.formOpen ? (
        <section className="public-card">
          <ContactForm started={issue()} locale={locale} embed={embed} t={{ public: t.public, errors: t.errors, files: t.files }} />
        </section>
      ) : <p className="notice">{t.public.closed}</p>}
    </PublicShell>
  );
}
