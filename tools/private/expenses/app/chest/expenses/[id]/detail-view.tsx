"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Stamp, Warnings } from "../../../../components/bits.tsx";
import { Calendar, Car, Check, Close, Download, FileIcon, Pencil, Receipt, Trash } from "../../../../components/icons.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import type { StampKind } from "../../../../lib/rows.ts";
import { decideExpenses, removeExpense, restoreExpense } from "../../actions.ts";

type Words = Pick<Catalogue, "detail" | "receipt" | "form" | "errors"> & { deleted: string; approved: Catalogue["approve"]["approved"]; refused: string };

export function DetailView(props: {
  id: string;
  own: boolean;
  draft: boolean;
  decide: boolean;
  receipt: { image: string | null; open: string; download: string; name: string } | null;
  trip: string | null;
  // A flat rate: what it is (it has no receipt, by nature).
  flat: string | null;
  owner: string | null;
  amount: string;
  stamp: { kind: StampKind; text: string };
  card: string | null;
  facts: [string, string][];
  warnings: string[];
  reason: string | null;
  waitingFor: string | null;
  history: { when: string; text: string }[];
  t: Words;
  locale: string;
}) {
  const { t } = props;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const Glyph = props.trip ? Car : props.flat ? Calendar : props.receipt ? FileIcon : Receipt;

  function remove() {
    start(async () => {
      const result = await removeExpense(props.id);
      if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
      // Deleted, with an Undo that says whether it worked.
      toast({
        id: `delete-${props.id}`,
        text: t.deleted,
        undo: async () => {
          const back = await restoreExpense(props.id);
          router.refresh();
          return back.ok ? true : format(t.errors[back.error], back.values ?? {});
        },
      });
      router.push("/chest");
    });
  }

  function decide(verdict: "approve" | "refuse") {
    start(async () => {
      const result = await decideExpenses([props.id], verdict, verdict === "refuse" ? reason : undefined);
      if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
      // The owner has been told (the bell): no Undo.
      toast({ id: `decide-${props.id}`, text: verdict === "approve" ? plural(t.approved, 1, props.locale) : format(t.refused, { name: result.value.owner }), sent: true });
      router.push("/chest/approve");
      router.refresh();
    });
  }

  return (
    <div className="detail">
      <div className="receipt-view">
        {props.receipt?.image && !imageFailed
          ? <a href={props.receipt.open} target="_blank" rel="noopener"><img src={props.receipt.image} alt={format(t.receipt.preview, { what: props.receipt.name })} onError={() => setImageFailed(true)} /></a>
          : (
            <div className="none">
              <Glyph />
              <strong>{props.trip ?? props.flat ?? (props.receipt ? props.receipt.name : t.receipt.none)}</strong>
              {props.receipt && <a className="button quiet small" href={props.receipt.open} target="_blank" rel="noopener">{t.receipt.open}</a>}
            </div>
          )}
      </div>

      <div>
        <section className="paper">
          <div className="paper-head">
            <span className="label">{props.owner ?? t.receipt.title}</span>
            <Stamp kind={props.stamp.kind} text={props.stamp.text} big />
          </div>
          <p className="big-amount">{props.amount}</p>
          {props.card && <p className="hint">{props.card}</p>}
          {props.waitingFor && <p className="hint">{props.waitingFor}</p>}
          <hr className="rule" />
          <dl className="facts">
            {props.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {props.warnings.length > 0 && <><hr className="rule" /><div className="detail-warnings"><Warnings list={props.warnings} /></div></>}
          {props.reason && <p className="notice bad">{props.reason}</p>}
          {props.receipt && (
            <>
              <hr className="rule" />
              <div className="actions-bar">
                <a className="button quiet small" href={props.receipt.open} target="_blank" rel="noopener">{t.receipt.open}</a>
                <a className="button quiet small" href={props.receipt.download}><Download />{t.receipt.download}</a>
              </div>
            </>
          )}
          {(props.decide || (props.own && props.draft)) && <hr className="rule" />}
          {props.decide && !refusing && (
            <div className="actions-bar">
              <button type="button" className="button" onClick={() => decide("approve")} disabled={pending}><Check />{t.detail.approve}</button>
              <button type="button" className="button danger" onClick={() => setRefusing(true)} disabled={pending}><Close />{t.detail.refuse}</button>
            </div>
          )}
          {props.decide && refusing && (
            <form className="refuse-box" onSubmit={e => { e.preventDefault(); decide("refuse"); }}>
              <label htmlFor="reason" className="field-label">{t.detail.reason}</label>
              <textarea id="reason" className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder={t.detail.reasonPlaceholder} maxLength={500} autoFocus />
              <div className="actions-bar">
                <button type="submit" className="button danger" disabled={pending || reason.trim() === ""}>{t.detail.confirmRefuse}</button>
                <button type="button" className="button quiet" onClick={() => setRefusing(false)}>{t.form.cancel}</button>
              </div>
            </form>
          )}
          {props.own && props.draft && (
            <div className="actions-bar">
              <a className="button" href={`/chest/expenses/${props.id}/edit`}><Pencil />{t.detail.edit}</a>
              <button type="button" className="button danger" onClick={remove} disabled={pending}><Trash />{t.form.delete}</button>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>

        <section aria-labelledby="history">
          <h2 id="history" className="label history-title">{t.detail.history}</h2>
          <ol className="timeline">
            {props.history.map((h, i) => <li key={i}><time>{h.when}</time><span>{h.text}</span></li>)}
          </ol>
        </section>
      </div>
    </div>
  );
}
