"use client";

import { Confirm, Dialog, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ErrorCode } from "../../../../../../lib/app-error.ts";
import { format } from "../../../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../../../lib/i18n/index.ts";
import { addFormHook, enableFormHook, removeFormHook } from "../../../../actions.ts";

type Kind = "slack" | "teams" | "generic";
export type FormHook = { id: string; kind: Kind; label: string; shown: string; disabled: boolean; lastError: string | null; status: "delivered" | "failed" | "disabled" | null };
const kinds: Kind[] = ["slack", "teams", "generic"];

// Each new answer sent to web addresses (Proposal (studio): webhooks,
// lib/hooks.ts): the addresses of this form, each with its state as the
// Chest reports it (stopped: Try again), and a small form to add one —
// Slack, Teams, or another service. A generic receiver's secret key is
// shown once, in a dialog. Removing asks first: the Chest forgets the
// address, so it cannot be undone.
export function HooksBox({ formId, delivery, hooks, anonymous, canEdit, t }: { formId: string; delivery: "ready" | "not_granted" | "suspended" | "unknown"; hooks: FormHook[]; anonymous: boolean; canEdit: boolean; t: { s: Catalogue["settings"]; errors: Catalogue["errors"]; dialog: Catalogue["dialog"] } }) {
  const s = t.s;
  const available = delivery === "ready";
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<Kind>("slack");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FormHook | null>(null);
  const fail = (error: ErrorCode, values?: Record<string, string | number>) => void toast({ id: "hooks", text: format(t.errors[error], values ?? {}), tone: "error" });
  const add = () => start(async () => {
    const r = await addFormHook(formId, { url, kind, label });
    if (!r.ok) return fail(r.error, r.values);
    setUrl("");
    setLabel("");
    toast({ id: "hooks", text: s.hookAdded });
    if (r.value.secret) setSecret(r.value.secret);
    router.refresh();
  });
  const retry = (hook: FormHook) => start(async () => {
    const r = await enableFormHook(formId, hook.id);
    if (!r.ok) return fail(r.error, r.values);
    toast({ id: "hooks", text: s.hookRetried });
    router.refresh();
  });
  const remove = () => start(async () => {
    if (!removing) return;
    const r = await removeFormHook(formId, removing.id);
    setRemoving(null);
    if (!r.ok) return fail(r.error, r.values);
    toast({ id: "hooks", text: s.hookRemoved });
    router.refresh();
  });
  return (
    <fieldset className="panel hooks">
      <legend>{s.hooksTitle}</legend>
      {anonymous ? <p className="hint">{s.hooksAnonymous}</p> : (
        <>
          <p className="hint">{s.hooksHint}</p>
          {!available && <p className="notice">{delivery === "suspended" ? s.hooksPaused : delivery === "unknown" ? s.hooksUnknown : s.hooksUnavailable}</p>}
          {hooks.length > 0 && (
            <ul className="hook-list">
              {hooks.map(hook => (
                <li key={hook.id} className="hook">
                  <div className="hook-head">
                    <p><strong>{hook.label}</strong> <span className="dim">{s.hookKinds[hook.kind]} · <code>{hook.shown}</code></span></p>
                    {canEdit && <button type="button" className="button link danger" onClick={() => setRemoving(hook)}>{s.hookRemove}</button>}
                  </div>
                  {hook.disabled ? (
                    <p className="notice hook-state"><span>{format(s.hookStopped, { reason: hook.lastError ?? "—" })}</span>
                      {canEdit && <button type="button" className="button quiet small" disabled={pending} onClick={() => retry(hook)}>{s.hookRetry}</button>}</p>
                  ) : hook.status === "delivered" ? <p className="hint">{s.hookDelivered}</p>
                    : hook.status === "failed" ? <p className="notice hook-state">{format(s.hookFailed, { reason: hook.lastError ?? "—" })}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit && available && (
            <div className="hook-add" role="group" aria-labelledby="hook-add-title">
              <h3 id="hook-add-title" className="mini-label">{s.hookAdd}</h3>
              <label className="mini block" htmlFor="hook-kind">
                <span className="mini-label">{s.hookKind}</span>
                <select id="hook-kind" className="field" value={kind} onChange={e => setKind(e.target.value as Kind)}>
                  {kinds.map(k => <option key={k} value={k}>{s.hookKinds[k]}</option>)}
                </select>
              </label>
              <label className="mini block" htmlFor="hook-url">
                <span className="mini-label">{s.hookUrl}</span>
                <input id="hook-url" className="field" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} maxLength={2048} spellCheck={false} autoComplete="off" aria-describedby="hook-url-hint" />
                <span id="hook-url-hint" className="hint">{s.hookUrlHints[kind]}</span>
              </label>
              <label className="mini block" htmlFor="hook-label">
                <span className="mini-label">{s.hookLabel}</span>
                <input id="hook-label" className="field" value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder={s.hookLabelPlaceholder} />
              </label>
              <div><button type="button" className="button" disabled={pending || !url.trim() || !label.trim()} onClick={add}>{s.hookAdd}</button></div>
            </div>
          )}
        </>
      )}
      <Dialog open={secret !== null} title={s.hookSecretTitle} onClose={() => setSecret(null)} labels={t.dialog} size="s"
        footer={<button type="button" className="button" onClick={() => setSecret(null)}>{s.hookSecretDone}</button>}>
        <p>{s.hookSecretBody}</p>
        <label className="visually-hidden" htmlFor="hook-secret">{s.hookSecretTitle}</label>
        <input id="hook-secret" className="field code" readOnly value={secret ?? ""} onFocus={e => e.currentTarget.select()} />
      </Dialog>
      <Confirm open={removing !== null} title={format(s.hookRemoveTitle, { label: removing?.label ?? "" })} body={s.hookRemoveBody} confirmLabel={s.hookRemove} cancelLabel={s.hookCancel}
        busy={pending} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </fieldset>
  );
}
