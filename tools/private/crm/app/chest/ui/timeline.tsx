"use client";

import { useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Clock, Flag, Lost, Mail, Meeting, Note, Pencil, Person, Phone, Pipeline, Plus, Trash, Trophy } from "../../../components/icons.tsx";
import type { Activity } from "../../../lib/activities.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import { editActivity, removeActivity, restoreActivity } from "../actions.ts";
import type { People } from "./shared.ts";

const icons = { call: Phone, meeting: Meeting, email: Mail, note: Note, step: Check, created: Plus, stage: Pipeline, won: Trophy, lost: Lost, reopened: Flag, owner: Person, unassigned: Person, merged: Plus };
const logged = new Set(["call", "meeting", "email", "note"]);

// When each thing happened, written by the server ("3 days ago"): the
// browser's own calendar data might write it otherwise.
export type TimelineItem = Activity & { when: string; whenFull: string };
type Props = {
  items: TimelineItem[];
  people: People;
  stageNames: Record<string, string>;
  me: string;
  canRemoveAny: boolean;
  canLog: boolean;
  context: "deal" | "contact" | "company";
  locale: Locale;
  t: Catalogue;
};

// What happened, newest first. What people logged reads as they wrote it;
// what the tool recorded reads as a sentence. The author edits their own
// words; the author or a manager removes them, with Undo.
export function Timeline({ items, people, stageNames, me, canRemoveAny, canLog, context, t }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const shown = items.filter(a => !hidden.has(a.id));
  const who = (id: string) => (id === me ? t.people.you : people[id]?.name ?? t.people.unknown);
  const stage = (id: unknown) => (typeof id === "string" || typeof id === "number" ? stageNames[String(id)] ?? t.timeline.removedStage : t.timeline.removedStage);

  function sentence(a: Activity): string | null {
    const name = who(a.author);
    switch (a.kind) {
      case "created": return format(a.data["imported"] ? t.timeline.createdImported : t.timeline.created, { name });
      case "stage": return format(t.timeline.stage, { name, from: stage(a.data["from"]), to: stage(a.data["to"]) });
      case "won": return format(t.timeline.won, { name });
      case "lost": return format(t.timeline.lost, { name });
      case "reopened": return format(t.timeline.reopened, { name });
      case "owner": return a.data["to"] ? format(t.timeline.owner, { name, to: who(String(a.data["to"])) }) : format(t.timeline.ownerNobody, { name });
      case "unassigned": return t.timeline.unassigned;
      case "step": return format(t.timeline.step, { name, text: a.body });
      case "merged": return format(t.timeline.merged, { name, other: String(a.data["name"] ?? "") });
      default: return null;
    }
  }

  function remove(a: TimelineItem) {
    setHidden(h => new Set(h).add(a.id));
    start(async () => {
      const r = await removeActivity(a.id);
      const show = () => setHidden(h => { const n = new Set(h); n.delete(a.id); return n; });
      if (!r.ok) {
        show();
        return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      }
      toast({
        id: `entry-${a.id}`,
        text: t.timeline.removed,
        undo: async () => {
          const back = await restoreActivity(a.id);
          if (!back.ok) return format(t.errors[back.error], back.values);
          show();
          return true;
        },
      });
    });
  }

  if (shown.length === 0) return <p className="muted timeline-empty">{t.timeline.empty}</p>;
  return (
    <ol className="timeline">
      {shown.map(a => {
        const text = sentence(a);
        const Icon = icons[a.kind] ?? Clock;
        const mine = a.author === me;
        const changeable = logged.has(a.kind) && canLog && (mine || canRemoveAny);
        const elsewhere = context !== "deal" && a.deal ? { href: `/chest/deals/${a.deal.id}`, label: a.deal.title }
          : context === "company" && a.contact ? { href: `/chest/contacts/${a.contact.id}`, label: a.contact.name }
          : null;
        return (
          <li key={a.id} className={`event k-${a.kind}`}>
            <span className="event-icon" aria-hidden="true"><Icon /></span>
            <div className="event-main">
              <p className="event-head">
                {text === null ? <><strong>{t.timeline.kinds[a.kind]}</strong><span className="sep" aria-hidden="true">·</span><span>{a.data["by"] ? format(t.timeline.importedBy, { name: String(a.data["by"]) }) : who(a.author)}</span></> : <span>{text}</span>}
                {elsewhere && <span className="event-on">{format(t.timeline.on, { what: "" })}<Link prefetch={false} href={elsewhere.href}>{elsewhere.label}</Link></span>}
                <time dateTime={a.at} title={a.whenFull}>{a.when}</time>
              </p>
              {editing === a.id ? (
                <form className="event-edit" onSubmit={e => {
                  e.preventDefault();
                  const body = String(new FormData(e.currentTarget).get("body") ?? "");
                  setEditing(null);
                  start(async () => { const r = await editActivity(a.id, body); if (!r.ok) toast({ text: format(t.errors[r.error], r.values), tone: "error" }); });
                }}>
                  <label className="visually-hidden" htmlFor={`edit-${a.id}`}>{t.timeline.editEntry}</label>
                  <textarea id={`edit-${a.id}`} name="body" className="field" rows={3} defaultValue={a.body} maxLength={5000} autoFocus />
                  <div className="row">
                    <button type="submit" className="button small">{t.common.save}</button>
                    <button type="button" className="button small quiet" onClick={() => setEditing(null)}>{t.common.cancel}</button>
                  </div>
                </form>
              ) : (
                a.body && a.kind !== "step" && <p className="event-body">{a.body}</p>
              )}
            </div>
            {changeable && editing !== a.id && (
              <span className="event-actions">
                {mine && <button type="button" className="icon-button small" title={t.timeline.editEntry} onClick={() => setEditing(a.id)}><Pencil /><span className="visually-hidden">{t.timeline.editEntry}</span></button>}
                <button type="button" className="icon-button small" title={t.timeline.remove} onClick={() => remove(a)}><Trash /><span className="visually-hidden">{t.timeline.remove}</span></button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
