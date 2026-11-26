import { call, fill, toast } from "@argentic/chest-app/client";
import { Confirm, Dialog } from "@argentic/chest-ui/components";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { Box } from "../components/box.tsx";
import { Alert, Bin, Check, Send } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

type Words = { settings: Catalogue["settings"]; dialog: DialogWords };
type Kind = "slack" | "teams" | "generic";
type Event = "new" | "replied" | "late";
export type NoticeTarget = { id: string; kind: Kind; label: string; shown: string; events: Event[]; disabled: boolean; lastError: string | null; status: "delivered" | "failed" | "disabled" | null };

const kinds: Kind[] = ["slack", "teams", "generic"];
const events: Event[] = ["new", "replied", "late"];

// Settings: notices to the team's chat (Proposal (studio): webhooks) — the
// channels that are told, each with what it is told (ticked here, saved at
// once), its state as the Chest reports it (stopped: Try again), and a
// form to add one — Slack, Teams, or another service's web address. A
// generic receiver's secret key is shown once, in a dialog. Removing asks
// first: the Chest forgets the address, so it cannot be undone.
export function NoticesBox({ delivery, targets, canSettings, t }: { delivery: "ready" | "not_granted" | "suspended" | "unknown"; targets: NoticeTarget[]; canSettings: boolean; t: Words }) {
  const s = t.settings;
  const available = delivery === "ready";
  const [pending, setPending] = useState(false);
  const [kind, setKind] = useState<Kind>("slack");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [chosen, setChosen] = useState<Event[]>(["new"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState<NoticeTarget | null>(null);
  async function busy<T>(step: () => Promise<T>): Promise<T> {
    setPending(true);
    try {
      return await step();
    } finally {
      setPending(false);
    }
  }
  const add = () => busy(async () => {
    const r = await call("addNoticeTarget", { url, kind, label, events: chosen });
    if (!r.ok) return;
    setUrl("");
    setLabel("");
    toast(s.noticeAdded);
    if (r.value.secret) setSecret(r.value.secret);
  });
  const toggle = (target: NoticeTarget, event: Event, on: boolean) => busy(async () => {
    const next = events.filter(e => (e === event ? on : target.events.includes(e)));
    const r = await call("setNoticeEvents", { id: target.id, events: next });
    if (r.ok) toast({ id: "notice-events", text: s.noticeSaved });
  });
  const retry = (target: NoticeTarget) => busy(async () => {
    const r = await call("enableNoticeTarget", { id: target.id });
    if (r.ok) toast(s.noticeRetried);
  });
  const remove = () => busy(async () => {
    if (!removing) return;
    const r = await call("removeNoticeTarget", { id: removing.id });
    setRemoving(null);
    if (r.ok) toast(s.noticeRemoved);
  });
  return (
    <Box title={s.noticesTitle} icon={<Send />} id="notices">
      <p className="hint">{s.noticesHint}</p>
      {!available && <p className="notice warm"><Alert />{delivery === "suspended" ? s.noticesSuspended : delivery === "unknown" ? s.noticesUnknown : s.noticesUnavailable}</p>}
      {targets.length === 0 ? (available && <p className="muted">{s.noticesNone}</p>) : (
        <ul className="notice-targets">
          {targets.map(target => (
            <li key={target.id} className="notice-target">
              <div className="row between">
                <p><strong>{target.label}</strong> <span className="muted small">{s.noticeKinds[target.kind]} · <code>{target.shown}</code></span></p>
                {canSettings && <button type="button" className="link-button danger" onClick={() => setRemoving(target)}><Bin />{s.noticeRemove}</button>}
              </div>
              {target.disabled ? (
                <p className="notice danger small"><Alert /><span>{fill(s.noticeStopped, { reason: target.lastError ?? "—" })}</span>
                  {canSettings && <button type="button" className="ck-button ck-button-quiet ck-button-small" disabled={pending} onClick={() => void retry(target)}>{s.noticeRetry}</button>}</p>
              ) : target.status === "delivered" ? <p className="small muted"><Check /> {s.noticeDelivered}</p>
                : target.status === "failed" ? <p className="small"><Alert /> {fill(s.noticeFailed, { reason: target.lastError ?? "—" })}</p> : null}
              <fieldset className="checks" disabled={!canSettings || pending}>
                <legend className="label small">{s.noticeEvents}</legend>
                {events.map(e => (
                  <label key={e} className="check-label"><input type="checkbox" checked={target.events.includes(e)} onChange={ev => void toggle(target, e, ev.target.checked)} />{s.noticeEventNames[e]}</label>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>
      )}
      {canSettings && available && (
        <form className="stack notice-add" onSubmit={e => { e.preventDefault(); void add(); }}>
          <h3>{s.noticeAdd}</h3>
          <div>
            <label className="label" htmlFor="notice-kind">{s.noticeKind}</label>
            <select id="notice-kind" className="select medium" value={kind} onChange={e => setKind(e.target.value as Kind)}>
              {kinds.map(k => <option key={k} value={k}>{s.noticeKinds[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="notice-url">{s.noticeUrl}</label>
            <input id="notice-url" className="field" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} required maxLength={2048} spellCheck={false} autoComplete="off" aria-describedby="notice-url-hint" />
            <p id="notice-url-hint" className="hint under">{s.noticeUrlHints[kind]}</p>
          </div>
          <div>
            <label className="label" htmlFor="notice-label">{s.noticeLabel}</label>
            <input id="notice-label" className="field medium" value={label} onChange={e => setLabel(e.target.value)} required maxLength={80} placeholder={s.noticeLabelPlaceholder} />
          </div>
          <fieldset className="checks">
            <legend className="label">{s.noticeEvents}</legend>
            {events.map(e => (
              <label key={e} className="check-label"><input type="checkbox" checked={chosen.includes(e)} onChange={ev => setChosen(c => events.filter(x => (x === e ? ev.target.checked : c.includes(x))))} />{s.noticeEventNames[e]}</label>
            ))}
          </fieldset>
          {chosen.includes("late") && <p className="hint">{s.noticeLate}</p>}
          <div><button type="submit" className="ck-button" disabled={pending || !url.trim() || !label.trim() || chosen.length === 0}>{s.noticeAdd}</button></div>
        </form>
      )}
      <Dialog open={secret !== null} title={s.noticeSecretTitle} onClose={() => setSecret(null)} labels={t.dialog} size="s"
        footer={<button type="button" className="ck-button" onClick={() => setSecret(null)}>{s.noticeSecretDone}</button>}>
        <p>{s.noticeSecretBody}</p>
        <label className="visually-hidden" htmlFor="notice-secret">{s.noticeSecretTitle}</label>
        <input id="notice-secret" className="field code" readOnly value={secret ?? ""} onFocus={e => e.currentTarget.select()} />
      </Dialog>
      <Confirm open={removing !== null} title={fill(s.noticeRemoveTitle, { label: removing?.label ?? "" })} body={s.noticeRemoveBody} confirmLabel={s.noticeRemove} cancelLabel={s.cancel}
        busy={pending} onConfirm={() => void remove()} onCancel={() => setRemoving(null)} />
    </Box>
  );
}
