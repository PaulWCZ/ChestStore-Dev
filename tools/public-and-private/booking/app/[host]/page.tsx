import { notFound } from "next/navigation";
import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import { Arrow, Back, Clock, kindIcon } from "../../components/icons.tsx";
import { PublicShell } from "../../components/public-shell.tsx";
import { publicHost, settings } from "../../lib/booking.ts";
import { db } from "../../lib/db.ts";
import { format, plural } from "../../lib/i18n/index.ts";
import { people } from "../../lib/people.ts";
import { publicWords } from "../../lib/session.ts";

// A host's page: who they are, and the kinds of meeting to book with them.
export default async function HostPage({ params }: { params: Promise<{ host: string }> }) {
  const { host: slug } = await params;
  const { t, locale } = await publicWords();
  const sql = db();
  const found = await publicHost(sql, slug);
  const person = found ? (await people([found.host.memberId])).get(found.host.memberId) : undefined;
  if (!found || person?.status !== "member") notFound();
  const s = await settings(sql);
  const { host, types } = found;
  return (
    <PublicShell company={s.companyName} locale={locale} label={t.public.language} back={`/${host.slug}`}>
      {host.listed && <a className="back" href="/"><Back />{t.public.back}</a>}
      <section className="host-head">
        <Avatar name={person.name} photo={null} size="xl" className="host-portrait" />
        <h1>{person.name}</h1>
        {host.welcome && <p className="welcome">{host.welcome}</p>}
        {types.length > 0 && <p className="muted">{t.public.pickType}</p>}
      </section>
      {types.length === 0 ? <EmptyState title={format(t.public.noTypes, { name: person.firstName || person.name })} /> : (
        <ul className="offers">
          {types.map(ty => {
            const Kind = kindIcon[ty.locationKind];
            return (
              <li key={ty.id}>
                <a className="offer" href={`/${host.slug}/${ty.slug}`} style={{ "--type": `var(--c-${ty.color})` } as React.CSSProperties}>
                  <span>
                    <strong>{ty.title}</strong>
                    <span className="meta"><span><Clock />{plural(t.minutes, ty.duration, locale)}</span><span><Kind />{t.kinds[ty.locationKind]}</span></span>
                  </span>
                  <span className="go"><Arrow /></span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </PublicShell>
  );
}
