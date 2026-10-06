import { Avatar, Confirm, PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch } from "@argentic/chest-ui/components/logic";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Archive, Close, Download, Fields, Lock, People, Plus, Restore, Tag, Trash } from "../components/icons.tsx";
import { call, refresh, toast } from "../core/client.tsx";
import type { Outcome } from "../core/tool.ts";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { Column, Field, Label } from "../lib/boards.ts";
import { isColor, type Color } from "../shared/model.ts";

type Words = { settings: Catalogue["settings"]; colors: Catalogue["colors"]; card: Catalogue["card"]; fields: Catalogue["fields"]; peoplePicker: Catalogue["peoplePicker"] };
type Person = { id: string; name: string; photo: string | null };
// The colours offered: one per slot of the theme's palette (app/tokens.css).
// "Sand" shares slate's slot: kept where it is already chosen, not offered.
const palette: Color[] = ["sun", "tomato", "berry", "grape", "sky", "sea", "leaf", "slate"];
const offered = (current: Color) => (palette.includes(current) ? palette : [...palette, current]);
// The colour a form sent, or the one it had.
const colorOf = (value: FormDataEntryValue | null, current: Color): Color => (isColor(value) ? value : current);

export function BoardSettings({ board, members, everyone, groups, labels, fields, archivedColumns, archivedCards, locale, t }: {
  board: { id: string; name: string; color: Color; visibility: "team" | "private"; archived: boolean; own: boolean; writable: boolean; groups: string[] };
  members: (Person & { owner: boolean })[];
  everyone: Person[];
  groups: { id: string; name: string }[];
  labels: Label[];
  fields: Field[];
  archivedColumns: (Column & { cards: number })[];
  locale: string;
  archivedCards: { id: string; title: string }[];
  t: Words;
}) {
  const [, start] = useTransition();
  // A change: sent, said ("Saved") once taken, refused in the reader's
  // words (call()'s toast).
  const run: Run = (step, done, after) =>
    start(async () => {
      const r = await step();
      if (!r.ok) return;
      if (done) toast({ id: "saved", text: done });
      after?.();
    });
  const s = t.settings;
  const [people, setPeople] = useState(members);
  const [chosenGroups, setGroups] = useState(board.groups);
  const [visibility, setVisibility] = useState(board.visibility);
  const savePeople = (next: typeof people, nextGroups = chosenGroups) => {
    setPeople(next);
    setGroups(nextGroups);
    run(() => call("setBoardPeople", { id: board.id, people: next.map(p => p.id), owners: next.filter(p => p.owner).map(p => p.id), groups: nextGroups }), s.saved);
  };
  const [confirm, setConfirm] = useState("");
  const [erasing, setErasing] = useState<{ id: string; title: string } | null>(null);
  const readOnly = !board.own;
  const addable = useMemo(() => everyone.filter(p => !people.some(x => x.id === p.id)), [everyone, people]);
  const search = useMemo(() => localSearch(addable), [addable]);

  return (
    <div className="settings">
      {readOnly && <p className="notice flat">{s.readOnly}</p>}
      <Box title={s.general}>
        <form className="stack" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => call("updateBoard", { id: board.id, name: String(d.get("name") ?? ""), color: colorOf(d.get("color"), board.color) }), s.saved); }}>
          <div>
            <label className="label" htmlFor="board-name">{s.name}</label>
            <input id="board-name" name="name" className="field" defaultValue={board.name} maxLength={80} required disabled={readOnly} />
          </div>
          <fieldset className="plain" disabled={readOnly}>
            <legend className="label">{s.color}</legend>
            <div className="swatches">
              {offered(board.color).map(c => (
                <label key={c} className={`swatch c-${c}`} title={t.colors[c]}>
                  <input type="radio" name="color" value={c} defaultChecked={c === board.color} aria-label={t.colors[c]} />
                </label>
              ))}
            </div>
          </fieldset>
          {!readOnly && <div><button type="submit" className="button">{s.save}</button></div>}
        </form>
      </Box>

      <Box title={s.who} icon={<People />}>
        <fieldset className="stack plain" disabled={readOnly}>
          <legend className="visually-hidden">{s.who}</legend>
          <div className="choices">
            <label className="choice"><input type="radio" name="visibility" value="team" checked={visibility === "team"} onChange={() => { setVisibility("team"); run(() => call("updateBoard", { id: board.id, visibility: "team" }), s.saved); }} />{s.team}</label>
            <label className="choice"><input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => { setVisibility("private"); run(() => call("updateBoard", { id: board.id, visibility: "private" }), s.saved); }} /><span><Lock /> {s.private}</span></label>
          </div>
        </fieldset>
        <h3>{visibility === "private" ? s.people : s.ownersTitle}</h3>
        <p className="hint">{visibility === "private" ? s.owners : s.ownersTeam}</p>
        <ul className="list-rows">
          {people.map(p => (
            <li key={p.id}>
              <Avatar name={p.name} photo={p.photo} />
              <span className="grow">{p.name}</span>
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
        {/* Chosen, added: one step. In a team board, whom one adds owns it. */}
        {!readOnly && addable.length > 0 && (
          <PeoplePicker key={people.length} id="add-person" label={visibility === "private" ? s.addPerson : s.addOwner} value={[]} search={search} suggestions={addable.slice(0, 12)} labels={t.peoplePicker} lang={locale}
            onChange={([p]) => { if (p) savePeople([...people, { id: p.id, name: p.name, photo: p.photo ?? null, owner: visibility === "team" }]); }} />
        )}
        {visibility === "private" && <h3>{s.groups}</h3>}
        {visibility !== "private" ? null : groups.length === 0 ? <p className="hint">{s.noGroups}</p> : (
          <div className="row">
            {groups.map(g => (
              <label key={g.id} className="choice small-choice">
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
              <form className="row grow" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => call("updateLabel", { id: l.id, name: String(d.get("name") ?? ""), color: colorOf(d.get("color"), l.color) }), s.saved); }}>
                <span className={`dot c-${l.color}`} />
                <label className="visually-hidden" htmlFor={`label-${l.id}`}>{t.card.labelName}</label>
                <input id={`label-${l.id}`} name="name" className="field grow" defaultValue={l.name} maxLength={40} placeholder={t.colors[l.color]} disabled={readOnly} />
                <label className="visually-hidden" htmlFor={`label-color-${l.id}`}>{s.color}</label>
                <select id={`label-color-${l.id}`} name="color" className="select inline" defaultValue={l.color} disabled={readOnly}>
                  {offered(l.color).map(c => <option key={c} value={c}>{t.colors[c]}</option>)}
                </select>
                {!readOnly && <button type="submit" className="button small quiet">{s.save}</button>}
                {!readOnly && <button type="button" className="icon-button" onClick={() => run(() => call("removeLabel", { id: l.id }))}><Trash /><span className="visually-hidden">{s.removeLabel}</span></button>}
              </form>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <form className="row" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); run(() => call("addLabel", { board: board.id, name: String(d.get("name") ?? ""), color: colorOf(d.get("color"), "sky") }), undefined, () => form.reset()); }}>
            <label className="visually-hidden" htmlFor="new-label">{t.card.labelName}</label>
            <input id="new-label" name="name" className="field grow" maxLength={40} placeholder={t.card.labelName} />
            <label className="visually-hidden" htmlFor="new-label-color">{s.color}</label>
            <select id="new-label-color" name="color" className="select inline" defaultValue="sky">
              {palette.map(c => <option key={c} value={c}>{t.colors[c]}</option>)}
            </select>
            <button type="submit" className="button small quiet"><Plus />{s.addLabel}</button>
          </form>
        )}
      </Box>

      <Box title={t.fields.title} icon={<Fields />}>
        <p className="hint">{t.fields.hint}</p>
        <ul className="list-rows">
          {fields.map(f => <FieldRow key={f.id} field={f} writable={board.writable} t={t} run={run} />)}
        </ul>
        {board.writable && <NewField boardId={board.id} t={t} run={run} />}
      </Box>

      {(archivedColumns.length > 0 || archivedCards.length > 0 || !readOnly) && (
        <Box title={s.archivedCards} icon={<Archive />}>
          {archivedColumns.length > 0 && (
            <>
              <h3>{s.archivedColumns}</h3>
              <ul className="list-rows">
                {archivedColumns.map(c => <li key={c.id}><span className="grow">{c.name} <span className="muted small">{plural(s.columnCards, c.cards, locale)}</span></span>{board.writable && <button type="button" className="button small quiet" onClick={() => run(() => call("archiveColumn", { id: c.id, archived: false }))}><Restore />{s.restore}</button>}</li>)}
              </ul>
            </>
          )}
          {archivedCards.length === 0 ? <p className="hint">{s.noArchivedCards}</p> : (
            <ul className="list-rows">
              {archivedCards.map(c => (
                <li key={c.id}>
                  <a href={`/chest/boards/${board.id}?card=${c.id}`} className="grow">{c.title}</a>
                  <button type="button" className="button small quiet" onClick={() => run(() => call("archiveCard", { id: c.id, archived: false }))}><Restore />{s.restore}</button>
                  <button type="button" className="link-button danger" onClick={() => setErasing(c)}>{s.deleteForever}</button>
                </li>
              ))}
            </ul>
          )}
        </Box>
      )}

      {/* Deleting an archived card cannot be undone: asked first, in the page. */}
      <Confirm open={erasing !== null} title={format(t.card.deleteTitle, { title: erasing?.title ?? "" })} body={t.card.deleteBody} confirmLabel={t.card.deleteForever} cancelLabel={t.card.cancel}
        onCancel={() => setErasing(null)} onConfirm={() => { const c = erasing; setErasing(null); if (c) run(() => call("deleteCard", { id: c.id })); }} />

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
              <div><button type="button" className="button quiet" onClick={() => run(() => call("archiveBoard", { id: board.id, archived: false }), s.saved, () => void refresh())}><Restore />{s.restoreBoard}</button></div>
              <form className="stack" onSubmit={e => { e.preventDefault(); run(() => call("deleteBoard", { id: board.id }, { refresh: false }), undefined, () => location.assign("/chest/boards")); }}>
                <p className="hint">{s.deleteHint}</p>
                <label className="label" htmlFor="confirm-delete">{s.deleteConfirm}</label>
                <input id="confirm-delete" className="field" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
                <div><button type="submit" className="button danger" disabled={confirm.trim() !== board.name}><Trash />{s.delete}</button></div>
              </form>
            </>
          ) : (
            <>
              <p className="hint">{s.archiveHint}</p>
              <div><button type="button" className="button danger" onClick={() => run(() => call("archiveBoard", { id: board.id, archived: true }, { refresh: false }), undefined, () => location.assign("/chest/boards"))}><Archive />{s.archive}</button></div>
            </>
          )}
        </Box>
      )}
    </div>
  );
}

type Run = (step: () => Promise<Outcome<unknown>>, done?: string, after?: () => void) => void;

// A field of the board: its name, and for a choice its options (one per
// line). Removing it removes its values from the cards.
function FieldRow({ field, writable, t, run }: { field: Field; writable: boolean; t: Words; run: Run }) {
  return (
    <li>
      <form className="stack grow" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); run(() => call("updateField", { id: field.id, name: String(d.get("name") ?? ""), ...(field.kind === "choice" ? { options: String(d.get("options") ?? "").split("\n") } : {}) }), t.settings.saved); }}>
        <div className="row">
          <label className="visually-hidden" htmlFor={`field-name-${field.id}`}>{t.fields.name}</label>
          <input id={`field-name-${field.id}`} name="name" className="field grow" defaultValue={field.name} maxLength={40} disabled={!writable} />
          <span className="chip">{t.fields.kinds[field.kind]}</span>
          {writable && <button type="submit" className="button small quiet">{t.settings.save}</button>}
          {writable && <button type="button" className="icon-button" onClick={() => run(() => call("removeField", { id: field.id }))}><Trash /><span className="visually-hidden">{format(t.fields.remove, { name: field.name })}</span></button>}
        </div>
        {field.kind === "choice" && (
          <div>
            <label className="label" htmlFor={`field-options-${field.id}`}>{t.fields.options}</label>
            <textarea id={`field-options-${field.id}`} name="options" className="field" rows={Math.min(8, field.options.length + 1)} defaultValue={field.options.join("\n")} disabled={!writable} />
          </div>
        )}
      </form>
    </li>
  );
}

function NewField({ boardId, t, run }: { boardId: string; t: Words; run: Run }) {
  const [kind, setKind] = useState<Field["kind"]>("text");
  return (
    <form className="stack new-field" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); run(() => call("addField", { board: boardId, name: String(d.get("name") ?? ""), kind, ...(kind === "choice" ? { options: String(d.get("options") ?? "").split("\n") } : {}) }), undefined, () => { form.reset(); setKind("text"); }); }}>
      <div className="row">
        <label className="visually-hidden" htmlFor="new-field-name">{t.fields.name}</label>
        <input id="new-field-name" name="name" className="field grow" maxLength={40} placeholder={t.fields.namePlaceholder} />
        <label className="visually-hidden" htmlFor="new-field-kind">{t.fields.kind}</label>
        <select id="new-field-kind" className="select inline" value={kind} onChange={e => setKind(e.target.value as Field["kind"])}>
          <option value="text">{t.fields.kinds.text}</option>
          <option value="number">{t.fields.kinds.number}</option>
          <option value="choice">{t.fields.kinds.choice}</option>
        </select>
        <button type="submit" className="button small quiet"><Plus />{t.fields.add}</button>
      </div>
      {kind === "choice" && (
        <div>
          <label className="label" htmlFor="new-field-options">{t.fields.options}</label>
          <textarea id="new-field-options" name="options" className="field" rows={3} placeholder={t.fields.optionsPlaceholder} />
        </div>
      )}
    </form>
  );
}

function Box({ title, icon, danger = false, children }: { title: string; icon?: ReactNode; danger?: boolean; children: ReactNode }) {
  return <section className={`card-box${danger ? " danger-zone" : ""}`}><h2>{icon}{title}</h2>{children}</section>;
}
