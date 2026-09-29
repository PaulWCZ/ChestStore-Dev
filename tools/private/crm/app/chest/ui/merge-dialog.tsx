"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { merge, pickCompanies, pickContacts } from "../actions.ts";
import { Combobox } from "./combobox.tsx";
import type { Choice } from "./shared.ts";

// Merge this record into the one that stays: find it by typing, read what
// will happen, merge. It cannot be undone, so it asks once.
export function MergeDialog({ table, id, name, onClose, t }: { table: "companies" | "contacts"; id: string; name: string; onClose: () => void; t: Catalogue }) {
  const [into, setInto] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const search = async (q: string) => {
    const r = table === "companies" ? await pickCompanies(q) : await pickContacts(q, null);
    return r.ok ? r.value.filter(x => x.id !== id) : [];
  };
  return (
    <Dialog open title={format(table === "companies" ? t.common.merge.titleCompany : t.common.merge.titleContact, { name })} closeLabel={t.common.close} onClose={onClose}>
      <form className="form" onSubmit={e => {
        e.preventDefault();
        if (!into) return;
        setError(null);
        start(async () => {
          const r = await merge(table, id, into.id);
          if (!r.ok) return setError(format(t.errors[r.error], r.values));
          toast(format(t.common.merge.merged, { name: into.name }));
          onClose();
          router.push(`/chest/${table}/${r.value.id}`);
        });
      }}>
        <div className="field-block">
          <label className="label" htmlFor="merge-into">{t.common.merge.keep}</label>
          <Combobox id="merge-into" value={into} onChange={setInto} search={search} placeholder={table === "companies" ? t.deal.searchCompany : t.deal.searchContact} clearLabel={t.common.cancel} noMatch={t.deal.noMatch} />
        </div>
        {into && <p className="notice">{format(t.common.merge.body, { from: name, into: into.name })}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending || !into}>{t.common.merge.confirm}</button>
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        </div>
      </form>
    </Dialog>
  );
}
