"use client";

// The second-language version of a text (optional): the same field, marked
// with its language so the browser checks the spelling in it and a screen
// reader reads it right. A form shows it once its "Also in French" (or
// English) box is ticked.
export function SecondField({ id, label, value, onChange, lang, multiline = true, rows = 3, max = 5000, placeholder }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  lang: string;
  multiline?: boolean;
  rows?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div className="second">
      <label className="label" htmlFor={id}>{label}</label>
      {multiline
        ? <textarea id={id} className="field" rows={rows} maxLength={max} lang={lang} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        : <input id={id} className="field" maxLength={max} lang={lang} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
    </div>
  );
}

// The box that shows the second fields.
export function SecondToggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="check toggle second-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
