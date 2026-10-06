import { call, toast } from "@argentic/chest-app/client";
import { Confirm } from "@argentic/chest-ui/components";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { format, numberFormat, plural } from "../i18n/format.ts";
import type { Locale } from "../i18n/index.ts";
import { Close, Person, Tag, Trash } from "./icons.tsx";
import { OwnerPicker, type OwnerWords } from "./owner-select.tsx";
import type { Teammate } from "./shared.ts";

export type BulkWords = OwnerWords;
// The filters of the list shown, as its address says them (the same names).
export type ListQuery = { q?: string; owner?: string; tag?: string; stale?: boolean; cf?: string; cv?: string; cmin?: string; cmax?: string };

// Changing many at once: tick rows (or the whole page), then give them to
// someone, tag or untag them, or delete them. The server checks each one;
// what the member may not change is left as it was and counted.
type Selection = { selected: Set<string>; toggle: (id: string) => void; setAll: (ids: string[], on: boolean) => void; clear: () => void };
const Context = createContext<Selection | null>(null);

export function BulkProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value: Selection = {
    selected,
    toggle: id => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    setAll: (ids, on) => setSelected(s => { const n = new Set(s); for (const id of ids) if (on) n.add(id); else n.delete(id); return n; }),
    clear: () => setSelected(new Set()),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function RowCheck({ id, label }: { id: string; label: string }) {
  const s = useContext(Context);
  if (!s) return null;
  return (
    <label className="row-check">
      <input type="checkbox" checked={s.selected.has(id)} onChange={() => s.toggle(id)} />
      <span className="visually-hidden">{label}</span>
    </label>
  );
}

// "Select this page"; then, when the list goes on, "Select all N" (up to
// 500 at once) that match the list's filters.
export function PageCheck({ ids, total, table, filter, locale, t }: { ids: string[]; total: number; table: "companies" | "contacts"; filter: ListQuery; locale: Locale; t: BulkWords }) {
  const s = useContext(Context);
  const [, start] = useTransition();
  if (!s || ids.length === 0) return null;
  const all = ids.every(id => s.selected.has(id));
  const cap = Math.min(total, 500);
  const more = all && ids.length < total && s.selected.size < cap;
  return (
    <span className="row">
      <label className="check-label page-check">
        <input type="checkbox" checked={all} onChange={e => s.setAll(ids, e.target.checked)} />
        {t.common.bulk.selectPage}
      </label>
      {more && (
        <button type="button" className="link-button" onClick={() => start(async () => { const r = await call("matchingIds", { table, ...filter }, { refresh: false }); if (r.ok) s.setAll(r.value, true); })}>
          {format(t.common.bulk.selectAll, { count: numberFormat(locale).format(cap) })}
        </button>
      )}
    </span>
  );
}

export function BulkBar({ table, team, me, canAssign, canDelete, locale, t }: { table: "companies" | "contacts" | "deals"; team: Teammate[]; me: string; canAssign: boolean; canDelete: boolean; locale: Locale; t: BulkWords }) {
  const s = useContext(Context);
  const [mode, setMode] = useState<"" | "assign" | "tag" | "untag" | "delete">("");
  const [owner, setOwner] = useState<string | null>(me);
  const [tag, setTag] = useState("");
  const [pending, start] = useTransition();
    const w = t.common.bulk;
  if (!s || s.selected.size === 0) return null;
  const ids = [...s.selected];
  function run(action: { kind: "assign"; owner: string | null } | { kind: "tag" | "untag"; tag: string } | { kind: "delete" }) {
    start(async () => {
      const r = await call("bulkChange", { table, ids, ...action });
      if (!r.ok) return;
      toast(r.value.skipped > 0 ? format(w.skipped, { done: r.value.done, skipped: r.value.skipped }) : plural(action.kind === "delete" ? w.deleted : w.done, r.value.done, locale));
      s!.clear();
      setMode("");
    });
  }
  return (
    <div className="bulk-bar" role="region" aria-label={w.actions}>
      <span className="strong num" aria-live="polite">{plural(w.selected, ids.length, locale)}</span>
      {mode === "assign" ? (
        <form className="row" onSubmit={e => { e.preventDefault(); run({ kind: "assign", owner }); }}>
          <OwnerPicker id="bulk-owner" label={w.assign} hideLabel hint={false} value={owner} team={team} me={me} canAssign={canAssign} onChange={setOwner} t={t} />
          <button type="submit" className="button small" disabled={pending}>{w.apply}</button>
          <button type="button" className="button small quiet" onClick={() => setMode("")}>{t.common.cancel}</button>
        </form>
      ) : mode === "tag" || mode === "untag" ? (
        <form className="row" onSubmit={e => { e.preventDefault(); run({ kind: mode, tag }); }}>
          <label className="visually-hidden" htmlFor="bulk-tag">{w.tagLabel}</label>
          <input id="bulk-tag" className="field compact" value={tag} onChange={e => setTag(e.target.value)} maxLength={30} placeholder={w.tagLabel} autoFocus required />
          <button type="submit" className="button small" disabled={pending}>{w.apply}</button>
          <button type="button" className="button small quiet" onClick={() => setMode("")}>{t.common.cancel}</button>
        </form>
      ) : (
        <span className="row">
          <button type="button" className="button small quiet" onClick={() => setMode("assign")}><Person />{w.assign}</button>
          {table !== "deals" && <button type="button" className="button small quiet" onClick={() => setMode("tag")}><Tag />{w.tag}</button>}
          {table !== "deals" && <button type="button" className="button small quiet" onClick={() => setMode("untag")}><Tag />{w.untag}</button>}
          {canDelete && table !== "deals" && <button type="button" className="button small quiet danger-text" onClick={() => setMode("delete")}><Trash />{w.delete}</button>}
          <button type="button" className="icon-button small" onClick={() => s.clear()} title={w.clear}><Close /><span className="visually-hidden">{w.clear}</span></button>
        </span>
      )}
      {/* Deleting records cannot be undone: the kit's Confirm asks once. */}
      <Confirm open={mode === "delete"} title={plural(w.deleteTitle, ids.length, locale)} body={w.deleteBody} confirmLabel={w.deleteConfirm} cancelLabel={t.common.cancel} busy={pending} onConfirm={() => run({ kind: "delete" })} onCancel={() => setMode("")} />
    </div>
  );
}
