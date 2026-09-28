import type { Metadata } from "next";
import { Back } from "../../components/icons.tsx";
import { PublicShell } from "../../components/public-shell.tsx";
import { publicContext } from "../../lib/public-page.ts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await publicContext();
  return { title: t.subscriber.goneTitle, robots: { index: false, follow: false } };
}

// After unsubscribing: the address is gone, and the page says so.
export default async function Unsubscribed() {
  const { t, locale, zone, company, offerMail } = await publicContext();
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path="/unsubscribed" offerMail={offerMail}>
      <p className="crumb"><a href="/"><Back />{t.subscribe.backToStatus}</a></p>
      <section className="card narrow">
        <h1>{t.subscriber.goneTitle}</h1>
        <p>{t.subscriber.goneBody}</p>
      </section>
    </PublicShell>
  );
}
