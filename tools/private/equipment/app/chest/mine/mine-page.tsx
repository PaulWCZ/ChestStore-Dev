import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { AskButton } from "../../../components/ask-button.tsx";
import { AssetTag, StatusStamp } from "../../../components/bits.tsx";
import { CategoryIcon, Print, Shelves } from "../../../components/icons.tsx";
import { ReceiveButton } from "../../../components/receive-button.tsx";
import { ReportButton } from "../../../components/report-button.tsx";
import { listCategories } from "../../../lib/categories.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDate, formatDay, plural, relative } from "../../../lib/i18n/index.ts";
import { mine, type Item, type Problem, type Receipt } from "../../../lib/items.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { currentCharter } from "../../../lib/receipts.ts";
import { myRequests } from "../../../lib/requests.ts";
import { viewer } from "../../../lib/session.ts";
import { categoryName } from "../../../lib/words.ts";
import { MyRequests } from "./my-requests.tsx";

// "My equipment": what the company lent me, since when. What was just given
// to me waits for my "I received it" (with the company's rules, if any); a
// problem reported from here reaches the managers; "Ask for something"
// sends them a request, and my requests say where they stand. My handover
// sheet prints what I hold.
export async function MinePage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const [held, requests, categories] = await Promise.all([mine(sql, member), myRequests(sql, member), listCategories(sql, member)]);
  const pending = held.items.filter(i => !held.receipts.get(i.id)?.confirmedAt);
  const waiting = held.items.filter(i => { const r = held.receipts.get(i.id); return r !== undefined && !r.confirmedAt; });
  const charter = pending.length > 0 ? await currentCharter(sql) : null;
  const givers = await people([...held.receipts.values()].map(r => r.givenBy));
  const zone = chest.timeZone();
  const now = new Date();
  const words = { report: t.report, errors: t.errors, common: t.common, dialog: t.dialog };
  const problemsOf = (itemId: string) => held.problems.filter(p => p.itemId === itemId);
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  const givenText = (item: Item, r: Receipt | undefined) => {
    const date = long(r?.givenOn ?? item.heldSince!);
    const by = r && r.givenBy.startsWith("mbr_") ? nameOf(givers.get(r.givenBy), locale) : null;
    return by ? format(t.receive.given, { name: by, date }) : format(t.receive.givenOn, { date });
  };
  const kindName = new Map(categories.map(c => [c.id, categoryName(c, t)]));

  function Card({ item, since, receipt }: { item: Item; since: string; receipt?: { r: Receipt | undefined } }) {
    const r = receipt?.r;
    const toConfirm = receipt !== undefined && r !== undefined && !r.confirmedAt;
    const unconfirmed = receipt !== undefined && !r?.confirmedAt;
    return (
      <li className={toConfirm ? "label-card to-confirm" : "label-card"}>
        <div className="label-top">
          <AssetTag tag={item.tag} />
          <span className="label-cat">{categoryName(item.category, t)}</span>
          {toConfirm && <StatusStamp status="confirm" text={t.person.toConfirm} />}
        </div>
        <Link href={`/chest/items/${item.id}`} className="label-body">
          {item.photo ? <img className="label-photo" src={`/chest/items/${item.id}/photo?size=256`} alt="" /> : <span className="label-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>}
          <span className="label-text">
            <span className="label-name">{item.name}</span>
            <span className="small muted">{since}</span>
            {r?.confirmedAt && <span className="small muted">{format(t.item.receiptYours, { date: formatDate(r.confirmedAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone) })}</span>}
          </span>
        </Link>
        {problemsOf(item.id).map((p: Problem) => <p key={p.id} className="sent small">{format(t.mine.reported, { when: relative(p.createdAt, locale, now), text: p.body.length > 80 ? p.body.slice(0, 79) + "…" : p.body })}</p>)}
        <div className="label-actions row">
          {unconfirmed && (
            <ReceiveButton id={item.id} name={item.name} label={t.item.received} primary={toConfirm} given={givenText(item, r)} condition={r?.condition ?? null}
              charter={charter ? { id: charter.id, body: charter.body } : null} t={{ receive: t.receive, errors: t.errors, common: t.common, dialog: t.dialog }} />
          )}
          <ReportButton id={item.id} name={item.name} label={t.mine.report} t={words} />
        </div>
      </li>
    );
  }

  const empty = held.items.length === 0 && held.seats.length === 0;
  const ask = <AskButton categories={categories.map(c => ({ id: c.id, name: categoryName(c, t) }))} t={{ requests: t.requests, errors: t.errors, common: t.common, dialog: t.dialog }} primary={empty} />;
  return (
    <div className="wide">
      <PageHeader
        size="m"
        title={t.mine.title}
        intro={empty ? undefined : waiting.length > 0 ? plural(t.mine.toConfirm, waiting.length, locale) : t.mine.intro}
        secondary={empty ? undefined : <Link className="button quiet" href={`/chest/people/${member.id}/handover`}><Print /><span>{t.mine.sheet}</span></Link>}
        action={empty ? undefined : ask}
      />
      {empty ? (
        <EmptyState
          icon={<span className="empty-art"><CategoryIcon name="laptop" /><CategoryIcon name="badge" /></span>}
          title={t.mine.empty.title}
          body={t.mine.empty.body}
          action={<>{ask}<Link className="button quiet" href="/chest/items"><Shelves />{t.mine.browse}</Link></>}
        />
      ) : (
        <>
          {held.items.length > 0 && (
            <ul className="label-grid">
              {[...waiting, ...held.items.filter(i => !waiting.includes(i))].map(item => (
                <Card key={item.id} item={item} since={format(t.mine.since, { date: long(item.heldSince!) })} receipt={{ r: held.receipts.get(item.id) }} />
              ))}
            </ul>
          )}
          {held.seats.length > 0 && (
            <section aria-labelledby="licences">
              <h2 id="licences" className="section-title">{t.mine.licences}</h2>
              <ul className="label-grid">
                {held.seats.map(item => <Card key={item.id} item={item} since={format(t.mine.seatSince, { date: long(item.seatSince.slice(0, 10)) })} />)}
              </ul>
            </section>
          )}
        </>
      )}
      {requests.length > 0 && (
        <section aria-labelledby="my-requests">
          <h2 id="my-requests" className="section-title">{t.mine.requests}</h2>
          <MyRequests
            requests={requests.map(r => ({ id: r.id, body: r.body, status: r.status, when: relative(r.createdAt, locale, now), answer: r.answer, kind: r.categoryId ? kindName.get(r.categoryId) ?? null : null }))}
            t={{ requests: t.requests, errors: t.errors }}
          />
        </section>
      )}
    </div>
  );
}
