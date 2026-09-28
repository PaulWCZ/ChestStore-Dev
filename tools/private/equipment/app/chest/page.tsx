import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { AssetTag, StatusStamp } from "../../components/bits.tsx";
import { Avatar } from "../../components/avatar.tsx";
import { Alert, CategoryIcon, Chevron, Clock, Plus, Print, Sliders, Upload, Wrench } from "../../components/icons.tsx";
import { SolveButton } from "../../components/solve-button.tsx";
import { can } from "../../lib/access.ts";
import { categoryCounts } from "../../lib/categories.ts";
import { db } from "../../lib/db.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { holderCounts, overview } from "../../lib/items.ts";
import { nameOf, people } from "../../lib/people.ts";
import { viewer } from "../../lib/session.ts";
import { holderIds, rowOf } from "../../lib/view.ts";
import { categoryName } from "../../lib/words.ts";
import { MinePage } from "./mine/mine-page.tsx";

// The first page. A manager sees the stock and what needs them: problems
// reported, warranties and renewals ending, repairs, people who left with
// equipment. A member sees their own equipment.
export default async function Home() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) return <MinePage />;
  const sql = db();
  const today = chest.today();
  const [counts, ov, holders] = await Promise.all([categoryCounts(sql, member), overview(sql, member, today), holderCounts(sql, member)]);
  const names = await people([...holders.keys(), ...ov.problems.map(p => p.reportedBy), ...holderIds([...ov.ending, ...ov.repair])]);
  const leavers = [...holders].filter(([id, c]) => (id === "erased" || names.get(id)?.status !== "member") && c.items + c.seats > 0);
  const stocked = counts.filter(c => c.total > 0);
  const now = new Date();

  if (stocked.length === 0 && ov.repair.length === 0 && leavers.length === 0) {
    return (
      <main className="narrow">
        <div className="empty hero">
          <span className="empty-art" aria-hidden="true"><CategoryIcon name="laptop" /><CategoryIcon name="phone" /><CategoryIcon name="key" /></span>
          <h1>{t.overview.empty.title}</h1>
          <p>{t.overview.empty.body}</p>
          <div className="row center">
            <Link className="button" href="/chest/items/new"><Plus />{t.overview.empty.add}</Link>
            <Link className="button quiet" href="/chest/import"><Upload />{t.overview.empty.import}</Link>
          </div>
        </div>
      </main>
    );
  }

  const attention = ov.problems.length + ov.ending.length + ov.repair.length + leavers.length;
  return (
    <main className="wide">
      <div className="page-head">
        <h1>{t.overview.title}</h1>
        <div className="actions">
          <Link className="button quiet" href="/chest/import"><Upload /><span>{t.shell.import}</span></Link>
          <Link className="button quiet" href="/chest/labels?all=1"><Print /><span>{t.shell.labels}</span></Link>
          <Link className="button" href="/chest/items/new"><Plus />{t.overview.add}</Link>
        </div>
      </div>

      <section aria-labelledby="stock">
        <div className="section-head">
          <h2 id="stock" className="section-title">{t.overview.stock}</h2>
          <Link className="button link small" href="/chest/settings"><Sliders />{t.shell.settings}</Link>
        </div>
        <ul className="bins">
          {stocked.map(c => (
            <li key={c.id}>
              <Link className="bin" href={`/chest/items?category=${c.id}`}>
                <span className="bin-icon" aria-hidden="true"><CategoryIcon name={c.icon} /></span>
                <span className="bin-name">{categoryName(c, t)}</span>
                <span className="bin-count">{plural(t.overview.inStock, c.inStock, locale)}</span>
                <span className="bin-sub">
                  {format(t.overview.inUse, { count: c.inUse })}
                  {c.inRepair > 0 && <> · {format(t.overview.inRepair, { count: c.inRepair })}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="attention" className="attention">
        <h2 id="attention" className="section-title">{t.overview.attention}</h2>
        {attention === 0 && <p className="all-clear"><span aria-hidden="true">✓</span> {t.overview.allClear}</p>}
        <div className="panels">
          {ov.problems.length > 0 && (
            <section className="panel" aria-labelledby="problems">
              <h3 id="problems"><Alert />{t.overview.problems}</h3>
              <ul className="plain">
                {ov.problems.map(p => (
                  <li key={p.id} className="problem">
                    <div className="problem-head">
                      <Link href={`/chest/items/${p.itemId}`} className="strong">{p.item.name}</Link> <AssetTag tag={p.item.tag} />
                    </div>
                    <p className="quote">{p.body}</p>
                    <div className="problem-foot">
                      <span className="small muted"><Avatar name={nameOf(names.get(p.reportedBy), locale)} photo={names.get(p.reportedBy)?.photo ?? null} size={20} /> {format(t.overview.reportedBy, { name: p.reportedBy === "erased" ? t.people.erased : nameOf(names.get(p.reportedBy), locale), when: relative(p.createdAt, locale, now) })}</span>
                      <SolveButton id={p.id} label={t.overview.solved} done={t.overview.solvedDone} errors={t.errors} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {ov.ending.length > 0 && (
            <section className="panel" id="ending" aria-labelledby="ending-title">
              <h3 id="ending-title"><Clock />{t.overview.ending}</h3>
              <p className="small muted">{t.overview.endingHint}</p>
              <ul className="plain">
                {ov.ending.map(item => {
                  const row = rowOf(item, names, t, locale, today, member.id);
                  return (
                    <li key={item.id} className="mini">
                      <Link href={`/chest/items/${item.id}`} className="mini-link">
                        <span className="mini-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>
                        <span className="mini-what"><span className="strong">{item.name}</span> <AssetTag tag={item.tag} /></span>
                        {row.ending && <span className={`ending ${row.ending.state}`}>{row.ending.text} · {row.ending.when}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {ov.repair.length > 0 && (
            <section className="panel" aria-labelledby="repair">
              <h3 id="repair"><Wrench />{t.overview.repair}</h3>
              <ul className="plain">
                {ov.repair.map(item => (
                  <li key={item.id} className="mini">
                    <Link href={`/chest/items/${item.id}`} className="mini-link">
                      <span className="mini-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>
                      <span className="mini-what"><span className="strong">{item.name}</span> <AssetTag tag={item.tag} /></span>
                      <StatusStamp status={item.status} text={t.status[item.status]} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {leavers.length > 0 && (
            <section className="panel warn" aria-labelledby="leavers">
              <h3 id="leavers"><Alert />{t.overview.leavers}</h3>
              <ul className="plain">
                {leavers.map(([id, c]) => {
                  const name = id === "erased" ? t.people.erased : nameOf(names.get(id), locale);
                  return (
                    <li key={id} className="mini">
                      <Link href={`/chest/people/${id}`} className="mini-link">
                        <Avatar name={name} photo={null} size={28} />
                        <span className="mini-what"><span className="strong">{name}</span> <span className="muted">{plural(t.overview.leaverHolds, c.items + c.seats, locale)}</span></span>
                        <Chevron />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
