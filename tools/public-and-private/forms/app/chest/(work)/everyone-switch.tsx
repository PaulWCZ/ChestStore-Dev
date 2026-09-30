"use client";

import { Switch, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { everyoneCreates } from "../actions.ts";

// "Everyone can make forms": a manager's switch, at once (lib/creators.ts).
export function EveryoneSwitch({ on, words, errors }: { on: boolean; words: Pick<Catalogue["home"], "everyone" | "everyoneHint" | "everyoneOn" | "everyoneOff">; errors: Catalogue["errors"] }) {
  const [shown, show] = useOptimistic(on);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="everyone-switch">
      <Switch label={words.everyone} hint={words.everyoneHint} checked={shown} name="everyone" onChange={next => start(async () => {
        show(next);
        const r = await everyoneCreates(next);
        if (!r.ok) return void toast({ text: format(errors[r.error] ?? errors.unknown, r.values ?? {}), tone: "error" });
        toast(r.value.on ? words.everyoneOn : words.everyoneOff);
        router.refresh();
      })} />
    </div>
  );
}
