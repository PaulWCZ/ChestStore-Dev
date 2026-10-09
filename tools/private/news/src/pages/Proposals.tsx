import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import { Star } from "../components/icons.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { notFound } from "@argentic/chest-app";
import { format, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { dates } from "../lib/dates.ts";
import { db } from "../lib/db.ts";
import { nameOf, people } from "../lib/people.ts";
import { waiting } from "../lib/proposals.ts";
import { chestZone } from "../lib/zone.ts";
import { plain } from "../shared/markdown.ts";

// "To approve" (publishers): what colleagues proposed, oldest first, as it
// will read — its picture, headline, words, whom it thanks — with Publish
// and Decline. One's own proposal waits for another publisher.
export async function proposalsPage({ member, locale: language, t }: PageContext): Promise<View> {
  const locale = localeOf(language);
  if (!can(member, "publish")) return notFound();
  const zone = chestZone();
  const list = await waiting(db(), member);
  const who = await people(list.flatMap(p => [p.author, ...(p.colleague ? [p.colleague] : [])]));
  const name = (id: string) => nameOf(who.get(id), locale);
  const d = dates(locale, zone);
  const w = t.approve;
  return { title: w.title, body: (
    <div className="narrow proposals">
      <h1>{w.title}</h1>
      <p className="lead">{w.lead}</p>
      {list.length === 0 ? <EmptyState title={w.none} /> : (
        <ol className="proposal-list">
          {list.map(p => (
            <li key={p.id} id={"proposal-" + p.id} className="proposal" lang={p.locale}>
              {p.cover && <img className="proposal-cover" src={`/chest/files/${p.cover}?size=256`} alt="" />}
              <div className="proposal-text">
                <p className="kicker"><span className="kind">{p.kind === "shoutout" && <Star />}{t.kinds[p.kind]}</span></p>
                <h2 className="headline">{p.title}</h2>
                {p.colleague && <p className="thanks"><Avatar name={name(p.colleague)} photo={who.get(p.colleague)?.photo ?? null} size="s" />{format(w.thanks, { name: name(p.colleague) })}</p>}
                {p.body && <p className="dek">{plain(p.body)}</p>}
                <p className="quiet-text">{format(w.by, { name: name(p.author), when: d.ago(p.createdAt) })}</p>
                {p.author === member.id ? <p className="quiet-text">{w.own}</p> : <Island name="Decide" props={{ id: p.id, author: name(p.author), t: w }} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  ) };
}
