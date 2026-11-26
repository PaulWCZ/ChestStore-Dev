import { call, navigate, toast } from "@argentic/chest-app/client";
import { useState, useTransition } from "react";
import { Avatar, Dialog, SearchBox } from "@argentic/chest-ui/components";
import { StatusStamp } from "../components/bits.tsx";
import { CategoryIcon, Check, Close, Give, Inbox } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";
import { limits } from "../shared/model.ts";
import { useOffer } from "./offer.ts";

type Words = { overview: Catalogue["overview"]; requests: Catalogue["requests"]; common: Catalogue["common"]; dialog: Catalogue["dialog"]; search: Catalogue["search"] };
export type WaitingRequest = { id: string; member: string; name: string; photo: string | null; body: string; kind: string | null; categoryId: string | null; approved: boolean; when: string; gone: boolean };

// The requests waiting for the managers, on the overview: give something
// from the stock (the request is done), approve it (to buy; it stays here
// until given), or refuse it with a reason. The person hears each answer.
export function RequestsPanel({ requests, t }: { requests: WaitingRequest[]; t: Words }) {
  const [pending, start] = useTransition();
  const [giving, setGiving] = useState<WaitingRequest | null>(null);
  const [refusing, setRefusing] = useState<WaitingRequest | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const w = t.requests;
  // Things in stock, free seats, supplies left: read when the dialog opens
  // (the request's kind first), then as the manager types.
  const offer = useOffer(giving !== null, { categoryId: giving?.categoryId ?? null, consumables: true });
  const shown = offer.rows;

  const run = (step: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string, after?: () => void) => start(async () => {
    setError(null);
    const r = await step();
    if (!r.ok) return setError(r.message);
    after?.();
    // The person was told (their bell): the act has left, no Undo.
    toast({ text: done, sent: true });
  });

  return (
    <section className="panel" id="requests" aria-labelledby="requests-title">
      <h3 id="requests-title"><Inbox />{t.overview.requests}</h3>
      <ul className="plain">
        {requests.map(r => (
          <li key={r.id} id={`request-${r.id}`} className="problem">
            <div className="problem-head">
              <Avatar name={r.name} photo={r.photo} size="s" />
              <span className="small muted">{format(w.asked, { name: r.name, when: r.when })}{r.kind ? ` · ${r.kind}` : ""}</span>
              {r.approved && <StatusStamp status="approved" text={t.overview.approved} />}
            </div>
            <p className="quote">{r.body}</p>
            <div className="row">
              {!r.gone && <button type="button" className="button small" disabled={pending} onClick={() => { setError(null); setGiving(r); }}><Give />{w.give}</button>}
              {!r.approved && !r.gone && <button type="button" className="button small quiet" disabled={pending} onClick={() => run(() => call("approveRequest", { id: r.id }, { quiet: true }), format(w.approvedDone, { name: r.name }))}><Check />{w.approve}</button>}
              <button type="button" className="button small link" disabled={pending} onClick={() => { setReason(""); setError(null); setRefusing(r); }}><Close />{w.refuse}</button>
            </div>
          </li>
        ))}
      </ul>
      {error && !giving && !refusing && <p className="error" role="alert">{error}</p>}
      <Dialog open={giving !== null} title={format(w.giveTitle, { name: giving?.name ?? "" })} labels={t.dialog} onClose={() => setGiving(null)}>
        <div className="stack">
          {giving && <p className="quote">{giving.body}</p>}
          <SearchBox action="/chest/items" onSearch={offer.setQ} shortcut={false} labels={{ ...t.search, label: w.findStock, placeholder: w.findStock }} maxLength={limits.search} />
          {shown.length === 0 ? (offer.loading ? null : <p className="muted">{w.noStock}</p>) : (
            <ul className="pick-list" aria-busy={offer.loading}>
              {shown.map(o => (
                <li key={o.id}>
                  <button type="button" className="pick" disabled={pending || offer.loading} onClick={() => giving && run(() => call("fulfilRequest", { id: giving.id, itemId: o.id }, { quiet: true }), format(w.givenDone, { name: giving.name }), () => setGiving(null))}>
                    <span className="pick-icon" aria-hidden="true"><CategoryIcon name={o.icon} /></span>
                    <span className="pick-text"><span>{o.name}</span><span className="small muted"><span className="mono">{o.tag}</span> · {o.holder.kind === "seats" || o.holder.kind === "stock" ? o.holderText : o.category}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </Dialog>
      <Dialog open={refusing !== null} title={format(w.refuseTitle, { name: refusing?.name ?? "" })} labels={t.dialog} dirty={reason.trim() !== ""} onClose={() => setRefusing(null)}>
        <form className="stack" onSubmit={e => { e.preventDefault(); if (refusing) run(() => call("refuseRequest", { id: refusing.id, answer: reason }, { quiet: true }), format(w.refusedDone, { name: refusing.name }), () => setRefusing(null)); }}>
          <div className="form-field">
            <label className="label" htmlFor="refuse-reason">{w.reason}</label>
            <textarea id="refuse-reason" className="field" rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={limits.request} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => setRefusing(null)}>{t.common.cancel}</button>
            <button type="submit" className="button" disabled={pending}>{w.refuse}</button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
