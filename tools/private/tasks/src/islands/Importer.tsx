import { useState, useTransition } from "react";
import { Lock, Upload } from "../components/icons.tsx";
import { call } from "../core/client.tsx";
import { AppError } from "../core/tool.ts";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import { arrange, fromCsv, fromTrello, importedCounts, type ImportedBoard } from "../shared/parse-import.ts";

type Words = { importer: Catalogue["importer"]; errors: Catalogue["errors"] };
type Kind = "trello" | "csv";
// `done`: the columns (indexes) the person says hold finished work — at
// first those named so (Done, Fait, Terminé…).
type Picked = { kind: Kind; text: string; board: ImportedBoard; name: string; file: string; done: number[] };

// Choose where the boards come from, pick the files (several Trello boards
// at once), check what will come — columns, cards, the people found in the
// Chest and those who are not, the files that stay behind, which columns
// hold finished work (so nothing done comes in "late"), the archived
// columns that come archived — choose who sees them (only me, by default;
// the people on its cards are told they will not see it), import. The
// files are read here to show them; the server reads them again.
export function Importer({ t, locale, doneName }: { t: Words; locale: string; doneName: string }) {
  const w = t.importer;
  const [picked, setPicked] = useState<Picked[]>([]);
  const [people, setPeople] = useState<{ found: string[]; missing: string[]; hidden: string[] } | null>(null);
  const [visibility, setVisibility] = useState<"private" | "team">("private");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; name: string; cards: number; matched: number; people: number }[]>([]);
  const [pending, start] = useTransition();

  async function read(kind: Kind, files: File[]) {
    setError(null);
    setDone([]);
    const boards: Picked[] = [];
    for (const file of files.slice(0, 30)) {
      if (file.size > 10 << 20) return setError(format(w.tooBigNamed, { file: file.name }));
      const text = await file.text();
      try {
        const board = kind === "trello" ? fromTrello(text) : fromCsv(text, file.name.replace(/\.[^.]+$/u, ""));
        boards.push({ kind, text, board, name: board.name, file: file.name, done: board.columns.flatMap((c, i) => (c.done && !c.archived ? [i] : [])) });
      } catch (e) {
        setPicked([]);
        return setError(format(w.unreadable, { file: file.name, reason: t.errors[e instanceof AppError ? e.code : "import_invalid"] }));
      }
    }
    setPicked(boards);
    setPeople(null);
    const names = [...new Set(boards.flatMap(b => importedCounts(b.board).people))];
    if (names.length > 0) {
      const r = await call("previewImport", { names }, { quiet: true, refresh: false });
      if (r.ok) setPeople(r.value);
    }
  }
  function submit() {
    if (picked.length === 0) return;
    start(async () => {
      const made: typeof done = [];
      for (const p of picked) {
        const r = await call("importBoard", { kind: p.kind, text: p.text, name: p.name, visibility, done: p.done }, { quiet: true, refresh: false });
        if (!r.ok) {
          setDone(made);
          setPicked(picked.slice(made.length));
          return setError(format(w.failedAt, { name: p.name, reason: r.message }));
        }
        made.push({ ...r.value, name: p.name });
      }
      setDone(made);
      setPicked([]);
    });
  }

  if (done.length > 0 && picked.length === 0) {
    return (
      <div className="summary-box" role="status">
        {done.map(d => (
          <p key={d.id}><strong>{d.name}</strong> — {format(w.done, { cards: d.cards, matched: d.matched, people: d.people })}</p>
        ))}
        <p className="hint">{visibility === "private" ? w.doneOnlyYou : w.doneEveryone}</p>
        <div className="row">
          {done.length === 1 ? <a className="button" href={`/chest/boards/${done[0]!.id}`}>{w.open}</a> : <a className="button" href="/chest/boards">{w.openAll}</a>}
          <button type="button" className="button quiet" onClick={() => setDone([])}>{w.again}</button>
        </div>
      </div>
    );
  }
  const sources: { kind: Kind; title: string; how: string; accept: string; many: boolean }[] = [
    { kind: "trello", title: w.trello, how: w.trelloHow, accept: ".json,application/json", many: true },
    { kind: "csv", title: w.asana, how: w.asanaHow, accept: ".csv,text/csv", many: false },
    { kind: "csv", title: w.csv, how: w.csvHow, accept: ".csv,text/csv", many: false },
  ];
  const arranged = picked.map(p => arrange(p.board, p.done));
  const totals = picked.map(p => importedCounts(p.board));
  const files = totals.reduce((n, c) => n + c.files, 0);
  // People found who would not see the board kept private (not the
  // importer, not a manager): their cards would not reach them.
  const others = people?.hidden ?? [];
  const toggle = (i: number, column: number, on: boolean) => setPicked(picked.map((x, j) => (j === i ? { ...x, done: on ? [...x.done, column] : x.done.filter(k => k !== column) } : x)));
  return (
    <div className="stack import">
      <div className="sources">
        {sources.map(s => (
          <section key={s.title} className="source">
            <h2>{s.title}</h2>
            <p>{s.how}</p>
            <label className="button quiet file-input">
              <Upload />{s.many ? w.chooseMany : w.choose}
              <input type="file" accept={s.accept} multiple={s.many} onChange={e => { const list = [...(e.target.files ?? [])]; e.target.value = ""; if (list.length) void read(s.kind, list); }} />
            </label>
          </section>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {picked.length > 0 && (
        <section className="summary-box" aria-labelledby="check">
          <h2 id="check">{w.check}</h2>
          <ul className="stack import-boards">
            {picked.map((p, i) => (
              <li key={p.file + i} className="stack">
                <div>
                  <label className="label" htmlFor={`import-name-${i}`}>{picked.length > 1 ? format(w.nameOf, { file: p.file }) : w.name}</label>
                  <input id={`import-name-${i}`} className="field" value={p.name} maxLength={80} onChange={e => setPicked(picked.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </div>
                <p>{plural(w.columns, totals[i]!.columns, locale)} · {plural(w.cards, totals[i]!.cards, locale)}</p>
                <fieldset className="plain stack finished">
                  <legend className="label">{w.finished}</legend>
                  <p className="hint">{w.finishedHint}</p>
                  <ul className="row">
                    {p.board.columns.map((c, k) => (c.archived ? null : (
                      <li key={k}>
                        <label className="chip big pick">
                          <input type="checkbox" checked={p.done.includes(k)} onChange={e => toggle(i, k, e.target.checked)} />
                          {c.name} · {c.cards.length}
                        </label>
                      </li>
                    )))}
                  </ul>
                  {totals[i]!.ticked > 0 && <p>{plural(w.ticked, totals[i]!.ticked, locale, { column: arranged[i]!.columns.find(c => c.done && !c.archived)?.name.replace(/^✓$/u, doneName) ?? doneName })}</p>}
                  {p.done.length === 0 && totals[i]!.ticked === 0 && <p className="warn">{w.noFinished}</p>}
                </fieldset>
                {totals[i]!.archivedColumns > 0 && (
                  <p>{plural(w.archivedColumns, totals[i]!.archivedColumns, locale)} <span className="muted">{p.board.columns.filter(c => c.archived).map(c => `${c.name} · ${c.cards.length}`).join(", ")}</span></p>
                )}
              </li>
            ))}
          </ul>
          {people && (people.found.length > 0 || people.missing.length > 0) && (
            <div className="stack people-check">
              {people.found.length > 0 && <p>{plural(w.found, people.found.length, locale)} <span className="muted">{people.found.join(", ")}</span></p>}
              {people.missing.length > 0 && (
                <p className="warn">{plural(w.missing, people.missing.length, locale)} <span className="muted">{people.missing.join(", ")}</span></p>
              )}
            </div>
          )}
          {files > 0 && <p className="warn">{plural(w.filesStay, files, locale)}</p>}
          <fieldset className="stack plain">
            <legend className="label">{w.who}</legend>
            <div className="choices">
              <label className="choice"><input type="radio" name="import-visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} /><span><Lock /> {w.onlyMe}</span><small>{w.onlyMeHint}</small></label>
              <label className="choice"><input type="radio" name="import-visibility" checked={visibility === "team"} onChange={() => setVisibility("team")} /><span>{w.everyone}</span><small>{w.everyoneHint}</small></label>
            </div>
          </fieldset>
          {visibility === "private" && others.length > 0 && <p className="warn" role="status">{plural(w.privateHidden, others.length, locale)} <span className="muted">{others.join(", ")}</span></p>}
          <div><button type="button" className="button" disabled={pending} onClick={submit}>{plural(w.submitMany, picked.length, locale)}</button></div>
        </section>
      )}
    </div>
  );
}
