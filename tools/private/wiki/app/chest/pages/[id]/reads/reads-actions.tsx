"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "../../../../../components/toast.tsx";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { format } from "../../../../../lib/i18n/format.ts";
import { askRead, stopAskRead } from "../../../actions.ts";

// Asking again (the page changed since: everyone confirms the new version)
// and no longer asking.
export function ReadsActions({ pageId, stale, t }: { pageId: string; stale: boolean; t: { again: string; againDone: string; stop: string; stopped: string; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function again() {
    start(async () => {
      const result = await askRead(pageId);
      if (!result.ok) return toast(format(t.errors[result.error], result.values));
      router.refresh();
      toast(t.againDone);
    });
  }
  function stop() {
    start(async () => {
      const result = await stopAskRead(pageId);
      if (!result.ok) return toast(format(t.errors[result.error], result.values));
      router.push(`/chest/pages/${pageId}`);
      toast(t.stopped);
    });
  }
  return (
    <>
      {stale && <button type="button" className="button" disabled={pending} onClick={again}>{t.again}</button>}
      <button type="button" className="button quiet" disabled={pending} onClick={stop}>{t.stop}</button>
    </>
  );
}
