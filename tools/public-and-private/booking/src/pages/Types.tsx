import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { CalendarCheck, Chat, Clock, kindIcon, Pencil, Person, Plus } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { Island } from "../core/island.tsx";
import type { MemberContext } from "../core/tool.ts";
import { plural } from "../i18n/index.ts";
import * as b from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { myPage } from "../lib/my-page.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { cannotHost } from "./bits.tsx";

// The host's booking types (/chest/types): each a kind of meeting with its
// own link, on or off in one click.
export async function typesPage(v: PageContext<MemberContext>): Promise<View> {
  const { t, locale, request } = v;
  const host = await myPage(v);
  if (!host) return cannotHost(t);
  const types = await b.typesOf(db(), v.member.id);
  const origin = publicOrigin(request.headers) ?? "";
  return {
    title: t.types.title,
    body: (
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
                <li key={ty.id} id={"type-" + ty.id} className={`type type-${ty.color}${ty.active ? "" : " off"}`}>
                  <div className="spread">
                    <h3>{ty.title}</h3>
                    <Island name="TypeSwitch" props={{ id: ty.id, active: ty.active, label: { on: t.types.on, off: t.types.off }, name: ty.title }} />
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
                    {ty.active && <Island name="CopyButton" props={{ text: link, label: t.types.link, done: t.types.copied, className: "link-button" }} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </>
    ),
  };
}
