"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Upload } from "../../../components/icons.tsx";
import { AppError } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { fromCsv, fromTrello, type ImportedBoard } from "../../../lib/parse-import.ts";
import { importBoard } from "../actions.ts";

type Words = { importer: Catalogue["importer"]; errors: Catalogue["errors"] };
type Kind = "trello" | "csv";

// Choose where the board comes from, pick the file, check what will come,
// import. The file is read here to show it; the server reads it again.
export function Importer({ t, locale }: { t: Words; locale: string }) {
  const w = t.importer;
  const [picked, setPicked] = useState<{ kind: Kind; text: string; board: ImportedBoard } | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; cards: number; matched: number; people: number } | null>(null);
  const [pending, start] = useTransition();

  async function read(kind: Kind, file: File) {
    setError(null);
    setDone(null);
    if (file.size > 10 << 20) return setError(w.tooBig);
    const text = await file.text();
    try {
      const board = kind === "trello" ? fromTrello(text) : fromCsv(text, file.name.replace(/\.[^.]+$/u, ""));
      setPicked({ kind, text, board });
      setName(board.name);
    } catch (e) {
      setPicked(null);
      setError(t.errors[e instanceof AppError ? e.code : "import_invalid"]);
    }
  }
  function submit() {
    if (!picked) return;
    start(async () => {
      const r = await importBoard(picked.kind, picked.text, name);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setDone(r.value);
      setPicked(null);
    });
  }

  if (done) {
    return (
      <div className="summary-box" role="status">
        <p><strong>{format(w.done, { cards: done.cards, matched: done.matched, people: done.people })}</strong></p>
        <div className="row">
          <Link className="button" href={`/chest/boards/${done.id}`}>{w.open}</Link>
          <button type="button" className="button quiet" onClick={() => setDone(null)}>{w.again}</button>
        </div>
      </div>
    );
  }
  const sources: { kind: Kind; title: string; how: string; accept: string }[] = [
    { kind: "trello", title: w.trello, how: w.trelloHow, accept: ".json,application/json" },
    { kind: "csv", title: w.asana, how: w.asanaHow, accept: ".csv,text/csv" },
    { kind: "csv", title: w.csv, how: w.csvHow, accept: ".csv,text/csv" },
  ];
  const cards = picked ? picked.board.columns.reduce((n, c) => n + c.cards.length, 0) : 0;
  const people = picked ? new Set(picked.board.columns.flatMap(c => c.cards.flatMap(k => k.people))).size : 0;
  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div className="sources">
        {sources.map(s => (
          <section key={s.title} className="source">
            <h2>{s.title}</h2>
            <p>{s.how}</p>
            <label className="button quiet file-input">
              <Upload />{w.choose}
              <input type="file" accept={s.accept} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(s.kind, f); }} />
            </label>
          </section>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {picked && (
        <section className="summary-box" aria-labelledby="check">
          <h2 id="check">{w.check}</h2>
          <p>{plural(w.columns, picked.board.columns.length, locale)} · {plural(w.cards, cards, locale)} · {plural(w.people, people, locale)}</p>
          <p className="hint">{w.peopleHint}</p>
          <ul className="row">
            {picked.board.columns.map(c => <li key={c.name} className="chip">{c.name} · {c.cards.length}</li>)}
          </ul>
          <div>
            <label className="label" htmlFor="import-name">{w.name}</label>
            <input id="import-name" className="field" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
          </div>
          <div><button type="button" className="button" disabled={pending} onClick={submit}>{w.submit}</button></div>
        </section>
      )}
    </div>
  );
}
