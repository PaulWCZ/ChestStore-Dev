import { call, navigate, toast } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import { useId, useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { Combobox } from "./combobox.tsx";
import { searchCompanies, searchContacts } from "./pickers.tsx";
import type { Choice, Words } from "./shared.ts";

export type MergeWords = Words<"common" | "deal" | "dialog">;

// Merge this record into the one that stays: find it by typing, read what
// will happen, merge. The dialog says it all before the button; the
// merged record's history keeps a line of it.
export function MergeDialog({ table, id, name, initial = null, onClose, t }: { table: "companies" | "contacts"; id: string; name: string; initial?: Choice | null; onClose: () => void; t: MergeWords }) {
  const [into, setInto] = useState<Choice | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formId = useId();
    const search = async (q: string) => {
    const found = table === "companies" ? await searchCompanies(q) : await searchContacts(q, null);
    return found.filter(x => x.id !== id);
  };
  return (
    <Dialog open title={format(table === "companies" ? t.common.merge.titleCompany : t.common.merge.titleContact, { name })} onClose={onClose} dirty={into !== null} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending || !into}>{t.common.merge.confirm}</button>
      </>}>
      <form id={formId} className="form" onSubmit={e => {
        e.preventDefault();
        if (!into) return;
        setError(null);
        start(async () => {
          const r = await call("merge", { table, from: id, into: into.id }, { quiet: true, refresh: false });
          if (!r.ok) return setError(r.message);
          toast(format(t.common.merge.merged, { name: into.name }));
          onClose();
          await navigate(`/chest/${table}/${r.value.id}`);
        });
      }}>
        <div className="field-block">
          <label className="label" htmlFor="merge-into">{t.common.merge.keep}</label>
          <Combobox id="merge-into" value={into} onChange={setInto} search={search} placeholder={table === "companies" ? t.deal.searchCompany : t.deal.searchContact} clearLabel={t.common.cancel} noMatch={t.deal.noMatch} />
        </div>
        {into && <p className="notice">{format(t.common.merge.body, { from: name, into: into.name })}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
