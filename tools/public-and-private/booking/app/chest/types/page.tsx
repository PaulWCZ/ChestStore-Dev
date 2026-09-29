import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import { CopyButton } from "../../../components/copy-button.tsx";
import { CalendarCheck, Chat, Clock, kindIcon, Pencil, Person, Plus } from "../../../components/icons.tsx";
import * as b from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { myPage } from "../../../lib/my-page.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { TypeSwitch } from "./type-switch.tsx";

// The host's booking types: each a kind of meeting with its own link.
export default async function TypesPage() {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const host = await myPage(v);
  if (!host) return <EmptyState headingLevel={1} title={t.bookings.cannotHostTitle} body={t.bookings.cannotHost} />;
  const types = await b.typesOf(db(), v.member.id);
  const origin = publicOrigin(await headers()) ?? "";
  return (
    <>
      <PageHeader size="m" title={t.types.title} intro={t.types.intro} action={<a className="button" href="/chest/types/new"><Plus />{t.types.new}</a>} />
      {types.length === 0 ? (
        <EmptyState title={t.types.empty} body={t.types.emptyHint} />
      ) : (
        <ul className="types">
          {types.map(ty => {
            const Kind = kindIcon[ty.locationKind];
            const link = `${origin}/${host.slug}/${ty.slug}`;
            return (
              <li key={ty.id} className={`type${ty.active ? "" : " off"}`} style={{ "--type": `var(--c-${ty.color})` } as React.CSSProperties}>
                <div className="spread">
                  <h3>{ty.title}</h3>
                  <TypeSwitch id={ty.id} active={ty.active} label={{ on: t.types.on, off: t.types.off }} name={ty.title} errors={t.errors} />
                </div>
                <div className="meta">
                  <span><Clock />{plural(t.minutes, ty.duration, locale)}</span>
                  <span><Kind />{t.kinds[ty.locationKind]}</span>
                  {ty.questions.length > 0 && <span><Chat />{plural(t.types.questionCount, ty.questions.length, locale)}</span>}
                  {ty.dailyLimit > 0 && <span><CalendarCheck />{plural(t.types.atMost, ty.dailyLimit, locale)}</span>}
                  {ty.pool.length > 0 && <span><Person />{plural(t.types.team, ty.pool.length, locale)}</span>}
                </div>
                {!ty.active && <p className="hint">{t.types.off_hint}</p>}
                <div className="actions">
                  <a className="button quiet small" href={`/chest/types/${ty.id}`}><Pencil />{t.types.edit}</a>
                  {ty.active && <CopyButton text={link} label={t.types.link} done={t.types.copied} className="link-button" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
