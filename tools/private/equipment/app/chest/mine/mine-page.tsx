import Link from "next/link";
import { AssetTag } from "../../../components/bits.tsx";
import { CategoryIcon, Shelves } from "../../../components/icons.tsx";
import { ReportButton } from "../../../components/report-button.tsx";
import { db } from "../../../lib/db.ts";
import { format, formatDay, relative } from "../../../lib/i18n/index.ts";
import { mine, type Item, type Problem } from "../../../lib/items.ts";
import { viewer } from "../../../lib/session.ts";
import { categoryName } from "../../../lib/words.ts";

// "My equipment": what the company lent me, since when; a problem reported
// from here reaches the managers.
export async function MinePage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const held = await mine(db(), member);
  const now = new Date();
  const words = { report: t.report, errors: t.errors, common: t.common };
  const problemsOf = (itemId: string) => held.problems.filter(p => p.itemId === itemId);

  function Card({ item, since }: { item: Item; since: string }) {
    return (
      <li className="label-card">
        <div className="label-top">
          <AssetTag tag={item.tag} />
          <span className="label-cat">{categoryName(item.category, t)}</span>
        </div>
        <Link href={`/chest/items/${item.id}`} className="label-body">
          {item.photo ? <img className="label-photo" src={`/chest/items/${item.id}/photo?size=256`} alt="" /> : <span className="label-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>}
          <span className="label-text">
            <span className="label-name">{item.name}</span>
            <span className="small muted">{since}</span>
          </span>
        </Link>
        {problemsOf(item.id).map((p: Problem) => <p key={p.id} className="sent small">{format(t.mine.reported, { when: relative(p.createdAt, locale, now), text: p.body.length > 80 ? p.body.slice(0, 79) + "…" : p.body })}</p>)}
        <div className="label-actions">
          <ReportButton id={item.id} name={item.name} label={t.mine.report} t={words} />
        </div>
      </li>
    );
  }

  const empty = held.items.length === 0 && held.seats.length === 0;
  return (
    <main className="wide">
      <div className="page-head">
        <div>
          <h1>{t.mine.title}</h1>
          {!empty && <p className="muted">{t.mine.intro}</p>}
        </div>
      </div>
      {empty ? (
        <div className="empty">
          <span className="empty-art" aria-hidden="true"><CategoryIcon name="laptop" /><CategoryIcon name="badge" /></span>
          <h2>{t.mine.empty.title}</h2>
          <p>{t.mine.empty.body}</p>
          <Link className="button quiet" href="/chest/items"><Shelves />{t.mine.browse}</Link>
        </div>
      ) : (
        <>
          {held.items.length > 0 && (
            <ul className="label-grid">
              {held.items.map(item => <Card key={item.id} item={item} since={format(t.mine.since, { date: formatDay(item.heldSince!, locale, { day: "numeric", month: "long", year: "numeric" }) })} />)}
            </ul>
          )}
          {held.seats.length > 0 && (
            <section aria-labelledby="licences">
              <h2 id="licences" className="section-title">{t.mine.licences}</h2>
              <ul className="label-grid">
                {held.seats.map(item => <Card key={item.id} item={item} since={format(t.mine.seatSince, { date: formatDay(item.seatSince.slice(0, 10), locale, { day: "numeric", month: "long", year: "numeric" }) })} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
