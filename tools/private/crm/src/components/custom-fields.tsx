import { DateField } from "@argentic/chest-ui/components";
import type { FieldDef } from "../shared/custom.ts";
import type { Words } from "./shared.ts";
import type { CustomForm } from "./values.ts";

// The team's own fields in a form: a text, a number, a day, one choice.
// The server checks each value (lib/custom.ts); an empty one is blank.
export function CustomInputs({ fields, values, onChange, prefix, today, t }: { fields: FieldDef[]; values: CustomForm; onChange: (next: CustomForm) => void; prefix: string; today: string; t: Words<"common" | "date"> }) {
  if (fields.length === 0) return null;
  const set = (id: string, value: string) => onChange({ ...values, [id]: value });
  return (
    <div className="form-grid custom-grid">
      {fields.map(f => {
        const id = `${prefix}-f${f.id}`;
        const value = values[f.id] ?? "";
        // A day: the kit's DateField (typed in the reader's language, or
        // picked on a calendar), never the browser's date field.
        if (f.kind === "date") return <DateField key={f.id} id={id} label={f.label} value={value || null} onChange={day => set(f.id, day ?? "")} today={today} chips={false} labels={t.date} />;
        return (
          <div key={f.id} className="field-block">
            <label className="label" htmlFor={id}>{f.label}</label>
            {f.kind === "choice" ? (
              <select id={id} className="field" value={value} onChange={e => set(f.id, e.target.value)}>
                <option value="">{t.common.noValue}</option>
                {!f.options.includes(value) && value !== "" && <option value={value}>{value}</option>}
                {f.options.map((o, i) => <option key={o} value={o}>{f.optionLabels?.[i] ?? o}</option>)}
              </select>
            ) : f.kind === "number" ? (
              <input id={id} className="field num" inputMode="decimal" value={value} maxLength={24} onChange={e => set(f.id, e.target.value)} />
            ) : (
              <input id={id} className="field" value={value} maxLength={500} onChange={e => set(f.id, e.target.value)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
