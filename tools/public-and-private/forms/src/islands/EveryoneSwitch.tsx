import { Switch } from "@argentic/chest-ui/components";
import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";

// "Everyone can make forms": a manager's switch, at once (src/lib/creators.ts).
export function EveryoneSwitch({ on, words }: { on: boolean; words: { everyone: string; everyoneHint: string; everyoneOn: string; everyoneOff: string } }) {
  const [pending, setPending] = useState<boolean | null>(null);
  return (
    <div className="everyone-switch">
      <Switch label={words.everyone} hint={words.everyoneHint} checked={pending ?? on} name="everyone" onChange={next => {
        setPending(next);
        void call("everyoneCreates", { on: next }).then(r => {
          setPending(null);
          if (r.ok) toast(r.value.on ? words.everyoneOn : words.everyoneOff);
        });
      }} />
    </div>
  );
}
