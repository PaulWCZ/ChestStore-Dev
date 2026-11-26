import { call, navigate, plural, toast } from "@argentic/chest-app/client";
import { useTransition } from "react";
import { Restore } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Restoring makes the old version the newest one; the version it replaced
// stays in the history, so restoring it again undoes this.
export function RestoreButton({ pageId, number, label }: { pageId: string; number: number; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="button" disabled={pending} onClick={() => start(async () => {
      const result = await call("restoreVersion", { pageId, number }, { refresh: false });
      if (result.ok) await navigate(`/chest/pages/${pageId}?restored=${number}`);
    })}><Restore />{label}</button>
  );
}

// Reminding those who have not confirmed (a notification: once sent, it
// is sent — no Undo), asking again (the page changed since: everyone
// confirms the new version) and no longer asking.
export function ReadsActions({ pageId, stale, waiting, locale, t }: { pageId: string; stale: boolean; waiting: number; locale: string; t: { again: string; againDone: string; stop: string; stopped: string; remind: string; reminded: Catalogue["reads"]["reminded"] } }) {
  const [pending, start] = useTransition();
  function again() {
    start(async () => {
      const result = await call("askRead", { pageId });
      if (result.ok) toast({ id: `ask-read-${pageId}`, text: t.againDone });
    });
  }
  function remind() {
    start(async () => {
      const result = await call("remindRead", { pageId });
      if (result.ok) toast({ id: `remind-read-${pageId}`, text: plural(locale, t.reminded, result.value.reminded), sent: true });
    });
  }
  function stop() {
    start(async () => {
      const result = await call("stopAskRead", { pageId }, { refresh: false });
      if (!result.ok) return;
      await navigate(`/chest/pages/${pageId}`);
      toast({ id: `ask-read-${pageId}`, text: t.stopped });
    });
  }
  return (
    <>
      {!stale && waiting > 0 && <button type="button" className="button" disabled={pending} onClick={remind}>{t.remind}</button>}
      {stale && <button type="button" className="button" disabled={pending} onClick={again}>{t.again}</button>}
      <button type="button" className="button quiet" disabled={pending} onClick={stop}>{t.stop}</button>
    </>
  );
}
