"use client";

import { Confirm, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CalendarPlus, Download, Pencil, Repeat, Send, Star, Trash } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { en } from "../../../../lib/i18n/en.ts";
import { closeNow, nudgePoll, pickFinal, remove, reopen, repeatPoll, restore, sendPoll } from "../../actions.ts";

type Words = {
  manage: Record<keyof typeof en.manage, string>;
  final: Record<keyof typeof en.final, string>;
  errors: Record<keyof typeof en.errors, string>;
};

type Failure = { ok: false; error: keyof typeof en.errors; values?: Record<string, string | number> };

// The organiser's panel: remind those who have not answered, close now
// (undo: reopen — an anonymous poll is closed for good, so it asks first,
// in the kit's Confirm), reopen, edit, delete (undo: restore), download the
// answers, stop or restart a pulse survey's rounds; for a closed date poll,
// pick the date and tell everyone. What left for people's bells (a poll
// sent, a reminder, the date told) says "sent" and offers no Undo.
export function Manage({ pollId, status, anonymous, canEdit, canExport, canReopen, canNudge, series, t }: {
  pollId: string;
  status: "draft" | "open" | "closed";
  anonymous: boolean;
  canEdit: boolean;
  canExport: boolean;
  canReopen: boolean;
  canNudge: boolean;
  series: { stopped: boolean } | null;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fail = (r: Failure) => toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });

  // A step, then its toast: with Undo when `undo` reverses it (the kit's
  // toast says whether the Undo worked), "sent" when it told people.
  async function run(id: string, step: () => Promise<{ ok: true } | Failure>, done: string, { undo, sent = false, after }: { undo?: () => Promise<{ ok: true } | Failure>; sent?: boolean; after?: () => void } = {}) {
    setBusy(true);
    const result = await step();
    setBusy(false);
    if (!result.ok) return fail(result);
    toast({
      id: `${id}-${pollId}`,
      text: done,
      ...(sent ? { sent: true } : {}),
      ...(undo ? { undo: async () => {
        const back = await undo();
        router.refresh();
        return back.ok ? true : format(t.errors[back.error], back.values ?? {});
      } } : {}),
    });
    if (after) after();
    else router.refresh();
  }

  const closeForGood = () => {
    setConfirming(false);
    void run("close", () => closeNow(pollId), t.manage.closed);
  };

  return (
    <div className="row">
      {status === "draft" && <button type="button" className="button primary" disabled={busy} onClick={() => run("send", () => sendPoll(pollId), t.manage.sent, { sent: true })}><Send />{t.manage.send}</button>}
      {status === "open" && canNudge && <button type="button" className="button" disabled={busy} onClick={() => run("nudge", () => nudgePoll(pollId), t.manage.nudged, { sent: true })}><Bell />{t.manage.nudge}</button>}
      {status === "open" && (anonymous
        ? <button type="button" className="button" disabled={busy} onClick={() => setConfirming(true)}>{t.manage.close}</button>
        : <button type="button" className="button" disabled={busy} onClick={() => run("close", () => closeNow(pollId), t.manage.closed, { undo: () => reopen(pollId) })}>{t.manage.close}</button>)}
      {status === "closed" && canReopen && <button type="button" className="button small" disabled={busy} onClick={() => run("close", () => reopen(pollId), t.manage.reopened, { undo: () => closeNow(pollId) })}>{t.manage.reopen}</button>}
      {canEdit && <a className="button small" href={`/chest/polls/${pollId}/edit`}><Pencil />{t.manage.edit}</a>}
      {series && (series.stopped
        ? <button type="button" className="button small" disabled={busy} onClick={() => run("repeat", () => repeatPoll(pollId, true), t.manage.resumed, { undo: () => repeatPoll(pollId, false) })}><Repeat />{t.manage.resume}</button>
        : <button type="button" className="button small" disabled={busy} onClick={() => run("repeat", () => repeatPoll(pollId, false), t.manage.stopped, { undo: () => repeatPoll(pollId, true) })}><Repeat />{t.manage.stop}</button>)}
      {canExport && <a className="button small" href={`/chest/polls/${pollId}/export`} download><Download />{t.manage.export}</a>}
      <button type="button" className="button link danger" disabled={busy} onClick={() => run("delete", () => remove(pollId), t.manage.deleted, { undo: async () => { const r = await restore(pollId); if (r.ok) router.push(`/chest/polls/${pollId}`); return r; }, after: () => router.push("/chest") })}><Trash />{t.manage.delete}</button>
      {/* An anonymous poll closed cannot be reopened (lib/polls.ts): it asks first. */}
      <Confirm open={confirming} title={t.manage.closeForGoodTitle} body={t.manage.closeForGoodHint} confirmLabel={t.manage.closeForGood} cancelLabel={t.manage.keepOpen} tone="accent" busy={busy} onConfirm={closeForGood} onCancel={() => setConfirming(false)} />
    </div>
  );
}

export type FinalOption = { id: string; text: string; yes: number | null; maybe: number | null; best: boolean };

export function FinalPicker({ pollId, options, chosen, t, tally }: { pollId: string; options: FinalOption[]; chosen: string | null; t: Words; tally: string }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<string | null>(chosen ?? options.find(o => o.best)?.id ?? options[0]?.id ?? null);
  const [open, setOpen] = useState(chosen === null);
  const [busy, setBusy] = useState(false);

  async function tell() {
    if (!value) return;
    setBusy(true);
    const result = await pickFinal(pollId, value);
    setBusy(false);
    if (!result.ok) return toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
    // The bell items left at once: "sent", never an Undo.
    toast({ id: `told-${pollId}`, text: t.final.told, sent: true });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="row">
        <a className="button small" href={`/chest/polls/${pollId}/calendar`} download><CalendarPlus />{t.final.calendar}</a>
        <button type="button" className="button link" onClick={() => setOpen(true)}>{t.final.change}</button>
      </div>
    );
  }
  return (
    <fieldset className="pick">
      <legend className="label">{t.final.title}</legend>
      <p className="hint">{t.final.hint}</p>
      {options.map(o => (
        <label key={o.id} className="pick-option">
          <input type="radio" name="final" checked={value === o.id} onChange={() => setValue(o.id)} />
          <span className="grow">{o.text}{o.yes !== null && <><br /><span className="hint">{format(tally, { yes: o.yes, maybe: o.maybe ?? 0 })}</span></>}</span>
          {o.best && <span className="best-tag"><Star /></span>}
        </label>
      ))}
      <div className="row">
        <button type="button" className="button primary" disabled={busy || !value} onClick={tell}>{busy ? t.final.telling : t.final.tell}</button>
        {chosen && <button type="button" className="button link" onClick={() => setOpen(false)}>{t.final.keep}</button>}
      </div>
    </fieldset>
  );
}
