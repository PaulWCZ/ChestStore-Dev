"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { setTypeActive } from "../actions.ts";

// On or off, in one click: an off type keeps its page but takes no booking.
export function TypeSwitch({ id, active, label, name, errors }: { id: string; active: boolean; label: string; name: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <label className="switch" style={{ minHeight: 32, fontSize: "var(--text-s)" }}>
      <input type="checkbox" role="switch" checked={active} disabled={pending} aria-label={`${name}: ${label}`} onChange={e => {
        const on = e.target.checked;
        start(async () => {
          const r = await setTypeActive(id, on);
          if (!r.ok) toast(format(errors[r.error], r.values ?? {}));
          router.refresh();
        });
      }} />
      {label}
    </label>
  );
}
