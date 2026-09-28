"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addExample } from "../actions.ts";

// One click: an example company objective with three key results, to see
// what a good one looks like (and change it, or remove it).
export function AddExample({ cycleId, label, errors }: { cycleId: string; label: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => {
        const r = await addExample(cycleId);
        if (!r.ok) return setError(format(errors[r.error], r.values ?? {}));
        router.push(`/chest/objectives/${r.value.id}`);
      })}>{label}</button>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
