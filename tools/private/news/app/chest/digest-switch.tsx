"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useOptimistic, useTransition } from "react";
import { Mail } from "../../components/icons.tsx";
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
        toast(r.ok ? { id: "digest", text: shown ? t.digestStopped : t.digestStarted } : { id: "digest", text: format(errors[r.error], r.values ?? {}), tone: "error" });
      })}>{shown ? t.digestTurnOff : t.digestTurnOn}</button>
    </p>
  );
}
