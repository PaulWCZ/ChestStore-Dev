import { call, fill, plural, toast, type Plural } from "@argentic/chest-app/client";
import { Avatar, Menu } from "@argentic/chest-ui/components";
import { useEffect, useRef, useState } from "react";
import { PriorityChip, Waiting } from "../components/badges.tsx";
import { Check, Flag, Note, Person, Reply, Tag } from "../components/icons.tsx";
import { busy } from "../components/keys.ts";
import { limits, type Priority, type Status } from "../shared/model.ts";

type Row = {
  number: number; subject: string; status: Status; priority: Priority; priorityLabel: string; tags: { id: string; name: string }[];
  customer: string; last: string; lastKind: string; assignee: string | null; when: string | null; updatedAt: string;
  waiting: { text: string; late: boolean; lateText: string } | null;
};
type Words = {
  selectPage: string; select: string; selected: Plural; bulk: string; bulkAssign: string; bulkNobody: string; bulkPriority: string;
  bulkTag: string; bulkTagPlaceholder: string; bulkApply: string; bulkClose: string; bulkSpam: string; bulkClear: string;
  bulkDone: Plural; moreTags: string; noteLast: string; replyLast: string; unassignedTag: string;
};
// An urgent ticket not closed yet: a red edge on its row.
const urgent = (r: Row) => r.priority === "urgent" && r.status !== "closed";
type BulkAction = { kind: "assign"; assignee: string | null } | { kind: "status"; status: Status } | { kind: "tag"; name: string } | { kind: "priority"; priority: Priority };

// The inbox's list: a row per ticket (open it with a click, or j/k then
// Enter), and a tick on each for those who manage tickets. Ticked, a bar
// offers what to do with them all — give them to someone, a priority (the
// kit's menus), a tag, close, spam — each with an Undo that says whether
// it worked.
export function InboxList({ rows, canManage, team, priorities, t, locale }: { rows: Row[]; canManage: boolean; team: { id: string; name: string }[]; priorities: { value: Priority; label: string }[]; t: Words; locale: string }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState(-1);
  const [tag, setTag] = useState("");
  const [pending, setPending] = useState(false);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const visible = new Set(rows.map(r => r.number));
  const chosen = [...selected].filter(n => visible.has(n));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy(e) || rows.length === 0) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.min(rows.length - 1, Math.max(0, focus + (e.key === "j" ? 1 : -1)));
        setFocus(next);
        links.current[next]?.focus();
      } else if (e.key === "x" && canManage && focus >= 0) {
        e.preventDefault();
        toggle(rows[focus]!.number);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle(n: number) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }
  async function run(action: BulkAction) {
    const numbers = chosen;
    setPending(true);
    const r = await call("bulk", { numbers, action });
    setPending(false);
    if (!r.ok) return;
    setSelected(new Set());
    setTag("");
    const done = r.value;
    toast({
      text: plural(locale, t.bulkDone, done.before.length),
      undo: async () => {
        const back = await call("unbulk", { before: done.before, tag: done.tag }, { quiet: true });
        return back.ok || back.message;
      },
    });
  }
  const all = rows.length > 0 && rows.every(r => selected.has(r.number));

  return (
    <>
      {canManage && (
        <div className="bulk-line">
          <label className="check-label">
            <input type="checkbox" checked={all} onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.number)) : new Set())} />
            {t.selectPage}
          </label>
          {chosen.length > 0 && (
            <div className="bulk-bar" role="group" aria-label={t.bulk}>
              <strong>{plural(locale, t.selected, chosen.length)}</strong>
              <Menu label={t.bulkAssign} showLabel align="start" icon={<Person />} items={[
                { id: "nobody", label: t.bulkNobody, onSelect: () => void run({ kind: "assign", assignee: null }), disabled: pending },
                ...team.map(p => ({ id: p.id, label: p.name, onSelect: () => void run({ kind: "assign", assignee: p.id }), disabled: pending })),
              ]} />
              <Menu label={t.bulkPriority} showLabel align="start" icon={<Flag />} items={priorities.map(p => ({ label: p.label, onSelect: () => void run({ kind: "priority", priority: p.value }), disabled: pending }))} />
              <form className="row bulk-tag" onSubmit={e => { e.preventDefault(); if (tag.trim()) void run({ kind: "tag", name: tag.trim() }); }}>
                <label htmlFor="bulk-tag" className="visually-hidden">{t.bulkTag}</label>
                <input id="bulk-tag" className="field" value={tag} onChange={e => setTag(e.target.value)} placeholder={t.bulkTagPlaceholder} maxLength={limits.tag} />
                <button type="submit" className="ck-button ck-button-quiet ck-button-small" disabled={pending || !tag.trim()}><Tag />{t.bulkApply}</button>
              </form>
              <button type="button" className="ck-button ck-button-small" disabled={pending} onClick={() => void run({ kind: "status", status: "closed" })}><Check />{t.bulkClose}</button>
              <button type="button" className="link-button danger" disabled={pending} onClick={() => void run({ kind: "status", status: "spam" })}>{t.bulkSpam}</button>
              <button type="button" className="link-button" onClick={() => setSelected(new Set())}>{t.bulkClear}</button>
            </div>
          )}
        </div>
      )}
      <ul className="tickets">
        {rows.map((r, i) => (
          <li key={r.number} className={canManage ? "with-check" : undefined}>
            {canManage && (
              <label className="row-check">
                <input type="checkbox" checked={selected.has(r.number)} onChange={() => toggle(r.number)} />
                <span className="visually-hidden">{fill(t.select, { number: r.number })}</span>
              </label>
            )}
            <a ref={el => { links.current[i] = el; }} onFocus={() => setFocus(i)} className={`ticket-row${urgent(r) ? " is-urgent" : ""}${selected.has(r.number) ? " is-selected" : ""}`} href={`/chest/tickets/${r.number}`}>
              <span className="who"><Avatar name={r.customer} /></span>
              <span className="subject">
                <PriorityChip priority={r.priority} label={r.priorityLabel} />
                <span>{r.subject}</span>
                {r.tags.slice(0, 3).map(g => <span key={g.id} className="chip tag"><Tag />{g.name}</span>)}
                {r.tags.length > 3 && <span className="chip tag">{fill(t.moreTags, { count: r.tags.length - 3 })}</span>}
              </span>
              <span className="meta">
                <span className="num">#{r.number}</span>
                {r.waiting ? <Waiting {...r.waiting} /> : <time dateTime={r.updatedAt}>{r.when}</time>}
                {r.assignee ? <span className="chip">{r.assignee}</span> : <span className="chip unassigned">{t.unassignedTag}</span>}
              </span>
              <span className="preview">
                {r.lastKind === "note" ? <><Note /> {t.noteLast} · </> : r.lastKind === "reply" ? <><Reply /> {t.replyLast} · </> : null}
                <strong>{r.customer}</strong> — {r.last}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
