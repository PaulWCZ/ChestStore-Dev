"use client";

import { useMemo, useState, useTransition } from "react";
import { Avatar } from "../../../../../../components/avatar.tsx";
import { CopyButton } from "../../../../../../components/copy-button.tsx";
import { Close, Link as LinkIcon } from "../../../../../../components/icons.tsx";
import { useToast } from "../../../../../../components/toast.tsx";
import type { Catalogue } from "../../../../../../lib/i18n/index.ts";
import { format } from "../../../../../../lib/i18n/format.ts";
import type { Kind } from "../../../../../../lib/model.ts";
import { shareForm } from "../../../../actions.ts";

type Person = { id: string; name: string; photo: string | null };
type Props = {
  formId: string;
  link: string | null;
  open: boolean;
  audience: "public" | "team";
  questions: { id: string; title: string; kind: Kind; options: string[] }[];
  owner: Person;
  shared: (Person & { level: "editor" | "viewer" })[];
  candidates: { id: string; name: string }[];
  canManage: boolean;
  t: { share: Catalogue["share"]; levels: Catalogue["levels"]; errors: Catalogue["errors"]; yes: string; no: string };
};

export function ShareView(p: Props) {
  const { share: s, levels } = p.t;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [question, setQuestion] = useState(p.questions[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState("");
  const [level, setLevel] = useState<"editor" | "viewer">("viewer");
  const q = p.questions.find(x => x.id === question);
  const prefilled = useMemo(() => (p.link && q && value.trim() ? `${p.link}?${new URLSearchParams({ [q.id]: value.trim() }).toString()}` : null), [p.link, q, value]);

  const act = (memberId: string, lvl: "editor" | "viewer" | null, done: string) => start(async () => {
    const r = await shareForm(p.formId, memberId, lvl);
    toast(r.ok ? done : format(p.t.errors[r.error] ?? p.t.errors.unknown, r.values ?? {}));
  });

  return (
    <div className="panel-page">
      <section className="panel" aria-labelledby="share-link">
        <h2 id="share-link">{p.audience === "public" ? s.publicLink : s.teamLink}</h2>
        {p.link ? (
          <>
            <div className="link-box big"><LinkIcon /><code>{p.link}</code></div>
            <div className="row-actions">
              <CopyButton text={p.link} label={s.copy} done={s.copied} className="button" />
              <a className="button quiet" href={p.link} target="_blank" rel="noreferrer">{s.open}</a>
            </div>
            {!p.open && <p className="notice">{s.closedNote}</p>}
          </>
        ) : <p className="notice">{s.notLive}</p>}
      </section>

      {p.link && p.questions.length > 0 && (
        <section className="panel" aria-labelledby="share-prefill">
          <h2 id="share-prefill">{s.prefill}</h2>
          <p className="hint">{s.prefillHint}</p>
          <div className="prefill">
            <label className="mini">
              <span className="mini-label">{s.prefillQuestion}</span>
              <select className="field" value={question} onChange={e => { setQuestion(e.target.value); setValue(""); }}>
                {p.questions.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </label>
            <label className="mini grow">
              <span className="mini-label">{s.prefillValue}</span>
              {q && q.options.length > 0 ? (
                <select className="field" value={value} onChange={e => setValue(e.target.value)}>
                  <option value="">—</option>
                  {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : q?.kind === "yesno" ? (
                <select className="field" value={value} onChange={e => setValue(e.target.value)}>
                  <option value="">—</option>
                  <option value="yes">{p.t.yes}</option>
                  <option value="no">{p.t.no}</option>
                </select>
              ) : (
                <input className="field" type={q?.kind === "date" ? "date" : "text"} value={value} onChange={e => setValue(e.target.value)} />
              )}
            </label>
          </div>
          {prefilled && (
            <>
              <p className="mini-label">{s.prefillLink}</p>
              <div className="link-box"><code>{prefilled}</code></div>
              <CopyButton text={prefilled} label={s.copy} done={s.copied} />
            </>
          )}
        </section>
      )}

      <section className="panel" aria-labelledby="share-people">
        <h2 id="share-people">{s.people}</h2>
        <p className="hint">{s.peopleHint}</p>
        <ul className="people-list">
          <li><Avatar name={p.owner.name} photo={p.owner.photo} /><span className="person-name">{p.owner.name}</span><span className="level">{levels.owner}</span></li>
          {p.shared.map(x => (
            <li key={x.id}>
              <Avatar name={x.name} photo={x.photo} />
              <span className="person-name">{x.name}</span>
              {p.canManage ? (
                <>
                  <label className="visually-hidden" htmlFor={`lvl-${x.id}`}>{x.name}</label>
                  <select id={`lvl-${x.id}`} className="field compact" value={x.level} disabled={pending} onChange={e => act(x.id, e.target.value as "editor" | "viewer", format(s.added, { name: x.name }))}>
                    <option value="editor">{levels.editor}</option>
                    <option value="viewer">{levels.viewer}</option>
                  </select>
                  <button type="button" className="icon-button" disabled={pending} onClick={() => act(x.id, null, format(s.removed, { name: x.name }))}><Close /><span className="visually-hidden">{s.remove}</span></button>
                </>
              ) : <span className="level">{levels[x.level]}</span>}
            </li>
          ))}
        </ul>
        {p.shared.length === 0 && <p className="hint">{s.nobody}</p>}
        {p.canManage && p.candidates.length > 0 && (
          <form className="add-person" onSubmit={e => { e.preventDefault(); if (adding) { const name = p.candidates.find(c => c.id === adding)?.name ?? ""; act(adding, level, format(s.added, { name })); setAdding(""); } }}>
            <label className="mini grow">
              <span className="mini-label">{s.addPerson}</span>
              <select className="field" value={adding} onChange={e => setAdding(e.target.value)}>
                <option value="">{s.pick}</option>
                {p.candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="mini">
              <span className="visually-hidden">{s.addPerson}</span>
              <select className="field" value={level} onChange={e => setLevel(e.target.value as "editor" | "viewer")}>
                <option value="viewer">{levels.viewer}</option>
                <option value="editor">{levels.editor}</option>
              </select>
            </label>
            <button type="submit" className="button" disabled={!adding || pending}>{s.add}</button>
          </form>
        )}
        {!p.canManage && <p className="hint">{s.ownerNote}</p>}
      </section>
    </div>
  );
}
