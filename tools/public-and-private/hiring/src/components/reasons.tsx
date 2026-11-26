import type { Catalogue } from "../i18n/index.ts";
import { candidateReasons, companyReasons, type RejectReason } from "../shared/model.ts";

// The reasons of a rejection, in two groups: what the company decided,
// and the candidate stepping back. Nothing is chosen until someone
// chooses (the reasons are data the company answers for).
export function ReasonPicker({ reason, onChange, t }: { reason: RejectReason | null; onChange: (r: RejectReason) => void; t: Catalogue["reject"] }) {
  const group = (list: readonly RejectReason[], legend: string) => (
    <fieldset className="choices">
      <legend className="label">{legend}</legend>
      <div className="reason-grid">
        {list.map(r => (
          <label key={r} className={`pill${reason === r ? " on" : ""}`}>
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => onChange(r)} required />
            <span>{t.reasons[r]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="stack reasons">
      {group(companyReasons, t.reasonOurs)}
      {group(candidateReasons, t.reasonTheirs)}
      <p className="hint">{t.reasonHint}</p>
    </div>
  );
}
