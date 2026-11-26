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
    <div>
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

// The language a text is written in: the editor's own by default (a French
// editor on an English Chest writes French). Changing it moves the second
// version to the other language.
export type Languages = { main: string; options: { code: string; name: string }[] };

export function LanguagePick({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (value: string) => void; options: Languages["options"] }) {
  return (
    <div className="language-pick">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="field" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
      </select>
    </div>
  );
}

// The other language, for the second version.
export function secondOf(main: string, options: Languages["options"]): { code: string; name: string } {
  return options.find(o => o.code !== main) ?? options[0] ?? { code: main, name: main };
}
