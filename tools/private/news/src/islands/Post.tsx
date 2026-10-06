import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Check, Clock, Pen, Pin, Trash } from "../components/icons.tsx";
import { call, navigate, refresh, toast } from "../core/client.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "./words.ts";

// The parts of a post a person acts on. Each changes the screen at once
// (optimistic), then the server confirms; a refusal puts it back and says
// why, in a toast (call() says it; the kit's toasts: an error is said at
// once, an Undo tells the truth, what already left says "sent").

export function PostTools({ id, pinned, t }: { id: string; pinned: boolean; t: Catalogue["post"] }) {
  const [, start] = useTransition();
  const [isPinned, setPinned] = useOptimistic(pinned);
  return (
    <div className="tools" role="group" aria-label={t.actions}>
      <a className="button quiet small" href={`/chest/posts/${id}/edit`}><Pen />{t.edit}</a>
      <button type="button" className="button quiet small" aria-pressed={isPinned} onClick={() => start(async () => {
        setPinned(!isPinned);
        const r = await call("pinPost", { postId: id, pinned: !isPinned });
        if (r.ok) toast({ id: `pin-${id}`, text: isPinned ? t.unpinnedToast : t.pinnedToast });
      })}><Pin />{isPinned ? t.unpin : t.pin}</button>
      <button type="button" className="button quiet small danger" onClick={() => start(async () => {
        const r = await call("deletePost", { postId: id }, { refresh: false });
        if (!r.ok) return;
        // Undo brings it back, and the article with it; the toast says
        // whether it worked (it lives outside the page: it follows the move
        // to the front page).
        toast({
          id: `delete-${id}`,
          text: t.deleted,
          undo: async () => {
            const back = await call("restorePost", { postId: id }, { refresh: false, quiet: true });
            if (!back.ok) return back.message;
            await navigate(`/chest/posts/${id}`);
            return true;
          },
        });
        await navigate("/chest");
      })}><Trash />{t.delete}</button>
    </div>
  );
}

export function ConfirmBox({ id, own, confirmed, again, when, t }: { id: string; own: boolean; confirmed: boolean; again: boolean; when: string | null; t: Catalogue["important"] }) {
  const [, start] = useTransition();
  const [done, setDone] = useOptimistic(confirmed);
  if (own) return <p className="confirm-box own">{t.own}</p>;
  return (
    <div className={"confirm-box" + (done ? " done" : "")} role="region" aria-label={t.confirm}>
      {done ? (
        <p><Check />{when ?? t.thanks}</p>
      ) : (
        <>
          <p>{again ? t.again : t.ask}</p>
          <button type="button" className="button" onClick={() => start(async () => {
            setDone(true);
            const r = await call("confirmRead", { postId: id });
            if (r.ok) toast({ id: `confirm-${id}`, text: t.thanks });
          })}><Check />{t.confirm}</button>
        </>
      )}
    </div>
  );
}

// A new Important post in its "Undo" seconds, seen by its author: take it
// back (nothing was sent), or let it go — at the end it goes out.
export function SendingNotice({ id, until, t }: { id: string; until: string; t: Catalogue["post"] }) {
  const [busy, start] = useTransition();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const end = new Date(until).getTime();
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    const done = setTimeout(() => void call("release", {}), Math.max(0, end - Date.now()) + 300);
    return () => { clearInterval(timer); clearTimeout(done); };
  }, [until]);
  return (
    <p className="notice sending" role="status">
      <Clock />
      <span>{left === null ? t.goingOut : format(t.goingOutIn, { seconds: left })}</span>
      <button type="button" className="button small" disabled={busy} onClick={() => start(async () => {
        const r = await call("recallPost", { postId: id }, { refresh: false });
        if (!r.ok) return;
        toast({ id: `send-${id}`, text: t.recalled });
        await navigate("/chest/new");
      })}>{t.undoSend}</button>
    </p>
  );
}

export function Rsvp({ id, answer, open, full, t }: { id: string; answer: "yes" | "no" | "wait" | null; open: boolean; full: boolean; t: Catalogue["event"] }) {
  const [, start] = useTransition();
  const [mine, setMine] = useOptimistic(answer);
  if (!open) return <p className="quiet-text">{t.closed}</p>;
  const choose = (value: "yes" | "no") => start(async () => {
    const taking = mine === value || (value === "yes" && mine === "wait");
    const next = taking ? null : value;
    setMine(next === "yes" && full ? "wait" : next);
    const r = await call("answerEvent", { postId: id, answer: next });
    if (r.ok && r.value.answer === "wait") toast({ id: `rsvp-${id}`, text: t.youWait });
  });
  const coming = mine === "yes" || mine === "wait";
  return (
    <div className="rsvp" role="group" aria-labelledby={`rsvp-${id}`}>
      <p id={`rsvp-${id}`} className="rsvp-question">{mine === "yes" ? t.youCome : mine === "wait" ? t.youWait : mine === "no" ? t.youDont : full ? t.full : t.question}</p>
      <div className="row">
        <button type="button" className={"button" + (coming ? " chosen" : " quiet")} aria-pressed={coming} onClick={() => choose("yes")}><Check />{mine === "wait" ? t.waitingButton : full && mine !== "yes" ? t.join : t.coming}</button>
        <button type="button" className={"button" + (mine === "no" ? " chosen-no" : " quiet")} aria-pressed={mine === "no"} onClick={() => choose("no")}>{t.notComing}</button>
      </div>
    </div>
  );
}

export type ReactionView = { emoji: string; symbol: string; count: number; mine: boolean; names: string[] };

export function Reactions({ id, list, t, locale }: { id: string; list: ReactionView[]; t: Catalogue["reactions"]; locale: string }) {
  const [, start] = useTransition();
  const [shown, toggle] = useOptimistic(list, (current: ReactionView[], emoji: string) => current.map(r => (r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r)));
  return (
    <div className="reactions" role="group" aria-label={t.label}>
      {shown.map(r => {
        const label = t[r.emoji as "thumbs"];
        const others = r.count - r.names.length;
        const names = r.names.join(", ") + (others > 0 ? " " + plural(t.more, others, locale) : "");
        return (
          <button key={r.emoji} type="button" className={"reaction" + (r.mine ? " mine" : "")} aria-pressed={r.mine} title={r.count > 0 ? format(t.by, { emoji: label, names }) : label} onClick={() => start(async () => {
            toggle(r.emoji);
            await call("react", { postId: id, emoji: r.emoji, on: !r.mine });
          })}>
            <span aria-hidden="true">{r.symbol}</span>
            <span className="visually-hidden">{label}</span>
            {r.count > 0 && <span className="count">{r.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function RemindButton({ id, t, locale }: { id: string; t: Catalogue["readers"]; locale: string }) {
  const [busy, start] = useTransition();
  return (
    <button type="button" className="button small" disabled={busy} onClick={() => start(async () => {
      const r = await call("remind", { postId: id });
      // The reminders left (bell and email): the toast says so, with no Undo.
      if (r.ok) toast({ id: `remind-${id}`, text: plural(t.reminded, r.value.count, locale), sent: true });
    })}>{t.remind}</button>
  );
}

// Answered from an email's link (/chest/posts/<id>/answer, src/app.tsx):
// the answer is said once, with Undo back to the one before; a link that
// was not the person's, or an event already over, says so. Then the
// address is clean again, so a reload says nothing.
type Answered = "yes" | "no" | "wait" | "none" | "invalid" | "closed";
export function AnsweredNotice({ id, answered, was, t }: { id: string; answered: Answered; was: "yes" | "no" | "none" | null; t: Catalogue["event"] }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("answered");
    url.searchParams.delete("was");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (answered === "invalid" || answered === "closed") return void toast({ id: `rsvp-${id}`, text: answered === "closed" ? t.closed : t.linkNotYours, tone: "error" });
    const text = answered === "yes" ? t.youCome : answered === "wait" ? t.youWait : answered === "no" ? t.youDont : t.noAnswer;
    const undo = was === null || answered === "none" ? undefined : async () => {
      const r = await call("answerEvent", { postId: id, answer: was === "none" ? null : was }, { quiet: true });
      return r.ok ? true : r.message;
    };
    toast({ id: `rsvp-${id}`, text, ...(undo ? { undo } : {}) });
  }, [id, answered, was, t]);
  return null;
}
