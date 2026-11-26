import { Dialog } from "@argentic/chest-ui/components";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { call, fill as format, toast } from "@argentic/chest-app/client";
import { useId, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { Pencil } from "../components/icons.tsx";
import { limits } from "../shared/model.ts";

// "Request a change" on My HR record: the person proposes a new home
// address or emergency contact; HR accepts or declines it on the record.
type Askable = "address" | "emergencyName" | "emergencyRelation" | "emergencyPhone";
const askable: Askable[] = ["address", "emergencyName", "emergencyRelation", "emergencyPhone"];
export type ChangeWords = {
  ask: string; askTitle: string; askLead: string; note: string; send: string; sent: string; cancel: string;
  waiting: string; takeBack: string; takenBack: string;
  asks: string; accept: string; decline: string; answer: string; accepted: string; declined: string; from: string; to: string; empty: string;
};
type Words = { change: ChangeWords; fields: Record<Askable, string>; emergency: string; dialog: DialogWords };
export type Waiting = { id: string; changes: Partial<Record<Askable, string>>; note: string; asked: string };

// A field's name in a list of changes: the emergency contact's say so.
const label = (t: Words, f: Askable) => (f === "address" ? t.fields[f] : `${t.emergency} · ${t.fields[f]}`);

// The person's side: a button, a dialog with what HR keeps now, and — once
// sent — what waits, with "Take it back".
export function AskChange({ recordId, current, waiting, t }: { recordId: string; current: Record<Askable, string>; waiting: Waiting | null; t: Words }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(current);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useBusy();
  const dirty = askable.some(f => values[f] !== current[f]) || note !== "";
  if (waiting) {
    return (
      <div className="banner change-waiting" role="status">
        <div>
          <p><strong>{format(t.change.waiting, { date: waiting.asked })}</strong></p>
          <ChangeList changes={waiting.changes} t={t} />
        </div>
        <button type="button" className="button quiet small" disabled={pending} onClick={() => void run(async () => {
          const r = await call("withdrawChange", { id: waiting.id });
          if (r.ok) toast({ id: "change", text: t.change.takenBack });
        })}>{t.change.takeBack}</button>
      </div>
    );
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const changed = Object.fromEntries(askable.filter(f => values[f] !== current[f]).map(f => [f, values[f]]));
    void run(async () => {
      const r = await call("askChange", { id: recordId, input: { ...changed, note } }, { quiet: true });
      if (!r.ok) { setError(r.message); return; }
      setOpen(false);
      setNote("");
      toast({ id: "change", text: t.change.sent, sent: true });
    });
  };
  return (
    <>
      <button type="button" className="button quiet" onClick={() => { setValues(current); setError(null); setOpen(true); }}><Pencil />{t.change.ask}</button>
      <Dialog open={open} title={t.change.askTitle} description={t.change.askLead} onClose={() => setOpen(false)} dirty={dirty} labels={t.dialog}>
        <form className="form" onSubmit={submit} noValidate>
          <div className="field-group">
            <label htmlFor={uid + "address"} className="label">{t.fields.address}</label>
            <textarea id={uid + "address"} className="field" rows={3} value={values.address} maxLength={limits.address} onChange={e => setValues(v => ({ ...v, address: e.target.value }))} />
          </div>
          <p className="label-group">{t.emergency}</p>
          {(["emergencyName", "emergencyRelation", "emergencyPhone"] as const).map(f => (
            <div className="field-group" key={f}>
              <label htmlFor={uid + f} className="label">{t.fields[f]}</label>
              <input id={uid + f} className="field" type={f === "emergencyPhone" ? "tel" : "text"} value={values[f]} maxLength={f === "emergencyPhone" ? limits.phone : f === "emergencyName" ? limits.name : limits.relation} autoComplete="off" onChange={e => setValues(v => ({ ...v, [f]: e.target.value }))} />
            </div>
          ))}
          <div className="field-group">
            <label htmlFor={uid + "note"} className="label">{t.change.note}</label>
            <textarea id={uid + "note"} className="field" rows={2} value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row form-actions">
            <button type="submit" className="button" disabled={pending || !askable.some(f => values[f] !== current[f])}>{t.change.send}</button>
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.change.cancel}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

// HR's side, on the record: what the person asks, now and after; Accept
// changes the record at once; Decline takes an optional word.
export function AnswerChange({ name, waiting, current, t }: { name: string; waiting: Waiting; current: Record<Askable, string>; t: Words }) {
  const uid = useId();
  const [answer, setAnswer] = useState("");
  const [pending, run] = useBusy();
  const decide = (accept: boolean) => void run(async () => {
    const r = await call("decideChange", { id: waiting.id, accept, answer: accept ? "" : answer });
    if (r.ok) toast({ id: "change", text: accept ? t.change.accepted : t.change.declined, sent: true });
  });
  return (
    <section className="card-block section change-asked" aria-labelledby={uid + "title"}>
      <h2 id={uid + "title"} className="legend">{format(t.change.asks, { name, date: waiting.asked })}</h2>
      <dl className="change-diff">
        {askable.filter(f => waiting.changes[f] !== undefined).map(f => (
          <div key={f}>
            <dt>{label(t, f)}</dt>
            <dd>
              <span className="muted"><span className="visually-hidden">{t.change.from} </span>{current[f] || t.change.empty}</span>
              <span aria-hidden="true"> → </span>
              <strong><span className="visually-hidden">{t.change.to} </span>{waiting.changes[f] || t.change.empty}</strong>
            </dd>
          </div>
        ))}
      </dl>
      {waiting.note && <p className="quote">{waiting.note}</p>}
      <div className="field-group">
        <label htmlFor={uid + "answer"} className="label">{t.change.answer}</label>
        <input id={uid + "answer"} className="field" value={answer} maxLength={300} onChange={e => setAnswer(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="button" disabled={pending} onClick={() => decide(true)}>{t.change.accept}</button>
        <button type="button" className="button quiet" disabled={pending} onClick={() => decide(false)}>{t.change.decline}</button>
      </div>
    </section>
  );
}

function ChangeList({ changes, t }: { changes: Partial<Record<Askable, string>>; t: Words }) {
  return (
    <ul className="change-list">
      {askable.filter(f => changes[f] !== undefined).map(f => <li key={f}><span className="muted">{label(t, f)}</span> {changes[f] || t.change.empty}</li>)}
    </ul>
  );
}
