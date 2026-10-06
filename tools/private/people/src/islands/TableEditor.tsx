import { Avatar, DateField, PeoplePicker, Segmented } from "@argentic/chest-ui/components";
import { localSearch, type DateWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, fill as format, toast } from "@argentic/chest-app/client";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { Lock, Plus, Trash } from "../components/icons.tsx";
import { limits } from "../shared/model.ts";

export type TableRow = {
  id: string; name: string; photo: string | null; title: string; team: string; office: string; managerId: string; startDate: string; phone: string; extras: Record<string, string>;
};
type Column = "title" | "team" | "office" | "managerId" | "startDate" | "phone";
type Words = {
  table: {
    person: string; saved: string; addField: string; fieldName: string; fieldPlaceholder: string; fieldEditor: string; editors: { person: string; hr: string };
    fieldSeen: string; seens: { everyone: string; private: string }; seenOf: string;
    create: string; cancel: string; removeField: string; fieldRemoved: string; renameField: string; cell: string;
    fieldKind: string; kinds: Record<"text" | "date" | "choice", string>; fieldOptions: string; fieldAlert: string; fieldAlertHint: string; noChoice: string;
  };
  edit: { title: string; team: string; office: string; manager: string; noManager: string; startDate: string; phone: string };
  date: DateWords;
  peoplePicker: PeoplePickerWords;
};

// Each cell saves itself when HR leaves it (the server checks it as it
// checks a profile: a loop of managers is refused, a phone must be one);
// "Undo" puts the value back. A refused value comes back as it was.
//
// This grid of fields stays the tool's own, not the kit's DataTable (a
// table to read and sort, not to type in): here every cell is a field
// saved on its own, the names stay in view while scrolling sideways, and a
// manager is their name on a button that opens the kit's person picker in
// the cell — one picker at a time, so the page grows with the number of
// people, not with its square (a select of every manager in every row
// was 289 MB for 2,000 people). The start date is the
// kit's compact date field ("29/09/2026", "1er octobre", "demain", or its
// calendar), never the browser's date input. A cell saved keeps what HR
// sees (the page is not read again for it); a column added, renamed or
// removed reads the page again.
export function TableEditor({ rows, managers, fields, known, today, lang, t }: {
  rows: TableRow[];
  managers: { id: string; name: string; left?: boolean }[];
  fields: { id: string; label: string; editor: "person" | "hr"; seen: "everyone" | "private"; kind: "text" | "date" | "choice"; options: string[] }[];
  known: { teams: string[]; offices: string[]; titles: string[] };
  // Today in the Chest's time zone ("tomorrow" in a date cell); the
  // language of the people picker.
  today: string;
  lang: string;
  t: Words;
}) {
  const uid = useId();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const r of rows) {
      for (const c of ["title", "team", "office", "managerId", "startDate", "phone"] as Column[]) start[`${r.id}|${c}`] = r[c];
      for (const f of fields) start[`${r.id}|x:${f.id}`] = r.extras[f.id] ?? "";
    }
    return start;
  });
  const [saved, setSaved] = useState(values);

  const send = (person: string, key: string, value: string) => call("saveCell", { member: person, key, value: value === "" ? (key === "managerId" || key === "startDate" ? null : "") : value }, { refresh: false, quiet: true });
  const commit = (person: string, key: string, value: string, before: string) => {
    if (value === before) return;
    const cell = `${person}|${key}`;
    setSaved(s => ({ ...s, [cell]: value }));
    void (async () => {
      const r = await send(person, key, value);
      if (!r.ok) {
        setValues(v => ({ ...v, [cell]: before }));
        setSaved(s => ({ ...s, [cell]: before }));
        toast({ text: r.message, tone: "error" });
        return;
      }
      toast({
        id: `cell-${cell}`,
        text: t.table.saved,
        undo: async () => {
          const back = await send(person, key, before);
          if (!back.ok) return back.message;
          setValues(v => ({ ...v, [cell]: before }));
          setSaved(s => ({ ...s, [cell]: before }));
          return true;
        },
      });
    })();
  };
  const input = (r: TableRow, key: string, label: string, props: { list?: string; type?: string; maxLength?: number } = {}) => {
    const cell = `${r.id}|${key}`;
    return (
      <input className="cell" value={values[cell] ?? ""} aria-label={format(t.table.cell, { field: label, name: r.name })} {...props}
        onChange={e => setValues(v => ({ ...v, [cell]: e.target.value }))}
        onBlur={() => commit(r.id, key, (values[cell] ?? "").trim(), saved[cell] ?? "")}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    );
  };

  return (
    <>
      <div className="table-frame sheet-frame">
        <table className="sheet">
          <thead>
            <tr>
              <th scope="col" className="sticky">{t.table.person}</th>
              <th scope="col">{t.edit.title}</th>
              <th scope="col">{t.edit.team}</th>
              <th scope="col">{t.edit.office}</th>
              <th scope="col">{t.edit.manager}</th>
              <th scope="col">{t.edit.startDate}</th>
              <th scope="col">{t.edit.phone}</th>
              {fields.map(f => <FieldHead key={f.id} field={f} t={t} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <th scope="row" className="sticky"><span className="sheet-person"><Avatar name={r.name} photo={r.photo} size="m" />{r.name}</span></th>
                <td>{input(r, "title", t.edit.title, { list: uid + "titles", maxLength: limits.title })}</td>
                <td>{input(r, "team", t.edit.team, { list: uid + "teams", maxLength: limits.team })}</td>
                <td>{input(r, "office", t.edit.office, { list: uid + "offices", maxLength: limits.office })}</td>
                <td>
                  <ManagerCell
                    person={r}
                    value={values[`${r.id}|managerId`] ?? ""}
                    managers={managers}
                    label={format(t.table.cell, { field: t.edit.manager, name: r.name })}
                    lang={lang}
                    t={t}
                    onPick={id => {
                      const cell = `${r.id}|managerId`;
                      const before = saved[cell] ?? "";
                      setValues(v => ({ ...v, [cell]: id }));
                      commit(r.id, "managerId", id, before);
                    }}
                  />
                </td>
                <td>
                  <DateCell value={values[`${r.id}|startDate`] ?? ""} label={format(t.table.cell, { field: t.edit.startDate, name: r.name })} today={today} words={t.date}
                    onCommit={iso => {
                      const cell = `${r.id}|startDate`;
                      setValues(v => ({ ...v, [cell]: iso }));
                      commit(r.id, "startDate", iso, saved[cell] ?? "");
                    }}
 />
                </td>
                <td>{input(r, "phone", t.edit.phone, { type: "tel", maxLength: limits.phone })}</td>
                {fields.map(f => {
                  const cell = `${r.id}|x:${f.id}`;
                  const label = format(t.table.cell, { field: f.label, name: r.name });
                  if (f.kind === "date") {
                    return <td key={f.id}><DateCell value={values[cell] ?? ""} label={label} today={today} words={t.date} onCommit={iso => { setValues(v => ({ ...v, [cell]: iso })); commit(r.id, `x:${f.id}`, iso, saved[cell] ?? ""); }} /></td>;
                  }
                  if (f.kind === "choice") {
                    const current = values[cell] ?? "";
                    return (
                      <td key={f.id}>
                        <select className="cell" value={current} aria-label={label} onChange={e => { const before = saved[cell] ?? ""; setValues(v => ({ ...v, [cell]: e.target.value })); commit(r.id, `x:${f.id}`, e.target.value, before); }}>
                          <option value="">{t.table.noChoice}</option>
                          {[...f.options, ...(current && !f.options.includes(current) ? [current] : [])].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                    );
                  }
                  return <td key={f.id}>{input(r, `x:${f.id}`, f.label, { maxLength: limits.fieldValue })}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id={uid + "titles"}>{known.titles.map(x => <option key={x} value={x} />)}</datalist>
        <datalist id={uid + "teams"}>{known.teams.map(x => <option key={x} value={x} />)}</datalist>
        <datalist id={uid + "offices"}>{known.offices.map(x => <option key={x} value={x} />)}</datalist>
      </div>
      <NewField t={t} />
    </>
  );
}

// A column of HR's own: its name can be changed in place; removing it has
// "Undo".
function FieldHead({ field, t }: { field: { id: string; label: string; editor: "person" | "hr"; seen: "everyone" | "private"; kind: "text" | "date" | "choice" }; t: Words }) {
  const [label, setLabel] = useState(field.label);
  const [seen, setSeen] = useState(field.seen);
  return (
    <th scope="col" className="field-head">
      <span className="row">
        <input className="cell head" value={label} maxLength={limits.fieldLabel} aria-label={format(t.table.renameField, { name: field.label })}
          onChange={e => setLabel(e.target.value)}
          onBlur={() => {
            if (label.trim() === field.label || !label.trim()) { setLabel(field.label); return; }
            void call("updateField", { id: field.id, label, editor: field.editor }).then(r => { if (!r.ok) setLabel(field.label); });
          }} />
        {seen === "private" && <span className="seen-lock" title={t.table.seens.private}><Lock /></span>}
        <select className="cell head-seen" value={seen} aria-label={format(t.table.seenOf, { name: field.label })}
          onChange={e => {
            const next = e.target.value as "everyone" | "private";
            setSeen(next);
            void call("updateField", { id: field.id, label: field.label, editor: field.editor, seen: next }).then(r => {
              if (!r.ok) setSeen(field.seen);
              else toast({ id: `seen-${field.id}`, text: t.table.saved });
            });
          }}>
          <option value="everyone">{t.table.seens.everyone}</option>
          <option value="private">{t.table.seens.private}</option>
        </select>
        <button type="button" className="icon-button" aria-label={format(t.table.removeField, { name: field.label })} onClick={() => void call("removeField", { id: field.id, removed: true }).then(r => {
          if (!r.ok) return;
          toast({
            id: `field-${field.id}`,
            text: t.table.fieldRemoved,
            undo: async () => {
              const back = await call("removeField", { id: field.id, removed: false }, { quiet: true });
              return back.ok || back.message;
            },
          });
        })}><Trash /></button>
      </span>
    </th>
  );
}

function NewField({ t }: { t: Words }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<"person" | "hr">("person");
  const [kind, setKind] = useState<"text" | "date" | "choice">("text");
  // Who sees it: a date is HR's and the person's by default (a medical
  // visit), until HR chooses.
  const [seen, setSeen] = useState<"everyone" | "private" | null>(null);
  const shownTo = seen ?? (kind === "date" ? "private" : "everyone");
  const [pending, run] = useBusy();
  if (!open) return <p className="section-actions"><button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.table.addField}</button></p>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const r = await call("addField", { label: String(data.get("label") ?? ""), editor, seen: shownTo, kind, options: String(data.get("options") ?? ""), alertDays: String(data.get("alert") ?? "") });
      if (r.ok) setOpen(false);
    });
  };
  return (
    <form className="inline-form new-field" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor={uid + "label"} className="label">{t.table.fieldName}</label>
        <input id={uid + "label"} name="label" className="field" required maxLength={limits.fieldLabel} placeholder={t.table.fieldPlaceholder} autoFocus />
      </div>
      <Segmented label={t.table.fieldKind} hideLabel={false} value={kind} onChange={setKind} options={(["text", "date", "choice"] as const).map(k => ({ value: k, label: t.table.kinds[k] }))} />
      {kind === "choice" && (
        <div className="field-group">
          <label htmlFor={uid + "options"} className="label">{t.table.fieldOptions}</label>
          <textarea id={uid + "options"} name="options" className="field" rows={4} required />
        </div>
      )}
      {kind === "date" && (
        <div className="field-group">
          <label htmlFor={uid + "alert"} className="label">{t.table.fieldAlert}</label>
          <input id={uid + "alert"} name="alert" className="field short" inputMode="numeric" pattern="[0-9]*" maxLength={3} aria-describedby={uid + "alert-hint"} />
          <p id={uid + "alert-hint"} className="hint">{t.table.fieldAlertHint}</p>
        </div>
      )}
      <Segmented label={t.table.fieldEditor} hideLabel={false} value={editor} onChange={setEditor} options={[{ value: "person", label: t.table.editors.person }, { value: "hr", label: t.table.editors.hr }]} />
      <Segmented label={t.table.fieldSeen} hideLabel={false} value={shownTo} onChange={setSeen} options={[{ value: "everyone", label: t.table.seens.everyone }, { value: "private", label: t.table.seens.private }]} />
      <div className="row">
        <button type="submit" className="button" disabled={pending}>{t.table.create}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.table.cancel}</button>
      </div>
    </form>
  );
}

// A date in a cell (the start date, a date field): typed as people write dates in their language
// ("29/09/2026", "1er octobre", "demain") or chosen on a calendar.
function DateCell({ value, label, today, words, onCommit }: { value: string; label: string; today: string; words: DateWords; onCommit: (iso: string) => void }) {
  // The kit's date field in its compact form: the cell and its calendar
  // (placed over the table's scrolling frame), the date in words read to
  // screen readers; a date it cannot read stays as typed, with its problem
  // under it, and nothing is saved.
  return <DateField variant="compact" hideLabel className="cell-date" label={label} value={value || null} today={today} labels={words} onChange={iso => onCommit(iso ?? "")} />;
}

// A manager cell: the manager's name (or "No manager") on a button; a click
// opens the kit's person picker in its place, over the people who may be
// this person's manager (never themselves; one who left only while still
// theirs). Choosing someone, or clearing, saves; Escape or leaving the
// cell closes it unchanged. The server refuses a loop.
function ManagerCell({ person, value, managers, label, lang, t, onPick }: {
  person: TableRow;
  value: string;
  managers: { id: string; name: string; left?: boolean }[];
  label: string;
  lang: string;
  t: Words;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const reopen = useRef(false);
  const offered = useMemo(() => (open ? managers.filter(m => m.id !== person.id && (!m.left || m.id === person.managerId)) : []), [open, managers, person.id, person.managerId]);
  const search = useMemo(() => localSearch(offered), [offered]);
  const current = managers.find(m => m.id === value);
  useEffect(() => {
    if (open) holder.current?.querySelector("input")?.focus();
    else if (reopen.current) { reopen.current = false; button.current?.focus(); }
  }, [open]);
  const close = () => { reopen.current = true; setOpen(false); };
  if (!open) {
    return (
      <button ref={button} type="button" className="cell cell-button" aria-label={`${label}: ${current?.name ?? t.edit.noManager}`} onClick={() => setOpen(true)}>
        {current ? current.name : <span className="muted">{t.edit.noManager}</span>}
      </button>
    );
  }
  return (
    <div ref={holder} className="cell-picker" onKeyDown={e => { if (e.key === "Escape") close(); }} onBlur={e => { if (!holder.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <PeoplePicker label={label} hideLabel clearable value={current ? [{ id: current.id, name: current.name }] : []} search={search} labels={t.peoplePicker} lang={lang}
        onChange={chosen => { close(); const id = chosen[0]?.id ?? ""; if (id !== value) onPick(id); }} />
    </div>
  );
}
