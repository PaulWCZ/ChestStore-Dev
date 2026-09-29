"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { addExample, removeExample } from "../app/chest/actions.ts";
import type { ErrorCode } from "../lib/app-error.ts";
import { format } from "../lib/i18n/format.ts";

type Words = { label: string; added: string; errors: Record<ErrorCode, string> };

// "Start with an example" (an admin, no office yet): an example office in
// one click — two floors, three rooms, twelve desks — with Undo, which
// deletes it whole while nobody booked in it.
export function useExampleOffice(t: Words): { start: () => void; busy: boolean } {
  const toast = useToast();
  const router = useRouter();
  const [busy, run] = useTransition();
  const start = () => run(async () => {
    const r = await addExample();
    if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
    toast({
      id: "example",
      text: t.added,
      undo: async () => {
        const back = await removeExample(r.value.id);
        router.refresh();
        return back.ok ? true : format(t.errors[back.error], back.values);
      },
    });
    router.refresh();
  });
  return { start, busy };
}

export function ExampleButton({ t, className = "button quiet" }: { t: Words; className?: string }) {
  const { start, busy } = useExampleOffice(t);
  return <button type="button" className={className} disabled={busy} onClick={start}>{t.label}</button>;
}
