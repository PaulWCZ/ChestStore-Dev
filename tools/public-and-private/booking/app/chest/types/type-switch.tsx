"use client";

import { Switch, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { setTypeActive } from "../actions.ts";

// On or off, in one click (the kit's Switch; it shows the new state at
// once): an off type keeps its page but takes no booking.
export function TypeSwitch({ id, active, label, name, errors }: { id: string; active: boolean; label: { on: string; off: string }; name: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [shown, show] = useOptimistic(active);
  const toast = useToast();
  const router = useRouter();
  return (
    <Switch className="type-switch" checked={shown} disabled={pending} label={<><span className="visually-hidden">{name}: </span>{shown ? label.on : label.off}</>} onChange={on => {
      start(async () => {
        show(on);
        const r = await setTypeActive(id, on);
        if (!r.ok) toast({ text: format(errors[r.error], r.values ?? {}), tone: "error" });
        router.refresh();
      });
    }} />
  );
}
