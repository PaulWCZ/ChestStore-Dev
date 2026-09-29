"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar, Menu, useToast } from "@argentic/chest-ui/components";
import { PriorityChip, Waiting } from "../../components/badges.tsx";
import { Check, Flag, Note, Person, Reply, Tag } from "../../components/icons.tsx";
import { busy } from "../../components/keys.tsx";
import { format, plural } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { limits, priorities, type Priority, type Status } from "../../lib/model.ts";
import { bulk, unbulk } from "./actions.ts";

type Row = {
  number: number; subject: string; status: Status; priority: Priority; tags: { id: string; name: string }[];
  customer: string; last: string; lastKind: string; assignee: string | null; when: string | null; updatedAt: string;
  waiting: { text: string; late: boolean; lateText: string } | null;
};
type Words = { inbox: Catalogue["inbox"]; priority: Catalogue["priority"]; errors: Catalogue["errors"]; statuses: Catalogue["ticket"]["statuses"] };
type Action = Parameters<typeof bulk>[1];

// The inbox's list: a row per ticket (open it with a click, or j/k then
// Enter), and a tick on each for those who manage tickets. Ticked, a bar
// offers what to do with them all — give them to someone, a priority (the
// kit's menus), a tag, close, spam — each with an Undo that says whether
// it worked.
export function InboxList({ rows, canManage, team, t, locale }: { rows: Row[]; canManage: boolean; team: { id: string; name: string }[]; t: Words; locale: string }) {
  const w = t.inbox;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState(-1);
  const [tag, setTag] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
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
  function run(action: Action) {
    const numbers = chosen;
    start(async () => {
      const r = await bulk(numbers, action);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? { max: limits.tag }), tone: "error" });
      setSelected(new Set());
      setTag("");
      const done = r.value;
      toast({
        text: plural(w.bulkDone, done.before.length, locale),
        undo: async () => {
          const back = await unbulk(done.before, done.tag);
          router.refresh();
          return back.ok || t.errors[back.error];
        },
      });
      router.refresh();
    });
  }
  const all = rows.length > 0 && rows.every(r => selected.has(r.number));

  return (
    <>
      {canManage && (
        <div className="bulk-line">
          <label className="check-label">
            <input type="checkbox" checked={all} onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.number)) : new Set())} />
            {w.selectPage}
          </label>
          {chosen.length > 0 && (
            <div className="bulk-bar" role="group" aria-label={w.bulk}>
              <strong>{plural(w.selected, chosen.length, locale)}</strong>
              <Menu label={w.bulkAssign} showLabel align="start" icon={<Person />} items={[
                { label: w.bulkNobody, onSelect: () => run({ kind: "assign", assignee: null }), disabled: pending },
                ...team.map(p => ({ label: p.name, onSelect: () => run({ kind: "assign", assignee: p.id }), disabled: pending })),
              ]} />
              <Menu label={w.bulkPriority} showLabel align="start" icon={<Flag />} items={[...priorities].reverse().map(p => ({ label: t.priority[p], onSelect: () => run({ kind: "priority", priority: p }), disabled: pending }))} />
              <form className="row bulk-tag" onSubmit={e => { e.preventDefault(); if (tag.trim()) run({ kind: "tag", name: tag.trim() }); }}>
                <label htmlFor="bulk-tag" className="visually-hidden">{w.bulkTag}</label>
                <input id="bulk-tag" className="field" value={tag} onChange={e => setTag(e.target.value)} placeholder={w.bulkTagPlaceholder} maxLength={limits.tag} />
                <button type="submit" className="ck-button ck-button-quiet ck-button-small" disabled={pending || !tag.trim()}><Tag />{w.bulkApply}</button>
              </form>
              <button type="button" className="ck-button ck-button-small" disabled={pending} onClick={() => run({ kind: "status", status: "closed" })}><Check />{w.bulkClose}</button>
              <button type="button" className="link-button danger" disabled={pending} onClick={() => run({ kind: "status", status: "spam" })}>{w.bulkSpam}</button>
              <button type="button" className="link-button" onClick={() => setSelected(new Set())}>{w.bulkClear}</button>
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
                <span className="visually-hidden">{format(w.select, { number: r.number })}</span>
              </label>
            )}
            <Link ref={el => { links.current[i] = el; }} onFocus={() => setFocus(i)} className={`ticket-row${r.priority === "urgent" && r.status !== "closed" ? " is-urgent" : ""}${selected.has(r.number) ? " is-selected" : ""}`} href={`/chest/tickets/${r.number}`}>
              <span className="who"><Avatar name={r.customer} /></span>
              <span className="subject">
                <PriorityChip priority={r.priority} label={t.priority[r.priority]} />
                <span>{r.subject}</span>
                {r.tags.slice(0, 3).map(g => <span key={g.id} className="chip tag"><Tag />{g.name}</span>)}
                {r.tags.length > 3 && <span className="chip tag">{format(w.moreTags, { count: r.tags.length - 3 })}</span>}
              </span>
              <span className="meta">
                <span className="num">#{r.number}</span>
                {r.waiting ? <Waiting {...r.waiting} /> : <time dateTime={r.updatedAt}>{r.when}</time>}
                {r.assignee ? <span className="chip">{r.assignee}</span> : <span className="chip unassigned">{w.unassignedTag}</span>}
              </span>
              <span className="preview">
                {r.lastKind === "note" ? <><Note /> {w.noteLast} · </> : r.lastKind === "reply" ? <><Reply /> {w.replyLast} · </> : null}
                <strong>{r.customer}</strong> — {r.last}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
