import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import { Arrow } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import type { VisitorContext } from "../core/tool.ts";
import { format, plural } from "../i18n/index.ts";
import { listedHosts, settings } from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { nameOf, people } from "../lib/people.ts";
import { sheetOf } from "../theme.ts";
import { PublicShell } from "./PublicShell.tsx";

// The company's booking page (/): the people who take bookings, one card each.
export async function companyPage({ t, locale }: PageContext<VisitorContext>): Promise<View> {
  const sql = db();
  const [s, hosts, sheet] = await Promise.all([settings(sql), listedHosts(sql), sheetOf("public")]);
  const who = await people(hosts.map(h => h.memberId));
  const shown = hosts.filter(h => who.get(h.memberId)?.status === "member");
  const title = s.companyName ? format(t.public.bookWith, { company: s.companyName }) : t.public.bookPlain;
  return {
    title,
    body: (
      <PublicShell look={sheet.look} company={s.companyName} locale={locale} label={t.public.language} back="/">
        <section className="hero">
          <h1>{title}</h1>
          {shown.length > 0 && <p>{t.public.pickPerson}</p>}
        </section>
        {shown.length === 0 ? <EmptyState title={t.public.nobody} /> : (
          <ul className="hosts">
            {shown.map(h => {
              const name = nameOf(who.get(h.memberId), locale);
              return (
                <li key={h.memberId}>
                  <a className="host-card" href={`/${h.slug}`}>
                    <Avatar name={name} photo={null} size="l" className="host-avatar" />
                    <span className="grow">
                      <strong>{name}</strong>
                      <span className="muted">{plural(t.public.options, h.types, locale)}</span>
                    </span>
                    <span className="go"><Arrow /></span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </PublicShell>
    ),
  };
}
