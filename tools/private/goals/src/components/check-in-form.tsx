import { call } from "@argentic/chest-app/client";
import { useId, useState } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../shared/format.ts";
import { Alert, Check, Shape } from "./icons.tsx";

export type CheckInWords = { checkIn: Catalogue["checkIn"]; tools: Catalogue["tools"]; confidence: Catalogue["confidence"]; confidenceHelp: Catalogue["confidenceHelp"]; errors: Catalogue["errors"] };
export type CheckInTarget = { id: string; title: string; kind: "number" | "percent" | "money" | "milestone"; currentInput: string; current: string; target: string; unit: string; confidence: "on_track" | "at_risk" | "off_track" | null; done: boolean; source: "manual" | "crm.won_amount" | "crm.won_count" | "tasks.done" | "helpdesk.solved" | "hiring.hired" };
export type CheckedIn = { checkInId: string; keyResultId: string };

const levels = ["on_track", "at_risk", "off_track"] as const;
const isConfidence = (value: string): value is (typeof levels)[number] => (levels as readonly string[]).includes(value);

// The weekly check-in of one key result: the value now, how sure its owner
// is, one optional line. The value starts at the last one; the confidence
// at the last one too — most weeks, one tap and "Check in".
export function CheckInForm({ kr, t, onDone, onCancel, inline = false }: { kr: CheckInTarget; t: CheckInWords; onDone: (done: CheckedIn) => void; onCancel?: () => void; inline?: boolean }) {
  const uid = useId();
  const [value, setValue] = useState(kr.kind === "milestone" ? (kr.done ? "1" : "0") : kr.currentInput);
  const [confidence, setConfidence] = useState<string>(kr.confidence ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Sent once; a refusal is said under the form (what was typed stays).
  // The page reads itself again after a success (call()).
  async function send(input: { value: string; confidence: "on_track" | "at_risk" | "off_track"; note: string }) {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await call("checkIn", { id: kr.id, ...input }, { quiet: true });
    setPending(false);
    if (!result.ok) return setError(result.message);
    onDone({ checkInId: result.value.id, keyResultId: kr.id });
  }

  // A quiet week: the same value and confidence, in one click.
  function same() {
    if (!kr.confidence) return;
    void send({ value: kr.kind === "milestone" ? (kr.done ? "1" : "0") : kr.currentInput, confidence: kr.confidence, note: "" });
  }

  function submit() {
    if (!isConfidence(confidence)) {
      setError(t.checkIn.howSure);
      document.getElementById(`${uid}-conf-on_track`)?.focus();
      return;
    }
    void send({ value, confidence, note });
  }

  return (
    <form className={`checkin-form${inline ? " inline" : ""}`} onSubmit={e => { e.preventDefault(); submit(); }} aria-label={format(t.checkIn.title, { title: kr.title })}>
      {kr.source !== "manual" ? (
        <p className="fed-value"><strong>{format(t.checkIn.fromCrm, { tool: t.tools[kr.source.split(".")[0] as keyof typeof t.tools], value: kr.current })}</strong> <span className="hint">{format(t.checkIn.target, { value: kr.target })}</span></p>
      ) : kr.kind === "milestone" ? (
        <fieldset className="segments">
          <legend>{t.checkIn.newValue}</legend>
          {[["1", t.checkIn.markDone], ["0", t.checkIn.notYet]].map(([v, label]) => (
            <label key={v} className="segment">
              <input type="radio" name={`${uid}-value`} value={v} checked={value === v} onChange={() => setValue(v!)} />
              {v === "1" && <Check />}{label}
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="value-row">
          <div>
            <label className="label" htmlFor={`${uid}-value`}>{t.checkIn.newValue}</label>
            <input id={`${uid}-value`} className="field value-field" inputMode="decimal" autoComplete="off" value={value} onChange={e => setValue(e.target.value)} aria-describedby={`${uid}-target`} />
          </div>
          <p id={`${uid}-target`} className="hint">{format(t.checkIn.target, { value: kr.target })}</p>
        </div>
      )}
      <fieldset className="segments">
        <legend>{t.checkIn.howSure}</legend>
        {levels.map(c => (
          <label key={c} className={`segment ${c}`} title={t.confidenceHelp[c]}>
            <input id={`${uid}-conf-${c}`} type="radio" name={`${uid}-confidence`} value={c} checked={confidence === c} onChange={() => setConfidence(c)} />
            <span className={`shape-${c}`}><Shape confidence={c} /></span>{t.confidence[c]}
          </label>
        ))}
      </fieldset>
      <div>
        <label className="label" htmlFor={`${uid}-note`}>{t.checkIn.note}</label>
        <input id={`${uid}-note`} className="field" maxLength={500} value={note} placeholder={t.checkIn.notePlaceholder} onChange={e => setNote(e.target.value)} aria-describedby={`${uid}-note-hint`} />
        <p id={`${uid}-note-hint`} className="hint">{t.checkIn.noteHint}</p>
      </div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div className="actions">
        <button type="submit" className="button go" disabled={pending} aria-busy={pending}><Check />{pending ? t.checkIn.saving : t.checkIn.save}</button>
        {kr.confidence && <button type="button" className="button quiet" disabled={pending} onClick={same} aria-label={format(t.checkIn.sameLabel, { title: kr.title, value: kr.current, confidence: t.confidence[kr.confidence] })}>{t.checkIn.same}</button>}
        {onCancel && <button type="button" className="button quiet" onClick={onCancel}>{t.checkIn.cancel}</button>}
      </div>
    </form>
  );
}
