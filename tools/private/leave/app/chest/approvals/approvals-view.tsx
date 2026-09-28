"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Check, Close } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { answer, settleCancel, takeBack } from "../actions.ts";

export type Card = {
  id: string;
  name: string;
  firstName: string;
  photo: string | null;
  type: string;
  color: string;
  when: string;
  days: string;
  note: string;
  cancelAsked: boolean;
  balance: string | null;
  short: boolean;
  alsoAway: string | null;
  asked: string;
  approver: string | null;
  mine: boolean;
};
type Words = { approvals: Catalogue["approvals"]; errors: Catalogue["errors"]; home: Catalogue["home"] };

// Each request as a card: who, what, when, what it leaves; "Approve" is the
// obvious action, "Refuse" asks for an optional word first. An answer can
// be taken back for ten minutes ("Undo").
export function Approvals({ cards, hr, t }: { cards: Card[]; hr: boolean; t: Words }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const shown = cards.filter(c => !gone.has(c.id));
  const hide = (id: string, hidden: boolean) => setGone(g => { const n = new Set(g); if (hidden) n.add(id); else n.delete(id); return n; });
  if (shown.length === 0) {
    return (
      <div className="empty calm">
        <h2>{t.approvals.empty}</h2>
        <p>{t.approvals.emptyBody}</p>
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
  const router = useRouter();
  const toast = useToast();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function run(step: () => ReturnType<typeof answer>, done: string, undo: boolean) {
    hide(card.id, true);
    start(async () => {
      const result = await step();
      if (!result.ok) {
        hide(card.id, false);
        toast(format(t.errors[result.error as ErrorCode], result.values));
        return;
      }
      toast(done, undo ? {
        label: t.home.undo,
        run: () => start(async () => {
          const back = await takeBack(card.id);
          if (back.ok) hide(card.id, false);
          else toast(format(t.errors[back.error as ErrorCode], back.values));
          router.refresh();
        }),
      } : undefined);
      router.refresh();
    });
  }

  return (
    <li className="card" id={`r-${card.id}`}>
      <div className="card-head">
        <Avatar name={card.name} photo={card.photo} size={40} />
        <div>
          <p className="card-who"><Link href={`/chest/requests/${card.id}`}>{card.name}</Link></p>
          <p className="muted small">{card.asked}{card.approver && !card.mine ? " · " + card.approver : ""}</p>
        </div>
        <span className={`kind k-${card.color}`}>{card.type}</span>
      </div>
      {card.cancelAsked && <p className="flag">{t.approvals.asksCancel}</p>}
      <p className="card-when"><strong>{card.when}</strong> <span className="muted">· {card.days}</span></p>
      {card.balance && <p className={card.short ? "card-balance short" : "card-balance"}>{card.balance}</p>}
      {card.note && <blockquote className="card-note"><span className="visually-hidden">{t.approvals.note}: </span>{card.note}</blockquote>}
      {card.alsoAway && <p className="muted small">{card.alsoAway}</p>}
      {card.cancelAsked ? (
        <div className="card-actions">
          <button type="button" className="button" disabled={pending} onClick={() => run(() => settleCancel(card.id, true, ""), t.approvals.cancelDone, false)}>{t.approvals.confirmCancel}</button>
          <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => settleCancel(card.id, false, ""), format(t.approvals.keptDone, { name: card.firstName }), false)}>{t.approvals.keep}</button>
        </div>
      ) : refusing ? (
        <form className="card-refuse" onSubmit={e => { e.preventDefault(); run(() => answer(card.id, "refuse", reason), format(t.approvals.refused, { name: card.firstName }), true); }}>
          <label htmlFor={`reason-${card.id}`}>{t.approvals.reason}</label>
          <input id={`reason-${card.id}`} className="field" maxLength={300} autoFocus placeholder={format(t.approvals.reasonPlaceholder, { name: card.firstName })} value={reason} onChange={e => setReason(e.target.value)} />
          <div className="card-actions">
            <button type="submit" className="button danger" disabled={pending}>{t.approvals.confirmRefuse}</button>
            <button type="button" className="button quiet" onClick={() => setRefusing(false)}>{t.home.cancel}</button>
          </div>
        </form>
      ) : (
        <div className="card-actions">
          <button type="button" className="button" disabled={pending} onClick={() => run(() => answer(card.id, "approve", ""), format(t.approvals.approved, { name: card.firstName }), true)}><Check />{t.approvals.approve}</button>
          <button type="button" className="button quiet" disabled={pending} onClick={() => setRefusing(true)}><Close />{t.approvals.refuse}</button>
        </div>
      )}
    </li>
  );
}
