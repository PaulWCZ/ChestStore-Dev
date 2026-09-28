"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Plus } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { startFirstCycle } from "../actions.ts";

// The first cycle in one click: this calendar quarter, current.
export function StartCycle({ label, errors }: { label: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button type="button" className="button" disabled={pending} onClick={() => start(async () => {
        const r = await startFirstCycle();
        if (!r.ok) return setError(format(errors[r.error], r.values ?? {}));
        router.push("/chest/company");
      })}><Plus />{label}</button>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
