import { call, toast } from "@argentic/chest-app/client";
import { useStep } from "../components/step.ts";
import { Receipt } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "../i18n/format.ts";

// "Mark these entries as invoiced": the billable time the report shows,
// once its invoice is out. It locks that time; Undo puts it back.
export function MarkInvoiced({ query, label, locale, t }: { query: { from: string; to: string; person?: string }; label: string; locale: string; t: { reports: Catalogue["reports"]; errors: Catalogue["errors"] } }) {
  const [pending, start] = useStep();
  function mark() {
    start(async () => {
      const r = await call("markInvoiced", query);
      if (!r.ok) return;
      const marked = r.value;
      toast({
        id: "invoiced",
        text: plural(t.reports.marked, marked.ids.length, locale),
        undo: async () => {
          const u = await call("unmarkInvoiced", { marked }, { quiet: true });
          return u.ok || u.message;
        },
      });
    });
  }
  return (
    <div className="invoice-bar">
      <p>{t.reports.invoiceHint}</p>
      <button type="button" className="button" disabled={pending} onClick={mark}><Receipt />{label}</button>
    </div>
  );
}
