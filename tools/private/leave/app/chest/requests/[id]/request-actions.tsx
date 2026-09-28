"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Close } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Result } from "../../../../lib/errors.ts";
import { answer, cancelLeave, settleCancel, takeBack } from "../../actions.ts";

type Words = { approvals: Catalogue["approvals"]; home: Catalogue["home"]; request: Catalogue["request"]; errors: Catalogue["errors"] };

// What the viewer may do with one request, and nothing else.
export function RequestActions(props: {
  id: string;
  canCancel: boolean;
  canAskCancel: boolean;
  canDecide: boolean;
  canSettle: boolean;
  canCancelApproved: boolean;
  canReopen: boolean;
  firstName: string;
  t: Words;
}) {
  const { id, t } = props;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [refusing, setRefusing] = useState(false);
  // Cancelling approved leave asks for a word first (the person is told).
  const [withdrawing, setWithdrawing] = useState(false);

  function run(step: () => Promise<Result<unknown>>, done: string) {
    start(async () => {
      const result = await step();
      if (!result.ok) toast(format(t.errors[result.error as ErrorCode], result.values));
      else toast(done);
      setRefusing(false);
      router.refresh();
    });
  }

  const any = props.canCancel || props.canAskCancel || props.canDecide || props.canSettle || props.canCancelApproved || props.canReopen;
  if (!any) return null;
  return (
    <div className="detail-actions">
      {props.canDecide && !refusing && (
        <>
          <button type="button" className="button" disabled={pending} onClick={() => run(() => answer(id, "approve", ""), format(t.approvals.approved, { name: props.firstName }))}><Check />{t.approvals.approve}</button>
          <button type="button" className="button quiet" disabled={pending} onClick={() => setRefusing(true)}><Close />{t.approvals.refuse}</button>
        </>
      )}
      {props.canDecide && refusing && (
        <form className="card-refuse" onSubmit={e => { e.preventDefault(); run(() => answer(id, "refuse", reason), format(t.approvals.refused, { name: props.firstName })); }}>
          <label htmlFor="reason">{t.approvals.reason}</label>
          <input id="reason" className="field" maxLength={300} autoFocus placeholder={format(t.approvals.reasonPlaceholder, { name: props.firstName })} value={reason} onChange={e => setReason(e.target.value)} />
          <div className="card-actions">
            <button type="submit" className="button danger" disabled={pending}>{t.approvals.confirmRefuse}</button>
            <button type="button" className="button quiet" onClick={() => setRefusing(false)}>{t.home.cancel}</button>
          </div>
        </form>
      )}
      {props.canSettle && (
        <>
          <button type="button" className="button" disabled={pending} onClick={() => run(() => settleCancel(id, true, ""), t.approvals.cancelDone)}>{t.approvals.confirmCancel}</button>
          <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => settleCancel(id, false, ""), format(t.approvals.keptDone, { name: props.firstName }))}>{t.approvals.keep}</button>
        </>
      )}
      {props.canCancelApproved && !withdrawing && <button type="button" className="button quiet" disabled={pending} onClick={() => setWithdrawing(true)}>{t.request.cancelLeave}</button>}
      {props.canCancelApproved && withdrawing && (
        <form className="card-refuse" onSubmit={e => { e.preventDefault(); run(() => settleCancel(id, true, reason), t.approvals.cancelDone); setWithdrawing(false); }}>
          <label htmlFor="why">{t.approvals.reason}</label>
          <input id="why" className="field" maxLength={300} autoFocus placeholder={format(t.approvals.reasonPlaceholder, { name: props.firstName })} value={reason} onChange={e => setReason(e.target.value)} />
          <div className="card-actions">
            <button type="submit" className="button danger" disabled={pending}>{t.approvals.confirmCancel}</button>
            <button type="button" className="button quiet" onClick={() => setWithdrawing(false)}>{t.approvals.keep}</button>
          </div>
        </form>
      )}
      {props.canReopen && <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => takeBack(id), t.request.reopen)}>{t.request.reopen}</button>}
      {props.canCancel && <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => cancelLeave(id), t.home.cancelled)}>{t.home.cancel}</button>}
      {props.canAskCancel && <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => cancelLeave(id), t.home.cancelAsked)}>{t.home.askCancel}</button>}
    </div>
  );
}
