"use client";

import { Avatar, DataTable, StatusBadge, useToast, type Column, type Tone } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, Check } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { approveWeek, remind, returnWeek } from "../actions.ts";

type Words = { team: Catalogue["team"]; errors: Catalogue["errors"] };

// A week waiting for a manager: approve it, or send it back with a word.
// `look`: the week is short or not over (said on the line; approving it
// asks first).
// `led`: the week holds time on a project the reader leads; `mine`: the
// reader's own week, which another manager approves (said instead of the
// buttons).
export function WaitingRow({ memberId, week, name, photo, label, hours, look, led = false, mine = null, t }: { memberId: string; week: string; name: string; photo: string | null; label: string; hours: string; look: string | null; led?: boolean; mine?: string | null; t: Words }) {
  return (
    <li className="waiting-row">
      <Avatar name={name} photo={photo} />
      <span className="waiting-who">
        <Link href={`/chest/team/${memberId}?week=${week}`}><strong>{name}</strong></Link>
        <span className="small muted">{label} · {hours}</span>
        {led && <StatusBadge tone="info" size="s" label={t.team.yourProject} />}
        {look && <StatusBadge tone="wait" size="s" label={look} />}
      </span>
      {mine ? <span className="small muted mine-note">{mine}</span> : <Decision memberId={memberId} week={week} name={name} look={look} t={t} />}
    </li>
  );
}

// Approve, or send back with a word: the two answers to a week.
// A short or unfinished week (`look`) is approved in two steps: the first
// click says what it holds and asks; "Approve anyway" approves it.
export function Decision({ memberId, week, name, t, approved = false, look = null }: { memberId: string; week: string; name: string; t: Words; approved?: boolean; look?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [back, setBack] = useState(false);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => void toast({ text: format(t.errors[code], values), tone: "error" });
  function approve(anyway = false) {
    if (look && !anyway) return setAsking(true);
    start(async () => {
      const r = await approveWeek(memberId, week, anyway);
      setAsking(false);
      if (!r.ok) return fail(r.error, r.values);
      toast({ id: `week-${memberId}-${week}`, text: format(t.team.approved, { name }) });
      router.refresh();
    });
  }
  function sendBack() {
    start(async () => {
      const r = await returnWeek(memberId, week, reason);
      if (!r.ok) return fail(r.error, r.values);
      toast({ id: `week-${memberId}-${week}`, text: format(t.team.returned, { name }) });
      setBack(false);
      router.refresh();
    });
  }
  if (back) {
    return (
      <form className="inline-form back-form" onSubmit={e => { e.preventDefault(); sendBack(); }}>
        <label className="visually-hidden" htmlFor={`why-${memberId}-${week}`}>{format(t.team.why, { name })}</label>
        <input id={`why-${memberId}-${week}`} className="field" value={reason} maxLength={300} placeholder={t.team.whyPlaceholder} autoFocus onChange={e => setReason(e.target.value)} />
        <button type="submit" className="button" disabled={pending || !reason.trim()}>{t.team.sendBack}</button>
        <button type="button" className="button link" onClick={() => setBack(false)}>{t.team.cancel}</button>
      </form>
    );
  }
  if (asking && look) {
    return (
      <span className="decision asking" role="group" aria-labelledby={`ask-${memberId}-${week}`}>
        <span id={`ask-${memberId}-${week}`} className="small">{format(t.team.anywayAsk, { fullness: look })}</span>
        <button type="button" className="button" disabled={pending} autoFocus onClick={() => approve(true)}><Check />{t.team.anyway}</button>
        <button type="button" className="button link" onClick={() => setAsking(false)}>{t.team.cancel}</button>
      </span>
    );
  }
  return (
    <span className="decision">
      {!approved && <button type="button" className="button" disabled={pending} onClick={() => approve()}><Check />{t.team.approve}</button>}
      <button type="button" className="button quiet" disabled={pending} onClick={() => setBack(true)}>{approved ? t.team.reopen : t.team.sendBackOpen}</button>
    </span>
  );
}

export function ApproveAll({ weeks, label, locale, t }: { weeks: { memberId: string; week: string }[]; label: string; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => {
      let done = 0;
      for (const w of weeks) {
        const r = await approveWeek(w.memberId, w.week);
        if (r.ok) done++;
      }
      toast({ id: "approve-all", text: plural(t.team.approvedMany, done, locale) });
      router.refresh();
    })}><Check />{label}</button>
  );
}

export function RemindButton({ memberIds, week, label, locale, t }: { memberIds: string[]; week: string; label: string; locale: string; t: Words }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="button" disabled={pending} onClick={() => start(async () => {
      const r = await remind(memberIds, week);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      // The bell items left: no Undo.
      toast({ id: "remind", text: plural(t.team.reminded, r.value, locale), sent: true });
    })}><Bell />{label}</button>
  );
}

// Everyone's hours in the last four weeks (the kit's DataTable: a header
// that stays, sorting by a click, the person's name read before each cell).
// Each week links to the person's week; its state has a word and a shape.
export type WeekState = "approved" | "sent" | "returned" | "short" | "";
export type TeamRow = {
  memberId: string; name: string; photo: string | null; capacity: number; capacityText: string;
  weeks: { week: string; minutes: number; text: string; state: WeekState; label: string }[];
};
const tones: Record<Exclude<WeekState, "">, Tone> = { approved: "ok", sent: "info", returned: "wait", short: "danger" };

export function TeamTable({ rows, heads, t, labels }: { rows: TeamRow[]; heads: string[]; t: Words; labels: Catalogue["table"] }) {
  const columns: Column<TeamRow>[] = [
    { key: "person", label: t.team.person, rowHeader: true, value: r => r.name, render: r => <span className="who-cell"><Avatar name={r.name} photo={r.photo} size="s" /><span>{r.name}</span></span> },
    ...heads.map((label, i): Column<TeamRow> => ({
      key: "w" + i,
      label,
      align: "end",
      hideOnPhone: i < 2,
      value: r => r.weeks[i]?.minutes ?? 0,
      render: r => {
        const c = r.weeks[i];
        if (!c) return null;
        return (
          <Link href={`/chest/team/${r.memberId}?week=${c.week}`} className={`week-cell${c.state ? " " + c.state : ""}`} aria-label={c.label}>
            <span className="num">{c.text}</span>
            {c.state && <StatusBadge tone={tones[c.state]} size="s" label={t.team.states[c.state]} />}
          </Link>
        );
      },
    })),
    { key: "usual", label: t.team.usual, align: "end", hideOnPhone: true, value: r => r.capacity, render: r => <span className="num muted">{r.capacityText}</span> },
  ];
  return <DataTable caption={t.team.weeks} columns={columns} rows={rows} rowKey={r => r.memberId} labels={labels} />;
}
