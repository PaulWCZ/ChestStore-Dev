"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Dialog } from "../../components/dialog.tsx";
import { CategoryIcon, Check, Close, Give, Inbox, Search } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format } from "../../lib/i18n/format.ts";
import { fold, limits } from "../../lib/model.ts";
import type { Row } from "../../lib/view.ts";
import { approveRequest, fulfilRequest, refuseRequest } from "./actions.ts";

type Words = { overview: Catalogue["overview"]; requests: Catalogue["requests"]; errors: Catalogue["errors"]; common: Catalogue["common"] };
export type WaitingRequest = { id: string; member: string; name: string; photo: string | null; body: string; kind: string | null; categoryId: string | null; approved: boolean; when: string; gone: boolean };

// The requests waiting for the managers, on the overview: give something
// from the stock (the request is done), approve it (to buy; it stays here
// until given), or refuse it with a reason. The person hears each answer.
export function RequestsPanel({ requests, offer, t }: { requests: WaitingRequest[]; offer: (Row & { categoryId: string })[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [giving, setGiving] = useState<WaitingRequest | null>(null);
  const [refusing, setRefusing] = useState<WaitingRequest | null>(null);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const w = t.requests;
  const shown = useMemo(() => {
    if (!giving) return [];
    const k = fold(q);
    const same = offer.filter(o => !giving.categoryId || o.categoryId === giving.categoryId);
    const pool = k ? offer : same.length > 0 ? same : offer;
    return pool.filter(o => !k || fold(`${o.name} ${o.tag} ${o.category} ${o.serial ?? ""}`).includes(k)).slice(0, 60);
  }, [offer, giving, q]);

  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done: string, after?: () => void) => start(async () => {
    setError(null);
    const r = await step();
    if (!r.ok) return setError(format(t.errors[r.error ?? "unknown"], r.values));
    after?.();
    toast(done);
    router.refresh();
  });

  return (
    <section className="panel" id="requests" aria-labelledby="requests-title">
      <h3 id="requests-title"><Inbox />{t.overview.requests}</h3>
      <ul className="plain">
        {requests.map(r => (
          <li key={r.id} className="problem">
            <div className="problem-head">
              <Avatar name={r.name} photo={r.photo} size={24} />
              <span className="small muted">{format(w.asked, { name: r.name, when: r.when })}{r.kind ? ` · ${r.kind}` : ""}</span>
              {r.approved && <span className="stamp rq-approved">{t.overview.approved}</span>}
            </div>
            <p className="quote">{r.body}</p>
            <div className="row">
              {!r.gone && <button type="button" className="button small" disabled={pending} onClick={() => { setQ(""); setError(null); setGiving(r); }}><Give />{w.give}</button>}
              {!r.approved && !r.gone && <button type="button" className="button small quiet" disabled={pending} onClick={() => run(() => approveRequest(r.id), format(w.approvedDone, { name: r.name }))}><Check />{w.approve}</button>}
              <button type="button" className="button small link" disabled={pending} onClick={() => { setReason(""); setError(null); setRefusing(r); }}><Close />{w.refuse}</button>
            </div>
          </li>
        ))}
      </ul>
      {error && !giving && !refusing && <p className="error" role="alert">{error}</p>}
      <Dialog open={giving !== null} title={format(w.giveTitle, { name: giving?.name ?? "" })} closeLabel={t.common.close} onClose={() => setGiving(null)}>
        <div className="stack">
          {giving && <p className="quote">{giving.body}</p>}
          <div className="search-field">
            <Search />
            <label className="visually-hidden" htmlFor="request-q">{w.findStock}</label>
            <input id="request-q" className="field" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={w.findStock} autoFocus autoComplete="off" maxLength={limits.search} />
          </div>
          {shown.length === 0 ? <p className="muted">{w.noStock}</p> : (
            <ul className="pick-list">
              {shown.map(o => (
                <li key={o.id}>
                  <button type="button" className="pick" disabled={pending} onClick={() => giving && run(() => fulfilRequest(giving.id, o.id), format(w.givenDone, { name: giving.name }), () => setGiving(null))}>
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
      <Dialog open={refusing !== null} title={format(w.refuseTitle, { name: refusing?.name ?? "" })} closeLabel={t.common.close} onClose={() => setRefusing(null)}>
        <form className="stack" onSubmit={e => { e.preventDefault(); if (refusing) run(() => refuseRequest(refusing.id, reason), format(w.refusedDone, { name: refusing.name }), () => setRefusing(null)); }}>
          <div className="form-field">
            <label className="label" htmlFor="refuse-reason">{w.reason}</label>
            <textarea id="refuse-reason" className="field" rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={limits.request} autoFocus />
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
