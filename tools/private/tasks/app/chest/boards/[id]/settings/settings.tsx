"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Avatar } from "../../../../../components/avatar.tsx";
import { Archive, Close, Download, Lock, People, Plus, Restore, Tag, Trash } from "../../../../../components/icons.tsx";
import { useToast } from "../../../../../components/toast.tsx";
import type { Column, Label } from "../../../../../lib/boards.ts";
import { format } from "../../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import type { Color } from "../../../../../lib/model.ts";
import { addLabel, archiveBoard, archiveCard, archiveColumn, deleteBoard, deleteCard, removeLabel, setBoardPeople, updateBoard, updateLabel } from "../../../actions.ts";

type Words = { settings: Catalogue["settings"]; colors: Catalogue["colors"]; errors: Catalogue["errors"]; card: Catalogue["card"] };
type Person = { id: string; name: string; photo: string | null };
const palette: Color[] = ["sun", "tomato", "berry", "grape", "sky", "sea", "leaf", "sand", "slate"];

export function Settings({ board, members, everyone, groups, labels, archivedColumns, archivedCards, t }: {
  board: { id: string; name: string; color: Color; visibility: "team" | "private"; archived: boolean; own: boolean; groups: string[] };
  members: (Person & { owner: boolean })[];
  everyone: Person[];
  groups: { id: string; name: string }[];
  labels: Label[];
  archivedColumns: Column[];
  archivedCards: { id: string; title: string }[];
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done?: string, after?: () => void) =>
    start(async () => {
      const r = await step();
      if (!r.ok && r.error) toast(format(t.errors[r.error], r.values));
      else {
        if (done) toast(done);
        after?.();
      }
    });
  const s = t.settings;
  const [people, setPeople] = useState(members);
  const [chosenGroups, setGroups] = useState(board.groups);
  const [adding, setAdding] = useState("");
  const savePeople = (next: typeof people, nextGroups = chosenGroups) => {
    setPeople(next);
    setGroups(nextGroups);
    run(() => setBoardPeople(board.id, { people: next.map(p => p.id), owners: next.filter(p => p.owner).map(p => p.id), groups: nextGroups }), s.saved);
  };
  const [confirm, setConfirm] = useState("");
  const readOnly = !board.own;

  return (
    <div className="settings">
      {readOnly && <p className="notice" style={{ margin: 0 }}>{s.readOnly}</p>}
      <Box title={s.general}>
        <form className="stack" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => updateBoard(board.id, { name: String(d.get("name") ?? ""), color: String(d.get("color") ?? board.color) }), s.saved); }}>
          <div>
            <label className="label" htmlFor="board-name">{s.name}</label>
            <input id="board-name" name="name" className="field" defaultValue={board.name} maxLength={80} required disabled={readOnly} />
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={readOnly}>
            <legend className="label">{s.color}</legend>
            <div className="swatches">
              {palette.map(c => (
                <label key={c} className="swatch" style={{ background: `var(--${c})` }} title={t.colors[c]}>
                  <input type="radio" name="color" value={c} defaultChecked={c === board.color} aria-label={t.colors[c]} />
                </label>
              ))}
            </div>
          </fieldset>
          {!readOnly && <div><button type="submit" className="button">{s.save}</button></div>}
        </form>
      </Box>

      <Box title={s.who} icon={<People />}>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }} disabled={readOnly}>
          <legend className="visually-hidden">{s.who}</legend>
          <div className="choices">
            <label className="choice"><input type="radio" name="visibility" value="team" defaultChecked={board.visibility === "team"} onChange={() => run(() => updateBoard(board.id, { visibility: "team" }), s.saved)} />{s.team}</label>
            <label className="choice"><input type="radio" name="visibility" value="private" defaultChecked={board.visibility === "private"} onChange={() => run(() => updateBoard(board.id, { visibility: "private" }), s.saved)} /><span><Lock /> {s.private}</span></label>
          </div>
        </fieldset>
        <h3>{s.people}</h3>
        <p className="hint">{s.owners}</p>
        <ul className="list-rows">
          {people.map(p => (
            <li key={p.id}>
              <Avatar name={p.name} photo={p.photo} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <label className="row small">
                <input type="checkbox" checked={p.owner} disabled={readOnly || (p.owner && people.filter(x => x.owner).length === 1)} onChange={e => savePeople(people.map(x => (x.id === p.id ? { ...x, owner: e.target.checked } : x)))} />
                {s.owner}
              </label>
              {!readOnly && !(p.owner && people.filter(x => x.owner).length === 1) && (
                <button type="button" className="icon-button" onClick={() => savePeople(people.filter(x => x.id !== p.id))}><Close /><span className="visually-hidden">{format(s.removePerson, { name: p.name })}</span></button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && everyone.length > 0 && (
          <form className="row" onSubmit={e => { e.preventDefault(); const p = everyone.find(x => x.id === adding); if (p) savePeople([...people, { ...p, owner: false }]); setAdding(""); }}>
            <label className="visually-hidden" htmlFor="add-person">{s.addPerson}</label>
            <select id="add-person" className="select" style={{ flex: 1 }} value={adding} onChange={e => setAdding(e.target.value)}>
              <option value="">{s.addPerson}</option>
              {everyone.filter(p => !people.some(x => x.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="submit" className="button small quiet" disabled={!adding}><Plus />{s.addPerson}</button>
          </form>
        )}
        <h3>{s.groups}</h3>
        {groups.length === 0 ? <p className="hint">{s.noGroups}</p> : (
          <div className="row">
            {groups.map(g => (
              <label key={g.id} className="choice" style={{ padding: "var(--space-2) var(--space-3)" }}>
                <input type="checkbox" checked={chosenGroups.includes(g.id)} disabled={readOnly} onChange={e => savePeople(people, e.target.checked ? [...chosenGroups, g.id] : chosenGroups.filter(x => x !== g.id))} />
                {g.name}
              </label>
            ))}
          </div>
        )}
      </Box>

      <Box title={s.labels} icon={<Tag />}>
        <ul className="list-rows">
          {labels.map(l => (
            <li key={l.id}>
              <form className="row" style={{ flex: 1 }} onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => updateLabel(l.id, { name: String(d.get("name") ?? ""), color: String(d.get("color") ?? l.color) }), s.saved); }}>
                <span className={`dot c-${l.color}`} />
                <label className="visually-hidden" htmlFor={`label-${l.id}`}>{t.card.labelName}</label>
                <input id={`label-${l.id}`} name="name" className="field" style={{ flex: 1, minWidth: 140 }} defaultValue={l.name} maxLength={40} placeholder={t.colors[l.color]} disabled={readOnly} />
                <label className="visually-hidden" htmlFor={`label-color-${l.id}`}>{s.color}</label>
                <select id={`label-color-${l.id}`} name="color" className="select" style={{ width: "auto" }} defaultValue={l.color} disabled={readOnly}>
                  {palette.map(c => <option key={c} value={c}>{t.colors[c]}</option>)}
                </select>
                {!readOnly && <button type="submit" className="button small quiet">{s.save}</button>}
                {!readOnly && <button type="button" className="icon-button" onClick={() => run(() => removeLabel(l.id))}><Trash /><span className="visually-hidden">{s.removeLabel}</span></button>}
              </form>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <form className="row" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); run(() => addLabel(board.id, { name: String(d.get("name") ?? ""), color: String(d.get("color") ?? "sky") }), undefined, () => form.reset()); }}>
            <label className="visually-hidden" htmlFor="new-label">{t.card.labelName}</label>
            <input id="new-label" name="name" className="field" style={{ flex: 1, minWidth: 140 }} maxLength={40} placeholder={t.card.labelName} />
            <label className="visually-hidden" htmlFor="new-label-color">{s.color}</label>
            <select id="new-label-color" name="color" className="select" style={{ width: "auto" }} defaultValue="sky">
              {palette.map(c => <option key={c} value={c}>{t.colors[c]}</option>)}
            </select>
            <button type="submit" className="button small quiet"><Plus />{s.addLabel}</button>
          </form>
        )}
      </Box>

      {(archivedColumns.length > 0 || archivedCards.length > 0 || !readOnly) && (
        <Box title={s.archivedCards} icon={<Archive />}>
          {archivedColumns.length > 0 && (
            <>
              <h3>{s.archivedColumns}</h3>
              <ul className="list-rows">
                {archivedColumns.map(c => <li key={c.id}><span style={{ flex: 1 }}>{c.name}</span>{!readOnly && <button type="button" className="button small quiet" onClick={() => run(() => archiveColumn(c.id, false))}><Restore />{s.restore}</button>}</li>)}
              </ul>
            </>
          )}
          {archivedCards.length === 0 ? <p className="hint">{s.noArchivedCards}</p> : (
            <ul className="list-rows">
              {archivedCards.map(c => (
                <li key={c.id}>
                  <a href={`/chest/boards/${board.id}?card=${c.id}`} style={{ flex: 1 }}>{c.title}</a>
                  <button type="button" className="button small quiet" onClick={() => run(() => archiveCard(c.id, false))}><Restore />{s.restore}</button>
                  <button type="button" className="link-button danger" onClick={() => run(() => deleteCard(c.id))}>{s.deleteForever}</button>
                </li>
              ))}
            </ul>
          )}
        </Box>
      )}

      <Box title={s.export} icon={<Download />}>
        <div className="row">
          <a className="button quiet" href={`/chest/boards/${board.id}/export?format=csv`}><Download />{s.exportCsv}</a>
          <a className="button quiet" href={`/chest/boards/${board.id}/export?format=json`}><Download />{s.exportJson}</a>
        </div>
      </Box>

      {!readOnly && (
        <Box title={s.danger} icon={<Archive />} danger>
          {board.archived ? (
            <>
              <p>{s.archivedNotice}</p>
              <div><button type="button" className="button quiet" onClick={() => run(() => archiveBoard(board.id, false), s.saved, () => router.refresh())}><Restore />{s.restoreBoard}</button></div>
              <form className="stack" onSubmit={e => { e.preventDefault(); run(() => deleteBoard(board.id), undefined, () => router.push("/chest/boards")); }}>
                <p className="hint">{s.deleteHint}</p>
                <label className="label" htmlFor="confirm-delete">{s.deleteConfirm}</label>
                <input id="confirm-delete" className="field" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
                <div><button type="submit" className="button danger" disabled={confirm.trim() !== board.name}><Trash />{s.delete}</button></div>
              </form>
            </>
          ) : (
            <>
              <p className="hint">{s.archiveHint}</p>
              <div><button type="button" className="button danger" onClick={() => run(() => archiveBoard(board.id, true), undefined, () => router.push("/chest/boards"))}><Archive />{s.archive}</button></div>
            </>
          )}
        </Box>
      )}
    </div>
  );
}

function Box({ title, icon, danger = false, children }: { title: string; icon?: ReactNode; danger?: boolean; children: ReactNode }) {
  return <section className={`card-box${danger ? " danger-zone" : ""}`}><h2>{icon}{title}</h2>{children}</section>;
}
