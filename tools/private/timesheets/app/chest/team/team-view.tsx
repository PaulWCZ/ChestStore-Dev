"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Bell, Check } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { approveWeek, remind, returnWeek } from "../actions.ts";

type Words = { team: Catalogue["team"]; errors: Catalogue["errors"] };

// A week waiting for a manager: approve it, or send it back with a word.
export function WaitingRow({ memberId, week, name, photo, label, hours, t }: { memberId: string; week: string; name: string; photo: string | null; label: string; hours: string; t: Words }) {
  return (
    <li className="waiting-row">
      <Avatar name={name} photo={photo} />
      <span className="waiting-who">
        <Link href={`/chest/team/${memberId}?week=${week}`}><strong>{name}</strong></Link>
        <span className="small muted">{label} · <span className="num">{hours}</span></span>
      </span>
      <Decision memberId={memberId} week={week} name={name} t={t} />
    </li>
  );
}

// Approve, or send back with a word: the two answers to a week.
export function Decision({ memberId, week, name, t, approved = false }: { memberId: string; week: string; name: string; t: Words; approved?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [back, setBack] = useState(false);
  const [reason, setReason] = useState("");
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[code], values));
  function approve() {
    start(async () => {
      const r = await approveWeek(memberId, week);
      if (!r.ok) return fail(r.error, r.values);
      toast(format(t.team.approved, { name }));
      router.refresh();
    });
  }
  function sendBack() {
    start(async () => {
      const r = await returnWeek(memberId, week, reason);
      if (!r.ok) return fail(r.error, r.values);
      toast(format(t.team.returned, { name }));
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
  return (
    <span className="decision">
      {!approved && <button type="button" className="button" disabled={pending} onClick={approve}><Check />{t.team.approve}</button>}
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
      toast(plural(t.team.approvedMany, done, locale));
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
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      toast(plural(t.team.reminded, r.value, locale));
    })}><Bell />{label}</button>
  );
}
