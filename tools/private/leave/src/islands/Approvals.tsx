import type { Outcome } from "@argentic/chest-app/client";
import { call, toast } from "@argentic/chest-app/client";
import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Check, Close } from "../components/icons.tsx";
import { format } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

export type Card = {
  id: string;
  name: string;
  avatarName: string;
  firstName: string;
  photo: string | null;
  type: string;
  color: string;
  when: string;
  days: string;
  note: string;
  cancelAsked: boolean;
  balance: string | null;
  balanceNote: string | null;
  short: boolean;
  alsoAway: string | null;
  asked: string;
  approver: string | null;
  mine: boolean;
};
type Words = { approvals: Catalogue["approvals"]; home: Catalogue["home"] };

// Each request as a card: who, what, when, what it leaves; "Approve" is the
// obvious action, "Refuse" asks for an optional word first. An answer can
// be taken back for ten minutes ("Undo"): the person's bell item about it
// is withdrawn then (lib/tell.ts), so the Undo tells the truth.
export function Approvals({ cards, hr, t }: { cards: readonly Card[]; hr: boolean; t: Words }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = cards.filter(c => !gone.has(c.id));
  const hide = (id: string, hidden: boolean) => setGone(g => { const n = new Set(g); if (hidden) n.add(id); else n.delete(id); return n; });
  if (shown.length === 0) {
    return (
      <div className="calm">
        <EmptyState title={t.approvals.empty} body={t.approvals.emptyBody} />
      </div>
    );
  }
  const mine = shown.filter(c => c.mine);
  const others = shown.filter(c => !c.mine);
  return (
    <>
      {hr && mine.length > 0 && others.length > 0 && <h2 className="section-title">{t.approvals.forYou}</h2>}
      <ul className="cards">{mine.map(c => <Item key={c.id} card={c} t={t} hide={hide} />)}</ul>
      {others.length > 0 && (
        <section className="group">
          <h2 className="section-title">{t.approvals.others}</h2>
          <p className="muted">{t.approvals.othersHint}</p>
          <ul className="cards">{others.map(c => <Item key={c.id} card={c} t={t} hide={hide} />)}</ul>
        </section>
      )}
    </>
  );
}

function Item({ card, t, hide }: { card: Card; t: Words; hide: (id: string, hidden: boolean) => void }) {
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  // The card leaves at once; a refusal puts it back (the toast says why).
  async function run(step: () => Promise<Outcome<null>>, done: string, undo: boolean) {
    hide(card.id, true);
    setPending(true);
    const result = await step();
    setPending(false);
    if (!result.ok) return hide(card.id, false);
    toast({
      id: `answer-${card.id}`,
      text: done,
      ...(undo ? {
        undo: async () => {
          const back = await call("takeBack", { id: card.id }, { quiet: true });
          if (!back.ok) return back.message;
          hide(card.id, false);
          return true;
        },
      } : { sent: true }),
    });
  }

  return (
    <li className="card" id={`r-${card.id}`}>
      <div className="card-head">
        <Avatar name={card.avatarName} photo={card.photo} size="l" />
        <div>
          <p className="card-who"><a href={`/chest/requests/${card.id}`}>{card.name}</a></p>
          <p className="muted small">{card.asked}{card.approver && !card.mine ? " · " + card.approver : ""}</p>
        </div>
        <span className={`kind k-${card.color}`}>{card.type}</span>
      </div>
      {card.cancelAsked && <p className="flag">{t.approvals.asksCancel}</p>}
      <p className="card-when"><strong>{card.when}</strong> <span className="muted">· {card.days}</span></p>
      {card.balance && <p className={card.short ? "card-balance short" : "card-balance"}>{card.balance}{card.balanceNote && <span className="muted small"> · {card.balanceNote}</span>}</p>}
      {card.note && <blockquote className="card-note"><span className="visually-hidden">{t.approvals.note}: </span>{card.note}</blockquote>}
      {card.alsoAway && <p className="muted small">{card.alsoAway}</p>}
      {card.cancelAsked ? (
        <div className="card-actions">
          <button type="button" className="button" disabled={pending} onClick={() => void run(() => call("settleCancel", { id: card.id, accept: true }), t.approvals.cancelDone, false)}>{t.approvals.confirmCancel}</button>
          <button type="button" className="button quiet" disabled={pending} onClick={() => void run(() => call("settleCancel", { id: card.id, accept: false }), format(t.approvals.keptDone, { name: card.firstName }), false)}>{t.approvals.keep}</button>
        </div>
      ) : refusing ? (
        <form className="card-refuse" onSubmit={e => { e.preventDefault(); void run(() => call("answer", { id: card.id, verdict: "refuse", reason }), format(t.approvals.refused, { name: card.firstName }), true); }}>
          <label htmlFor={`reason-${card.id}`}>{t.approvals.reason}</label>
          <input id={`reason-${card.id}`} className="field" maxLength={300} autoFocus placeholder={format(t.approvals.reasonPlaceholder, { name: card.firstName })} value={reason} onChange={e => setReason(e.target.value)} />
          <div className="card-actions">
            <button type="submit" className="button danger" disabled={pending}>{t.approvals.confirmRefuse}</button>
            <button type="button" className="button quiet" onClick={() => setRefusing(false)}>{t.home.cancel}</button>
          </div>
        </form>
      ) : (
        <div className="card-actions">
          <button type="button" className="button" disabled={pending} onClick={() => void run(() => call("answer", { id: card.id, verdict: "approve" }), format(t.approvals.approved, { name: card.firstName }), true)}><Check />{t.approvals.approve}</button>
          <button type="button" className="button quiet" disabled={pending} onClick={() => setRefusing(true)}><Close />{t.approvals.refuse}</button>
        </div>
      )}
    </li>
  );
}
