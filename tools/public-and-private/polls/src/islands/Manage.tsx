import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Bell, CalendarPlus, Download, Pencil, Repeat, Send, Star, Trash } from "../components/icons.tsx";
import { call, navigate, refresh, toast } from "../core/client.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { fill as format } from "./words.ts";

type Words = { manage: Catalogue["manage"]; final: Catalogue["final"] };
// An outcome of call(): a refusal is already said in a toast.
type Done = { ok: true } | { ok: false; message: string };

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
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const act = (name: "sendPoll" | "nudgePoll" | "closeNow" | "reopen" | "remove" | "restore", options: { refresh?: boolean; quiet?: boolean } = {}) => () => call(name, { pollId }, { refresh: false, ...options });
  const repeat = (on: boolean) => () => call("repeatPoll", { pollId, on }, { refresh: false });

  // A step, then its toast: with Undo when `undo` reverses it (the kit's
  // toast says whether the Undo worked), "sent" when it told people.
  async function run(id: string, step: () => Promise<Done>, done: string, { undo, sent = false, after }: { undo?: () => Promise<Done>; sent?: boolean; after?: () => Promise<void> } = {}) {
    setBusy(true);
    const result = await step();
    setBusy(false);
    if (!result.ok) return;
    toast({
      id: `${id}-${pollId}`,
      text: done,
      ...(sent ? { sent: true } : {}),
      ...(undo ? { undo: async () => {
        const back = await undo();
        if (back.ok) await refresh();
        return back.ok ? true : back.message;
      } } : {}),
    });
    if (after) await after();
    else await refresh();
  }

  const closeForGood = () => {
    setConfirming(false);
    void run("close", act("closeNow"), t.manage.closed);
  };

  return (
    <div className="row">
      {status === "draft" && <button type="button" className="button primary" disabled={busy} onClick={() => run("send", act("sendPoll"), t.manage.sent, { sent: true })}><Send />{t.manage.send}</button>}
      {status === "open" && canNudge && <button type="button" className="button" disabled={busy} onClick={() => run("nudge", act("nudgePoll"), t.manage.nudged, { sent: true })}><Bell />{t.manage.nudge}</button>}
      {status === "open" && (anonymous
        ? <button type="button" className="button" disabled={busy} onClick={() => setConfirming(true)}>{t.manage.close}</button>
        : <button type="button" className="button" disabled={busy} onClick={() => run("close", act("closeNow"), t.manage.closed, { undo: act("reopen", { quiet: true }) })}>{t.manage.close}</button>)}
      {status === "closed" && canReopen && <button type="button" className="button small" disabled={busy} onClick={() => run("close", act("reopen"), t.manage.reopened, { undo: act("closeNow", { quiet: true }) })}>{t.manage.reopen}</button>}
      {canEdit && <a className="button small" href={`/chest/polls/${pollId}/edit`}><Pencil />{t.manage.edit}</a>}
      {series && (series.stopped
        ? <button type="button" className="button small" disabled={busy} onClick={() => run("repeat", repeat(true), t.manage.resumed, { undo: repeat(false) })}><Repeat />{t.manage.resume}</button>
        : <button type="button" className="button small" disabled={busy} onClick={() => run("repeat", repeat(false), t.manage.stopped, { undo: repeat(true) })}><Repeat />{t.manage.stop}</button>)}
      {canExport && <a className="button small" href={`/chest/polls/${pollId}/export`} download><Download />{t.manage.export}</a>}
      <button type="button" className="button link danger" disabled={busy} onClick={() => run("delete", act("remove"), t.manage.deleted, { undo: async () => { const r = await act("restore", { quiet: true })(); if (r.ok) await navigate(`/chest/polls/${pollId}`); return r; }, after: () => navigate("/chest") })}><Trash />{t.manage.delete}</button>
      {/* An anonymous poll closed cannot be reopened (lib/polls.ts): it asks first. */}
      <Confirm open={confirming} title={t.manage.closeForGoodTitle} body={t.manage.closeForGoodHint} confirmLabel={t.manage.closeForGood} cancelLabel={t.manage.keepOpen} tone="accent" busy={busy} onConfirm={closeForGood} onCancel={() => setConfirming(false)} />
    </div>
  );
}

export type FinalOption = { id: string; text: string; yes: number | null; maybe: number | null; best: boolean };

export function FinalPicker({ pollId, options, chosen, t, tally }: { pollId: string; options: FinalOption[]; chosen: string | null; t: Words; tally: string }) {
  const [value, setValue] = useState<string | null>(chosen ?? options.find(o => o.best)?.id ?? options[0]?.id ?? null);
  const [open, setOpen] = useState(chosen === null);
  const [busy, setBusy] = useState(false);

  async function tell() {
    if (!value) return;
    setBusy(true);
    const result = await call("pickFinal", { pollId, optionId: value }, { refresh: false });
    setBusy(false);
    if (!result.ok) return;
    // The bell items left at once: "sent", never an Undo.
    toast({ id: `told-${pollId}`, text: t.final.told, sent: true });
    setOpen(false);
    await refresh();
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
