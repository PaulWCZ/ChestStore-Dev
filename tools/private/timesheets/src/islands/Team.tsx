import { call, toast } from "@argentic/chest-app/client";
import { Avatar, DataTable, StatusBadge, type Column, type Tone } from "@argentic/chest-ui/components";
import type { TableWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { Bell, Check } from "../components/icons.tsx";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

// The Team page's islands (src/pages/Team.tsx, src/pages/PersonWeek.tsx):
// the weeks waiting for a manager, approving them all, reminding the people
// whose week is short, everyone's hours of the last four weeks.
type Words = { team: Catalogue["team"]; errors: Catalogue["errors"] };

// A week waiting for a manager: approve it, or send it back with a word.
// `look`: the week is short or not over (said on the line; approving it
// asks first). `led`: the week holds time on a project the reader leads;
// `mine`: the reader's own week, which another manager approves (said
// instead of the buttons).
export type WaitingItem = { memberId: string; week: string; name: string; photo: string | null; label: string; hours: string; look: string | null; led: boolean; mine: string | null };

export function WaitingList({ rows, t }: { rows: WaitingItem[]; t: Words }) {
  return (
    <ul className="waiting">
      {rows.map(w => (
        <li key={w.memberId + w.week} id={`waiting-${w.memberId}-${w.week}`} className="waiting-row">
          <Avatar name={w.name} photo={w.photo} />
          <span className="waiting-who">
            <a href={`/chest/team/${w.memberId}?week=${w.week}`}><strong>{w.name}</strong></a>
            <span className="small muted">{w.label} · {w.hours}</span>
            {w.led && <StatusBadge tone="info" size="s" label={t.team.yourProject} />}
            {w.look && <StatusBadge tone="wait" size="s" label={w.look} />}
          </span>
          {w.mine ? <span className="small muted mine-note">{w.mine}</span> : <DecisionButtons memberId={w.memberId} week={w.week} name={w.name} look={w.look} t={t} />}
        </li>
      ))}
    </ul>
  );
}

// One person's week (src/pages/PersonWeek.tsx): the same two answers.
export function Decision(props: { memberId: string; week: string; name: string; t: Words; approved?: boolean; look?: string | null }) {
  return <DecisionButtons {...props} />;
}

// Approve, or send back with a word: the two answers to a week.
// A short or unfinished week (`look`) is approved in two steps: the first
// click says what it holds and asks; "Approve anyway" approves it.
function DecisionButtons({ memberId, week, name, t, approved = false, look = null }: { memberId: string; week: string; name: string; t: Words; approved?: boolean; look?: string | null }) {
  const [pending, setPending] = useState(false);
  const [back, setBack] = useState(false);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  async function approve(anyway = false) {
    if (look && !anyway) return setAsking(true);
    setPending(true);
    const r = await call("approveWeek", { memberId, week, anyway });
    setPending(false);
    setAsking(false);
    if (r.ok) toast({ id: `week-${memberId}-${week}`, text: format(t.team.approved, { name }) });
  }
  async function sendBack() {
    setPending(true);
    const r = await call("returnWeek", { memberId, week, reason });
    setPending(false);
    if (!r.ok) return;
    toast({ id: `week-${memberId}-${week}`, text: format(t.team.returned, { name }) });
    setBack(false);
  }
  if (back) {
    return (
      <form className="inline-form back-form" onSubmit={e => { e.preventDefault(); void sendBack(); }}>
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
        <button type="button" className="button" disabled={pending} autoFocus onClick={() => void approve(true)}><Check />{t.team.anyway}</button>
        <button type="button" className="button link" onClick={() => setAsking(false)}>{t.team.cancel}</button>
      </span>
    );
  }
  return (
    <span className="decision">
      {!approved && <button type="button" className="button" disabled={pending} onClick={() => void approve()}><Check />{t.team.approve}</button>}
      <button type="button" className="button quiet" disabled={pending} onClick={() => setBack(true)}>{approved ? t.team.reopen : t.team.sendBackOpen}</button>
    </span>
  );
}

// Every complete week at once: one action per week, in order; then one
// toast says how many went through.
export function ApproveAll({ weeks, label, locale, t }: { weeks: { memberId: string; week: string }[]; label: string; locale: string; t: Words }) {
  const [pending, setPending] = useState(false);
  async function approveAll() {
    setPending(true);
    let done = 0;
    for (const [i, w] of weeks.entries()) {
      // The page is read again once, after the last.
      const r = await call("approveWeek", { memberId: w.memberId, week: w.week, anyway: false }, { refresh: i === weeks.length - 1, quiet: true });
      if (r.ok) done++;
    }
    setPending(false);
    toast({ id: "approve-all", text: plural(t.team.approvedMany, done, locale) });
  }
  return <button type="button" className="button quiet" disabled={pending} onClick={() => void approveAll()}><Check />{label}</button>;
}

export function RemindButton({ memberIds, week, label, locale, t }: { memberIds: string[]; week: string; label: string; locale: string; t: Words }) {
  const [pending, setPending] = useState(false);
  async function remind() {
    setPending(true);
    const r = await call("remind", { memberIds, week });
    setPending(false);
    // The bell items left: no Undo.
    if (r.ok) toast({ id: "remind", text: plural(t.team.reminded, r.value, locale), sent: true });
  }
  return <button type="button" className="button" disabled={pending} onClick={() => void remind()}><Bell />{label}</button>;
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

export function TeamTable({ rows, heads, t, labels }: { rows: TeamRow[]; heads: string[]; t: Words; labels: TableWords }) {
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
          <a href={`/chest/team/${r.memberId}?week=${c.week}`} className={`week-cell${c.state ? " " + c.state : ""}`} aria-label={c.label}>
            <span className="num">{c.text}</span>
            {c.state && <StatusBadge tone={tones[c.state]} size="s" label={t.team.states[c.state]} />}
          </a>
        );
      },
    })),
    { key: "usual", label: t.team.usual, align: "end", hideOnPhone: true, value: r => r.capacity, render: r => <span className="num muted">{r.capacityText}</span> },
  ];
  return <DataTable caption={t.team.weeks} columns={columns} rows={rows} rowKey={r => r.memberId} labels={labels} />;
}
