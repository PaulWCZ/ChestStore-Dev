"use client";

import { Confirm, DataTable, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { plural } from "../../../../lib/i18n/format.ts";
import { eraseAnswers } from "../../actions.ts";

type Row = { id: string; form: string; when: string; who: string };

// The answers found, and erasing them: it cannot be undone, so it asks
// first, in the kit's Confirm (never the browser's box), which opens on
// Cancel.
export function EraseForm({ rows, locale, t }: { rows: Row[]; locale: string; t: { p: Catalogue["privacy"]; errors: Catalogue["errors"]; table: Catalogue["table"] } }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (rows.length === 0) return <p className="quiet-note" role="status">{t.p.none}</p>;
  const erase = () => start(async () => {
    const r = await eraseAnswers(rows.map(x => x.id));
    setAsking(false);
    if (r.ok) {
      toast({ id: "erased", text: plural(t.p.erased, r.value.erased, locale) });
      router.refresh();
    } else toast({ id: "erased", text: t.errors[r.error] ?? t.errors.unknown, tone: "error" });
  });
  return (
    <section className="panel" aria-labelledby="found">
      <h2 id="found" role="status">{plural(t.p.found, rows.length, locale)}</h2>
      <DataTable<Row>
        caption={plural(t.p.found, rows.length, locale)}
        rows={rows}
        rowKey={r => r.id}
        columns={[
          { key: "form", label: t.p.form, render: r => r.form, rowHeader: true },
          { key: "when", label: t.p.when, render: r => <span className="nowrap">{r.when}</span> },
          { key: "who", label: t.p.search, render: r => r.who },
        ]}
        labels={t.table}
      />
      <div className="erase">
        <button type="button" className="button danger-solid" disabled={pending} onClick={() => setAsking(true)}>{t.p.erase}</button>
      </div>
      <Confirm
        open={asking}
        title={plural(t.p.confirmTitle, rows.length, locale)}
        body={t.p.confirmBody}
        confirmLabel={t.p.confirmErase}
        cancelLabel={t.p.cancel}
        busy={pending}
        onConfirm={erase}
        onCancel={() => setAsking(false)}
      />
    </section>
  );
}
