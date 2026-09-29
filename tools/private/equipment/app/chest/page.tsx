import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { RemindButton } from "../../components/remind-button.tsx";
import { Avatar, EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { AssetTag, StatusStamp } from "../../components/bits.tsx";
import { Alert, CategoryIcon, Check, Chevron, Clipboard, Clock, Plus, Print, Sliders, Sync, TakeBack, Upload, Wrench } from "../../components/icons.tsx";
import { Fold } from "../../components/fold.tsx";
import { SolveButton } from "../../components/solve-button.tsx";
import { can } from "../../lib/access.ts";
import { categoryCounts } from "../../lib/categories.ts";
import { db } from "../../lib/db.ts";
import { leavingList, purgeDepartures } from "../../lib/departures.ts";
import { format, formatDay, plural, relative } from "../../lib/i18n/index.ts";
import { status as intuneStatus } from "../../lib/intune.ts";
import { openInventory } from "../../lib/inventory.ts";
import { holderCounts, listItems, overview, unconfirmedReceipts } from "../../lib/items.ts";
import { addDays } from "../../lib/model.ts";
import { waitingRequests } from "../../lib/requests.ts";
import { nameOf, people } from "../../lib/people.ts";
import { viewer } from "../../lib/session.ts";
import { holderIds, rowOf } from "../../lib/view.ts";
import { categoryName } from "../../lib/words.ts";
import { MinePage } from "./mine/mine-page.tsx";
import { RequestsPanel } from "./requests-panel.tsx";

// The first page. A manager sees the stock and what needs them: requests
// for equipment, problems reported, supplies running low, warranties and
// renewals ending, repairs (and when they are due back), what to take back
// from people leaving (People tells Equipment) and from people who left
// with equipment, receipts not confirmed after a week. A member sees their
// own equipment.
export default async function Home() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) return <MinePage />;
  const sql = db();
  const today = chest.today();
  await purgeDepartures(sql, today);
  const [counts, ov, holders, departing, requests, unconfirmed, inventory, intune] = await Promise.all([
    categoryCounts(sql, member), overview(sql, member, today), holderCounts(sql, member), leavingList(sql, member), waitingRequests(sql, member),
    unconfirmedReceipts(sql, member, addDays(today, -7)), openInventory(sql), intuneStatus(sql, member),
  ]);
  const names = await people([...intune.differ.flatMap(d => [d.intune, d.holder ?? ""]), ...holders.keys(), ...departing.map(d => d.memberId), ...ov.problems.map(p => p.reportedBy), ...holderIds([...ov.ending, ...ov.repair]), ...requests.map(r => r.member), ...unconfirmed.map(u => u.member)]);
  const leavers = [...holders].filter(([id, c]) => (id === "erased" || names.get(id)?.status !== "member") && c.items + c.seats > 0);
  // Still here, leaving soon: once they have left, "leavers" says the rest.
  const leaving = departing.filter(d => names.get(d.memberId)?.status === "member");
  const stocked = counts.filter(c => c.total > 0);
  const now = new Date();

  if (stocked.length === 0 && ov.repair.length === 0 && leavers.length === 0 && requests.length === 0) {
    return (
      <div className="narrow hero">
        <EmptyState
          headingLevel={1}
          icon={<span className="empty-art"><CategoryIcon name="laptop" /><CategoryIcon name="phone" /><CategoryIcon name="key" /></span>}
          title={t.overview.empty.title}
          body={t.overview.empty.body}
          action={<><Link className="button" href="/chest/items/new"><Plus />{t.overview.empty.add}</Link><Link className="button quiet" href="/chest/import"><Upload />{t.overview.empty.import}</Link></>}
        />
      </div>
    );
  }

  const attention = ov.problems.length + ov.ending.length + ov.repair.length + leavers.length + leaving.length + requests.length + ov.low.length + unconfirmed.length
    + intune.differ.length + (intune.missing > 0 ? 1 : 0);
  // What a request may be answered with: things in stock, supplies left,
  // licences with a free seat.
  const offer = requests.length === 0 ? [] : [
    ...(await listItems(sql, member, { status: "in_stock" }, 300)),
    ...(await listItems(sql, member, { status: "in_use" }, 300)).filter(i => i.seats !== null && i.seatsUsed < i.seats),
  ].filter(i => i.category.kind !== "consumable" || (i.quantity ?? 0) > 0).map(i => ({ ...rowOf(i, names, t, locale, today, member.id), categoryId: i.category.id }));
  const kindName = new Map(counts.map(c => [c.id, categoryName(c, t)]));
  return (
    <div className="wide">
      <PageHeader
        size="m"
        title={t.overview.title}
        secondary={<>
          <Link className="button quiet" href="/chest/import"><Upload /><span>{t.shell.import}</span></Link>
          <Link className="button quiet" href="/chest/labels?all=1"><Print /><span>{t.shell.labels}</span></Link>
          <Link className="button quiet" href="/chest/inventory"><Clipboard /><span>{inventory ? t.inventory.open : t.shell.inventory}</span></Link>
        </>}
        action={<Link className="button" href="/chest/items/new"><Plus />{t.overview.add}</Link>}
      />

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
                <span className="bin-count">{plural(c.kind === "consumable" ? t.overview.units : t.overview.inStock, c.inStock, locale)}</span>
                {c.kind === "consumable" ? (
                  <span className="bin-sub">
                    {plural(t.overview.kinds, c.total, locale)}
                    {c.low > 0 && <> · <span className="low-text">{plural(t.overview.lowCount, c.low, locale)}</span></>}
                  </span>
                ) : (
                  <span className="bin-sub">
                    {format(t.overview.inUse, { count: c.inUse })}
                    {c.inRepair > 0 && <> · {format(t.overview.inRepair, { count: c.inRepair })}</>}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="attention" className="attention">
        <h2 id="attention" className="section-title">{t.overview.attention}</h2>
        {attention === 0 && <p className="all-clear"><span aria-hidden="true">✓</span> {t.overview.allClear}</p>}
        <div className="panels">
          {requests.length > 0 && (
            <RequestsPanel
              requests={requests.map(r => {
                const person = names.get(r.member);
                return {
                  id: r.id, member: r.member, name: r.member === "erased" ? t.people.erased : nameOf(person, locale), photo: person?.photo ?? null, body: r.body,
                  kind: r.categoryId ? kindName.get(r.categoryId) ?? null : null, categoryId: r.categoryId, approved: r.status === "approved",
                  when: relative(r.createdAt, locale, now), gone: person?.status !== "member",
                };
              })}
              offer={offer}
              t={{ overview: t.overview, requests: t.requests, errors: t.errors, common: t.common, dialog: t.dialog, search: t.search }}
            />
          )}
          {leaving.length > 0 && (
            <section className="panel" id="leaving" aria-labelledby="leaving-title">
              <h3 id="leaving-title"><TakeBack />{t.overview.leaving}</h3>
              <p className="small muted">{t.overview.leavingHint}</p>
              <Fold more={plural(t.overview.more, leaving.length - 3, locale)} less={t.overview.less} items={leaving.map(d => {
                  const person = names.get(d.memberId);
                  const name = nameOf(person, locale);
                  return (
                    <li key={d.memberId} className="mini">
                      <Link href={`/chest/people/${d.memberId}`} className="mini-link">
                        <Avatar name={name} photo={person?.photo ?? null} size="m" />
                        <span className="mini-what">
                          <span className="strong">{name}</span>{" "}
                          <span className="muted">{plural(t.overview.leaverHolds, d.items + d.seats, locale)} · {format(t.overview.lastDay, { date: formatDay(d.lastDay, locale, { weekday: "short", day: "numeric", month: "short" }) })}</span>
                        </span>
                        <Chevron />
                      </Link>
                    </li>
                  );
                })} />
            </section>
          )}
          {ov.problems.length > 0 && (
            <section className="panel" aria-labelledby="problems">
              <h3 id="problems"><Alert />{t.overview.problems}</h3>
              <Fold more={plural(t.overview.more, ov.problems.length - 3, locale)} less={t.overview.less} items={ov.problems.map(p => (
                  <li key={p.id} className="problem">
                    <div className="problem-head">
                      <Link href={`/chest/items/${p.itemId}`} className="strong">{p.item.name}</Link> <AssetTag tag={p.item.tag} />
                    </div>
                    <p className="quote">{p.body}</p>
                    {p.item.category.kind === "asset" && p.item.warrantyUntil && p.item.warrantyUntil >= today && p.item.status !== "in_repair" && (
                      <p className="warranty-line small">
                        <Link href={`/chest/items/${p.itemId}#problems`}>{format(t.claim.claimIt, { date: formatDay(p.item.warrantyUntil, locale, { day: "numeric", month: "short" }) })}</Link>
                      </p>
                    )}
                    <div className="problem-foot">
                      <span className="small muted"><Avatar name={nameOf(names.get(p.reportedBy), locale)} photo={names.get(p.reportedBy)?.photo ?? null} size="s" /> {format(t.overview.reportedBy, { name: p.reportedBy === "erased" ? t.people.erased : nameOf(names.get(p.reportedBy), locale), when: relative(p.createdAt, locale, now) })}</span>
                      <SolveButton id={p.id} label={t.overview.solved} done={t.overview.solvedDone} errors={t.errors} />
                    </div>
                  </li>
                ))} />
            </section>
          )}
          {ov.low.length > 0 && (
            <section className="panel" id="low" aria-labelledby="low-title">
              <h3 id="low-title"><Alert />{t.overview.low}</h3>
              <Fold more={plural(t.overview.more, ov.low.length - 3, locale)} less={t.overview.less} items={ov.low.map(item => (
                  <li key={item.id} className="mini">
                    <Link href={`/chest/items/${item.id}`} className="mini-link">
                      <span className="mini-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>
                      <span className="mini-what"><span className="strong">{item.name}</span> <AssetTag tag={item.tag} /></span>
                      <span className="low-text small">{plural(t.overview.left, item.quantity ?? 0, locale)} · {format(t.overview.minimum, { min: item.minQuantity ?? 0 })}</span>
                    </Link>
                  </li>
                ))} />
            </section>
          )}
          {ov.ending.length > 0 && (
            <section className="panel" id="ending" aria-labelledby="ending-title">
              <h3 id="ending-title"><Clock />{t.overview.ending}</h3>
              <p className="small muted">{t.overview.endingHint}</p>
              <Fold more={plural(t.overview.more, ov.ending.length - 3, locale)} less={t.overview.less} items={ov.ending.map(item => {
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
                })} />
            </section>
          )}
          {ov.repair.length > 0 && (
            <section className="panel" aria-labelledby="repair">
              <h3 id="repair"><Wrench />{t.overview.repair}</h3>
              <Fold more={plural(t.overview.more, ov.repair.length - 3, locale)} less={t.overview.less} items={ov.repair.map(item => (
                  <li key={item.id} className="mini">
                    <Link href={`/chest/items/${item.id}`} className="mini-link">
                      <span className="mini-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>
                      <span className="mini-what"><span className="strong">{item.name}</span> <AssetTag tag={item.tag} /></span>
                      {item.repair?.due ? (
                        <span className={item.repair.due < today ? "ending past" : "ending"}>
                          {format(t.overview.expectedBack, { date: formatDay(item.repair.due, locale, { day: "numeric", month: "short" }) })}{item.repair.due < today && <> · {t.overview.late}</>}
                        </span>
                      ) : <StatusStamp status={item.status} text={t.status[item.status]} />}
                    </Link>
                  </li>
                ))} />
            </section>
          )}
          {unconfirmed.length > 0 && (
            <section className="panel" id="unconfirmed" aria-labelledby="unconfirmed-title">
              <h3 id="unconfirmed-title"><Check />{t.overview.unconfirmed}</h3>
              <p className="small muted">{t.overview.unconfirmedHint}</p>
              <Fold more={plural(t.overview.more, unconfirmed.length - 3, locale)} less={t.overview.less} items={unconfirmed.map(u => {
                  const name = nameOf(names.get(u.member), locale);
                  return (
                    <li key={u.item.id} className="mini">
                      <Link href={`/chest/items/${u.item.id}`} className="mini-link">
                        <Avatar name={name} photo={names.get(u.member)?.photo ?? null} size="m" />
                        <span className="mini-what"><span className="strong">{u.item.name}</span> <AssetTag tag={u.item.tag} /> <span className="muted">{name} · {format(t.overview.givenOn, { date: formatDay(u.givenOn, locale, { day: "numeric", month: "short" }) })}</span></span>
                      </Link>
                      {u.member.startsWith("mbr_") && <RemindButton id={u.item.id} name={name} item={u.item.name} done={u.remindedToday} t={{ overview: t.overview, errors: t.errors }} />}
                    </li>
                  );
                })} />
            </section>
          )}
          {(intune.differ.length > 0 || intune.missing > 0) && (
            <section className="panel" id="intune" aria-labelledby="intune-title">
              <h3 id="intune-title"><Sync />{t.overview.intune}</h3>
              {intune.lastGood && <p className="small muted">{format(t.overview.intuneHint, { when: relative(intune.lastGood, locale, now) })}</p>}
              {intune.missing > 0 && (
                <p><Link href="/chest/import#intune" className="strong">{plural(t.overview.intuneMissing, intune.missing, locale)}</Link></p>
              )}
              {intune.differ.length > 0 && (
                <Fold more={plural(t.overview.more, intune.differ.length - 3, locale)} less={t.overview.less} items={intune.differ.map(d => {
                  const here = d.holder ? (d.holder === "erased" ? t.people.erased : nameOf(names.get(d.holder), locale)) : d.place ?? t.overview.intuneNobody;
                  return (
                    <li key={d.itemId} className="mini">
                      <Link href={`/chest/items/${d.itemId}`} className="mini-link">
                        <span className="mini-what">
                          <span className="strong">{d.name}</span> <AssetTag tag={d.tag} />{" "}
                          <span className="muted">{format(t.overview.intuneDiffer, { here, intune: nameOf(names.get(d.intune), locale) })}</span>
                        </span>
                        <Chevron />
                      </Link>
                    </li>
                  );
                })} />
              )}
            </section>
          )}
          {leavers.length > 0 && (
            <section className="panel warn" aria-labelledby="leavers">
              <h3 id="leavers"><Alert />{t.overview.leavers}</h3>
              <Fold more={plural(t.overview.more, leavers.length - 3, locale)} less={t.overview.less} items={leavers.map(([id, c]) => {
                  const name = id === "erased" ? t.people.erased : nameOf(names.get(id), locale);
                  return (
                    <li key={id} className="mini">
                      <Link href={`/chest/people/${id}`} className="mini-link">
                        <Avatar name={name} photo={null} size="m" />
                        <span className="mini-what"><span className="strong">{name}</span> <span className="muted">{plural(t.overview.leaverHolds, c.items + c.seats, locale)}</span></span>
                        <Chevron />
                      </Link>
                    </li>
                  );
                })} />
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
