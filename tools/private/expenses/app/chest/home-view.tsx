"use client";

import { EmptyState, PageHeader, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { DateBox, RowStamp, Thumb, Warning, Warnings } from "../../components/bits.tsx";
import { Camera, Car, Plus, Receipt, Send } from "../../components/icons.tsx";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format, plural } from "../../lib/i18n/format.ts";
import { formatMoney } from "../../lib/money.ts";
import type { RowView } from "../../lib/rows.ts";
import { sendExpenses } from "./actions.ts";

export type HomeGroup = { key: string; title: string; total: string; rows: RowView[] };
// blocked: refused and not changed since — it cannot be sent as it is, so
// it is never ticked; fixed: refused, then changed.
type Draft = RowView & { amountValue: number; currency: string; blocked: boolean; fixed: boolean };
type Words = { home: Catalogue["home"]; figures: { waiting: string; toPay: string; paid: string }; errors: Catalogue["errors"]; refused: string; companyCard: string };

export function HomeView({ locale, empty, figures, drafts, waiting, approved, history, limit, t }: {
  locale: string;
  empty: boolean;
  figures: { waiting: string; toPay: string; paid: string };
  drafts: Draft[];
  waiting: HomeGroup;
  approved: HomeGroup;
  history: HomeGroup[];
  limit: string | null;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  // Every draft is selected unless the person unticks it — except a refused
  // one not changed since, which waits for its fix.
  // A card payment still without its receipt is not ticked either: its
  // receipt comes first.
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set(drafts.filter(d => d.receiptNeeded).map(d => d.id)));
  const selected = drafts.filter(d => !d.blocked && !unticked.has(d.id));
  const total = useMemo(() => {
    const sums = new Map<string, number>();
    for (const d of selected) sums.set(d.currency, (sums.get(d.currency) ?? 0) + d.amountValue);
    return [...sums].map(([c, a]) => formatMoney(a, c, locale)).join(" + ");
  }, [selected, locale]);

  function toggle(id: string, on: boolean) {
    setUnticked(set => {
      const next = new Set(set);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    const ids = selected.map(d => d.id);
    start(async () => {
      const result = await sendExpenses(ids);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
      // The approver has been told: sent, never an Undo.
      toast({ id: "send", text: result.value.to === null ? plural(t.home.sentAlone, result.value.count, locale) : plural(t.home.sent, result.value.count, locale, { name: result.value.to }), sent: true });
      setUnticked(new Set(drafts.filter(d => d.receiptNeeded && !ids.includes(d.id)).map(d => d.id)));
      router.refresh();
    });
  }

  const dock = (
    <div className="dock">
      <a className="button" href="/chest/new"><Plus />{t.home.add}</a>
      <a className="button quiet" href="/chest/new?trip=1" aria-label={t.home.addTrip} title={t.home.addTrip}><Car /></a>
    </div>
  );

  if (empty) {
    return (
      <>
        <div className="paper">
          <EmptyState
            headingLevel={1}
            icon={<Receipt />}
            title={t.home.empty.title}
            body={t.home.empty.body}
            action={<><a className="button" href="/chest/new"><Plus />{t.home.empty.action}</a><a className="link-button" href="/chest/new?trip=1">{t.home.addTrip}</a></>}
          />
        </div>
        {dock}
      </>
    );
  }

  return (
    <>
      <PageHeader size="m" title={t.home.title} secondary={<a className="button quiet small hide-phone" href="/chest/new?trip=1"><Car />{t.home.addTrip}</a>} />
      <div className="figures">
        <div className="figure"><span className="label">{t.figures.waiting}</span><span className="amount">{figures.waiting}</span></div>
        <div className="figure money"><span className="label">{t.figures.toPay}</span><span className="amount">{figures.toPay}</span></div>
        <div className="figure"><span className="label">{t.figures.paid}</span><span className="amount">{figures.paid}</span></div>
      </div>

      {drafts.length > 0 && (
        <section className="paper" aria-labelledby="to-send">
          <div className="paper-head">
            <h2 id="to-send" className="label">{t.home.toSend}</h2>
            <span className="hint">{t.home.toSendHint}</span>
          </div>
          <hr className="rule" />
          <ul className="rows">
            {drafts.map(d => (
              <li key={d.id} className={d.receiptNeeded ? "row selectable needs-receipt" : "row selectable"}>
                {d.blocked
                  ? <span className="pick" aria-hidden="true" />
                  : <input type="checkbox" className="pick" checked={!unticked.has(d.id)} onChange={e => toggle(d.id, e.target.checked)} aria-label={`${t.home.select}: ${d.what}, ${d.amount}`} />}
                <Thumb row={d} />
                <a className="main" href={d.href}>
                  <span className="what">{d.what}</span>
                  <span className="sub"><span className="mono">{d.date}</span>{d.sub && <span>{d.sub}</span>}{d.card && !d.receiptNeeded && <span>{t.companyCard}</span>}{d.receiptNeeded ? <Warning text={t.home.receiptNeeded} /> : <Warnings list={d.warnings} />}</span>
                  {d.reason && <span className="reason">{format(t.home.refusedBecause, { reason: d.reason })}</span>}
                  {d.blocked && <span className="reason">{t.home.fixFirst}</span>}
                  {d.fixed && <span className="fixed">{t.home.fixed}</span>}
                </a>
                <span className="right">
                  <span className="amount">{d.amount}</span>
                  {d.blocked && <a className="button small quiet" href={`${d.href}/edit`}>{t.home.fix}<span className="visually-hidden">: {d.what}</span></a>}
                  {!d.blocked && d.receiptNeeded && <a className="button small quiet" href={`${d.href}/edit`}><Camera />{t.home.addReceipt}<span className="visually-hidden">: {d.what}</span></a>}
                  {!d.blocked && !d.receiptNeeded && d.stamp.kind === "refused" && <RowStamp row={d} />}
                </span>
              </li>
            ))}
          </ul>
          <hr className="rule" />
          <div className="total-line"><span className="label">{plural(t.home.count, selected.length, locale)}</span><span className="amount">{total || "—"}</span></div>
          <button type="button" className="button block send" onClick={send} disabled={pending || selected.length === 0}>
            <Send />{plural(t.home.send, selected.length, locale)}
          </button>
        </section>
      )}

      {[waiting, approved].filter(g => g.rows.length > 0).map(g => <Group key={g.key} group={g} companyCard={t.companyCard} />)}
      {history.length > 0 && <h2 className="section label earlier-title">{t.home.history}</h2>}
      {history.map(g => <Group key={g.key} group={g} companyCard={t.companyCard} />)}
      {limit && <p className="hint limit-hint">{limit}</p>}
      {dock}
    </>
  );
}

function Group({ group, companyCard }: { group: HomeGroup; companyCard: string }) {
  return (
    <section className="section" aria-label={group.title}>
      <h2><span>{group.title}</span><span className="amount">{group.total}</span></h2>
      <ul className="rows">
        {group.rows.map(r => (
          <li key={r.id} className="row">
            <DateBox row={r} />
            <a className="main" href={r.href}>
              <span className="what">{r.what}</span>
              <span className="sub">{r.sub && <span>{r.sub}</span>}{r.card && <span>{companyCard}</span>}<Warnings list={r.warnings} /></span>
            </a>
            <span className="right"><span className="amount">{r.amount}</span><RowStamp row={r} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
