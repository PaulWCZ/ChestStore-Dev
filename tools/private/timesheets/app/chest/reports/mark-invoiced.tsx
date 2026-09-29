"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Receipt } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { markInvoiced, unmarkInvoiced } from "../actions.ts";

// "Mark these entries as invoiced": the billable time the report shows,
// once its invoice is out. It locks that time; Undo puts it back.
export function MarkInvoiced({ query, label, locale, t }: { query: { from: string; to: string; person?: string }; label: string; locale: string; t: { reports: Catalogue["reports"]; errors: Catalogue["errors"]; undo: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function mark() {
    start(async () => {
      const r = await markInvoiced({ ...query, billable: "uninvoiced" });
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      const marked = r.value;
      toast(plural(t.reports.marked, marked.ids.length, locale), {
        label: t.undo,
        run: () => start(async () => {
          const u = await unmarkInvoiced(marked);
          if (!u.ok) toast(format(t.errors[u.error], u.values));
          router.refresh();
        }),
      });
      router.refresh();
    });
  }
  return (
    <div className="invoice-bar">
      <p>{t.reports.invoiceHint}</p>
      <button type="button" className="button" disabled={pending} onClick={mark}><Receipt />{label}</button>
    </div>
  );
}
