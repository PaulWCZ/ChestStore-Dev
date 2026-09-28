"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { plural } from "../../../../lib/i18n/format.ts";
import { eraseAnswers } from "../../actions.ts";

// The answers found, and erasing them: it cannot be undone, so it asks for
// a word first.
export function EraseForm({ rows, locale, t }: { rows: { id: string; form: string; when: string; who: string }[]; locale: string; t: { p: Catalogue["privacy"]; errors: Catalogue["errors"] } }) {
  const [word, setWord] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (rows.length === 0) return <p className="quiet-note" role="status">{t.p.none}</p>;
  return (
    <section className="panel" aria-labelledby="found">
      <h2 id="found" role="status">{plural(t.p.found, rows.length, locale)}</h2>
      <div className="table-wrap">
        <table className="answers-table">
          <thead><tr><th scope="col">{t.p.form}</th><th scope="col">{t.p.when}</th><th scope="col">{t.p.search}</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.form}</td><td className="nowrap">{r.when}</td><td>{r.who}</td></tr>)}</tbody>
        </table>
      </div>
      <form className="erase" onSubmit={e => {
        e.preventDefault();
        if (word.trim().toUpperCase() !== t.p.confirmWord) return;
        start(async () => {
          const r = await eraseAnswers(rows.map(x => x.id));
          if (r.ok) {
            toast(plural(t.p.erased, r.value.erased, locale));
            router.refresh();
          } else toast(t.errors[r.error] ?? t.errors.unknown);
        });
      }}>
        <label className="mini">
          <span className="mini-label">{t.p.confirm}</span>
          <input className="field" value={word} onChange={e => setWord(e.target.value)} autoComplete="off" />
        </label>
        <button type="submit" className="button danger-solid" disabled={pending || word.trim().toUpperCase() !== t.p.confirmWord}>{t.p.erase}</button>
      </form>
    </section>
  );
}
