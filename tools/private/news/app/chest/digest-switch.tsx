"use client";

import { useOptimistic, useTransition } from "react";
import { Mail } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { digestByEmail } from "./actions.ts";

// The weekly digest by email too, or only in the bell: one switch, at the
// foot of the front page (and named in every digest email).
export function DigestSwitch({ on, t, errors }: { on: boolean; t: Catalogue["front"]; errors: Catalogue["errors"] }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [shown, set] = useOptimistic(on);
  return (
    <p className="digest-switch">
      <Mail />
      <span>{shown ? t.digestOn : t.digestOff}</span>
      <button type="button" className="link-button" onClick={() => start(async () => {
        set(!shown);
        const r = await digestByEmail(!shown);
        toast(r.ok ? (shown ? t.digestStopped : t.digestStarted) : format(errors[r.error], r.values ?? {}));
      })}>{shown ? t.digestTurnOff : t.digestTurnOn}</button>
    </p>
  );
}
