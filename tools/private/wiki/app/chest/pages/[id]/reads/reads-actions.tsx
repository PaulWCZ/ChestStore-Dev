"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../../lib/i18n/format.ts";
import { askRead, remindRead, stopAskRead } from "../../../actions.ts";

// Reminding those who have not confirmed (bell and email: once sent, it
// is sent — no Undo), asking again (the page changed since: everyone
// confirms the new version) and no longer asking.
export function ReadsActions({ pageId, stale, waiting, locale, t }: { pageId: string; stale: boolean; waiting: number; locale: string; t: { again: string; againDone: string; stop: string; stopped: string; remind: string; reminded: Catalogue["reads"]["reminded"]; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function again() {
    start(async () => {
      const result = await askRead(pageId);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.refresh();
      toast({ id: `ask-read-${pageId}`, text: t.againDone });
    });
  }
  function remind() {
    start(async () => {
      const result = await remindRead(pageId);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.refresh();
      toast({ id: `remind-read-${pageId}`, text: plural(t.reminded, result.value.reminded, locale), sent: true });
    });
  }
  function stop() {
    start(async () => {
      const result = await stopAskRead(pageId);
      if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
      router.push(`/chest/pages/${pageId}`);
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
