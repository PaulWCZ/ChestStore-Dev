import { PublicShell } from "../components/public-shell.tsx";
import { company } from "../lib/company.ts";
import { db } from "../lib/db.ts";
import { publicWords } from "../lib/session.ts";

// The public host's root. The public part is only the quotes' own pages
// (/q/<secret>, reached from the link in a quote's email): nothing links
// here, and whoever lands here is told where to go, in their language —
// nothing of the company's documents is shown.
export default async function PublicHome() {
  const { t, locale } = await publicWords();
  const c = await company(db());
  return (
    <PublicShell company={c.tradeName || c.legalName || t.meta.name} locale={locale} label={t.public.language} back="/">
      <div className="answer-state off">
        <h1>{t.public.title}</h1>
        <p className="lead">{t.public.body}</p>
      </div>
    </PublicShell>
  );
}
