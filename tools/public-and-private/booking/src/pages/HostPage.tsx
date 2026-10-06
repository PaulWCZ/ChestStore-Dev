import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import { Arrow, Back, Clock, kindIcon } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { notFound, type VisitorContext } from "../core/tool.ts";
import { format, plural } from "../i18n/index.ts";
import { publicHost, settings } from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { people } from "../lib/people.ts";
import { hostWords } from "../lib/session.ts";
import { localizeType, localizeWelcome } from "../lib/texts.ts";
import { sheetOf } from "../theme.ts";
import { PublicShell } from "./PublicShell.tsx";

// A host's page (/<host>): who they are, and the kinds of meeting to book
// with them, in one language — the host's texts and the tool's words.
export async function hostPage({ locale: wanted, param }: PageContext<VisitorContext>): Promise<View> {
  const sql = db();
  const found = await publicHost(sql, param("host"));
  const person = found ? (await people([found.host.memberId])).get(found.host.memberId) : undefined;
  if (!found || person?.status !== "member") return notFound();
  const [s, sheet] = await Promise.all([settings(sql), sheetOf("public")]);
  const { t, locale, languages } = hostWords(found.host, wanted);
  const host = found.host;
  const welcome = localizeWelcome(host, locale);
  const types = found.types.map(ty => localizeType(ty, host, locale));
  return {
    title: person.name,
    body: (
      <PublicShell look={sheet.look} company={s.companyName} locale={locale} languages={languages} label={t.public.language} back={`/${host.slug}`}>
        {host.listed && <a className="back" href="/"><Back />{t.public.back}</a>}
        <section className="host-head">
          <Avatar name={person.name} photo={null} size="xl" className="host-portrait" />
          <h1>{person.name}</h1>
          {welcome && <p className="welcome">{welcome}</p>}
          {types.length > 0 && <p className="muted">{t.public.pickType}</p>}
        </section>
        {types.length === 0 ? <EmptyState title={format(t.public.noTypes, { name: person.firstName || person.name })} /> : (
          <ul className="offers">
            {types.map(ty => {
              const Kind = kindIcon[ty.locationKind];
              return (
                <li key={ty.id}>
                  <a className={`offer type-${ty.color}`} href={`/${host.slug}/${ty.slug}`}>
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
    ),
  };
}
