import * as chest from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetTag, StatusStamp } from "../../../../components/bits.tsx";
import { Avatar } from "../../../../components/avatar.tsx";
import { Alert, Back, CategoryIcon, Print } from "../../../../components/icons.tsx";
import { LabelFace } from "../../../../components/label-face.tsx";
import { ReportButton } from "../../../../components/report-button.tsx";
import { SolveButton } from "../../../../components/solve-button.tsx";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import { format, formatDate, formatDay, relative } from "../../../../lib/i18n/index.ts";
import { itemDetail, places, type HistoryEntry } from "../../../../lib/items.ts";
import { everyone, nameOf, people, type Person } from "../../../../lib/people.ts";
import { teamOrigin } from "../../../../lib/origin.ts";
import { viewer } from "../../../../lib/session.ts";
import { endingOf, holderOf } from "../../../../lib/view.ts";
import { categoryName, moneyText } from "../../../../lib/words.ts";
import { ItemControls } from "./item-controls.tsx";
import { PhotoControl } from "./photo-control.tsx";

type Names = Map<string, Person>;

function who(id: string | null, names: Names, t: Catalogue, locale: Locale): string {
  if (!id) return "";
  if (id === "chest") return t.history.chest;
  if (id === "erased") return t.people.erased;
  return nameOf(names.get(id), locale);
}

// One line of the history, in the reader's words.
function historyText(h: HistoryEntry, names: Names, t: Catalogue, locale: Locale): string {
  const kind = h.kind as keyof Catalogue["history"];
  const template = typeof t.history[kind] === "string" ? (t.history[kind] as string) : h.kind;
  const fields = (h.note ?? "").split(",").map(f => t.history.fields[f as keyof Catalogue["history"]["fields"]]).filter(Boolean).join(", ");
  return format(template, {
    actor: who(h.actor, names, t, locale),
    who: h.member ? who(h.member, names, t, locale) : h.place ?? "",
    status: h.status && h.status in t.status ? t.status[h.status as keyof Catalogue["status"]] : "",
    fields,
  });
}

// An item's page. A manager sees everything and does everything from here;
// a member sees the short view, and reports a problem on what they hold.
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const detail = await itemDetail(sql, member, (await params).id).catch(error => {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  });
  const item = detail.item;
  const zone = chest.timeZone();
  const today = chest.today();
  const currency = chest.currency();
  const now = new Date();
  const ids = [
    item.holder ?? "",
    ...(detail.full ? [...detail.seats.map(s => s.member), ...detail.problems.map(p => p.reportedBy), ...detail.history.flatMap(h => [h.actor, h.member ?? ""])] : []),
  ];
  const names = await people(ids);
  const { holder, text: holderText } = holderOf(item, names, t, locale, member.id);
  const url = `${teamOrigin(await headers())}/chest/items/${item.id}`;
  const ending = endingOf(item, t, locale, today);
  const cat = categoryName(item.category, t);
  const licence = item.category.kind === "licence";
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" }) : null);
  const words = { report: t.report, errors: t.errors, common: t.common };

  const head = (
    <header className="item-head">
      <div className="label-top">
        <AssetTag tag={item.tag} large />
        <span className="label-cat">{cat}</span>
        <StatusStamp status={item.status} text={t.status[item.status]} />
      </div>
      <div className="item-title">
        {item.photo ? <img className="item-photo" src={`/chest/items/${item.id}/photo?size=256`} alt={format(t.item.photoAlt, { name: item.name })} /> : <span className="item-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>}
        <div>
          <h1>{item.name}</h1>
          {item.serial && <p className="muted">{t.item.serial} · <span className="mono" translate="no">{item.serial}</span></p>}
          {ending && <p className={`ending ${ending.state}`}>{ending.text} · {ending.when}</p>}
        </div>
      </div>
    </header>
  );

  if (!detail.full) {
    const mine = detail.mine;
    return (
      <main className="narrow item-page">
        <Link className="back" href={mine ? "/chest" : "/chest/items"}><Back />{mine ? t.mine.title : t.list.title}</Link>
        {head}
        <section className="holder-panel" aria-label={t.item.with}>
          {holder.kind === "member" ? (
            <p className="holder-line"><Avatar name={holder.name} photo={holder.photo} size={36} /><span><strong>{holder.you ? format(t.item.withYou, { date: day(item.heldSince) ?? "" }) : holderText}</strong>{!holder.you && item.heldSince && <span className="muted block">{format(t.item.withSince, { date: day(item.heldSince) ?? "" })}</span>}</span></p>
          ) : holder.kind === "place" ? (
            <p className="holder-line"><strong>{format(t.item.atPlace, { place: holder.name })}</strong></p>
          ) : holder.kind === "seats" ? (
            <p className="holder-line"><strong>{format(t.item.seatsUsed, { used: holder.used, seats: holder.seats })}</strong></p>
          ) : (
            <p className="holder-line muted">{item.status === "in_stock" ? t.item.inStock : t.item.notAvailable}</p>
          )}
          {mine && (
            <>
              <p className="muted">{t.item.mineHint}</p>
              <div><ReportButton id={item.id} name={item.name} label={t.item.report} t={words} primary /></div>
            </>
          )}
        </section>
        {detail.myProblems.map(p => <p key={p.id} className="sent">{format(t.item.yourProblem, { when: relative(p.createdAt, locale, now) })} <span className="quote">{p.body}</span></p>)}
        {!mine && <p className="muted small">{t.item.onlyYours}</p>}
      </main>
    );
  }

  const full = detail.item;
  const [team, placeList] = await Promise.all([can(member, "items.manage") ? everyone() : Promise.resolve({ ok: true, people: [] }), places(sql, member)]);
  const seats = detail.seats.map(s => ({ member: s.member, name: who(s.member, names, t, locale), photo: names.get(s.member)?.photo ?? null, since: day(s.since.slice(0, 10)) ?? "" }));
  const details: [string, string | null][] = licence
    ? [
      [t.item.seats, full.seats !== null ? String(full.seats) : null],
      [t.item.renews, day(full.renewsOn)],
      [t.item.cost, full.costCents !== null ? format(t.item.costPer, { amount: moneyText(full.costCents, currency, locale), period: full.period ? t.periods[full.period] : "" }) : null],
      [t.item.supplier, full.supplier],
    ]
    : [
      [t.item.bought, day(full.purchasedOn)],
      [t.item.price, full.priceCents !== null ? moneyText(full.priceCents, currency, locale) : null],
      [t.item.supplier, full.supplier],
      [t.item.warranty, day(full.warrantyUntil)],
    ];

  return (
    <main className="wide item-page">
      <Link className="back" href="/chest/items"><Back />{t.list.title}</Link>
      <div className="item-grid">
        <div className="item-main">
          {head}
          <ItemControls
            item={{ id: item.id, name: item.name, tag: item.tag, status: item.status, licence, seats: full.seats ?? 0, heldSince: day(item.heldSince), placeName: item.place }}
            holder={holder}
            holderText={holderText}
            seatHolders={seats}
            team={team.people.map(p => ({ id: p.id, name: p.name, photo: p.photo }))}
            places={placeList}
            today={today}
            locale={locale}
            t={{ item: t.item, give: t.give, takeBack: t.takeBack, status: t.status, errors: t.errors, common: t.common, people: t.people }}
          />
          {detail.problems.length > 0 && (
            <section className="panel warn" aria-labelledby="problems">
              <h2 id="problems"><Alert />{t.item.problems}</h2>
              <ul className="plain">
                {detail.problems.map(p => (
                  <li key={p.id} className="problem">
                    <p className="quote">{p.body}</p>
                    <div className="problem-foot">
                      <span className="small muted">{format(t.item.problemBy, { name: who(p.reportedBy, names, t, locale), when: relative(p.createdAt, locale, now) })}</span>
                      <SolveButton id={p.id} label={t.overview.solved} done={t.overview.solvedDone} errors={t.errors} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="panel" aria-labelledby="details">
            <h2 id="details">{t.item.details}</h2>
            <dl className="facts">
              <div><dt>{t.item.category}</dt><dd>{cat}</dd></div>
              <div><dt>{t.item.tag}</dt><dd className="mono">{item.tag}</dd></div>
              {!licence && <div><dt>{t.item.serial}</dt><dd className="mono">{item.serial ?? t.common.none}</dd></div>}
              {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? t.common.none}</dd></div>)}
            </dl>
            {full.notes && <div className="notes"><h3>{t.item.notes}</h3><p>{full.notes}</p></div>}
            <p className="small muted">{format(t.item.added, { date: formatDate(full.createdAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone) })}</p>
          </section>
          <PhotoControl id={item.id} has={item.photo !== null} t={{ item: t.item, errors: t.errors }} />
        </div>
        <aside className="item-side">
          <section className="panel" aria-labelledby="label">
            <h2 id="label">{t.item.label}</h2>
            <LabelFace url={url} tag={item.tag} name={item.name} company={chest.company()} scan={t.labels.scan} qrLabel={url} />
            <Link className="button quiet small" href={`/chest/labels?ids=${item.id}`}><Print />{t.item.printLabel}</Link>
          </section>
          <section className="panel" aria-labelledby="history">
            <h2 id="history">{t.item.history}</h2>
            <ol className="timeline">
              {detail.history.map(h => (
                <li key={h.id} className={`tl tl-${h.kind}`}>
                  <span className="tl-text">{historyText(h, names, t, locale)}</span>
                  <span className="tl-when small muted">
                    {formatDate(h.at, locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, zone)}
                    {h.day && h.day !== h.at.slice(0, 10) && <> · {format(t.history.on, { date: formatDay(h.day, locale) })}</>}
                  </span>
                  {h.note && h.kind !== "edited" && h.kind !== "photo" && <span className="tl-note">{h.note}</span>}
                </li>
              ))}
            </ol>
            {detail.history.length >= 200 && <p className="small muted">{t.item.historyMore}</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
