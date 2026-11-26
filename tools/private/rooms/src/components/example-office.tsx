import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";

export type ExampleWords = { label: string; added: string };

// "Start with an example" (an admin, no office yet): an example office in
// one click — two floors, three rooms, twelve desks — with Undo, which
// deletes it whole while nobody booked in it.
export function useExampleOffice(t: ExampleWords): { start: () => void; busy: boolean } {
  const [busy, setBusy] = useState(false);
  const start = () => {
    setBusy(true);
    void call("addExample", {}).then(r => {
      setBusy(false);
      if (!r.ok) return;
      toast({
        id: "example",
        text: t.added,
        undo: async () => {
          const back = await call("removeExample", { officeId: r.value.id }, { quiet: true });
          return back.ok ? true : back.message;
        },
      });
    });
  };
  return { start, busy };
}

export function ExampleButton({ t, className = "button quiet" }: { t: ExampleWords; className?: string }) {
  const { start, busy } = useExampleOffice(t);
  return <button type="button" className={className} disabled={busy} onClick={start}>{t.label}</button>;
}
