"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "../../../../../../components/avatar.tsx";
import { CopyButton } from "../../../../../../components/copy-button.tsx";
import { Close, Globe, Link as LinkIcon } from "../../../../../../components/icons.tsx";
import { useToast } from "../../../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../../../lib/i18n/index.ts";
import { format } from "../../../../../../lib/i18n/format.ts";
import type { Kind } from "../../../../../../lib/model.ts";
import { findPeople, saveEmbedSites, shareForm } from "../../../../actions.ts";

type Person = { id: string; name: string; photo: string | null };
type Props = {
  formId: string;
  link: string | null;
  open: boolean;
  audience: "public" | "team";
  questions: { id: string; key: string | null; title: string; kind: Kind; options: string[] }[];
  owner: Person;
  shared: (Person & { level: "editor" | "viewer"; manager: boolean })[];
  taken: string[];
  canManage: boolean;
  embed: { sites: string[]; canEdit: boolean; title: string } | null;
  t: { share: Catalogue["share"]; levels: Catalogue["levels"]; errors: Catalogue["errors"]; yes: string; no: string };
};

// The code a website pastes: the form in a frame that takes the form's
// height (the form tells it, components/runner.tsx), or a button that
// opens the form. Attribute values are quoted and escaped.
const quoted = (s: string) => '"' + s.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;") + '"';
const frameCode = (url: string, title: string) =>
  `<iframe src=${quoted(url)} title=${quoted(title)} style="width:100%;min-height:640px;border:0" loading="lazy" data-chest-form></iframe>\n` +
  `<script>addEventListener("message",function(e){if(e.origin!==${JSON.stringify(new URL(url).origin)}||!e.data||e.data.type!=="chest-forms:height")return;document.querySelectorAll("iframe[data-chest-form]").forEach(function(f){if(f.contentWindow===e.source)f.style.height=e.data.height+"px"})})</script>`;
const buttonCode = (url: string, label: string) => `<a href=${quoted(url)} target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#5b2a86;color:#fff;font:600 16px system-ui;text-decoration:none">${label.replace(/</gu, "&lt;")}</a>`;

export function ShareView(p: Props) {
  const { share: s, levels } = p.t;
  const toast = useToast();
  const [pending, start] = useTransition();
  const [question, setQuestion] = useState(p.questions[0]?.id ?? "");
  const [value, setValue] = useState("");
  const q = p.questions.find(x => x.id === question);
  const prefilled = useMemo(() => (p.link && q && value.trim() ? `${p.link}?${new URLSearchParams({ [q.key ?? q.id]: value.trim() }).toString()}` : null), [p.link, q, value]);
  const say = (code: ErrorCode, values?: Record<string, string | number>) => format(p.t.errors[code] ?? p.t.errors.unknown, values ?? {});

  const act = (memberId: string, lvl: "editor" | "viewer" | null, done: string) => start(async () => {
    const r = await shareForm(p.formId, memberId, lvl);
    toast(r.ok ? done : say(r.error, r.values));
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
          {q && !q.key && <p className="hint">{s.prefillKeyHint}</p>}
          {prefilled && (
            <>
              <p className="mini-label">{s.prefillLink}</p>
              <div className="link-box"><code>{prefilled}</code></div>
              <CopyButton text={prefilled} label={s.copy} done={s.copied} />
            </>
          )}
        </section>
      )}

      {p.link && p.embed && <Embed link={p.link} embed={p.embed} s={s} say={say} />}

      <section className="panel" aria-labelledby="share-people">
        <h2 id="share-people">{s.people}</h2>
        <p className="hint">{s.peopleHint}</p>
        <ul className="people-list">
          <li><Avatar name={p.owner.name} photo={p.owner.photo} /><span className="person-name">{p.owner.name}</span><span className="level">{levels.owner}</span></li>
          {p.shared.map(x => (
            <li key={x.id}>
              <Avatar name={x.name} photo={x.photo} />
              <span className="person-name">{x.name}</span>
              {x.manager ? <span className="level">{levels.manager}</span> : p.canManage ? (
                <>
                  <label className="visually-hidden" htmlFor={`lvl-${x.id}`}>{format(s.levelOf, { name: x.name })}</label>
                  <select id={`lvl-${x.id}`} className="field compact" value={x.level} disabled={pending} onChange={e => act(x.id, e.target.value as "editor" | "viewer", format(s.added, { name: x.name }))}>
                    <option value="editor">{levels.editor}</option>
                    <option value="viewer">{levels.viewer}</option>
                  </select>
                </>
              ) : <span className="level">{levels[x.level]}</span>}
              {p.canManage && <button type="button" className="icon-button" disabled={pending} onClick={() => act(x.id, null, format(s.removed, { name: x.name }))}><Close /><span className="visually-hidden">{format(s.removeOne, { name: x.name })}</span></button>}
            </li>
          ))}
        </ul>
        {p.shared.length === 0 && <p className="hint">{s.nobody}</p>}
        {p.canManage && <PeoplePicker taken={p.taken} s={s} levels={levels} pending={pending} say={say} onAdd={(id, name, level) => act(id, level, format(s.added, { name }))} />}
        {!p.canManage && <p className="hint">{s.ownerNote}</p>}
      </section>
    </div>
  );
}

// Someone to share with: type a few letters of a name, the Chest finds
// them (arrows choose, Enter picks); then their level, then Add.
function PeoplePicker({ taken, s, levels, pending, say, onAdd }: { taken: string[]; s: Catalogue["share"]; levels: Catalogue["levels"]; pending: boolean; say: (c: ErrorCode) => string; onAdd: (id: string, name: string, level: "editor" | "viewer") => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; photo: string | null }[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [level, setLevel] = useState<"editor" | "viewer">("viewer");
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const asked = useRef(0);
  useEffect(() => {
    if (!open || picked) return;
    const n = ++asked.current;
    const timer = setTimeout(async () => {
      const r = await findPeople(text);
      if (n !== asked.current) return;
      if (!r.ok) return void toast(say(r.error));
      setFound(r.value.filter(x => !taken.includes(x.id)));
      setActive(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [text, open, picked, taken, toast, say]);
  const choose = (x: { id: string; name: string }) => {
    setPicked(x);
    setText(x.name);
    setOpen(false);
  };
  const list = open && !picked && found.length > 0;
  return (
    <form className="add-person" onSubmit={e => { e.preventDefault(); if (picked) { onAdd(picked.id, picked.name, level); setPicked(null); setText(""); setFound([]); } }}>
      <div className="mini grow combo">
        <label className="mini-label" htmlFor={id}>{s.addPerson}</label>
        <input id={id} className="field" role="combobox" aria-expanded={list} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={list ? `${id}-${active}` : undefined}
          value={text} placeholder={s.pick} autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setText(e.target.value); setPicked(null); setOpen(true); }}
          onKeyDown={e => {
            if (!list) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, found.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(found[active]!); }
            else if (e.key === "Escape") setOpen(false);
          }} />
        {list && (
          <ul className="combo-list" id={`${id}-list`} role="listbox" aria-label={s.addPerson}>
            {found.map((x, i) => (
              <li key={x.id} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseDown={e => { e.preventDefault(); choose(x); }}>
                <Avatar name={x.name} photo={x.photo} size={26} />{x.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="mini">
        <span className="mini-label">{s.levelLabel}</span>
        <select className="field" value={level} onChange={e => setLevel(e.target.value as "editor" | "viewer")}>
          <option value="viewer">{levels.viewer}</option>
          <option value="editor">{levels.editor}</option>
        </select>
      </label>
      <button type="submit" className="button" disabled={!picked || pending}>{s.add}</button>
    </form>
  );
}

// On the company's website: the websites allowed (managers), the frame's
// code and a button's code. Said plainly: the frame waits for the Chest.
function Embed({ link, embed, s, say }: { link: string; embed: { sites: string[]; canEdit: boolean; title: string }; s: Catalogue["share"]; say: (c: ErrorCode, v?: Record<string, string | number>) => string }) {
  const [sites, setSites] = useState(embed.sites.join("\n"));
  const [pending, start] = useTransition();
  const toast = useToast();
  const id = useId();
  return (
    <section className="panel" aria-labelledby="share-embed">
      <h2 id="share-embed"><Globe /> {s.embed}</h2>
      <p className="hint">{s.embedHint}</p>
      <label className="mini-label" htmlFor={`${id}-sites`}>{s.embedSites}</label>
      <textarea id={`${id}-sites`} className="field" rows={2} value={sites} readOnly={!embed.canEdit} placeholder={s.embedPlaceholder} onChange={e => setSites(e.target.value)} />
      {embed.canEdit ? (
        <div><button type="button" className="button quiet small" disabled={pending} onClick={() => start(async () => { const r = await saveEmbedSites(sites); if (r.ok) { setSites(r.value.sites.join("\n")); toast(s.embedSaved); } else toast(say(r.error, r.values)); })}>{s.embedSave}</button></div>
      ) : <p className="hint">{s.embedManagers}</p>}
      <label className="mini-label" htmlFor={`${id}-frame`}>{s.embedCode}</label>
      <textarea id={`${id}-frame`} className="field embed-code" readOnly rows={4} value={frameCode(link, embed.title)} />
      <div><CopyButton text={frameCode(link, embed.title)} label={s.embedCopy} done={s.embedCopied} /></div>
      <label className="mini-label" htmlFor={`${id}-button`}>{s.embedButton}</label>
      <textarea id={`${id}-button`} className="field embed-code" readOnly rows={2} value={buttonCode(link, s.embedButtonText)} />
      <div><CopyButton text={buttonCode(link, s.embedButtonText)} label={s.embedCopy} done={s.embedCopied} /></div>
      <p className="notice">{s.embedNote}</p>
    </section>
  );
}
