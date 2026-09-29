"use client";

import { Avatar, DateField, Segmented, useToast } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Plus, Trash } from "../../../components/icons.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { limits } from "../../../lib/model.ts";
import { addField, removeField, saveCell, updateField } from "../actions.ts";

export type TableRow = {
  id: string; name: string; photo: string | null; title: string; team: string; office: string; managerId: string; startDate: string; phone: string; extras: Record<string, string>;
};
type Column = "title" | "team" | "office" | "managerId" | "startDate" | "phone";
type Words = {
  table: {
    person: string; saved: string; addField: string; fieldName: string; fieldPlaceholder: string; fieldEditor: string; editors: { person: string; hr: string };
    create: string; cancel: string; removeField: string; fieldRemoved: string; renameField: string; cell: string;
  };
  edit: { title: string; team: string; office: string; manager: string; noManager: string; startDate: string; phone: string };
  errors: Record<ErrorCode, string>;
  date: DateWords;
};

// Each cell saves itself when HR leaves it (the server checks it as it
// checks a profile: a loop of managers is refused, a phone must be one);
// "Undo" puts the value back. A refused value comes back as it was.
//
// This grid of fields stays the tool's own, not the kit's DataTable (a
// table to read and sort, not to type in): here every cell is a field
// saved on its own, the names stay in view while scrolling sideways, and a
// manager is a select — a compact list in a cell. The start date is the
// kit's compact date field ("29/09/2026", "1er octobre", "demain", or its
// calendar), never the browser's date input.
export function TableEditor({ rows, managers, fields, known, today, t }: {
  rows: TableRow[];
  managers: { id: string; name: string; left?: boolean }[];
  fields: { id: string; label: string; editor: "person" | "hr" }[];
  known: { teams: string[]; offices: string[]; titles: string[] };
  // Today in the Chest's time zone ("tomorrow" in a date cell).
  today: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
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
  const [, start] = useTransition();

  const said = (r: { ok: false; error: ErrorCode; values?: Record<string, string | number> }) => format(t.errors[r.error], r.values ?? {});
  const send = (person: string, key: string, value: string) => saveCell(person, key, value === "" ? (key === "managerId" || key === "startDate" ? null : "") : value);
  const commit = (person: string, key: string, value: string, before: string) => {
    if (value === before) return;
    const cell = `${person}|${key}`;
    setSaved(s => ({ ...s, [cell]: value }));
    start(async () => {
      const r = await send(person, key, value);
      if (!r.ok) {
        setValues(v => ({ ...v, [cell]: before }));
        setSaved(s => ({ ...s, [cell]: before }));
        toast({ text: said(r), tone: "error" });
        return;
      }
      toast({
        id: `cell-${cell}`,
        text: t.table.saved,
        undo: async () => {
          const back = await send(person, key, before);
          if (!back.ok) return said(back);
          setValues(v => ({ ...v, [cell]: before }));
          setSaved(s => ({ ...s, [cell]: before }));
          return true;
        },
      });
    });
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
              {fields.map(f => <FieldHead key={f.id} field={f} t={t} onRemoved={() => router.refresh()} />)}
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
                  <select className="cell" value={values[`${r.id}|managerId`] ?? ""} aria-label={format(t.table.cell, { field: t.edit.manager, name: r.name })}
                    onChange={e => {
                      const cell = `${r.id}|managerId`;
                      const before = saved[cell] ?? "";
                      setValues(v => ({ ...v, [cell]: e.target.value }));
                      commit(r.id, "managerId", e.target.value, before);
                    }}>
                    <option value="">{t.edit.noManager}</option>
                    {managers.filter(m => m.id !== r.id && (!m.left || m.id === r.managerId)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
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
                {fields.map(f => <td key={f.id}>{input(r, `x:${f.id}`, f.label, { maxLength: limits.fieldValue })}</td>)}
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
function FieldHead({ field, t, onRemoved }: { field: { id: string; label: string; editor: "person" | "hr" }; t: Words; onRemoved: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [label, setLabel] = useState(field.label);
  const [, start] = useTransition();
  return (
    <th scope="col" className="field-head">
      <span className="row">
        <input className="cell head" value={label} maxLength={limits.fieldLabel} aria-label={format(t.table.renameField, { name: field.label })}
          onChange={e => setLabel(e.target.value)}
          onBlur={() => {
            if (label.trim() === field.label || !label.trim()) { setLabel(field.label); return; }
            start(async () => {
              const r = await updateField(field.id, { label, editor: field.editor });
              if (!r.ok) { setLabel(field.label); toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" }); }
              else router.refresh();
            });
          }} />
        <button type="button" className="icon-button" aria-label={format(t.table.removeField, { name: field.label })} onClick={() => start(async () => {
          const r = await removeField(field.id, true);
          if (!r.ok) { toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" }); return; }
          onRemoved();
          toast({
            id: `field-${field.id}`,
            text: t.table.fieldRemoved,
            undo: async () => {
              const back = await removeField(field.id, false);
              if (!back.ok) return format(t.errors[back.error], back.values ?? {});
              router.refresh();
              return true;
            },
          });
        })}><Trash /></button>
      </span>
    </th>
  );
}

function NewField({ t }: { t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<"person" | "hr">("person");
  const [pending, start] = useTransition();
  if (!open) return <p className="section-actions"><button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.table.addField}</button></p>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    start(async () => {
      const r = await addField({ label: String(data.get("label") ?? ""), editor });
      if (!r.ok) { toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" }); return; }
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <form className="inline-form new-field" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor={uid + "label"} className="label">{t.table.fieldName}</label>
        <input id={uid + "label"} name="label" className="field" required maxLength={limits.fieldLabel} placeholder={t.table.fieldPlaceholder} autoFocus />
      </div>
      <Segmented label={t.table.fieldEditor} hideLabel={false} value={editor} onChange={setEditor} options={[{ value: "person", label: t.table.editors.person }, { value: "hr", label: t.table.editors.hr }]} />
      <div className="row">
        <button type="submit" className="button" disabled={pending}>{t.table.create}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.table.cancel}</button>
      </div>
    </form>
  );
}

// A start date in a cell: typed as people write dates in their language
// ("29/09/2026", "1er octobre", "demain") or chosen on a calendar.
function DateCell({ value, label, today, words, onCommit }: { value: string; label: string; today: string; words: DateWords; onCommit: (iso: string) => void }) {
  // The kit's date field in its compact form: the cell and its calendar
  // (placed over the table's scrolling frame), the date in words read to
  // screen readers; a date it cannot read stays as typed, with its problem
  // under it, and nothing is saved.
  return <DateField variant="compact" hideLabel className="cell-date" label={label} value={value || null} today={today} labels={words} onChange={iso => onCommit(iso ?? "")} />;
}
