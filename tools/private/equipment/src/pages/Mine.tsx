import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { AssetTag, StatusStamp } from "../components/bits.tsx";
import { CategoryIcon, Print, Shelves } from "../components/icons.tsx";
import { format, formatDate, formatDay, localeOf, plural, relative } from "../i18n/index.ts";
import { listCategories } from "../lib/categories.ts";
import { db } from "../lib/db.ts";
import { mine, type Item, type Problem, type Receipt } from "../lib/items.ts";
import { nameOf, people } from "../lib/people.ts";
import { currentCharter } from "../lib/receipts.ts";
import { myRequests } from "../lib/requests.ts";
import { categoryName, charterText } from "../shared/words.ts";

// "My equipment": what the company lent me, since when. What was just given
// to me waits for my "I received it" (with the company's rules, if any); a
// problem reported from here reaches the managers; "Ask for something"
// sends them a request, and my requests say where they stand. My handover
// sheet prints what I hold.
export async function minePage({ member, locale: language, t, f }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const [held, requests, categories] = await Promise.all([mine(sql, member), myRequests(sql, member), listCategories(sql, member)]);
  const pending = held.items.filter(i => !held.receipts.get(i.id)?.confirmedAt);
  const waiting = held.items.filter(i => { const r = held.receipts.get(i.id); return r !== undefined && !r.confirmedAt; });
  const charter = pending.length > 0 ? await currentCharter(sql) : null;
  const givers = await people([...held.receipts.values()].map(r => r.givenBy));
  const zone = f.timeZone;
  const now = new Date();
  const words = { report: t.report, common: t.common, dialog: t.dialog };
  const problemsOf = (itemId: string) => held.problems.filter(p => p.itemId === itemId);
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  const givenText = (item: Item, r: Receipt | undefined) => {
    const date = long(r?.givenOn ?? item.heldSince!);
    const by = r && r.givenBy.startsWith("mbr_") ? nameOf(givers.get(r.givenBy), locale) : null;
    return by ? format(t.receive.given, { name: by, date }) : format(t.receive.givenOn, { date });
  };
  const kindName = new Map(categories.map(c => [c.id, categoryName(c, t)]));
  // "You confirmed receiving it on …" only while it is news (a month): the
  // same line under every item imported years ago was noise.
  const recentDays = 30;

  function Card({ item, since, receipt, heading }: { item: Item; since: string; receipt?: { r: Receipt | undefined }; heading?: string }) {
    const r = receipt?.r;
    const toConfirm = receipt !== undefined && r !== undefined && !r.confirmedAt;
    const unconfirmed = receipt !== undefined && !r?.confirmedAt;
    return (
      <li className={toConfirm ? "label-card to-confirm" : "label-card"}>
        <div className="label-top">
          <AssetTag tag={item.tag} />
          {/* Under "Licences and subscriptions" the built-in category's name would say it twice. */}
          {!(heading && categoryName(item.category, t).toLowerCase() === heading.toLowerCase()) && <span className="label-cat">{categoryName(item.category, t)}</span>}
          {toConfirm && <StatusStamp status="confirm" text={t.person.toConfirm} />}
        </div>
        <a href={`/chest/items/${item.id}`} className="label-body">
          {item.photo ? <img className="label-photo" src={`/chest/items/${item.id}/photo?size=256`} alt="" /> : <span className="label-icon" aria-hidden="true"><CategoryIcon name={item.category.icon} /></span>}
          <span className="label-text">
            <span className="label-name">{item.name}</span>
            <span className="small muted">{since}</span>
            {r?.confirmedAt && now.getTime() - Date.parse(r.confirmedAt) < recentDays * 864e5 && <span className="small muted">{format(t.item.receiptYours, { date: formatDate(r.confirmedAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone) })}</span>}
          </span>
        </a>
        {problemsOf(item.id).map((p: Problem) => <p key={p.id} className="sent small">{format(t.mine.reported, { when: relative(p.createdAt, locale, now), text: p.body.length > 80 ? p.body.slice(0, 79) + "…" : p.body })}</p>)}
        <div className="label-actions row">
          {unconfirmed && (
            <Island id={`i-receive-${item.id}`} name="ReceiveButton" props={{ id: item.id, name: item.name, label: t.item.received, primary: toConfirm, given: givenText(item, r), condition: r?.condition ?? null,
              charter: charter ? { id: charter.id, body: charterText(charter, t) } : null, t: { receive: t.receive, common: t.common, dialog: t.dialog } }} />
          )}
          <Island id={`i-report-${item.id}`} name="ReportButton" props={{ id: item.id, name: item.name, label: t.mine.report, t: words }} />
        </div>
      </li>
    );
  }

  const empty = held.items.length === 0 && held.seats.length === 0;
  const ask = <Island id="i-ask" name="AskButton" props={{ categories: categories.map(c => ({ id: c.id, name: categoryName(c, t) })), t: { requests: t.requests, common: t.common, dialog: t.dialog }, primary: empty }} />;
  return { title: t.mine.title, body: (
    <div className="wide">
      <PageHeader
        size="m"
        title={t.mine.title}
        intro={empty ? undefined : waiting.length > 0 ? plural(t.mine.toConfirm, waiting.length, locale) : t.mine.intro}
        secondary={empty ? undefined : <a className="button quiet" href={`/chest/people/${member.id}/handover`}><Print /><span>{t.mine.sheet}</span></a>}
        action={empty ? undefined : ask}
      />
      {empty ? (
        <EmptyState
          icon={<span className="empty-art"><CategoryIcon name="laptop" /><CategoryIcon name="badge" /></span>}
          title={t.mine.empty.title}
          body={t.mine.empty.body}
          action={<>{ask}<a className="button quiet" href="/chest/items"><Shelves />{t.mine.browse}</a></>}
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
                {held.seats.map(item => <Card key={item.id} item={item} heading={t.mine.licences} since={format(t.mine.seatSince, { date: long(item.seatSince.slice(0, 10)) })} />)}
              </ul>
            </section>
          )}
        </>
      )}
      {requests.length > 0 && (
        <section aria-labelledby="my-requests">
          <h2 id="my-requests" className="section-title">{t.mine.requests}</h2>
          <Island name="MyRequests" props={{
            requests: requests.map(r => ({ id: r.id, body: r.body, status: r.status, when: relative(r.createdAt, locale, now), answer: r.answer, kind: r.categoryId ? kindName.get(r.categoryId) ?? null : null })),
            t: { requests: t.requests },
          }} />
        </section>
      )}
    </div>
  ) };
}
