import { call, fill, navigate, toast } from "@argentic/chest-app/client";
import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useState } from "react";
import { StateBadge } from "../components/badges.tsx";
import { Check, Cross, Tag } from "../components/icons.tsx";
import { busy } from "../components/keys.ts";
import type { Catalogue } from "../i18n/index.ts";
import { limits, priorities, type Priority, type Status } from "../shared/model.ts";

type TagRow = { id: string; name: string };
type Ticket = { number: number; status: Status; customerName: string; customerEmail: string; requester: string | null; assignee: string | null; priority: Priority; tags: TagRow[]; rating: "good" | "bad" | null };
type Words = { ticket: Catalogue["ticket"]; priority: Catalogue["priority"]; peoplePicker: PeoplePickerWords };
type Outcome = { ok: true } | { ok: false; message: string };

// Beside a ticket: who it is from (correct a customer's address: Change),
// who has it (the kit's people picker, or Take it), its priority, its
// tags (typed or picked; a click shows every ticket carrying one), its
// state (Close with Undo — key e —, Spam, Reopen), the customer's other
// requests, and Merge into another of theirs (with Undo). Each change is
// saved at once and the page shows it.
export function TicketSide({ ticket, tagNames, others, team, me, canAnswer, canManage, locale, t }: { ticket: Ticket; tagNames: string[]; others: { number: number; subject: string; status: Status; when: string }[]; team: { id: string; name: string; photo: string | null }[]; me: string; canAnswer: boolean; canManage: boolean; locale: string; t: Words }) {
  const w = t.ticket;
  const [priority, setPriority] = useState(ticket.priority);
  const [tags, setTags] = useState(ticket.tags);
  const [newTag, setNewTag] = useState("");
  const [editing, setEditing] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  // The page's newer word (a refresh) wins over what was shown at once.
  useEffect(() => setPriority(ticket.priority), [ticket.priority]);
  useEffect(() => setTags(ticket.tags), [ticket.tags]);

  // An act on the ticket, and — when one is given — a toast whose Undo
  // says whether it worked.
  async function act(step: () => Promise<Outcome>, done?: string, undo?: () => Promise<Outcome>) {
    const r = await step();
    if (!r.ok || !done) return;
    toast({ id: `ticket-${ticket.number}`, text: done, ...(undo ? { undo: async () => { const back = await undo(); return back.ok || back.message; } } : {}) });
  }
  const setStatus = (status: Status, quiet = false) => call("setStatus", { number: ticket.number, status }, { quiet });
  const closeIt = () => void act(() => setStatus("closed"), w.closedToast, () => setStatus(ticket.status, true));

  // Key e closes the ticket (the ? sheet lists it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy(e) || !canAnswer) return;
      if (e.key === "e" && canManage && ticket.status !== "closed" && ticket.status !== "spam") {
        e.preventDefault();
        closeIt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function changePriority(value: Priority) {
    setPriority(value);
    const r = await call("setPriority", { number: ticket.number, priority: value });
    if (!r.ok) return setPriority(ticket.priority);
    toast({ id: `priority-${ticket.number}`, text: fill(w.priorityToast, { priority: t.priority[value] }) });
  }
  async function tagIt(name: string) {
    const text = name.trim().replace(/\s+/gu, " ");
    if (!text) return;
    setNewTag("");
    if (tags.some(g => g.name.toLowerCase() === text.toLowerCase())) return;
    setTags([...tags, { id: "new", name: text }]);
    const r = await call("addTag", { number: ticket.number, name: text });
    if (!r.ok) {
      setTags(ticket.tags);
      setNewTag(text);
    }
  }
  async function untag(tag: TagRow) {
    setTags(tags.filter(g => g.id !== tag.id));
    const r = await call("removeTag", { number: ticket.number, tag: tag.id });
    if (!r.ok) setTags(ticket.tags);
  }
  async function mergeIt(into: number) {
    const r = await call("merge", { number: ticket.number, into }, { refresh: false });
    if (!r.ok) return;
    const before = r.value.status;
    toast({
      id: `merge-${ticket.number}`,
      text: fill(w.mergedToast, { number: into }),
      undo: async () => {
        const back = await call("unmerge", { number: ticket.number, status: before }, { quiet: true, refresh: false });
        if (!back.ok) return back.message;
        await navigate(`/chest/tickets/${ticket.number}`);
        return true;
      },
    });
    await navigate(`/chest/tickets/${into}`);
  }
  async function saveCustomer(data: FormData) {
    const r = await call("setCustomer", { number: ticket.number, email: String(data.get("email") ?? ""), name: String(data.get("name") ?? "") });
    if (!r.ok) return;
    setEditing(false);
    toast({ id: `customer-${ticket.number}`, text: w.customerSaved });
  }

  const statusChip = <StateBadge status={ticket.status} label={w.statuses[ticket.status]} />;
  return (
    <aside className="side-card" aria-label={w.customer}>
      <div className="fact">
        <p className="label">{w.from}</p>
        {ticket.requester ? (
          <>
            <p className="row"><strong>{ticket.requester}</strong></p>
            <p className="small muted">{w.colleagueHint}</p>
          </>
        ) : editing ? (
          <form className="stack" onSubmit={e => { e.preventDefault(); void saveCustomer(new FormData(e.currentTarget)); }}>
            <div><label className="label small" htmlFor="customer-email">{w.customerEmail}</label><input id="customer-email" name="email" type="email" className="field" defaultValue={ticket.customerEmail} required maxLength={254} /></div>
            <div><label className="label small" htmlFor="customer-name">{w.customerName}</label><input id="customer-name" name="name" className="field" defaultValue={ticket.customerName} maxLength={120} /></div>
            <div className="row"><button type="submit" className="ck-button ck-button-small">{w.saveCustomer}</button><button type="button" className="link-button" onClick={() => setEditing(false)}>{w.cancel}</button></div>
          </form>
        ) : (
          <>
            <p className="row"><strong>{ticket.customerName || <a href={`mailto:${ticket.customerEmail}`}>{ticket.customerEmail}</a>}</strong>{canManage && <button type="button" className="link-button" onClick={() => setEditing(true)}>{w.editCustomer}</button>}</p>
            {ticket.customerName && <p className="small"><a href={`mailto:${ticket.customerEmail}`}>{ticket.customerEmail}</a></p>}
          </>
        )}
        {ticket.rating && <p className="small">{ticket.rating === "good" ? w.ratedGood : w.ratedBad}</p>}
      </div>
      <div className="fact">
        {canManage ? <p className="label" aria-hidden="true">{w.assignee}</p> : <p className="label">{w.assignee}</p>}
        {canManage ? (
          <div className="stack tight">
            <PeoplePicker id="assignee" label={w.assignee} hideLabel clearable value={team.filter(p => p.id === ticket.assignee)} search={localSearch(team)}
              suggestions={[...team.filter(p => p.id === me), ...team.filter(p => p.id !== me)].slice(0, 8)} suggestionsLabel={w.team}
              onChange={chosen => void act(() => call("assign", { number: ticket.number, assignee: chosen[0]?.id ?? null }))} labels={{ ...t.peoplePicker, placeholder: w.nobody }} lang={locale} />
            <div className="row">
              {ticket.assignee !== me && canAnswer && <button type="button" className="link-button" onClick={() => void act(() => call("assign", { number: ticket.number, assignee: me }))}>{w.takeIt}</button>}
            </div>
          </div>
        ) : <p>{team.find(p => p.id === ticket.assignee)?.name ?? w.nobody}</p>}
      </div>
      <div className="fact">
        <label className="label" htmlFor="priority">{w.priority}</label>
        {canManage ? (
          <select id="priority" className="select" value={priority} onChange={e => void changePriority(e.target.value as Priority)}>
            {priorities.map(p => <option key={p} value={p}>{t.priority[p]}</option>)}
          </select>
        ) : <p>{t.priority[priority]}</p>}
      </div>
      <div className="fact">
        <p className="label" id="tags-label">{w.tags}</p>
        {tags.length > 0 ? (
          <ul className="tag-list" aria-labelledby="tags-label">
            {tags.map(g => (
              <li key={g.id + g.name} className="chip tag">
                <a href={`/chest?tag=${g.id}`} aria-label={fill(w.tagTickets, { tag: g.name })}><Tag />{g.name}</a>
                {canManage && g.id !== "new" && <button type="button" className="untag" aria-label={fill(w.removeTag, { tag: g.name })} onClick={() => void untag(g)}><Cross /></button>}
              </li>
            ))}
          </ul>
        ) : <p className="small muted">{w.noTags}</p>}
        {canManage && (
          <form className="row add-tag" onSubmit={e => { e.preventDefault(); void tagIt(newTag); }}>
            <label htmlFor="new-tag" className="visually-hidden">{w.tagLabel}</label>
            <input id="new-tag" className="field" list="tag-names" value={newTag} maxLength={limits.tag} placeholder={w.tagPlaceholder} autoComplete="off" onChange={e => setNewTag(e.target.value)} />
            <datalist id="tag-names">{tagNames.filter(n => !tags.some(g => g.name === n)).map(n => <option key={n} value={n} />)}</datalist>
            <button type="submit" className="ck-button ck-button-quiet ck-button-small" disabled={!newTag.trim()}>{w.addTag}</button>
          </form>
        )}
      </div>
      <div className="fact">
        <p className="label">{w.status}</p>
        <div className="row">
          {statusChip}
          {canManage && (ticket.status === "closed" || ticket.status === "spam"
            ? <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={() => void act(() => setStatus("open"))}>{ticket.status === "spam" ? w.notSpam : w.reopen}</button>
            : <>
                <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={closeIt}><Check />{w.close}</button>
                <button type="button" className="link-button danger" onClick={() => void act(() => setStatus("spam"))}>{w.markSpam}</button>
              </>)}
        </div>
      </div>
      {others.length > 0 && (
        <div className="fact">
          <p className="label">{w.others}</p>
          <ul className="others">
            {others.map(o => <li key={o.number}><a href={`/chest/tickets/${o.number}`}>{o.subject}</a> <span className="small muted">#{o.number} · {w.statuses[o.status]} · {o.when}</span></li>)}
          </ul>
        </div>
      )}
      {canManage && ticket.status !== "spam" && (
        <details className="fact merge">
          <summary className="link-button">{w.merge}</summary>
          <form className="stack" onSubmit={e => { e.preventDefault(); const n = Number(mergeInto.replace(/^#/u, "")); if (n > 0) void mergeIt(n); }}>
            <label className="label small" htmlFor="merge-into">{w.mergeLabel}</label>
            <div className="row add-tag">
              <input id="merge-into" className="field" inputMode="numeric" list="merge-numbers" value={mergeInto} onChange={e => setMergeInto(e.target.value)} maxLength={10} aria-describedby="merge-hint" />
              <datalist id="merge-numbers">{others.filter(o => o.status !== "spam").map(o => <option key={o.number} value={o.number}>{o.subject}</option>)}</datalist>
              <button type="submit" className="ck-button ck-button-quiet ck-button-small" disabled={!/^#?[1-9][0-9]{0,8}$/u.test(mergeInto.trim())}>{w.mergeButton}</button>
            </div>
            <p id="merge-hint" className="hint">{w.mergeHint}</p>
          </form>
        </details>
      )}
    </aside>
  );
}
