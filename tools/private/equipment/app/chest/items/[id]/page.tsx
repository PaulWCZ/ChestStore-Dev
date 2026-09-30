import { chest } from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@argentic/chest-ui/components";
import { AssetTag, StatusStamp } from "../../../../components/bits.tsx";
import { Alert, Back, CategoryIcon, Print } from "../../../../components/icons.tsx";
import { LabelFace } from "../../../../components/label-face.tsx";
import { ReceiveButton } from "../../../../components/receive-button.tsx";
import { ReportButton } from "../../../../components/report-button.tsx";
import { ClaimButton } from "../../../../components/claim-button.tsx";
import { SolveButton } from "../../../../components/solve-button.tsx";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import { format, formatDate, formatDay, plural, relative } from "../../../../lib/i18n/index.ts";
import { fieldsOf, valuesOf } from "../../../../lib/fields.ts";
import { factsOf } from "../../../../lib/intune.ts";
import { lastSeen, openInventory } from "../../../../lib/inventory.ts";
import { itemDetail, places, repairCosts, repairOf, type HistoryEntry, type Receipt } from "../../../../lib/items.ts";
import { currentCharter } from "../../../../lib/receipts.ts";
import { everyone, nameOf, people, type Person } from "../../../../lib/people.ts";
import { teamOrigin } from "../../../../lib/origin.ts";
import { viewer } from "../../../../lib/session.ts";
import { endingOf, holderOf } from "../../../../lib/view.ts";
import { categoryName, charterText, fieldName, moneyText } from "../../../../lib/words.ts";
import { ItemControls } from "./item-controls.tsx";
import { InvoiceControl } from "./invoice-control.tsx";
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
  const kind = (h.kind === "handed_out" && (h.member || h.place) ? "handedOutTo" : h.kind) as keyof Catalogue["history"];
  const template = typeof t.history[kind] === "string" ? (t.history[kind] as string) : h.kind;
  const fields = (h.note ?? "").split(",").map(f => t.history.fields[f as keyof Catalogue["history"]["fields"]]).filter(Boolean).join(", ");
  return format(template, {
    actor: who(h.actor, names, t, locale),
    who: h.member ? who(h.member, names, t, locale) : h.place ?? "",
    status: h.status && h.status in t.status ? t.status[h.status as keyof Catalogue["status"]] : "",
    fields,
    qty: h.qty ?? "",
  });
}

// What a history line carries besides: a repair's ticket, its return day,
// its cost.
function historyExtra(h: HistoryEntry, t: Catalogue, locale: Locale, currency: string): string {
  return [
    h.ref && !h.ref.startsWith("charter:") ? format(t.history.ref, { ref: h.ref }) : "",
    h.due ? format(t.history.due, { date: formatDay(h.due, locale) }) : "",
    h.costCents !== null ? format(t.history.cost, { amount: moneyText(h.costCents, currency, locale) }) : "",
  ].filter(Boolean).join(" · ");
}

// An item's page. A manager sees everything and does everything from here;
// a member sees the short view, and reports a problem on what they hold.
// The receipt of the holder, in words: waiting, or confirmed on a day.
function receiptText(receipt: Receipt, holderName: string, t: Catalogue, locale: Locale, zone: string, you: boolean): { text: string; waiting: boolean; remark: string | null } {
  if (!receipt.confirmedAt) return { text: you ? t.item.receiptYou : format(t.item.receiptWaiting, { name: holderName }), waiting: true, remark: null };
  const date = formatDate(receipt.confirmedAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone);
  return { text: you ? format(t.item.receiptYours, { date }) : format(t.item.receiptDone, { name: holderName, date }), waiting: false, remark: receipt.remark ? format(t.item.receiptRemark, { text: receipt.remark }) : null };
}

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const detail = await itemDetail(sql, member, (await params).id).catch(error => {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  });
  const item = detail.item;
  const zone = chest.timeZone;
  const today = chest.today();
  const currency = chest.currency;
  const now = new Date();
  const ids = [
    item.holder ?? "",
    detail.receipt?.givenBy ?? "",
    ...(detail.full ? [...detail.seats.map(s => s.member), ...detail.problems.map(p => p.reportedBy), ...detail.history.flatMap(h => [h.actor, h.member ?? ""])] : []),
  ];
  const names = await people(ids);
  const { holder, text: holderText } = holderOf(item, names, t, locale, member.id);
  const url = `${teamOrigin(await headers())}/chest/items/${item.id}`;
  const ending = endingOf(item, t, locale, today);
  const cat = categoryName(item.category, t);
  const licence = item.category.kind === "licence";
  // A moment's day in the Chest's time zone (YYYY-MM-DD).
  const localDay = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" }) : null);
  const words = { report: t.report, errors: t.errors, common: t.common, dialog: t.dialog };

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

  // "Given by Sofia on 3 October 2026." for the confirm dialog.
  const givenText = (r: Receipt | null) => {
    const date = day(r?.givenOn ?? item.heldSince) ?? "";
    const by = r && r.givenBy.startsWith("mbr_") ? nameOf(names.get(r.givenBy), locale) : null;
    return by ? format(t.receive.given, { name: by, date }) : format(t.receive.givenOn, { date });
  };

  if (!detail.full) {
    const mine = detail.mine;
    const charter = mine && holder.kind === "member" && !detail.receipt?.confirmedAt ? await currentCharter(sql) : null;
    return (
      <div className="narrow item-page">
        <Link className="back" href={mine ? "/chest" : "/chest/items"}><Back />{mine ? t.mine.title : t.list.title}</Link>
        {head}
        <section className="holder-panel" aria-label={t.item.with}>
          {holder.kind === "member" ? (
            <p className="holder-line"><Avatar name={holder.name} photo={holder.photo} size="m" /><span><strong>{holder.you ? format(t.item.withYou, { date: day(item.heldSince) ?? "" }) : holderText}</strong>{!holder.you && item.heldSince && <span className="muted block">{format(t.item.withSince, { date: day(item.heldSince) ?? "" })}</span>}</span></p>
          ) : holder.kind === "place" ? (
            <p className="holder-line"><strong>{format(t.item.atPlace, { place: holder.name })}</strong></p>
          ) : holder.kind === "seats" ? (
            <p className="holder-line"><strong>{format(t.item.seatsUsed, { used: holder.used, seats: holder.seats })}</strong></p>
          ) : holder.kind === "stock" ? (
            <p className="holder-line"><strong>{holderText}</strong></p>
          ) : holder.kind === "hidden" ? (
            <p className="holder-line"><span><strong>{holderText}</strong><span className="muted block">{t.item.heldHidden}</span></span></p>
          ) : (
            <p className="holder-line muted">{item.status === "in_stock" ? t.item.inStock : t.item.notAvailable}</p>
          )}
          {mine && holder.kind === "member" && (() => {
            const r = detail.receipt;
            const waiting = !r || !r.confirmedAt;
            return (
              <div className={waiting ? "receipt waiting" : "receipt"}>
                <p>{r?.confirmedAt ? format(t.item.receiptYours, { date: formatDate(r.confirmedAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone) }) : t.item.receiptYou}</p>
              </div>
            );
          })()}
          {mine && (
            <>
              <p className="muted">{t.item.mineHint}</p>
              <div className="row">
                {holder.kind === "member" && !detail.receipt?.confirmedAt && (
                  <ReceiveButton id={item.id} name={item.name} label={t.item.received} charter={charter ? { id: charter.id, body: charterText(charter, t) } : null}
                    given={givenText(detail.receipt)} condition={detail.receipt?.condition ?? null} t={{ receive: t.receive, errors: t.errors, common: t.common, dialog: t.dialog }} />
                )}
                <ReportButton id={item.id} name={item.name} label={t.item.report} t={words} primary={holder.kind !== "member" || Boolean(detail.receipt?.confirmedAt)} />
              </div>
            </>
          )}
        </section>
        {detail.myProblems.map(p => <p key={p.id} className="sent">{format(t.item.yourProblem, { when: relative(p.createdAt, locale, now) })} <span className="quote">{p.body}</span></p>)}
        {!mine && <p className="muted small">{t.item.onlyYours}</p>}
      </div>
    );
  }

  const full = detail.item;
  const [team, placeList, ownFields, repair, costs, seenInfo, inventory, intune] = await Promise.all([
    can(member, "items.manage") ? everyone() : Promise.resolve({ ok: true, people: [] }), places(sql, member), fieldsOf(sql, full.category.id),
    full.status === "in_repair" ? repairOf(sql, full.id) : Promise.resolve(null), repairCosts(sql, full.id), lastSeen(sql, full.id), openInventory(sql),
    full.category.kind === "asset" ? factsOf(sql, member, full.serial) : Promise.resolve(null),
  ]);
  const opening = (await searchParams).give === "1" ? "give" as const : null;
  const repairText = repair ? [
    format(t.item.inRepair, { date: formatDate(repair.since, locale, { day: "numeric", month: "long" }, zone) }),
    repair.ref ? format(t.item.ticket, { ref: repair.ref }) : "",
    repair.due ? format(t.item.expected, { date: formatDay(repair.due, locale, { day: "numeric", month: "long" }) }) + (repair.due < today ? ` (${t.item.late})` : "") : "",
  ].filter(Boolean).join(" · ") : null;
  const receipt = detail.receipt && holder.kind === "member" ? receiptText(detail.receipt, holder.name, t, locale, zone, holder.you) : null;
  const extras = {
    receipt, repair: repairText, opening,
    sheet: item.holder && item.holder.startsWith("mbr_") ? `/chest/people/${item.holder}/handover?items=${item.id}` : null,
    inventory: { open: inventory !== null && full.category.kind === "asset", seen: seenInfo.openSeen },
  };
  const seenText = seenInfo.missedIn ? format(t.item.missed, { date: formatDate(seenInfo.missedIn, locale, { day: "numeric", month: "long", year: "numeric" }, zone) })
    : seenInfo.seenAt ? format(t.item.lastSeenValue, { date: formatDate(seenInfo.seenAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone) }) : null;
  const seats = detail.seats.map(s => ({ member: s.member, name: who(s.member, names, t, locale), photo: names.get(s.member)?.photo ?? null, since: day(s.since.slice(0, 10)) ?? "" }));
  const details: [string, string | null][] = full.category.kind === "consumable"
    ? [
      [t.item.quantity, String(full.quantity ?? 0)],
      [t.item.minQuantity, full.minQuantity !== null ? String(full.minQuantity) : null],
      [t.item.bought, day(full.purchasedOn)],
      [t.item.supplier, full.supplier],
    ]
    : licence
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
      ...(costs.count > 0 ? [[t.item.repairs, plural(t.item.repairsTotal, costs.count, locale, { amount: moneyText(costs.cents, currency, locale) })] as [string, string]] : []),
      ...(full.category.kind === "asset" && (seenText || inventory) ? [[t.item.lastSeen, seenText ?? t.item.neverSeen] as [string, string]] : []),
    ];
  for (const { field, value } of valuesOf(ownFields, full.extra)) details.push([fieldName(field, t), field.type === "date" ? day(value) : value]);
  // What Microsoft Intune said of it at its last read (same serial number);
  // the person it names, when they are not who holds it here.
  if (intune) {
    details.push([t.item.intune, [
      intune.lastCheckIn ? format(t.item.intuneCheckIn, { when: relative(intune.lastCheckIn, locale, now) }) : t.item.intuneNever,
      [intune.os, intune.osVersion].filter(Boolean).join(" "),
      intune.deviceName ?? "",
    ].filter(Boolean).join(" · ")]);
  }
  const intuneNames = intune?.member && intune.member !== "erased" && intune.member !== full.holder ? await people([intune.member]) : null;
  const intuneOther = intuneNames && intune?.member ? nameOf(intuneNames.get(intune.member), locale) : null;
  // A problem while the warranty runs: the supplier's details, and a claim
  // (to repair) unless it is already away, lost or retired.
  const warranty = full.category.kind === "asset" && full.warrantyUntil !== null && full.warrantyUntil >= today
    ? {
      text: format(t.claim.until, { date: day(full.warrantyUntil) ?? "" }),
      facts: { warranty: day(full.warrantyUntil) ?? "", supplier: full.supplier, bought: day(full.purchasedOn), invoice: full.invoice ? `/chest/items/${full.id}/invoice` : null },
      claimable: full.status === "in_use" || full.status === "in_stock",
    }
    : null;

  return (
    <div className="wide item-page">
      <Link className="back" href="/chest/items"><Back />{t.list.title}</Link>
      <div className="item-grid">
        <div className="item-main">
          {head}
          <ItemControls
            item={{ id: item.id, name: item.name, tag: item.tag, status: item.status, kind: full.category.kind, seats: full.seats ?? 0, heldSince: day(item.heldSince), placeName: item.place, quantity: full.quantity, minQuantity: full.minQuantity }}
            holder={holder}
            holderText={holderText}
            seatHolders={seats}
            team={team.people.map(p => ({ id: p.id, name: p.name, photo: p.photo }))}
            places={placeList}
            today={today}
            locale={locale}
            extras={extras}
            t={{ item: t.item, give: t.give, takeBack: t.takeBack, status: t.status, errors: t.errors, common: t.common, people: t.people, handOut: t.handOut, restock: t.restock, repair: t.repair, list: t.list, dialog: t.dialog, peoplePicker: t.peoplePicker, date: t.date, lang: locale }}
          />
          {detail.problems.length > 0 && (
            <section className="panel warn" aria-labelledby="problems">
              <h2 id="problems"><Alert />{t.item.problems}</h2>
              <ul className="plain">
                {detail.problems.map(p => (
                  <li key={p.id} className="problem">
                    <p className="quote">{p.body}</p>
                    {warranty && (
                      <p className="warranty-line small">
                        <strong>{warranty.text}</strong>
                        {full.supplier && <> · {format(t.claim.from, { supplier: full.supplier })}</>}
                      </p>
                    )}
                    <div className="problem-foot">
                      <span className="small muted">{format(t.item.problemBy, { name: who(p.reportedBy, names, t, locale), when: relative(p.createdAt, locale, now) })}</span>
                      <span className="row">
                        {warranty?.claimable && (
                          <ClaimButton item={{ id: full.id, name: full.name }} problem={p.body} facts={warranty.facts} today={today}
                            holderName={holder.kind === "member" && !holder.you ? holder.name : null}
                            t={{ claim: t.claim, repair: t.repair, errors: t.errors, common: t.common, dialog: t.dialog, date: t.date }} />
                        )}
                        <SolveButton id={p.id} label={t.overview.solved} done={t.overview.solvedDone} errors={t.errors} />
                      </span>
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
              {full.category.kind === "asset" && <div><dt>{t.item.serial}</dt><dd className="mono">{item.serial ?? t.common.none}</dd></div>}
              {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? t.common.none}</dd></div>)}
            </dl>
            {intuneOther && <p className="warn-line">{format(t.item.intuneOther, { name: intuneOther })}</p>}
            {full.notes && <div className="notes"><h3>{t.item.notes}</h3><p>{full.notes}</p></div>}
            <p className="small muted">{format(t.item.added, { date: formatDate(full.createdAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone) })}</p>
          </section>
          <PhotoControl id={item.id} name={item.name} has={item.photo !== null} t={{ item: t.item, errors: t.errors, common: t.common }} />
          <InvoiceControl id={item.id} name={item.name} has={full.invoice !== null} t={{ item: t.item, errors: t.errors, common: t.common }} />
        </div>
        <aside className="item-side">
          <section className="panel" aria-labelledby="label">
            <h2 id="label">{t.item.label}</h2>
            <LabelFace url={url} tag={item.tag} name={item.name} company={chest.organization.name} scan={t.labels.scan} qrLabel={url} />
            <Link className="button quiet small" href={`/chest/labels?ids=${item.id}`}><Print />{t.item.printLabel}</Link>
          </section>
          <section className="panel" aria-labelledby="history">
            <h2 id="history">{t.item.history}</h2>
            <ol className="timeline">
              {detail.history.map(h => (
                <li key={h.id} className={`tl tl-${h.kind}`}>
                  <span className="tl-text">{historyText(h, names, t, locale)}</span>
                  <span className="tl-when small muted">
                    <time dateTime={h.at}>{formatDate(h.at, locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, zone)}</time>
                    {h.day && h.day !== localDay(h.at) && <> · {format(t.history.on, { date: formatDay(h.day, locale) })}</>}
                  </span>
                  {h.note && h.kind !== "edited" && h.kind !== "photo" && h.kind !== "invoice" && <span className="tl-note">{h.note}</span>}
                  {historyExtra(h, t, locale, currency) && <span className="tl-note">{historyExtra(h, t, locale, currency)}</span>}
                </li>
              ))}
            </ol>
            {detail.history.length >= 200 && <p className="small muted">{t.item.historyMore}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
